// اختبارات الواجهات والصلاحيات — تُشغَّل والخادم يعمل
const BASE = Deno.env.get("BASE") ?? "http://localhost:8000";
const PW = Deno.env.get("SEED_PASSWORD") ?? "Green#2026";
let ok = true;
const chk = (c: boolean, m: string) => {
  if (!c) ok = false;
  console.log((c ? "✓ " : "✗ ") + m);
};

async function login(id: string, pw = PW) {
  const r = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, password: pw }),
  });
  const sc = r.headers.get("set-cookie") ?? "";
  const sid = sc.match(/sid=([^;]+)/)?.[1] ?? "";
  return { status: r.status, sid, body: await r.json() };
}
const call = (sid: string, path: string, method = "GET", body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `sid=${sid}` },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── بناء مدخلات المؤشرات التفصيلية ──
interface KpiDef {
  n: number;
  mode: string;
  denom: string | null;
  tgtEff: number;
  secEff: number | null;
}
const kpiCache: Record<string, KpiDef[]> = {};
async function kpiDefs(sid: string, instId: string): Promise<KpiDef[]> {
  if (!kpiCache[instId]) {
    kpiCache[instId] = (await (await call(sid, "/api/kpis?inst=" + instId)).json()).kpis;
  }
  return kpiCache[instId];
}
/** مدخلات تُنتج نسبة تنفيذ v لكل مؤشر. الوصفي يقرَّب إلى 0 أو 50 أو 100. */
function rawFor(defs: KpiDef[], v: number, skipLast = 0): Record<string, unknown> {
  const kpi: Record<string, unknown> = {};
  const upto = defs.length - skipLast;
  defs.slice(0, upto).forEach((k) => {
    if (k.mode === "وصفي") {
      kpi[k.n] = { j: v >= 75 ? 100 : v >= 25 ? 50 : 0 };
    } else if (k.mode === "نسبة" && k.denom) {
      kpi[k.n] = { i: 1000, j: 10 * k.tgtEff * v / 100 };
    } else {
      kpi[k.n] = { j: k.tgtEff * v / 100 };
    }
    if (k.secEff !== null) {
      (kpi[k.n] as Record<string, unknown>).m = k.secEff * v / 100;
    }
  });
  return kpi;
}

console.log("■ المصادقة");
chk((await login("Z1-1", "wrong-password")).status === 401, "كلمة مرور خاطئة تُرفض");
chk((await login("NOPE")).status === 401, "حساب غير موجود يُرفض");
const anon = await fetch(`${BASE}/api/institutions`);
chk(anon.status === 401, "طلب بلا جلسة يُرفض (401)");

const ev1 = await login("Z1-1");
const ev2 = await login("Z1-2");
const lead1 = await login("Z1-L");
const lead2 = await login("Z2-L");
const tech = await login("TECH");
chk([ev1, ev2, lead1, lead2, tech].every((x) => x.status === 200 && x.sid), "دخول خمسة حسابات");

console.log("\n■ النطاق والصلاحيات");
const iv1 = await (await call(ev1.sid, "/api/institutions")).json();
const iv2 = await (await call(ev2.sid, "/api/institutions")).json();
const il1 = await (await call(lead1.sid, "/api/institutions")).json();
const it = await (await call(tech.sid, "/api/institutions")).json();
chk(
  iv1.rows.every((r: { evaluator: string }) => r.evaluator === "Z1-1"),
  `مقيّم يرى مؤسساته فقط (${iv1.rows.length})`,
);
const overlap = iv1.rows.filter((a: { id: string }) => iv2.rows.some((b: { id: string }) => b.id === a.id));
chk(overlap.length === 0, "لا تقاطع بين مؤسسات مقيّمين مختلفين");
chk(
  il1.rows.every((r: { team: string }) => r.team === "منطقة 1"),
  `رئيس الفريق يرى فريقه فقط (${il1.rows.length})`,
);
chk(it.rows.length === 378, `الحساب الفني يرى الجميع (${it.rows.length})`);
chk((await call(ev1.sid, "/api/accounts")).status === 403, "المقيّم لا يصل لإدارة الحسابات (403)");
chk((await call(lead1.sid, "/api/audit")).status === 403, "رئيس الفريق لا يصل لسجل التدقيق (403)");
chk((await call(tech.sid, "/api/accounts")).status === 200, "الفني يصل لإدارة الحسابات");

