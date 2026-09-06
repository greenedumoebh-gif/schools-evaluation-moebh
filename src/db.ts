// طبقة البيانات — Deno KV
import seed from "../data/seed.json" with { type: "json" };

// مسار قاعدة البيانات: افتراضي على Deno Deploy، وقابل للضبط محلياً وللاختبارات.
// لا نُسقط الإقلاع عند فشل الاتصال، بل نحفظ الخطأ لتُعرض صفحة تشخيص مفهومة.
let _kv: Deno.Kv | null = null;
let _kvError: string | null = null;
try {
  if (typeof Deno.openKv !== "function") {
    throw new Error(
      "Deno.openKv غير متاح. على Deno Deploy: جهّز قاعدة Deno KV واربطها بالتطبيق. محلياً: استخدم deno task start.",
    );
  }
  _kv = await Deno.openKv(Deno.env.get("KV_PATH") || undefined);
} catch (e) {
  _kvError = e instanceof Error ? e.message : String(e);
  console.error("[خطأ] تعذّر فتح قاعدة البيانات:", _kvError);
}
export const kvError = _kvError;
export const kv = _kv as Deno.Kv;

export type Role = "eval" | "lead" | "tech";
export interface Account {
  id: string;
  name: string;
  role: Role;
  team: string | null;
  title: string;
  hash?: string;
  salt?: string;
  mustChange?: boolean;
}
export interface Inst {
  id: string;
  name: string;
  /** الاسم داخل استمارة التقييم كما ورد في الملف المركزي — قد يختلف عن اسم المجلد */
  inner: string | null;
  team: string;
  /** المرحلة كما وردت حرفياً في الملف المركزي، وnull إذا كانت غائبة عنه */
  stage: string | null;
  gender: string | null;
  /** المرحلة العليا المعتمدة بقرار الفريق حين لا يذكر نص المرحلة أي مستوى */
  stageTop: string | null;
  students: number | null;
  /** تصنيف الحجم من الملف المركزي: صغيرة 30–399 · متوسطة 400–699 · كبيرة 700–999 · كبيرة جداً 1000+ */
  size: string | null;
  /** نتيجة الدورة السابقة كما وردت في الملفات المركزية — مرجع للمقارنة فقط */
  prev: PrevCycle | null;
  evaluator: string;
}
/**
 * نتيجة دورة سابقة. `basis` يوثّق منهجية حسابها: النتائج المحسوبة بالمعادلة
 * اللوغاريتمية لا تقارَن بنقاط الحساب الخطي إلا على مستوى التقدير والنسبة.
 */
export interface PrevCycle {
  year: string;
  ax: Record<string, number | null>;
  pts: number | null;
  pct: number | null;
  verdict: string | null;
  basis: string;
}

export interface Evaluation {
  instId: string;
  /** دورة مؤرشفة: نتائجها من الملفات المركزية بمنهجية سابقة ولا تُحسب خطياً */
  archived?: boolean;
  /** النتيجة والتقدير المخزّنان مباشرةً في الدورات المؤرشفة فقط */
  pct?: number | null;
  level?: string | null;
  basis?: string;
  /** العام الدراسي الذي يخص هذه الدورة */
  year: string;
  /**
   * المدخلات الخام لكل مؤشر: المفتاح رقم المؤشر — i المقام · j البسط أو القيمة
   * · m القيمة الثانوية · note ملاحظة كتابية اختيارية لا تدخل الحساب.
   */
  kpi: Record<string, { i?: string; j?: string; m?: string; note?: string }>;
  /** نسب المحاور — محسوبة في الخادم، لا تُقبل من العميل */
  axes: Record<string, number | null>;
  filled: number;
  status: "لم يبدأ" | "قيد التقييم" | "مكتمل";
  notes?: string;
  /** ترشيح المؤسسة كقصة نجاح من المقيّم أو رئيس الفريق مع تعليقه */
  story?: { on: boolean; text: string };
  by: string;
  at: string;
}
export interface Story {
  instId: string;
  team: string;
  title: string;
  text: string;
  by: string;
  at: string;
}

export const META = seed as unknown as {
  teams: string[];
  tcode: Record<string, string>;
  accounts: Account[];
  inst: Inst[];
  axw: { school: Record<string, number>; kg: Record<string, number> };
  axname: Record<string, string>;
  rubric: { n: string; a: number; b: number }[];
  year: string;
  cap: Record<string, number>;
  stageKpi: { school: number; kg: number | null };
  states: { v: number; name: string }[];
  // deno-lint-ignore no-explicit-any
  kpi: Record<string, any[]>;
  sizeRule: Record<string, [string, number, number | null][]>;
  teamMeta: Record<string, { code: string; no: number; kind: string; label: string }>;
  denomMap: Record<string, string>;
  centralFields: [string, string][];
  yearColors: Record<string, string>;
  yearColorFallback: string;
  appName: string;
  appNameShort: string;
  version: string;
  released: string;
  startYear: string;
  archiveYear: string;
};

