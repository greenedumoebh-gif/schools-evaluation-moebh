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

// التهيئة تعمل في الخلفية بعد أول طلب؛ ننتظر اكتمالها قبل بدء الفحوص
for (let i = 0; i < 180; i++) {
  const h = await (await fetch(`${BASE}/health`)).json();
  if (h.setup === "done") break;
  if (h.setup === "failed") throw new Error("فشلت التهيئة: " + h.error);
  await new Promise((r) => setTimeout(r, 1000));
}

console.log("■ المصادقة");
chk((await login("Z1-1", "wrong-password")).status === 401, "كلمة مرور خاطئة تُرفض");
chk((await login("NOPE")).status === 401, "حساب غير موجود يُرفض");
const anon = await fetch(`${BASE}/api/institutions`);
chk(anon.status === 401, "طلب بلا جلسة يُرفض (401)");

let ev1 = await login("Z1-1");
let ev2 = await login("Z1-2");
let lead1 = await login("Z1-L");
let lead2 = await login("Z2-L");
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
const leadWrite = await (await call(lead1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 60),
})).json();
chk(leadWrite.ok, "رئيس الفريق يُدخل التقييم في أي مؤسسة بفريقه");
const leadOut = await call(lead2.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 5),
});
chk(leadOut.status === 403, "رئيس فريق آخر لا يُدخل تقييماً (403)");
const leadRows = (await (await call(lead1.sid, "/api/institutions")).json()).rows;
chk(leadRows.length >= 56, `رئيس الفريق يرى كل مؤسسات فريقه (${leadRows.length})`);
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
chk(all.length >= 378, `العدد الكلي ${all.length}`);
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

console.log("\n■ مزامنة بيانات المؤسسات ورقم الإصدار في الصفحة");
const cdRows = (await (await call(tech.sid, "/api/central")).json()).rows;
chk(cdRows.length === 378, `شاشة البيانات المركزية تغطي الجميع للفني (${cdRows.length})`);
const noStageCd = cdRows.filter((r: { stage: string | null }) => !r.stage);
chk(noStageCd.length === 0, `لا مؤسسة بلا مرحلة في شاشة البيانات (${noStageCd.length})`);
chk(
  cdRows.every((r: { sector: string }) => ["حكومية", "خاصة", "رياض أطفال"].includes(r.sector)),
  "كل صف في شاشة البيانات يحمل قطاعه",
);
const idx = await (await fetch(`${BASE}/`)).text();
const ver = (await (await call(tech.sid, "/api/me")).json()).meta.version;
chk(!idx.includes("{{VERSION}}"), "العنصر البديل للإصدار مستبدَل في الصفحة");
chk(
  idx.includes(`الإصدار ${ver}`),
  `رقم الإصدار مطبوع في شاشة الدخول قبل أي طلب لاحق (${ver})`,
);