console.log("\n■ حفظ التقييم");
const mine = iv1.rows[0];
const defs = await kpiDefs(ev1.sid, mine.id);
chk(defs.length === 31, `تعريف المؤشرات التفصيلية وصل (${defs.length})`);
chk(
  (await call(ev1.sid, "/api/kpis?inst=" + iv2.rows[0].id)).status === 403,
  "المقيّم لا يقرأ مؤشرات مؤسسة ليست له (403)",
);
const save = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 100),
  notes: "اختبار",
})).json();
chk(
  save.ok && save.status === "مكتمل" && save.filled === 31 && save.pct === 100,
  `حفظ تقييم كامل → ${save.pct}% · ${save.status} · ${save.filled}/${save.total}`,
);
const partial = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 80, 3),
})).json();
chk(
  partial.status === "قيد التقييم" && partial.filled === 28 && partial.pct === null,
  `مؤشرات ناقصة → ${partial.status} · ${partial.filled}/${partial.total}`,
);
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, kpi: rawFor(defs, 90) });
const foreign = await call(ev2.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 10),
});
chk(foreign.status === 403, "مقيّم آخر لا يستطيع تعديل مؤسسة ليست له (403)");
const leadWrite = await call(lead1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 5),
});
chk(leadWrite.status === 403, "رئيس الفريق لا يُدخل تقييماً (403)");
const clamp = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 300),
})).json();
chk(clamp.pct === 100, `تجاوز المستهدف لا يتجاوز 100% → ${clamp.pct}%`);
const bad = await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: { 1: { i: 10, j: -5 } },
});
chk(bad.status === 400, "قيمة سالبة تُرفض (400)");
const badState = await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: { 12: { j: 33 } },
});
chk(badState.status === 400, "حالة تنفيذ خارج (0 · 50 · 100) تُرفض (400)");
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, kpi: rawFor(defs, 95) });

console.log("\n■ تصنيف المؤسسات مقابل الملفات المركزية");
const all = (await (await call(tech.sid, "/api/institutions")).json()).rows;
chk(all.length === 378, `العدد الكلي ${all.length}`);
const sizeRule = (n: number, kg: boolean): string =>
  kg
    ? (n <= 25
      ? "الروضة الصغيرة"
      : n <= 100
      ? "الروضة المتوسطة"
      : n <= 200
      ? "الروضة الكبيرة"
      : "الروضة الكبيرة جداً")
    : (n <= 399
      ? "المدرسة الصغيرة"
      : n <= 699
      ? "المدرسة المتوسطة"
      : n <= 999
      ? "المدرسة الكبيرة"
      : "المدرسة الكبيرة جداً");
const sized = all.filter((x: { size: string | null }) => x.size !== null);
const sizeBad = sized.filter((x: { size: string; students: number; team: string }) =>
  x.size.replace(/\s+/g, " ") !== sizeRule(x.students, x.team === "رياض الأطفال")
);
chk(sized.length === 243, `مؤسسات لها تصنيف حجم في المصدر: ${sized.length}`);
chk(
  sizeBad.length === 1 && sizeBad[0].name === "مدرسة ابنيزر",
  `مخالفة واحدة معلومة لقاعدة التصنيف: ${sizeBad.map((x: { name: string }) => x.name).join(" · ")}`,
);
const kg = all.filter((x: { team: string }) => x.team === "رياض الأطفال");
chk(
  kg.length === 152 && kg.every((x: { stage: string }) => x.stage === "رياض أطفال"),
  "رياض الأطفال مرحلة قائمة بذاتها لكل مؤسساتها",
);
const noStage = all.filter((x: { stage: string | null }) => x.stage === null);
chk(noStage.length === 0, `لا مؤسسة بلا مرحلة (${noStage.length})`);
const noSize = all.filter((x: { size: string | null }) => x.size === null);
chk(
  noSize.length === 135 && noSize.every((x: { team: string }) => x.team === "رياض الأطفال"),
  `بلا تصنيف حجم في المصدر: ${noSize.length} كلها رياض أطفال`,
);
const withPrev = all.filter((x: { prev: unknown }) => x.prev !== null);
chk(withPrev.length === 243, `مؤسسات لها نتيجة مرجعية سابقة: ${withPrev.length}`);
const stages = new Set(
  all.filter((x: { team: string }) => x.team !== "رياض الأطفال").map((x: { stage: string }) => x.stage),
);
chk(stages.has("ابتدائي - إعدادي") && stages.has("ثانوي (صناعي)"), "المراحل المركّبة محفوظة حرفياً");
chk(!stages.has("متعدد المراحل"), "لا تسميات مجمَّعة من صنعنا");

