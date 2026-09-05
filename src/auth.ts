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

export async function currentUser(req: Request): Promise<Account | null> {
  const sid = sidFrom(req);
  if (!sid) return null;
  const s = await kv.get<{ id: string; exp: number }>(["session", sid]);
  if (!s.value || s.value.exp < Date.now()) return null;
  const acc = await getAccount(s.value.id);
  if (!acc) return null;
  const { hash: _h, salt: _s, ...rest } = acc;
  return rest as Account;
}

export function cookieHeader(sid: string, secure: boolean): string {
  return `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}` +
    (secure ? "; Secure" : "");
}

// ── مصفوفة الصلاحيات ──
export const PERMS: Record<Role, string[]> = {
  eval: ["mine", "stats", "eval:write"],
  lead: ["team", "stats", "top", "reports", "picks:write", "story:write"],
  tech: ["tech", "team", "stats", "top", "reports", "accounts:write", "audit:read", "targets:write"],
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
