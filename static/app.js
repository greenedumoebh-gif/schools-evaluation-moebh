// واجهة منصة تقييم المؤسسات التعليمية ضمن مبادرة التعليم الأخضر بمملكة البحرين
const $ = (s) => document.querySelector(s);
const AXC = { 1: "#1E7145", 2: "#2C6FB5", 3: "#BA7517", 4: "#0F6E56" };
/** نسخة أغمق من ألوان المحاور للأسطح التي يُكتب عليها بالأبيض — الذهبي بلونه الأصلي لا يكفي تبايناً. */
const AXD = { 1: "#175838", 2: "#22568C", 3: "#7E4E0E", 4: "#0B5442" };
const SC = { "مكتمل": "#1E7145", "قيد التقييم": "#BA7517", "لم يبدأ": "#C0392B" };
const SECS = {
  mine: ["المؤسسات والتقييم", "المؤسسات ضمن نطاقك وحالة تقييمها", "▤"],
  team: ["لوحة الفريق", "نسب الإنجاز لكل مقيّم", "◧"],
  stats: ["الإحصاءات", "حسب المرحلة والجنس ونسب التقدم", "📊"],
  top: ["أعلى 10 وقصص النجاح", "اختيار 3 مؤسسات للكتابة عنها", "★"],
  reports: ["التقارير", "ملخص الفريق والتصدير", "▦"],
  assign: ["توزيع المؤسسات", "توزيع مؤسسات الفريق على المقيّمين", "⇲"],
  central: ["بيانات المؤسسات", "أعداد الطلبة والمعلمين والمواد لهذا العام", "▦"],
  mail: ["المراسلات", "مراسلة الزملاء داخل نطاقك", "✉"],
  transfers: ["طلبات النقل", "نقل المؤسسات بين المقيّمين داخل الفريق", "⇄"],
  tech: ["الحساب الفني", "البيانات المركزية والحسابات والمؤشرات", "⚙"],
};
/** ألوان تبويبات الأعوام: سابقتان · الحالي · القادم */
/** لون ثابت لكل عام دراسي، مصدره الخادم ولا يتغيّر بتغيّر نافذة الأعوام. */
function yearColor(y) {
  return (META.yearColors && META.yearColors[y]) || META.yearColorFallback || "#5f6b64";
}
let ME = null, META = null, PERMS = [], SEC = null, ROWS = [], TOP = null;
let TGT = null, TGSTAGE = "school", VYEAR = null, EDITABLE = true, ARCHIVED = false;
const EVNAMES = {};
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
  if (!r.ok) {
    const err = new Error(j.error || "تعذّر تنفيذ الطلب");
    // نمرّر تفاصيل الخطأ للمستدعي (مثل تعارض التحرير) لا نصّه فقط
    Object.assign(err, j, { status: r.status });
    throw err;
  }
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
  applyTheme(ME.theme);
  VYEAR = VYEAR ?? META.currentYear;
  // النطاق قد يضم أكثر من فريق، فلا يُعرض أول فريق وكأنه الوحيد
  const ts = myTeams();
  $("#brandSub").textContent = ME.role === "tech"
    ? "الحساب الفني · كل الفرق"
    : ts.length === 1
    ? `${META.teamMeta[ts[0]].label} · رمز الفريق ${META.teamMeta[ts[0]].code} · رقم ${
      META.teamMeta[ts[0]].no
    }`
    : ts.length === META.teams.length
    ? `إشراف على كل فرق التقييم الستة`
    : `${ts.length} فرق ضمن نطاقك · ${ts.map((t) => META.teamMeta[t].code).join(" · ")}`;
  $("#brandVer").textContent = `الإصدار ${META.version} · ${META.released}`;
  $("#phSub").textContent =
    `فريق التعليم الأخضر · وزارة التربية والتعليم · الإصدار ${META.version} · ${VYEAR}`;
  buildYearTabs();
  buildViewBar();
  buildThemes();
  $("#who").innerHTML = `<div class="n">${esc(ME.name)}</div><div class="r">${esc(ME.title)}${
    ME.team ? " · " + esc(ME.team) : ""
  }</div><button id="soBtn">تسجيل الخروج</button>`;
  $("#soBtn").onclick = signout;
  SEC = PERMS[0];
  buildNav();
  if (ME.mustChange) setTimeout(() => openPw(true), 400);
  await render();
}
/** لافتة معاينة حساب آخر — دائمة وواضحة حتى لا يُخلط بين الحسابين. */
function buildViewBar() {
  let bar = document.getElementById("viewbar");
  if (!ME.viewAs) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "viewbar";
    bar.className = "viewbar";
    document.querySelector(".topbar").before(bar);
  }
  bar.innerHTML = `<span>وضع معاينة — أنت ترى المنصة بعين
    <b>${esc(ME.id)} · ${esc(ME.name)}</b> (${esc(ME.title)}).
    الكتابة معطَّلة، والحساب الأصلي ${esc(ME.viewAs.byName)}.</span>
    <button class="btn sm" id="vbExit">إنهاء المعاينة</button>`;
  $("#vbExit").onclick = () => viewAs(null);
}
async function viewAs(id) {
  try {
    await api("/api/view-as", { method: "POST", body: { id } });
    VYEAR = null;
    SEC = null;
    location.reload();
  } catch (e) {
    toast(e.message, true);
  }
}

function buildYearTabs() {
  let bar = document.getElementById("yearbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "yearbar";
    bar.className = "yearbar";
    document.querySelector(".topbar").after(bar);
  }
  bar.innerHTML = META.yearWindow.map((y) =>
    `<button class="ytab${y === VYEAR ? " on" : ""}" data-y="${y}"
      style="--yc:${yearColor(y)}">${y}${
      y === META.archiveYear
        ? '<span class="ybadge">مؤرشف</span>'
        : y === META.currentYear
        ? '<span class="ybadge">الجاري</span>'
        : ""
    }</button>`
  ).join("") +
    `<span class="ynote" id="ynote"></span>`;
  bar.querySelectorAll(".ytab").forEach((b) =>
    b.onclick = async () => {
      VYEAR = b.dataset.y;
      buildYearTabs();
      await render();
    }
  );
}

/** اختيار سمة الألوان — تفضيل شخصي يُطبَّق فوراً ويُحفظ في الحساب. */
function applyTheme(id) {
  document.documentElement.dataset.theme = id || "green";
}
function buildThemes() {
  const box = document.getElementById("themebar") ?? (() => {
    const lbl = document.createElement("div");
    lbl.className = "themelbl";
    lbl.textContent = "سمة الألوان";
    const d = document.createElement("div");
    d.id = "themebar";
    d.className = "themebar";
    $("#nav").before(lbl, d);
    return d;
  })();
  const cur = ME.theme || "green";
  box.innerHTML = (META.themes ?? []).map((t) =>
    `<button class="thbtn${t.id === cur ? " on" : ""}" data-th="${t.id}"
      title="${esc(t.name)} — ${esc(t.desc)}">${
      t.sw.map((c) => `<i style="background:${c}"></i>`).join("")
    }</button>`
  ).join("");
  box.querySelectorAll("[data-th]").forEach((b) =>
    b.onclick = async () => {
      const id = b.dataset.th;
      applyTheme(id);
      ME.theme = id;
      buildThemes();
      await render(); // الرسوم تقرأ ألوانها من السمة، فتُعاد بعد التبديل
      try {
        await api("/api/theme", { method: "POST", body: { theme: id } });
      } catch (e) {
        toast(e.message, true);
      }
    }
  );
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
      toggleNav(false);
      globalThis.scrollTo(0, 0);
      await render();
    }
  );
}
/** فتح الشريط الجانبي على الجوال مع طبقة معتمة تُغلقه بلمسة خارجه. */
function toggleNav(open) {
  const sb = $("#sb");
  const on = open === undefined ? !sb.classList.contains("open") : open;
  sb.classList.toggle("open", on);
  let sc = document.getElementById("scrim");
  if (on && !sc) {
    sc = document.createElement("div");
    sc.id = "scrim";
    sc.className = "scrim";
    sc.onclick = () => toggleNav(false);
    document.body.appendChild(sc);
  } else if (!on && sc) sc.remove();
}
$("#mbtn").onclick = () => toggleNav();

/* ── التحميل والرسم ── */
async function render() {
  $("#tt").textContent = SECS[SEC][0];
  $("#ts").textContent = SECS[SEC][1] + " · " + ME.name;
  destroyCharts();
  $("#content").innerHTML =
    `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
  try {
    if (["mine", "team", "stats", "reports", "central", "assign", "mail"].includes(SEC)) {
      const d = await api("/api/institutions?year=" + encodeURIComponent(VYEAR));
      ROWS = d.rows;
      EDITABLE = d.editable;
      ARCHIVED = d.archived;
      if (ME.role !== "eval" && !Object.keys(EVNAMES).length) {
        try {
          (await api("/api/evaluators")).rows.forEach((a) => EVNAMES[a.id] = a);
        } catch { /* الأسماء تحسين للعرض، وغيابها لا يمنع الشاشة */ }
      }
      const note = $("#ynote");
      if (note) {
        note.textContent = ARCHIVED
          ? "عام مؤرشف — نتائجه من الملفات المركزية بالمنهجية اللوغاريتمية السابقة"
          : EDITABLE
          ? "العام الجاري — الإدخال متاح"
          : `عرض فقط — الإدخال متاح في ${META.currentYear} وحده`;
        note.className = "ynote" + (EDITABLE ? "" : " ro");
      }
    }
    if (SEC === "top") TOP = await api("/api/top");
    const R = {
      mine: rMine,
      team: rTeam,
      stats: rStats,
      top: rTop,
      reports: rReports,
      assign: rAssign,
      central: rCentral,
      mail: rMail,
      transfers: rTransfers,
      tech: rTech,
    };
    $("#content").innerHTML = await R[SEC]();
    wire();
  } catch (e) {
    $("#content").innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
  }
}
const done = (l) => l.filter((x) => x.status === "مكتمل");
const avgOf = (l) => l.length ? l.reduce((s, x) => s + x.pct, 0) / l.length : 0;

/**
 * حلقة نسبة مرسومة بـSVG: أخف من مكتبة رسوم لعنصر بهذا الحجم، وتتبع ألوان السمة.
 * القيمة تُضبط لاحقاً بـsetDonut دون إعادة بناء العنصر.
 */
function donut(id, size, w, label, color) {
  const r = (size - w) / 2, c = 2 * Math.PI * r;
  return `<span class="dn" id="${id}" style="--dsz:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle class="dn-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${w}"></circle>
      <circle class="dn-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${w}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}"
        style="stroke:${color ?? "var(--green)"}"></circle>
    </svg>
    <b class="dn-v">—</b><i class="dn-l">${esc(label)}</i></span>`;
}
/** pct من 0 إلى 100 أو null؛ txt نص بديل يُعرض في المنتصف. */
function setDonut(id, pct, txt, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const fg = el.querySelector(".dn-fg"), v = el.querySelector(".dn-v");
  const c = Number(fg.getAttribute("stroke-dasharray"));
  const p = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
  fg.style.strokeDashoffset = c * (1 - p / 100);
  if (color) fg.style.stroke = color;
  v.textContent = txt;
}

/* ── الرسوم البيانية ── */
const CHARTS = [];
const CH_FONT = { family: "'Segoe UI', Tahoma, sans-serif", size: 12 };
/** ألوان الرسوم تُقرأ من متغيّرات السمة حتى تتبعها بدل ألوان مثبّتة. */
function cssVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}
function destroyCharts() {
  while (CHARTS.length) CHARTS.pop().destroy();
}
/** يبني رسماً في عنصر canvas بمعرّف id بعد إدراج HTML في الصفحة. */
function drawChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || typeof Chart === "undefined") return;
  cfg.options = cfg.options || {};
  cfg.options.responsive = true;
  cfg.options.maintainAspectRatio = false;
  cfg.options.locale = "ar-u-nu-latn";
  cfg.options.plugins = cfg.options.plugins || {};
  const ink = cssVar("--ink") || "#20302a";
  const muted = cssVar("--muted") || "#5f6b64";
  const grid = cssVar("--line") || "#eef2ef";
  cfg.options.plugins.legend = Object.assign(
    { labels: { font: CH_FONT, color: ink, boxWidth: 12, padding: 12 } },
    cfg.options.plugins.legend || {},
  );
  cfg.options.plugins.tooltip = Object.assign(
    { rtl: true, textDirection: "rtl", bodyFont: CH_FONT, titleFont: CH_FONT },
    cfg.options.plugins.tooltip || {},
  );
  if (cfg.options.scales) {
    for (const k of Object.keys(cfg.options.scales)) {
      const sc = cfg.options.scales[k];
      sc.ticks = Object.assign({ font: CH_FONT, color: muted }, sc.ticks || {});
      sc.grid = Object.assign({ color: grid }, sc.grid || {});
    }
  }
  CHARTS.push(new Chart(el, cfg));
}
function chartCard(id, title, sub, wide) {
  return `<div class="chartcard${wide ? " wide" : ""}"><h5>${esc(title)}</h5>
    <p>${esc(sub)}</p><div class="chartbox"><canvas id="${id}"></canvas></div></div>`;
}

/* ── مؤسساتي ── */
let MTEAM = null;
function rMine() {
  const arch = ARCHIVED
    ? `<div class="tip amber"><b>${esc(VYEAR)} عام مؤرشف.</b>
       النتائج معروضة كما وردت في الملفات المركزية، وحُسبت بالمعادلة اللوغاريتمية السابقة
       ومسطرتها. لا تُقارَن بنقاط المنصة ولا يُدخل فيها تقييم.</div>`
    : "";
  const teams = myTeams();
  const multi = teams.length > 1;
  // النطاق متعدد الفرق: تبويب لكل فريق بدل عرض كل المؤسسات دفعة واحدة
  if (multi && !teams.includes(MTEAM)) MTEAM = teams[0];
  const rows = multi ? ROWS.filter((x) => x.team === MTEAM) : ROWS;
  const d = done(rows);
  const scopeTxt = ME.role === "eval"
    ? "مسندة إليك"
    : multi
    ? "ضمن الفريق المختار، ولك إدخال التقييم وتعديله في أيٍّ منها"
    : "ضمن فريقك، ولك إدخال التقييم وتعديله في أيٍّ منها";
  return `<h3 class="st">${
    ME.role === "eval" ? "مؤسساتي" : multi ? "مؤسسات الفرق والتقييم" : "مؤسسات الفريق والتقييم"
  }</h3>
  <p class="sl">${esc(ME.name)} · ${
    multi ? `${teams.length} فرق ضمن نطاقك` : esc(teams[0] ?? "")
  } — ${rows.length} مؤسسة ${scopeTxt}.</p>${arch}
  ${
    multi
      ? `<div class="asgtabs">${
        teams.map((t) =>
          `<button class="ytab${t === MTEAM ? " on" : ""}" data-mteam="${esc(t)}"
            style="--yc:${AXC[(META.teamMeta[t].no % 4) + 1]}">${esc(META.teamMeta[t].tab)}
            <span class="ybadge">${ROWS.filter((x) => x.team === t).length}</span></button>`
        ).join("")
      }</div>`
      : ""
  }
  ${
    PERMS.includes("assign") && !ARCHIVED
      ? `<div style="margin-bottom:12px"><button class="btn" id="mineAdd">إضافة مؤسسات</button></div>`
      : ""
  }
  <div class="kpis">
   <div class="kpi"><div class="lbl">مؤسسة مسندة</div><div class="val">${rows.length}</div></div>
   <div class="kpi"><div class="lbl">مكتملة</div><div class="val">${d.length}</div></div>
   <div class="kpi amber"><div class="lbl">قيد التقييم</div><div class="val">${
    rows.filter((x) => x.status === "قيد التقييم").length
  }</div></div>
   <div class="kpi red"><div class="lbl">لم تبدأ</div><div class="val">${
    rows.filter((x) => x.status === "لم يبدأ").length
  }</div></div>
   <div class="kpi blue"><div class="lbl">نسبة الإنجاز</div><div class="val">${
    rows.length ? (d.length / rows.length * 100).toFixed(0) : 0
  }<small>%</small></div></div>
   <div class="kpi"><div class="lbl">متوسط النتيجة</div><div class="val">${
    d.length ? avgOf(d).toFixed(1) + "%" : "—"
  }</div></div>
  </div>
  <div class="tbl"><table><thead><tr><th style="width:78px">الرمز</th><th>المؤسسة</th>
   <th style="width:96px">القطاع</th>
   <th style="width:120px">المرحلة</th><th style="width:70px">الجنس</th><th style="width:62px">الطلبة</th>
   <th style="width:110px">التصنيف</th>${ME.role === "eval" ? "" : '<th style="width:80px">المقيّم</th>'}
   <th style="width:105px">الحالة</th><th style="width:72px">النتيجة</th><th style="width:115px">التقدير</th>
   <th style="width:80px"></th></tr></thead><tbody>` +
    rows.map((x) =>
      `<tr><td class="mono">${x.id}</td><td class="r">${esc(x.name)}</td>
      <td><span class="pill ${SECP[x.sector] ?? ""}">${esc(x.sector)}</span></td>
      <td>${esc(x.stage ?? "غير مسجَّل")}</td><td>${esc(x.gender ?? "غير مسجَّل")}</td>
      <td>${x.students ?? "—"}</td><td>${esc(x.size ?? "—")}</td>
      <td><span class="pill" style="background:${SC[x.status]}22;color:${
        SC[x.status]
      }">${x.status}</span></td>