console.log("\n■ المؤشر 20 حسب المرحلة");
async function t20(id: string, sid: string) {
  const d = await (await call(sid, "/api/kpis?inst=" + id)).json();
  const k = d.kpis.find((x: { n: number }) => x.n === 20);
  return { tgt: k.tgtEff, assumed: k.assumed };
}
const prim = await t20("Z1-001", tech.sid); // ابتدائي
const upper = await t20("Z1-006", tech.sid); // إعدادي
const mixed = await t20("Z1-007", tech.sid); // ابتدائي - إعدادي
const relig = await t20("Z4-024", tech.sid); // معهد ديني بلا مرحلة
chk(prim.tgt === 4 && !prim.assumed, `ابتدائي → ${prim.tgt} · محسوم`);
chk(upper.tgt === 8 && !upper.assumed, `إعدادي → ${upper.tgt} · محسوم`);
chk(mixed.tgt === 8 && !mixed.assumed, `ابتدائي - إعدادي → المرحلة العليا إعدادي → ${mixed.tgt} · محسوم`);
chk(relig.tgt === 8 && !relig.assumed, `المعهد الديني الجعفري → ثانوي بقرار الفريق → ${relig.tgt} · محسوم`);
const prim2 = await t20("Z4-022", tech.sid); // ابتدائي (معهد ديني)
chk(prim2.tgt === 4 && !prim2.assumed, `ابتدائي (معهد ديني) → ${prim2.tgt} · محسوم`);
const upper2 = await t20("Z4-023", tech.sid); // إعدادي - ثانوي (معهد ديني)
chk(upper2.tgt === 8 && !upper2.assumed, `إعدادي - ثانوي (معهد ديني) → ${upper2.tgt} · محسوم`);
const noLevel = all
  .filter((r: { team: string; stage: string | null; stageTop: string | null }) =>
    r.team !== "رياض الأطفال" && !/ابتدائي|إعدادي|ثانوي/.test(r.stage ?? "") && !r.stageTop
  ).map((r: { id: string }) => r.id);
chk(noLevel.length === 0, `لا مؤسسة نظامية بلا مرحلة عليا: ${noLevel.join(" · ") || "صفر"}`);
const jaafari = all.find((r: { id: string }) => r.id === "Z4-024");
chk(
  jaafari.stage === "معهد ديني" && jaafari.stageTop === "ثانوي",
  "نص المرحلة يبقى كما في المصدر وقرار الفريق منفصل عنه",
);

console.log("\n■ ضبط المستهدفات");
chk(
  (await call(lead1.sid, "/api/targets", "POST", { stage: "school", targets: {} })).status === 403,
  "رئيس الفريق لا يضبط المستهدفات (403)",
);
const tgSave = await (await call(tech.sid, "/api/targets", "POST", {
  stage: "school",
  targets: { 27: { t: 4 } },
})).json();
chk(tgSave.ok && tgSave.count === 1, `الحساب الفني يضبط مستهدفاً واحداً (${tgSave.count})`);
delete kpiCache[mine.id];
const defs2 = await kpiDefs(ev1.sid, mine.id);
chk(defs2.find((k) => k.n === 27)!.tgtEff === 4, "المستهدف المضبوط يظهر في تعريف المؤشرات");
const tgBad = await call(tech.sid, "/api/targets", "POST", {
  stage: "school",
  targets: { 27: { t: 0 } },
});
chk(tgBad.status === 400, "مستهدف صفري يُرفض (400)");
await call(tech.sid, "/api/targets", "POST", { stage: "school", targets: {} });
delete kpiCache[mine.id];

