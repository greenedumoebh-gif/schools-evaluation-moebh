// واجهة منصة تقييم التعليم الأخضر
const $ = (s) => document.querySelector(s);
const AXC = { 1: "#1E7145", 2: "#2C6FB5", 3: "#BA7517", 4: "#0F6E56" };
const SC = { "مكتمل": "#1E7145", "قيد التقييم": "#BA7517", "لم يبدأ": "#C0392B" };
const SECS = {
  mine: ["مؤسساتي", "المؤسسات المسندة إليك وحالة تقييمها", "▤"],
  team: ["لوحة الفريق", "نسب الإنجاز لكل مقيّم", "◧"],
  stats: ["الإحصاءات", "حسب المرحلة والجنس ونسب التقدم", "📊"],
  top: ["أعلى 10 وقصص النجاح", "اختيار 3 مؤسسات للكتابة عنها", "★"],
  reports: ["التقارير", "ملخص الفريق والتصدير", "▦"],
  tech: ["الحساب الفني", "الحسابات والصلاحيات وسجل التدقيق", "⚙"],
};
let ME = null, META = null, PERMS = [], SEC = null, ROWS = [], TOP = null;
let TGT = null, TGSTAGE = "school";
const TGDEFS = {};

const fmt = (n, d = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
function lvlColor(n) {
  const i = META.rubric.findIndex((b) => b.n === n);
  return ["#C0392B", "#d98324", "#7aa63f", "#1E7145"][i] ?? "#5f6b64";
}
function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "تعذّر تنفيذ الطلب");
  return j;
}

/* ── الدخول ── */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#lerr").textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: { id: $("#uid").value.trim(), password: $("#pwd").value },
    });
    await boot();
  } catch (err) {
    $("#lerr").textContent = err.message;
  }
});
async function signout() {
  await api("/api/logout", { method: "POST" });
  location.reload();
}

async function boot() {
  const me = await api("/api/me");
  ME = me.me;
  META = me.meta;
  PERMS = me.perms;
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#brandSub").textContent = `${META.year} · ${META.teams.length} فرق`;
  $("#who").innerHTML = `<div class="n">${esc(ME.name)}</div><div class="r">${esc(ME.title)}${
    ME.team ? " · " + esc(ME.team) : ""
  }</div><button id="soBtn">تسجيل الخروج</button>`;
  $("#soBtn").onclick = signout;
  SEC = PERMS[0];
  buildNav();
  if (ME.mustChange) setTimeout(() => openPw(true), 400);
  await render();
}
function buildNav() {
  $("#nav").innerHTML = PERMS.map((k) =>
    `<a data-s="${k}" class="${k === SEC ? "active" : ""}">
      <span class="ico">${SECS[k][2]}</span>${SECS[k][0]}</a>`
  ).join("");
  document.querySelectorAll("#nav a").forEach((a) =>
    a.onclick = async () => {
      SEC = a.dataset.s;
      buildNav();
      $("#sb").classList.remove("open");
      scrollTo(0, 0);
      await render();
    }
  );
}
$("#mbtn").onclick = () => $("#sb").classList.toggle("open");

