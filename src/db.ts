// طبقة البيانات — Deno KV
import seed from "../data/seed.json" with { type: "json" };

// مسار قاعدة البيانات: افتراضي على Deno Deploy، وقابل للضبط محلياً وللاختبارات
export const kv = await Deno.openKv(Deno.env.get("KV_PATH") || undefined);

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
  team: string;
  stage: string;
  gender: string;
  students: number;
  evaluator: string;
}
export interface Evaluation {
  instId: string;
  axes: Record<string, number | null>;
  status: "لم يبدأ" | "قيد التقييم" | "مكتمل";
  notes?: string;
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
  const done = await kv.get<boolean>(["seeded"]);
  if (done.value) return { seeded: false };
  const pw = initialPassword();
  let n = 0;
  for (const a of META.accounts) {
    const salt = newSalt();
    const hash = await hashPw(pw, salt);
    await kv.set(["account", a.id], { ...a, salt, hash, mustChange: true });
    n++;
  }
  for (const i of META.inst) await kv.set(["inst", i.id], i);
  await kv.set(["seeded"], true);
  return { seeded: true, accounts: n, inst: META.inst.length };
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
export async function getEvals(): Promise<Record<string, Evaluation>> {
  const out: Record<string, Evaluation> = {};
  for await (const e of kv.list<Evaluation>({ prefix: ["eval"] })) out[e.value.instId] = e.value;
  return out;
}
export async function setEval(ev: Evaluation) {
  await kv.set(["eval", ev.instId], ev);
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