console.log("\n■ قطاع المؤسسة");
const bySector: Record<string, number> = {};
for (const r of all) bySector[r.sector] = (bySector[r.sector] ?? 0) + 1;
chk(
  bySector["رياض أطفال"] === 152 && bySector["خاصة"] === 16 && bySector["حكومية"] === 210,
  `توزيع القطاعات: ${Object.entries(bySector).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
);
chk(
  all.filter((r: { team: string }) => r.team === "رياض الأطفال")
    .every((r: { sector: string; stage: string }) => r.sector === "رياض أطفال" && r.stage === "رياض أطفال"),
  "كل مؤسسات حسابات KG رياض أطفال قطاعاً ومرحلةً",
);
chk(
  all.filter((r: { team: string }) => r.team === "التعليم الخاص")
    .every((r: { sector: string }) => r.sector === "خاصة"),
  "كل مؤسسات حسابات PR مدارس خاصة",
);
chk(
  all.filter((r: { teamCode: string }) => ["Z1", "Z2", "Z3", "Z4"].includes(r.teamCode))
    .every((r: { sector: string }) => r.sector === "حكومية"),
  "مؤسسات المناطق الأربع حكومية",
);
chk(
  all.filter((r: { sector: string }) => r.sector === "خاصة")
    .every((r: { stage: string }) => r.stage !== "رياض أطفال"),
  "المدارس الخاصة تحتفظ بمراحلها الفعلية ولا تُخلط برياض الأطفال",
);
const kgOne = await (await call(tech.sid, "/api/kpis?inst=KG-001")).json();
const prOne = await (await call(tech.sid, "/api/kpis?inst=PR-001")).json();
chk(
  kgOne.kpis.length === 25 && kgOne.cap === 4500,
  `رياض الأطفال على 25 مؤشراً وسقف 4,500 (${kgOne.kpis.length})`,
);
chk(
  prOne.kpis.length === 31 && prOne.cap === 5400,
  `المدارس الخاصة على 31 مؤشراً وسقف 5,400 (${prOne.kpis.length})`,
);

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

console.log("\n■ اسم المنصة والإصدار ونتائج العام المؤرشف");
const meta0 = (await (await call(tech.sid, "/api/me")).json()).meta;
chk(
  meta0.appName === "منصة تقييم المؤسسات التعليمية ضمن مبادرة التعليم الأخضر بمملكة البحرين",
  `اسم المنصة: ${meta0.appName}`,
);
chk(meta0.version === "1.10.1", `رقم الإصدار ${meta0.version}`);
const health = await (await fetch(`${BASE}/health`)).json();
chk(health.version === meta0.version, `/health يعلن الإصدار نفسه (${health.version})`);
const archAll = (await (await call(tech.sid, "/api/institutions?year=2025-2026")).json()).rows;
const archDone = archAll.filter((r: { status: string }) => r.status === "مكتمل");
chk(
  archAll.filter((r: { basis?: string }) => r.basis === "لوغاريتمية").length === 243,
  `نتائج 2025-2026 مسجَّلة كتقييمات فعلية في المنصة (${
    archAll.filter((r: { basis?: string }) => r.basis === "لوغاريتمية").length
  } مؤسسة)`,
);
chk(
  archDone.length === 242,
  `المكتمل منها ${archDone.length} · وواحدة حكمها «قيد التقييم» في المصدر`,
);
chk(
  archDone.every((r: { basis: string; pct: number | null }) => r.basis === "لوغاريتمية" && r.pct !== null),
  "كل نتيجة مؤرشفة موسومة بمنهجيتها ولها نسبة",
);
const curAll = (await (await call(tech.sid, "/api/institutions")).json()).rows;
chk(
  curAll.every((r: { basis?: string }) => r.basis === undefined),
  "العام الجاري لم يتلوّث بنتائج العام المؤرشف",
);

console.log("\n■ البيانات المركزية");
chk(
  (await call(ev1.sid, "/api/central", "POST", { rows: [] })).status === 200,
  "المقيّم يصل إلى البيانات المركزية لنطاقه",
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
chk(kc.length === 4, `مؤشرات تسحب مقامها مركزياً (${kc.length})`);
chk(
  kc.every((k: { n: number }) => [6, 7, 8, 26].includes(k.n)),
  "«الطلبة المستهدفون» يبقى بإدخال المقيّم ولا يُسحب مركزياً",
);
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

console.log("\n■ إضافة المؤسسات");
chk(
  (await call(ev1.sid, "/api/institutions", "POST", { rows: [{ name: "س" }] })).status === 403,
  "المقيّم لا يضيف مؤسسات (403)",
);
const one = await (await call(lead1.sid, "/api/institutions", "POST", {
  rows: [{
    name: "مدرسة الاختبار الابتدائية للبنين",
    stage: "ابتدائي",
    gender: "بنين",
    students: 420,
    teachers: 24,
    subjects: 9,
  }],
})).json();
chk(one.ok && one.count === 1 && /^Z1-\d{3}$/.test(one.ids[0]), `إضافة مؤسسة واحدة (${one.ids[0]})`);
const added = (await (await call(lead1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === one.ids[0]);
chk(
  added.stage === "ابتدائي" && added.gender === "بنين" && added.sector === "حكومية",
  "المرحلة والجنس محفوظان والقطاع مشتق من الفريق",
);
chk(
  added.students === 420 && added.size === "المدرسة المتوسطة",
  `الأعداد محفوظة والتصنيف مشتق (${added.size})`,
);
chk(added.central.teachers === 24 && added.central.subjects === 9, "المعلمون والمواد في بيانات العام");
chk(
  (await (await call(lead1.sid, "/api/kpis?inst=" + one.ids[0])).json()).kpis
    .find((k: { n: number }) => k.n === 8).centralValue === 24,
  "المؤسسة الجديدة تسحب مقامها المركزي فوراً",
);
// الخانات الفارغة تبقى فارغة
const blank = await (await call(lead1.sid, "/api/institutions", "POST", {
  rows: [{ name: "مدرسة بلا بيانات", stage: "", gender: "", students: "", teachers: "", subjects: "" }],
})).json();
const blankRow = (await (await call(lead1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === blank.ids[0]);
chk(
  blankRow.stage === null && blankRow.gender === null && blankRow.students === null &&
    blankRow.size === null && blankRow.central.teachers === null,
  "الخانات الفارغة في الملف تبقى فارغة في المنصة",
);
// دفعة
const bulkAdd = await (await call(lead1.sid, "/api/institutions", "POST", {
  rows: [
    { name: "دفعة أ", stage: "إعدادي", gender: "بنات", students: 800 },
    { name: "دفعة ب", stage: "ثانوي", gender: "مشترك" },
  ],
})).json();
chk(bulkAdd.count === 2, `إضافة دفعة (${bulkAdd.count})`);
const bRows = (await (await call(lead1.sid, "/api/institutions")).json()).rows;
chk(
  bRows.find((r: { name: string }) => r.name === "دفعة ب").gender === "مختلط",
  "«مشترك» تُخزَّن «مختلط» موحّدةً مع بيانات المصدر",
);
chk(
  bRows.find((r: { name: string }) => r.name === "دفعة أ").size === "المدرسة الكبيرة",
  "تصنيف الحجم مشتق لكل صف في الدفعة",
);
// رفض ما يجب رفضه، وبلا كتابة جزئية
const nBefore = bRows.length;
chk(
  (await call(lead1.sid, "/api/institutions", "POST", { rows: [{ name: "دفعة أ" }] })).status === 400,
  "اسم مكرر داخل الفريق يُرفض (400)",
);
chk(
  (await call(lead1.sid, "/api/institutions", "POST", {
    rows: [{ name: "س1", stage: "جامعي" }],
  })).status === 400,
  "مرحلة غير معروفة تُرفض (400)",
);
chk(
  (await call(lead1.sid, "/api/institutions", "POST", {
    rows: [{ name: "س2", gender: "أولاد" }],
  })).status === 400,
  "قيمة جنس غير معروفة تُرفض (400)",
);
chk(
  (await call(lead1.sid, "/api/institutions", "POST", {
    rows: [{ name: "س3", students: -5 }],
  })).status === 400,
  "عدد سالب يُرفض (400)",
);
chk(
  (await call(lead1.sid, "/api/institutions", "POST", {
    rows: [{ name: "س4", stage: "رياض أطفال" }],
  })).status === 400,
  "«رياض أطفال» لا تُضاف إلى منطقة تعليمية (400)",
);
chk(
  (await call(lead1.sid, "/api/institutions", "POST", {
    rows: [{ name: "صالح" }, { name: "دفعة أ" }],
  })).status === 400,
  "دفعة فيها صف خاطئ تُرفض كاملة (400)",
);
chk(
  (await (await call(lead1.sid, "/api/institutions")).json()).rows.length === nBefore,
  "لا كتابة جزئية من الدفعة المرفوضة",
);
chk(
  (await call(lead1.sid, "/api/institutions", "POST", {
    team: "منطقة 2",
    rows: [{ name: "خارج الفريق" }],
  })).status === 403,
  "رئيس الفريق لا يضيف إلى فريق آخر (403)",
);
const kgAdd = await (await call(tech.sid, "/api/institutions", "POST", {
  team: "رياض الأطفال",
  rows: [{ name: "روضة الاختبار", stage: "", gender: "مشترك", students: 60 }],
})).json();
const kgRow = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === kgAdd.ids[0]);
chk(
  kgRow.stage === "رياض أطفال" && kgRow.sector === "رياض أطفال" &&
    kgRow.size === "الروضة المتوسطة",
  `الروضة الجديدة مرحلتها وقطاعها وتصنيفها صحيحة (${kgRow.size})`,
);

console.log("\n■ إنشاء الحسابات والأدوار الجديدة");
chk(
  (await call(lead1.sid, "/api/account-create", "POST", { id: "X1", name: "س", role: "eval" }))
    .status === 403,
  "رئيس الفريق لا يُنشئ حسابات (403)",
);
for (
  const [body, msg] of [
    [{ id: "ا ب", name: "س", role: "eval", team: "منطقة 1" }, "اسم مستخدم بصيغة خاطئة"],
    [{ id: "NEW1", name: "س", role: "ghost", team: "منطقة 1" }, "دور غير معروف"],
    [{ id: "NEW1", name: "", role: "eval", team: "منطقة 1" }, "اسم صاحب الحساب فارغ"],
    [{ id: "NEW1", name: "س", role: "eval" }, "مقيّم بلا فريق"],
    [{ id: "NEW1", name: "س", role: "super", teams: ["منطقة 1"] }, "رئيس فرق بفريق واحد"],
    [{ id: "NEW1", name: "س", role: "super", teams: ["منطقة 9", "منطقة 1"] }, "فريق غير معروف"],
    [{ id: "Z1-1", name: "س", role: "eval", team: "منطقة 1" }, "اسم مستخدم مأخوذ"],
  ] as const
) {
  chk((await call(tech.sid, "/api/account-create", "POST", body)).status === 400, msg + " يُرفض (400)");
}
const mkEval = await (await call(tech.sid, "/api/account-create", "POST", {
  id: "Z1-6",
  name: "مقيّمة سادسة",
  role: "eval",
  team: "منطقة 1",
})).json();
chk(mkEval.ok && mkEval.isDefault === true, "إنشاء مقيّم بالكلمة الافتراضية");
const le = await login("Z1-6", "12345678");
chk(le.status === 200, "دخول المقيّم الجديد");
chk(
  (await (await call(le.sid, "/api/institutions")).json()).rows.length === 0,
  "المقيّم الجديد بلا مؤسسات حتى تُسند إليه",
);
chk(
  (await call(le.sid, "/api/accounts")).status === 403,
  "المقيّم الجديد لا يبلغ شاشات الحساب الفني (403)",
);

const mkSuper = await (await call(tech.sid, "/api/account-create", "POST", {
  id: "SUP1",
  name: "رئيس فرق المناطق",
  role: "super",
  teams: ["منطقة 1", "منطقة 2", "منطقة 3", "منطقة 4"],
  password: "SuperPass#26",
})).json();
chk(mkSuper.ok, "إنشاء رئيس فرق على أربع مناطق");
const sp = await login("SUP1", "SuperPass#26");
chk(sp.status === 200, "دخول رئيس الفرق");
const spRows = (await (await call(sp.sid, "/api/institutions")).json()).rows;
const spTeams = [...new Set(spRows.map((r: { team: string }) => r.team))].sort();
chk(
  spTeams.length === 4 && !spTeams.includes("رياض الأطفال"),
  `نطاقه أربع مناطق فقط (${spTeams.join(" · ")})`,
);
chk(
  (await call(sp.sid, "/api/evaluation", "POST", {
    instId: spRows[0].id,
    kpi: rawFor(defs, 70),
  })).status === 200,
  "رئيس الفرق يُدخل التقييم في نطاقه",
);
const kgInst = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .find((r: { team: string }) => r.team === "رياض الأطفال");
chk(
  (await call(sp.sid, "/api/evaluation", "POST", { instId: kgInst.id, kpi: {} })).status === 403,
  "رئيس الفرق لا يمسّ فريقاً خارج نطاقه (403)",
);
chk(
  (await call(sp.sid, "/api/accounts")).status === 403,
  "رئيس الفرق لا يبلغ الحسابات (403)",
);

const mkDir = await (await call(tech.sid, "/api/account-create", "POST", {
  id: "DIR",
  name: "رئيس التعليم الأخضر",
  role: "director",
  password: "DirPass#2026",
})).json();
chk(mkDir.ok, "إنشاء حساب رئيس التعليم الأخضر");
const dr = await login("DIR", "DirPass#2026");
const drRows = (await (await call(dr.sid, "/api/institutions")).json()).rows;
chk(
  [...new Set(drRows.map((r: { team: string }) => r.team))].length === 6,
  `رئيس التعليم الأخضر يرى الفرق الستة (${drRows.length} مؤسسة)`,
);
chk(
  (await call(dr.sid, "/api/evaluation", "POST", { instId: kgInst.id, kpi: {} })).status === 200,
  "يُدخل التقييم في أي فريق",
);
chk((await call(dr.sid, "/api/audit")).status === 200, "يقرأ سجل التدقيق");
for (
  const [path, body, msg] of [
    ["/api/targets", { stage: "school", targets: {} }, "تعديل المؤشرات والمستهدفات"],
    ["/api/accounts-bulk", { items: [{ id: "Z1-1" }] }, "تعديل الحسابات"],
    ["/api/account-create", { id: "N9", name: "س", role: "eval", team: "منطقة 1" }, "إنشاء الحسابات"],
    ["/api/reset-passwords", { ids: ["Z1-1"] }, "إعادة تعيين كلمات المرور"],
    ["/api/view-as", { id: "Z1-1" }, "معاينة الحسابات"],
    ["/api/year", { year: "2027-2028" }, "تغيير العام الدراسي"],
  ] as const
) {
  chk((await call(dr.sid, path, "POST", body)).status === 403, `لا يملك ${msg} (403)`);
}
chk(
  (await (await call(dr.sid, "/api/me")).json()).perms.includes("tech") === false,
  "شاشة الحساب الفني غير معروضة له",
);

// الحذف
chk(
  (await call(tech.sid, "/api/account-delete", "POST", { id: "TECH" })).status === 400,
  "لا يُحذف الحساب الفني (400)",
);
chk(
  (await call(tech.sid, "/api/account-delete", "POST", { id: "Z1-2" })).status === 400,
  "لا يُحذف حساب له مؤسسات مسندة (400)",
);
chk(
  (await call(tech.sid, "/api/account-delete", "POST", { id: "Z1-6" })).status === 200,
  "يُحذف حساب بلا مؤسسات",
);
await call(tech.sid, "/api/account-delete", "POST", { id: "SUP1" });
await call(tech.sid, "/api/account-delete", "POST", { id: "DIR" });

console.log("\n■ حفظ تعديلات الحسابات دفعة واحدة");
chk(
  (await call(lead1.sid, "/api/accounts-bulk", "POST", { items: [{ id: "Z3-1" }] })).status === 403,
  "رئيس الفريق لا يحفظ تعديلات الحسابات (403)",
);
chk(
  (await call(tech.sid, "/api/accounts-bulk", "POST", { items: [] })).status === 400,
  "دفعة فارغة تُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/accounts-bulk", "POST", {
    items: [{ id: "Z3-1", newId: "Z3-2" }],
  })).status === 400,
  "اسم مستخدم مستخدم بالفعل يُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/accounts-bulk", "POST", {
    items: [{ id: "Z3-1", newId: "أ ب" }],
  })).status === 400,
  "صيغة اسم مستخدم خاطئة تُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/accounts-bulk", "POST", {
    items: [{ id: "Z3-1", name: "س" }, { id: "Z3-1", name: "ص" }],
  })).status === 400,
  "تكرار الحساب في الدفعة يُرفض (400)",
);
const before3 = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .filter((r: { evaluator: string }) => r.evaluator === "Z3-1").length;
const blk = await (await call(tech.sid, "/api/accounts-bulk", "POST", {
  items: [
    { id: "Z3-1", newId: "Z3-1A", name: "منسقة أولى", title: "عضو فريق تقييم" },
    { id: "Z3-2", newId: "Z3-2A", name: "منسقة ثانية" },
    { id: "Z3-3", name: "منسقة ثالثة" },
  ],
})).json();
chk(
  blk.ok && blk.count === 3 && blk.renamed === 2,
  `حفظ ثلاثة حسابات بتغييرين لاسم المستخدم (${blk.count} · ${blk.renamed})`,
);
chk(blk.moved === before3 + 0 || blk.moved > 0, `نُقلت ${blk.moved} مؤسسة مع الأسماء الجديدة`);
const accs3 = (await (await call(tech.sid, "/api/accounts")).json()).accounts;
chk(
  accs3.some((a: { id: string; name: string }) => a.id === "Z3-1A" && a.name === "منسقة أولى") &&
    accs3.some((a: { id: string }) => a.id === "Z3-2A") &&
    !accs3.some((a: { id: string }) => a.id === "Z3-1"),
  "الأسماء الجديدة محفوظة والقديمة اختفت",
);
chk(
  accs3.find((a: { id: string }) => a.id === "Z3-3").name === "منسقة ثالثة",
  "الحساب المعدَّل بلا تغيير اسم مستخدم حُفظ أيضاً",
);
chk((await login("Z3-1A")).status === 200, "الدخول بالاسم الجديد بعد الحفظ الجماعي");
chk((await login("Z3-1")).status === 401, "الاسم القديم لم يعد يعمل");
const stillOwned = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .filter((r: { evaluator: string }) => r.evaluator === "Z3-1A").length;
chk(stillOwned === before3, `مؤسسات الحساب انتقلت كاملة (${stillOwned} من ${before3})`);
await call(tech.sid, "/api/accounts-bulk", "POST", {
  items: [{ id: "Z3-1A", newId: "Z3-1" }, { id: "Z3-2A", newId: "Z3-2" }],
});

console.log("\n■ تبويبات التوزيع للحساب الفني");
const tabsMeta = (await (await call(tech.sid, "/api/me")).json()).meta.teamMeta;
const expected = [
  "مؤسسات تعليمية حكومية — المنطقة التعليمية 1",
  "مؤسسات تعليمية حكومية — المنطقة التعليمية 2",
  "مؤسسات تعليمية حكومية — المنطقة التعليمية 3",
  "مؤسسات تعليمية حكومية — المنطقة التعليمية 4",
  "مؤسسات تعليمية خاصة",
  "رياض الأطفال",
];
chk(
  ["منطقة 1", "منطقة 2", "منطقة 3", "منطقة 4", "التعليم الخاص", "رياض الأطفال"]
    .every((t, i) => tabsMeta[t].tab === expected[i]),
  "مسميات التبويبات الستة كما اعتُمدت",
);
for (const [t, n] of [["منطقة 3", 53], ["التعليم الخاص", 16], ["رياض الأطفال", 152]] as const) {
  const ev = (await (await call(tech.sid, "/api/evaluators?team=" + encodeURIComponent(t))).json())
    .rows;
  chk(ev.length === 5, `${t}: خمسة مقيّمين لعرضهم كأعمدة (${ev.length})`);
  const cnt = all.filter((r: { team: string }) => r.team === t).length;
  chk(cnt === n, `${t}: ${cnt} مؤسسة في التبويب`);
}
const techMove = await (await call(tech.sid, "/api/assign-bulk", "POST", {
  items: [{ instId: "KG-001", evaluator: "KG-3" }],
})).json();
chk(techMove.ok && techMove.count === 1, "الحساب الفني يوزّع في أي فريق");
await call(tech.sid, "/api/assign-bulk", "POST", {
  items: [{ instId: "KG-001", evaluator: "KG-1" }],
});

console.log("\n■ توزيع المؤسسات على المقيّمين");
chk(
  (await call(ev1.sid, "/api/assign-bulk", "POST", { items: [] })).status === 403,
  "المقيّم لا يوزّع المؤسسات (403)",
);
const own = (await (await call(lead1.sid, "/api/institutions")).json()).rows;
const origAsg = own.map((r: { id: string; evaluator: string }) => ({
  instId: r.id,
  evaluator: r.evaluator,
}));
// نتجنّب مؤسسة الاختبارات الرئيسية حتى تبقى مسندة إلى Z1-1
const movable = own.filter((r: { id: string }) => r.id !== mine.id);
const pick3 = movable.slice(0, 3).map((r: { id: string }) => ({
  instId: r.id,
  evaluator: "Z1-5",
}));
const bulk = await (await call(lead1.sid, "/api/assign-bulk", "POST", { items: pick3 })).json();
chk(bulk.ok && bulk.count >= 1, `رئيس الفريق يحفظ دفعة توزيع (${bulk.count})`);
const after3 = (await (await call(lead1.sid, "/api/institutions")).json()).rows
  .filter((r: { id: string; evaluator: string }) =>
    pick3.some((p: { instId: string }) => p.instId === r.id) && r.evaluator === "Z1-5"
  );
chk(after3.length === 3, `المؤسسات الثلاث صارت لـ Z1-5 (${after3.length})`);
chk(
  (await call(lead2.sid, "/api/assign-bulk", "POST", { items: pick3 })).status === 403,
  "رئيس فريق آخر لا يوزّع مؤسسات ليست لفريقه (403)",
);
chk(
  (await call(lead1.sid, "/api/assign-bulk", "POST", {
    items: [{ instId: own[0].id, evaluator: "Z2-1" }],
  })).status === 400,
  "إسناد لمقيّم من فريق آخر يُرفض (400)",
);
// دفعة نصفها خاطئ لا تُحفظ إطلاقاً
const evBefore = (await (await call(lead1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === movable[5].id).evaluator;
const half = await call(lead1.sid, "/api/assign-bulk", "POST", {
  items: [{ instId: movable[5].id, evaluator: "Z1-4" }, { instId: "LA-YOJAD", evaluator: "Z1-4" }],
});
chk(half.status === 404, "دفعة فيها مؤسسة غير موجودة تُرفض (404)");
const still = (await (await call(lead1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === movable[5].id).evaluator;
chk(still === evBefore, "الدفعة المرفوضة لم تُحفظ جزئياً");
chk(
  (await call(lead1.sid, "/api/assign", "POST", {
    instId: movable[0].id,
    team: "منطقة 2",
    evaluator: "Z2-1",
  })).status === 403,
  "رئيس الفريق لا ينقل مؤسسة خارج فريقه (403)",
);
// إعادة التوزيع الأصلي حتى لا تتأثر بقية الفحوص
await call(lead1.sid, "/api/assign-bulk", "POST", { items: origAsg });
const restored = (await (await call(lead1.sid, "/api/institutions")).json()).rows
  .filter((r: { id: string; evaluator: string }) =>
    origAsg.some((o: { instId: string; evaluator: string }) =>
      o.instId === r.id && o.evaluator === r.evaluator
    )
  );
chk(restored.length === own.length, `استُعيد التوزيع الأصلي (${restored.length})`);

console.log("\n■ الملاحظات وترشيح قصص النجاح");
const withNotes = { ...rawFor(defs, 95) } as Record<string, Record<string, unknown>>;
withNotes["1"] = { ...withNotes["1"], note: "خطط التحضير موثّقة لكن الأنشطة الصفية أقل من المتوقع" };
withNotes["6"] = { ...withNotes["6"], note: "المشاركة تركّزت في الصفوف العليا" };
const nSave = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: withNotes,
  notes: "زيارة ميدانية بتاريخ اليوم: التزام واضح من الإدارة وضعف في توثيق الشراكات.",
  story: { on: true, text: "حوّلت المدرسة فناءها إلى حديقة تعليمية يديرها الطلبة." },
})).json();
chk(nSave.ok && nSave.filled === 31, "الحفظ مع الملاحظات لا يتأثر باكتمال المؤشرات");
chk(
  nSave.kpiPct["1"] !== null && nSave.kpiPct["6"] !== null,
  "الملاحظة لا تدخل حساب المؤشر",
);
const back2 = (await (await call(ev1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === mine.id);
chk(back2.notedKpis === 2, `ملاحظتان محفوظتان على مؤشرين (${back2.notedKpis})`);
chk(
  back2.kpi["1"].note.startsWith("خطط التحضير"),
  "نص ملاحظة المؤشر يعود كما كُتب",
);
chk(back2.notes.includes("زيارة ميدانية"), "الملاحظات العامة محفوظة");
chk(
  back2.story.on === true && back2.story.text.includes("حديقة تعليمية"),
  "الترشيح كقصة نجاح وتعليقه محفوظان",
);
const longNote = await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: { 1: { i: 10, j: 5, note: "x".repeat(1100) } },
});
chk(longNote.status === 400, "ملاحظة أطول من 1000 حرف تُرفض (400)");
// رئيس الفريق يرشّح أيضاً
const leadNom = await (await call(lead1.sid, "/api/evaluation", "POST", {
  instId: "Z1-002",
  kpi: rawFor(defs, 88),
  story: { on: true, text: "ترشيح من رئيس الفريق" },
})).json();
chk(leadNom.ok, "رئيس الفريق يرشّح مؤسسة كقصة نجاح");
const topNom = await (await call(lead1.sid, "/api/top")).json();
const nomRows = topNom.teams[0].rows.filter((r: { nominated: boolean }) => r.nominated);
chk(
  nomRows.length >= 1 && nomRows.every((r: { nomination: string }) => r.nomination.length > 0),
  `المرشَّحات تظهر لرئيس الفريق مع تعليقها (${nomRows.length})`,
);
// إلغاء الترشيح
const unNom = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  kpi: rawFor(defs, 95),
  story: { on: false, text: "" },
})).json();
chk(unNom.ok, "إلغاء الترشيح ممكن");
const after = (await (await call(ev1.sid, "/api/institutions")).json()).rows
  .find((r: { id: string }) => r.id === mine.id);
chk(after.story.on === false && after.notedKpis === 0, "الترشيح والملاحظات تُمسح عند عدم إرسالها");

console.log("\n■ إعادة تعيين كلمات المرور");
chk(
  (await call(lead1.sid, "/api/reset-passwords", "POST", { ids: ["Z1-2"] })).status === 403,
  "رئيس الفريق لا يعيد تعيين كلمات المرور (403)",
);
chk(
  (await call(tech.sid, "/api/reset-passwords", "POST", { ids: [] })).status === 400,
  "بلا تحديد ولا «الكل» يُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/reset-passwords", "POST", { ids: ["LA-YOJAD"] })).status === 404,
  "حساب غير موجود يُرفض (404)",
);
chk(
  (await call(tech.sid, "/api/reset-passwords", "POST", { ids: ["Z1-2"], password: "123" }))
    .status === 400,
  "كلمة أقصر من 8 محارف تُرفض (400)",
);
const sel = await (await call(tech.sid, "/api/reset-passwords", "POST", {
  ids: ["Z1-2", "Z1-3"],
})).json();
chk(
  sel.ok && sel.count === 2 && sel.isDefault === true,
  `إعادة تعيين حسابين بالكلمة الافتراضية (${sel.count})`,
);
const d1 = await login("Z1-2", "12345678");
chk(d1.status === 200 && !!d1.sid, "الدخول بالكلمة الافتراضية 12345678 ينجح");
const mustCh = await (await call(d1.sid, "/api/me")).json();
chk(mustCh.me.mustChange === true, "الحساب مُلزَم بتغيير كلمة المرور عند أول دخول");
chk((await login("Z1-2", PW)).status === 401, "الكلمة السابقة لم تعد تعمل");
const allRs = await (await call(tech.sid, "/api/reset-passwords", "POST", {
  all: true,
  password: "ResetAll#2026",
})).json();
chk(
  allRs.count === 36 && allRs.skipped.length === 1 && allRs.skipped[0] === "TECH",
  `إعادة تعيين الكل: ${allRs.count} حساباً والحساب الفني مستثنى (${allRs.skipped.join("")})`,
);
chk(
  (await call(tech.sid, "/api/accounts")).status === 200,
  "جلسة الحساب الفني لم تتأثر بإعادة التعيين الشاملة",
);
chk((await login("Z1-4", "ResetAll#2026")).status === 200, "الدخول بالكلمة الجماعية الجديدة");
chk((await call(d1.sid, "/api/me")).status === 401, "جلسات الحسابات المعاد ضبطها أُنهيت");
// إعادة الجميع إلى كلمة الاختبارات لبقية الفحوص
await call(tech.sid, "/api/reset-passwords", "POST", { all: true, password: PW });
// إعادة التعيين الشاملة أنهت جلسات الجميع عدا الحساب الفني، فنعيد الدخول
[ev1, ev2, lead1, lead2] = await Promise.all([
  login("Z1-1"),
  login("Z1-2"),
  login("Z1-L"),
  login("Z2-L"),
]);
chk(
  [ev1, ev2, lead1, lead2].every((x) => x.status === 200 && x.sid),
  "إعادة دخول الحسابات بعد الضبط الشامل",
);

console.log("\n■ معاينة الحسابات");
chk(
  (await call(lead1.sid, "/api/view-as", "POST", { id: "Z1-1" })).status === 403,
  "رئيس الفريق لا يعاين الحسابات (403)",
);
chk(
  (await call(tech.sid, "/api/view-as", "POST", { id: "NOPE" })).status === 404,
  "معاينة حساب غير موجود تُرفض (404)",
);
const vw = await (await call(tech.sid, "/api/view-as", "POST", { id: "Z1-1" })).json();
chk(vw.ok && vw.viewing === "Z1-1", "الحساب الفني يبدأ معاينة حساب مقيّم");
const asMe = await (await call(tech.sid, "/api/me")).json();
chk(
  asMe.me.id === "Z1-1" && asMe.me.role === "eval" && asMe.me.viewAs.by === "TECH",
  `الجلسة تعرض حساب المقيّم مع بيان المعاين (${asMe.me.id} · ${asMe.me.viewAs?.by})`,
);
chk(
  JSON.stringify(asMe.perms) === JSON.stringify(["mine", "central", "stats", "transfers"]),
  `الشاشات المعروضة شاشات المقيّم (${asMe.perms.join(" · ")})`,
);
const asRows = (await (await call(tech.sid, "/api/institutions")).json()).rows;
chk(asRows.length === 12, `نطاق المؤسسات صار نطاق المقيّم (${asRows.length})`);
const wr = await call(tech.sid, "/api/evaluation", "POST", { instId: mine.id, kpi: {} });
chk(wr.status === 403, "الكتابة معطَّلة أثناء المعاينة (403)");
const wr2 = await call(tech.sid, "/api/central", "POST", { rows: [] });
chk(wr2.status === 403, "البيانات المركزية أيضاً معطَّلة أثناء المعاينة (403)");
chk(
  (await call(tech.sid, "/api/accounts")).status === 403,
  "شاشات الحساب الفني غير متاحة أثناء معاينة مقيّم (403)",
);
const vw2 = await (await call(tech.sid, "/api/view-as", "POST", { id: null })).json();
chk(vw2.ok && vw2.viewing === null, "إنهاء المعاينة يعيد الحساب الفني");
const back0 = await (await call(tech.sid, "/api/me")).json();
chk(
  back0.me.id === "TECH" && !back0.me.viewAs && (await call(tech.sid, "/api/accounts")).status === 200,
  "الحساب الفني استعاد صلاحياته كاملة",
);
const vwLead = await (await call(tech.sid, "/api/view-as", "POST", { id: "Z1-L" })).json();
chk(vwLead.viewing === "Z1-L", "معاينة حساب رئيس فريق");
const leadView = (await (await call(tech.sid, "/api/institutions")).json()).rows;
chk(leadView.length >= 56, `نطاق رئيس الفريق أثناء معاينته (${leadView.length})`);
await call(tech.sid, "/api/view-as", "POST", { id: null });
const audV = (await (await call(tech.sid, "/api/audit")).json()).rows;
chk(
  audV.some((r: { action: string }) => r.action === "بدء معاينة حساب") &&
    audV.some((r: { action: string }) => r.action === "إنهاء معاينة حساب"),
  "بدء المعاينة وإنهاؤها مسجَّلان في التدقيق",
);

console.log("\n■ البيانات المركزية للمقيّم ورئيس الفريق");
const evCd = await (await call(ev1.sid, "/api/central", "POST", {
  rows: [{ id: mine.id, students: 640, teachers: 33, subjects: 9 }],
})).json();
chk(evCd.ok, "المقيّم يُدخل بيانات مؤسساته المركزية");
chk(
  (await call(ev1.sid, "/api/central", "POST", { rows: [{ id: "Z2-001", students: 100 }] }))
    .status === 403,
  "المقيّم لا يُدخل بيانات مؤسسة خارج نطاقه (403)",
);
const leadCd = await call(lead1.sid, "/api/central", "POST", {
  rows: [{ id: "Z1-002", students: 500, teachers: 25, subjects: 8 }],
});
chk(leadCd.status === 200, "رئيس الفريق يُدخل بيانات أي مؤسسة بفريقه");
const evScope = (await (await call(ev1.sid, "/api/central")).json()).rows;
chk(evScope.length === 12, `نطاق المقيّم في شاشة البيانات (${evScope.length} مؤسسة)`);
const cdYear = await call(tech.sid, "/api/central", "POST", {
  year: "2025-2026",
  rows: [{ id: mine.id, students: 1 }],
});
chk(cdYear.status === 403, "لا تُدخل بيانات عام مغلق (403)");
await call(tech.sid, "/api/central", "POST", {
  rows: [{ id: mine.id, students: 850, teachers: 40, subjects: 10 }],
});

console.log("\n■ تغيير اسم المستخدم");
chk(
  (await call(lead1.sid, "/api/account-rename", "POST", { id: "Z1-5", newId: "X" })).status === 403,
  "رئيس الفريق لا يغيّر أسماء المستخدمين (403)",
);
chk(
  (await call(tech.sid, "/api/account-rename", "POST", { id: "Z1-5", newId: "ا ب" })).status === 400,
  "اسم مستخدم بصيغة غير مقبولة يُرفض (400)",
);
chk(
  (await call(tech.sid, "/api/account-rename", "POST", { id: "Z1-5", newId: "Z1-4" })).status === 400,
  "اسم مستخدم مستخدم بالفعل يُرفض (400)",
);
const before = (await (await call(tech.sid, "/api/institutions")).json()).rows
  .filter((r: { evaluator: string }) => r.evaluator === "Z1-5").length;
const rn = await (await call(tech.sid, "/api/account-rename", "POST", {
  id: "Z1-5",
  newId: "Z1-5A",
})).json();
chk(rn.ok && rn.moved === before, `تغيير الاسم نقل ${rn.moved} مؤسسة (المتوقع ${before})`);
const accsAfter = (await (await call(tech.sid, "/api/accounts")).json()).accounts;
chk(
  accsAfter.some((a: { id: string }) => a.id === "Z1-5A") &&
    !accsAfter.some((a: { id: string }) => a.id === "Z1-5"),
  "الحساب القديم اختفى والجديد ظهر",
);
const oldLogin = await login("Z1-5");
chk(oldLogin.status === 401, "الدخول بالاسم القديم يفشل (401)");
const newLogin = await login("Z1-5A");
chk(newLogin.status === 200 && !!newLogin.sid, "الدخول بالاسم الجديد ينجح");
await call(tech.sid, "/api/account-rename", "POST", { id: "Z1-5A", newId: "Z1-5" });

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
chk(meNow.meta.currentYear === "2026-2027", `العام الجاري ${meNow.meta.currentYear}`);
chk(
  JSON.stringify(meNow.meta.yearWindow) === JSON.stringify(["2025-2026", "2026-2027", "2027-2028"]),
  `نافذة الأعوام لا تسبق بداية الخط الزمني (${meNow.meta.yearWindow.join(" · ")})`,
);
const arch = await (await call(ev1.sid, "/api/institutions?year=2025-2026")).json();
chk(arch.archived === true && arch.editable === false, "2025-2026 مؤرشف وغير قابل للإدخال");
const ar1 = arch.rows.find((r: { id: string }) => r.id === mine.id);
chk(
  ar1.status === "مكتمل" && ar1.level === "مستدام" && ar1.basis === "لوغاريتمية",
  `المؤسسة تظهر مقيَّمة في العام المؤرشف (${ar1.pct}% · ${ar1.level})`,
);
chk(
  (await call(tech.sid, "/api/year", "POST", { year: "2025-2026" })).status === 400,
  "لا يُفتح العام المؤرشف للإدخال (400)",
);
chk(
  (await call(tech.sid, "/api/year", "POST", { year: "2024-2025" })).status === 400,
  "عام قبل بداية الخط الزمني يُرفض (400)",
);
const hist1 = await (await call(ev1.sid, "/api/history?inst=" + mine.id)).json();
chk(
  hist1.cycles.length === 2 && hist1.cycles[0].year === "2026-2027" &&
    hist1.cycles[1].year === "2025-2026" && hist1.cycles[1].archived === true,
  "دورتان: الجارية خطية والمؤرشفة لوغاريتمية",
);
chk(
  hist1.cumulative.n === 1 && hist1.cumulative.complete === false,
  "المؤرشفة لا تُحتسب: دورة واحدة فقط في المتوسط التراكمي",
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
await call(tech.sid, "/api/year", "POST", { year: "2027-2028" });
const y2 = await (await call(ev1.sid, "/api/institutions")).json();
chk(
  y2.year === "2027-2028" && y2.rows.find((r: { id: string }) => r.id === mine.id).status === "لم يبدأ",
  "العام الجديد يبدأ بصفحة بيضاء ولا يمسّ الدورة السابقة",
);
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, kpi: rawFor(defs, 60) });
const hist2 = await (await call(ev1.sid, "/api/history?inst=" + mine.id)).json();
chk(
  hist2.cycles.length === 3 && hist2.cycles.filter((c: { archived: boolean }) => !c.archived).length === 2,
  `ثلاث دورات: اثنتان خطيتان ومؤرشفة (${hist2.cycles.length})`,
);
chk(
  hist2.cumulative.n === 2 && hist2.cumulative.avg !== null && hist2.cumulative.trend !== null,
  `متوسط دورتين ${hist2.cumulative.avg}% · الفرق ${hist2.cumulative.trend}`,
);
await call(tech.sid, "/api/year", "POST", { year: "2026-2027" });
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