// ── تشفير كلمات المرور: PBKDF2-SHA256 ──
const enc = new TextEncoder();
export async function hashPw(pw: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function newSalt(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// كلمة المرور الابتدائية: تُقرأ من المتغير البيئي وإلا تُولَّد وتُطبع مرة واحدة
function initialPassword(): string {
  const fromEnv = Deno.env.get("SEED_PASSWORD");
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  const gen = [...crypto.getRandomValues(new Uint8Array(9))]
    .map((b) => b.toString(36)).join("").slice(0, 12);
  console.warn(
    `\n[تنبيه] لم يُضبط SEED_PASSWORD. كلمة المرور الابتدائية لكل الحسابات: ${gen}\n` +
      `اضبط SEED_PASSWORD في متغيرات البيئة قبل التشغيل الفعلي.\n`,
  );
  return gen;
}

export async function seedIfEmpty() {
  if (!_kv) return { seeded: false, reset: false, error: _kvError };
  const done = await kv.get<boolean>(["seeded"]);
  await migrateEvalSchema();
  await seedArchiveCycle();

  // إعادة ضبط كلمات المرور: غيّر قيمة SEED_RESET في متغيرات البيئة لتنفيذها مرة واحدة.
  // تفيد إذا شُغّلت المنصة قبل ضبط SEED_PASSWORD أو فُقدت كلمة مرور الحساب الفني.
  const resetToken = Deno.env.get("SEED_RESET") ?? "";
  const lastToken = (await kv.get<string>(["reset_token"])).value ?? "";
  const doReset = done.value && resetToken !== "" && resetToken !== lastToken;

  if (done.value && !doReset) return { seeded: false, reset: false };

  const pw = initialPassword();
  let n = 0;
  for (const a of META.accounts) {
    const salt = newSalt();
    const hash = await hashPw(pw, salt);
    const prev = (await kv.get<Account>(["account", a.id])).value;
    // عند إعادة الضبط نحتفظ ببيانات الحساب ونغيّر كلمة المرور فقط
    await kv.set(["account", a.id], { ...(prev ?? a), salt, hash, mustChange: true });
    n++;
  }
  if (!done.value) { for (const i of META.inst) await kv.set(["inst", i.id], i); }
  await kv.set(["seeded"], true);
  if (resetToken) await kv.set(["reset_token"], resetToken);

  if (doReset) {
    console.warn(`[إعادة ضبط] أُعيدت كلمات مرور ${n} حساباً. التقييمات والقصص لم تُمس.`);
    return { seeded: false, reset: true, accounts: n };
  }
  return { seeded: true, reset: false, accounts: n, inst: META.inst.length };
}

/**
 * ترقية بنية التقييم من «4 نسب محاور» إلى «مؤشرات تفصيلية».
 * التقييمات السابقة تجريبية بالكامل فتُحذف مرة واحدة. المؤسسات والحسابات
 * والاختيارات وقصص النجاح لا تُمس.
 */
export const EVAL_SCHEMA = 3;
export async function migrateEvalSchema() {
  const cur = (await kv.get<number>(["eval_schema"])).value ?? 1;
  if (cur >= EVAL_SCHEMA) return { migrated: false, deleted: 0 };
  let n = 0;
  for await (const e of kv.list({ prefix: ["eval"] })) {
    await kv.delete(e.key);
    n++;
  }
  await kv.delete(["archive_seeded"]);
  await kv.set(["eval_schema"], EVAL_SCHEMA);
  if (n) console.warn(`[ترقية] حُذف ${n} تقييماً تجريبياً بعد تغيير بنية التقييم إلى المؤشرات التفصيلية.`);
  return { migrated: true, deleted: n };
}

/**
 * تسجيل نتائج العام المؤرشف كتقييمات فعلية في قاعدة البيانات، لا كحقل جانبي،
 * حتى تعاملها كل الشاشات والتقارير معاملة أي دورة أخرى. تُكتب مرة واحدة.
 */
export async function seedArchiveCycle() {
  const done = (await kv.get<boolean>(["archive_seeded"])).value;
  if (done) return { seeded: false, count: 0 };
  const y = META.archiveYear;
  let n = 0;
  for (const i of META.inst as unknown as Inst[]) {
    const p = i.prev;
    if (!p || (p.pct === null && !p.verdict)) continue;
    const ev: Evaluation = {
      instId: i.id,
      year: y,
      archived: true,
      pct: p.pct,
      level: p.verdict,
      basis: p.basis,
      kpi: {},
      axes: p.ax,
      filled: 0,
      // «مكتمل» فقط إذا كان الحكم أحد مستويات المسطرة وله نسبة؛ وإلا فهو غير مكتمل
      status: (p.pct !== null && META.rubric.some((r) => r.n === p.verdict)) ? "مكتمل" : "قيد التقييم",
      notes: "",
      by: "IMPORT",
      at: new Date().toISOString(),
    };
    await kv.set(["eval", y, i.id], ev);
    n++;
  }
  await kv.set(["archive_seeded"], true);
  console.warn(`[استيراد] سُجّلت ${n} نتيجة للعام المؤرشف ${y} من الملفات المركزية.`);
  return { seeded: true, count: n };
}

export async function getAccount(id: string): Promise<Account | null> {
  return (await kv.get<Account>(["account", id])).value;
}
export async function listAccounts(): Promise<Account[]> {
  const out: Account[] = [];
  for await (const e of kv.list<Account>({ prefix: ["account"] })) {
    const { hash: _h, salt: _s, ...rest } = e.value;
    out.push(rest as Account);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
export async function listInst(): Promise<Inst[]> {
  const out: Inst[] = [];
  for await (const e of kv.list<Inst>({ prefix: ["inst"] })) out.push(e.value);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
/** بيانات المؤسسة المركزية لعام بعينه: تُدخَل مرة وتُسحب في كل المؤشرات. */
export interface CentralData {
  students: number | null;
  teachers: number | null;
  subjects: number | null;
}
export async function getCentral(year: string): Promise<Record<string, CentralData>> {
  const out: Record<string, CentralData> = {};
  for await (const e of kv.list<CentralData>({ prefix: ["central", year] })) {
    out[String(e.key[2])] = e.value;
  }
  return out;
}
export async function setCentral(year: string, instId: string, d: CentralData) {
  await kv.set(["central", year, instId], d);
}

/** تصنيف الحجم من عدد الطلبة حسب جدول الخطة. */
export function sizeOf(team: string, students: number | null): string | null {
  if (students === null || students === undefined) return null;
  const rule = META.sizeRule[team === "رياض الأطفال" ? "kg" : "school"];
  for (const [name, from, to] of rule) {
    if (students >= from && (to === null || students <= to)) return name;
  }
  return null;
}

/** العام الدراسي الجاري — قابل للتغيير من الحساب الفني، وافتراضه عام الخطة. */
export async function currentYear(): Promise<string> {
  return (await kv.get<string>(["settings", "year"])).value ?? META.year;
}
export async function setCurrentYear(y: string) {
  await kv.set(["settings", "year"], y);
}
/** الأعوام التي تحمل تقييمات محفوظة، الأحدث أولاً. */
export async function listYears(): Promise<string[]> {
  const set = new Set<string>();
  for await (const e of kv.list<Evaluation>({ prefix: ["eval"] })) set.add(String(e.key[1]));
  return [...set].sort().reverse();
}
export async function getEvals(year: string): Promise<Record<string, Evaluation>> {
  const out: Record<string, Evaluation> = {};
  for await (const e of kv.list<Evaluation>({ prefix: ["eval", year] })) out[e.value.instId] = e.value;
  return out;
}
export async function setEval(ev: Evaluation) {
  await kv.set(["eval", ev.year, ev.instId], ev);
}
export async function listStories(): Promise<Story[]> {
  const out: Story[] = [];
  for await (const e of kv.list<Story>({ prefix: ["story"] })) out.push(e.value);
  return out;
}
export async function setStory(s: Story) {
  await kv.set(["story", s.instId], s);
}
export async function delStory(instId: string) {
  await kv.delete(["story", instId]);
}
export async function getPicks(team: string): Promise<string[]> {
  return (await kv.get<string[]>(["picks", team])).value ?? [];
}
export async function setPicks(team: string, ids: string[]) {
  await kv.set(["picks", team], ids);
}

// ── طلبات نقل المؤسسات بين المقيّمين ──
export interface Transfer {
  id: string;
  instId: string;
  instName: string;
  team: string;
  fromEval: string;
  toEval: string;
  reason: string;
  by: string;
  at: string;
  status: "معلّق" | "معتمد" | "مرفوض";
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}
export async function listTransfers(): Promise<Transfer[]> {
  const out: Transfer[] = [];
  for await (const e of kv.list<Transfer>({ prefix: ["transfer"] })) out.push(e.value);
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
export async function setTransfer(t: Transfer) {
  await kv.set(["transfer", t.id], t);
}
export async function getTransfer(id: string): Promise<Transfer | null> {
  return (await kv.get<Transfer>(["transfer", id])).value;
}

// ── سجل التدقيق ──
export async function audit(actor: string, action: string, target: string, detail = "") {
  const at = new Date().toISOString();
  await kv.set(["audit", at, crypto.randomUUID()], { actor, action, target, detail, at });
}
export async function listAudit(limit = 200) {
  const out: unknown[] = [];
  for await (const e of kv.list({ prefix: ["audit"] }, { reverse: true, limit })) out.push(e.value);
  return out;
}
