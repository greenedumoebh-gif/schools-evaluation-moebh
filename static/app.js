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
   <th style="width:105px">المرحلة</th><th style="width:75px">الجنس</th><th style="width:70px">الطلبة</th>
   <th style="width:105px">الحالة</th><th style="width:72px">النتيجة</th><th style="width:115px">التقدير</th>
   <th style="width:80px"></th></tr></thead><tbody>` +
    ROWS.map((x) =>
      `<tr><td class="mono">${x.id}</td><td class="r">${esc(x.name)}</td>
      <td>${esc(x.stage)}</td><td>${esc(x.gender)}</td><td>${x.students || "—"}</td>
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

/* ── شاشة إدخال التقييم ── */
function openEval(id) {
  const x = ROWS.find((r) => r.id === id);
  $("#modalBody").innerHTML = `
   <div class="mhead"><div>
     <div style="font-size:12px;opacity:.85">${x.id} · ${esc(x.team)} · ${esc(x.stage)} · ${
    esc(x.gender)
  }</div>
     <div style="font-size:16px;font-weight:800;margin-top:3px">${esc(x.name)}</div></div>
     <button class="btn" style="background:rgba(255,255,255,.2)" id="mClose">إغلاق</button></div>
   <div class="mbody">
     <div class="tip">أدخل نسبة تنفيذ كل محور من 0 إلى 100. النقاط = وزن المحور × النسبة، والتقدير يظهر بعد استكمال المحاور الأربعة.</div>
     <div class="tbl"><table><thead><tr><th>المحور</th><th style="width:95px">الوزن</th>
      <th style="width:120px">نسبة التنفيذ %</th><th style="width:95px">النقاط</th></tr></thead><tbody>` +
    [1, 2, 3, 4].map((a) =>
      `<tr><td class="r" style="border-right:4px solid ${AXC[a]}">${esc(META.axname[a])}</td>
       <td>${fmt(x.axw[a])}</td>
       <td><input type="number" min="0" max="100" step="0.1" id="ax${a}"
         value="${x.axes && x.axes[a] !== null && x.axes[a] !== undefined ? x.axes[a] : ""}"
         style="width:96px" class="axin"></td>
       <td id="pt${a}">—</td></tr>`
    ).join("") +
    `<tr style="background:var(--green-l);font-weight:800"><td class="r">النتيجة</td>
       <td>${fmt(x.cap)}</td><td id="evPct">—</td><td id="evLvl">—</td></tr>
     </tbody></table></div>
     <label style="font-size:12px;font-weight:700;color:var(--muted);display:block;margin-bottom:5px">ملاحظات المقيّم</label>
     <textarea id="evNotes" rows="3">${esc(x.notes ?? "")}</textarea>
     <div style="display:flex;gap:9px;margin-top:15px;flex-wrap:wrap">
       <button class="btn" id="evSave">حفظ التقييم</button>
       <button class="btn ghost" id="evCancel">إلغاء</button></div>
   </div>`;
  $("#modal").classList.add("on");
  const recalc = () => {
    let p = 0, t = 0, all = true;
    [1, 2, 3, 4].forEach((a) => {
      const v = $("#ax" + a).value;
      if (v === "") {
        all = false;
        $("#pt" + a).textContent = "—";
        return;
      }
      const n = Math.max(0, Math.min(100, Number(v)));
      p += x.axw[a] * n / 100;
      t += x.axw[a];
      $("#pt" + a).textContent = fmt(x.axw[a] * n / 100, 1);
    });
    if (all) {
      const pc = Math.round(p / t * 1000) / 10;
      let L = META.rubric[0];
      META.rubric.forEach((b) => {
        if (pc >= b.a) L = b;
      });
      $("#evPct").innerHTML = `<b>${pc}%</b>`;
      $("#evLvl").innerHTML = `<span class="pill" style="background:${
        lvlColor(L.n)
      };color:#fff">${L.n}</span>`;
    } else {
      $("#evPct").textContent = "—";
      $("#evLvl").textContent = "—";
    }
  };
  document.querySelectorAll(".axin").forEach((i) => i.oninput = recalc);
  recalc();
  $("#mClose").onclick = $("#evCancel").onclick = () => $("#modal").classList.remove("on");
  $("#evSave").onclick = async () => {
    const axes = {};
    [1, 2, 3, 4].forEach((a) => axes[a] = $("#ax" + a).value === "" ? null : Number($("#ax" + a).value));
    try {
      const r = await api("/api/evaluation", {
        method: "POST",
        body: { instId: id, axes, notes: $("#evNotes").value },
      });
      $("#modal").classList.remove("on");
      toast(`حُفظ التقييم — الحالة: ${r.status}`);
      await render();
    } catch (e) {
      toast(e.message, true);
    }
  };
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
  list.forEach((x) => (g[x[key]] = g[x[key]] || []).push(x));
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
  <h4 class="blk">حسب الجنس</h4>${statTable(ROWS, "الجنس", "gender")}`;
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
        <td class="r">${esc(x.name)}</td><td>${esc(x.stage)}</td><td><b>${x.pct}%</b></td>
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
      x.stage,
      x.gender,
      x.students,
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
  const [ac, au] = await Promise.all([api("/api/accounts"), api("/api/audit")]);
  const A = ac.accounts;
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
  <div class="tbl"><table><thead><tr><th style="width:78px">الرمز</th><th>الاسم</th>
   <th style="width:160px">الدور</th><th style="width:110px">الفريق</th>
   <th style="width:120px">كلمة المرور</th><th style="width:130px"></th></tr></thead><tbody>` +
    A.map((a) =>
      `<tr><td class="mono">${a.id}</td><td class="r">${esc(a.name)}</td>
      <td><span class="pill" style="background:${
        a.role === "eval" ? "var(--blue-l)" : a.role === "lead" ? "var(--green-l)" : "var(--purple-l)"
      };color:${a.role === "eval" ? "#1c4f85" : a.role === "lead" ? "var(--green-d)" : "var(--purple)"}">${
        esc(a.title)
      }</span></td>
      <td>${esc(a.team ?? "—")}</td>
      <td>${
        a.mustChange
          ? '<span class="pill" style="background:var(--amber-l);color:#854F0B">ابتدائية</span>'
          : '<span class="pill" style="background:var(--green-l);color:var(--green-d)">مُغيَّرة</span>'
      }</td>
      <td><button class="btn sm ghost" data-reset="${a.id}">إعادة تعيين</button></td></tr>`
    ).join("") + `</tbody></table></div>
  <h4 class="blk">سجل التدقيق — آخر ${au.rows.length} حدثاً</h4>
  <div class="tbl"><table><thead><tr><th style="width:150px">الوقت</th><th style="width:90px">الحساب</th>
   <th style="width:170px">الإجراء</th><th>الهدف</th><th style="width:110px">تفصيل</th></tr></thead><tbody>` +
    au.rows.slice(0, 60).map((r) =>
      `<tr><td class="mono">${new Date(r.at).toLocaleString("ar-BH", { hour12: false })}</td>
      <td class="mono">${esc(r.actor)}</td><td>${esc(r.action)}</td>
      <td class="r">${esc(r.target)}</td><td>${esc(r.detail ?? "")}</td></tr>`
    ).join("") + `</tbody></table></div>`;
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