/* ── التحميل والرسم ── */
async function render() {
  $("#tt").textContent = SECS[SEC][0];
  $("#ts").textContent = SECS[SEC][1] + " · " + ME.name;
  $("#content").innerHTML =
    `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
  try {
    if (["mine", "team", "stats", "reports"].includes(SEC)) ROWS = (await api("/api/institutions")).rows;
    if (SEC === "top") TOP = await api("/api/top");
    const R = { mine: rMine, team: rTeam, stats: rStats, top: rTop, reports: rReports, tech: rTech };
    $("#content").innerHTML = await R[SEC]();
    wire();
  } catch (e) {
    $("#content").innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
  }
}
const done = (l) => l.filter((x) => x.status === "مكتمل");
const avgOf = (l) => l.length ? l.reduce((s, x) => s + x.pct, 0) / l.length : 0;

/* ── مؤسساتي ── */
function rMine() {
  const d = done(ROWS);
  return `<h3 class="st">مؤسساتي</h3>
  <p class="sl">${esc(ME.name)} · ${esc(ME.team ?? "")} — ${ROWS.length} مؤسسة مسندة إليك.</p>
  <div class="kpis">
   <div class="kpi"><div class="lbl">مؤسسة مسندة</div><div class="val">${ROWS.length}</div></div>
   <div class="kpi"><div class="lbl">مكتملة</div><div class="val">${d.length}</div></div>
   <div class="kpi amber"><div class="lbl">قيد التقييم</div><div class="val">${
    ROWS.filter((x) => x.status === "قيد التقييم").length
  }</div></div>
   <div class="kpi red"><div class="lbl">لم تبدأ</div><div class="val">${
    ROWS.filter((x) => x.status === "لم يبدأ").length
  }</div></div>
   <div class="kpi blue"><div class="lbl">نسبة الإنجاز</div><div class="val">${
    ROWS.length ? (d.length / ROWS.length * 100).toFixed(0) : 0
  }<small>%</small></div></div>
   <div class="kpi"><div class="lbl">متوسط النتيجة</div><div class="val">${
    d.length ? avgOf(d).toFixed(1) + "%" : "—"
  }</div></div>
  </div>
  <div class="tbl"><table><thead><tr><th style="width:78px">الرمز</th><th>المؤسسة</th>
   <th style="width:120px">المرحلة</th><th style="width:70px">الجنس</th><th style="width:62px">الطلبة</th>
   <th style="width:110px">التصنيف</th>
   <th style="width:105px">الحالة</th><th style="width:72px">النتيجة</th><th style="width:115px">التقدير</th>
   <th style="width:80px"></th></tr></thead><tbody>` +
    ROWS.map((x) =>
      `<tr><td class="mono">${x.id}</td><td class="r">${esc(x.name)}</td>
      <td>${esc(x.stage ?? "غير مسجَّل")}</td><td>${esc(x.gender ?? "غير مسجَّل")}</td>
      <td>${x.students ?? "—"}</td><td>${esc(x.size ?? "—")}</td>
      <td><span class="pill" style="background:${SC[x.status]}22;color:${
        SC[x.status]
      }">${x.status}</span></td>
      <td><b>${x.pct !== null ? x.pct + "%" : "—"}</b></td>
      <td>${
        x.level
          ? `<span class="pill" style="background:${lvlColor(x.level)};color:#fff">${x.level}</span>`
          : "—"
      }</td>
      <td><button class="btn sm" data-open="${x.id}">تقييم</button></td></tr>`
    ).join("") +
    `</tbody></table></div>`;
}

/* ── شاشة إدخال التقييم — المؤشرات التفصيلية ── */
const MODEP = { "نسبة": "blue", "عدد": "amber", "وصفي": "purple" };
let EV = null; // { inst, defs, raw }

async function openEval(id) {
  const x = ROWS.find((r) => r.id === id);
  $("#modalBody").innerHTML =
    `<div class="mbody" style="text-align:center;color:var(--muted)">جارٍ تحميل المؤشرات…</div>`;
  $("#modal").classList.add("on");
  let K;
  try {
    K = await api("/api/kpis?inst=" + encodeURIComponent(id));
  } catch (e) {
    $("#modalBody").innerHTML = `<div class="mbody"><div class="tip red">${esc(e.message)}</div></div>`;
    return;
  }
  EV = { inst: x, defs: K, raw: JSON.parse(JSON.stringify(x.kpi || {})) };
  const assumed = K.kpis.filter((k) => k.assumed).map((k) => k.n);
  const tuned = K.kpis.filter((k) => k.tgtEff !== k.tgtBase).map((k) => k.n);

  let h = `<div class="mhead"><div>
     <div style="font-size:12px;opacity:.85">${x.id} · ${esc(x.team)} · ${esc(x.stage ?? "مرحلة غير مسجَّلة")}${
    x.stageTop ? " ← " + esc(x.stageTop) : ""
  } · ${esc(x.gender ?? "جنس غير مسجَّل")}${x.size ? " · " + esc(x.size) : ""}</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">${esc(x.name)}</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <div class="tip">أدخل الأرقام الخام لكل مؤشر كما هي من أدوات القياس. نسبة التنفيذ تُحسب في الخادم
       ولها حد أعلى 100%، والتقدير يظهر بعد استكمال المؤشرات الـ${K.kpis.length} كلها.</div>`;
  if (tuned.length) {
    h += `<div class="tip amber">مستهدفات مضبوطة من الحساب الفني في ${tuned.length} مؤشراً
      (${tuned.join(" · ")}). المستهدف الأصلي من الخطة يظهر تحت كل خانة.</div>`;
  }
  if (assumed.length) {
    h += `<div class="tip red">المؤشر ${
      assumed.join(" · ")
    } مستهدفه يتبع المرحلة الدراسية، ومرحلة هذه المؤسسة «${
      esc(x.stage ?? "مرحلة غير مسجَّلة")
    }» لا تحسمها الخطة. طُبِّق مستهدف الإعدادي والثانوي مؤقتاً ويحتاج قراراً من الفريق.</div>`;
  }

  [1, 2, 3, 4].forEach((a) => {
    const rows = K.kpis.filter((k) => k.ax === a);
    if (!rows.length) return;
    h += `<div class="axbox"><div class="axhead" style="background:${AXC[a]}">
      <span>${esc(META.axname[a])}</span><span class="axbadge" id="axb${a}">—</span></div>`;
    rows.forEach((k) => {
      h += `<div class="frow"><div class="ftop"><div class="fnum">${k.n}</div>
        <div class="ftxt">${esc(k.kpi)}
        <div style="font-weight:400;font-size:11px;color:var(--muted);margin-top:3px">
          <span class="pill ${MODEP[k.mode]}">${k.mode}</span> &nbsp;${esc(k.mech)}</div></div></div>
        <div class="finputs">`;
      const g = (f) => {
        const v = EV.raw[k.n]?.[f];
        return v === undefined || v === null ? "" : esc(v);
      };
      if (k.mode === "وصفي") {
        h += `<div class="fld"><label>حالة التنفيذ</label>
          <select data-k="${k.n}" data-f="j"><option value="">—</option>` +
          K.states.map((s) =>
            `<option value="${s.v}" ${
              String(g("j")) === String(s.v) ? "selected" : ""
            }>${s.v} — ${s.name}</option>`
          ).join("") + `</select></div>`;
      } else {
        if (k.denom) {
          h += `<div class="fld"><label>${esc(k.denom)}</label>
            <input type="number" min="0" step="any" data-k="${k.n}" data-f="i" value="${g("i")}"></div>`;
        }
        h += `<div class="fld"><label>${esc(k.numer)}</label>
          <input type="number" min="0" step="any" data-k="${k.n}" data-f="j" value="${g("j")}"></div>`;
      }
      if (k.secEff !== null) {
        h += `<div class="fld"><label>${esc(k.secd || "القيمة الثانوية")}</label>
          <input type="number" min="0" step="any" data-k="${k.n}" data-f="m" value="${g("m")}"></div>`;
      }
      h += `<div class="fld"><label>المستهدف</label>
        <div class="tgt">${fmt(k.tgtEff, k.tgtEff % 1 ? 2 : 0)}${
        k.secEff !== null ? " + " + fmt(k.secEff) : ""
      }</div>
        <div class="ogl">${
        k.tgtEff !== k.tgtBase
          ? `<b style="color:var(--amber)">مضبوط</b> · الأصل ${fmt(k.tgtBase)}`
          : (k.assumed ? `<b style="color:var(--red)">مُفترض</b> · حسب المرحلة` : `من الخطة`)
      }</div></div>
        <div class="fres" id="r${k.n}"></div></div></div>`;
    });
    h += `</div>`;
  });

  h += `<h4 class="blk">النتيجة حسب المسطرة المعتمدة</h4>
   <div id="evSum"></div>
   <h4 class="blk">الأداء التراكمي والدورات السابقة</h4>
   <div id="evHist"><div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div></div>
   <label style="font-size:12px;font-weight:700;color:var(--muted);display:block;margin:14px 0 5px">ملاحظات المقيّم</label>
   <textarea id="evNotes" rows="3">${esc(x.notes ?? "")}</textarea>
   <div style="display:flex;gap:9px;margin-top:15px;flex-wrap:wrap;align-items:center">
     <button class="btn" id="evSave">حفظ التقييم</button>
     <button class="btn ghost" id="evCancel">إلغاء</button>
     <span id="evProg" style="font-size:12px;color:var(--muted);font-weight:700"></span></div>
   </div>`;
  $("#modalBody").innerHTML = h;

  $("#modalBody").querySelectorAll("[data-k]").forEach((el) => {
    const ev = el.tagName === "SELECT" ? "onchange" : "oninput";
    el[ev] = () => {
      const n = el.dataset.k, f = el.dataset.f;
      EV.raw[n] = EV.raw[n] || {};
      if (el.value === "") delete EV.raw[n][f];
      else EV.raw[n][f] = el.value;
      if (!Object.keys(EV.raw[n]).length) delete EV.raw[n];
      evCalc();
    };
  });
  $("#mClose").onclick = $("#evCancel").onclick = () => $("#modal").classList.remove("on");
  $("#evSave").onclick = evSave;
  evCalc();
  evHistory(id);
}

/** الدورات السابقة والأداء التراكمي — عرض فقط. */
async function evHistory(id) {
  const box = $("#evHist");
  if (!box) return;
  let d;
  try {
    d = await api("/api/history?inst=" + encodeURIComponent(id));
  } catch (e) {
    box.innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
    return;
  }
  const c = d.cumulative;
  let h = `<div class="kpis">
    <div class="kpi"><div class="lbl">دورات مكتملة على المنهجية الحالية</div><div class="val">${d.cycles.length}</div></div>
    <div class="kpi ${c.complete ? "" : "amber"}"><div class="lbl">متوسط آخر ${c.n || "—"} دورة</div>
      <div class="val">${c.avg === null ? "—" : c.avg + "%"}</div></div>
    <div class="kpi"><div class="lbl">التقدير التراكمي</div><div class="val" style="font-size:17px">${
    c.level ?? "—"
  }</div></div>
    <div class="kpi ${c.trend === null ? "" : c.trend >= 0 ? "" : "red"}">
      <div class="lbl">الفرق عن الدورة الأسبق</div>
      <div class="val">${c.trend === null ? "—" : (c.trend > 0 ? "+" : "") + c.trend}</div></div>
  </div>`;
  if (!c.complete) {
    h += `<div class="tip amber">الحسم التراكمي يتطلب ثلاث دورات مكتملة على المنهجية الحالية،
      والمتوفر ${c.n}. الرقم أعلاه مؤقت ولا يصلح للحسم.</div>`;
  }
  if (d.cycles.length) {
    h += `<div class="tbl"><table><thead><tr><th style="width:110px">الدورة</th>
      <th style="width:90px">النتيجة</th><th style="width:130px">التقدير</th>` +
      [1, 2, 3, 4].map((a) => `<th style="background:${AXC[a]}">محور ${a}</th>`).join("") +
      `</tr></thead><tbody>` +
      d.cycles.map((x) =>
        `<tr><td class="r">${esc(x.year)}</td><td><b>${x.pct}%</b></td>
        <td style="color:${lvlColor(x.level)};font-weight:700">${x.level}</td>` +
        [1, 2, 3, 4].map((a) => `<td>${x.axes[a] === null ? "—" : x.axes[a] + "%"}</td>`).join("") +
        `</tr>`
      ).join("") + `</tbody></table></div>`;
  }
  if (d.prev) {
    h += `<div class="tip">نتيجة الدورة المرجعية <b>${esc(d.prev.year)}</b>:
      ${d.prev.pct === null ? "—" : d.prev.pct + "%"} · ${esc(d.prev.verdict ?? "—")}.
      حُسبت بالمعادلة اللوغاريتمية القديمة، فلا تُقارَن بنقاط الحساب الخطي ولا تدخل في المتوسط التراكمي.</div>`;
  } else {
    h += `<div class="tip">لا توجد نتيجة مرجعية لهذه المؤسسة في الملفات المركزية.</div>`;
  }
  box.innerHTML = h;
}

/** حساب محلي للعرض الفوري — الحساب المعتمد يبقى في الخادم ويُعاد بعد الحفظ. */
function evRow(k, raw) {
  const jv = raw?.j;
  if (jv === undefined || jv === "") return null;
  if (!k.tgtEff) return null;
  let K;
  if (k.mode === "نسبة" && k.denom) {
    const iv = raw?.i;
    if (iv === undefined || iv === "" || Number(iv) === 0) return null;
    K = Number(jv) / Number(iv) * 100;
  } else K = Number(jv);
  if (!isFinite(K)) return null;
  let P = Math.min(100, K / k.tgtEff * 100);
  if (k.secEff !== null) {
    const mv = raw?.m;
    const s2 = (mv === undefined || mv === "" || !isFinite(Number(mv)))
      ? 0
      : Math.min(100, Number(mv) / k.secEff * 100);
    P = (P + s2) / 2;
  }
  return Math.round(Math.max(0, P) * 10) / 10;
}
function evCalc() {
  const K = EV.defs, axp = { 1: 0, 2: 0, 3: 0, 4: 0 }, axn = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let pts = 0, filled = 0;
  K.kpis.forEach((k) => {
    const P = evRow(k, EV.raw[k.n]);
    const box = $("#r" + k.n);
    if (P === null) {
      if (box) box.innerHTML = '<span class="chip">لم يُملأ</span>';
      return;
    }
    filled++;
    axn[k.ax]++;
    const p = k.w * P / 100;
    pts += p;
    axp[k.ax] += p;
    let L = META.rubric[0];
    META.rubric.forEach((b) => {
      if (P >= b.a) L = b;
    });
    if (box) {
      box.innerHTML = `<span class="chip">نسبة التنفيذ <b>${P.toFixed(1)}%</b></span>
        <span class="chip lvl" style="background:${lvlColor(L.n)}">${L.n}</span>
        <span class="chip">${(k.w * P / 100).toFixed(1)} من ${fmt(k.w, k.w % 1 ? 2 : 0)}</span>`;
    }
  });
  [1, 2, 3, 4].forEach((a) => {
    const tot = K.kpis.filter((k) => k.ax === a).length;
    const b = $("#axb" + a);
    if (b) b.textContent = `${axn[a]} من ${tot} مؤشراً · ${axp[a].toFixed(1)} نقطة`;
  });
  const complete = filled === K.kpis.length;
  const pct = complete ? Math.round(pts / K.cap * 1000) / 10 : null;
  $("#evProg").textContent = `المؤشرات المملوءة: ${filled} من ${K.kpis.length}` +
    (complete ? " — مكتمل" : " — قيد التقييم");
  let h = `<div class="tbl"><table><thead><tr><th style="min-width:170px">المحور</th>
    <th style="width:120px">النقاط</th><th style="width:100px">نسبة التنفيذ</th>
    <th style="width:130px">التقدير</th></tr></thead><tbody>`;
  [1, 2, 3, 4].forEach((a) => {
    const w = K.axw[a], p = axp[a] / w * 100;
    const tot = K.kpis.filter((k) => k.ax === a).length;
    const full = axn[a] === tot;
    let L = META.rubric[0];
    META.rubric.forEach((b) => {
      if (p >= b.a) L = b;
    });
    h += `<tr><td class="r" style="border-right:4px solid ${AXC[a]}">${esc(META.axname[a])}</td>
      <td>${axp[a].toFixed(1)} من ${fmt(w)}</td>
      <td><b>${full ? p.toFixed(1) + "%" : "—"}</b></td>
      <td style="color:${full ? lvlColor(L.n) : "var(--muted)"};font-weight:700">${
      full ? L.n : "غير مكتمل"
    }</td></tr>`;
  });
  let LT = META.rubric[0];
  if (pct !== null) {
    META.rubric.forEach((b) => {
      if (pct >= b.a) LT = b;
    });
  }
  h += `<tr style="background:var(--green-l);font-weight:800"><td class="r">نتيجة المؤسسة</td>
    <td>${pts.toFixed(1)} من ${fmt(K.cap)}</td>
    <td><b style="font-size:15px">${pct === null ? "—" : pct.toFixed(1) + "%"}</b></td>
    <td style="color:${pct === null ? "var(--muted)" : lvlColor(LT.n)}">${
    pct === null ? "بعد الاكتمال" : LT.n
  }</td></tr></tbody></table></div>`;
  $("#evSum").innerHTML = h;
}
async function evSave() {
  try {
    const r = await api("/api/evaluation", {
      method: "POST",
      body: { instId: EV.inst.id, kpi: EV.raw, notes: $("#evNotes").value },
    });
    $("#modal").classList.remove("on");
    toast(`حُفظ التقييم — ${r.status} · ${r.filled} من ${r.total} مؤشراً`);
    await render();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ── لوحة الفريق ── */
function rTeam() {
  const teams = ME.role === "tech" ? META.teams : [ME.team];
  return `<h3 class="st">لوحة الفريق</h3>
  <p class="sl">${ME.role === "tech" ? "كل الفرق" : esc(ME.team)} — نسب الإنجاز ومتوسط النتائج.</p>` +
    teams.map((t) => {
      const list = ROWS.filter((x) => x.team === t), d = done(list);
      if (!list.length) return "";
      const evs = [...new Set(list.map((x) => x.evaluator))].sort();
      return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <b style="font-size:16px;color:var(--green-d)">${esc(t)}</b>
        <span class="pill" style="background:var(--green-l);color:var(--green-d)">
        ${list.length} مؤسسة · إنجاز ${(d.length / list.length * 100).toFixed(0)}% · متوسط ${
        d.length ? avgOf(d).toFixed(1) + "%" : "—"
      }</span></div>
      <div class="tbl" style="margin:0"><table><thead><tr><th style="width:75px">الحساب</th>
      <th style="width:70px">مسندة</th><th style="width:70px">مكتملة</th><th style="width:80px">قيد التقييم</th>
      <th style="width:70px">لم تبدأ</th><th style="width:170px">نسبة الإنجاز</th>
      <th style="width:90px">متوسط النتيجة</th></tr></thead><tbody>` +
        evs.map((e) => {
          const m = list.filter((x) => x.evaluator === e), dm = done(m);
          const r = m.length ? dm.length / m.length * 100 : 0;
          return `<tr><td class="mono">${e}</td><td>${m.length}</td><td><b>${dm.length}</b></td>
          <td>${m.filter((x) => x.status === "قيد التقييم").length}</td>
          <td>${m.filter((x) => x.status === "لم يبدأ").length}</td>
          <td><div style="display:flex;gap:7px;align-items:center">
            <div class="bar" style="flex:1"><i style="width:${r}%;background:${
            r >= 80 ? "#1E7145" : r >= 50 ? "#BA7517" : "#C0392B"
          }"></i></div><b style="font-size:11.5px">${r.toFixed(0)}%</b></div></td>
          <td>${dm.length ? avgOf(dm).toFixed(1) + "%" : "—"}</td></tr>`;
        }).join("") + `</tbody></table></div></div>`;
    }).join("");
}