console.log("\n■ البيانات المركزية");
chk(
  (await call(ev1.sid, "/api/central", "POST", { rows: [] })).status === 403,
  "المقيّم لا يدخل البيانات المركزية (403)",
);
const cdSave = await (await call(tech.sid, "/api/central", "POST", {
  rows: [{ id: mine.id, students: 850, teachers: 40, subjects: 10 }],
})).json();
chk(cdSave.ok && cdSave.count === 1, "الحساب الفني يحفظ بيانات مؤسسة");
chk(
  (await call(tech.sid, "/api/central", "POST", { rows: [{ id: mine.id, students: -3 }] })).status === 400,
  "قيمة سالبة تُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/central", "POST", { rows: [{ id: mine.id, students: 12.5 }] })).status === 400,
  "قيمة كسرية تُرفض (400)",
);
await call(tech.sid, "/api/central", "POST", {
  rows: [{ id: mine.id, students: 850, teachers: 40, subjects: 10 }],
});
const cdRow = (await (await call(ev1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === mine.id);
chk(cdRow.students === 850, `عدد الطلبة من البيانات المركزية (${cdRow.students})`);
chk(cdRow.size === "المدرسة الكبيرة", `التصنيف مشتق من العدد (${cdRow.size})`);
chk(cdRow.teamNo === 1 && cdRow.teamCode === "Z1", `رقم الفريق ورمزه (${cdRow.teamCode}-${cdRow.teamNo})`);
const kd = await (await call(ev1.sid, "/api/kpis?inst=" + mine.id)).json();
const kc = kd.kpis.filter((k: { centralField: string | null }) => k.centralField);
chk(kc.length === 7, `مؤشرات تسحب مقامها مركزياً (${kc.length})`);
chk(
  kd.kpis.find((k: { n: number }) => k.n === 8).centralValue === 40,
  "المؤشر 8 يسحب عدد المعلمين",
);
chk(
  kd.kpis.find((k: { n: number }) => k.n === 7).centralValue === 10,
  "المؤشر 7 يسحب عدد المواد",
);
// المقام المركزي يحكم حتى لو أرسل المقيّم رقماً مخالفاً
const forced = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: { 8: { i: 1, j: 16 } },
})).json();
chk(
  forced.kpiPct["8"] === 50,
  `المقام المركزي 40 يحكم لا المُرسَل 1 → ${forced.kpiPct["8"]}% (16÷40=40% من هدف 80)`,
);

console.log("\n■ طلبات النقل");
const badMove = await call(ev1.sid, "/api/transfers", "POST", {
  instId: mine.id,
  toEval: "Z2-1",
  reason: "خارج الفريق",
});
chk(badMove.status === 400, "النقل خارج الفريق يُرفض (400)");
const mv = await (await call(ev1.sid, "/api/transfers", "POST", {
  instId: mine.id,
  toEval: "Z1-4",
  reason: "بُعد الموقع",
})).json();
chk(mv.ok, "المقيّم يرفع طلب نقل داخل فريقه");
chk(
  (await call(ev1.sid, "/api/transfers", "POST", { instId: mine.id, toEval: "Z1-5" })).status === 400,
  "طلب ثانٍ معلّق لنفس المؤسسة يُرفض (400)",
);
chk(
  (await call(ev1.sid, "/api/transfer-decide", "POST", { id: mv.id, approve: true })).status === 403,
  "المقيّم لا يبتّ في طلبه (403)",
);
chk(
  (await call(lead2.sid, "/api/transfer-decide", "POST", { id: mv.id, approve: true })).status === 403,
  "رئيس فريق آخر لا يبتّ (403)",
);
const dec = await (await call(lead1.sid, "/api/transfer-decide", "POST", {
  id: mv.id,
  approve: true,
})).json();
chk(dec.ok && dec.status === "معتمد", "رئيس الفريق يعتمد النقل");
const afterMv = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === mine.id);
chk(afterMv.evaluator === "Z1-4", `المؤسسة انتقلت للمقيّم ${afterMv.evaluator}`);
chk(
  (await call(lead1.sid, "/api/transfer-decide", "POST", { id: mv.id, approve: false })).status === 400,
  "البتّ مرة ثانية يُرفض (400)",
);
// إعادتها لمقيّمها الأصلي لبقية الاختبارات
await call(tech.sid, "/api/assign", "POST", { instId: mine.id, evaluator: "Z1-1" });
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, kpi: rawFor(defs, 95) });