${
        ME.role === "eval"
          ? ""
          : `<td class="mono">${esc(x.evaluator)}${
            EVNAMES[x.evaluator] ? `<div class="ogl">${esc(EVNAMES[x.evaluator].name)}</div>` : ""
          }</td>`
      }
      <td><b>${x.pct !== null ? x.pct + "%" : "—"}</b></td>
      <td>${
        x.level
          ? `<span class="pill" style="background:${lvlColor(x.level)};color:#fff">${x.level}</span>`
          : "—"
      }</td>
      <td style="white-space:nowrap">${
        ARCHIVED ? "" : `<button class="btn sm" data-open="${x.id}">${EDITABLE ? "تقييم" : "عرض"}</button>`
      }${
        EDITABLE && ME.role === "eval" ? `<button class="btn sm ghost" data-move="${x.id}">نقل</button>` : ""
      }</td></tr>`
    ).join("") +
    `</tbody></table></div>`;
}

/* ── شاشة إدخال التقييم — المؤشرات التفصيلية ── */
const ROLEP = {
  eval: "blue",
  lead: "amber",
  super: "purple",
  director: "purple",
  tech: "",
};
const SECP = { "حكومية": "blue", "خاصة": "amber", "رياض أطفال": "purple" };
const MODEP = { "نسبة": "blue", "عدد": "amber", "وصفي": "purple" };
let EV = null; // { inst, defs, raw }

/**
 * شاشة التقييم صفحة كاملة لا نافذة منبثقة: المؤشرات 31/25 مع ملاحظاتها
 * أطول من أن تُقرأ في نافذة، وعلى الجوال كانت النافذة تحجب الشاشة كلها.
 */
let EVBACK = null;
async function openEval(id) {
  const x = ROWS.find((r) => r.id === id);
  EVBACK = SEC;
  $("#modal").classList.remove("on");
  $("#content").innerHTML =
    `<div class="card" style="text-align:center;color:var(--muted)">جارٍ تحميل المؤشرات…</div>`;
  globalThis.scrollTo(0, 0);
  let K;
  try {
    K = await api("/api/kpis?inst=" + encodeURIComponent(id));
  } catch (e) {
    $("#content").innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
    return;
  }
  // القيم من الخادم لا من نسخة الجدول في المتصفح، فقد تكون قديمة
  EV = { inst: x, defs: K, raw: JSON.parse(JSON.stringify(K.kpi ?? {})), rev: K.rev ?? 0 };
  const assumed = K.kpis.filter((k) => k.assumed).map((k) => k.n);
  const tuned = K.kpis.filter((k) => k.tgtEff !== k.tgtBase).map((k) => k.n);

  let h = `<div id="evBarSpace"></div>
   <div class="evbar" id="evBar">
     <div class="eb-name">${esc(x.name)}</div>
     <div class="eb-stats">
       ${donut("ebPctD", 54, 6.5, "النتيجة")}
       ${donut("ebFillD", 46, 5.5, "الاكتمال")}
       <span class="eb-s"><b id="ebPts">—</b><i>نقطة من ${fmt(K.cap)}</i></span>
       <span class="eb-s"><b id="ebLvl">—</b><i>التقدير</i></span>
     </div>
     <div class="eb-ax" id="ebAx">${
    [1, 2, 3, 4].map((a) =>
      `<button class="ebax" data-ebax="${a}" style="--yc:${AXD[a]}"
        title="${esc(META.axname[a])}">
        ${donut("ebAxD" + a, 38, 4.5, ["الأول", "الثاني", "الثالث", "الرابع"][a - 1], AXD[a])}
        <span class="ebax-c" id="ebAxC${a}">0/${K.kpis.filter((k) => k.ax === a).length}</span>
      </button>`
    ).join("")
  }</div>
     <span class="eb-save" id="ebSave">لا تغييرات</span>
     ${EDITABLE ? '<button class="btn sm" id="evSave">حفظ الآن</button>' : ""}
     <button class="btn sm ghost" id="evBackTop">رجوع</button>
   </div>
   <div class="evhead"><div>
     <div style="font-size:12px;opacity:.85">${x.id} · ${esc(x.sector)} · ${esc(x.team)} · ${
    esc(x.stage ?? "مرحلة غير مسجَّلة")
  }${x.stageTop ? " ← " + esc(x.stageTop) : ""} · ${esc(x.gender ?? "جنس غير مسجَّل")}${
    x.size ? " · " + esc(x.size) : ""
  }</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">${esc(x.name)}</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="evBack">رجوع</button></div>
   <div class="evbody">
     <div class="cdbar" id="cdBar">
       <div class="cd-t">بيانات المؤسسة لهذا العام
         <span>تُدخل مرة واحدة، وتُسحب مقاماً في ${
    K.kpis.filter((k) => k.centralField).length
  } مؤشراً</span></div>
       ${
    META.centralFields.map(([f, lbl]) =>
      `<label class="cd-f"><span>${esc(lbl)}</span>
        <input type="number" min="0" step="1" id="cd_${f}" value="${K.central?.[f] ?? ""}" ${
        EDITABLE && PERMS.includes("central") ? "" : "disabled"
      }></label>`
    ).join("")
  }
       <div class="cd-f"><span>التصنيف المشتق</span><b id="cdSize">${esc(x.size ?? "—")}</b></div>
       <span class="eb-save" id="cdState">${
    EDITABLE && PERMS.includes("central") ? "الحفظ تلقائي" : "عرض فقط"
  }</span>
     </div>

     <div class="axfilter" id="axFilter">
       <button class="ytab on" data-ax="0" style="--yc:var(--muted)">كل المحاور</button>
       ${
    [1, 2, 3, 4].map((a) =>
      `<button class="ytab" data-ax="${a}" style="--yc:${AXC[a]}">${esc(META.axname[a])}
        <span class="ybadge">${K.kpis.filter((k) => k.ax === a).length}</span></button>`
    ).join("")
  }
       <button class="ytab" data-ax="-1" style="--yc:var(--amber)">غير المكتملة
         <span class="ybadge" id="axLeft">—</span></button>
     </div>
     <div class="tip">أدخل الأرقام الخام لكل مؤشر كما هي من أدوات القياس. نسبة التنفيذ تُحسب في الخادم
       ولها حد أعلى 100%، والتقدير يظهر بعد استكمال المؤشرات الـ${K.kpis.length} كلها.</div>`;
  if (tuned.length) {
    h += `<div class="tip amber">مستهدفات مضبوطة من الحساب الفني في ${tuned.length} مؤشراً
      (${tuned.join(" · ")}). المستهدف الأصلي من الخطة يظهر تحت كل خانة.</div>`;
  }
  if (K.editingBy) {
    h += `<div class="tip red"><b>${esc(K.editingBy.name)} (${esc(K.editingBy.id)})</b>
      فتح تقييم هذه المؤسسة خلال الدقائق الماضية. التنسيق قبل الإدخال يمنع ضياع العمل،
      وإن حفظ قبلك فسيُرفض حفظك حتى تحدّث الشاشة.</div>`;
  }
  if (K.savedByName) {
    h += `<div class="tip">آخر حفظ: <b>${esc(K.savedByName)}</b> في ${
      new Date(K.savedAt).toLocaleString("ar-BH-u-nu-latn")
    } · المراجعة ${K.rev}.</div>`;
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
    h += `<div class="axbox"><div class="axhead" style="background:${AXD[a]}">
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
        if (k.denom && k.centralField) {
          h += `<div class="fld"><label>${esc(k.denom)} — مركزي</label>
            <div class="tgt" id="cv${k.n}">${k.centralValue ?? "—"}</div>
            <div class="ogl" id="cvl${k.n}">${
            k.centralValue === null ? '<b style="color:var(--red)">غير مُدخل</b>' : "من بيانات المؤسسة"
          }</div></div>`;
        } else if (k.denom) {
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
        <div class="fres" id="r${k.n}"></div></div>
        <div class="knote">
          <button type="button" class="notebtn" data-note="${k.n}">${
        EV.raw[k.n]?.note ? "ملاحظة \u2713" : "إضافة ملاحظة"
      }</button>
          <textarea class="noteta" id="nt${k.n}" rows="2" data-k="${k.n}" data-f="note"
            placeholder="ملاحظة اختيارية على هذا المؤشر" ${EV.raw[k.n]?.note ? "" : "hidden"}>${
        esc(EV.raw[k.n]?.note ?? "")
      }</textarea>
        </div></div>`;
    });
    h += `</div>`;
  });

  h += `<h4 class="blk">النتيجة حسب المسطرة المعتمدة</h4>
   <div id="evSum"></div>
   <h4 class="blk">الأداء التراكمي والدورات السابقة</h4>
   <p class="sl">تُحمَّل عند الطلب حتى لا تُثقل شاشة الإدخال.</p>
   <button class="btn ghost" id="evHistBtn">عرض المقارنة بالدورات السابقة</button>
   <div id="evHist"></div>
   <h4 class="blk">ملاحظات عامة على أداء المؤسسة وتقييمها</h4>
   <textarea id="evNotes" rows="5"
     placeholder="ملاحظة اختيارية: ما لوحظ في الزيارة، وما يفسّر النتيجة، وما يُقترح للمتابعة">${
    esc(K.notes ?? "")
  }</textarea>
   <h4 class="blk">قصة نجاح</h4>
   <label class="ckrow"><input type="checkbox" id="stOn" ${K.story?.on ? "checked" : ""}>
     <span>ترشيح هذه المؤسسة كقصة نجاح</span></label>
   <div id="stBox" ${K.story?.on ? "" : "hidden"}>
     <p class="sl">الترشيح توصية منك؛ اعتماد قصص النجاح من رئيس الفريق وبحد أقصى
       ${META.maxPicks} مؤسسات لكل فريق من ضمن الأعلى أداءً.</p>
     <textarea id="stText" rows="5"
       placeholder="ما الذي يستحق أن يُروى؟ الممارسة، وما تغيّر فعلاً، والنتائج المقيسة إن وُجدت">${
    esc(K.story?.text ?? "")
  }</textarea>
   </div>
   <div style="display:flex;gap:9px;margin-top:15px;flex-wrap:wrap;align-items:center">
     ${EDITABLE ? '<button class="btn" id="evSaveBottom">حفظ التقييم</button>' : ""}
     <button class="btn ghost" id="evCancel">إلغاء</button>
     <span id="evProg" style="font-size:12px;color:var(--muted);font-weight:700"></span></div>
   </div>`;
  $("#content").innerHTML = h;

  const missCentral = K.kpis.filter((k) => k.centralField && k.centralValue === null);
  if (missCentral.length) {
    const box = document.createElement("div");
    box.className = "tip red";
    box.style.margin = "0 0 14px";
    box.innerHTML = `بيانات المؤسسة المركزية ناقصة، فتعذّر حساب ${missCentral.length} مؤشراً تعتمد عليها ` +
      `(${missCentral.map((k) => k.n).join(" · ")}). أدخلها في الشريط أعلى الشاشة.`;
    $("#content").querySelector(".evbody").prepend(box);
  }
  if (!EDITABLE) {
    $("#content").querySelectorAll("[data-k], #evNotes, #stOn, #stText").forEach((el) => el.disabled = true);
  }
  $("#content").querySelectorAll("[data-k]").forEach((el) => {
    const ev = el.tagName === "SELECT" ? "onchange" : "oninput";
    el[ev] = () => {
      const n = el.dataset.k, f = el.dataset.f;
      EV.raw[n] = EV.raw[n] || {};
      if (el.value === "" || (f === "note" && el.value.trim() === "")) delete EV.raw[n][f];
      else EV.raw[n][f] = el.value;
      if (!Object.keys(EV.raw[n]).length) delete EV.raw[n];
      if (f !== "note") evCalc();
      evTouch();
    };
  });
  $("#content").querySelectorAll("[data-note]").forEach((b) =>
    b.onclick = () => {
      const ta = $("#nt" + b.dataset.note);
      ta.hidden = !ta.hidden;
      if (!ta.hidden) ta.focus();
      b.textContent = ta.value.trim() ? "ملاحظة ✓" : (ta.hidden ? "إضافة ملاحظة" : "إخفاء الملاحظة");
    }
  );
  if ($("#stOn")) {
    $("#stOn").onchange = () => {
      $("#stBox").hidden = !$("#stOn").checked;
      evTouch();
    };
  }
  ["#evNotes", "#stText"].forEach((id) => {
    const el = $(id);
    if (el) el.oninput = evTouch;
  });
  // حفظ تلقائي بعد سكون قصير، مع بيان حالة صريح حتى لا يشكّ المقيّم في الحفظ
  const marks = (t, cls) => {
    const el = $("#ebSave");
    if (el) {
      el.textContent = t;
      el.className = "eb-save " + (cls ?? "");
    }
  };
  EV.dirty = false;
  EV.timer = null;
  EV.mark = marks;
  const back = () => {
    SEC = EVBACK ?? "mine";
    render();
  };
  $("#evBack").onclick = $("#evCancel").onclick = back;
  if ($("#evBackTop")) $("#evBackTop").onclick = back;
  if ($("#evSave")) $("#evSave").onclick = () => evSave(false);
  if ($("#evSaveBottom")) $("#evSaveBottom").onclick = () => evSave(false);
  marks(EDITABLE ? "الحفظ تلقائي" : "عرض فقط", "");
  evCalc();
  $("#evHistBtn").onclick = () => {
    $("#evHistBtn").disabled = true;
    $("#evHist").innerHTML =
      `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
    evHistory(id);
  };
  wireCentralBar(id);
  wireAxFilter();
  document.querySelectorAll("[data-ebax]").forEach((b) =>
    b.onclick = () => {
      const t = document.querySelector(`#axFilter [data-ax="${b.dataset.ebax}"]`);
      if (t) {
        t.click();
        t.scrollIntoView({ block: "center" });
      }
    }
  );
  evBarFit();
  globalThis.addEventListener("resize", evBarFit);
}

