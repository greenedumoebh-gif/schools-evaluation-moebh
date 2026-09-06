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
    navs = pg.evaluate("()=>[...document.querySelectorAll('#nav a')].map(a=>a.dataset.s)")
    chk("central" in navs, f"شاشة بيانات المؤسسات متاحة للمقيّم ({' · '.join(navs)})")
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
    # اسم المنصة ورقم الإصدار
    chk(
        "منصة تقييم المؤسسات التعليمية" in pg.title(),
        f"عنوان الصفحة بالاسم الجديد ({pg.title()[:48]})",
    )
    chk(
        "منصة تقييم المؤسسات التعليمية" in pg.locator(".brand h1").inner_text(),
        "اسم المنصة في الشريط الجانبي",
    )
    chk(
        "الإصدار" in pg.locator("#brandVer").inner_text(),
        f"رقم الإصدار ظاهر ({pg.locator('#brandVer').inner_text()})",
    )

    # شفافية الشعارين داخل المربع الأبيض — قياس بكسل الركن بعد الرسم
    alpha = pg.evaluate(
        """async()=>{const out=[];
        for(const im of document.querySelectorAll('.lgbox img')){
          const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
          const x=c.getContext('2d');x.drawImage(im,0,0);
          const d=x.getImageData(0,0,1,1).data, e=x.getImageData(c.width-1,c.height-1,1,1).data;
          out.push({src:im.getAttribute('src'),a1:d[3],a2:e[3]});}
        return out}"""
    )
    chk(
        alpha and all(a["a1"] == 0 and a["a2"] == 0 for a in alpha),
        f"خلفية الشعارين شفافة فعلياً ({[(a['src'].split('/')[-1], a['a1']) for a in alpha]})",
    )

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

    # ملاحظات المؤشرات والملاحظات العامة وترشيح قصة النجاح
    chk(pg.locator(".notebtn").count() == 31, f"زر ملاحظة لكل مؤشر ({pg.locator('.notebtn').count()})")
    chk(
        pg.evaluate("()=>[...document.querySelectorAll('.noteta')].every(t=>t.hidden)"),
        "خانات الملاحظات مخفية افتراضياً — الكتابة اختيارية",
    )
    pg.locator('.notebtn[data-note="1"]').click()
    pg.wait_for_timeout(200)
    chk(not pg.locator("#nt1").is_hidden(), "خانة الملاحظة تفتح بالضغط")
    pg.fill("#nt1", "ملاحظة اختبارية على المؤشر الأول")
    pg.fill("#evNotes", "ملاحظة عامة على أداء المؤسسة")
    chk(pg.locator("#stOn").count() == 1, "خانة ترشيح قصة النجاح موجودة")
    chk(pg.locator("#stBox").is_hidden(), "صندوق تعليق القصة مغلق قبل التحديد")
    pg.check("#stOn")
    pg.wait_for_timeout(200)
    chk(not pg.locator("#stBox").is_hidden(), "التحديد يفتح صندوق تعليق القصة")
    pg.fill("#stText", "تجربة حديقة المدرسة التعليمية")

    pg.click("#evSave")
    pg.wait_for_selector(".toast", timeout=10000)
    toast = pg.locator(".toast").first.inner_text()
    chk("حُفظ" in toast and "31 من 31" in toast, f"الحفظ: {toast}")
    pg.wait_for_timeout(1200)

    # إعادة الفتح: المدخلات باقية
    pg.locator("[data-open]").first.click()
    pg.wait_for_selector(".axbox", timeout=15000)
    chk(
        pg.evaluate("()=>document.getElementById('nt1').value.length") > 0,
        "ملاحظة المؤشر محفوظة بعد إعادة الفتح",
    )
    chk(pg.locator("#stOn").is_checked(), "الترشيح كقصة نجاح محفوظ")
    chk(
        "حديقة" in pg.evaluate("()=>document.getElementById('stText').value"),
        "تعليق قصة النجاح محفوظ",
    )
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

    # ── رئيس الفريق: كل مؤسسات فريقه وإدخال التقييم ──
    pg6 = br.new_page(viewport={"width": 1440, "height": 950})
    pg6.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg6.on("pageerror", lambda e: errs.append(str(e)))
    login(pg6, "Z1-L")
    lnav = pg6.evaluate("()=>[...document.querySelectorAll('#nav a')].map(a=>a.dataset.s)")
    chk("mine" in lnav and "central" in lnav, f"شاشات رئيس الفريق ({' · '.join(lnav)})")
    pg6.locator('#nav a[data-s="mine"]').click()
    pg6.wait_for_selector("#content tbody tr", timeout=15000)
    nlead = pg6.locator("#content tbody tr").count()
    chk(nlead == 56, f"رئيس الفريق يرى كل مؤسسات فريقه ({nlead})")
    lhdr = pg6.locator("#content thead th").all_inner_texts()
    chk("المقيّم" in lhdr, f"عمود المقيّم في جدول رئيس الفريق ({' · '.join(lhdr[-3:])})")
    chk(pg6.locator("[data-open]").count() == 56, "زر التقييم متاح لكل مؤسسة")
    pg6.locator("[data-open]").first.click()
    pg6.wait_for_selector(".axbox", timeout=15000)
    chk(pg6.locator("#evSave").count() == 1, "زر حفظ التقييم متاح لرئيس الفريق")
    pg6.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    pg6.wait_for_timeout(300)

    # ── لوحة توزيع المؤسسات بالسحب والإفلات ──
    chk("assign" in lnav, "شاشة التوزيع متاحة لرئيس الفريق")
    pg6.locator('#nav a[data-s="assign"]').click()
    pg6.wait_for_selector(".asgcol", timeout=20000)
    ncol = pg6.locator(".asgcol").count()
    chk(ncol == 5, f"عمود لكل مقيّم في الفريق ({ncol})")
    ncard = pg6.locator(".asgcard").count()
    chk(ncard == 56, f"بطاقة لكل مؤسسة ({ncard})")
    chk(
        pg6.evaluate("()=>[...document.querySelectorAll('.asgcard')].every(c=>c.draggable)"),
        "كل البطاقات قابلة للسحب",
    )
    chk(pg6.locator("#asgSave").is_disabled(), "زر الحفظ معطَّل قبل أي تغيير")
    chk("لا تغييرات معلّقة" in pg6.locator(".asgnote").inner_text(), "شريط الحالة يبدأ فارغاً")

    # السحب والإفلات فعلياً
    src = pg6.locator(".asgcol").nth(0).locator(".asgcard").first
    inst_id = src.get_attribute("data-inst")
    before_n = pg6.locator(".asgcol").nth(1).locator(".asgcard").count()
    src.drag_to(pg6.locator(".asgdrop").nth(1))
    pg6.wait_for_timeout(500)
    after_n = pg6.locator(".asgcol").nth(1).locator(".asgcard").count()
    chk(after_n == before_n + 1, f"السحب نقل البطاقة للعمود الثاني ({before_n} ← {after_n})")
    chk(
        pg6.locator(f'.asgcard[data-inst="{inst_id}"].moved').count() == 1,
        "البطاقة المنقولة موسومة كتغيير معلّق",
    )
    chk(not pg6.locator("#asgSave").is_disabled(), "زر الحفظ صار متاحاً بعد التغيير")
    chk("1 تغيير" in pg6.locator(".asgnote").inner_text(), "عدّاد التغييرات المعلّقة يعمل")

    # النقل اليدوي بالقائمة
    pg6.locator(f'select[data-mv="{inst_id}"]').select_option("Z1-3")
    pg6.wait_for_timeout(400)
    chk(
        pg6.locator('.asgcol:nth-child(3) .asgcard[data-inst="' + inst_id + '"]').count() == 1
        or pg6.evaluate(
            "(id)=>{const c=document.querySelector(`.asgcard[data-inst='${id}']`);"
            "return c.closest('.asgdrop').dataset.col}",
            inst_id,
        ) == "Z1-3",
        "النقل اليدوي بالقائمة يعمل",
    )

    # التراجع
    pg6.click("#asgReset")
    pg6.wait_for_timeout(400)
    chk(pg6.locator(".asgcard.moved").count() == 0, "التراجع يلغي كل التغييرات المعلّقة")
    chk(pg6.locator("#asgSave").is_disabled(), "زر الحفظ عاد معطَّلاً بعد التراجع")

    # الحفظ الفعلي ثم الإرجاع
    src2 = pg6.locator(".asgcol").nth(0).locator(".asgcard").first
    id2 = src2.get_attribute("data-inst")
    orig_col = pg6.evaluate(
        "(id)=>document.querySelector(`.asgcard[data-inst='${id}']`).closest('.asgdrop').dataset.col",
        id2,
    )
    src2.drag_to(pg6.locator(".asgdrop").nth(3))
    pg6.wait_for_timeout(400)
    pg6.click("#asgSave")
    pg6.wait_for_selector(".toast", timeout=15000)
    chk("حُفظ توزيع" in pg6.locator(".toast").first.inner_text(), "الحفظ يعيد رسالة تأكيد")
    pg6.wait_for_selector(".asgcol", timeout=20000)
    pg6.wait_for_timeout(600)
    col_of = pg6.evaluate(
        "(id)=>document.querySelector(`.asgcard[data-inst='${id}']`).closest('.asgdrop').dataset.col",
        id2,
    )
    chk(col_of == "Z1-4", f"التوزيع محفوظ فعلاً في الخادم ({col_of})")
    chk(pg6.locator(".asgcard.moved").count() == 0, "لا تغييرات معلّقة بعد الحفظ")
    # إعادة المؤسسة إلى مقيّمها الأصلي حتى لا تتأثر بقية الفحوص
    pg6.locator(f'select[data-mv="{id2}"]').select_option(orig_col)
    pg6.wait_for_timeout(400)
    pg6.click("#asgSave")
    pg6.wait_for_timeout(2500)
    back_col = pg6.evaluate(
        "(id)=>document.querySelector(`.asgcard[data-inst='${id}']`).closest('.asgdrop').dataset.col",
        id2,
    )
    chk(back_col == orig_col, f"أُعيدت المؤسسة إلى مقيّمها الأصلي ({back_col})")

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

    # ── معاينة حساب آخر ──
    chk(pg2.locator("[data-viewas]").count() == 37, "زر معاينة لكل حساب")

    # إعادة تعيين كلمات المرور
    chk(pg2.locator(".pwck").count() == 37, "خانة اختيار لكل حساب")
    chk(pg2.locator("#pwSel").count() == 1 and pg2.locator("#pwAll").count() == 1,
        "زرا إعادة التعيين للمحدد وللكل")
    chk("12345678" in pg2.locator("#content").inner_text(), "الكلمة الافتراضية معروضة للفني")
    pg2.check("#pwCkAll")
    pg2.wait_for_timeout(200)
    chk(
        pg2.locator(".pwck:checked").count() == 37,
        f"تحديد الكل يعمل ({pg2.locator('.pwck:checked').count()})",
    )
    pg2.uncheck("#pwCkAll")
    pg2.wait_for_timeout(200)
    chk(pg2.locator(".pwck:checked").count() == 0, "إلغاء التحديد يعمل")
    pg2.locator('[data-viewas="Z1-1"]').click()
    pg2.wait_for_selector("#viewbar", timeout=20000)
    # المعاينة تعيد تحميل الصفحة، فتفتح نافذة كلمة المرور الإلزامية للحساب المعايَن
    pg2.wait_for_timeout(1200)
    pg2.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    vb = pg2.locator("#viewbar").inner_text()
    chk("Z1-1" in vb and "معاينة" in vb, f"لافتة المعاينة ظاهرة ({vb[:46]}…)")
    vnav = pg2.evaluate("()=>[...document.querySelectorAll('#nav a')].map(a=>a.dataset.s)")
    chk(
        "tech" not in vnav and "mine" in vnav,
        f"الشاشات صارت شاشات المقيّم ({' · '.join(vnav)})",
    )
    pg2.locator('#nav a[data-s="mine"]').click()
    pg2.wait_for_selector("#content tbody tr", timeout=15000)
    chk(pg2.locator("#content tbody tr").count() == 12, "نطاق المؤسسات صار نطاق المقيّم")
    pg2.locator("[data-open]").first.click()
    pg2.wait_for_selector(".axbox", timeout=15000)
    chk(pg2.locator("#evSave").count() == 1, "شاشة التقييم تُعرض كما يراها المقيّم")
    vsave = pg2.evaluate(
        """async()=>{const r=await fetch('/api/evaluation',{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({instId:'Z1-001',kpi:{}})});
        return r.status}"""
    )
    chk(vsave == 403, f"الخادم يرفض الكتابة أثناء المعاينة ({vsave})")
    # هذا الرفض متعمَّد في الفحص أعلاه، فلا يُحسب خطأ كونسول
    errs[:] = [e for e in errs if "403" not in e]
    pg2.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    pg2.wait_for_timeout(300)
    pg2.click("#vbExit")
    pg2.wait_for_timeout(1500)
    pg2.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    pg2.locator('#nav a[data-s="tech"]').click()
    pg2.wait_for_selector("#tgBox .frow", timeout=25000)
    pg2.wait_for_selector("#asBox table", timeout=25000)
    chk(pg2.locator("#viewbar").count() == 0, "اللافتة اختفت بعد إنهاء المعاينة")
    tnav = pg2.evaluate("()=>[...document.querySelectorAll('#nav a')].map(a=>a.dataset.s)")
    chk("tech" in tnav, f"الحساب الفني استعاد شاشاته ({' · '.join(tnav)})")

    # ── إدارة الحسابات والإسناد ──
    chk(pg2.locator("[data-acsave]").count() == 37, f"زر حفظ لكل حساب ({pg2.locator('[data-acsave]').count()})")
    chk(pg2.locator("[data-rn]").count() == 37, "خانة اسم المستخدم قابلة للتعديل لكل حساب")
    chk(pg2.locator("[data-rnsave]").count() == 37, "زر تغيير اسم المستخدم لكل حساب")
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

    # ── شاشة البيانات المركزية للمقيّم ──
    pg.locator('#nav a[data-s="central"]').click()
    pg.wait_for_selector("#content table", timeout=15000)
    ncd = pg.locator("#content tbody tr").count()
    chk(ncd == 12, f"المقيّم يرى بيانات مؤسساته وحدها ({ncd})")
    chk(pg.locator("#cdSaveAll").count() == 1, "زر الحفظ متاح للمقيّم")
    chk(
        "تخصّ عاماً دراسياً بعينه" in pg.locator("#content").inner_text(),
        "تنبيه ارتباط الأعداد بالعام الدراسي ظاهر",
    )
    inp = pg.locator('#content [data-cdf="students"]').first
    inp.fill("1500")
    pg.wait_for_timeout(300)
    chk(
        "الكبيرة جداً" in pg.locator("#content tbody tr").first.inner_text(),
        "التصنيف يُشتق حياً في شاشة المقيّم",
    )
    pg.locator('#nav a[data-s="mine"]').click()
    pg.wait_for_timeout(1500)

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
    chk("مكتمل" in ev and "مستدام" in ev, "المؤسسة تظهر مقيَّمة بنتيجة الملف المركزي")
    nrows = pg.locator("#content tbody tr").count()
    ndone = pg.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')]"
        ".filter(r=>r.innerText.includes('مكتمل')).length"
    )
    npend = pg.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')]"
        ".filter(r=>r.innerText.includes('قيد التقييم')).length"
    )
    chk(
        ndone + npend == nrows and npend <= 1,
        f"مؤسسات المقيّم مسجَّلة في العام المؤرشف: {ndone} مكتملة و{npend} قيد التقييم من {nrows}",
    )

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

    body = pg.locator("body").inner_text() + pg2.locator("body").inner_text() + pg3.locator("body").inner_text() + pg4.locator("body").inner_text() + pg5.locator("body").inner_text() + pg6.locator("body").inner_text()
    chk("undefined" not in body and "NaN" not in body, "لا يوجد undefined/NaN في الصفحات")
    chk(len(errs) == 0, f"أخطاء الكونسول: {len(errs)} {errs[:3]}")
    br.close()

print("\nالنتيجة: " + ("كل الفحوص سليمة \u2713" if ok else "توجد أخطاء \u2717"))
sys.exit(0 if ok else 1)
