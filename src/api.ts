// واجهات البيانات — الصلاحيات مطبَّقة هنا في الخادم لا في المتصفح
import {
  type Account,
  audit,
  type CentralData,
  currentYear,
  delStory,
  type Evaluation,
  getCentral,
  getEvals,
  getPicks,
  getTransfer,
  hashPw,
  type Inst,
  kv,
  listAccounts,
  listAudit,
  listInst,
  listStories,
  listTransfers,
  listYears,
  META,
  newSalt,
  setCentral,
  setCurrentYear,
  setEval,
  setPicks,
  setStory,
  setTransfer,
  sizeOf,
  type Story,
  type Transfer,
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
  blockWhileViewing,
  can,
  cookieHeader,
  currentUser,
  forbid,
  login,
  logout,
  requireAuth,
  scope,
  setViewAs,
  sidFrom,
} from "./auth.ts";

const J = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const MAX_PICKS = 3;
/** كلمة المرور الافتراضية عند إعادة التعيين — يُلزَم صاحبها بتغييرها عند أول دخول. */
export const DEFAULT_PW = "12345678";
/**
 * نافذة الأعوام: سنتان سابقتان · الحالي · القادم، ولا تسبق بداية الخط الزمني.
 * الخط الزمني يبدأ من 2025-2026 وهو عام مؤرشف مقيَّم في الملفات المركزية.
 */
