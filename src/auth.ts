// الجلسات والصلاحيات
import { type Account, getAccount, hashPw, kv, type Role } from "./db.ts";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 ساعات

export async function login(id: string, pw: string): Promise<string | null> {
  const acc = await getAccount(id);
  if (!acc || !acc.salt || !acc.hash) return null;
  const h = await hashPw(pw, acc.salt);
  // مقارنة بزمن ثابت
  if (h.length !== acc.hash.length) return null;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ acc.hash.charCodeAt(i);
  if (diff !== 0) return null;
  const sid = crypto.randomUUID();
  await kv.set(["session", sid], { id, exp: Date.now() + SESSION_TTL_MS }, {
    expireIn: SESSION_TTL_MS,
  });
  return sid;
}

export async function logout(sid: string) {
  await kv.delete(["session", sid]);
}

export function sidFrom(req: Request): string | null {
  const c = req.headers.get("cookie") ?? "";
  const m = c.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? m[1] : null;
}

/** الحساب المعروض حالياً، مع بيان مَن ينتحله إن وُجد. */
export type Viewer = Account & { viewAs?: { by: string; byName: string } };

export async function currentUser(req: Request): Promise<Viewer | null> {
  const sid = sidFrom(req);
  if (!sid) return null;
  const s = await kv.get<{ id: string; exp: number; as?: string }>(["session", sid]);
  if (!s.value || s.value.exp < Date.now()) return null;
  const owner = await getAccount(s.value.id);
  if (!owner) return null;
  // معاينة حساب آخر: مقصورة على الحساب الفني، والمالك الحقيقي يبقى صاحب الجلسة
  if (s.value.as && owner.role === "tech") {
    const target = await getAccount(s.value.as);
    if (target) {
      const { hash: _h2, salt: _s2, ...t } = target;
      return { ...(t as Account), viewAs: { by: owner.id, byName: owner.name } };
    }
  }
  const { hash: _h, salt: _s, ...rest } = owner;
  return rest as Account;
}

/** أي كتابة ممنوعة أثناء المعاينة حتى لا تُنسب بيانات لحساب لم يُدخلها. */
export function blockWhileViewing(acc: Viewer, method: string): Response | null {
  if (!acc.viewAs || method === "GET") return null;
  return forbid("أنت في وضع معاينة حساب آخر — الكتابة معطَّلة. اخرج من المعاينة أولاً");
}

export async function setViewAs(sid: string, as: string | null) {
  const s = await kv.get<{ id: string; exp: number; as?: string }>(["session", sid]);
  if (!s.value) return false;
  const next = { ...s.value };
  if (as) next.as = as;
  else delete next.as;
  await kv.set(["session", sid], next, { expireIn: Math.max(1000, next.exp - Date.now()) });
  return true;
}

export function cookieHeader(sid: string, secure: boolean): string {
  return `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}` +
    (secure ? "; Secure" : "");
}

// ── مصفوفة الصلاحيات ──
export const PERMS: Record<Role, string[]> = {
  eval: ["mine", "central", "stats", "transfers", "eval:write", "central:write", "transfer:ask"],
  lead: [
    "team",
    "mine",
    "central",
    "stats",
    "top",
    "reports",
    "transfers",
    "assign",
    "eval:write",
    "inst:write",
    "central:write",
    "assign:write",
    "picks:write",
    "story:write",
    "transfer:decide",
  ],
  tech: [
    "tech",
    "team",
    "central",
    "stats",
    "top",
    "reports",
    "transfers",
    "assign",
    "central:write",
    "inst:write",
    "assign:write",
    "accounts:write",
    "audit:read",
    "targets:write",
    "transfer:decide",
  ],
};
export function can(acc: Account, perm: string): boolean {
  return PERMS[acc.role].includes(perm);
}

/** نطاق المؤسسات المسموح لهذا الحساب. */
export function scope(acc: Account): (instTeam: string, evaluator: string) => boolean {
  if (acc.role === "eval") return (_t, ev) => ev === acc.id;
  if (acc.role === "lead") return (t, _ev) => t === acc.team;
  return () => true;
}

export function requireAuth(acc: Account | null): Response | null {
  if (!acc) {
    return new Response(JSON.stringify({ error: "غير مصرّح" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return null;
}
export function forbid(msg = "لا تملك صلاحية هذا الإجراء"): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