console.log("\n■ الدورات والأداء التراكمي");
const meNow = await (await call(tech.sid, "/api/me")).json();
chk(meNow.meta.currentYear === "2025-2026", `العام الجاري ${meNow.meta.currentYear}`);
const hist1 = await (await call(ev1.sid, "/api/history?inst=" + mine.id)).json();
chk(hist1.cycles.length === 1 && hist1.cycles[0].year === "2025-2026", "دورة واحدة مكتملة");
chk(
  hist1.cumulative.n === 1 && hist1.cumulative.complete === false,
  "الحسم التراكمي غير مكتمل بدورة واحدة",
);
chk(
  hist1.prev !== null && hist1.prev.basis === "لوغاريتمية",
  `النتيجة المرجعية موجودة وموسومة بمنهجيتها (${hist1.prev?.verdict})`,
);
chk(
  (await call(ev2.sid, "/api/history?inst=" + mine.id)).status === 403,
  "سجل مؤسسة خارج النطاق مرفوض (403)",
);
chk(
  (await call(lead1.sid, "/api/year", "POST", { year: "2026-2027" })).status === 403,
  "رئيس الفريق لا يغيّر العام (403)",
);
chk(
  (await call(tech.sid, "/api/year", "POST", { year: "2026" })).status === 400,
  "صيغة عام خاطئة تُرفض (400)",
);
await call(tech.sid, "/api/year", "POST", { year: "2026-2027" });
const y2 = await (await call(ev1.sid, "/api/institutions")).json();
chk(
  y2.year === "2026-2027" && y2.rows.find((r: { id: string }) => r.id === mine.id).status === "لم يبدأ",
  "العام الجديد يبدأ بصفحة بيضاء ولا يمسّ الدورة السابقة",
);
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, kpi: rawFor(defs, 60) });
const hist2 = await (await call(ev1.sid, "/api/history?inst=" + mine.id)).json();
chk(hist2.cycles.length === 2, `دورتان محفوظتان (${hist2.cycles.length})`);
chk(
  hist2.cumulative.n === 2 && hist2.cumulative.avg !== null && hist2.cumulative.trend !== null,
  `متوسط دورتين ${hist2.cumulative.avg}% · الفرق ${hist2.cumulative.trend}`,
);
await call(tech.sid, "/api/year", "POST", { year: "2025-2026" });
const back = await (await call(ev1.sid, "/api/institutions")).json();
chk(
  back.rows.find((r: { id: string }) => r.id === mine.id).status === "مكتمل",
  "الرجوع للعام السابق يستعيد تقييمه كما هو",
);

console.log("\n■ تعديل نص المؤشر");
const txtSave = await (await call(tech.sid, "/api/targets", "POST", {
  stage: "school",
  targets: { 3: { kpi: "نص مؤشر معدَّل من الحساب الفني", numer: "بسط معدَّل" } },
})).json();
chk(txtSave.ok && txtSave.text === 1, `حُفظ تعديل نصي واحد (${txtSave.text})`);
delete kpiCache[mine.id];
const defs3 = await (await call(ev1.sid, "/api/kpis?inst=" + mine.id)).json();
const k3 = defs3.kpis.find((x: { n: number }) => x.n === 3);
chk(
  k3.kpi === "نص مؤشر معدَّل من الحساب الفني" && k3.numer === "بسط معدَّل" && k3.edited === true,
  "النص المعدَّل يصل للمقيّم موسوماً بأنه معدَّل",
);
chk(
  defs3.kpis.find((x: { n: number }) => x.n === 1).edited === false,
  "المؤشرات غير المعدَّلة تبقى بنص الخطة",
);
const longTxt = await call(tech.sid, "/api/targets", "POST", {
  stage: "school",
  targets: { 3: { kpi: "x".repeat(3100) } },
});
chk(longTxt.status === 400, "نص أطول من 3000 حرف يُرفض (400)");
await call(tech.sid, "/api/targets", "POST", { stage: "school", targets: {} });
delete kpiCache[mine.id];

