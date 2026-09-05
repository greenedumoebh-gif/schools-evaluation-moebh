// طبقة الحساب — تُنفَّذ في الخادم وحده. الواجهة تعرض ولا تحسب.
// المعادلة مطابقة لقسم «تجربة التقييم» في لوحة إعادة تنظيم التقييم.
import { type CentralData, kv, META } from "./db.ts";

export interface Kpi {
  n: number;
  ax: number;
  kpi: string;
  crit: string;
  tools: string;
  mode: "نسبة" | "عدد" | "وصفي";
  mech: string;
  denom: string | null;
  numer: string;
  tgt: number | null;
  sec: number | null;
  secd: string | null;
  prop: number | null;
  why: string;
  w: number;
}

/** المدخلات الخام لمؤشر واحد: i = المقام · j = البسط أو القيمة أو حالة التنفيذ · m = القيمة الثانوية */
export interface Raw {
  i?: string;
  j?: string;
  m?: string;
}

export type Stage = "school" | "kg";
export const KG_TEAM = "رياض الأطفال";

export function stageOf(team: string): Stage {
  return team === KG_TEAM ? "kg" : "school";
}
export function kpisOf(team: string): Kpi[] {
  return META.kpi[stageOf(team)];
}
export function capOfStage(st: Stage): number {
  return META.cap[st];
}
export function axwOfStage(st: Stage): Record<string, number> {
  return META.axw[st];
}

/**
 * المستهدف الأساسي من الخطة قبل أي ضبط.
 * المؤشر 20 في النظامي بلا رقم ثابت: 4 للابتدائي و8 لما عداه (الإعدادي والثانوي).
 * المراحل غير المصنّفة تأخذ 8 وتُعلَّم في المخرجات لتراجعها اللجنة.
 */
/**
 * المرحلة العليا للمؤسسة: القاعدة المعتمدة هي أعلى مرحلة ترد في نص المرحلة.
 * «ابتدائي - إعدادي» ← إعدادي · «إعدادي - ثانوي» ← ثانوي · «ابتدائي (معهد ديني)» ← ابتدائي.
 * تُعاد null إذا خلا النص من أي مرحلة معروفة (مثل «معهد ديني» وحدها، أو مرحلة غير مسجَّلة).
 */
export type Level = "ابتدائي" | "إعدادي" | "ثانوي";
/** المؤسسة من منظور المرحلة: نص الملف المركزي، وقرار الفريق إن وُجد. */
export interface StageRef {
  stage: string | null;
  /** قرار صريح من الفريق يعلو على النص، لمؤسسة لا يذكر نصها أي مستوى. */
  stageTop?: string | null;
}
export function topStage(ref: StageRef): Level | null {
  const o = ref.stageTop;
  if (o === "ابتدائي" || o === "إعدادي" || o === "ثانوي") return o;
  const t = ref.stage ?? "";
  if (t.includes("ثانوي")) return "ثانوي";
  if (t.includes("إعدادي")) return "إعدادي";
  if (t.includes("ابتدائي")) return "ابتدائي";
  return null;
}

export function baseTarget(k: Kpi, team: string, ref: StageRef): number {
  if (k.mode === "وصفي") return 100;
  if (stageOf(team) === "school" && k.n === META.stageKpi.school) {
    // حاشية الخطة: 4 للابتدائي · 8 للإعدادي والثانوي، وتُطبَّق على المرحلة العليا للمؤسسة.
    return topStage(ref) === "ابتدائي" ? 4 : 8;
  }
  return Number(k.tgt ?? 0);
}
/** المستهدف مفترض فقط إذا خلت المرحلة من أي مستوى معروف فتعذّر تطبيق قاعدة المرحلة العليا. */
export function targetIsAssumed(k: Kpi, team: string, ref: StageRef): boolean {
  return stageOf(team) === "school" && k.n === META.stageKpi.school && topStage(ref) === null;
}

// ── تعديلات الحساب الفني على المؤشرات ──
/** t المستهدف · s المستهدف الثانوي · والباقي تعديل نصي على تعريف المؤشر. */
export interface KpiOverride {
  t?: number;
  s?: number;
  kpi?: string;
  crit?: string;
  tools?: string;
  mech?: string;
  denom?: string;
  numer?: string;
}
export type Targets = Record<string, KpiOverride>;
/** الحقول النصية القابلة للتعديل — مصدرها الوحيد هذه القائمة. */
export const TEXT_FIELDS = ["kpi", "crit", "tools", "mech", "denom", "numer"] as const;

