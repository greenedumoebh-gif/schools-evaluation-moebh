# -*- coding: utf-8 -*-
"""فحص الشاشات في المتصفح — قياسات كمية لا حكم بصري."""
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
PW = os.environ.get("SEED_PASSWORD", "TestPass12345")
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
ok = True
errs = []


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


with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
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

    pg.locator("[data-open]").first.click()
    pg.wait_for_selector(".axbox", timeout=15000)
    chk(pg.locator(".axbox").count() == 4, f"أربعة صناديق محاور ({pg.locator('.axbox').count()})")
    chk(pg.locator(".frow").count() == 31, f"31 صف مؤشر ({pg.locator('.frow').count()})")
    chk(pg.locator(".fld .tgt").count() == 31, f"خانة مستهدف لكل مؤشر ({pg.locator('.fld .tgt').count()})")
    chk(pg.locator("select[data-f=j]").count() == 6, f"6 قوائم حالة تنفيذ للمؤشرات الوصفية ({pg.locator('select[data-f=j]').count()})")
    chk(pg.locator("input[data-f=m]").count() == 2, f"خانتان ثانويتان ({pg.locator('input[data-f=m]').count()})")
    chk(
        pg.locator(".tip.red").count() == 0,
        "مؤسسة ابتدائية: لا تنبيه مستهدف مُفترض (المؤشر 20 = 4)",
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
    chk(pg.locator("#evHist .kpi").count() == 4, f"بطاقات الأداء التراكمي ({pg.locator('#evHist .kpi').count()})")
    chk("الدورة المرجعية" in pg.locator("#evHist").inner_text(), "النتيجة المرجعية السابقة معروضة")
    chk("لا تُقارَن" in pg.locator("#evHist").inner_text(), "تنبيه اختلاف المنهجية ظاهر")
    chk(pg.locator("#evHist .tip.amber").count() == 1, "تنبيه نقص الدورات الثلاث ظاهر")

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
    chk(pg3.locator(".tip.red").count() == 0, "مدرسة ابتدائي - إعدادي: لا تنبيه بعد قاعدة المرحلة العليا")
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
    chk(pg4.locator(".tip.red").count() == 0, "روضة: لا تنبيه مستهدف مُفترض")

    # ── المعهد الديني الجعفري: قرار الفريق ثانوي ──
    pg5 = br.new_page(viewport={"width": 1440, "height": 950})
    pg5.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg5.on("pageerror", lambda e: errs.append(str(e)))
    login(pg5, "Z4-5")
    pg5.locator('[data-open="Z4-024"]').click()
    pg5.wait_for_selector(".axbox", timeout=15000)
    chk(pg5.locator(".tip.red").count() == 0, "الجعفري: لا تنبيه مستهدف مُفترض بعد قرار الفريق")
    t20c = pg5.locator(".frow").nth(19).locator(".tgt").inner_text()
    chk(t20c == "8", f"المؤشر 20 للجعفري = 8 ({t20c})")
    head = pg5.locator(".mhead").inner_text()
    chk("معهد ديني ← ثانوي" in head, f"الترويسة تعرض النص الأصلي وقرار الفريق")
    kgrow = pg4.locator("#content tbody tr").first.inner_text()
    chk("رياض أطفال" in kgrow, "روضة: المرحلة «رياض أطفال» لا «غير مسجَّل»")
    chk("4,500" in pg4.locator("#evSum").inner_text(), "روضة: السقف 4,500 في جدول النتيجة")

    # ── الحساب الفني: ضبط المستهدفات ──
    pg2 = br.new_page(viewport={"width": 1440, "height": 950})
    pg2.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg2.on("pageerror", lambda e: errs.append(str(e)))
    login(pg2, "TECH")
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

    body = pg.locator("body").inner_text() + pg2.locator("body").inner_text() + pg3.locator("body").inner_text() + pg4.locator("body").inner_text() + pg5.locator("body").inner_text()
    chk("undefined" not in body and "NaN" not in body, "لا يوجد undefined/NaN في الصفحات")
    chk(len(errs) == 0, f"أخطاء الكونسول: {len(errs)} {errs[:3]}")
    br.close()

print("\nالنتيجة: " + ("كل الفحوص سليمة \u2713" if ok else "توجد أخطاء \u2717"))
sys.exit(0 if ok else 1)
