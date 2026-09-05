// واجهات البيانات — الصلاحيات مطبَّقة هنا في الخادم لا في المتصفح
import {
  audit,
  delStory,
  type Evaluation,
  getEvals,
  getPicks,
  hashPw,
  kv,
  listAccounts,
  listAudit,
  listInst,
  listStories,
  META,
  newSalt,
  setEval,
  setPicks,
  setStory,
  type Story,
} from "./db.ts";
import {
  can,
  cookieHeader,
  currentUser,
  forbid,
  login,
  logout,
  requireAuth,
  scope,
  sidFrom,
} from "./auth.ts";

const J = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const MAX_PICKS = 3;
export const TOP_N = 10;

export function axw(team: string) {
  return team === "رياض الأطفال" ? META.axw.kg : META.axw.school;
}
export function capOf(team: string) {
  return team === "رياض الأطفال" ? 4500 : 5400;
}
export function pctOf(team: string, axes: Record<string, number | null> | null): number | null {
  if (!axes) return null;
  const w = axw(team);
  let p = 0, t = 0;
  for (const a of ["1", "2", "3", "4"]) {
    const v = axes[a];
    if (v === null || v === undefined) return null;
    p += w[a] * v / 100;
    t += w[a];
  }
  return Math.round(p / t * 1000) / 10;
}
export function lvlOf(v: number) {
  let r = META.rubric[0];
  for (const b of META.rubric) if (v >= b.a) r = b;
  return r;
}

