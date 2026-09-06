# -*- coding: utf-8 -*-
"""فحص الشاشات في المتصفح — قياسات كمية لا حكم بصري."""
import os, sys, time
import openpyxl
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


# التهيئة تعمل في الخلفية بعد أول طلب؛ ننتظر اكتمالها قبل فتح المتصفح
import json as _json
import urllib.request as _url

for _ in range(180):
    try:
        _h = _json.loads(_url.urlopen(BASE + "/health", timeout=5).read())
    except Exception:
        _h = {"setup": "running"}
    if _h.get("setup") == "done":
        break
    if _h.get("setup") == "failed":
        raise SystemExit("فشلت التهيئة: " + str(_h.get("error")))
    time.sleep(1)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    # ── الحساب الفني أولاً: البيانات المركزية شرط لحساب سبعة مؤشرات ──
    pg2 = br.new_page(viewport={"width": 1440, "height": 950})
    errs = []
    pg2.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg2.on("pageerror", lambda e: errs.append(str(e)))
    login(pg2, "TECH")
    pg2.wait_for_selector("#cdBox table", timeout=20000)
    ncd0 = pg2.locator("#cdBox tbody tr").count()
    chk(ncd0 >= 56, f"البيانات المركزية منطقة 1: {ncd0}")
    chk(pg2.locator('#cdBox [data-cdf="teachers"]').count() == ncd0, "خانة عدد المعلمين لكل مؤسسة")
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
    chk("القطاع" in hdr, "عمود القطاع في جدول المؤسسات")
    chk(
        "حكومية" in pg.locator("#content tbody").inner_text(),
        "مؤسسات المنطقة موسومة «حكومية»",
    )
    row1 = pg.locator("#content tbody tr").first.inner_text()
    chk("المدرسة " in row1, "تصنيف الحجم معروض في الصف الأول")
    chk(pg.locator("[data-move]").count() > 0, "زر طلب النقل متاح للمقيّم")
    chk(pg.evaluate("getComputedStyle(document.documentElement).direction") == "rtl", "اتجاه الصفحة RTL")

    # الشعارات
    logos = pg.evaluate(
        "()=>[...document.querySelectorAll('img')].map(i=>({s:i.getAttribute('src'),w:i.naturalWidth}))"
    )
    broken = [l for l in logos if l["w"] == 0]
    chk(len(logos) >= 2, f"صور الشعار في الصفحة ({len(logos)})")
    chk(not broken, f"لا شعار مكسور ({[b['s'] for b in broken]})")
    # شاشة الدخول: الإصدار والتذييل وغياب معلومات الدخول الافتراضية
    lg = br.new_page(viewport={"width": 1440, "height": 950})
    lg.goto(BASE, wait_until="networkidle")
    lv = lg.evaluate(
        """()=>{const e=document.getElementById('lver');
        if(!e) return {found:false};
        const b=e.getBoundingClientRect();
        const btn=document.querySelector('#loginForm button[type=submit]').getBoundingClientRect();
        return {found:true,text:e.textContent.trim(),belowBtn:b.top>btn.bottom,
          inView:b.top>=0&&b.bottom<=innerHeight,body:document.body.innerText}}"""
    )
    chk(lv["found"] and lv["inView"] and lv["belowBtn"], f"الإصدار ظاهر أسفل زر الدخول ({lv.get('text')})")
    chk(lv.get("text", "").startswith("الإصدار "), "نص الإصدار محقون من الخادم")
    chk("{{" not in lv["body"], "لا عناصر بديلة غير مستبدلة في الصفحة")
    chk(
        "Z1-1" not in lv["body"] and "TECH" not in lv["body"],
        "لا معلومات دخول افتراضية في شاشة الدخول",
    )
    chk("إدارة المنشآت" not in lv["body"], "اسم الإدارة القديم أُزيل من شاشة الدخول")
    chk(
        "فريق التعليم الأخضر · وزارة التربية والتعليم · مملكة البحرين" in lv["body"],
        "تذييل شاشة الدخول بالصياغة المعتمدة",
    )
    lg.close()

    # المراسلات
    chk("mail" in navs, "شاشة المراسلات في القائمة")
    pg.locator('#nav a[data-s="mail"]').click()
    pg.wait_for_selector("#mlNew", timeout=15000)
    pg.click("#mlNew")
    pg.wait_for_selector("#thSend", timeout=15000)
    cids = pg.evaluate("()=>[...document.querySelectorAll('.thto')].map(c=>c.value)")
    chk(len(cids) > 0 and not any(i.startswith("Z2-") for i in cids), f"جهات الاتصال ضمن النطاق ({len(cids)})")
    chk("Z1-L" in cids and "TECH" in cids, "قائد الفريق والحساب الفني ضمن المتاح")
    pg.fill("#thSubj", "استيضاح من الفحص")
    pg.check('.thto[value="Z1-L"]')
    pg.fill("#thText", "نص رسالة الفحص.")
    pg.click("#thSend")
    pg.wait_for_selector("#msgs", timeout=15000)
    chk("نص رسالة الفحص" in pg.locator("#msgs").inner_text(), "الرسالة الأولى ظاهرة في الموضوع")
    pg.click("#mlBack")
    pg.wait_for_selector("#content table", timeout=15000)
    chk("استيضاح من الفحص" in pg.locator("#content").inner_text(), "الموضوع في صندوق المرسل")
    pg.locator('#nav a[data-s="mine"]').click()
    pg.wait_for_selector("#content tbody tr", timeout=15000)

    # سمات الألوان
    def lum(c):
        v = [int(x) for x in c[c.find("(") + 1:c.find(")")].split(",")[:3]]
        return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255

    chk(pg.locator(".thbtn").count() == 5, f"خمس سمات للاختيار ({pg.locator('.thbtn').count()})")
    chk(pg.evaluate("()=>document.documentElement.dataset.theme") == "green", "السمة الافتراضية خضراء")
    names = pg.evaluate("()=>[...document.querySelectorAll('.thbtn')].map(b=>b.title.split(' —')[0])")
    chk("الملكي" in names, f"السمة الملكية ضمن الخيارات ({' · '.join(names)})")
    snap = lambda: pg.evaluate(
        """()=>({sb:getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
        bg:getComputedStyle(document.body).backgroundColor,
        th:(()=>{const t=document.querySelector('th');return t?getComputedStyle(t).backgroundColor:''})(),
        lg:getComputedStyle(document.getElementById('login')).backgroundImage})"""
    )
    before = snap()
    pg.locator('[data-th="royal"]').click()
    pg.wait_for_timeout(1500)
    after = snap()
    chk(pg.evaluate("()=>document.documentElement.dataset.theme") == "royal", "التبديل إلى الملكي")
    chk(after["sb"] != before["sb"], f"الشريط الجانبي يتبع السمة ({before['sb']} ← {after['sb']})")
    chk(after["bg"] != before["bg"], "خلفية الصفحة تتبع السمة")
    chk(after["th"] != before["th"], f"رؤوس الجداول تتبع السمة ({after['th']})")
    chk(after["lg"] != before["lg"], "خلفية شاشة الدخول تتبع السمة")
    pg.emulate_media(media="print")
    pg.wait_for_timeout(300)
    pbg = pg.evaluate("()=>getComputedStyle(document.body).backgroundColor")
    pink = pg.evaluate("()=>getComputedStyle(document.body).color")
    chk(
        lum(pbg) > 0.8 and lum(pink) < 0.4,
        f"الطباعة تعود إلى السمة الفاتحة (خلفية {lum(pbg):.2f})",
    )
    pg.emulate_media(media="screen")
    pg.wait_for_timeout(300)
    pg.locator('#nav a[data-s="stats"]').click()
    pg.wait_for_selector("#content canvas", timeout=15000)
    pg.wait_for_timeout(700)
    chcol = pg.evaluate(
        "()=>{const c=Chart.getChart('chDist');return c?c.options.plugins.legend.labels.color:''}"
    )
    chk(chcol.replace(" ", "") != "#20302a", f"ألوان الرسوم تتبع السمة ({chcol})")
    # السمة الداكنة: مسح تباين شامل — كل عنصر بخلفية صريحة يجب أن يقرأ
    pg.locator('#nav a[data-s="mine"]').click()
    pg.wait_for_selector("#content tbody tr", timeout=15000)
    pg.locator('[data-th="dark"]').click()
    pg.wait_for_timeout(1500)
    chk(pg.evaluate("()=>document.documentElement.dataset.theme") == "dark", "التبديل إلى الداكن")
    lgb = pg.evaluate(
        """()=>{const e=document.querySelector('.lgbox');const cs=getComputedStyle(e);
        return {bg:cs.backgroundColor,fg:cs.color}}"""
    )
    chk(lgb["bg"] == "rgb(255, 255, 255)", "صندوق الشعار يبقى أبيض في الداكن")
    bad = pg.evaluate(
        """()=>{
        const lum=c=>{const v=c.match(/\d+/g).map(Number);
          const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};
          return 0.2126*f(v[0])+0.7152*f(v[1])+0.0722*f(v[2])};
        const cr=(a,b)=>{const x=lum(a),y=lum(b);const hi=Math.max(x,y),lo=Math.min(x,y);
          return (hi+0.05)/(lo+0.05)};
        const out=[];
        document.querySelectorAll('.sidebar *, #content *').forEach(e=>{
          const cs=getComputedStyle(e);
          if(!/^rgb\(/.test(cs.backgroundColor))return;
          if(!e.textContent.trim())return;
          if(e.getBoundingClientRect().height===0)return;
          const r=cr(cs.color,cs.backgroundColor);
          if(r<4.5) out.push(`${e.className||e.tagName}:${Math.round(r*10)/10}`);
        });
        return [...new Set(out)].slice(0,6)}"""
    )
    chk(len(bad) == 0, f"لا عنصر بتباين أقل من 4.5 في السمة الداكنة ({bad})")
    pg.locator('[data-th="green"]').click()
    pg.wait_for_timeout(1200)
    chk(pg.evaluate("()=>document.documentElement.dataset.theme") == "green", "العودة إلى الأخضر")
    pg.locator('#nav a[data-s="mine"]').click()
    pg.wait_for_selector("#content tbody tr", timeout=15000)

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

    # الشريط اللاصق · الحالة الجزئية · الفلتر · الحفظ التلقائي · المقارنة بالزر
    chk(
        pg.evaluate("()=>getComputedStyle(document.getElementById('evBar')).position") == "fixed",
        "شريط النتيجة مثبّت لا لاصق",
    )
    tbh = pg.evaluate("()=>Math.round(document.querySelector('.topbar').getBoundingClientRect().height)")
    for y in (800, 4000, 9000):
        pg.mouse.wheel(0, y)
        pg.wait_for_timeout(250)
        rb = pg.evaluate(
            """()=>{const b=document.getElementById('evBar').getBoundingClientRect();
            return {top:Math.round(b.top),vis:b.bottom>0&&b.top<innerHeight}}"""
        )
        chk(abs(rb["top"] - tbh) <= 2 and rb["vis"], f"الشريط يرافق التمرير عند {y} (top={rb['top']})")
    pg.evaluate("()=>scrollTo(0,0)")
    pg.wait_for_timeout(200)
    chk(pg.locator(".ebax").count() == 4, "بطاقات المحاور الأربع في الشريط")
    chk(pg.locator("#ebSave").inner_text() == "الحفظ تلقائي", "بيان الحفظ التلقائي ظاهر")
    pg.evaluate(
        """()=>{const el=document.querySelector('#content [data-k="1"][data-f="j"]');
        el.value=8;el.dispatchEvent(new Event('input'))}"""
    )
    pg.wait_for_timeout(300)
    chk("بانتظار" in pg.locator("#r1").inner_text(), "المؤشر النسبي يبيّن الخانة الناقصة")
    chk("غير محفوظة" in pg.locator("#ebSave").inner_text(), "تُعلَّم التغييرات غير المحفوظة")
    pg.evaluate(
        """()=>{const el=document.querySelector('#content [data-k="1"][data-f="i"]');
        el.value=10;el.dispatchEvent(new Event('input'))}"""
    )
    pg.wait_for_timeout(300)
    chk(pg.locator("#ebPts").inner_text() != "—", f"النقاط تتحدث لحظياً ({pg.locator('#ebPts').inner_text()})")
    chk(pg.locator("#ebFill").inner_text().startswith("1 /"), "عدّاد المؤشرات في الشريط")
    chk(
        pg.locator("#ebAxC1").inner_text().startswith("1/"),
        f"حالة المحور الأول تتحدث لحظياً ({pg.locator('#ebAxC1').inner_text()})",
    )
    chk(pg.locator("#ebAx1").inner_text() != "—", "نسبة المحور الأول ظاهرة في الشريط")
    pg.locator('[data-ebax="3"]').click()
    pg.wait_for_timeout(400)
    chk(
        pg.locator('#axFilter [data-ax="3"].on').count() == 1,
        "الضغط على محور في الشريط يطبّق فلتره",
    )
    pg.locator('#axFilter [data-ax="0"]').click()
    pg.wait_for_timeout(300)
    pg.wait_for_timeout(2600)
    chk("محفوظ" in pg.locator("#ebSave").inner_text(), f"الحفظ التلقائي ({pg.locator('#ebSave').inner_text()})")
    n_all = pg.locator("#content .frow:visible").count()
    pg.locator('#axFilter [data-ax="2"]').click()
    pg.wait_for_timeout(300)
    n_ax2 = pg.locator("#content .frow:visible").count()
    chk(0 < n_ax2 < n_all, f"فلتر المحور الثاني ({n_all} ← {n_ax2})")
    pg.locator('#axFilter [data-ax="-1"]').click()
    pg.wait_for_timeout(300)
    chk(
        pg.locator("#content .frow:visible").count() == n_all - 1,
        "فلتر غير المكتملة يستبعد المؤشر المكتمل",
    )
    pg.locator('#axFilter [data-ax="0"]').click()
    pg.wait_for_timeout(300)
    chk(pg.locator("#content .frow:visible").count() == n_all, "العودة إلى كل المحاور")
    chk(pg.locator("#evHist canvas").count() == 0, "المقارنة لا تُحمَّل تلقائياً")
    pg.click("#evHistBtn")
    pg.wait_for_selector("#evHist .kpi", timeout=15000)
    chk(pg.locator("#evHist canvas").count() == 1, "المقارنة تُحمَّل عند الطلب")
    chk(pg.locator(".frow").count() == 31, f"31 صف مؤشر ({pg.locator('.frow').count()})")
    chk(pg.locator(".fld .tgt").count() == 35, f"31 خانة مستهدف + 4 مقامات مركزية ({pg.locator('.fld .tgt').count()})")
    chk("مركزي" in pg.locator("#content").inner_text(), "المقام المركزي معلَّم في الشاشة")
    chk(pg.locator("select[data-f=j]").count() == 6, f"6 قوائم حالة تنفيذ للمؤشرات الوصفية ({pg.locator('select[data-f=j]').count()})")
    chk(pg.locator("input[data-f=m]").count() == 2, f"خانتان ثانويتان ({pg.locator('input[data-f=m]').count()})")
    chk(
        "مُفترض" not in pg.locator("#content").inner_text(),
        "مؤسسة ابتدائية: لا مستهدف مُفترض (المؤشر 20 = 4)",
    )
    t20 = pg.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20 == "4", f"المؤشر 20 لمدرسة ابتدائية مستهدفه 4 ({t20})")

    # لا نص مقطوع أفقياً داخل المودال
    over = pg.evaluate(
        "()=>{const b=document.getElementById('content');"
        "return [...b.querySelectorAll('.ftxt,.fld label')]"
        ".filter(e=>e.scrollWidth>e.clientWidth+2).length}"
    )
    chk(over == 0, f"لا نص مقطوع أفقياً في صفوف المؤشرات ({over})")

    # ── الإدخال والحساب الحي ──
    inputs = pg.locator("#content input[type=number]")
    n_in = inputs.count()
    pg.evaluate(
        "()=>{document.querySelectorAll('#content [data-k]').forEach(el=>{"
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
        "()=>[...document.querySelectorAll('#content input[data-k]')].filter(e=>e.value!=='').length"
    )
    chk(kept == n_in, f"المدخلات محفوظة بعد إعادة الفتح ({kept} من {n_in})")

    # ── مدرسة «ابتدائي - إعدادي»: قاعدة المرحلة العليا ──
    pg3 = br.new_page(viewport={"width": 1440, "height": 950})
    pg3.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg3.on("pageerror", lambda e: errs.append(str(e)))
    login(pg3, "Z1-2")
    pg3.locator('[data-open="Z1-007"]').click()
    pg3.wait_for_selector(".axbox", timeout=15000)
    chk("مُفترض" not in pg3.locator("#content").inner_text(), "مدرسة ابتدائي - إعدادي: لا مستهدف مُفترض")
    t20b = pg3.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20b == "8", f"المؤشر 20 لمدرسة ابتدائي - إعدادي = 8 حسب المرحلة العليا ({t20b})")
    chk("ابتدائي - إعدادي" in pg3.locator(".evhead").inner_text(), "المرحلة المركّبة معروضة حرفياً في ترويسة الشاشة")
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
    chk("مُفترض" not in pg4.locator("#content").inner_text(), "روضة: لا مستهدف مُفترض")
    chk("4,500" in pg4.locator("#evSum").inner_text(), "روضة: السقف 4,500 في جدول النتيجة")

    # ── المعهد الديني الجعفري: قرار الفريق ثانوي ──
    pg5 = br.new_page(viewport={"width": 1440, "height": 950})
    pg5.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg5.on("pageerror", lambda e: errs.append(str(e)))
    login(pg5, "Z4-5")
    pg5.locator('[data-open="Z4-024"]').click()
    pg5.wait_for_selector(".axbox", timeout=15000)
    chk("مُفترض" not in pg5.locator("#content").inner_text(), "الجعفري: لا مستهدف مُفترض بعد قرار الفريق")
    t20c = pg5.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20c == "8", f"المؤشر 20 للجعفري = 8 ({t20c})")
    head = pg5.locator(".evhead").inner_text()
    chk("معهد ديني ← ثانوي" in head, f"الترويسة تعرض النص الأصلي وقرار الفريق")
    pg4.click("#evBack")
    pg4.wait_for_selector("#content tbody tr", timeout=15000)
    kgrow = pg4.locator("#content tbody tr").first.inner_text()
    chk("رياض أطفال" in kgrow, "روضة: المرحلة «رياض أطفال» لا «غير مسجَّل»")
    kgall = pg4.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')]"
        ".every(r=>r.innerText.includes('رياض أطفال'))"
    )
    chk(kgall, "كل مؤسسات حساب KG موسومة رياض أطفال")

    # ── التعليم الخاص ──
    pg7 = br.new_page(viewport={"width": 1440, "height": 950})
    pg7.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg7.on("pageerror", lambda e: errs.append(str(e)))
    login(pg7, "PR-1")
    pg7.wait_for_selector("#content tbody tr", timeout=15000)
    prall = pg7.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')]"
        ".every(r=>r.innerText.includes('خاصة'))"
    )
    chk(prall, "كل مؤسسات حساب PR موسومة «خاصة»")
    chk(
        "رياض أطفال" not in pg7.locator("#content tbody").inner_text(),
        "المدارس الخاصة لا تظهر كرياض أطفال",
    )
    pg7.locator("[data-open]").first.click()
    pg7.wait_for_selector(".axbox", timeout=15000)
    chk(pg7.locator(".frow").count() == 31, f"مدرسة خاصة على 31 مؤشراً ({pg7.locator('.frow').count()})")
    chk("خاصة" in pg7.locator(".evhead").inner_text(), "القطاع في ترويسة شاشة التقييم")
    pg7.click("#evBack")

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
    chk(nlead >= 56, f"رئيس الفريق يرى كل مؤسسات فريقه ({nlead})")
    lhdr = pg6.locator("#content thead th").all_inner_texts()
    chk("المقيّم" in lhdr, f"عمود المقيّم في جدول رئيس الفريق ({' · '.join(lhdr[-3:])})")
    chk(pg6.locator("[data-open]").count() == nlead, "زر التقييم متاح لكل مؤسسة")
    chk(pg6.locator("#mineAdd").count() == 1, "زر إضافة المؤسسات متاح من شاشة المؤسسات أيضاً")
    pg6.click("#mineAdd")
    pg6.wait_for_selector("#adTpl", timeout=15000)
    chk(pg6.locator("#ad_name").count() == 1, "نافذة الإضافة تفتح من شاشة المؤسسات")
    pg6.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    pg6.wait_for_timeout(300)
    pg6.locator("[data-open]").first.click()
    pg6.wait_for_selector(".axbox", timeout=15000)
    chk(pg6.locator("#evSave").count() == 1, "زر حفظ التقييم متاح لرئيس الفريق")
    pg6.click("#evBack")
    pg6.wait_for_timeout(800)

    # ── شاشة التقارير ──
    pg6.locator('#nav a[data-s="reports"]').click()
    pg6.wait_for_selector("#rpGen", timeout=15000)
    lv = pg6.evaluate("()=>[...document.querySelectorAll('input[name=rplevel]')].map(i=>i.value)")
    chk(lv == ["summary", "detailed", "full"], f"ثلاثة مستويات تفصيل ({' · '.join(lv)})")
    chk(
        pg6.locator("#rpNotes").is_checked() and pg6.locator("#rpStories").is_checked(),
        "الملاحظات وقصص النجاح مُدرَجة افتراضياً",
    )
    org = pg6.evaluate("()=>document.querySelector('#rpTeam option').textContent")
    chk("إدارة العمليات التعليمية" in org, f"الجهة المُصدِرة في القائمة ({org})")
    pg6.click("#rpGen")
    pg6.wait_for_selector("#rpDoc", timeout=20000)
    pg6.wait_for_timeout(800)
    body = pg6.locator("#rpDoc").inner_text()
    chk("المنطقة التعليمية الأولى" in body, "ترويسة التقرير بالجهة المُصدِرة")
    chk(pg6.locator("#rpDoc canvas").count() == 2, "رسما التقرير")
    chk("الدكتور علي سلمان زهير" in body, "مدير المنطقة في صفحة الاعتماد")
    chk("الأستاذ إبراهيم علي آل بورشيد" in body, "الوكيل المساعد في صفحة الاعتماد")
    chk("الأستاذة سهى صالح حمادة" in body, "مدير عام شؤون المدارس في صفحة الاعتماد")
    chk("الدكتورة نيلوفر أحمد الجهرمي" in body, "رئيس فريق التعليم الأخضر في صفحة الاعتماد")
    chk("ملاحظات فرق التقييم" in body, "قسم الملاحظات موجود")
    chk("قصص النجاح" in body, "قسم قصص النجاح موجود")
    chk("تفصيل المؤشرات" not in body, "المستوى الإحصائي بلا تفصيل مؤشرات")

    pg6.check('input[name="rplevel"][value="full"]')
    pg6.click("#rpGen")
    pg6.wait_for_selector("#rpDoc", timeout=25000)
    pg6.wait_for_timeout(1200)
    body2 = pg6.locator("#rpDoc").inner_text()
    chk("المؤسسات على مستوى المحاور" in body2, "الموسّع يعرض جدول المحاور")
    chk("تفصيل المؤشرات" in body2, "الموسّع يعرض تفصيل المؤشرات")
    nsec = pg6.locator("#rpDoc .rsec").count()
    chk(nsec > 5, f"أقسام التقرير الموسّع ({nsec})")
    pg6.uncheck("#rpNotes")
    pg6.uncheck("#rpStories")
    pg6.click("#rpGen")
    pg6.wait_for_selector("#rpDoc", timeout=25000)
    pg6.wait_for_timeout(1000)
    heads3 = pg6.evaluate(
        "()=>[...document.querySelectorAll('#rpDoc .rsech')].map(e=>e.textContent.trim())"
    )
    chk(
        "ملاحظات فرق التقييم" not in heads3 and "قصص النجاح" not in heads3,
        f"إلغاء التحديد يستبعد قسمَي الملاحظات والقصص ({len(heads3)} أقسام)",
    )

    # سلوك الطباعة: الشاشة تختفي والترويسة تتكرر بالشعارين
    pg6.emulate_media(media="print")
    pg6.wait_for_timeout(400)
    pm = pg6.evaluate(
        """()=>{const vis=e=>e&&getComputedStyle(e).display!=='none';const q=s=>document.querySelector(s);
        const pa=q('.rpaper');const b=pa?pa.getBoundingClientRect():null;
        return {sb:vis(q('.sidebar')),tb:vis(q('.topbar')),yb:vis(q('#yearbar')),
          card:vis(q('#content > .card')),pos:pa?getComputedStyle(pa).position:'',
          moeH:Math.round(q('.rp-moe')?.getBoundingClientRect().height||0),
          headH:Math.round(b?b.height:0)}}"""
    )
    chk(not pm["sb"] and not pm["tb"] and not pm["yb"], "الطباعة تخفي الشريط الجانبي والعلوي وشريط الأعوام")
    chk(not pm["card"], "شاشة الخيارات لا تدخل الطباعة")
    chk(pm["pos"] == "fixed", "ترويسة الورق تتكرر في كل صفحة")
    ratio = pm["moeH"] / pm["headH"] if pm["headH"] else 0
    chk(
        0.70 <= ratio <= 0.80,
        f"شعار الوزارة {ratio:.2f} من ارتفاع الترويسة (المطلوب ثلاثة أرباع)",
    )
    logos = pg6.evaluate(
        """()=>[...document.querySelectorAll('.rpaper img')].map(i=>({s:i.getAttribute('src'),
        w:i.naturalWidth}))"""
    )
    chk(
        len(logos) == 2 and all(x["w"] > 0 for x in logos),
        f"شعارا الترويسة محمّلان ({[x['s'].split('/')[-1] for x in logos]})",
    )
    pg6.emulate_media(media="screen")
    pg6.wait_for_timeout(300)

    # الأقسام الجديدة: غلاف · فهرس · أعلى 10 · مقارنة · إجراءات
    pg6.check('input[name="rplevel"][value="detailed"]')
    pg6.click("#rpGen")
    pg6.wait_for_selector("#rpDoc", timeout=25000)
    pg6.wait_for_timeout(1200)
    heads = pg6.evaluate(
        "()=>[...document.querySelectorAll('#rpDoc .rsech')].map(e=>e.textContent.trim())"
    )
    for want in [
        "فهرس التقرير",
        "الأعلى أداءً وذات الأولوية في المتابعة",
        "المقارنة بالدورة السابقة",
        "إجراءات فريق التعليم الأخضر",
        "الاعتماد",
    ]:
        chk(want in heads, f"قسم «{want}» موجود")
    chk(pg6.locator(".rcover").count() == 1, "غلاف التقرير موجود")
    cov = pg6.locator(".rcover").inner_text()
    chk("رقم النسخة" in cov and "تاريخ الإصدار" in cov, "الغلاف يحمل رقم النسخة وتاريخ الإصدار")
    chk(pg6.locator(".rcover-logos img").count() == 2, "شعارا الغلاف")
    ntoc = pg6.locator("#rpToc tr").count()
    chk(
        ntoc == len(heads) - 1,
        f"الفهرس يطابق أقسام التقرير ({ntoc} من {len(heads) - 1})",
    )
    chk(pg6.locator(".actrow").count() >= 7, f"قائمة الإجراءات ({pg6.locator('.actrow').count()} بنود)")
    chk(pg6.locator("#rpFoot").count() == 1, "تذييل ورق التقرير موجود")

    # ── الجوال: قياسات على عرض 390px ──
    mob = br.new_page(viewport={"width": 390, "height": 800})
    mob.on("pageerror", lambda e: errs.append(str(e)))
    login(mob, "Z1-1")
    sb = mob.evaluate(
        "()=>{const s=document.querySelector('.sidebar');const r=s.getBoundingClientRect();"
        "return {hidden:r.right<=1||getComputedStyle(s).transform!=='none',menu:"
        "getComputedStyle(document.getElementById('mbtn')).display}}"
    )
    chk(sb["menu"] == "block", "زر القائمة ظاهر على الجوال")
    chk(sb["hidden"], "الشريط الجانبي مطوي افتراضياً")
    mob.click("#mbtn")
    mob.wait_for_timeout(400)
    chk(mob.locator("#scrim").count() == 1, "طبقة معتمة خلف القائمة المفتوحة")
    # الشريط الجانبي يغطّي يمين الشاشة، فنلمس الطبقة في يسارها
    mob.click("#scrim", position={"x": 20, "y": 300})
    mob.wait_for_timeout(400)
    chk(mob.locator("#scrim").count() == 0, "اللمس خارج القائمة يغلقها")
    ovf = mob.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")
    chk(ovf <= 2, f"لا تمرير أفقي في الصفحة ({ovf}px)")
    mob.locator("[data-open]").first.click()
    mob.wait_for_selector(".axbox", timeout=20000)
    chk(mob.locator("#modal.on").count() == 0, "شاشة التقييم صفحة كاملة لا نافذة منبثقة")
    small = mob.evaluate(
        """()=>[...document.querySelectorAll('#content input,#content select,#content .btn')]
        .filter(e=>e.getBoundingClientRect().height>0 && e.getBoundingClientRect().height<40).length"""
    )
    chk(small == 0, f"كل عناصر اللمس 40px فأكثر ({small} أصغر)")
    fs = mob.evaluate(
        "()=>[...document.querySelectorAll('#content input[type=number]')]"
        ".every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)"
    )
    chk(fs, "حجم خط الحقول 16px فأكثر فلا يقرّب iOS الشاشة")
    ovf2 = mob.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")
    chk(ovf2 <= 2, f"لا تمرير أفقي في شاشة التقييم ({ovf2}px)")
    mob.close()
    # ── لوحة توزيع المؤسسات بالسحب والإفلات ──
    chk("assign" in lnav, "شاشة التوزيع متاحة لرئيس الفريق")
    pg6.locator('#nav a[data-s="assign"]').click()
    pg6.wait_for_selector(".asgcol", timeout=20000)
    ncol = pg6.locator(".asgcol").count()
    chk(ncol == 5, f"عمود لكل مقيّم في الفريق ({ncol})")
    ncard = pg6.locator(".asgcard").count()
    nrows6 = pg6.evaluate("()=>ROWS.filter(r=>r.team===ME.team).length") if False else ncard
    chk(ncard >= 56, f"بطاقة لكل مؤسسة ({ncard})")
    chk(
        pg6.evaluate("()=>[...document.querySelectorAll('.asgcard')].every(c=>c.draggable)"),
        "كل البطاقات قابلة للسحب",
    )
    chk(pg6.locator("#asgSave").is_disabled(), "زر الحفظ معطَّل قبل أي تغيير")

    # ── إضافة مؤسسة ورفع ملف إكسل ──
    chk(pg6.locator("#asgAdd").count() == 1, "زر إضافة المؤسسات متاح لرئيس الفريق")
    pg6.click("#asgAdd")
    pg6.wait_for_selector("#adTpl", timeout=15000)
    chk(pg6.locator("#ad_name").count() == 1, "نموذج المؤسسة الواحدة ظاهر")
    opts = pg6.evaluate("()=>[...document.querySelectorAll('#ad_stage option')].map(o=>o.textContent)")
    chk(
        opts[1:] == ["ابتدائي", "إعدادي", "ثانوي", "رياض أطفال", "تعليم خاص"],
        f"قائمة المراحل كما اعتُمدت ({' · '.join(opts[1:])})",
    )
    gopts = pg6.evaluate("()=>[...document.querySelectorAll('#ad_gender option')].map(o=>o.textContent)")
    chk(gopts[1:] == ["بنين", "بنات", "مشترك"], f"قائمة الجنس ({' · '.join(gopts[1:])})")
    chk(pg6.evaluate("()=>typeof XLSX") == "object", "مكتبة الإكسل محمّلة محلياً بلا CDN")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "المؤسسات"
    ws.append(["اسم المدرسة", "المرحلة", "بنين/بنات/مشترك", "عدد الطلاب", "عدد المعلمين", "عدد المواد"])
    ws.append(["مدرسة الرفع الأولى", "إعدادي", "بنات", 700, 30, 8])
    ws.append(["مدرسة الرفع الثانية", "", "", "", "", ""])
    wb.save("/tmp/ui_upload_test.xlsx")
    pg6.set_input_files("#adFile", "/tmp/ui_upload_test.xlsx")
    pg6.wait_for_selector("#adBulk", timeout=15000)
    nprev = pg6.locator("#adPrev tbody tr").count()
    chk(nprev == 2, f"صفّان مقروءان من الملف ({nprev})")
    prev_txt = pg6.locator("#adPrev").inner_text()
    chk("مدرسة الرفع الأولى" in prev_txt and "700" in prev_txt, "قيم الصف المكتمل معروضة")
    chk("فارغة ستبقى فارغة" in prev_txt, "المنصة تصرّح بأن الفراغ يبقى فراغاً")
    pg6.click("#adBulk")
    pg6.wait_for_selector(".toast", timeout=15000)
    chk("أُضيفت 2" in pg6.locator(".toast").first.inner_text(), "الرفع أضاف مؤسستين")
    pg6.wait_for_timeout(1800)
    pg6.locator('#nav a[data-s="mine"]').click()
    pg6.wait_for_selector("#content tbody tr", timeout=15000)
    row2 = pg6.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')]"
        ".find(r=>r.innerText.includes('مدرسة الرفع الثانية')).innerText"
    )
    chk("غير مسجَّل" in row2, "المرفوعة بخانات فارغة تظهر «غير مسجَّل» لا قيماً مخترعة")
    row1 = pg6.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')]"
        ".find(r=>r.innerText.includes('مدرسة الرفع الأولى')).innerText"
    )
    chk("إعدادي" in row1 and "المدرسة الكبيرة" in row1, "المرفوعة المكتملة بمرحلتها وتصنيفها المشتق")
    pg6.locator('#nav a[data-s="assign"]').click()
    pg6.wait_for_selector(".asgcard", timeout=20000)
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

    # ── التقييم المتزامن: تنبيه الحضور ورفض الكتابة فوق عمل الغير ──
    cf = br.new_page(viewport={"width": 1440, "height": 950})
    cf.on("pageerror", lambda e: errs.append(str(e)))
    login(cf, "Z1-1")
    cf.locator('[data-open="Z1-001"]').click()
    cf.wait_for_selector("#evBar", timeout=20000)
    pg6.locator('#nav a[data-s="mine"]').click()
    pg6.wait_for_selector("#content tbody tr", timeout=20000)
    pg6.locator('[data-open="Z1-001"]').click()
    pg6.wait_for_selector("#evBar", timeout=20000)
    chk("فتح تقييم هذه المؤسسة" in pg6.locator("#content").inner_text(), "تنبيه وجود محرّر آخر")
    pg6.evaluate(
        """()=>{for(const f of ['i','j']){const el=document.querySelector(`#content [data-k="2"][data-f="${f}"]`);
        if(el){el.value=(f==='i'?10:9);el.dispatchEvent(new Event('input'))}}}"""
    )
    pg6.wait_for_timeout(2700)
    chk("محفوظ" in pg6.locator("#ebSave").inner_text(), "الطرف الثاني حفظ أولاً")
    cf.evaluate(
        """()=>{for(const f of ['i','j']){const el=document.querySelector(`#content [data-k="1"][data-f="${f}"]`);
        if(el){el.value=(f==='i'?10:5);el.dispatchEvent(new Event('input'))}}}"""
    )
    cf.wait_for_timeout(2900)
    chk("تعارض" in cf.locator("#ebSave").inner_text(), "الحفظ رُفض بتعارض")
    chk(cf.locator("#evConf").count() == 1, "لافتة التعارض ظاهرة بخيار التحديث")
    cf.wait_for_timeout(2200)
    chk("تعارض" in cf.locator("#ebSave").inner_text(), "لا إعادة محاولة تلقائية بعد التعارض")
    cf.click("#evReload")
    cf.wait_for_selector("#evBar", timeout=20000)
    got = cf.evaluate("""()=>document.querySelector('#content [data-k="2"][data-f="j"]').value""")
    chk(got == "9", f"التحديث يجلب عمل الطرف الآخر سليماً ({got})")
    chk(cf.locator("#evConf").count() == 0, "اللافتة تختفي بعد التحديث")
    cf.evaluate(
        """()=>{const el=document.querySelector('#content [data-k="12"][data-f="j"]');
        if(el){el.value='100';el.dispatchEvent(new Event('change'))}}"""
    )
    cf.wait_for_timeout(2700)
    chk("محفوظ" in cf.locator("#ebSave").inner_text(), "الحفظ يعمل بعد التحديث")
    cf.close()
    pg6.click("#evBack")
    pg6.wait_for_selector("#content tbody tr", timeout=20000)

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

    # ── لوحة التوزيع للحساب الفني بتبويبات الفرق ──
    pg2.locator('#nav a[data-s="assign"]').click()
    pg2.wait_for_selector(".asgtabs .ytab", timeout=20000)
    tabs2 = pg2.locator(".asgtabs .ytab").all_inner_texts()
    chk(len(tabs2) == 6, f"ستة تبويبات للحساب الفني ({len(tabs2)})")
    joined = " | ".join(t.replace("\n", " ") for t in tabs2)
    chk(
        "مؤسسات تعليمية حكومية — المنطقة التعليمية 1" in joined
        and "مؤسسات تعليمية خاصة" in joined
        and "رياض الأطفال" in joined,
        f"مسميات التبويبات كما اعتُمدت ({joined[:60]}…)",
    )
    chk(pg2.locator(".asgcol").count() == 5, "أعمدة مقيّمي المنطقة الأولى")
    chk(pg2.locator(".asgcard").count() >= 56, f"بطاقات المنطقة الأولى ({pg2.locator('.asgcard').count()})")
    pg2.locator('.asgtabs [data-asg="رياض الأطفال"]').click()
    pg2.wait_for_timeout(2500)
    chk(
        pg2.locator(".asgcard").count() == 152,
        f"التبويب ينقل إلى مؤسسات رياض الأطفال ({pg2.locator('.asgcard').count()})",
    )
    chk(pg2.locator(".asgcol").count() == 5, "أعمدة مقيّمي رياض الأطفال")
    pg2.locator('.asgtabs [data-asg="التعليم الخاص"]').click()
    pg2.wait_for_timeout(2000)
    chk(pg2.locator(".asgcard").count() == 16, "تبويب التعليم الخاص 16 مؤسسة")
    pg2.locator('#nav a[data-s="tech"]').click()
    pg2.wait_for_selector("#asBox table", timeout=25000)

    # ── إدارة الحسابات والإسناد ──
    chk(pg2.locator("[data-acsave]").count() == 37, f"زر حفظ لكل حساب ({pg2.locator('[data-acsave]').count()})")
    chk(pg2.locator("[data-rn]").count() == 37, "خانة اسم المستخدم قابلة للتعديل لكل حساب")
    chk(pg2.locator("[data-rnsave]").count() == 37, "زر تغيير اسم المستخدم لكل حساب")
    chk(pg2.locator("#acSaveAll").count() == 1, "زر حفظ كل التعديلات موجود")
    chk(pg2.locator("#acNew").count() == 1, "زر الحساب الجديد موجود")
    chk(pg2.locator("[data-acdel]").count() == 37, "زر حذف لكل حساب")
    roles = pg2.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')].map(r=>r.children[3].innerText.trim())"
    )
    chk("مقيّم" in roles and "الحساب الفني" in roles, f"عمود الدور معروض ({roles[0]})")
    pg2.click("#acNew")
    pg2.wait_for_selector("#naSave", timeout=15000)
    rlabels = pg2.evaluate(
        "()=>[...document.querySelectorAll('#naRoles input')].map(i=>i.value)"
    )
    chk(
        rlabels == ["eval", "lead", "super", "director"],
        f"الأدوار الأربعة معروضة ({' · '.join(rlabels)})",
    )
    chk(not pg2.locator("#naTeamBox").is_hidden(), "قائمة الفريق ظاهرة للمقيّم")
    chk(pg2.locator("#naTeamsBox").is_hidden(), "قائمة الفرق المتعددة مخفية")
    pg2.check('input[name="narole"][value="super"]')
    pg2.wait_for_timeout(250)
    chk(pg2.locator("#naTeamBox").is_hidden(), "الفريق المفرد يختفي لرئيس الفرق")
    chk(not pg2.locator("#naTeamsBox").is_hidden(), "الفرق المتعددة تظهر لرئيس الفرق")
    chk(pg2.locator(".nateam").count() == 6, "ست خانات اختيار للفرق")
    pg2.check('input[name="narole"][value="director"]')
    pg2.wait_for_timeout(250)
    chk(
        pg2.locator("#naTeamBox").is_hidden() and pg2.locator("#naTeamsBox").is_hidden(),
        "رئيس التعليم الأخضر بلا اختيار فرق — نطاقه الجميع",
    )
    # إنشاء رئيس فرق فعلياً ثم الدخول به
    pg2.check('input[name="narole"][value="super"]')
    pg2.wait_for_timeout(200)
    pg2.fill("#naId", "SUPUI")
    pg2.fill("#naName", "رئيس فرق للاختبار")
    pg2.fill("#naPw", "UiSuper#2026")
    for t in ["منطقة 1", "منطقة 2"]:
        pg2.check(f'.nateam[value="{t}"]')
    pg2.click("#naSave")
    pg2.wait_for_selector(".toast", timeout=15000)
    chk("أُنشئ الحساب SUPUI" in pg2.locator(".toast").first.inner_text(), "الحساب أُنشئ")
    pg2.wait_for_timeout(1500)

    pg8 = br.new_page(viewport={"width": 1440, "height": 950})
    pg8.on("pageerror", lambda e: errs.append(str(e)))
    pg8.goto(BASE, wait_until="networkidle")
    pg8.fill("#uid", "SUPUI")
    pg8.fill("#pwd", "UiSuper#2026")
    pg8.click("#loginForm button[type=submit]")
    pg8.wait_for_selector("#app:not([hidden])", timeout=15000)
    pg8.wait_for_timeout(1200)
    pg8.evaluate("()=>document.getElementById('modal').classList.remove('on')")
    snav = pg8.evaluate("()=>[...document.querySelectorAll('#nav a')].map(a=>a.dataset.s)")
    chk("tech" not in snav and "assign" in snav, f"شاشات رئيس الفرق ({' · '.join(snav)})")
    pg8.locator('#nav a[data-s="assign"]').click()
    pg8.wait_for_selector(".asgtabs .ytab", timeout=20000)
    chk(
        pg8.locator(".asgtabs .ytab").count() == 2,
        f"تبويبا فريقيه فقط في شاشة التوزيع ({pg8.locator('.asgtabs .ytab').count()})",
    )
    # شاشة المؤسسات: تبويب لكل منطقة بدل عرض الكل دفعة واحدة
    pg8.locator('#nav a[data-s="mine"]').click()
    pg8.wait_for_selector("#content tbody tr", timeout=20000)
    mt = pg8.evaluate("()=>[...document.querySelectorAll('[data-mteam]')].map(b=>b.dataset.mteam)")
    chk(mt == ["منطقة 1", "منطقة 2"], f"تبويبا المنطقتين في شاشة التقييم ({' · '.join(mt)})")
    n1 = pg8.locator("#content tbody tr").count()
    chk(n1 < 120, f"المعروض منطقة واحدة لا الكل ({n1} صفاً)")
    hdr8 = pg8.locator("#content thead th").all_inner_texts()
    chk("المقيّم" in hdr8, "عمود المقيّم ظاهر لرئيس الفرق")
    pg8.locator('[data-mteam="منطقة 2"]').click()
    pg8.wait_for_timeout(1500)
    n2 = pg8.locator("#content tbody tr").count()
    chk(
        n2 != n1 and pg8.locator('[data-mteam="منطقة 2"].on').count() == 1,
        f"التبويب ينقل إلى المنطقة الثانية ({n1} ← {n2})",
    )
    ids = pg8.evaluate(
        "()=>[...document.querySelectorAll('#content tbody tr')].map(r=>r.children[0].innerText.trim())"
    )
    chk(all(i.startswith("Z2-") for i in ids), "كل الصفوف من المنطقة المختارة")
    # لوحة الفرق: جدول لكل فريق
    pg8.locator('#nav a[data-s="team"]').click()
    pg8.wait_for_selector("#content table", timeout=20000)
    chk(
        pg8.locator("#content .card").count() == 2,
        f"لوحة الفرق تعرض فريقيه ({pg8.locator('#content .card').count()})",
    )
    chk("فرق ضمن نطاقك" in pg8.locator("#content").inner_text(), "العنوان يعبّر عن تعدد الفرق")
    # طلبات النقل: أزرار البتّ متاحة له
    pg8.locator('#nav a[data-s="transfers"]').click()
    pg8.wait_for_timeout(1500)
    chk(
        "البتّ فيها من رئيس الفريق" not in pg8.locator("#content").inner_text(),
        "رئيس الفرق يُعرض له نص صاحب القرار لا نص المقيّم",
    )
    # تعديل سطرين معاً ثم حفظ واحد
    pg2.fill('[data-ac="Z4-1"][data-af="name"]', "اسم مجمَّع أول")
    pg2.fill('[data-ac="Z4-2"][data-af="name"]', "اسم مجمَّع ثانٍ")
    pg2.click("#acSaveAll")
    pg2.wait_for_selector(".toast", timeout=15000)
    chk("حُفظ 2" in pg2.locator(".toast").first.inner_text(), "حفظ واحد لسطرين معاً")
    pg2.wait_for_timeout(2000)
    vals = pg2.evaluate(
        "()=>['Z4-1','Z4-2'].map(i=>document.querySelector(`[data-ac='${i}'][data-af='name']`).value)"
    )
    chk(vals == ["اسم مجمَّع أول", "اسم مجمَّع ثانٍ"], f"الاسمان محفوظان ({' · '.join(vals)})")
    chk(pg2.locator('[data-af="team"]').count() == 36, f"قائمة فريق لكل حساب عدا الفني ({pg2.locator('[data-af=team]').count()})")
    pg2.wait_for_selector("#asBox table", timeout=20000)
    nas = pg2.locator("#asBox tbody tr").count()
    chk(nas >= 56, f"إسناد منطقة 1: {nas} مؤسسة")
    chk(pg2.locator('#asBox [data-if="evaluator"]').count() == nas, "قائمة مقيّم لكل مؤسسة")
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
    chk(ncd >= 12, f"المقيّم يرى بيانات مؤسساته وحدها ({ncd})")
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
    dis = pg.evaluate("()=>[...document.querySelectorAll('#content [data-k]')].every(e=>e.disabled)")
    chk(dis, "خانات الإدخال معطَّلة في عام غير جارٍ")
    pg.click("#evBack")

    body = pg.locator("body").inner_text() + pg2.locator("body").inner_text() + pg3.locator("body").inner_text() + pg4.locator("body").inner_text() + pg5.locator("body").inner_text() + pg6.locator("body").inner_text() + pg7.locator("body").inner_text()
    chk("undefined" not in body and "NaN" not in body, "لا يوجد undefined/NaN في الصفحات")
    chk(len(errs) == 0, f"أخطاء الكونسول: {len(errs)} {errs[:3]}")
    br.close()

print("\nالنتيجة: " + ("كل الفحوص سليمة \u2713" if ok else "توجد أخطاء \u2717"))
sys.exit(0 if ok else 1)