/* ── الإحصاءات ── */
function statTable(list, label, key) {
  const g = {};
  list.forEach((x) => (g[x[key] ?? "غير مسجَّل"] = g[x[key] ?? "غير مسجَّل"] || []).push(x));
  const head = `<thead><tr><th>${label}</th><th style="width:62px">العدد</th><th style="width:68px">مقيَّمة</th>
    <th style="width:72px">الإنجاز</th><th style="width:82px">المتوسط</th>` +
    META.rubric.map((b) => `<th style="background:${lvlColor(b.n)}">${b.n}</th>`).join("") + `</tr></thead>`;
  const body = Object.keys(g).sort().map((k) => {
    const m = g[k], dm = done(m);
    const dist = {};
    META.rubric.forEach((b) => dist[b.n] = 0);
    dm.forEach((x) => dist[x.level]++);
    return `<tr><td class="r">${esc(k)}</td><td>${m.length}</td><td>${dm.length}</td>
      <td>${(dm.length / m.length * 100).toFixed(0)}%</td>
      <td><b>${dm.length ? avgOf(dm).toFixed(1) + "%" : "—"}</b></td>` +
      META.rubric.map((b) => `<td>${dist[b.n] || "—"}</td>`).join("") + `</tr>`;
  }).join("");
  return `<div class="tbl"><table>${head}<tbody>${body}</tbody></table></div>`;
}
function rStats() {
  const d = done(ROWS);
  const dist = {};
  META.rubric.forEach((b) => dist[b.n] = 0);
  d.forEach((x) => dist[x.level]++);
  let h = `<h3 class="st">الإحصاءات</h3>
  <p class="sl">${
    ME.role === "eval" ? "مؤسساتك المسندة" : (ME.role === "lead" ? esc(ME.team) : "كل الفرق")
  } — ${ROWS.length} مؤسسة.</p>
  <div class="kpis">
   <div class="kpi"><div class="lbl">المؤسسات</div><div class="val">${ROWS.length}</div></div>
   <div class="kpi"><div class="lbl">مكتملة التقييم</div><div class="val">${d.length}<small> (${
    ROWS.length ? (d.length / ROWS.length * 100).toFixed(0) : 0
  }%)</small></div></div>
   <div class="kpi amber"><div class="lbl">قيد التقييم</div><div class="val">${
    ROWS.filter((x) => x.status === "قيد التقييم").length
  }</div></div>
   <div class="kpi red"><div class="lbl">لم تبدأ</div><div class="val">${
    ROWS.filter((x) => x.status === "لم يبدأ").length
  }</div></div>
   <div class="kpi blue"><div class="lbl">متوسط النتيجة</div><div class="val">${
    d.length ? avgOf(d).toFixed(1) + "%" : "—"
  }</div></div>
  </div>
  <h4 class="blk">التوزيع على التقديرات</h4>
  <div class="card"><div class="seg">` +
    META.rubric.map((b) =>
      dist[b.n]
        ? `<div title="${b.n}: ${dist[b.n]}" style="width:${dist[b.n] / d.length * 100}%;background:${
          lvlColor(b.n)
        }">${dist[b.n] / d.length > 0.06 ? dist[b.n] : ""}</div>`
        : ""
    ).join("") +
    `</div><div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:11px;font-size:12.5px">` +
    META.rubric.map((b) =>
      `<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${
        lvlColor(b.n)
      }"></span> ${b.n}: <b>${dist[b.n]}</b> (${
        d.length ? (dist[b.n] / d.length * 100).toFixed(1) : 0
      }%)</span>`
    ).join("") + `</div></div>
  <h4 class="blk">حسب المرحلة</h4>${statTable(ROWS, "المرحلة", "stage")}
  <h4 class="blk">حسب الجنس</h4>${statTable(ROWS, "الجنس", "gender")}
  <h4 class="blk">حسب تصنيف الحجم</h4>${statTable(ROWS, "التصنيف", "size")}`;
  if (ME.role === "tech") h += `<h4 class="blk">حسب الفريق</h4>${statTable(ROWS, "الفريق", "team")}`;
  h += `<h4 class="blk">نسب التقدم على المحاور</h4><div class="tbl"><table>
    <thead><tr><th>المحور</th><th style="width:110px">متوسط نسبة التنفيذ</th><th>التوزيع</th></tr></thead><tbody>` +
    [1, 2, 3, 4].map((a) => {
      const vs = d.map((x) => x.axes?.[a]).filter((v) => v !== null && v !== undefined);
      const m = vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : 0;
      return `<tr><td class="r" style="border-right:4px solid ${AXC[a]}">${esc(META.axname[a])}</td>
        <td><b>${m.toFixed(1)}%</b></td>
        <td><div class="bar"><i style="width:${m}%;background:${AXC[a]}"></i></div></td></tr>`;
    }).join("") + `</tbody></table></div>`;
  return h;
}