export async function getTargets(st: Stage): Promise<Targets> {
  return (await kv.get<Targets>(["kpiov", st])).value ?? {};
}
export async function setTargets(st: Stage, t: Targets) {
  await kv.set(["kpiov", st], t);
}
/** المؤشر بعد تطبيق تعديلات الحساب الفني النصية. */
export function applyText(k: Kpi, ov: Targets): Kpi {
  const o = ov[String(k.n)];
  if (!o) return k;
  const out = { ...k };
  for (const f of TEXT_FIELDS) {
    const v = o[f];
    if (typeof v === "string" && v.trim() !== "") (out as Record<string, unknown>)[f] = v;
  }
  return out;
}

export function effTarget(k: Kpi, team: string, ref: StageRef, ov: Targets): number {
  if (k.mode === "وصفي") return 100;
  const o = ov[String(k.n)]?.t;
  return o === undefined || o === null ? baseTarget(k, team, ref) : Number(o);
}
export function effSecTarget(k: Kpi, ov: Targets): number | null {
  if (k.sec === null || k.sec === undefined) return null;
  const o = ov[String(k.n)]?.s;
  return o === undefined || o === null ? Number(k.sec) : Number(o);
}

/** المقام المسحوب مركزياً لهذا المؤشر، أو null إذا كان يُدخَل يدوياً. */
export function centralDenom(k: Kpi, c: CentralData | undefined): number | null {
  const f = k.denom ? META.denomMap[k.denom] : undefined;
  if (!f || !c) return null;
  const v = (c as unknown as Record<string, number | null>)[f];
  return v === null || v === undefined ? null : Number(v);
}

/** نسبة تنفيذ مؤشر واحد، أو null إذا لم يُملأ. الحد الأعلى 100%. */
export function rowPct(
  k: Kpi,
  raw: Raw | undefined,
  tgt: number,
  sec2: number | null,
  central?: CentralData,
): number | null {
  const jv = raw?.j;
  if (jv === undefined || jv === null || jv === "") return null;
  if (!tgt) return null;
  let K: number;
  if (k.mode === "نسبة" && k.denom) {
    const cd = centralDenom(k, central);
    const iv = cd !== null ? String(cd) : raw?.i;
    if (iv === undefined || iv === null || iv === "" || Number(iv) === 0) return null;
    K = Number(jv) / Number(iv) * 100;
  } else {
    K = Number(jv);
  }
  if (!isFinite(K)) return null;
  let P = Math.min(100, K / tgt * 100);
  if (sec2 !== null) {
    const mv = raw?.m;
    const s2 = (mv === undefined || mv === "" || !isFinite(Number(mv)))
      ? 0
      : Math.min(100, Number(mv) / sec2 * 100);
    P = (P + s2) / 2;
  }
  return Math.round(Math.max(0, P) * 10) / 10;
}

export interface Score {
  kpiPct: Record<string, number | null>;
  axes: Record<string, number | null>;
  axPts: Record<string, number>;
  pts: number;
  pct: number | null;
  filled: number;
  total: number;
}

/** حساب مؤسسة كاملة. المؤشر غير المملوء يُحسب صفراً في النقاط ويُعدّ ناقصاً في الاكتمال. */
export function scoreInst(
  team: string,
  ref: StageRef,
  kpiRaw: Record<string, Raw>,
  ov: Targets,
  central?: CentralData,
): Score {
  const st = stageOf(team);
  const ks = kpisOf(team);
  const axw = axwOfStage(st);
  const axPts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
  const kpiPct: Record<string, number | null> = {};
  let pts = 0, filled = 0;
  for (const k of ks) {
    const P = rowPct(
      k,
      kpiRaw[String(k.n)],
      effTarget(k, team, ref, ov),
      effSecTarget(k, ov),
      central,
    );
    kpiPct[String(k.n)] = P;
    if (P === null) continue;
    filled++;
    const p = k.w * P / 100;
    pts += p;
    axPts[String(k.ax)] += p;
  }
  const complete = filled === ks.length;
  const axes: Record<string, number | null> = {};
  for (const a of ["1", "2", "3", "4"]) {
    axes[a] = complete ? Math.round(axPts[a] / axw[a] * 1000) / 10 : null;
  }
  return {
    kpiPct,
    axes,
    axPts,
    pts: Math.round(pts * 10) / 10,
    pct: complete ? Math.round(pts / capOfStage(st) * 1000) / 10 : null,
    filled,
    total: ks.length,
  };
}