export function yearWindow(cur: string): string[] {
  const a = Number(cur.slice(0, 4));
  const start = Number(META.startYear.slice(0, 4));
  return [a - 2, a - 1, a, a + 1]
    .filter((y) => y >= start)
    .map((y) => `${y}-${y + 1}`);
}
/** العام المؤرشف: يُعرض مقيَّماً من الملفات المركزية ولا يُدخل فيه شيء. */
export function yearIsArchive(y: string): boolean {
  return y === META.archiveYear;
}
export function yearIsEditable(y: string, cur: string): boolean {
  return y === cur && !yearIsArchive(y);
}
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

  // ── معاينة حساب آخر — الحساب الفني وحده، وللقراءة فقط ──
  if (p === "/api/view-as" && req.method === "POST") {
    const sid = sidFrom(req)!;
    const { id } = await req.json().catch(() => ({}));
    if (!id) {
      await setViewAs(sid, null);
      if (acc.viewAs) await audit(acc.viewAs.by, "إنهاء معاينة حساب", acc.id);
      return J({ ok: true, viewing: null });
    }
    // الفني وحده يبدأ المعاينة؛ وأثناءها لا يبدأ معاينة أخرى إلا بعد الخروج
    const owner = acc.viewAs ? acc.viewAs.by : acc.id;
    const ownerAcc = (await kv.get<Account>(["account", owner])).value;
    if (!ownerAcc || ownerAcc.role !== "tech") {
      return forbid("معاينة الحسابات من صلاحية الحساب الفني");
    }
    const target = (await kv.get<Account>(["account", String(id)])).value;
    if (!target) return J({ error: "الحساب غير موجود" }, 404);
    if (target.id === owner) return J({ error: "لا حاجة لمعاينة حسابك" }, 400);
    await setViewAs(sid, target.id);
    await audit(owner, "بدء معاينة حساب", target.id, `${target.name} · ${target.role}`);
    return J({ ok: true, viewing: target.id });
  }
  const viewBlock = blockWhileViewing(acc, req.method);
  if (viewBlock) return viewBlock;

  // ── من أنا + البيانات المرجعية ──
  if (p === "/api/me") {
    return J({
      me: acc,
      meta: {
        teams: META.teams,
        axname: META.axname,
        rubric: META.rubric,
        year: META.year,
        appName: META.appName,
        appNameShort: META.appNameShort,
        version: META.version,
        defaultPw: can(acc, "accounts:write") ? DEFAULT_PW : undefined,
        released: META.released,
        maxPicks: MAX_PICKS,
        topN: TOP_N,
        currentYear: await currentYear(),
        years: await listYears(),
        yearWindow: yearWindow(await currentYear()),
        startYear: META.startYear,
        yearColors: META.yearColors,
        yearColorFallback: META.yearColorFallback,
        archiveYear: META.archiveYear,
        teamMeta: META.teamMeta,
        sizeRule: META.sizeRule,
        centralFields: META.centralFields,
        denomMap: META.denomMap,
      },
      // ترتيب الشاشات: تبدأ بالشاشة الأساسية لكل دور
      perms: ({
        eval: ["mine", "central", "stats", "transfers"],
        lead: ["team", "mine", "central", "assign", "stats", "top", "transfers", "reports"],
        tech: ["tech", "team", "central", "assign", "stats", "top", "transfers", "reports"],
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
    const central = await getCentral(year);
    const cur = await currentYear();
    const rows = inst.filter((i) => inScope(i.team, i.evaluator)).map((i) => {
      const e = evals[i.id];
      const c = central[i.id];
      const sc = scoreInst(i.team, i, e?.kpi ?? {}, ovOf(i.team), c);
      const students = c?.students ?? null;
      const arch = yearIsArchive(year) && e?.archived ? e : null;
      if (arch) {
        // العام المؤرشف يُعرض بنتيجة الملفات المركزية ولا يُحسب بالمنهجية الخطية
        return {
          ...i,
          central: c ?? { students: null, teachers: null, subjects: null },
          students: i.students,
          teamNo: META.teamMeta[i.team]?.no ?? null,
          teamCode: META.teamMeta[i.team]?.code ?? null,
          kpi: {},
          kpiPct: {},
          axes: arch.axes,
          axPts: arch.axes,
          pts: null,
          filled: 0,
          totalKpi: 0,
          status: arch.status,
          notes: "",
          pct: arch.pct ?? null,
          level: arch.level ?? null,
          basis: arch.basis ?? "لوغاريتمية",
          archived: true,
          cap: capOf(i.team),
          axw: axw(i.team),
        };
      }
      return {
        ...i,
        central: c ?? { students: null, teachers: null, subjects: null },
        students: students ?? i.students,
        size: students === null ? i.size : sizeOf(i.team, students),
        teamNo: META.teamMeta[i.team]?.no ?? null,
        teamCode: META.teamMeta[i.team]?.code ?? null,
        kpi: e?.kpi ?? {},
        kpiPct: sc.kpiPct,
        axes: sc.axes,
        axPts: sc.axPts,
        pts: sc.pts,
        filled: sc.filled,
        totalKpi: sc.total,
        status: e?.status ?? "لم يبدأ",
        notes: e?.notes ?? "",
        story: e?.story ?? { on: false, text: "" },
        notedKpis: Object.values(e?.kpi ?? {}).filter((c) => c.note).length,
        pct: sc.pct,
        level: sc.pct === null ? null : lvlOf(sc.pct).n,
        cap: capOf(i.team),
        axw: axw(i.team),
      };
    });
    return J({
      year,
      editable: yearIsEditable(year, cur),
      archived: yearIsArchive(year),
      currentYear: cur,
      rows,
    });
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
    const c = (await getCentral(await currentYear()))[id];
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
      centralField: k.denom ? META.denomMap[k.denom] ?? null : null,
      centralValue: k.denom && META.denomMap[k.denom]
        ? ((c ?? {}) as unknown as Record<string, number | null>)[META.denomMap[k.denom]] ?? null
        : null,
    }));
    return J({
      stage: st,
      cap: capOf(i.team),
      axw: axw(i.team),
      states: META.states,
      topStage: topStage(i),
      central: c ?? { students: null, teachers: null, subjects: null },
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
    if (!inScope(inst.team, inst.evaluator)) {
      return forbid(
        acc.role === "lead" ? "هذه المؤسسة خارج فريقك" : "هذه المؤسسة ليست ضمن مؤسساتك",
      );
    }
    if (body.year !== undefined && String(body.year) !== await currentYear()) {
      return forbid("الإدخال متاح في العام الجاري فقط");
    }
    const ks = kpisOf(inst.team) as Kpi[];
    const kpi: Record<string, { i?: string; j?: string; m?: string }> = {};
    for (const k of ks) {
      const r = body.kpi?.[String(k.n)];
      if (!r) continue;
      const cell: { i?: string; j?: string; m?: string; note?: string } = {};
      const note = String(r.note ?? "").trim();
      if (note) {
        if (note.length > 1000) return J({ error: `ملاحظة المؤشر ${k.n} أطول من 1000 حرف` }, 400);
        cell.note = note.slice(0, 1000);
      }
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
    const yr = await currentYear();
    const sc = scoreInst(inst.team, inst, kpi, ov, (await getCentral(yr))[body.instId]);
    const ev: Evaluation = {
      instId: body.instId,
      year: yr,
      kpi,
      axes: sc.axes,
      filled: sc.filled,
      status: sc.filled === sc.total ? "مكتمل" : (sc.filled ? "قيد التقييم" : "لم يبدأ"),
      notes: String(body.notes ?? "").slice(0, 4000),
      story: {
        on: !!body.story?.on,
        text: String(body.story?.text ?? "").slice(0, 3000),
      },
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
        const e = evals[i.id];
        if (e?.archived) return { ...i, axes: null, pct: null, status: "لم يبدأ", nominated: false };
        const axes = e?.axes ?? null;
        return {
          ...i,
          axes,
          pct: pctOf(i.team, axes),
          status: e?.status ?? "لم يبدأ",
          nominated: !!e?.story?.on,
          nomination: e?.story?.text ?? "",
          nominatedBy: e?.story?.on ? e?.by ?? "" : "",
        };
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

  // ── إعادة تعيين جماعية: حسابات مختارة أو الكل ──
  if (p === "/api/reset-passwords" && req.method === "POST") {
    if (!can(acc, "accounts:write")) return forbid();
    const body = await req.json().catch(() => ({}));
    const pw = String(body.password ?? DEFAULT_PW);
    if (pw.length < 8) return J({ error: "كلمة مرور 8 محارف فأكثر" }, 400);
    const all = await listAccounts();
    let targets = all;
    if (!body.all) {
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length) return J({ error: "لم تُحدَّد حسابات" }, 400);
      const known = new Set(all.map((a) => a.id));
      const bad = ids.filter((i) => !known.has(i));
      if (bad.length) return J({ error: `حسابات غير موجودة: ${bad.join(" · ")}` }, 404);
      targets = all.filter((a) => ids.includes(a.id));
    }
    // الحساب الفني لا يعيد ضبط كلمة مروره ضمن دفعة، حتى لا يقفل نفسه خارج المنصة
    const skipped = targets.filter((a) => a.id === acc.id).map((a) => a.id);
    targets = targets.filter((a) => a.id !== acc.id);
    for (const a of targets) {
      const cur = (await kv.get(["account", a.id])).value as object | null;
      if (!cur) continue;
      const salt = newSalt();
      await kv.set(["account", a.id], {
        ...cur,
        salt,
        hash: await hashPw(pw, salt),
        mustChange: true,
      });
      // إنهاء جلسات الحساب حتى لا تبقى جلسة مفتوحة بكلمة مرور ملغاة
      for await (const e of kv.list<{ id: string }>({ prefix: ["session"] })) {
        if (e.value.id === a.id) await kv.delete(e.key);
      }
    }
    await audit(
      acc.id,
      "إعادة تعيين جماعية",
      body.all ? "كل الحسابات" : `${targets.length} حساباً`,
      `${targets.length} حساباً · افتراضية: ${pw === DEFAULT_PW ? "نعم" : "لا"}`,
    );
    return J({ ok: true, count: targets.length, skipped, isDefault: pw === DEFAULT_PW });
  }

  // ── البيانات المركزية للمؤسسة: الطلبة والمعلمون والمواد ──
  if (p === "/api/central" && req.method === "GET") {
    const year = url.searchParams.get("year") || await currentYear();
    const [inst, central] = await Promise.all([listInst(), getCentral(year)]);
    const rows = inst.filter((i) => inScope(i.team, i.evaluator)).map((i) => {
      const c = central[i.id] ?? { students: null, teachers: null, subjects: null };
      return {
        id: i.id,
        name: i.name,
        team: i.team,
        teamNo: META.teamMeta[i.team]?.no ?? null,
        stage: i.stage,
        ...c,
        size: sizeOf(i.team, c.students),
        sizeSource: i.size,
        prevStudents: i.students,
      };
    });
    return J({ year, editable: yearIsEditable(year, await currentYear()), rows });
  }
  if (p === "/api/central" && req.method === "POST") {
    if (!can(acc, "central:write")) return forbid("إدخال البيانات المركزية خارج صلاحيتك");
    const body = await req.json().catch(() => ({}));
    const year = String(body.year || await currentYear());
    if (!yearIsEditable(year, await currentYear())) {
      return forbid(`البيانات المركزية تُدخل للعام الجاري وحده — ${year} مغلق`);
    }
    const items = Array.isArray(body.rows) ? body.rows : [];
    let n = 0;
    for (const r of items) {
      const inst = (await kv.get<Inst>(["inst", String(r.id)])).value;
      if (!inst) return J({ error: `المؤسسة ${r.id} غير موجودة` }, 404);
      if (!inScope(inst.team, inst.evaluator)) {
        return forbid(`المؤسسة ${r.id} خارج نطاقك`);
      }
      const c: CentralData = { students: null, teachers: null, subjects: null };
      for (const f of ["students", "teachers", "subjects"] as const) {
        const v = r[f];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        const num = Number(v);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          return J({ error: `قيمة غير صالحة في ${r.id}` }, 400);
        }
        c[f] = num;
      }
      await setCentral(year, String(r.id), c);
      n++;
    }
    await audit(acc.id, "تحديث البيانات المركزية", year, `${n} مؤسسة`);
    return J({ ok: true, count: n });
  }

  // ── طلبات نقل المؤسسات بين المقيّمين داخل الفريق ──
  if (p === "/api/transfers" && req.method === "GET") {
    const all = await listTransfers();
    const rows = acc.role === "tech"
      ? all
      : acc.role === "lead"
      ? all.filter((t) => t.team === acc.team)
      : all.filter((t) => t.by === acc.id || t.fromEval === acc.id || t.toEval === acc.id);
    return J({ rows });
  }
  if (p === "/api/transfers" && req.method === "POST") {
    const { instId, toEval, reason } = await req.json().catch(() => ({}));
    if (!instId || typeof instId !== "string") return J({ error: "المؤسسة غير محددة" }, 400);
    const inst = (await kv.get<Inst>(["inst", instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    if (!inScope(inst.team, inst.evaluator)) return forbid("هذه المؤسسة خارج نطاقك");
    const to = (await kv.get<Account>(["account", String(toEval)])).value;
    if (!to || to.role !== "eval") return J({ error: "المقيّم المطلوب غير موجود" }, 400);
    if (to.team !== inst.team) {
      return J({ error: "النقل متاح داخل الفريق نفسه فقط" }, 400);
    }
    if (to.id === inst.evaluator) return J({ error: "المؤسسة مسندة إليه أصلاً" }, 400);
    const open = (await listTransfers()).find((t) => t.instId === instId && t.status === "معلّق");
    if (open) return J({ error: "يوجد طلب معلّق لهذه المؤسسة" }, 400);
    const t: Transfer = {
      id: crypto.randomUUID(),
      instId,
      instName: inst.name,
      team: inst.team,
      fromEval: inst.evaluator,
      toEval: to.id,
      reason: String(reason ?? "").slice(0, 500),
      by: acc.id,
      at: new Date().toISOString(),
      status: "معلّق",
    };
    await setTransfer(t);
    await audit(acc.id, "طلب نقل مؤسسة", instId, `${t.fromEval} ← ${t.toEval}`);
    return J({ ok: true, id: t.id });
  }
  if (p === "/api/transfer-decide" && req.method === "POST") {
    const { id, approve, note } = await req.json().catch(() => ({}));
    const t = await getTransfer(String(id ?? ""));
    if (!t) return J({ error: "الطلب غير موجود" }, 404);
    // القرار لرئيس الفريق صاحب الفريق أو للحساب الفني
    const allowed = acc.role === "tech" || (acc.role === "lead" && acc.team === t.team);
    if (!allowed) return forbid("البتّ في طلبات النقل من صلاحية رئيس الفريق أو الحساب الفني");
    if (t.status !== "معلّق") return J({ error: "الطلب مبتوت فيه سابقاً" }, 400);
    t.status = approve ? "معتمد" : "مرفوض";
    t.decidedBy = acc.id;
    t.decidedAt = new Date().toISOString();
    t.note = String(note ?? "").slice(0, 500);
    if (approve) {
      const inst = (await kv.get<Inst>(["inst", t.instId])).value;
      if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
      await kv.set(["inst", t.instId], { ...inst, evaluator: t.toEval });
    }
    await setTransfer(t);
    await audit(acc.id, approve ? "اعتماد نقل" : "رفض نقل", t.instId, `${t.fromEval} ← ${t.toEval}`);
    return J({ ok: true, status: t.status });
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
      if (!ev || ev.archived || ev.status !== "مكتمل") continue;
      const sc = scoreInst(i.team, i, ev.kpi, ov);
      if (sc.pct === null) continue;
      cycles.push({
        year: y,
        pct: sc.pct,
        pts: sc.pts,
        axes: sc.axes,
        level: lvlOf(sc.pct).n,
        basis: "خطية",
        archived: false,
      });
    }
    const archEv = (await kv.get<Evaluation>(["eval", META.archiveYear, id])).value;
    if (archEv?.archived) {
      cycles.push({
        year: archEv.year,
        pct: archEv.pct ?? 0,
        pts: i.prev?.pts ?? 0,
        axes: archEv.axes,
        level: archEv.level ?? "—",
        basis: archEv.basis ?? "لوغاريتمية",
        archived: true,
      });
    }
    cycles.sort((a, b) => b.year.localeCompare(a.year));
    // الأداء التراكمي: متوسط آخر ثلاث دورات مكتملة على المنهجية الخطية وحدها.
    const linear = cycles.filter((c) => !("archived" in c) || !c.archived);
    const last3 = linear.slice(0, 3);
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
    if (yearIsArchive(String(year))) {
      return J({ error: `${year} عام مؤرشف بتقييم سابق، لا يُفتح للإدخال` }, 400);
    }
    if (String(year) < META.startYear) {
      return J({ error: `الخط الزمني يبدأ من ${META.startYear}` }, 400);
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

  // ── مقيّمو الفريق: قائمة خفيفة لا تكشف بيانات الحسابات ──
  if (p === "/api/evaluators") {
    if (!can(acc, "assign")) return forbid();
    const team = acc.role === "lead" ? acc.team : (url.searchParams.get("team") ?? "");
    const rows = (await listAccounts())
      .filter((a) => a.role === "eval" && (!team || a.team === team))
      .map((a) => ({ id: a.id, name: a.name, team: a.team }));
    return J({ team, rows });
  }

  // ── توزيع جماعي: دفعة تغييرات من شاشة التوزيع ──
  if (p === "/api/assign-bulk" && req.method === "POST") {
    if (!can(acc, "assign:write")) return forbid("توزيع المؤسسات خارج صلاحيتك");
    const body = await req.json().catch(() => ({}));
    const items: { instId: string; evaluator: string }[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return J({ error: "لا تغييرات لحفظها" }, 400);
    if (items.length > 400) return J({ error: "دفعة أكبر من المسموح" }, 400);
    // تحقّق كامل قبل أي كتابة، حتى لا تُحفظ دفعة نصف صحيحة
    const plan: { inst: Inst; to: string }[] = [];
    for (const it of items) {
      const inst = (await kv.get<Inst>(["inst", String(it.instId)])).value;
      if (!inst) return J({ error: `المؤسسة ${it.instId} غير موجودة` }, 404);
      if (!inScope(inst.team, inst.evaluator)) return forbid(`المؤسسة ${it.instId} خارج نطاقك`);
      if (acc.role === "lead" && inst.team !== acc.team) {
        return forbid(`المؤسسة ${it.instId} خارج فريقك`);
      }
      const ev = (await kv.get<Account>(["account", String(it.evaluator)])).value;
      if (!ev || ev.role !== "eval") return J({ error: `المقيّم ${it.evaluator} غير موجود` }, 400);
      if (ev.team !== inst.team) {
        return J({ error: `المقيّم ${ev.id} ليس ضمن فريق «${inst.team}»` }, 400);
      }
      if (ev.id !== inst.evaluator) plan.push({ inst, to: ev.id });
    }
    for (const { inst, to } of plan) {
      await kv.set(["inst", inst.id], { ...inst, evaluator: to });
    }
    await audit(acc.id, "توزيع المؤسسات", plan[0]?.inst.team ?? "", `${plan.length} مؤسسة`);
    return J({ ok: true, count: plan.length });
  }

  // ── تغيير اسم المستخدم (معرّف الدخول) ──
  if (p === "/api/account-rename" && req.method === "POST") {
    if (!can(acc, "accounts:write")) return forbid("تغيير اسم المستخدم من صلاحية الحساب الفني");
    const { id, newId } = await req.json().catch(() => ({}));
    const from = String(id ?? "").trim(), to = String(newId ?? "").trim();
    if (!/^[A-Za-z0-9._-]{2,24}$/.test(to)) {
      return J({ error: "اسم المستخدم: حرفان إلى 24، حروف لاتينية وأرقام و . _ - فقط" }, 400);
    }
    if (from === to) return J({ error: "الاسم الجديد مطابق للحالي" }, 400);
    const cur = (await kv.get<Account>(["account", from])).value;
    if (!cur) return J({ error: "الحساب غير موجود" }, 404);
    if ((await kv.get<Account>(["account", to])).value) {
      return J({ error: `اسم المستخدم ${to} مستخدم بالفعل` }, 400);
    }
    await kv.set(["account", to], { ...cur, id: to });
    await kv.delete(["account", from]);
    // نقل إسناد المؤسسات وطلبات النقل المعلّقة إلى المعرّف الجديد
    let moved = 0;
    for (const i of await listInst()) {
      if (i.evaluator === from) {
        await kv.set(["inst", i.id], { ...i, evaluator: to });
        moved++;
      }
    }
    for (const t of await listTransfers()) {
      if (t.status !== "معلّق") continue;
      if (t.fromEval === from || t.toEval === from) {
        await setTransfer({
          ...t,
          fromEval: t.fromEval === from ? to : t.fromEval,
          toEval: t.toEval === from ? to : t.toEval,
        });
      }
    }
    // إبطال جلسات الحساب القديم حتى يدخل بالاسم الجديد
    for await (const e of kv.list<{ id: string }>({ prefix: ["session"] })) {
      if (e.value.id === from) await kv.delete(e.key);
    }
    await audit(acc.id, "تغيير اسم المستخدم", from, `← ${to} · ${moved} مؤسسة`);
    return J({ ok: true, id: to, moved });
  }

  // ── إسناد المؤسسات: تغيير المقيّم أو الفريق ──
  if (p === "/api/assign" && req.method === "POST") {
    if (!can(acc, "assign:write")) return forbid("توزيع المؤسسات خارج صلاحيتك");
    const { instId, evaluator, team } = await req.json().catch(() => ({}));
    if (!instId || typeof instId !== "string") return J({ error: "المؤسسة غير محددة" }, 400);
    const inst = (await kv.get<Inst>(["inst", instId])).value;
    if (!inst) return J({ error: "المؤسسة غير موجودة" }, 404);
    const nextTeam = team === undefined ? inst.team : String(team);
    if (!META.teams.includes(nextTeam)) return J({ error: "فريق غير معروف" }, 400);
    // رئيس الفريق يوزّع داخل فريقه فقط ولا ينقل مؤسسة بين الفرق
    if (acc.role === "lead" && (inst.team !== acc.team || nextTeam !== acc.team)) {
      return forbid("توزيع المؤسسات داخل فريقك فقط");
    }
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