/** الشريط مثبّت في أعلى النافذة، ونحجز مكانه بفاصل بارتفاعه حتى لا يقفز المحتوى. */
function evBarFit() {
  const bar = document.getElementById("evBar");
  const sp = document.getElementById("evBarSpace");
  if (!bar || !sp) return;
  // الشريط العلوي لاصق فوقنا، فنضع شريط النتيجة تحته لا خلفه
  const tb = document.querySelector(".topbar");
  const top = tb ? Math.round(tb.getBoundingClientRect().height) : 0;
  bar.style.top = top + "px";
  sp.style.height = bar.offsetHeight + "px";
}

/**
 * بيانات المؤسسة داخل شاشة التقييم: تُحفظ وحدها بحفظ تلقائي مستقل عن التقييم،
 * ثم تُحدَّث المقامات المركزية في المؤشرات وتُعاد الحسبة دون إعادة بناء الشاشة
 * حتى لا يضيع ما يكتبه المقيّم.
 */
function wireCentralBar(instId) {
  const st = (t, c) => {
    const el = $("#cdState");
    if (el) {
      el.textContent = t;
      el.className = "eb-save " + (c ?? "");
    }
  };
  const rule = META.sizeRule[EV.inst.team === "رياض الأطفال" ? "kg" : "school"];
  let timer = null;
  META.centralFields.forEach(([f]) => {
    const el = $("#cd_" + f);
    if (!el || el.disabled) return;
    el.oninput = () => {
      if (f === "students") {
        const v = Number(el.value);
        const hit = el.value === "" ? null : rule.find(([, a, b]) => v >= a && (b === null || v <= b));
        $("#cdSize").textContent = hit ? hit[0] : "—";
      }
      st("تغييرات غير محفوظة", "warn");
      clearTimeout(timer);
      timer = setTimeout(async () => {
        st("جارٍ الحفظ…", "");
        const row = { id: instId };
        META.centralFields.forEach(([g]) => row[g] = $("#cd_" + g).value);
        try {
          await api("/api/central", { method: "POST", body: { year: VYEAR, rows: [row] } });
          const fresh = await api("/api/kpis?inst=" + encodeURIComponent(instId));
          const byN = {};
          fresh.kpis.forEach((k) => byN[k.n] = k);
          EV.defs.kpis.forEach((k) => {
            if (!k.centralField) return;
            k.centralValue = byN[k.n]?.centralValue ?? null;
            const cell = $("#cv" + k.n), lbl = $("#cvl" + k.n);
            if (cell) cell.textContent = k.centralValue === null ? "—" : fmt(k.centralValue);
            if (lbl) {
              lbl.innerHTML = k.centralValue === null
                ? '<b style="color:var(--red)">غير مُدخل</b>'
                : "من بيانات المؤسسة";
            }
          });
          EV.defs.central = fresh.central;
          st("محفوظ", "ok");
          evCalc();
        } catch (e) {
          st("تعذّر الحفظ", "err");
          toast(e.message, true);
        }
      }, 1200);
    };
  });
}

/** فلتر المحاور: يخفي صناديق المحاور غير المختارة أو المؤشرات المكتملة. */
function wireAxFilter() {
  const btns = [...document.querySelectorAll("#axFilter [data-ax]")];
  btns.forEach((b) =>
    b.onclick = () => {
      btns.forEach((x) => x.classList.toggle("on", x === b));
      const a = Number(b.dataset.ax);
      document.querySelectorAll("#content .axbox").forEach((box, i) => {
        box.hidden = a > 0 && i + 1 !== a;
      });
      document.querySelectorAll("#content .frow").forEach((row) => {
        const n = row.querySelector("[data-note]")?.dataset.note;
        row.hidden = a === -1 && !!n && EV.raw[n] !== undefined &&
          $("#r" + n)?.querySelector(".chip")?.textContent.includes("نسبة التنفيذ");
      });
      if (a === -1) {
        document.querySelectorAll("#content .axbox").forEach((box) => {
          box.hidden = ![...box.querySelectorAll(".frow")].some((r) => !r.hidden);
        });
      }
    }
  );
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
    <div class="kpi"><div class="lbl">دورات على المنهجية الحالية</div><div class="val">${
    d.cycles.filter((x) => !x.archived).length
  }</div></div>
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
      <th style="width:110px">المنهجية</th>
      <th style="width:90px">النتيجة</th><th style="width:130px">التقدير</th>` +
      [1, 2, 3, 4].map((a) => `<th style="background:${AXD[a]}">محور ${a}</th>`).join("") +
      `</tr></thead><tbody>` +
      d.cycles.map((x) =>
        `<tr><td class="r">${esc(x.year)}</td>
        <td><span class="pill ${x.archived ? "amber" : "blue"}">${esc(x.basis)}</span></td>
        <td><b>${x.pct}%</b></td>
        <td style="color:${lvlColor(x.level)};font-weight:700">${x.level}</td>` +
        [1, 2, 3, 4].map((a) => `<td>${x.axes[a] === null ? "—" : x.axes[a] + "%"}</td>`).join("") +
        `</tr>`
      ).join("") + `</tbody></table></div>`;
  }
  if (d.cycles.length) {
    h += `<div class="charts">${
      chartCard("chCyc", "مسار المؤسسة عبر الدورات", "لكل عام لونه المخصص · المؤرشف بمنهجية مختلفة", true)
    }</div>`;
  }
  if (d.prev) {
    h += `<div class="tip">دورة <b>${esc(d.prev.year)}</b> مؤرشفة من الملفات المركزية
      بالمعادلة اللوغاريتمية السابقة، فلا تُقارَن بنقاط الحساب الخطي ولا تدخل في المتوسط التراكمي.
      المقارنة المحورية تبدأ من ثاني دورة تُدخَل في المنصة.</div>`;
  } else {
    h += `<div class="tip">لا توجد نتيجة مؤرشفة لهذه المؤسسة في الملفات المركزية.</div>`;
  }
  box.innerHTML = h;
  if (!d.cycles.length) return;
  const cyc = [...d.cycles].reverse();
  drawChart("chCyc", {
    type: "bar",
    data: {
      labels: cyc.map((c) => c.year),
      datasets: [{
        label: "نتيجة المؤسسة",
        data: cyc.map((c) => c.pct),
        backgroundColor: cyc.map((c) => yearColor(c.year)),
        borderRadius: 6,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (t) => `المنهجية: ${cyc[t.dataIndex].basis}` } },
      },
      scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
    },
  });
}

/** حساب محلي للعرض الفوري — الحساب المعتمد يبقى في الخادم ويُعاد بعد الحفظ. */
function evRow(k, raw) {
  const jv = raw?.j;
  if (jv === undefined || jv === "") return null;
  if (!k.tgtEff) return null;
  let K;
  if (k.mode === "نسبة" && k.denom) {
    // المقام المركزي يحكم متى توفّر، تماماً كما يحسبه الخادم
    const iv = k.centralField ? k.centralValue : raw?.i;
    if (iv === undefined || iv === null || iv === "" || Number(iv) === 0) return null;
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
      // المؤشر النسبي يحتاج المقام والبسط معاً؛ نبيّن الناقص بدل صمت «لم يُملأ»
      const raw = EV.raw[k.n] ?? {};
      const needDen = k.mode === "نسبة" && k.denom && !k.centralField;
      let msg = "لم يُملأ";
      if (needDen && raw.j && !raw.i) msg = "بانتظار " + k.denom;
      else if (needDen && raw.i && !raw.j) msg = "بانتظار " + k.numer;
      else if (k.centralField && k.centralValue === null && raw.j) msg = "المقام المركزي غير مُدخل";
      if (box) {
        box.innerHTML = `<span class="chip${msg === "لم يُملأ" ? "" : " warn"}">${esc(msg)}</span>`;
      }
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
  // الشريط اللاصق: النتيجة أمام المقيّم دائماً وهو ينزل بين المؤشرات
  const setb = (id, v) => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  setb("#ebPts", pts.toFixed(1));
  const lvNow = (p) => {
    let L = META.rubric[0];
    META.rubric.forEach((b) => {
      if (p >= b.a) L = b;
    });
    return L;
  };
  setDonut(
    "ebPctD",
    pct,
    pct === null ? "—" : pct.toFixed(0) + "%",
    pct === null ? "var(--line)" : lvlColor(lvNow(pct).n),
  );
  const fpc = K.kpis.length ? filled / K.kpis.length * 100 : 0;
  setDonut("ebFillD", fpc, `${filled}/${K.kpis.length}`, fpc >= 100 ? "var(--green)" : "var(--amber)");
  const lvEl = $("#ebLvl");
  if (lvEl) {
    let L2 = META.rubric[0];
    if (pct !== null) {
      META.rubric.forEach((b) => {
        if (pct >= b.a) L2 = b;
      });
    }
    lvEl.textContent = pct === null ? "بعد الاكتمال" : L2.n;
    lvEl.style.color = pct === null ? "" : lvlColor(L2.n);
  }
  const left = $("#axLeft");
  if (left) left.textContent = K.kpis.length - filled;
  // حالة كل محور لحظياً: النسبة وعدد المملوء من مؤشراته
  [1, 2, 3, 4].forEach((a) => {
    const tot = K.kpis.filter((k) => k.ax === a).length;
    const c = $("#ebAxC" + a);
    const pc = axn[a] === tot ? Math.round(axp[a] / K.axw[a] * 1000) / 10 : null;
    // النسبة الجزئية تُعرض بنجمة لأن المحور لم تكتمل مؤشراته بعد
    const part = axn[a] ? Math.round(axp[a] / K.axw[a] * 1000) / 10 : null;
    setDonut(
      "ebAxD" + a,
      part,
      part === null ? "—" : Math.round(part) + (pc === null ? "%*" : "%"),
      part === null ? "var(--line)" : (pc === null ? AXD[a] : lvlColor(lvNow(part).n)),
    );
    if (c) {
      c.textContent = `${axn[a]}/${tot}`;
      c.classList.toggle("done", axn[a] === tot);
    }
  });
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
/** كل تعديل يُعلَّم ويُحفظ بعد ثانية ونصف من السكون. */
function evTouch() {
  if (!EDITABLE || !EV || EV.conflict) return;
  EV.dirty = true;
  EV.mark("تغييرات غير محفوظة", "warn");
  clearTimeout(EV.timer);
  EV.timer = setTimeout(() => evSave(true), 1500);
}

async function evSave(auto) {
  if (!EV) return;
  clearTimeout(EV.timer);
  EV.mark("جارٍ الحفظ…", "");
  try {
    const r = await api("/api/evaluation", {
      method: "POST",
      body: {
        instId: EV.inst.id,
        kpi: EV.raw,
        notes: $("#evNotes").value,
        story: { on: $("#stOn").checked, text: $("#stText").value },
        rev: EV.rev,
      },
    });
    EV.dirty = false;
    EV.rev = r.rev ?? EV.rev;
    EV.mark(`محفوظ · ${r.filled} من ${r.total}`, "ok");
    if (!auto) {
      toast(`حُفظ التقييم — ${r.status} · ${r.filled} من ${r.total} مؤشراً`);
      SEC = EVBACK ?? "mine";
      await render();
    }
  } catch (e) {
    // تعارض: لا نكتب فوق عمل غيرنا ولا نكرّر المحاولة تلقائياً
    if (e.conflict) {
      clearTimeout(EV.timer);
      EV.conflict = true;
      EV.mark("تعارض — حدّث الشاشة", "err");
      showConflict(e.message);
      return;
    }
    EV.mark("تعذّر الحفظ — أعد المحاولة", "err");
    toast(e.message, true);
  }
}

/** لافتة تعارض ثابتة: الخيار الوحيد المعروض هو التحديث، لا الكتابة فوق الآخر. */
function showConflict(msg) {
  if (document.getElementById("evConf")) return;
  const d = document.createElement("div");
  d.id = "evConf";
  d.className = "tip red";
  d.style.margin = "0 0 12px";
  d.innerHTML = `<b>تعذّر الحفظ — تعارض تحرير.</b> ${esc(msg)}
    <div style="margin-top:9px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="evReload">تحديث الشاشة بآخر نسخة</button></div>`;
  const body = $("#content").querySelector(".evbody");
  if (body) body.prepend(d);
  $("#evReload").onclick = () => openEval(EV.inst.id);
}

/* ── لوحة الفريق ── */
function rTeam() {
  const teams = myTeams();
  return `<h3 class="st">${teams.length > 1 ? "لوحة الفرق" : "لوحة الفريق"}</h3>
  <p class="sl">${
    teams.length > 1 ? `${teams.length} فرق ضمن نطاقك` : esc(teams[0] ?? "")
  } — نسب الإنجاز ومتوسط النتائج، لكل فريق جدوله.</p>` +
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
      <div class="tbl" style="margin:0"><table><thead><tr><th style="width:78px">اسم المستخدم</th>
      <th style="min-width:170px">الموظف</th>
      <th style="width:70px">مسندة</th><th style="width:70px">مكتملة</th><th style="width:80px">قيد التقييم</th>
      <th style="width:70px">لم تبدأ</th><th style="width:170px">نسبة الإنجاز</th>
      <th style="width:90px">متوسط النتيجة</th></tr></thead><tbody>` +
        evs.map((e) => {
          const m = list.filter((x) => x.evaluator === e), dm = done(m);
          const r = m.length ? dm.length / m.length * 100 : 0;
          const acc = EVNAMES[e];
          return `<tr><td class="mono">${e}</td>
          <td class="r">${
            acc
              ? `${esc(acc.name)}<div class="ogl">${esc(acc.title)}</div>`
              : '<span style="color:var(--muted)">غير مسجَّل</span>'
          }</td>
          <td>${m.length}</td><td><b>${dm.length}</b></td>
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
  <h4 class="blk">الصورة العامة</h4>
  <div class="charts">
    ${chartCard("chDist", "توزيع التقديرات", "المؤسسات المكتملة حسب المسطرة المعتمدة")}
    ${chartCard("chAx", "متوسط نسبة التنفيذ لكل محور", "على المؤسسات المكتملة في هذا النطاق")}
    ${
    ME.role === "eval"
      ? ""
      : chartCard("chTeam", "نسبة الإنجاز لكل فريق", "المكتمل من إجمالي مؤسسات الفريق", true)
  }
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
  <h4 class="blk">حسب القطاع</h4>${statTable(ROWS, "القطاع", "sector")}
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
  setTimeout(statsCharts, 0);
  return h;
}