export async function handleApi(req: Request, url: URL, secure: boolean): Promise<Response | null> {
  const p = url.pathname;
  if (!p.startsWith("/api/")) return null;

  // ── دخول وخروج ──
  if (p === "/api/login" && req.method === "POST") {
    const { id, password } = await req.json().catch(() => ({}));
    if (!id || !password) return J({ error: "أدخل اسم الحساب وكلمة المرور" }, 400);
    const sid = await login(String(id), String(password));
    if (!sid) return J({ error: "بيانات الدخول غير صحيحة" }, 401);
    await audit(String(id), "دخول", "-");
    return J({ ok: true }, 200, { "set-cookie": cookieHeader(sid, secure) });
  }
  if (p === "/api/logout" && req.method === "POST") {
    const sid = sidFrom(req);
    if (sid) await logout(sid);
    return J({ ok: true }, 200, {
      "set-cookie": `sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    });
  }

  // فحص الجلسة دون خطأ — تستخدمه الواجهة عند فتح الصفحة
  if (p === "/api/session") {
    const u = await currentUser(req);
    return J({ authenticated: !!u });
  }

  const me = await currentUser(req);
  const un = requireAuth(me);
  if (un) return un;
  const acc = me!;
  const inScope = scope(acc);

  // ── من أنا + البيانات المرجعية ──
  if (p === "/api/me") {
    return J({
      me: acc,
      meta: {
        teams: META.teams,
        axname: META.axname,
        rubric: META.rubric,
        year: META.year,
        maxPicks: MAX_PICKS,
        topN: TOP_N,
      },
      // ترتيب الشاشات: تبدأ بالشاشة الأساسية لكل دور
      perms: ({
        eval: ["mine", "stats"],
        lead: ["team", "stats", "top", "reports"],
        tech: ["tech", "team", "stats", "top", "reports"],
      }[acc.role] as string[]).filter((x) => can(acc, x)),
    });
  }

  if (p === "/api/password" && req.method === "POST") {
    const { current, next } = await req.json().catch(() => ({}));
    if (!next || String(next).length < 8) return J({ error: "كلمة المرور الجديدة 8 محارف فأكثر" }, 400);
    const full = (await kv.get<{ salt: string; hash: string }>(["account", acc.id])).value;
    if (!full) return J({ error: "الحساب غير موجود" }, 404);
    if (await hashPw(String(current ?? ""), full.salt) !== full.hash) {
      return J({ error: "كلمة المرور الحالية غير صحيحة" }, 401);
    }
    const salt = newSalt();
    await kv.set(["account", acc.id], {
      ...(await kv.get(["account", acc.id])).value as object,
      salt,
      hash: await hashPw(String(next), salt),
      mustChange: false,
    });
    await audit(acc.id, "تغيير كلمة المرور", acc.id);
    return J({ ok: true });
  }

  // ── المؤسسات ضمن النطاق ──
  if (p === "/api/institutions") {
    const [inst, evals] = await Promise.all([listInst(), getEvals()]);
    const rows = inst.filter((i) => inScope(i.team, i.evaluator)).map((i) => {
      const e = evals[i.id];
      const axes = e?.axes ?? null;
      const pct = pctOf(i.team, axes);
      return {
        ...i,
        axes,
        status: e?.status ?? "لم يبدأ",
        notes: e?.notes ?? "",
        pct,
        level: pct === null ? null : lvlOf(pct).n,
        cap: capOf(i.team),
        axw: axw(i.team),
      };
    });
    return J({ rows });
  }

  // ── حفظ تقييم — للمقيّم صاحب المؤسسة فقط ──
  if (p === "/api/evaluation" && req.method === "POST") {
    if (!can(acc, "eval:write")) return forbid("إدخال التقييم من صلاحية عضو فريق التقييم");
    const body = await req.json().catch(() => ({}));
    const inst = (await kv.get<{ team: string; evaluator: string }>(["inst", body.instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (inst.evaluator !== acc.id) return forbid("هذه المؤسسة ليست ضمن مؤسساتك");
    const axes: Record<string, number | null> = {};
    for (const a of ["1", "2", "3", "4"]) {
      const v = body.axes?.[a];
      axes[a] = (v === null || v === undefined || v === "") ? null : Math.max(0, Math.min(100, Number(v)));
    }
    const complete = ["1", "2", "3", "4"].every((a) => axes[a] !== null);
    const any = ["1", "2", "3", "4"].some((a) => axes[a] !== null);
    const ev: Evaluation = {
      instId: body.instId,
      axes,
      status: complete ? "مكتمل" : (any ? "قيد التقييم" : "لم يبدأ"),
      notes: String(body.notes ?? "").slice(0, 2000),
      by: acc.id,
      at: new Date().toISOString(),
    };
    await setEval(ev);
    await audit(acc.id, "حفظ تقييم", body.instId, ev.status);
    return J({ ok: true, status: ev.status, pct: pctOf(inst.team, axes) });
  }

  // ── أعلى 10 والاختيارات ──
  if (p === "/api/top") {
    const [inst, evals] = await Promise.all([listInst(), getEvals()]);
    const teams = acc.role === "lead" ? [acc.team!] : META.teams;
    const stories = await listStories();
    const out = [];
    for (const t of teams) {
      const rows = inst.filter((i) => i.team === t).map((i) => {
        const axes = evals[i.id]?.axes ?? null;
        return { ...i, pct: pctOf(i.team, axes), status: evals[i.id]?.status ?? "لم يبدأ" };
      }).filter((r) => r.status === "مكتمل" && r.pct !== null)
        .sort((a, b) => b.pct! - a.pct!).slice(0, TOP_N)
        .map((r) => ({ ...r, level: lvlOf(r.pct!).n }));
      out.push({ team: t, rows, picks: await getPicks(t) });
    }
    return J({ teams: out, stories: stories.filter((s) => teams.includes(s.team)) });
  }

  if (p === "/api/picks" && req.method === "POST") {
    if (!can(acc, "picks:write")) return forbid("اختيار قصص النجاح من صلاحية رئيس الفريق");
    const { instId, on } = await req.json().catch(() => ({}));
    const inst = (await kv.get<{ team: string }>(["inst", instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (acc.role === "lead" && inst.team !== acc.team) return forbid("المؤسسة خارج فريقك");
    // لا تُختار إلا من أعلى 10 في فريقها
    const [all, evals] = await Promise.all([listInst(), getEvals()]);
    const top = all.filter((i) => i.team === inst.team)
      .map((i) => ({ id: i.id, pct: pctOf(i.team, evals[i.id]?.axes ?? null), st: evals[i.id]?.status }))
      .filter((r) => r.st === "مكتمل" && r.pct !== null)
      .sort((a, b) => b.pct! - a.pct!).slice(0, TOP_N).map((r) => r.id);
    if (on && !top.includes(instId)) return forbid("الاختيار من أعلى 10 مؤسسات فقط");
    const cur = await getPicks(inst.team);
    let next: string[];
    if (on) {
      if (cur.includes(instId)) next = cur;
      else if (cur.length >= MAX_PICKS) return forbid(`الحد الأقصى ${MAX_PICKS} مؤسسات لكل فريق`);
      else next = [...cur, instId];
    } else {
      next = cur.filter((x) => x !== instId);
      await delStory(instId);
    }
    await setPicks(inst.team, next);
    await audit(acc.id, on ? "اختيار لقصة نجاح" : "إلغاء اختيار", instId);
    return J({ ok: true, picks: next });
  }

  if (p === "/api/story" && req.method === "POST") {
    if (!can(acc, "story:write")) return forbid("كتابة قصص النجاح من صلاحية رئيس الفريق");
    const { instId, title, text } = await req.json().catch(() => ({}));
    const inst = (await kv.get<{ team: string }>(["inst", instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (acc.role === "lead" && inst.team !== acc.team) return forbid("المؤسسة خارج فريقك");
    if (!(await getPicks(inst.team)).includes(instId)) {
      return forbid("اختر المؤسسة أولاً ضمن الثلاث");
    }
    const s: Story = {
      instId,
      team: inst.team,
      title: String(title ?? "").slice(0, 200),
      text: String(text ?? "").slice(0, 5000),
      by: acc.name,
      at: new Date().toISOString(),
    };
    if (!s.text.trim()) {
      await delStory(instId);
      await audit(acc.id, "حذف قصة نجاح", instId);
      return J({ ok: true, deleted: true });
    }
    await setStory(s);
    await audit(acc.id, "حفظ قصة نجاح", instId);
    return J({ ok: true });
  }

  // ── الحساب الفني ──
  if (p === "/api/accounts") {
    if (!can(acc, "accounts:write")) return forbid();
    return J({ accounts: await listAccounts() });
  }
  if (p === "/api/audit") {
    if (!can(acc, "audit:read")) return forbid();
    return J({ rows: await listAudit(300) });
  }
  if (p === "/api/reset-password" && req.method === "POST") {
    if (!can(acc, "accounts:write")) return forbid();
    const { id, password } = await req.json().catch(() => ({}));
    if (!id || !password || String(password).length < 8) {
      return J({ error: "كلمة مرور 8 محارف فأكثر" }, 400);
    }
    const cur = (await kv.get(["account", id])).value as object | null;
    if (!cur) return J({ error: "الحساب غير موجود" }, 404);
    const salt = newSalt();
    await kv.set(["account", id], {
      ...cur,
      salt,
      hash: await hashPw(String(password), salt),
      mustChange: true,
    });
    await audit(acc.id, "إعادة تعيين كلمة مرور", String(id));
    return J({ ok: true });
  }

  return J({ error: "مسار غير معروف" }, 404);
}
