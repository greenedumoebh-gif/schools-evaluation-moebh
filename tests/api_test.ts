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
const save = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  axes: { 1: 90, 2: 90, 3: 90, 4: 90 },
  notes: "اختبار",
})).json();
chk(save.ok && save.status === "مكتمل" && save.pct === 90, `حفظ تقييم كامل → ${save.pct}% · ${save.status}`);
const partial = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  axes: { 1: 80, 2: 80, 3: 80, 4: null },
})).json();
chk(partial.status === "قيد التقييم", "محور ناقص → قيد التقييم");
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, axes: { 1: 90, 2: 90, 3: 90, 4: 90 } });
const foreign = await call(ev2.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  axes: { 1: 10, 2: 10, 3: 10, 4: 10 },
});
chk(foreign.status === 403, "مقيّم آخر لا يستطيع تعديل مؤسسة ليست له (403)");
const leadWrite = await call(lead1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  axes: { 1: 5, 2: 5, 3: 5, 4: 5 },
});
chk(leadWrite.status === 403, "رئيس الفريق لا يُدخل تقييماً (403)");
const clamp = await (await call(ev1.sid, "/api/evaluation", "POST", {
  instId: mine.id,
  axes: { 1: 500, 2: -30, 3: 90, 4: 90 },
})).json();
chk(clamp.pct !== null && clamp.pct <= 100, `القيم تُقيَّد بين 0 و100 → ${clamp.pct}%`);
await call(ev1.sid, "/api/evaluation", "POST", { instId: mine.id, axes: { 1: 95, 2: 95, 3: 95, 4: 95 } });

console.log("\n■ تهيئة بيانات كافية لأعلى 10");
// أدخل تقييمات مكتملة بنتائج متفاوتة حتى تكتمل قائمة أعلى 10
const seedRows = iv1.rows.slice(0, 12);
let si = 0;
for (const r of seedRows) {
  const v = 96 - si * 3;
  await call(ev1.sid, "/api/evaluation", "POST", { instId: r.id, axes: { 1: v, 2: v, 3: v, 4: v } });
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
