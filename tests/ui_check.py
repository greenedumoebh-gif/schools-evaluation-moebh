# -*- coding: utf-8 -*-
"""فحص الشاشات في المتصفح — قياسات كمية لا حكم بصري."""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
PW = os.environ.get("SEED_PASSWORD", "TestPass12345")
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ok = True
errs: list = []


def chk(c, m):
    global ok
    if not c:
        ok = False
    print(("\u2713 " if c else "\u2717 ") + m)


def login(page, uid):
    page.goto(BASE, wait_until="networkidle")
    page.fill("#uid", uid)
    page.fill("#pwd", PW)
    page.click("#loginForm button[type=submit]")
    page.wait_for_selector("#app:not([hidden])", timeout=15000)
    # نافذة تغيير كلمة المرور الإلزامية تفتح بعد 400ms من الإقلاع — نتجاوزها في الفحص
    page.wait_for_timeout(1000)
    page.evaluate("()=>document.getElementById('modal').classList.remove('on')")


def fill_central(page, team, students=800, teachers=40, subjects=10):
    """تعبئة البيانات المركزية لفريق كامل من شاشة الحساب الفني."""
    page.locator(f'#cdTabs [data-cd="{team}"]').click()
    page.wait_for_selector("#cdBox table", timeout=20000)
    page.evaluate(
        "([s,t,u])=>{document.querySelectorAll('#cdBox [data-cdf=students]').forEach(e=>{"
        "e.value=s;e.dispatchEvent(new Event('input'))});"
        "document.querySelectorAll('#cdBox [data-cdf=teachers]').forEach(e=>e.value=t);"
        "document.querySelectorAll('#cdBox [data-cdf=subjects]').forEach(e=>e.value=u);}",
        [str(students), str(teachers), str(subjects)],
    )
    page.click("#cdSave")
    page.wait_for_selector(".toast", timeout=15000)
    page.wait_for_timeout(800)