console.log("\n■ إدارة الحسابات والإسناد");
chk(
  (await call(lead1.sid, "/api/account", "POST", { id: "Z1-1", name: "س" })).status === 403,
  "رئيس الفريق لا يعدّل الحسابات (403)",
);
const accSave = await call(tech.sid, "/api/account", "POST", {
  id: "Z1-3",
  name: "منسقة تجريبية",
  title: "عضو فريق تقييم",
  team: "منطقة 1",
});
chk(accSave.status === 200, "الحساب الفني يعدّل بيانات الحساب");
const accs = (await (await call(tech.sid, "/api/accounts")).json()).accounts;
chk(
  accs.find((a: { id: string }) => a.id === "Z1-3").name === "منسقة تجريبية",
  "الاسم الجديد محفوظ",
);
chk(
  (await call(tech.sid, "/api/account", "POST", { id: "Z1-3", team: "منطقة 9" })).status === 400,
  "فريق غير معروف يُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/assign", "POST", { instId: "Z2-001", evaluator: "Z1-1" })).status === 400,
  "مقيّم من فريق آخر يُرفض (400)",
);
const asOk = await call(tech.sid, "/api/assign", "POST", { instId: "Z1-002", evaluator: "Z1-5" });
chk(asOk.status === 200, "إعادة إسناد مؤسسة داخل فريقها");
const moved = await (await call(tech.sid, "/api/assign", "POST", {
  instId: "Z1-002",
  team: "رياض الأطفال",
  evaluator: "KG-1",
})).json();
chk(moved.ok && moved.evalCleared === true, "النقل بين النظامي والمبكر يحذف التقييم");
const movedRow = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === "Z1-002");
chk(
  movedRow.team === "رياض الأطفال" && movedRow.totalKpi === 25,
  `المؤسسة المنقولة صارت على 25 مؤشراً (${movedRow.totalKpi})`,
);
await call(tech.sid, "/api/assign", "POST", { instId: "Z1-002", team: "منطقة 1", evaluator: "Z1-2" });

console.log("\n■ تهيئة بيانات كافية لأعلى 10");
const seedRows = iv1.rows.slice(0, 12);
let si = 0;
for (const r of seedRows) {
  const v = 96 - si * 3;
  const d = await kpiDefs(ev1.sid, r.id);
  await call(ev1.sid, "/api/evaluation", "POST", { instId: r.id, kpi: rawFor(d, v) });
  si++;
}
chk(si === 12, `تهيئة ${si} تقييماً مكتملاً`);