/* ── أعلى 10 وقصص النجاح ── */
function rTop() {
  const canPick = ME.role !== "eval";
  let h = `<h3 class="st">أعلى 10 وقصص النجاح</h3>
  <p class="sl">لكل فريق أن يختار حتى <b>${META.maxPicks} مؤسسات</b> من أعلى ${META.topN} في فريقه.</p>`;
  TOP.teams.forEach((t) => {
    h += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:11px">
      <b style="font-size:16px;color:var(--green-d)">${esc(t.team)}</b>
      <span class="pill" style="background:${
      t.picks.length >= META.maxPicks ? "var(--green-l)" : "var(--amber-l)"
    };color:${
      t.picks.length >= META.maxPicks ? "var(--green-d)" : "#854F0B"
    }">المختار: ${t.picks.length} من ${META.maxPicks}</span></div>
      <div class="tbl" style="margin:0"><table><thead><tr><th style="width:38px">#</th><th>المؤسسة</th>
      <th style="width:100px">المرحلة</th><th style="width:70px">النتيجة</th><th style="width:115px">التقدير</th>
      <th style="width:80px">اختيار</th><th style="width:105px">القصة</th></tr></thead><tbody>` +
      t.rows.map((x, i) => {
        const on = t.picks.includes(x.id);
        return `<tr${on ? ' style="background:var(--purple-l)"' : ""}><td><b>${i + 1}</b></td>
        <td class="r">${esc(x.name)}</td><td>${esc(x.stage ?? "—")}</td><td><b>${x.pct}%</b></td>
        <td><span class="pill" style="background:${lvlColor(x.level)};color:#fff">${x.level}</span></td>
        <td>${
          canPick
            ? `<input type="checkbox" data-pick="${x.id}" ${on ? "checked" : ""} ${
              (!on && t.picks.length >= META.maxPicks) ? "disabled" : ""
            } style="width:17px;height:17px">`
            : (on ? "✔" : "—")
        }</td>
        <td>${
          on && canPick
            ? `<button class="btn sm" style="background:var(--purple)" data-story="${x.id}">${
              TOP.stories.some((s) => s.instId === x.id) ? "تعديل" : "كتابة"
            }</button>`
            : "—"
        }</td></tr>`;
      }).join("") + `</tbody></table></div></div>`;
  });
  if (TOP.stories.length) {
    h += `<h4 class="blk">القصص المكتوبة (${TOP.stories.length})</h4>` +
      TOP.stories.map((s) =>
        `<div class="card" style="border-right:5px solid var(--purple)">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <b style="font-size:15px">${esc(s.title) || "(بلا عنوان)"}</b>
        <span class="pill" style="background:var(--purple-l);color:var(--purple)">${esc(s.team)}</span></div>
        <div style="font-size:13px;line-height:1.9;margin-top:9px;white-space:pre-wrap">${esc(s.text)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:8px">كتبها: ${esc(s.by)}</div></div>`
      ).join("");
  }
  return h;
}
function openStory(id) {
  const row = TOP.teams.flatMap((t) => t.rows).find((r) => r.id === id);
  const s = TOP.stories.find((x) => x.instId === id) ?? { title: "", text: "" };
  $("#modalBody").innerHTML = `
   <div class="mhead" style="background:var(--purple)"><div>
     <div style="font-size:12px;opacity:.85">${esc(row.team)} · النتيجة ${row.pct}% · ${row.level}</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">${esc(row.name)}</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <label style="font-size:12px;font-weight:700;color:var(--muted)">عنوان القصة</label>
     <input id="sT" value="${esc(s.title)}" style="width:100%;margin:5px 0 14px">
     <label style="font-size:12px;font-weight:700;color:var(--muted)">نص القصة</label>
     <textarea id="sX" rows="9" placeholder="ما قامت به المؤسسة، وأثره، والدرس المستفاد">${
    esc(s.text)
  }</textarea>
     <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
       <button class="btn" style="background:var(--purple)" id="sSave">حفظ القصة</button>
       <button class="btn ghost" id="sCancel">إلغاء</button></div></div>`;
  $("#modal").classList.add("on");
  $("#mClose").onclick = $("#sCancel").onclick = () => $("#modal").classList.remove("on");
  $("#sSave").onclick = async () => {
    try {
      await api("/api/story", {
        method: "POST",
        body: { instId: id, title: $("#sT").value, text: $("#sX").value },
      });
      $("#modal").classList.remove("on");
      toast("حُفظت القصة");
      await render();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/* ── التقارير ── */
function rReports() {
  const teams = ME.role === "tech" ? META.teams : [ME.team];
  let h = `<h3 class="st">التقارير</h3><p class="sl">ملخص جاهز للطباعة أو التصدير.</p>`;
  teams.forEach((t) => {
    const list = ROWS.filter((x) => x.team === t), d = done(list);
    if (!list.length) return;
    const dist = {};
    META.rubric.forEach((b) => dist[b.n] = 0);
    d.forEach((x) => dist[x.level]++);
    h += `<div class="card"><b style="font-size:16px;color:var(--green-d)">${esc(t)}</b>
      <div class="tbl" style="margin:11px 0 0"><table><tbody>
      <tr><td class="r">عدد المؤسسات</td><td><b>${list.length}</b></td>
          <td class="r">مكتملة التقييم</td><td><b>${d.length}</b> (${
      (d.length / list.length * 100).toFixed(0)
    }%)</td></tr>
      <tr><td class="r">متوسط النتيجة</td><td><b>${d.length ? avgOf(d).toFixed(1) + "%" : "—"}</b></td>
          <td class="r">أعلى نتيجة</td><td><b>${
      d.length ? Math.max(...d.map((x) => x.pct)) + "%" : "—"
    }</b></td></tr>` +
      META.rubric.map((b) =>
        `<tr><td class="r">${b.n}</td><td colspan="3"><b>${dist[b.n]}</b> مؤسسة (${
          d.length ? (dist[b.n] / d.length * 100).toFixed(1) : 0
        }%)</td></tr>`
      ).join("") + `</tbody></table></div></div>`;
  });
  h += `<div style="display:flex;gap:9px;flex-wrap:wrap">
    <button class="btn" id="prBtn">طباعة</button>
    <button class="btn ghost" id="csvBtn">تصدير CSV</button></div>`;
  return h;
}
function dlCSV() {
  const rows = [[
    "الرمز",
    "المؤسسة",
    "الفريق",
    "المرحلة",
    "الجنس",
    "الطلبة",
    "التصنيف",
    "المقيّم",
    "الحالة",
    "النتيجة",
    "التقدير",
  ]];
  ROWS.forEach((x) =>
    rows.push([
      x.id,
      x.name,
      x.team,
      x.stage ?? "",
      x.gender ?? "",
      x.students ?? "",
      x.size ?? "",
      x.evaluator,
      x.status,
      x.pct ?? "",
      x.level ?? "",
    ])
  );
  const csv = "\ufeff" +
    rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const b = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "تقييم_التعليم_الأخضر.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ── الحساب الفني ── */
async function rTech() {
  const [ac, au, tg] = await Promise.all([
    api("/api/accounts"),
    api("/api/audit"),
    api("/api/targets"),
  ]);
  TGT = tg;
  const A = ac.accounts;
  ACCS = A;
  const P = [
    ["مؤسساتي وإدخال التقييم", "مؤسساته فقط", "—", "—"],
    ["لوحة الفريق", "—", "فريقه", "كل الفرق"],
    ["الإحصاءات", "مؤسساته", "فريقه", "وطنية"],
    ["أعلى 10 واختيار قصص النجاح", "—", `فريقه (حد ${META.maxPicks})`, "كل الفرق"],
    ["التقارير والتصدير", "—", "فريقه", "وطنية"],
    ["إدارة الحسابات وسجل التدقيق", "—", "—", "كامل"],
  ];
  return `<h3 class="st">الحساب الفني</h3><p class="sl">الحسابات والصلاحيات وسجل التدقيق.</p>
  <div class="kpis">
   <div class="kpi"><div class="lbl">إجمالي الحسابات</div><div class="val">${A.length}</div></div>
   <div class="kpi blue"><div class="lbl">أعضاء التقييم</div><div class="val">${
    A.filter((a) => a.role === "eval").length
  }</div></div>
   <div class="kpi"><div class="lbl">رؤساء الفرق</div><div class="val">${
    A.filter((a) => a.role === "lead").length
  }</div></div>
   <div class="kpi amber"><div class="lbl">لم يغيّروا كلمة المرور</div><div class="val">${
    A.filter((a) => a.mustChange).length
  }</div></div>
   <div class="kpi purple"><div class="lbl">أحداث في السجل</div><div class="val">${au.rows.length}</div></div>
  </div>
  <h4 class="blk">مصفوفة الصلاحيات — مطبَّقة في الخادم</h4>
  <div class="tbl"><table><thead><tr><th>الشاشة</th><th>عضو التقييم</th><th>رئيس الفريق</th><th>الحساب الفني</th></tr></thead><tbody>` +
    P.map((r) =>
      `<tr><td class="r"><b>${r[0]}</b></td>` +
      r.slice(1).map((c) =>
        `<td style="background:${c === "—" ? "var(--red-l)" : "var(--green-l)"};font-size:12px">${c}</td>`
      ).join("") + `</tr>`
    ).join("") + `</tbody></table></div>
  <h4 class="blk">الحسابات</h4>
  <p class="sl">عدّل الاسم والمسمى والفريق ثم اضغط «حفظ» في السطر نفسه. تغيير الفريق لا ينقل المؤسسات
    المسندة للحساب — الإسناد يُدار من الجدول التالي.</p>
  <div class="tbl"><table><thead><tr><th style="width:70px">الرمز</th><th style="min-width:170px">الاسم</th>
   <th style="min-width:170px">المسمى</th><th style="width:130px">الفريق</th>
   <th style="width:100px">كلمة المرور</th><th style="width:160px"></th></tr></thead><tbody>` +
    A.map((a) =>
      `<tr><td class="mono">${a.id}</td>
      <td class="r"><input data-ac="${a.id}" data-af="name" value="${esc(a.name)}" style="width:100%"></td>
      <td><input data-ac="${a.id}" data-af="title" value="${esc(a.title)}" style="width:100%"></td>
      <td>${
        a.role === "tech" ? "—" : `<select data-ac="${a.id}" data-af="team">` +
          META.teams.map((t) => `<option ${t === a.team ? "selected" : ""}>${esc(t)}</option>`).join("") +
          `</select>`
      }</td>
      <td>${
        a.mustChange
          ? '<span class="pill" style="background:var(--amber-l);color:#854F0B">ابتدائية</span>'
          : '<span class="pill" style="background:var(--green-l);color:var(--green-d)">مُغيَّرة</span>'
      }</td>
      <td style="white-space:nowrap"><button class="btn sm" data-acsave="${a.id}">حفظ</button>
      <button class="btn sm ghost" data-reset="${a.id}">كلمة المرور</button></td></tr>`
    ).join("") + `</tbody></table></div>
  <h4 class="blk">تعديل المؤشرات والمستهدفات</h4>
  <p class="sl">ما يُحفظ هنا يسري على كل المؤسسات فوراً ويُعاد حساب التقييمات المحفوظة عليه.
    الفراغ يعني الرجوع إلى نص الخطة ورقمها. المؤشرات الوصفية مستهدفها ثابت عند 100.
    التعديل يبقى في قاعدة البيانات ولا يمسّ ملف الخطة.</p>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <button class="btn ghost" id="tgSchool">التعليم النظامي</button>
    <button class="btn ghost" id="tgKg">التعليم المبكر</button></div>
  <div id="tgBox"></div>
  <h4 class="blk">إسناد المؤسسات</h4>
  <p class="sl">اختر الفريق لعرض مؤسساته، ثم غيّر الفريق أو المقيّم لأي مؤسسة.
    نقل مؤسسة بين النظامي ورياض الأطفال يغيّر عدد المؤشرات والسقف، فيُحذف تقييمها وقصتها عند النقل.</p>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap" id="asTabs">` +
    META.teams.map((t) => `<button class="btn ghost" data-as="${esc(t)}">${esc(t)}</button>`).join("") +
    `</div>
  <div id="asBox"></div>
  <h4 class="blk">سجل التدقيق — آخر ${au.rows.length} حدثاً</h4>
  <div class="tbl"><table><thead><tr><th style="width:150px">الوقت</th><th style="width:90px">الحساب</th>
   <th style="width:170px">الإجراء</th><th>الهدف</th><th style="width:110px">تفصيل</th></tr></thead><tbody>` +
    au.rows.slice(0, 60).map((r) =>
      `<tr><td class="mono">${new Date(r.at).toLocaleString("ar-BH", { hour12: false })}</td>
      <td class="mono">${esc(r.actor)}</td><td>${esc(r.action)}</td>
      <td class="r">${esc(r.target)}</td><td>${esc(r.detail ?? "")}</td></tr>`
    ).join("") + `</tbody></table></div>`;
}

/* ── ضبط المستهدفات — الحساب الفني ── */
async function tgRender(stage) {
  TGSTAGE = stage;
  $("#tgSchool").className = "btn" + (stage === "school" ? "" : " ghost");
  $("#tgKg").className = "btn" + (stage === "kg" ? "" : " ghost");
  const box = $("#tgBox");
  box.innerHTML = `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
  if (!TGDEFS[stage]) {
    const probe = ROWS.find((r) => (r.team === "رياض الأطفال") === (stage === "kg")) ||
      (await api("/api/institutions")).rows.find((r) => (r.team === "رياض الأطفال") === (stage === "kg"));
    if (!probe) {
      box.innerHTML =
        `<div class="tip red">لا توجد مؤسسة من هذه المرحلة ضمن نطاقك لقراءة تعريف المؤشرات.</div>`;
      return;
    }
    TGDEFS[stage] = (await api("/api/kpis?inst=" + encodeURIComponent(probe.id))).kpis;
  }
  const ov = TGT[stage] || {};
  const F = [
    ["kpi", "نص المؤشر"],
    ["crit", "معيار النجاح"],
    ["tools", "أدوات القياس"],
    ["mech", "آلية الحساب"],
    ["denom", "المقام"],
    ["numer", "البسط"],
  ];
  let h = "";
  [1, 2, 3, 4].forEach((a) => {
    const rows = TGDEFS[stage].filter((k) => k.ax === a);
    if (!rows.length) return;
    h += `<div class="axbox"><div class="axhead" style="background:${AXC[a]}">
      <span>${esc(META.axname[a])}</span><span class="axbadge">${rows.length} مؤشراً</span></div>`;
    rows.forEach((k) => {
      const lock = k.mode === "وصفي", o = ov[k.n] || {};
      const edited = F.some(([f]) => o[f]);
      h += `<div class="frow"><div class="ftop"><div class="fnum">${k.n}</div>
        <div class="ftxt">${esc(o.kpi || k.kpi)}
        <div style="font-weight:400;font-size:11px;color:var(--muted);margin-top:3px">
          <span class="pill ${MODEP[k.mode]}">${k.mode}</span>
          ${edited ? '<span class="pill purple">نص معدَّل</span>' : ""}
          &nbsp;وزنه ${fmt(k.w, k.w % 1 ? 2 : 0)} نقطة</div></div>
        <button class="btn sm ghost" data-edit="${k.n}">تعديل النص</button></div>
        <div class="finputs">
          <div class="fld"><label>مستهدف الخطة</label>
            <div class="tgt">${lock ? "100" : fmt(k.tgtBase, k.tgtBase % 1 ? 2 : 0)}</div></div>
          <div class="fld"><label>المستهدف المضبوط</label>${
        lock
          ? '<div class="tgt">ثابت</div>'
          : `<input type="number" min="0" step="any" style="width:110px" data-tg="${k.n}" data-tf="t" value="${
            o.t ?? ""
          }" placeholder="من الخطة">`
      }</div>
          ${
        k.sec === null || k.sec === undefined ? "" : `<div class="fld"><label>الثانوي المضبوط</label>
            <input type="number" min="0" step="any" style="width:110px" data-tg="${k.n}" data-tf="s"
              value="${o.s ?? ""}" placeholder="${k.sec}"></div>`
      }
          ${
        k.prop === null || k.prop === undefined ? "" : `<div class="fld"><label>مقترح المراجعة</label>
            <button class="btn sm" style="background:#8E24AA" data-prop="${k.n}" data-pv="${k.prop}">
              تطبيق ${k.prop}</button></div>`
      }
        </div>
        <div class="kedit" id="ke${k.n}" hidden>` +
        F.map(([f, lbl]) =>
          (f === "denom" && !k.denom) ? "" : `<label class="kel">${lbl}</label>
            <textarea rows="${f === "kpi" || f === "crit" || f === "tools" ? 3 : 2}"
              data-tx="${k.n}" data-tf="${f}" placeholder="${esc(k[f] ?? "")}">${esc(o[f] ?? "")}</textarea>`
        ).join("") +
        `<div class="kel" style="color:var(--muted);font-weight:400">الفراغ يعني الإبقاء على نص الخطة.</div>
        </div></div>`;
    });
    h += `</div>`;
  });
  h += `<div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">
      <button class="btn" id="tgSave">حفظ التعديلات</button>
      <button class="btn ghost" id="tgClear">إعادة الكل إلى الخطة</button></div>`;
  box.innerHTML = h;
  box.querySelectorAll("[data-edit]").forEach((b) =>
    b.onclick = () => {
      const el = box.querySelector("#ke" + b.dataset.edit);
      el.hidden = !el.hidden;
      b.textContent = el.hidden ? "تعديل النص" : "إخفاء التعديل";
    }
  );
  box.querySelectorAll("[data-prop]").forEach((b) =>
    b.onclick = () => {
      const inp = box.querySelector(`[data-tg="${b.dataset.prop}"][data-tf="t"]`);
      if (inp) inp.value = b.dataset.pv;
    }
  );
  $("#tgClear").onclick = () => {
    box.querySelectorAll("[data-tg]").forEach((i) => i.value = "");
    box.querySelectorAll("[data-tx]").forEach((i) => i.value = "");
  };
  $("#tgSave").onclick = async () => {
    const targets = {};
    const put = (n, f, v) => {
      targets[n] = targets[n] || {};
      targets[n][f] = v;
    };
    box.querySelectorAll("[data-tg]").forEach((i) => {
      if (i.value !== "") put(i.dataset.tg, i.dataset.tf, Number(i.value));
    });
    box.querySelectorAll("[data-tx]").forEach((i) => {
      if (i.value.trim() !== "") put(i.dataset.tx, i.dataset.tf, i.value.trim());
    });
    try {
      const r = await api("/api/targets", { method: "POST", body: { stage: TGSTAGE, targets } });
      TGT[TGSTAGE] = targets;
      delete TGDEFS[TGSTAGE];
      toast(`حُفظت التعديلات — ${r.count} مؤشراً · ${r.text} تعديل نصي`);
      await tgRender(TGSTAGE);
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/* ── إسناد المؤسسات — الحساب الفني ── */
let ASTEAM = null, ACCS = [];
async function asRender(team) {
  ASTEAM = team;
  document.querySelectorAll("#asTabs [data-as]").forEach((b) =>
    b.className = "btn" + (b.dataset.as === team ? "" : " ghost")
  );
  const box = $("#asBox");
  box.innerHTML = `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
  const rows = (await api("/api/institutions")).rows.filter((r) => r.team === team);
  const evalsOf = (t) => ACCS.filter((a) => a.role === "eval" && a.team === t);
  let h = `<div class="tbl"><table><thead><tr><th style="width:70px">الرمز</th><th>المؤسسة</th>
    <th style="width:120px">المرحلة</th><th style="width:150px">الفريق</th>
    <th style="width:130px">المقيّم</th><th style="width:100px">الحالة</th>
    <th style="width:80px"></th></tr></thead><tbody>`;
  rows.forEach((x) => {
    h += `<tr><td class="mono">${x.id}</td><td class="r">${esc(x.name)}</td>
      <td>${esc(x.stage ?? "غير مسجَّل")}</td>
      <td><select data-in="${x.id}" data-if="team">` +
      META.teams.map((t) => `<option ${t === x.team ? "selected" : ""}>${esc(t)}</option>`).join("") +
      `</select></td>
      <td><select data-in="${x.id}" data-if="evaluator">` +
      evalsOf(x.team).map((a) =>
        `<option value="${a.id}" ${a.id === x.evaluator ? "selected" : ""}>${a.id}</option>`
      )
        .join("") +
      `</select></td>
      <td><span class="pill" style="background:${SC[x.status]}22;color:${
        SC[x.status]
      }">${x.status}</span></td>
      <td><button class="btn sm" data-insave="${x.id}">حفظ</button></td></tr>`;
  });
  box.innerHTML = h + `</tbody></table></div>`;
  box.querySelectorAll('[data-if="team"]').forEach((sel) =>
    sel.onchange = () => {
      const ev = box.querySelector(`[data-in="${sel.dataset.in}"][data-if="evaluator"]`);
      ev.innerHTML = evalsOf(sel.value).map((a) => `<option value="${a.id}">${a.id}</option>`).join("");
    }
  );
  box.querySelectorAll("[data-insave]").forEach((b) =>
    b.onclick = async () => {
      const id = b.dataset.insave;
      const team2 = box.querySelector(`[data-in="${id}"][data-if="team"]`).value;
      const evaluator = box.querySelector(`[data-in="${id}"][data-if="evaluator"]`).value;
      try {
        const r = await api("/api/assign", { method: "POST", body: { instId: id, team: team2, evaluator } });
        toast(`أُسندت ${id}` + (r.evalCleared ? " — حُذف تقييمها لاختلاف المرحلة" : ""));
        await asRender(ASTEAM);
      } catch (e) {
        toast(e.message, true);
      }
    }
  );
}

/* ── تغيير كلمة المرور ── */
function openPw(force = false) {
  $("#modalBody").innerHTML = `
   <div class="mhead"><div style="font-size:16px;font-weight:800">تغيير كلمة المرور</div>
     ${
    force ? "" : '<button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button>'
  }</div>
   <div class="mbody">
     ${force ? '<div class="tip amber">كلمة المرور الحالية ابتدائية. غيّرها قبل المتابعة.</div>' : ""}
     <label style="font-size:12px;font-weight:700;color:var(--muted)">كلمة المرور الحالية</label>
     <input type="password" id="pwCur" style="width:100%;margin:5px 0 12px">
     <label style="font-size:12px;font-weight:700;color:var(--muted)">كلمة المرور الجديدة (8 محارف فأكثر)</label>
     <input type="password" id="pwNew" style="width:100%;margin:5px 0 4px">
     <div class="err" id="pwErr"></div>
     <button class="btn" id="pwSave" style="margin-top:8px">حفظ</button></div>`;
  $("#modal").classList.add("on");
  if (!force) $("#mClose").onclick = () => $("#modal").classList.remove("on");
  $("#pwSave").onclick = async () => {
    try {
      await api("/api/password", {
        method: "POST",
        body: { current: $("#pwCur").value, next: $("#pwNew").value },
      });
      $("#modal").classList.remove("on");
      ME.mustChange = false;
      toast("تم تغيير كلمة المرور");
    } catch (e) {
      $("#pwErr").textContent = e.message;
    }
  };
}

/* ── ربط الأحداث ── */
function wire() {
  document.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openEval(b.dataset.open));
  if ($("#tgSchool")) {
    $("#tgSchool").onclick = () => tgRender("school");
    $("#tgKg").onclick = () => tgRender("kg");
    tgRender(TGSTAGE);
  }
  if ($("#asTabs")) {
    document.querySelectorAll("#asTabs [data-as]").forEach((b) => b.onclick = () => asRender(b.dataset.as));
    asRender(ASTEAM ?? META.teams[0]);
  }
  document.querySelectorAll("[data-acsave]").forEach((b) =>
    b.onclick = async () => {
      const id = b.dataset.acsave,
        g = (f) => {
          const el = document.querySelector(`[data-ac="${id}"][data-af="${f}"]`);
          return el ? el.value : undefined;
        };
      try {
        await api("/api/account", {
          method: "POST",
          body: { id, name: g("name"), title: g("title"), team: g("team") },
        });
        toast(`حُفظ الحساب ${id}`);
      } catch (e) {
        toast(e.message, true);
      }
    }
  );
  document.querySelectorAll("[data-story]").forEach((b) => b.onclick = () => openStory(b.dataset.story));
  document.querySelectorAll("[data-pick]").forEach((c) =>
    c.onchange = async () => {
      try {
        await api("/api/picks", { method: "POST", body: { instId: c.dataset.pick, on: c.checked } });
        await render();
      } catch (e) {
        toast(e.message, true);
        await render();
      }
    }
  );
  document.querySelectorAll("[data-reset]").forEach((b) =>
    b.onclick = async () => {
      const pw = prompt(`كلمة مرور جديدة للحساب ${b.dataset.reset} (8 محارف فأكثر)`);
      if (!pw) return;
      try {
        await api("/api/reset-password", { method: "POST", body: { id: b.dataset.reset, password: pw } });
        toast("أُعيد تعيين كلمة المرور");
        await render();
      } catch (e) {
        toast(e.message, true);
      }
    }
  );
  const pr = $("#prBtn"), cs = $("#csvBtn");
  if (pr) pr.onclick = () => print();
  if (cs) cs.onclick = dlCSV;
}
$("#modal").onclick = (e) => {
  if (e.target.id === "modal") $("#modal").classList.remove("on");
};

// استئناف جلسة قائمة إن وُجدت — دون توليد خطأ في الكونسول
try {
  const s = await api("/api/session");
  if (s.authenticated) await boot();
} catch { /* تُعرض شاشة الدخول */ }