/** رسوم شاشة الإحصاءات — تُستدعى بعد إدراج الـcanvas في الصفحة. */
function statsCharts() {
  const d = done(ROWS);
  const dist = META.rubric.map((b) => d.filter((x) => x.level === b.n).length);
  drawChart("chDist", {
    type: "doughnut",
    data: {
      labels: META.rubric.map((b) => b.n),
      datasets: [{
        data: dist,
        backgroundColor: META.rubric.map((b) => lvlColor(b.n)),
        borderColor: cssVar("--card") || "#fff",
        borderWidth: 2,
      }],
    },
    options: { cutout: "58%", plugins: { legend: { position: "bottom" } } },
  });
  const avgAx = [1, 2, 3, 4].map((a) => {
    const vs = d.map((x) => x.axes?.[a]).filter((v) => v !== null && v !== undefined);
    return vs.length ? Math.round(vs.reduce((s, v) => s + v, 0) / vs.length * 10) / 10 : 0;
  });
  drawChart("chAx", {
    type: "bar",
    data: {
      labels: [1, 2, 3, 4].map((a) => META.axname[a]),
      datasets: [{
        label: "نسبة التنفيذ",
        data: avgAx,
        backgroundColor: [1, 2, 3, 4].map((a) => AXC[a]),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
    },
  });
  if (ME.role === "eval") return;
  const teams = [...new Set(ROWS.map((x) => x.team))];
  drawChart("chTeam", {
    type: "bar",
    data: {
      labels: teams.map((t) => `${t} · ${META.teamMeta[t]?.code ?? ""}`),
      datasets: [
        {
          label: "مكتملة",
          data: teams.map((t) => ROWS.filter((x) => x.team === t && x.status === "مكتمل").length),
          backgroundColor: yearColor(VYEAR),
          borderRadius: 5,
        },
        {
          label: "لم تكتمل",
          data: teams.map((t) => ROWS.filter((x) => x.team === t && x.status !== "مكتمل").length),
          backgroundColor: cssVar("--line") || "#dfe6e0",
          borderRadius: 5,
        },
      ],
    },
    options: {
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });
}

/* ── أعلى 10 وقصص النجاح ── */
function rTop() {
  const canPick = ME.role !== "eval";
  let h = `<h3 class="st">أعلى 10 وقصص النجاح</h3>
  <p class="sl">لكل فريق أن يختار حتى <b>${META.maxPicks} مؤسسات</b> من أعلى ${META.topN} في فريقه.
    الوسم <span class="pill purple">مرشَّحة</span> يعني أن المقيّم رشّحها في شاشة التقييم —
    توصية لا اختياراً، والاعتماد من رئيس الفريق.</p>`;
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
        <td class="r">${esc(x.name)}${
          x.nominated
            ? ` <span class="pill purple" title="${esc(x.nomination).slice(0, 200)}">مرشَّحة</span>`
            : ""
        }</td><td>${esc(x.stage ?? "—")}</td><td><b>${x.pct}%</b></td>
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

/* ── المراسلات ── */
let THREADS = [], CONTACTS = [];

async function rMail() {
  const [t, c] = await Promise.all([api("/api/threads"), api("/api/contacts")]);
  THREADS = t.rows;
  CONTACTS = c.rows;
  const un = t.unread;
  let h = `<h3 class="st">المراسلات</h3>
  <p class="sl">مراسلة من يشاركك فريقاً ومن يشرف على نطاقك. يمكن ربط الموضوع بمؤسسة
    فيصير جزءاً من سجل عملها.</p>
  <div style="display:flex;gap:9px;margin-bottom:13px;flex-wrap:wrap;align-items:center">
    <button class="btn" id="mlNew">موضوع جديد</button>
    <span class="asgnote${un ? " on" : ""}">${un ? `${un} رسالة غير مقروءة` : "لا رسائل غير مقروءة"}</span>
  </div>`;
  if (!THREADS.length) {
    return h + `<div class="card" style="text-align:center;color:var(--muted)">
      لا مراسلات بعد. ابدأ موضوعاً جديداً.</div>`;
  }
  h += `<div class="tbl"><table><thead><tr><th style="width:44px"></th><th>الموضوع</th>
    <th style="width:150px">المؤسسة</th><th style="width:130px">المشاركون</th>
    <th style="width:120px">آخر رسالة</th><th style="width:70px"></th></tr></thead><tbody>` +
    THREADS.map((x) =>
      `<tr class="${x.unread ? "unreadrow" : ""}">
      <td>${x.unread ? `<span class="badge">${x.unread}</span>` : ""}</td>
      <td class="r"><b>${esc(x.subject)}</b>
        <div class="ogl">${x.count} رسالة · بدأه ${esc(x.by)}</div></td>
      <td>${x.instName ? esc(x.instName) : "—"}</td>
      <td class="mono" style="font-size:11px">${x.members.join(" · ")}</td>
      <td style="font-size:11px">${new Date(x.last).toLocaleString("ar-BH-u-nu-latn")}</td>
      <td><button class="btn sm" data-th-open="${x.id}">فتح</button></td></tr>`
    ).join("") + `</tbody></table></div>`;
  return h;
}

async function openThread(id) {
  $("#content").innerHTML =
    `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
  let d;
  try {
    d = await api("/api/thread?id=" + encodeURIComponent(id));
  } catch (e) {
    $("#content").innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
    return;
  }
  const nm = (u) => d.names[u] ? `${d.names[u]} (${u})` : u;
  $("#content").innerHTML = `
   <div class="evhead"><div>
     <div style="font-size:12px;opacity:.85">${
    d.thread.instName ? esc(d.thread.instName) + " · " : ""
  }${d.thread.members.length} مشاركين</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">${esc(d.thread.subject)}</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mlBack">رجوع</button></div>
   <div class="evbody">
     <div class="msgs" id="msgs">${
    d.messages.map((m) =>
      `<div class="msg${m.by === ME.id ? " mine" : ""}">
        <div class="msg-h">${esc(nm(m.by))} · ${new Date(m.at).toLocaleString("ar-BH-u-nu-latn")}</div>
        <div class="msg-b">${esc(m.text)}</div></div>`
    ).join("")
  }</div>
     <label class="kel" style="margin-top:14px">ردّك</label>
     <textarea id="mlText" rows="3" placeholder="اكتب ردّك…"></textarea>
     <div style="margin-top:10px"><button class="btn" id="mlSend">إرسال</button></div>
   </div>`;
  $("#mlBack").onclick = () => {
    SEC = "mail";
    render();
  };
  $("#mlSend").onclick = async () => {
    const text = $("#mlText").value.trim();
    if (!text) return toast("اكتب نص الرسالة", true);
    try {
      await api("/api/message", { method: "POST", body: { threadId: id, text } });
      await openThread(id);
    } catch (e) {
      toast(e.message, true);
    }
  };
  const box = $("#msgs");
  if (box) box.scrollTop = box.scrollHeight;
}

function openNewThread() {
  const insts = (ROWS ?? []).slice(0, 400);
  $("#modalBody").innerHTML = `
   <div class="mhead"><div>
     <div style="font-size:12px;opacity:.85">المراسلات</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">موضوع جديد</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <div class="fld" style="margin-bottom:12px"><label>الموضوع</label>
       <input id="thSubj" style="width:100%" placeholder="مثال: استيضاح بشأن المؤشر 8"></div>
     <div class="fld" style="margin-bottom:12px"><label>ربط بمؤسسة (اختياري)</label>
       <select id="thInst" style="width:100%"><option value="">بلا ربط</option>${
    insts.map((x) => `<option value="${x.id}">${esc(x.id)} · ${esc(x.name)}</option>`).join("")
  }</select></div>
     <label class="kel">المستلمون</label>
     <div class="contacts">${
    CONTACTS.map((a) =>
      `<label class="ckrow" style="padding:8px 12px;margin-bottom:6px">
        <input type="checkbox" class="thto" value="${a.id}">
        <span><b>${esc(a.name)}</b> <span class="mono">${a.id}</span>
          <div style="font-weight:400;font-size:11px;color:var(--muted)">${esc(a.title)}${
        a.team ? " · " + esc(a.team) : ""
      }</div></span></label>`
    ).join("")
  }</div>
     <label class="kel" style="margin-top:12px">الرسالة</label>
     <textarea id="thText" rows="4"></textarea>
     <div style="display:flex;gap:9px;margin-top:14px">
       <button class="btn" id="thSend">إرسال</button>
       <button class="btn ghost" id="thCancel">إلغاء</button></div>
   </div>`;
  $("#modal").classList.add("on");
  $("#mClose").onclick = $("#thCancel").onclick = () => $("#modal").classList.remove("on");
  $("#thSend").onclick = async () => {
    const to = [...document.querySelectorAll(".thto:checked")].map((c) => c.value);
    try {
      const r = await api("/api/threads", {
        method: "POST",
        body: {
          subject: $("#thSubj").value,
          text: $("#thText").value,
          to,
          instId: $("#thInst").value || undefined,
        },
      });
      $("#modal").classList.remove("on");
      toast("أُرسل الموضوع");
      await openThread(r.id);
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/* ── التقارير ── */
const RLEVELS = [
  ["summary", "إحصائي", "أرقام الفريق وتوزيع التقديرات ومتوسط المحاور"],
  ["detailed", "تفصيلي", "كل مؤسسة على مستوى المحاور الأربعة، مع ملاحظات المقيّمين"],
  ["full", "تفصيلي موسّع", "كل مؤشر بقيمته ومستهدفه ونسبته وملاحظته لكل مؤسسة"],
];
let REP = null;

function rReports() {
  const mine = myTeams();
  return `<h3 class="st noprint">التقارير</h3>
  <p class="sl noprint">اختر الجهة ومستوى التفصيل، ثم ولّد التقرير واطبعه أو احفظه PDF من المتصفح.</p>
  <div class="card noprint">
    <div class="finputs" style="padding:0;align-items:flex-end">
      <div class="fld" style="flex:1 1 280px"><label>الجهة المُصدِرة</label>
        <select id="rpTeam" style="width:100%">${
    mine.map((t) => `<option value="${esc(t)}">${esc(META.issuers[t].org)}</option>`).join("")
  }</select></div>
      <div class="fld"><label>العام الدراسي</label>
        <div class="tgt" style="width:auto;padding:8px 14px">${esc(VYEAR)}</div></div>
    </div>
    <h4 class="blk">مستوى التفصيل</h4>
    ${
    RLEVELS.map(([v, t, d]) =>
      `<label class="ckrow" style="align-items:flex-start">
        <input type="radio" name="rplevel" value="${v}" ${v === "summary" ? "checked" : ""}>
        <span><b>${t}</b>
          <div style="font-weight:400;font-size:11.5px;color:var(--muted);margin-top:2px">${d}</div>
        </span></label>`
    ).join("")
  }
    <h4 class="blk">ما يُدرَج في التقرير</h4>
    <label class="ckrow"><input type="checkbox" id="rpNotes" checked>
      <span>ملاحظات المقيّمين — العامة وملاحظات المؤشرات</span></label>
    <label class="ckrow"><input type="checkbox" id="rpStories" checked>
      <span>قصص النجاح — المعتمدة والمرشَّحة</span></label>
    <label class="ckrow"><input type="checkbox" id="rpCompare" checked>
      <span>المقارنة بالدورة السابقة والأداء التراكمي</span></label>
    <label class="ckrow"><input type="checkbox" id="rpTop" checked>
      <span>الأعلى أداءً وذات الأولوية في المتابعة</span></label>
    <label class="ckrow"><input type="checkbox" id="rpDoneOnly" checked>
      <span>التفصيل الموسّع للمؤسسات المكتملة فقط — يمنع مئات الصفحات الفارغة</span></label>
    <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
      <button class="btn" id="rpGen">توليد التقرير</button>
      <button class="btn ghost" id="csvBtn">تصدير CSV</button>
    </div>
  </div>
  <div id="rpOut"></div>`;
}

async function repGenerate() {
  const team = $("#rpTeam").value;
  const level = document.querySelector('input[name="rplevel"]:checked').value;
  const opt = {
    withNotes: $("#rpNotes").checked,
    withStories: $("#rpStories").checked,
    withCompare: $("#rpCompare").checked,
    withTop: $("#rpTop").checked,
    doneOnly: $("#rpDoneOnly").checked,
  };
  $("#rpOut").innerHTML = `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التوليد…</div>`;
  try {
    REP = await api(
      `/api/report?team=${encodeURIComponent(team)}&level=${level}&year=${encodeURIComponent(VYEAR)}`,
    );
  } catch (e) {
    $("#rpOut").innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
    return;
  }
  $("#rpOut").innerHTML = repHtml(REP, opt);
  repToc();
  const b = $("#rpPrint");
  if (b) b.onclick = () => globalThis.print();
  repCharts(REP);
}

function repHtml(D, opt) {
  const d = D.rows.filter((x) => x.status === "مكتمل" && x.pct !== null);
  const dist = {};
  META.rubric.forEach((b) => dist[b.n] = 0);
  d.forEach((x) => dist[x.level]++);
  const avg = d.length ? d.reduce((s, x) => s + x.pct, 0) / d.length : 0;
  const axAvg = [1, 2, 3, 4].map((a) => {
    const v = d.map((x) => x.axes?.[a]).filter((z) => z !== null && z !== undefined);
    return v.length ? Math.round(v.reduce((s, z) => s + z, 0) / v.length * 10) / 10 : 0;
  });
  const today = new Date().toLocaleDateString("ar-BH-u-nu-latn");
  const lvl = RLEVELS.find(([v]) => v === D.level)[1];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  // رقم نسخة يميّز كل إصدار: رمز الفريق + العام + ختم زمني
  const serial = `${D.teamMeta.code}/${D.year.slice(0, 4)}/${now.getFullYear()}${pad(now.getMonth() + 1)}${
    pad(now.getDate())
  }-${pad(now.getHours())}${pad(now.getMinutes())}`;

  let h = `<div class="report" id="rpDoc">
  <div style="display:flex;gap:9px;margin-bottom:14px" class="noprint">
    <button class="btn" id="rpPrint">طباعة / حفظ PDF</button>
    <span class="asgnote">تُطبع صفحات التقرير وحدها؛ شاشة الخيارات لا تدخل الطباعة.</span></div>

  <section class="rcover">
    <div class="rcover-logos">
      <img src="/img/moe-square.png" alt="وزارة التربية والتعليم">
      <img src="/img/green-square.png" alt="مبادرة التعليم الأخضر">
    </div>
    <div class="rcover-org">${esc(D.issuer.org)}</div>
    <h1>تقرير تقييم المؤسسات التعليمية</h1>
    <div class="rcover-sub">ضمن مبادرة التعليم الأخضر بمملكة البحرين</div>
    <div class="rcover-year">${esc(D.year)}</div>
    <div class="rcover-tbl"><table><tbody>
      <tr><td>مستوى التقرير</td><td>${esc(lvl)}</td></tr>
      <tr><td>عدد المؤسسات</td><td>${D.rows.length}</td></tr>
      <tr><td>تاريخ الإصدار</td><td>${today}</td></tr>
      <tr><td>أصدره</td><td>${esc(D.generatedBy.name)} — ${esc(D.generatedBy.title)}</td></tr>
      <tr><td>رقم النسخة</td><td class="mono">${esc(serial)}</td></tr>
    </tbody></table></div>
    <div class="rcover-foot">فريق التعليم الأخضر · وزارة التربية والتعليم · مملكة البحرين</div>
  </section>

  <section class="rsec rbreak"><h3 class="rsech">فهرس التقرير</h3>
    <div class="tbl"><table><thead><tr><th style="width:52px">م</th><th>القسم</th></tr></thead>
    <tbody id="rpToc"></tbody></table></div>
  </section>

  <div class="rpaper" id="rpPaper">
    <img src="/img/moe.png" alt="وزارة التربية والتعليم" class="rp-moe">
    <div class="rp-mid"><b>${esc(D.issuer.org)}</b>
      <span>تقرير تقييم المؤسسات التعليمية ضمن مبادرة التعليم الأخضر · ${esc(D.year)}</span></div>
    <img src="/img/green-square.png" alt="مبادرة التعليم الأخضر" class="rp-green">
  </div>
  <div class="rfoot" id="rpFoot">${esc(D.issuer.org)} · ${esc(D.year)} · ${
    esc(serial)
  } · صادر بتاريخ ${today}</div>

  <section class="rsec">
    <div class="rhead">
      <div><div class="rorg">${esc(D.issuer.org)}</div>
        <h2>تقرير تقييم المؤسسات التعليمية ضمن مبادرة التعليم الأخضر</h2>
        <div class="rmeta">العام الدراسي ${esc(D.year)} · ${esc(lvl)} · صادر بتاريخ ${today}</div></div>
      <div class="rbadge">${esc(D.teamMeta.code)}</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="lbl">إجمالي المؤسسات</div><div class="val">${D.rows.length}</div></div>
      <div class="kpi"><div class="lbl">مكتملة التقييم</div><div class="val">${d.length}</div></div>
      <div class="kpi"><div class="lbl">متوسط النتيجة</div><div class="val">${
    d.length ? avg.toFixed(1) + "%" : "—"
  }</div></div>
      <div class="kpi"><div class="lbl">التقدير الغالب</div><div class="val" style="font-size:16px">${
    d.length ? Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0] : "—"
  }</div></div>
    </div>
    <div class="charts">
      ${chartCard("rpDist", "توزيع التقديرات", "المؤسسات المكتملة حسب المسطرة المعتمدة")}
      ${chartCard("rpAx", "متوسط نسبة التنفيذ لكل محور", "على المؤسسات المكتملة")}
    </div>
    <div class="tbl"><table><thead><tr><th>التقدير</th><th style="width:110px">عدد المؤسسات</th>
      <th style="width:110px">النسبة</th></tr></thead><tbody>` +
    META.rubric.map((b) =>
      `<tr><td class="r" style="color:${lvlColor(b.n)};font-weight:700">${b.n}</td>
        <td>${dist[b.n]}</td><td>${d.length ? (dist[b.n] / d.length * 100).toFixed(1) : 0}%</td></tr>`
    ).join("") +
    `<tr style="background:var(--green-l);font-weight:800"><td class="r">المجموع</td>
      <td>${d.length}</td><td>100%</td></tr></tbody></table></div>
    <div class="tbl"><table><thead><tr><th>المحور</th><th style="width:120px">متوسط التنفيذ</th>
      <th style="width:120px">وزن المحور</th></tr></thead><tbody>` +
    [1, 2, 3, 4].map((a) =>
      `<tr><td class="r" style="border-right:4px solid ${AXC[a]}">${esc(META.axname[a])}</td>
        <td><b>${axAvg[a - 1]}%</b></td><td>${fmt(D.axw[a])}</td></tr>`
    ).join("") + `</tbody></table></div>
  </section>`;

  // ── قصص النجاح ──
  if (opt.withStories) {
    const picked = D.rows.filter((x) => D.picks.includes(x.id));
    const nominated = D.rows.filter((x) => x.story?.on && !D.picks.includes(x.id));
    h += `<section class="rsec"><h3 class="rsech">قصص النجاح</h3>`;
    if (!picked.length && !nominated.length) {
      h += `<div class="tip">لا قصص معتمدة ولا مرشَّحة في هذا الفريق حتى تاريخه.</div></section>`;
    }
    picked.forEach((x) => {
      const st = D.stories.find((s) => s.instId === x.id);
      h += `<div class="story"><div class="story-h"><b>${esc(x.name)}</b>
        <span class="pill" style="background:var(--green);color:#fff">معتمدة</span>
        <span class="pill">${x.pct === null ? "—" : x.pct + "%"}</span></div>
        ${st?.title ? `<div class="story-t">${esc(st.title)}</div>` : ""}
        <div class="story-b">${esc(st?.text || x.story?.text || "لم يُكتب نص القصة بعد.")}</div></div>`;
    });
    nominated.forEach((x) => {
      h += `<div class="story"><div class="story-h"><b>${esc(x.name)}</b>
        <span class="pill purple">مرشَّحة</span>
        <span class="pill">${x.pct === null ? "—" : x.pct + "%"}</span></div>
        <div class="story-b">${esc(x.story.text || "بلا تعليق.")}</div>
        <div class="story-n">ترشيح من المقيّم — لم يُعتمد بعد.</div></div>`;
    });
    h += `</section>`;
  }

  // ── ملاحظات المقيّمين ──
  if (opt.withNotes) {
    const withN = D.rows.filter((x) => x.notes || (x.kpiNotes ?? []).length);
    h += `<section class="rsec"><h3 class="rsech">ملاحظات فرق التقييم</h3>`;
    if (!withN.length) {
      h += `<div class="tip">لم تُسجَّل ملاحظات على مؤسسات هذا الفريق حتى تاريخه.</div></section>`;
    }
    withN.forEach((x) => {
      h += `<div class="rnote"><div class="rnote-h"><b>${esc(x.name)}</b>
        <span class="mono">${x.id}</span> · <span>${esc(x.evaluator)}</span></div>`;
      if (x.notes) h += `<div class="rnote-b">${esc(x.notes)}</div>`;
      (x.kpiNotes ?? []).forEach((k) => {
        h += `<div class="rnote-k"><span class="fnum" style="width:26px">${k.n}</span>
          <div><div class="rnote-kt">${esc(k.kpi)}</div>
          <div class="rnote-b">${esc(k.note)}</div></div></div>`;
      });
      h += `</div>`;
    });
    h += `</section>`;
  }

  // ── الأعلى أداءً وذات الأولوية في المتابعة ──
  if (opt.withTop && d.length) {
    const sorted = [...d].sort((a, b) => b.pct - a.pct || b.pts - a.pts);
    const top = sorted.slice(0, Math.min(10, sorted.length));
    const low = sorted.slice(-Math.min(10, sorted.length)).reverse();
    const tbl = (list, title, note) =>
      `<h4 class="blk">${title}</h4><p class="sl">${note}</p>
      <div class="tbl"><table><thead><tr><th style="width:40px">#</th><th style="width:58px">الرمز</th>
      <th>المؤسسة</th><th style="width:86px">المرحلة</th><th style="width:66px">النتيجة</th>
      <th style="width:110px">التقدير</th></tr></thead><tbody>` +
      list.map((x, i) =>
        `<tr><td><b>${i + 1}</b></td><td class="mono">${x.id}</td>
        <td class="r">${esc(x.name)}</td><td>${esc(x.stage ?? "—")}</td>
        <td><b>${x.pct}%</b></td>
        <td style="color:${lvlColor(x.level)};font-weight:700">${esc(x.level)}</td></tr>`
      ).join("") + `</tbody></table></div>`;
    h += `<section class="rsec rbreak"><h3 class="rsech">الأعلى أداءً وذات الأولوية في المتابعة</h3>
      ${tbl(top, "المؤسسات الأعلى أداءً", "مرتّبة تنازلياً بالنسبة ثم بالنقاط.")}
      ${tbl(low, "المؤسسات ذات الأولوية في المتابعة", "الأدنى نتيجةً، وتُرشَّح لزيارة متابعة.")}</section>`;
  }

  // ── المقارنة بالدورة السابقة ──
  if (opt.withCompare) {
    const withPrev = D.rows.filter((x) => x.prev && x.prev.pct !== null);
    const both = withPrev.filter((x) => x.pct !== null && !x.archived);
    h += `<section class="rsec rbreak"><h3 class="rsech">المقارنة بالدورة السابقة</h3>
      <div class="tip amber">دورة ${
      esc(withPrev[0]?.prev?.year ?? "2025-2026")
    } محسوبة بالمعادلة اللوغاريتمية السابقة ومسطرتها،
        فالمقارنة هنا على مستوى <b>النسبة والتقدير</b> فقط. نقاط المحاور في تلك الدورة
        على مقياس مفتوح ولا تُقارَن بنقاط الحساب الخطي، والمقارنة المحورية تبدأ من ثاني
        دورة تُدخَل في المنصة.</div>`;
    if (!both.length) {
      h += `<div class="tip">لا مؤسسة اكتمل تقييمها في الدورة الجارية بعد، فلا مقارنة ممكنة.</div>`;
    } else {
      const up = both.filter((x) => x.pct > x.prev.pct).length;
      const dn = both.filter((x) => x.pct < x.prev.pct).length;
      h += `<div class="kpis">
        <div class="kpi"><div class="lbl">مؤسسات قابلة للمقارنة</div><div class="val">${both.length}</div></div>
        <div class="kpi"><div class="lbl">تحسّنت</div><div class="val">${up}</div></div>
        <div class="kpi red"><div class="lbl">تراجعت</div><div class="val">${dn}</div></div>
        <div class="kpi"><div class="lbl">دون تغيّر</div><div class="val">${both.length - up - dn}</div></div>
      </div>
      <div class="tbl"><table><thead><tr><th style="width:58px">الرمز</th><th>المؤسسة</th>
      <th style="width:96px">السابقة</th><th style="width:96px">الجارية</th>
      <th style="width:80px">الفرق</th><th style="width:110px">التقدير الحالي</th></tr></thead><tbody>` +
        both.map((x) => {
          const diff = Math.round((x.pct - x.prev.pct) * 10) / 10;
          return `<tr><td class="mono">${x.id}</td><td class="r">${esc(x.name)}</td>
          <td>${x.prev.pct}% · ${esc(x.prev.verdict ?? "—")}</td><td><b>${x.pct}%</b></td>
          <td style="color:${
            diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--muted)"
          };font-weight:700">${diff > 0 ? "+" : ""}${diff}</td>
          <td style="color:${lvlColor(x.level)};font-weight:700">${esc(x.level)}</td></tr>`;
        }).join("") + `</tbody></table></div>
      <p class="sl">الحسم التراكمي يتطلب ثلاث دورات مكتملة على المنهجية الحالية، ولم تكتمل بعد.</p>`;
    }
    h += `</section>`;
  }

  // ── التفصيلي: المؤسسات على مستوى المحاور ──
  if (D.level !== "summary") {
    h += `<section class="rsec"><h3 class="rsech">المؤسسات على مستوى المحاور</h3>
      <p class="sl">نسب تنفيذ المحاور الأربعة لكل مؤسسة.</p>
      <div class="tbl rp-inst"><table><thead><tr><th style="width:58px">الرمز</th><th>المؤسسة</th>
      <th style="width:86px">المرحلة</th>` +
      [1, 2, 3, 4].map((a) =>
        `<th style="width:58px;background:${AXD[a]}">${["الأول", "الثاني", "الثالث", "الرابع"][a - 1]}</th>`
      ).join("") +
      `<th style="width:70px">النتيجة</th><th style="width:110px">التقدير</th></tr></thead><tbody>` +
      D.rows.map((x) =>
        `<tr><td class="mono">${x.id}</td><td class="r">${esc(x.name)}</td>
        <td>${esc(x.stage ?? "—")}</td>` +
        [1, 2, 3, 4].map((a) =>
          `<td>${x.axes?.[a] === null || x.axes?.[a] === undefined ? "—" : x.axes[a] + "%"}</td>`
        ).join("") +
        `<td><b>${x.pct === null ? "—" : x.pct + "%"}</b></td>
        <td style="color:${x.level ? lvlColor(x.level) : "var(--muted)"};font-weight:700">${
          esc(x.level ?? x.status)
        }</td></tr>`
      ).join("") + `</tbody></table></div></section>`;
  }

  // ── الموسّع: المؤشرات لكل مؤسسة ──
  if (D.level === "full") {
    const src = D.rows.filter((x) => (x.kpis ?? []).length);
    const list = opt.doneOnly ? src.filter((x) => x.status === "مكتمل") : src;
    if (!list.length) {
      h += `<section class="rsec rbreak"><h3 class="rsech">تفصيل المؤشرات</h3>
        <div class="tip">${
        opt.doneOnly
          ? "لم يكتمل تقييم أي مؤسسة في هذا الفريق، فلا تفصيل مؤشرات يُعرض."
          : "لا مؤسسات لعرض مؤشراتها."
      }</div></section>`;
    }
    if (opt.doneOnly && src.length !== list.length) {
      h += `<section class="rsec"><div class="tip">التفصيل الموسّع مقصور على المؤسسات المكتملة:
        ${list.length} من ${src.length}. أزل التحديد في شاشة التقارير لعرض الجميع.</div></section>`;
    }
    list.forEach((x) => {
      h += `<section class="rsec rbreak"><h3 class="rsech">${esc(x.name)} — تفصيل المؤشرات</h3>
        <div class="rmeta">${x.id} · ${esc(x.stage ?? "—")} · ${
        x.pct === null ? "غير مكتمل" : x.pct + "% · " + x.level
      }</div>
        <div class="tbl"><table><thead><tr><th style="width:40px">م</th><th>المؤشر</th>
        <th style="width:56px">النوع</th><th style="width:66px">المستهدف</th>
        <th style="width:66px">المُدخل</th><th style="width:64px">النسبة</th>
        <th style="width:66px">النقاط</th></tr></thead><tbody>` +
        x.kpis.map((k) =>
          `<tr><td class="mono">${k.n}</td>
          <td class="r" style="font-size:11px">${esc(k.kpi).slice(0, 120)}${
            k.note ? `<div class="rnote-b" style="margin-top:3px">${esc(k.note)}</div>` : ""
          }</td>
          <td>${esc(k.mode)}</td><td>${fmt(k.tgt, k.tgt % 1 ? 2 : 0)}</td>
          <td>${k.j === null ? "—" : (k.i ? `${k.j} ÷ ${k.i}` : k.j)}</td>
          <td><b>${k.pct === null ? "—" : k.pct + "%"}</b></td>
          <td>${k.pct === null ? "—" : (k.w * k.pct / 100).toFixed(1)}</td></tr>`
        ).join("") + `</tbody></table></div></section>`;
    });
  }

  // ── إجراءات فريق التعليم الأخضر: قائمة تُعلَّم يدوياً على النسخة المطبوعة ──
  const ACTIONS = [
    "مراجعة نتائج المؤسسات ذات الأولوية في المتابعة وتحديد أسباب التأخّر",
    "جدولة زيارات متابعة للمؤسسات غير المستدامة خلال ثلاثين يوماً",
    "اعتماد قصص النجاح المرشَّحة ونشرها على بقية الفرق",
    "مخاطبة الجهات المعنية بالملاحظات المتكرّرة في المحاور الأدنى تنفيذاً",
    "استكمال البيانات المركزية الناقصة للمؤسسات قبل الدورة القادمة",
    "رفع التقرير المجمّع إلى الجهة الأعلى بعد اعتماده",
  ];
  h += `<section class="rsec rbreak"><h3 class="rsech">إجراءات فريق التعليم الأخضر</h3>
    <p class="sl">تُعلَّم هذه القائمة يدوياً على النسخة المطبوعة، ويُكتب أمام كل بند ما اتُّخذ بشأنه.</p>
    ${
    ACTIONS.map((a) =>
      `<div class="actrow"><span class="actbox"></span>
        <div><div class="acttxt">${esc(a)}</div>
        <div class="actline"></div></div></div>`
    ).join("")
  }
    <div class="actrow"><span class="actbox"></span>
      <div><div class="acttxt">إجراء آخر:</div><div class="actline"></div>
      <div class="actline"></div></div></div>
  </section>`;

  // ── الاعتماد ──
  const box = (t, n) =>
    `<div class="apbox"><div class="ap-l">${esc(t)}</div>
      <div class="ap-n">${esc(n)}</div>
      <div class="ap-s">التوقيع: ....................</div>
      <div class="ap-s">التاريخ: ......... / ......... / .........</div></div>`;
  h += `<section class="rsec rbreak"><h3 class="rsech">الاعتماد</h3>
    <p class="sl">تقرير ${esc(D.issuer.org)} للعام الدراسي ${esc(D.year)}، صادر بتاريخ ${today}
      عن ${esc(D.generatedBy.name)} — ${esc(D.generatedBy.title)}.</p>
    <div class="aprow">${box(D.issuer.managerTitle, D.issuer.managerName)}${
    box(D.issuer.underTitle, D.issuer.underName)
  }</div>
    <div class="aprow">${box(D.issuer.dgTitle, D.issuer.dgName)}${
    box(D.greenLead.title, D.greenLead.name)
  }</div>
    <div class="tip">للأهمية: يُسلَّم هذا التقرير إلى فريق التعليم الأخضر بالوزارة بهدف تحليل
      النتائج وتقييمها واتخاذ الإجراءات المناسبة.</div>
  </section></div>`;
  return h;
}

/** فهرس الأقسام يُبنى من العناوين الفعلية بعد الإدراج، فلا يتخلّف عن محتوى التقرير. */
function repToc() {
  const tb = $("#rpToc");
  if (!tb) return;
  const heads = [...document.querySelectorAll("#rpDoc .rsech")]
    .filter((el) => el.textContent.trim() !== "فهرس التقرير");
  tb.innerHTML = heads.map((el, i) => {
    el.id = "rsec" + (i + 1);
    return `<tr><td class="mono">${i + 1}</td><td class="r">${esc(el.textContent.trim())}</td></tr>`;
  }).join("");
}

function repCharts(D) {
  const d = D.rows.filter((x) => x.status === "مكتمل" && x.pct !== null);
  const dist = META.rubric.map((b) => d.filter((x) => x.level === b.n).length);
  drawChart("rpDist", {
    type: "doughnut",
    data: {
      labels: META.rubric.map((b) => b.n),
      datasets: [{
        data: dist,
        backgroundColor: META.rubric.map((b) => lvlColor(b.n)),
        borderColor: cssVar("--card") || "#fff",
        borderWidth: 2,
      }],
    },
    options: { cutout: "56%", plugins: { legend: { position: "bottom" } } },
  });
  const axAvg = [1, 2, 3, 4].map((a) => {
    const v = d.map((x) => x.axes?.[a]).filter((z) => z !== null && z !== undefined);
    return v.length ? Math.round(v.reduce((s, z) => s + z, 0) / v.length * 10) / 10 : 0;
  });
  drawChart("rpAx", {
    type: "bar",
    data: {
      labels: [1, 2, 3, 4].map((a) => META.axname[a]),
      datasets: [{
        label: "نسبة التنفيذ",
        data: axAvg,
        backgroundColor: [1, 2, 3, 4].map((a) => AXC[a]),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
    },
  });
}

function dlCSV() {
  const rows = [[
    "الرمز",
    "المؤسسة",
    "الفريق",
    "القطاع",
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
      x.sector,
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
  <p class="sl">«معاينة» تفتح المنصة بعين ذلك الحساب لتجربة شاشاته وصلاحياته.
    الكتابة معطَّلة أثناء المعاينة حتى لا تُنسب بيانات لحساب لم يُدخلها،
    وكل بدء وإنهاء مسجَّل في سجل التدقيق.<br>
    عدّل الاسم والمسمى والفريق ثم اضغط «حفظ» في السطر نفسه. تغيير الفريق لا ينقل المؤسسات
    المسندة للحساب — الإسناد يُدار من الجدول التالي.<br>
    عدّل ما تشاء في أي عدد من الأسطر ثم اضغط <b>«حفظ كل التعديلات»</b> مرة واحدة —
    أو «حفظ» في سطر بعينه. تغيير <b>اسم المستخدم</b> ينقل مؤسسات الحساب وطلباته
    المعلّقة إلى الاسم الجديد ويُنهي جلساته فيدخل بالاسم الجديد.</p>
  <div style="display:flex;gap:9px;margin-bottom:11px;flex-wrap:wrap;align-items:center">
    <button class="btn" id="acNew">حساب جديد</button>
    <button class="btn" id="acSaveAll">حفظ كل التعديلات</button>
    <button class="btn ghost" id="pwSel">إعادة تعيين المحدد</button>
    <button class="btn ghost" id="pwAll">إعادة تعيين كل الحسابات</button>
    <span style="font-size:11.5px;color:var(--muted);font-weight:700">
      الافتراضية <b class="mono">${esc(META.defaultPw ?? "12345678")}</b>
      · تُنهى الجلسات ويُلزَم صاحبها بتغييرها عند أول دخول</span>
  </div>
  <div class="tbl"><table><thead><tr>
   <th style="width:36px"><input type="checkbox" id="pwCkAll" title="تحديد الكل"></th>
   <th style="width:96px">اسم المستخدم</th><th style="min-width:150px">الاسم</th>
   <th style="width:130px">الدور</th>
   <th style="min-width:150px">المسمى</th><th style="width:125px">الفريق</th>
   <th style="width:92px">كلمة المرور</th><th style="width:330px"></th></tr></thead><tbody>` +
    A.map((a) =>
      `<tr><td><input type="checkbox" class="pwck" value="${a.id}"></td>
      <td><input class="mono" data-rn="${a.id}" value="${a.id}" style="width:88px"></td>
      <td class="r"><input data-ac="${a.id}" data-af="name" value="${esc(a.name)}" style="width:100%"></td>
      <td><span class="pill ${ROLEP[a.role] ?? ""}">${esc(META.roleLabels[a.role] ?? a.role)}</span>${
        a.role === "super" ? `<div class="ogl">${esc((a.teams ?? []).join(" · "))}</div>` : ""
      }</td>
      <td><input data-ac="${a.id}" data-af="title" value="${esc(a.title)}" style="width:100%"></td>
      <td>${
        a.role === "tech" || a.role === "director" || a.role === "super"
          ? "—"
          : `<select data-ac="${a.id}" data-af="team">` +
            META.teams.map((t) => `<option ${t === a.team ? "selected" : ""}>${esc(t)}</option>`).join("") +
            `</select>`
      }</td>
      <td>${
        a.mustChange
          ? '<span class="pill" style="background:var(--amber-l);color:#854F0B">ابتدائية</span>'
          : '<span class="pill" style="background:var(--green-l);color:var(--green-d)">مُغيَّرة</span>'
      }</td>
      <td style="white-space:nowrap"><button class="btn sm" data-acsave="${a.id}">حفظ</button>
      <button class="btn sm ghost" data-rnsave="${a.id}">اسم المستخدم</button>
      <button class="btn sm ghost" data-reset="${a.id}">كلمة المرور</button>
      <button class="btn sm ghost" data-viewas="${a.id}">معاينة</button>
      <button class="btn sm ghost" data-acdel="${a.id}">حذف</button></td></tr>`
    ).join("") + `</tbody></table></div>
  <h4 class="blk">البيانات المركزية للمؤسسات — ${esc(VYEAR)}</h4>
  <p class="sl">عدد الطلبة والمعلمين والمواد يُدخل هنا مرة واحدة لكل مؤسسة في العام،
    ويُسحب تلقائياً كمقام في المؤشرات التي تعتمد عليه، ويُشتق منه تصنيف حجم المؤسسة.
    الإدخال متاح في العام الجاري وحده.</p>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap" id="cdTabs">` +
    META.teams.map((t) =>
      `<button class="btn ghost" data-cd="${esc(t)}">${esc(t)} · ${META.teamMeta[t].code}</button>`
    ).join("") +
    `</div>
  <div id="cdBox"></div>
  <h4 class="blk">العام الدراسي الجاري</h4>
  <p class="sl">تغيير العام يفتح دورة جديدة بصفحة بيضاء دون المساس بالدورات السابقة.</p>
  <div style="display:flex;gap:9px;align-items:flex-end;flex-wrap:wrap;margin-bottom:6px">
    <div class="fld"><label>العام الجاري</label>
      <input id="yrIn" value="${esc(META.currentYear)}" style="width:150px"></div>
    <button class="btn" id="yrSave">تثبيت العام</button>
  </div>
  <h4 class="blk">تعديل المؤشرات والمستهدفات</h4>
  <p class="sl">ما يُحفظ هنا يسري على كل المؤسسات فوراً ويُعاد حساب التقييمات المحفوظة عليه.
    الفراغ يعني الرجوع إلى نص الخطة ورقمها. المؤشرات الوصفية مستهدفها ثابت عند 100.
    التعديل يبقى في قاعدة البيانات ولا يمسّ ملف الخطة.</p>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <button class="btn ghost" id="tgSchool">التعليم النظامي</button>
    <button class="btn ghost" id="tgKg">التعليم المبكر</button></div>
  <div id="tgBox"></div>
  <h4 class="blk">نقل المؤسسات بين الفرق</h4>
  <p class="sl">هذا الجدول لنقل مؤسسة من فريق إلى آخر فقط. أما توزيع مؤسسات الفريق
    على مقيّميه فمن شاشة <b>توزيع المؤسسات</b> بالسحب والإفلات.<br>
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
    h += `<div class="axbox"><div class="axhead" style="background:${AXD[a]}">
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

/* ── البيانات المركزية — الحساب الفني ── */
let CDTEAM = null;
async function cdRender(team) {
  CDTEAM = team;
  document.querySelectorAll("#cdTabs [data-cd]").forEach((b) =>
    b.className = "btn" + (b.dataset.cd === team ? "" : " ghost")
  );
  const box = $("#cdBox");
  box.innerHTML = `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
  const d = await api("/api/central?year=" + encodeURIComponent(VYEAR));
  const rows = d.rows.filter((r) => r.team === team);
  const ro = !d.editable;
  let h = ro ? `<div class="tip amber">${esc(VYEAR)} ليس العام الجاري — عرض فقط.</div>` : "";
  h += `<div class="tbl"><table><thead><tr><th style="width:70px">الرمز</th><th>المؤسسة</th>
    <th style="width:110px">الطلبة</th><th style="width:110px">المعلمون</th>
    <th style="width:110px">المواد</th><th style="width:150px">التصنيف المشتق</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    const f = (k) =>
      `<input type="number" min="0" step="1" style="width:92px" data-cdi="${r.id}" data-cdf="${k}"
        value="${r[k] ?? ""}" ${ro ? "disabled" : ""}>`;
    h += `<tr><td class="mono">${r.id}</td><td class="r">${esc(r.name)}</td>
      <td>${f("students")}</td><td>${f("teachers")}</td><td>${f("subjects")}</td>
      <td id="cds${r.id}">${
      r.size
        ? esc(r.size)
        : `<span style="color:var(--muted)">${r.sizeSource ? esc(r.sizeSource) + " (سابق)" : "—"}</span>`
    }</td></tr>`;
  });
  h += `</tbody></table></div>`;
  if (!ro) {
    h += `<div style="display:flex;gap:9px;margin-top:12px">
      <button class="btn" id="cdSave">حفظ بيانات ${esc(team)}</button></div>`;
  }
  box.innerHTML = h;
  wireCentral(box, () => CDTEAM);
}