console.log("\n■ أعلى 10 وقصص النجاح");
const top1 = await (await call(lead1.sid, "/api/top")).json();
chk(top1.teams.length === 1 && top1.teams[0].team === "منطقة 1", "رئيس الفريق يرى فريقه فقط في أعلى 10");
chk(top1.teams[0].rows.length === 10, `القائمة 10 صفوف بالضبط (${top1.teams[0].rows.length})`);
const sorted = top1.teams[0].rows.every((r: { pct: number }, i: number, a: { pct: number }[]) =>
  i === 0 || a[i - 1].pct >= r.pct
);
chk(sorted, "مرتّبة تنازلياً بالنتيجة");
const ids = top1.teams[0].rows.slice(0, 4).map((r: { id: string }) => r.id);
for (const id of ids.slice(0, 3)) {
  const r = await (await call(lead1.sid, "/api/picks", "POST", { instId: id, on: true })).json();
  chk(!!r.ok, `اختيار ${id}`);
}
const fourth = await call(lead1.sid, "/api/picks", "POST", { instId: ids[3], on: true });
chk(fourth.status === 403, "الرابعة تُرفض — الحد الأقصى 3 (403)");
const crossTeam = await call(lead2.sid, "/api/picks", "POST", { instId: ids[0], on: true });
chk(crossTeam.status === 403, "رئيس فريق آخر لا يختار من فريق غيره (403)");
const evalPick = await call(ev1.sid, "/api/picks", "POST", { instId: ids[0], on: true });
chk(evalPick.status === 403, "المقيّم لا يختار قصص النجاح (403)");
const outside = il1.rows.filter((r: { id: string }) =>
  !top1.teams[0].rows.some((t: { id: string }) => t.id === r.id)
);
if (outside.length) {
  const o = await call(lead1.sid, "/api/picks", "POST", { instId: outside[0].id, on: true });
  chk(o.status === 403, "لا يمكن اختيار مؤسسة خارج أعلى 10 (403)");
}
const st = await call(lead1.sid, "/api/story", "POST", {
  instId: ids[0],
  title: "تحويل الساحة إلى مختبر بيئي",
  text: "نص القصة للاختبار.",
});
chk(st.status === 200, "حفظ قصة نجاح لمؤسسة مختارة");
const stBad = await call(lead1.sid, "/api/story", "POST", { instId: ids[3], title: "x", text: "y" });
chk(stBad.status === 403, "لا تُكتب قصة لمؤسسة غير مختارة (403)");
const top2 = await (await call(lead1.sid, "/api/top")).json();
chk(top2.stories.length === 1, "القصة محفوظة ومقروءة");
await call(lead1.sid, "/api/picks", "POST", { instId: ids[0], on: false });
const top3 = await (await call(lead1.sid, "/api/top")).json();
chk(top3.stories.length === 0 && top3.teams[0].picks.length === 2, "إلغاء الاختيار يحذف القصة");

console.log("\n■ كلمة المرور وسجل التدقيق");
const badPw = await call(ev1.sid, "/api/password", "POST", { current: "nope", next: "abcdefgh" });
chk(badPw.status === 401, "تغيير كلمة المرور بكلمة حالية خاطئة يُرفض");
const shortPw = await call(ev1.sid, "/api/password", "POST", { current: PW, next: "123" });
chk(shortPw.status === 400, "كلمة مرور أقصر من 8 محارف تُرفض");
const goodPw = await call(ev1.sid, "/api/password", "POST", { current: PW, next: "NewPass#2026" });
chk(goodPw.status === 200, "تغيير كلمة المرور ينجح");
chk((await login("Z1-1", "NewPass#2026")).status === 200, "الدخول بكلمة المرور الجديدة");
chk((await login("Z1-1", PW)).status === 401, "القديمة لم تعد تعمل");
const aud = await (await call(tech.sid, "/api/audit")).json();
chk(aud.rows.length > 0, `سجل التدقيق يحوي ${aud.rows.length} حدثاً`);
chk(aud.rows.some((r: { action: string }) => r.action === "حفظ تقييم"), "السجل يوثّق حفظ التقييم");
chk(
  aud.rows.some((r: { action: string }) => r.action === "اختيار لقصة نجاح"),
  "السجل يوثّق اختيار قصص النجاح",
);

console.log("\n■ الخروج");
const lo = await call(ev2.sid, "/api/logout", "POST");
chk(lo.status === 200, "الخروج ينجح");
chk((await call(ev2.sid, "/api/institutions")).status === 401, "الجلسة بعد الخروج لم تعد صالحة");

console.log("\n■ الملفات الثابتة");
for (const p of ["/", "/style.css", "/app.js"]) {
  const r = await fetch(`${BASE}${p}`);
  chk(r.ok, `${p} → ${r.status} · ${r.headers.get("content-type")}`);
}
const trav = await fetch(`${BASE}/../deno.json`);
chk(
  trav.status === 200 && (await trav.text()).includes("<!DOCTYPE"),
  "محاولة الخروج من المجلد تعود للواجهة لا للملف",
);

console.log("\n" + (ok ? "النتيجة: كل الفحوص سليمة ✓" : "النتيجة: توجد أخطاء ✗"));
if (!ok) Deno.exit(1);
