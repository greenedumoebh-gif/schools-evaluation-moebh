// واجهات البيانات — الصلاحيات مطبَّقة هنا في الخادم لا في المتصفح
import {
  type Account,
  audit,
  currentYear,
  delStory,
  type Evaluation,
  getEvals,
  getPicks,
  hashPw,
  type Inst,
  kv,
  listAccounts,
  listAudit,
  listInst,
  listStories,
  listYears,
  META,
  newSalt,
  setCurrentYear,
  setEval,
  setPicks,
  setStory,
  type Story,
} from "./db.ts";
import {
  applyText,
  capOfStage,
  effSecTarget,
  effTarget,
  getTargets,
  type Kpi,
  kpisOf,
  scoreInst,
  setTargets,
  stageOf,
  targetIsAssumed,
  type Targets,
  TEXT_FIELDS,
  topStage,
} from "./score.ts";
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
  return capOfStage(stageOf(team));
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
        currentYear: await currentYear(),
        years: await listYears(),
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
    const year = url.searchParams.get("year") || await currentYear();
    const [inst, evals, tSchool, tKg] = await Promise.all([
      listInst(),
      getEvals(year),
      getTargets("school"),
      getTargets("kg"),
    ]);
    const ovOf = (team: string) => (stageOf(team) === "kg" ? tKg : tSchool);
    const rows = inst.filter((i) => inScope(i.team, i.evaluator)).map((i) => {
      const e = evals[i.id];
      const sc = scoreInst(i.team, i, e?.kpi ?? {}, ovOf(i.team));
      return {
        ...i,
        kpi: e?.kpi ?? {},
        kpiPct: sc.kpiPct,
        axes: sc.axes,
        axPts: sc.axPts,
        pts: sc.pts,
        filled: sc.filled,
        totalKpi: sc.total,
        status: e?.status ?? "لم يبدأ",
        notes: e?.notes ?? "",
        pct: sc.pct,
        level: sc.pct === null ? null : lvlOf(sc.pct).n,
        cap: capOf(i.team),
        axw: axw(i.team),
      };
    });
    return J({ year, rows });
  }

  // ── تعريف المؤشرات والمستهدفات السارية لمؤسسة بعينها ──
  if (p === "/api/kpis") {
    const id = url.searchParams.get("inst") ?? "";
    const i =
      (await kv.get<{ team: string; stage: string | null; stageTop?: string | null; evaluator: string }>([
        "inst",
        id,
      ])).value;
    if (!i) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (!inScope(i.team, i.evaluator)) return forbid("هذه المؤسسة خارج نطاقك");
    const st = stageOf(i.team);
    const ov = await getTargets(st);
    const rows = (kpisOf(i.team) as Kpi[]).map((k) => ({
      ...applyText(k, ov),
      edited: TEXT_FIELDS.some((f) => {
        const v = ov[String(k.n)]?.[f];
        return typeof v === "string" && v.trim() !== "";
      }),
      tgtEff: effTarget(k, i.team, i, ov),
      tgtBase: k.mode === "وصفي" ? 100 : effTarget(k, i.team, i, {}),
      secEff: effSecTarget(k, ov),
      assumed: targetIsAssumed(k, i.team, i),
    }));
    return J({
      stage: st,
      cap: capOf(i.team),
      axw: axw(i.team),
      states: META.states,
      topStage: topStage(i),
      kpis: rows,
    });
  }

  // ── ضبط المستهدفات — الحساب الفني وحده ──
  if (p === "/api/targets" && req.method === "GET") {
    return J({ school: await getTargets("school"), kg: await getTargets("kg") });
  }
  if (p === "/api/targets" && req.method === "POST") {
    if (!can(acc, "targets:write")) return forbid("ضبط المستهدفات من صلاحية الحساب الفني");
    const body = await req.json().catch(() => ({}));
    const st = body.stage === "kg" ? "kg" : "school";
    const ks = META.kpi[st] as Kpi[];
    const out: Targets = {};
    for (const k of ks) {
      const value = body.targets?.[String(k.n)];
      if (!value) continue;
      const e: Record<string, string | number> = {};
      if (k.mode !== "وصفي" && value.t !== undefined && value.t !== null && value.t !== "") {
        const t = Number(value.t);
        if (!isFinite(t) || t <= 0) return J({ error: `مستهدف غير صالح للمؤشر ${k.n}` }, 400);
        e.t = t;
      }
      if (k.sec !== null && value.s !== undefined && value.s !== null && value.s !== "") {
        const sv = Number(value.s);
        if (!isFinite(sv) || sv <= 0) return J({ error: `مستهدف ثانوي غير صالح للمؤشر ${k.n}` }, 400);
        e.s = sv;
      }
      for (const f of TEXT_FIELDS) {
        const v = value[f];
        if (typeof v !== "string" || v.trim() === "") continue;
        if (v.length > 3000) return J({ error: `نص طويل جداً في المؤشر ${k.n}` }, 400);
        e[f] = v.trim();
      }
      if (Object.keys(e).length) out[String(k.n)] = e;
    }
    await setTargets(st, out);
    const nTxt = Object.values(out).filter((o) => TEXT_FIELDS.some((f) => typeof o[f] === "string")).length;
    await audit(
      acc.id,
      "تعديل المؤشرات",
      st,
      `${Object.keys(out).length} مؤشراً · ${nTxt} تعديل نصي`,
    );
    return J({ ok: true, count: Object.keys(out).length, text: nTxt });
  }

  // ── حفظ تقييم — للمقيّم صاحب المؤسسة فقط ──
  if (p === "/api/evaluation" && req.method === "POST") {
    if (!can(acc, "eval:write")) return forbid("إدخال التقييم من صلاحية عضو فريق التقييم");
    const body = await req.json().catch(() => ({}));
    const inst =
      (await kv.get<{ team: string; stage: string | null; stageTop?: string | null; evaluator: string }>([
        "inst",
        body.instId,
      ])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (inst.evaluator !== acc.id) return forbid("هذه المؤسسة ليست ضمن مؤسساتك");
    const ks = kpisOf(inst.team) as Kpi[];
    const kpi: Record<string, { i?: string; j?: string; m?: string }> = {};
    for (const k of ks) {
      const r = body.kpi?.[String(k.n)];
      if (!r) continue;
      const cell: { i?: string; j?: string; m?: string } = {};
      for (const f of ["i", "j", "m"] as const) {
        const v = r[f];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        const num = Number(v);
        if (!isFinite(num) || num < 0) return J({ error: `قيمة غير صالحة في المؤشر ${k.n}` }, 400);
        cell[f] = String(num);
      }
      if (k.mode === "وصفي" && cell.j !== undefined && ![0, 50, 100].includes(Number(cell.j))) {
        return J({ error: `حالة تنفيذ غير صالحة في المؤشر ${k.n}` }, 400);
      }
      if (Object.keys(cell).length) kpi[String(k.n)] = cell;
    }
    const ov = await getTargets(stageOf(inst.team));
    const sc = scoreInst(inst.team, inst, kpi, ov);
    const ev: Evaluation = {
      instId: body.instId,
      year: await currentYear(),
      kpi,
      axes: sc.axes,
      filled: sc.filled,
      status: sc.filled === sc.total ? "مكتمل" : (sc.filled ? "قيد التقييم" : "لم يبدأ"),
      notes: String(body.notes ?? "").slice(0, 2000),
      by: acc.id,
      at: new Date().toISOString(),
    };
    await setEval(ev);
    await audit(acc.id, "حفظ تقييم", body.instId, `${ev.status} · ${sc.filled}/${sc.total}`);
    return J({
      ok: true,
      status: ev.status,
      pct: sc.pct,
      pts: sc.pts,
      filled: sc.filled,
      total: sc.total,
      kpiPct: sc.kpiPct,
      axPts: sc.axPts,
    });
  }

  // ── أعلى 10 والاختيارات ──
  if (p === "/api/top") {
    const [inst, evals] = await Promise.all([listInst(), getEvals(await currentYear())]);
    const teams = acc.role === "lead" ? [acc.team!] : META.teams;
    const stories = await listStories();
    const out = [];
    for (const t of teams) {
      const rows = inst.filter((i) => i.team === t).map((i) => {
        const axes = evals[i.id]?.axes ?? null;
        return { ...i, axes, pct: pctOf(i.team, axes), status: evals[i.id]?.status ?? "لم يبدأ" };
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
    if (!instId || typeof instId !== "string") return J({ error: "المؤسسة غير محددة" }, 400);
    const inst = (await kv.get<{ team: string }>(["inst", instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (acc.role === "lead" && inst.team !== acc.team) return forbid("المؤسسة خارج فريقك");
    // لا تُختار إلا من أعلى 10 في فريقها
    const [all, evals] = await Promise.all([listInst(), getEvals(await currentYear())]);
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
    if (!instId || typeof instId !== "string") return J({ error: "المؤسسة غير محددة" }, 400);
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

  // ── سجل المؤسسة عبر الدورات والأداء التراكمي ──
  if (p === "/api/history") {
    const id = url.searchParams.get("inst") ?? "";
    const i = (await kv.get<Inst>(["inst", id])).value;
    if (!i) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (!inScope(i.team, i.evaluator)) return forbid("هذه المؤسسة خارج نطاقك");
    const ov = await getTargets(stageOf(i.team));
    const years = await listYears();
    const cycles = [];
    for (const y of years) {
      const ev = (await kv.get<Evaluation>(["eval", y, id])).value;
      if (!ev || ev.status !== "مكتمل") continue;
      const sc = scoreInst(i.team, i, ev.kpi, ov);
      if (sc.pct === null) continue;
      cycles.push({
        year: y,
        pct: sc.pct,
        pts: sc.pts,
        axes: sc.axes,
        level: lvlOf(sc.pct).n,
        basis: "خطية",
      });
    }
    // الأداء التراكمي: متوسط آخر ثلاث دورات مكتملة على المنهجية الخطية وحدها.
    const last3 = cycles.slice(0, 3);
    const avg = last3.length
      ? Math.round(last3.reduce((a, c) => a + c.pct, 0) / last3.length * 10) / 10
      : null;
    const trend = cycles.length >= 2 ? Math.round((cycles[0].pct - cycles[1].pct) * 10) / 10 : null;
    return J({
      inst: { id: i.id, name: i.name, team: i.team, stage: i.stage, size: i.size },
      cycles,
      prev: i.prev,
      cumulative: {
        years: last3.map((c) => c.year),
        n: last3.length,
        complete: last3.length === 3,
        avg,
        level: avg === null ? null : lvlOf(avg).n,
        trend,
      },
    });
  }

  // ── العام الدراسي الجاري — الحساب الفني وحده ──
  if (p === "/api/year" && req.method === "POST") {
    if (!can(acc, "accounts:write")) return forbid("تغيير العام الدراسي من صلاحية الحساب الفني");
    const { year } = await req.json().catch(() => ({}));
    if (!/^\d{4}-\d{4}$/.test(String(year ?? ""))) {
      return J({ error: "صيغة العام الدراسي: 2026-2027" }, 400);
    }
    await setCurrentYear(String(year));
    await audit(acc.id, "تغيير العام الدراسي", String(year));
    return J({ ok: true, year: String(year) });
  }

  // ── تعديل بيانات الحساب — الحساب الفني وحده ──
  if (p === "/api/account" && req.method === "POST") {
    if (!can(acc, "accounts:write")) return forbid();
    const { id, name, title, team } = await req.json().catch(() => ({}));
    if (!id || typeof id !== "string") return J({ error: "الحساب غير محدد" }, 400);
    const cur = (await kv.get<Account>(["account", id])).value;
    if (!cur) return J({ error: "الحساب غير موجود" }, 404);
    if (team !== undefined && team !== null && team !== "" && !META.teams.includes(String(team))) {
      return J({ error: "فريق غير معروف" }, 400);
    }
    const next: Account = {
      ...cur,
      name: name === undefined ? cur.name : String(name).slice(0, 120).trim() || cur.name,
      title: title === undefined ? cur.title : String(title).slice(0, 120).trim() || cur.title,
      team: cur.role === "tech" ? null : (team === undefined ? cur.team : String(team)),
    };
    await kv.set(["account", id], next);
    await audit(acc.id, "تعديل حساب", id, `${next.name} · ${next.team ?? "بلا فريق"}`);
    return J({ ok: true });
  }

  // ── إسناد المؤسسات: تغيير المقيّم أو الفريق ──
  if (p === "/api/assign" && req.method === "POST") {
    if (!can(acc, "accounts:write")) return forbid("إسناد المؤسسات من صلاحية الحساب الفني");
    const { instId, evaluator, team } = await req.json().catch(() => ({}));
    if (!instId || typeof instId !== "string") return J({ error: "المؤسسة غير محددة" }, 400);
    const inst = (await kv.get<Inst>(["inst", instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    const nextTeam = team === undefined ? inst.team : String(team);
    if (!META.teams.includes(nextTeam)) return J({ error: "فريق غير معروف" }, 400);
    const nextEval = evaluator === undefined ? inst.evaluator : String(evaluator);
    const ev = (await kv.get<Account>(["account", nextEval])).value;
    if (!ev || ev.role !== "eval") return J({ error: "المقيّم غير موجود" }, 400);
    if (ev.team !== nextTeam) {
      return J({ error: `المقيّم ${ev.id} ليس ضمن فريق «${nextTeam}»` }, 400);
    }
    // تغيير الفريق ينقل المؤسسة لسقف وأدوات تقييم مختلفة، فتُمسح تقييماتها ومنعاً للخلط
    const teamChanged = nextTeam !== inst.team;
    const crossesStage = stageOf(nextTeam) !== stageOf(inst.team);
    if (crossesStage) {
      await kv.delete(["eval", await currentYear(), instId]);
      await delStory(instId);
    }
    await kv.set(["inst", instId], { ...inst, team: nextTeam, evaluator: nextEval });
    await audit(
      acc.id,
      "إسناد مؤسسة",
      instId,
      `${nextTeam} · ${nextEval}${crossesStage ? " · حُذف التقييم لاختلاف المرحلة" : ""}`,
    );
    return J({ ok: true, teamChanged, evalCleared: crossesStage });
  }

  return J({ error: "مسار غير معروف" }, 404);
}