/* ── إنشاء حساب جديد ── */
function openNewAccount() {
  const roles = [
    ["eval", "يرى مؤسساته المسندة ويُدخل تقييمها ويطلب نقلها"],
    ["lead", "كل مؤسسات فريق واحد: تقييم وتوزيع وقصص نجاح والبتّ في النقل"],
    ["super", "الصلاحيات نفسها على أكثر من فريق — اختر الفرق أدناه"],
    ["director", "إشراف على كل الفرق بلا تعديلات تقنية: لا مؤشرات ولا حسابات ولا كلمات مرور"],
  ];
  $("#modalBody").innerHTML = `
   <div class="mhead"><div>
     <div style="font-size:12px;opacity:.85">الحسابات</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">إنشاء حساب جديد</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <div class="finputs" style="padding:0">
       <div class="fld"><label>اسم المستخدم</label>
         <input id="naId" style="width:150px" placeholder="Z1-6"></div>
       <div class="fld" style="flex:1 1 240px"><label>اسم صاحب الحساب</label>
         <input id="naName" style="width:100%"></div>
       <div class="fld" style="flex:1 1 240px"><label>المسمى الوظيفي</label>
         <input id="naTitle" style="width:100%" placeholder="يُملأ من الدور إن تُرك فارغاً"></div>
     </div>
     <h4 class="blk">الدور والصلاحيات</h4>
     <div id="naRoles">` +
    roles.map(([r, d]) =>
      `<label class="ckrow" style="align-items:flex-start">
        <input type="radio" name="narole" value="${r}" ${r === "eval" ? "checked" : ""}>
        <span><b>${esc(META.roleLabels[r])}</b>
          <div style="font-weight:400;font-size:11.5px;color:var(--muted);margin-top:2px">${esc(d)}</div>
        </span></label>`
    ).join("") + `</div>
     <div id="naTeamBox" class="fld"><label>الفريق</label><select id="naTeam">` +
    META.teams.map((t) => `<option value="${esc(t)}">${esc(META.teamMeta[t].tab)}</option>`).join("") +
    `</select></div>
     <div id="naTeamsBox" hidden>
       <label class="kel">الفرق التي يغطّيها (اثنان فأكثر)</label>` +
    META.teams.map((t) =>
      `<label class="ckrow" style="padding:8px 12px;margin-bottom:6px">
        <input type="checkbox" class="nateam" value="${esc(t)}">
        <span>${esc(META.teamMeta[t].tab)}</span></label>`
    ).join("") + `</div>
     <h4 class="blk">كلمة المرور الابتدائية</h4>
     <div class="fld"><label>تُطلب تغييرها عند أول دخول</label>
       <input id="naPw" style="width:200px" value="${esc(META.defaultPw ?? "12345678")}"></div>
     <div style="display:flex;gap:9px;margin-top:15px">
       <button class="btn" id="naSave">إنشاء الحساب</button>
       <button class="btn ghost" id="naCancel">إلغاء</button></div>
   </div>`;
  $("#modal").classList.add("on");
  $("#mClose").onclick = $("#naCancel").onclick = () => $("#modal").classList.remove("on");
  const sync = () => {
    const r = document.querySelector('input[name="narole"]:checked').value;
    $("#naTeamBox").hidden = !(r === "eval" || r === "lead");
    $("#naTeamsBox").hidden = r !== "super";
  };
  document.querySelectorAll('input[name="narole"]').forEach((el) => el.onchange = sync);
  sync();
  $("#naSave").onclick = async () => {
    const role = document.querySelector('input[name="narole"]:checked').value;
    const body = {
      id: $("#naId").value.trim(),
      name: $("#naName").value.trim(),
      title: $("#naTitle").value.trim(),
      role,
      password: $("#naPw").value,
    };
    if (role === "eval" || role === "lead") body.team = $("#naTeam").value;
    if (role === "super") {
      body.teams = [...document.querySelectorAll(".nateam:checked")].map((c) => c.value);
    }
    try {
      const r = await api("/api/account-create", { method: "POST", body });
      $("#modal").classList.remove("on");
      toast(`أُنشئ الحساب ${r.id}` + (r.isDefault ? " بالكلمة الافتراضية" : ""));
      await render();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/* ── إضافة المؤسسات: فردية ودفعة من ملف إكسل ── */
const ADD_COLS = [
  ["name", "اسم المدرسة"],
  ["stage", "المرحلة"],
  ["gender", "بنين/بنات/مشترك"],
  ["students", "عدد الطلاب"],
  ["teachers", "عدد المعلمين"],
  ["subjects", "عدد المواد"],
];
const ADD_STAGES = ["ابتدائي", "إعدادي", "ثانوي", "رياض أطفال", "تعليم خاص"];
const ADD_GENDERS = ["بنين", "بنات", "مشترك"];

/** الفرق التي يغطّيها الحساب الحالي. */
function myTeams() {
  if (ME.role === "eval" || ME.role === "lead") return ME.team ? [ME.team] : [];
  if (ME.role === "super") return ME.teams ?? [];
  return META.teams;
}
function addTeam() {
  return myTeams().includes(ASG?.team) ? ASG.team : myTeams()[0];
}

/** نموذج إكسل بأعمدة ثابتة وورقة تعليمات — يُبنى في المتصفح ولا يُرفع للخادم. */
function addTemplate() {
  const team = addTeam();
  const head = ADD_COLS.map(([, t]) => t);
  const sample = ["مدرسة نموذجية للبنين", "ابتدائي", "بنين", 420, 24, 9];
  const ws = XLSX.utils.aoa_to_sheet([head, sample]);
  ws["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
  const notes = [
    ["تعليمات تعبئة النموذج"],
    [""],
    ["1", "لا تغيّر أسماء الأعمدة ولا ترتيبها، والصف الأول عناوين."],
    ["2", "اسم المدرسة إلزامي. أي خانة أخرى تُترك فارغة تبقى فارغة في المنصة."],
    ["3", "المرحلة من: " + ADD_STAGES.join(" · ")],
    ["4", "الجنس من: " + ADD_GENDERS.join(" · ") + " — و«مشترك» تُخزَّن «مختلط»."],
    ["5", "الأعداد أرقام صحيحة موجبة، ومنها يُشتق تصنيف حجم المؤسسة."],
    ["6", "الأعداد تخصّ العام الدراسي الجاري: " + META.currentYear],
    ["7", "الفريق يُحدَّد من الشاشة لا من الملف، والقطاع يُشتق من الفريق."],
    ["8", "الملف يُقرأ في المتصفح ولا يُخزَّن في المنصة."],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(notes);
  ws2["!cols"] = [{ wch: 6 }, { wch: 88 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المؤسسات");
  XLSX.utils.book_append_sheet(wb, ws2, "تعليمات");
  XLSX.writeFile(wb, `نموذج_إضافة_مؤسسات_${team}.xlsx`);
}

/** قراءة الملف في المتصفح وتحويله صفوفاً — الملف نفسه لا يغادر الجهاز. */
async function addParseFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["المؤسسات"] ?? wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  if (!aoa.length) throw new Error("الملف فارغ");
  const head = aoa[0].map((c) => String(c).replace(/\s+/g, " ").trim());
  const idx = ADD_COLS.map(([, t]) => head.indexOf(t));
  const missing = ADD_COLS.filter((_, i) => idx[i] === -1).map(([, t]) => t);
  if (missing.length) throw new Error("أعمدة ناقصة: " + missing.join(" · "));
  const rows = [];
  aoa.slice(1).forEach((r) => {
    const o = {};
    ADD_COLS.forEach(([k], i) => {
      const v = r[idx[i]];
      o[k] = v === undefined || v === null ? "" : String(v).trim();
    });
    if (o.name) rows.push(o);
  });
  if (!rows.length) throw new Error("لا صفوف فيها اسم مدرسة");
  return rows;
}

function openAdd() {
  const team = addTeam();
  const tm = META.teamMeta[team];
  const mine = myTeams();
  const teamSel = mine.length < 2
    ? `<div class="tgt" style="width:auto;padding:8px 12px">${esc(tm.tab)}</div>`
    : `<select id="adTeam">` +
      mine.map((t) =>
        `<option value="${esc(t)}" ${t === team ? "selected" : ""}>${esc(META.teamMeta[t].tab)}</option>`
      ).join("") + `</select>`;
  $("#modalBody").innerHTML = `
   <div class="mhead"><div>
     <div style="font-size:12px;opacity:.85">إضافة مؤسسات</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">مؤسسة واحدة أو دفعة من ملف إكسل</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <div class="fld" style="margin-bottom:14px"><label>الفريق</label>${teamSel}</div>
     <div class="tip">الرمز يُولَّد آلياً، والقطاع يُشتق من الفريق، والمؤسسة تُسند إلى أقل
       المقيّمين حملاً ويمكن نقلها من شاشة التوزيع. الأعداد تخصّ العام الجاري
       <b>${esc(META.currentYear)}</b>، وما يُترك فارغاً يبقى فارغاً.</div>

     <h4 class="blk">مؤسسة واحدة</h4>
     <div class="finputs" style="padding:0">
       <div class="fld" style="flex:1 1 260px"><label>اسم المدرسة</label>
         <input id="ad_name" style="width:100%" placeholder="إلزامي"></div>
       <div class="fld"><label>المرحلة</label><select id="ad_stage"><option value="">—</option>` +
    ADD_STAGES.map((x) => `<option>${x}</option>`).join("") + `</select></div>
       <div class="fld"><label>الجنس</label><select id="ad_gender"><option value="">—</option>` +
    ADD_GENDERS.map((x) => `<option>${x}</option>`).join("") + `</select></div>
       <div class="fld"><label>عدد الطلاب</label>
         <input id="ad_students" type="number" min="0" step="1" style="width:110px"></div>
       <div class="fld"><label>عدد المعلمين</label>
         <input id="ad_teachers" type="number" min="0" step="1" style="width:110px"></div>
       <div class="fld"><label>عدد المواد</label>
         <input id="ad_subjects" type="number" min="0" step="1" style="width:110px"></div>
     </div>
     <div style="margin-top:12px"><button class="btn" id="adOne">إضافة المؤسسة</button></div>

     <h4 class="blk">دفعة من ملف إكسل</h4>
     <p class="sl">نزّل النموذج، عبّئه، ثم ارفعه. الملف يُقرأ في متصفحك
       <b>ولا يُخزَّن في المنصة</b> — تُستخرج منه البيانات فقط.</p>
     <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
       <button class="btn ghost" id="adTpl">تنزيل النموذج</button>
       <input type="file" id="adFile" accept=".xlsx,.xls" style="font-size:12px">
     </div>
     <div id="adPrev" style="margin-top:12px"></div>
   </div>`;
  $("#modal").classList.add("on");
  $("#mClose").onclick = () => $("#modal").classList.remove("on");
  $("#adTpl").onclick = addTemplate;

  const teamNow = () => ($("#adTeam") ? $("#adTeam").value : team);
  $("#adOne").onclick = async () => {
    const row = {};
    ADD_COLS.forEach(([k]) => row[k] = $("#ad_" + k).value.trim());
    if (!row.name) return toast("اسم المدرسة مطلوب", true);
    await addSend(teamNow(), [row]);
  };

  let pending = null;
  $("#adFile").onchange = async () => {
    const f = $("#adFile").files[0];
    if (!f) return;
    try {
      pending = await addParseFile(f);
    } catch (e) {
      $("#adPrev").innerHTML = `<div class="tip red">${esc(e.message)}</div>`;
      return;
    }
    const empt = pending.reduce(
      (n, r) => n + ADD_COLS.filter(([k]) => k !== "name" && !r[k]).length,
      0,
    );
    $("#adPrev").innerHTML = `<div class="tip">قُرئ <b>${pending.length}</b> صفاً من الملف` +
      (empt ? ` · <b>${empt}</b> خانة فارغة ستبقى فارغة` : "") + `.</div>
      <div class="tbl"><table><thead><tr>` +
      ADD_COLS.map(([, t]) => `<th>${esc(t)}</th>`).join("") + `</tr></thead><tbody>` +
      pending.slice(0, 8).map((r) =>
        `<tr>` +
        ADD_COLS.map(([k]) =>
          `<td class="${k === "name" ? "r" : ""}">${
            r[k] ? esc(r[k]) : '<span style="color:var(--muted)">—</span>'
          }</td>`
        ).join("") + `</tr>`
      ).join("") +
      `</tbody></table></div>` +
      (pending.length > 8 ? `<p class="sl">معروض أول 8 صفوف من ${pending.length}.</p>` : "") +
      `<div style="margin-top:10px"><button class="btn" id="adBulk">إضافة ${pending.length} مؤسسة</button></div>`;
    $("#adBulk").onclick = () => addSend(teamNow(), pending);
  };
}

async function addSend(team, rows) {
  try {
    const r = await api("/api/institutions", { method: "POST", body: { team, rows } });
    $("#modal").classList.remove("on");
    toast(`أُضيفت ${r.count} مؤسسة · ${r.ids.slice(0, 3).join(" · ")}${r.ids.length > 3 ? " …" : ""}`);
    ASG = null;
    await render();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ── توزيع المؤسسات على المقيّمين ── */
let ASG = null; // { team, evals, rows, map, orig }

async function rAssign(team) {
  const mine = myTeams();
  const t = mine.includes(team) ? team : (mine.includes(ASG?.team) ? ASG.team : mine[0]);
  const evals = (await api("/api/evaluators?team=" + encodeURIComponent(t))).rows.map((a) => a.id);
  const rows = ROWS.filter((r) => r.team === t);
  const map = {};
  rows.forEach((r) => map[r.id] = r.evaluator);
  ASG = { team: t, evals, rows, map, orig: { ...map } };
  setTimeout(wireAssign, 0);
  return asgHtml();
}
/** تبويب لكل فريق — يظهر للحساب الفني وحده لأن رئيس الفريق مقصور على فريقه. */
function asgTabs() {
  const mine = myTeams();
  if (mine.length < 2) return "";
  return `<div class="asgtabs">` +
    mine.map((t) =>
      `<button class="ytab${t === ASG.team ? " on" : ""}" data-asg="${esc(t)}"
        style="--yc:${AXC[(META.teamMeta[t].no % 4) + 1]}">${esc(META.teamMeta[t].tab)}
        <span class="ybadge">${META.teamMeta[t].code}</span></button>`
    ).join("") + `</div>`;
}

function asgHtml() {
  const { evals, rows, map, orig } = ASG;
  const pending = rows.filter((r) => map[r.id] !== orig[r.id]).length;
  const tm = META.teamMeta[ASG.team];
  let h = `<h3 class="st">توزيع المؤسسات على المقيّمين</h3>
  ${asgTabs()}
  <p class="sl">${esc(tm.tab)} · رمز ${tm.code} — ${rows.length} مؤسسة على ${evals.length} مقيّمين.
    اسحب بطاقة المؤسسة إلى عمود المقيّم، أو غيّر المقيّم من القائمة داخل البطاقة.
    لا يُحفظ شيء قبل الضغط على «حفظ التوزيع».</p>
  <div class="asgbar">
    <button class="btn" id="asgSave" ${pending ? "" : "disabled"}>حفظ التوزيع${
    pending ? ` (${pending})` : ""
  }</button>
    <button class="btn ghost" id="asgReset" ${pending ? "" : "disabled"}>تراجع</button>
    <button class="btn ghost" id="asgEven">اقتراح توزيع متوازن</button>
    <button class="btn ghost" id="asgAdd">إضافة مؤسسات</button>
    <span class="asgnote${pending ? " on" : ""}">${
    pending ? `${pending} تغييراً غير محفوظ` : "لا تغييرات معلّقة"
  }</span>
  </div>
  <div class="asgcols">`;
  evals.forEach((e) => {
    const mine = rows.filter((r) => map[r.id] === e);
    h += `<div class="asgcol">
      <div class="asghead"><b class="mono">${e}</b><span>${mine.length} مؤسسة</span></div>
      <div class="asgdrop" data-col="${e}">` +
      mine.map((r) => {
        const moved = map[r.id] !== orig[r.id];
        return `<div class="asgcard${moved ? " moved" : ""}" draggable="true" data-inst="${r.id}">
          <div class="ac-name">${esc(r.name)}</div>
          <div class="ac-meta"><span class="mono">${r.id}</span> · ${esc(r.stage ?? "—")}
            · <span class="pill" style="background:${SC[r.status]}22;color:${
          SC[r.status]
        }">${r.status}</span></div>
          <select data-mv="${r.id}">` +
          evals.map((x) => `<option value="${x}" ${x === e ? "selected" : ""}>${x}</option>`).join("") +
          `</select></div>`;
      }).join("") +
      `</div></div>`;
  });
  return h + `</div>`;
}

function asgRefresh() {
  $("#content").innerHTML = asgHtml();
  wireAssign();
}

function wireAssign() {
  if (!ASG || SEC !== "assign") return;
  document.querySelectorAll("[data-asg]").forEach((b) =>
    b.onclick = async () => {
      $("#content").innerHTML =
        `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
      $("#content").innerHTML = await rAssign(b.dataset.asg);
    }
  );
  let dragId = null;
  document.querySelectorAll(".asgcard").forEach((c) => {
    c.ondragstart = (e) => {
      dragId = c.dataset.inst;
      c.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    };
    c.ondragend = () => c.classList.remove("dragging");
  });
  document.querySelectorAll(".asgdrop").forEach((z) => {
    z.ondragover = (e) => {
      e.preventDefault();
      z.classList.add("over");
    };
    z.ondragleave = () => z.classList.remove("over");
    z.ondrop = (e) => {
      e.preventDefault();
      z.classList.remove("over");
      const id = dragId || e.dataTransfer.getData("text/plain");
      dragId = null;
      if (!id) return;
      ASG.map[id] = z.dataset.col;
      asgRefresh();
    };
  });
  document.querySelectorAll("[data-mv]").forEach((sel) =>
    sel.onchange = () => {
      ASG.map[sel.dataset.mv] = sel.value;
      asgRefresh();
    }
  );
  $("#asgAdd").onclick = openAdd;
  $("#asgReset").onclick = () => {
    ASG.map = { ...ASG.orig };
    asgRefresh();
  };
  $("#asgEven").onclick = () => {
    // اقتراح بالتناوب مع الحفاظ على ترتيب المؤسسات، يراجعه القائد قبل الحفظ
    ASG.rows.forEach((r, i) => ASG.map[r.id] = ASG.evals[i % ASG.evals.length]);
    asgRefresh();
    toast("اقتراح توزيع متوازن — راجعه ثم احفظ");
  };
  $("#asgSave").onclick = async () => {
    const items = ASG.rows
      .filter((r) => ASG.map[r.id] !== ASG.orig[r.id])
      .map((r) => ({ instId: r.id, evaluator: ASG.map[r.id] }));
    if (!items.length) return;
    try {
      const r = await api("/api/assign-bulk", { method: "POST", body: { items } });
      toast(`حُفظ توزيع ${r.count} مؤسسة`);
      ASG = null;
      await render();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/** إعادة تعيين كلمات المرور — للمحدد أو للجميع، بالافتراضية أو بكلمة يختارها الفني. */
async function resetPasswords(all) {
  const ids = [...document.querySelectorAll(".pwck:checked")].map((c) => c.value);
  if (!all && !ids.length) return toast("حدّد حساباً واحداً على الأقل", true);
  const n = all ? "كل الحسابات" : `${ids.length} حساباً`;
  const pw = prompt(
    `إعادة تعيين كلمة المرور لـ${n}.\n` +
      `اتركها كما هي للافتراضية، أو اكتب كلمة مرور أخرى (8 محارف فأكثر).`,
    META.defaultPw ?? "12345678",
  );
  if (pw === null) return;
  if (pw.length < 8) return toast("كلمة مرور 8 محارف فأكثر", true);
  if (!confirm(`تأكيد: ${n} ستُنهى جلساتهم ويُطلب منهم تغيير كلمة المرور عند أول دخول.`)) return;
  try {
    const r = await api("/api/reset-passwords", {
      method: "POST",
      body: all ? { all: true, password: pw } : { ids, password: pw },
    });
    toast(
      `أُعيد تعيين ${r.count} حساباً` +
        (r.skipped.length ? ` · حسابك مستثنى` : "") +
        (r.isDefault ? " · بالكلمة الافتراضية" : ""),
    );
    await render();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ── البيانات المركزية للمؤسسات ── */
let CDFILTER = null; // الفريق المعروض في شاشة بيانات المؤسسات
async function rCentral(team) {
  const d = await api("/api/central?year=" + encodeURIComponent(VYEAR));
  const teams = [...new Set(d.rows.map((r) => r.team))];
  if (team !== undefined) CDFILTER = team;
  if (CDFILTER && !teams.includes(CDFILTER)) CDFILTER = null;
  const rows = CDFILTER ? d.rows.filter((r) => r.team === CDFILTER) : d.rows;
  const ro = !d.editable;
  const miss = rows.filter((r) => r.students === null || r.teachers === null || r.subjects === null);
  let h = `<h3 class="st">بيانات المؤسسات — ${esc(VYEAR)}</h3>
  <p class="sl">أعداد الطلبة والمعلمين والمواد تُدخل مرة واحدة لكل مؤسسة، وتُسحب تلقائياً
    كمقام في المؤشرات التي تعتمد عليها، ويُشتق منها تصنيف حجم المؤسسة.</p>
  <div class="tip amber"><b>هذه الأعداد تخصّ عاماً دراسياً بعينه.</b>
    كل عام جديد يبدأ بخانات فارغة ويستلزم تحديثها، فالأعداد تتغيّر من عام لآخر
    ولا تُنقل تلقائياً.</div>
  ${ro ? `<div class="tip red">${esc(VYEAR)} ليس العام الجاري — عرض فقط.</div>` : ""}
  ${
    teams.length > 1
      ? `<div class="asgtabs" id="cdFilter">
      <button class="ytab${CDFILTER ? "" : " on"}" data-cdf-team="" style="--yc:var(--green-d)">
        الكل<span class="ybadge">${d.rows.length}</span></button>` +
        teams.map((t) =>
          `<button class="ytab${t === CDFILTER ? " on" : ""}" data-cdf-team="${esc(t)}"
          style="--yc:${AXC[(META.teamMeta[t].no % 4) + 1]}">${esc(META.teamMeta[t].tab)}
          <span class="ybadge">${d.rows.filter((r) => r.team === t).length}</span></button>`
        ).join("") + `</div>`
      : ""
  }
  <div class="kpis">
    <div class="kpi"><div class="lbl">${CDFILTER ? "مؤسسات المعروض" : "مؤسسات في نطاقك"}</div>
      <div class="val">${rows.length}</div></div>
    <div class="kpi ${miss.length ? "amber" : ""}"><div class="lbl">بيانات ناقصة</div>
      <div class="val">${miss.length}</div></div>
    <div class="kpi"><div class="lbl">مكتملة</div><div class="val">${rows.length - miss.length}</div></div>
  </div>
  <div class="tbl"><table><thead><tr><th style="width:70px">الرمز</th><th>المؤسسة</th>
    <th style="width:92px">القطاع</th><th style="width:120px">المرحلة</th>
    <th style="width:104px">الطلبة</th><th style="width:104px">المعلمون</th>
    <th style="width:104px">المواد</th><th style="width:150px">التصنيف المشتق</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    const f = (k) =>
      `<input type="number" min="0" step="1" style="width:92px" data-cdi="${r.id}" data-cdf="${k}"
        value="${r[k] ?? ""}" ${ro ? "disabled" : ""}>`;
    h += `<tr><td class="mono">${r.id}</td><td class="r">${esc(r.name)}</td>
      <td><span class="pill ${SECP[r.sector] ?? ""}">${esc(r.sector)}</span></td>
      <td>${esc(r.stage ?? "غير مسجَّل")}</td>
      <td>${f("students")}</td><td>${f("teachers")}</td><td>${f("subjects")}</td>
      <td id="cds${r.id}">${
      r.size
        ? esc(r.size)
        : `<span style="color:var(--muted)">${r.sizeSource ? esc(r.sizeSource) + " (سابق)" : "—"}</span>`
    }</td></tr>`;
  });
  h += `</tbody></table></div>`;
  if (!ro) {
    h += `<div style="display:flex;gap:9px;margin-top:12px">
      <button class="btn" id="cdSaveAll">حفظ البيانات</button></div>`;
  }
  setTimeout(() => {
    wireCentral(document);
    document.querySelectorAll("[data-cdf-team]").forEach((b) =>
      b.onclick = async () => {
        $("#content").innerHTML =
          `<div class="card" style="text-align:center;color:var(--muted)">جارٍ التحميل…</div>`;
        $("#content").innerHTML = await rCentral(b.dataset.cdfTeam || null);
        wireCentral(document);
        document.querySelectorAll("[data-cdf-team]").forEach((x) => x.onclick = b.onclick);
      }
    );
  }, 0);
  return h;
}

/** ربط خانات البيانات المركزية داخل أي حاوية: اشتقاق التصنيف حياً ثم الحفظ. */
function wireCentral(root, teamOf) {
  const rule = (team) => META.sizeRule[team === "رياض الأطفال" ? "kg" : "school"];
  root.querySelectorAll('[data-cdf="students"]').forEach((i) => {
    i.oninput = () => {
      const cell = document.getElementById("cds" + i.dataset.cdi);
      if (!cell) return;
      const team = teamOf ? teamOf() : (ROWS.find((r) => r.id === i.dataset.cdi)?.team ?? "");
      const v = Number(i.value);
      const hit = i.value === "" ? null : rule(team).find(([, a, b]) => v >= a && (b === null || v <= b));
      cell.textContent = hit ? hit[0] : "—";
    };
  });
  const btn = root.querySelector("#cdSaveAll") || root.querySelector("#cdSave");
  if (!btn) return;
  btn.onclick = async () => {
    const map = {};
    root.querySelectorAll("[data-cdi]").forEach((i) => {
      map[i.dataset.cdi] = map[i.dataset.cdi] || { id: i.dataset.cdi };
      map[i.dataset.cdi][i.dataset.cdf] = i.value;
    });
    try {
      const r = await api("/api/central", {
        method: "POST",
        body: { year: VYEAR, rows: Object.values(map) },
      });
      toast(`حُفظت بيانات ${r.count} مؤسسة للعام ${VYEAR}`);
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/* ── طلبات النقل ── */
let TRS = [];
async function rTransfers() {
  TRS = (await api("/api/transfers")).rows;
  const canDecide = ME.role !== "eval";
  const st = { "معلّق": "var(--amber)", "معتمد": "var(--green)", "مرفوض": "var(--red)" };
  let h = `<h3 class="st">طلبات النقل</h3>
  <p class="sl">${
    canDecide
      ? "طلبات نقل المؤسسات بين مقيّمي الفريق. الاعتماد ينقل المؤسسة فوراً ويبقى تقييمها كما هو."
      : "طلبات النقل التي قدّمتها أو التي تخصّ مؤسساتك. البتّ فيها من رئيس الفريق."
  }</p>
  <div class="kpis">
    <div class="kpi amber"><div class="lbl">معلّقة</div><div class="val">${
    TRS.filter((t) => t.status === "معلّق").length
  }</div></div>
    <div class="kpi"><div class="lbl">معتمدة</div><div class="val">${
    TRS.filter((t) => t.status === "معتمد").length
  }</div></div>
    <div class="kpi red"><div class="lbl">مرفوضة</div><div class="val">${
    TRS.filter((t) => t.status === "مرفوض").length
  }</div></div>
  </div>`;
  if (!TRS.length) {
    return h + `<div class="card" style="text-align:center;color:var(--muted)">لا توجد طلبات.</div>`;
  }
  h += `<div class="tbl"><table><thead><tr><th style="width:70px">المؤسسة</th><th>الاسم</th>
    <th style="width:120px">الفريق</th><th style="width:90px">من</th><th style="width:90px">إلى</th>
    <th>السبب</th><th style="width:90px">الحالة</th>${
    canDecide ? '<th style="width:150px"></th>' : ""
  }</tr></thead><tbody>`;
  TRS.forEach((t) => {
    h += `<tr><td class="mono">${t.instId}</td><td class="r">${esc(t.instName)}</td>
      <td>${esc(t.team)}</td><td class="mono">${t.fromEval}</td><td class="mono">${t.toEval}</td>
      <td class="r" style="font-size:11.5px">${esc(t.reason || "—")}</td>
      <td><span class="pill" style="background:${st[t.status]}22;color:${
      st[t.status]
    }">${t.status}</span></td>
      ${
      canDecide
        ? `<td style="white-space:nowrap">${
          t.status === "معلّق"
            ? `<button class="btn sm" data-tok="${t.id}">اعتماد</button>
               <button class="btn sm ghost" data-tno="${t.id}">رفض</button>`
            : `<span style="font-size:11px;color:var(--muted)">${esc(t.decidedBy ?? "")}</span>`
        }</td>`
        : ""
    }</tr>`;
  });
  return h + `</tbody></table></div>`;
}
async function trDecide(id, approve) {
  try {
    const r = await api("/api/transfer-decide", { method: "POST", body: { id, approve } });
    toast(`الطلب ${r.status}`);
    await render();
  } catch (e) {
    toast(e.message, true);
  }
}
/** نافذة طلب نقل مؤسسة إلى مقيّم آخر في الفريق نفسه. */
function openMove(id) {
  const x = ROWS.find((r) => r.id === id);
  const tm = META.teamMeta[x.team];
  $("#modalBody").innerHTML = `
   <div class="mhead"><div>
     <div style="font-size:12px;opacity:.85">${x.id} · ${esc(tm.label)} · رمز ${tm.code}</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">${esc(x.name)}</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <div class="tip">النقل داخل الفريق نفسه فقط. الطلب يُرفع لرئيس الفريق، والتقييم المدخل يبقى مع المؤسسة.</div>
     <label class="kel">المقيّم المطلوب نقلها إليه</label>
     <select id="mvTo" style="width:100%;margin-bottom:12px"></select>
     <label class="kel">سبب الطلب</label>
     <textarea id="mvWhy" rows="3" placeholder="مثال: تعذّر الزيارة لبُعد الموقع"></textarea>
     <div style="display:flex;gap:9px;margin-top:15px">
       <button class="btn" id="mvSend">رفع الطلب</button>
       <button class="btn ghost" id="mvCancel">إلغاء</button></div>
   </div>`;
  $("#modal").classList.add("on");
  const code = tm.code;
  $("#mvTo").innerHTML = [1, 2, 3, 4, 5].map((n) => `${code}-${n}`)
    .filter((a) => a !== x.evaluator)
    .map((a) => `<option value="${a}">${a}</option>`).join("");
  $("#mClose").onclick = $("#mvCancel").onclick = () => $("#modal").classList.remove("on");
  $("#mvSend").onclick = async () => {
    try {
      await api("/api/transfers", {
        method: "POST",
        body: { instId: id, toEval: $("#mvTo").value, reason: $("#mvWhy").value },
      });
      $("#modal").classList.remove("on");
      toast("رُفع طلب النقل لرئيس الفريق");
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
  if (SEC === "assign" && ASG) wireAssign();
  document.querySelectorAll("[data-mteam]").forEach((b) =>
    b.onclick = () => {
      MTEAM = b.dataset.mteam;
      render();
    }
  );
  document.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openEval(b.dataset.open));
  if ($("#mineAdd")) $("#mineAdd").onclick = openAdd;
  if ($("#mlNew")) $("#mlNew").onclick = openNewThread;
  document.querySelectorAll("[data-th-open]").forEach((b) => b.onclick = () => openThread(b.dataset.thOpen));
  document.querySelectorAll("[data-move]").forEach((b) => b.onclick = () => openMove(b.dataset.move));
  document.querySelectorAll("[data-tok]").forEach((b) => b.onclick = () => trDecide(b.dataset.tok, true));
  document.querySelectorAll("[data-tno]").forEach((b) => b.onclick = () => trDecide(b.dataset.tno, false));
  if ($("#tgSchool")) {
    $("#tgSchool").onclick = () => tgRender("school");
    $("#tgKg").onclick = () => tgRender("kg");
    tgRender(TGSTAGE);
  }
  if ($("#cdTabs")) {
    document.querySelectorAll("#cdTabs [data-cd]").forEach((b) => b.onclick = () => cdRender(b.dataset.cd));
    cdRender(CDTEAM ?? META.teams[0]);
  }
  if ($("#yrSave")) {
    $("#yrSave").onclick = async () => {
      try {
        const r = await api("/api/year", { method: "POST", body: { year: $("#yrIn").value.trim() } });
        toast(`العام الجاري: ${r.year}`);
        location.reload();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  if ($("#asTabs")) {
    document.querySelectorAll("#asTabs [data-as]").forEach((b) => b.onclick = () => asRender(b.dataset.as));
    asRender(ASTEAM ?? META.teams[0]);
  }
  document.querySelectorAll("[data-viewas]").forEach((b) => b.onclick = () => viewAs(b.dataset.viewas));
  if ($("#acNew")) $("#acNew").onclick = openNewAccount;
  document.querySelectorAll("[data-acdel]").forEach((b) =>
    b.onclick = async () => {
      if (!confirm(`حذف الحساب ${b.dataset.acdel}؟ لا يمكن التراجع.`)) return;
      try {
        await api("/api/account-delete", { method: "POST", body: { id: b.dataset.acdel } });
        toast("حُذف الحساب");
        await render();
      } catch (e) {
        toast(e.message, true);
      }
    }
  );
  if ($("#acSaveAll")) {
    $("#acSaveAll").onclick = async () => {
      // لا نرسل إلا الأسطر التي تغيّرت فعلاً
      const items = [];
      document.querySelectorAll("[data-rn]").forEach((inp) => {
        const id = inp.dataset.rn;
        const g = (f) => {
          const el = document.querySelector(`[data-ac="${id}"][data-af="${f}"]`);
          return el ? el.value : undefined;
        };
        const o = { id, newId: inp.value.trim(), name: g("name"), title: g("title") };
        const t = g("team");
        if (t !== undefined) o.team = t;
        const orig = ACCS.find((a) => a.id === id);
        const same = o.newId === id && o.name === orig.name && o.title === orig.title &&
          (o.team === undefined || o.team === orig.team);
        if (!same) items.push(o);
      });
      if (!items.length) return toast("لا تعديلات لحفظها", true);
      const ren = items.filter((o) => o.newId !== o.id).length;
      if (
        ren &&
        !confirm(`سيُغيَّر اسم المستخدم لـ${ren} حساباً وتُنهى جلساتهم. المتابعة؟`)
      ) return;
      try {
        const r = await api("/api/accounts-bulk", { method: "POST", body: { items } });
        toast(
          `حُفظ ${r.count} حساباً` + (r.renamed ? ` · ${r.renamed} اسم مستخدم` : "") +
            (r.moved ? ` · نُقلت ${r.moved} مؤسسة` : ""),
        );
        await render();
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
  if ($("#pwCkAll")) {
    $("#pwCkAll").onchange = () =>
      document.querySelectorAll(".pwck").forEach((c) => c.checked = $("#pwCkAll").checked);
    $("#pwSel").onclick = () => resetPasswords(false);
    $("#pwAll").onclick = () => resetPasswords(true);
  }
  document.querySelectorAll("[data-rnsave]").forEach((b) =>
    b.onclick = async () => {
      const id = b.dataset.rnsave;
      const inp = document.querySelector(`[data-rn="${id}"]`);
      const newId = inp ? inp.value.trim() : "";
      if (newId === id) return toast("اسم المستخدم لم يتغيّر", true);
      if (!confirm(`تغيير اسم المستخدم من ${id} إلى ${newId}؟ ستُنهى جلساته الحالية.`)) return;
      try {
        const r = await api("/api/account-rename", { method: "POST", body: { id, newId } });
        toast(`صار اسم المستخدم ${r.id} · نُقلت ${r.moved} مؤسسة`);
        await render();
      } catch (e) {
        toast(e.message, true);
        if (inp) inp.value = id;
      }
    }
  );
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
  if ($("#rpGen")) $("#rpGen").onclick = repGenerate;
}
$("#modal").onclick = (e) => {
  if (e.target.id === "modal") $("#modal").classList.remove("on");
};

// استئناف جلسة قائمة إن وُجدت — دون توليد خطأ في الكونسول
try {
  const s = await api("/api/session");
  if (s.authenticated) await boot();
} catch { /* تُعرض شاشة الدخول */ }