with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    # ── الحساب الفني أولاً: البيانات المركزية شرط لحساب سبعة مؤشرات ──
    pg2 = br.new_page(viewport={"width": 1440, "height": 950})
    errs = []
    pg2.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg2.on("pageerror", lambda e: errs.append(str(e)))
    login(pg2, "TECH")
    pg2.wait_for_selector("#cdBox table", timeout=20000)
    chk(pg2.locator("#cdBox tbody tr").count() == 56, f"البيانات المركزية منطقة 1: {pg2.locator('#cdBox tbody tr').count()}")
    chk(pg2.locator('#cdBox [data-cdf="teachers"]').count() == 56, "خانة عدد المعلمين لكل مؤسسة")
    st = pg2.locator('#cdBox [data-cdf="students"]').first
    st.fill("1200")
    pg2.wait_for_timeout(300)
    chk("الكبيرة جداً" in pg2.locator("#cdBox tbody tr").first.inner_text(), "التصنيف يتغيّر فوراً مع عدد الطلبة")
    st.fill("300")
    pg2.wait_for_timeout(300)
    chk("الصغيرة" in pg2.locator("#cdBox tbody tr").first.inner_text(), "التصنيف يتبع الحدود المعتمدة")
    for tname in ["منطقة 1", "منطقة 4", "رياض الأطفال"]:
        fill_central(pg2, tname)
    chk(True, "عُبِّئت البيانات المركزية لثلاثة فرق")

    pg = br.new_page(viewport={"width": 1440, "height": 950})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))

    # ── المقيّم: شاشة إدخال التقييم ──
    login(pg, "Z1-1")
    chk(pg.locator("#nav a").count() >= 2, f"شريط التنقل ظهر ({pg.locator('#nav a').count()} شاشة)")
    chk(pg.locator("[data-open]").count() > 0, f"جدول مؤسساتي ({pg.locator('[data-open]').count()} مؤسسة)")
    hdr = pg.locator("#content table thead th").all_inner_texts()
    chk("التصنيف" in hdr, f"عمود تصنيف الحجم في جدول مؤسساتي ({' · '.join(hdr[:6])})")
    row1 = pg.locator("#content tbody tr").first.inner_text()
    chk("المدرسة " in row1, f"تصنيف الحجم معروض في الصف الأول")
    chk(pg.evaluate("getComputedStyle(document.documentElement).direction") == "rtl", "اتجاه الصفحة RTL")

    # الشعارات
    logos = pg.evaluate(
        "()=>[...document.querySelectorAll('img')].map(i=>({s:i.getAttribute('src'),w:i.naturalWidth}))"
    )
    broken = [l for l in logos if l["w"] == 0]
    chk(len(logos) >= 2, f"صور الشعار في الصفحة ({len(logos)})")
    chk(not broken, f"لا شعار مكسور ({[b['s'] for b in broken]})")
    plat = pg.evaluate(
        "()=>[...document.querySelectorAll('.lgbox img')].map(i=>i.getAttribute('src'))"
    )
    chk(
        len(plat) == 4 and all("square" in x for x in plat),
        f"شاشات المنصة تستخدم الشعارين المربعين ({sorted(set(plat))})",
    )
    boxes = pg.evaluate(
        "()=>[...document.querySelectorAll('.sidebar .lgbox')].map(e=>{const r=e.getBoundingClientRect();"
        "return {w:Math.round(r.width),h:Math.round(r.height)}})"
    )
    chk(len(boxes) == 2, f"مربعان للشعارين في الشريط الجانبي ({len(boxes)})")
    chk(
        boxes and boxes[0] == boxes[1] and boxes[0]["w"] == boxes[0]["h"],
        f"المربعان متساويان ومربعان فعلاً ({boxes})",
    )
    bgs = pg.evaluate(
        "()=>[...document.querySelectorAll('.sidebar .lgbox')]"
        ".map(e=>getComputedStyle(e).backgroundColor)"
    )
    chk(all(b == "rgb(255, 255, 255)" for b in bgs), f"خلفية المربعين بيضاء ({bgs})")
    hdr = pg.evaluate(
        "()=>{const i=document.querySelector('.printhead .hdr-rect');"
        "return i? {s:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight}:null}"
    )
    chk(
        hdr and hdr["s"] == "/img/moe.png" and hdr["w"] / hdr["h"] > 3,
        f"رأس الطباعة يستخدم شعار الوزارة المستطيل ({hdr})",
    )

    # ألوان الأعوام الثابتة
    cols = pg.evaluate(
        "()=>[...document.querySelectorAll('.ytab')].map(b=>[b.dataset.y,b.style.getPropertyValue('--yc')])"
    )
    chk(
        dict(cols).get("2025-2026") == "#6A1B9A" and dict(cols).get("2026-2027") == "#1E7145",
        f"لكل عام لونه المخصص ({cols})",
    )

    # تبويبات الأعوام
    tabs = pg.locator(".ytab").all_inner_texts()
    chk(len(tabs) == 3, f"تبويبات الأعوام تبدأ من 2025-2026 ({len(tabs)}): {' · '.join(t.split(chr(10))[0] for t in tabs)}")
    chk(pg.locator(".ytab.on").count() == 1, "تبويب واحد مفعّل")
    chk("الجاري" in " ".join(tabs), "وسم العام الجاري ظاهر")
    chk("مؤرشف" in " ".join(tabs), "وسم العام المؤرشف ظاهر")
    chk(pg.locator('.ytab[data-y="2026-2027"].on').count() == 1, "العام الجاري 2026-2027 هو المفتوح")
    chk("الإدخال متاح" in pg.locator("#ynote").inner_text(), "شريط الحالة يوضح إتاحة الإدخال")
    chk(
        pg.evaluate("()=>typeof Chart") == "function",
        "مكتبة الرسوم محمّلة محلياً بلا CDN",
    )
    chk("Z1" in pg.locator("#brandSub").inner_text(), f"رمز الفريق في الشريط الجانبي")
    chk("رقم 1" in pg.locator("#brandSub").inner_text(), "رقم المنطقة في الشريط الجانبي")

    pg.locator("[data-open]").first.click()
    pg.wait_for_selector(".axbox", timeout=15000)
    chk(pg.locator(".axbox").count() == 4, f"أربعة صناديق محاور ({pg.locator('.axbox').count()})")
    chk(pg.locator(".frow").count() == 31, f"31 صف مؤشر ({pg.locator('.frow').count()})")
    chk(pg.locator(".fld .tgt").count() == 35, f"31 خانة مستهدف + 4 مقامات مركزية ({pg.locator('.fld .tgt').count()})")
    chk("مركزي" in pg.locator("#modalBody").inner_text(), "المقام المركزي معلَّم في الشاشة")
    chk(pg.locator("select[data-f=j]").count() == 6, f"6 قوائم حالة تنفيذ للمؤشرات الوصفية ({pg.locator('select[data-f=j]').count()})")
    chk(pg.locator("input[data-f=m]").count() == 2, f"خانتان ثانويتان ({pg.locator('input[data-f=m]').count()})")
    chk(
        "مُفترض" not in pg.locator("#modalBody").inner_text(),
        "مؤسسة ابتدائية: لا مستهدف مُفترض (المؤشر 20 = 4)",
    )
    t20 = pg.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20 == "4", f"المؤشر 20 لمدرسة ابتدائية مستهدفه 4 ({t20})")

    # لا نص مقطوع أفقياً داخل المودال
    over = pg.evaluate(
        "()=>{const b=document.getElementById('modalBody');"
        "return [...b.querySelectorAll('.ftxt,.fld label')]"
        ".filter(e=>e.scrollWidth>e.clientWidth+2).length}"
    )
    chk(over == 0, f"لا نص مقطوع أفقياً في صفوف المؤشرات ({over})")

    # ── الإدخال والحساب الحي ──
    inputs = pg.locator("#modalBody input[type=number]")
    n_in = inputs.count()
    pg.evaluate(
        "()=>{document.querySelectorAll('#modalBody [data-k]').forEach(el=>{"
        "if(el.tagName==='SELECT'){el.value='100';el.dispatchEvent(new Event('change'));}"
        "else{el.value='10';el.dispatchEvent(new Event('input'));}});}"
    )
    pg.wait_for_timeout(400)
    filled = pg.locator(".fres .chip").count()
    chk(filled > 31, f"شرائح النتيجة ظهرت لكل مؤشر ({filled} شريحة)")
    prog = pg.locator("#evProg").inner_text()
    chk("31 من 31" in prog and "مكتمل" in prog, f"عدّاد الاكتمال: {prog}")
    chk(pg.locator("#evSum table tbody tr").count() == 5, "جدول النتيجة: 4 محاور + نتيجة المؤسسة")
    txt = pg.locator("#evSum").inner_text()
    chk("—" not in pg.locator("#evSum table tbody tr").last.inner_text(), "نتيجة المؤسسة محسوبة بعد الاكتمال")

    pg.wait_for_selector("#evHist .kpi", timeout=15000)
    chk(pg.locator("#evHist canvas").count() == 1, "رسم مسار الدورات موجود")
    cbars = pg.evaluate(
        "()=>{const c=Chart.getChart('chCyc');return c?{n:c.data.labels.length,"
        "cols:c.data.datasets[0].backgroundColor}:null}"
    )
    chk(
        cbars and cbars["n"] == 1 and cbars["cols"] == ["#6A1B9A"],
        f"عمود الدورة المؤرشفة بلون عامها 2025-2026 ({cbars})",
    )
    chk(pg.locator("#evHist .kpi").count() == 4, f"بطاقات الأداء التراكمي ({pg.locator('#evHist .kpi').count()})")
    chk("مؤرشفة" in pg.locator("#evHist").inner_text(), "الدورة المؤرشفة معروضة في السجل")
    chk("لوغاريتمية" in pg.locator("#evHist").inner_text(), "منهجية الدورة المؤرشفة موسومة")
    chk("لا تُقارَن" in pg.locator("#evHist").inner_text(), "تنبيه اختلاف المنهجية ظاهر")
    chk(pg.locator("#evHist .tip.amber").count() == 1, "تنبيه نقص الدورات الثلاث ظاهر")

    chk(pg.locator("[data-move]").count() > 0, "زر طلب النقل متاح للمقيّم")

    pg.click("#evSave")
    pg.wait_for_selector(".toast", timeout=10000)
    toast = pg.locator(".toast").first.inner_text()
    chk("حُفظ" in toast and "31 من 31" in toast, f"الحفظ: {toast}")
    pg.wait_for_timeout(1200)

    # إعادة الفتح: المدخلات باقية
    pg.locator("[data-open]").first.click()
    pg.wait_for_selector(".axbox", timeout=15000)
    kept = pg.evaluate(
        "()=>[...document.querySelectorAll('#modalBody input[data-k]')].filter(e=>e.value!=='').length"
    )
    chk(kept == n_in, f"المدخلات محفوظة بعد إعادة الفتح ({kept} من {n_in})")

    # ── مدرسة «ابتدائي - إعدادي»: قاعدة المرحلة العليا ──
    pg3 = br.new_page(viewport={"width": 1440, "height": 950})
    pg3.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg3.on("pageerror", lambda e: errs.append(str(e)))
    login(pg3, "Z1-2")
    pg3.locator('[data-open="Z1-007"]').click()
    pg3.wait_for_selector(".axbox", timeout=15000)
    chk("مُفترض" not in pg3.locator("#modalBody").inner_text(), "مدرسة ابتدائي - إعدادي: لا مستهدف مُفترض")
    t20b = pg3.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20b == "8", f"المؤشر 20 لمدرسة ابتدائي - إعدادي = 8 حسب المرحلة العليا ({t20b})")
    chk("ابتدائي - إعدادي" in pg3.locator(".mhead").inner_text(), "المرحلة المركّبة معروضة حرفياً في ترويسة المودال")
    chk("من الخطة" in pg3.locator(".frow").nth(19).inner_text(), "المستهدف موسوم «من الخطة» لا «مُفترض»")

    # ── رياض الأطفال: 25 مؤشراً ──
    pg4 = br.new_page(viewport={"width": 1440, "height": 950})
    pg4.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg4.on("pageerror", lambda e: errs.append(str(e)))
    login(pg4, "KG-1")
    pg4.locator("[data-open]").first.click()
    pg4.wait_for_selector(".axbox", timeout=15000)
    chk(pg4.locator(".frow").count() == 25, f"روضة: 25 صف مؤشر ({pg4.locator('.frow').count()})")
    chk(pg4.locator("select[data-f=j]").count() == 2, f"روضة: مؤشران وصفيان ({pg4.locator('select[data-f=j]').count()})")
    chk(pg4.locator("input[data-f=m]").count() == 0, "روضة: لا قيم ثانوية")
    chk("مُفترض" not in pg4.locator("#modalBody").inner_text(), "روضة: لا مستهدف مُفترض")

    # ── المعهد الديني الجعفري: قرار الفريق ثانوي ──
    pg5 = br.new_page(viewport={"width": 1440, "height": 950})
    pg5.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg5.on("pageerror", lambda e: errs.append(str(e)))
    login(pg5, "Z4-5")
    pg5.locator('[data-open="Z4-024"]').click()
    pg5.wait_for_selector(".axbox", timeout=15000)
    chk("مُفترض" not in pg5.locator("#modalBody").inner_text(), "الجعفري: لا مستهدف مُفترض بعد قرار الفريق")
    t20c = pg5.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20c == "8", f"المؤشر 20 للجعفري = 8 ({t20c})")
    head = pg5.locator(".mhead").inner_text()
    chk("معهد ديني ← ثانوي" in head, f"الترويسة تعرض النص الأصلي وقرار الفريق")
    kgrow = pg4.locator("#content tbody tr").first.inner_text()
    chk("رياض أطفال" in kgrow, "روضة: المرحلة «رياض أطفال» لا «غير مسجَّل»")
    chk("4,500" in pg4.locator("#evSum").inner_text(), "روضة: السقف 4,500 في جدول النتيجة")

    # ── الحساب الفني: محرّر المؤشرات ──
    pg2.wait_for_selector("#tgBox .frow", timeout=20000)
    chk(pg2.locator("#tgBox .frow").count() == 31, f"محرّر مؤشرات النظامي 31 مؤشراً ({pg2.locator('#tgBox .frow').count()})")
    chk(pg2.locator("#tgBox [data-prop]").count() == 6, f"ستة أزرار مقترح ({pg2.locator('#tgBox [data-prop]').count()})")
    chk(pg2.locator("#tgBox [data-edit]").count() == 31, "زر تعديل النص لكل مؤشر")
    chk(pg2.locator("#tgBox #ke3 textarea").count() == 0 or not pg2.locator("#tgBox #ke3").is_visible(),
        "لوحة تعديل النص مخفية افتراضياً")
    pg2.locator('#tgBox [data-edit="3"]').click()
    pg2.wait_for_timeout(300)
    chk(pg2.locator("#tgBox #ke3").is_visible(), "لوحة تعديل النص تفتح بالضغط")
    chk(pg2.locator("#tgBox #ke3 textarea").count() >= 5, f"حقول تعديل النص ({pg2.locator('#tgBox #ke3 textarea').count()})")
    pg2.click("#tgKg")
    pg2.wait_for_timeout(2500)
    chk(pg2.locator("#tgBox .frow").count() == 25, f"محرّر مؤشرات المبكر 25 مؤشراً ({pg2.locator('#tgBox .frow').count()})")
    chk(pg2.locator("#tgBox [data-prop]").count() == 6, f"ستة أزرار مقترح للمبكر ({pg2.locator('#tgBox [data-prop]').count()})")

    # ── إدارة الحسابات والإسناد ──
    chk(pg2.locator("[data-acsave]").count() == 37, f"زر حفظ لكل حساب ({pg2.locator('[data-acsave]').count()})")
    chk(pg2.locator('[data-af="team"]').count() == 36, f"قائمة فريق لكل حساب عدا الفني ({pg2.locator('[data-af=team]').count()})")
    pg2.wait_for_selector("#asBox table", timeout=20000)
    chk(pg2.locator("#asBox tbody tr").count() == 56, f"إسناد منطقة 1: {pg2.locator('#asBox tbody tr').count()} مؤسسة")
    chk(pg2.locator('#asBox [data-if="evaluator"]').count() == 56, "قائمة مقيّم لكل مؤسسة")
    pg2.locator('#asTabs [data-as="رياض الأطفال"]').click()
    pg2.wait_for_timeout(3000)
    chk(pg2.locator("#asBox tbody tr").count() == 152, f"إسناد رياض الأطفال: {pg2.locator('#asBox tbody tr').count()} مؤسسة")

    # ── الإحصاءات ورسومها ──
    pg.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    pg.locator('#nav a[data-s="stats"]').click()
    pg.wait_for_selector("#content canvas", timeout=15000)
    pg.wait_for_timeout(600)
    nch = pg.locator("#content .chartcard canvas").count()
    chk(nch == 2, f"رسما شاشة الإحصاءات للمقيّم ({nch})")
    ch = pg.evaluate(
        "()=>{const d=Chart.getChart('chDist'),a=Chart.getChart('chAx');"
        "return {dist:d?d.data.datasets[0].data:null, distCols:d?d.data.datasets[0].backgroundColor:null,"
        "ax:a?a.data.datasets[0].data:null, axLabels:a?a.data.labels:null}}"
    )
    chk(ch["dist"] and sum(ch["dist"]) > 0, f"رسم التقديرات فيه بيانات ({ch['dist']})")
    chk(
        ch["distCols"] == ["#C0392B", "#d98324", "#7aa63f", "#1E7145"],
        f"ألوان التقديرات تتبع نظام التصميم ({ch['distCols']})",
    )
    chk(len(ch["ax"]) == 4 and len(ch["axLabels"]) == 4, "رسم المحاور أربعة أعمدة")
    chk(
        ch["axLabels"] == [
            "التعليم والتعلم الأخضر",
            "البيئة التعليمية الخضراء",
            "تنمية القدرات الخضراء",
            "الشراكة المجتمعية الخضراء",
        ],
        f"أسماء المحاور عربية كاملة في الرسم ({ch['axLabels'][0]})",
    )

    # ── العام المؤرشف 2025-2026 ──
    pg.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    pg.locator('#nav a[data-s="mine"]').click()
    pg.wait_for_timeout(1500)
    pg.locator('.ytab[data-y="2025-2026"]').click()
    pg.wait_for_timeout(2500)
    chk("مؤرشف" in pg.locator("#ynote").inner_text(), "شريط الحالة يوضح أن العام مؤرشف")
    chk(pg.locator(".tip.amber").count() >= 1, "لافتة العام المؤرشف ظاهرة")
    chk(pg.locator("[data-open]").count() == 0, "لا زر تقييم في العام المؤرشف")
    chk(pg.locator("[data-move]").count() == 0, "لا زر نقل في العام المؤرشف")
    ev = pg.locator("#content tbody tr").first.inner_text()
    chk("مكتمل" in ev and "مستدام" in ev, f"المؤسسة تظهر مقيَّمة بنتيجة الملف المركزي")

    # ── العام القادم: عرض فقط ──
    pg.locator('.ytab[data-y="2027-2028"]').click()
    pg.wait_for_timeout(2500)
    chk("عرض فقط" in pg.locator("#ynote").inner_text(), "العام القادم: عرض فقط")
    pg.locator("[data-open]").first.click()
    pg.wait_for_selector(".axbox", timeout=15000)
    chk(pg.locator("#evSave").count() == 0, "لا زر حفظ في عام غير جارٍ")
    dis = pg.evaluate("()=>[...document.querySelectorAll('#modalBody [data-k]')].every(e=>e.disabled)")
    chk(dis, "خانات الإدخال معطَّلة في عام غير جارٍ")
    pg.click("#mClose")

    body = pg.locator("body").inner_text() + pg2.locator("body").inner_text() + pg3.locator("body").inner_text() + pg4.locator("body").inner_text() + pg5.locator("body").inner_text()
    chk("undefined" not in body and "NaN" not in body, "لا يوجد undefined/NaN في الصفحات")
    chk(len(errs) == 0, f"أخطاء الكونسول: {len(errs)} {errs[:3]}")
    br.close()

print("\nالنتيجة: " + ("كل الفحوص سليمة \u2713" if ok else "توجد أخطاء \u2717"))
sys.exit(0 if ok else 1)
