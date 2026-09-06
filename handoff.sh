#!/usr/bin/env bash
# توليد حزمة التسليم آلياً: يشغّل الفحوص، يقيس نتائجها، ثم يبني المستند
# من شيفرة المستودع نفسها فلا يتأخر عن الإصدار أبداً.
#   ./handoff.sh [مجلد_المخرجات]
#   SKIP_TESTS=1 لتخطّي الفحوص · API_CHECKS و UI_CHECKS لتمرير عدديهما جاهزين
set -e
cd "$(dirname "$0")"
OUT="${1:-/mnt/user-data/outputs}"
V=$(python3 -c "import json;print(json.load(open('data/seed.json'))['version'])")
D=$(python3 -c "import json;print(json.load(open('data/seed.json'))['released'])")
PW="${SEED_PASSWORD:-HandoffCheck12345}"

# يمكن تمرير عددي الفحوص جاهزين إذا شُغّلت الفحوص خارج السكربت
API_N="${API_CHECKS:-غير مقيس}"
UI_N="${UI_CHECKS:-غير مقيس}"
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  echo "· الفحوص الساكنة"
  deno check main.ts >/dev/null
  deno lint >/dev/null
  deno fmt --check >/dev/null

  run_suite() {  # $1 = مسار قاعدة · $2 = الأمر
    pkill -f "deno run -A main.ts" 2>/dev/null || true
    sleep 1
    rm -rf "$1"*
    SEED_PASSWORD="$PW" KV_PATH="$1" deno run -A main.ts >/tmp/handoff_srv.log 2>&1 &
    for _ in $(seq 1 30); do
      sleep 1
      curl -s -o /dev/null http://127.0.0.1:8000/health && break
    done
    eval "$2" || true
    pkill -f "deno run -A main.ts" 2>/dev/null || true
    sleep 1
  }

  echo "· فحص الواجهات"
  run_suite /tmp/handoff_kv_api.db \
    "BASE=http://127.0.0.1:8000 deno run --allow-net --allow-env tests/api_test.ts >/tmp/handoff_api.log 2>&1"
  echo "· فحص المتصفح"
  run_suite /tmp/handoff_kv_ui.db \
    "BASE=http://127.0.0.1:8000 SEED_PASSWORD=$PW python3 tests/ui_check.py >/tmp/handoff_ui.log 2>&1"

  for f in /tmp/handoff_api.log /tmp/handoff_ui.log; do
    grep -q "كل الفحوص سليمة" "$f" || {
      echo "توقّف: فحص لم يمرّ — راجع $f"
      exit 1
    }
  done
  API_N=$(grep -c "✓" /tmp/handoff_api.log)
  UI_N=$(grep -c "✓" /tmp/handoff_ui.log)
  echo "· النتيجة: $API_N فحص واجهات · $UI_N فحص متصفح"
fi

API_N="$API_N" UI_N="$UI_N" V="$V" D="$D" OUT="$OUT" python3 - <<'PY'
import os, re, shutil, subprocess, json

V, D = os.environ["V"], os.environ["D"]
OUT = os.environ["OUT"]
PKG = "/tmp/handoff_pkg"
shutil.rmtree(PKG, ignore_errors=True)
os.makedirs(PKG + "/بيانات_المشروع")
os.makedirs(PKG + "/شعارات")

LANG = {".ts": "ts", ".js": "js", ".json": "json", ".html": "html", ".css": "css",
        ".py": "python", ".yml": "yaml", ".sh": "bash", ".md": "markdown"}


def lang_of(path):
    """لغة السياج؛ الملفات بلا امتداد معروف تُعرض كنص عادي."""
    return LANG.get(os.path.splitext(path)[1], "text")
# ترتيب التنفيذ: الإعداد ثم الخادم ثم الواجهة ثم الفحوص
ORDER = ["deno.json", "build.sh", "handoff.sh", "main.ts", "src/db.ts", "src/score.ts",
         "src/auth.ts", "src/api.ts", "static/index.html", "static/style.css",
         "static/app.js", "tests/api_test.ts", "tests/ui_check.py",
         ".github/workflows/ci.yml", ".gitignore", "README.md"]
# أي ملف نصي جديد يُلحق تلقائياً حتى لا تتخلّف الحزمة عن المستودع
# مكتبات الطرف الثالث لا تُدرج في الملحق؛ تعليمات جلبها في README الحزمة
SKIP_PREFIX = ("static/vendor/",)
SKIP = {"data/seed.json", "docs/handoff_body.md"}
found = []
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in {".git", "node_modules"}]
    for f in files:
        p = os.path.relpath(os.path.join(root, f), ".")
        if p in SKIP or p.startswith(SKIP_PREFIX) or os.path.splitext(p)[1] not in LANG:
            continue
        found.append(p)
extra = sorted(set(found) - set(ORDER))
files = [f for f in ORDER if os.path.exists(f)] + extra

body = open("docs/handoff_body.md", encoding="utf-8").read()
for k, v in [("VERSION", V), ("DATE", D), ("API", os.environ["API_N"]),
             ("UI", os.environ["UI_N"])]:
    body = body.replace("{{%s}}" % k, str(v))

out = [body]
for f in files:
    src = open(f, encoding="utf-8").read().rstrip("\n")
    # سياج أطول من أي سياج داخل الملف حتى لا تنكسر الكتلة
    longest = max([len(m) for m in re.findall(r"`+", src)] + [2])
    fence = "`" * max(3, longest + 1)
    out.append(f"### `{f}`\n\n{fence}{lang_of(f)}\n{src}\n{fence}\n")
md_name = f"حزمة_تسليم_المنصة_v{V}.md"
open(f"{PKG}/{md_name}", "w", encoding="utf-8").write("\n".join(out))

shutil.copy("data/seed.json", PKG + "/بيانات_المشروع/seed.json")
open(PKG + "/بيانات_المشروع/README.md", "w", encoding="utf-8").write(
    "# بيانات المشروع\n\n"
    "`seed.json` هو البيانات المرجعية كاملة: المؤسسات بنتائج الدورة المؤرشفة،\n"
    "والحسابات، والمؤشرات وأوزانها، والمسطرة، وحدود التصنيف، وربط المقام المركزي،\n"
    "وألوان الأعوام، ورقم الإصدار. ضعه في `data/seed.json` قبل التشغيل.\n\n"
    "الشعارات في `شعارات/` توضع في `static/img/` بالأسماء نفسها؛ غيابها يعني\n"
    "صوراً مكسورة في شاشة الدخول والشريط الجانبي.\n\n"
    "مكتبتا الطرف الثالث لم تُشحنا في الملحق؛ اجلبهما إلى `static/vendor/`:\n"
    "`npm i chart.js@4.4.7` ثم `dist/chart.umd.js`، و`npm i xlsx@0.18.5` ثم\n"
    "`dist/xlsx.full.min.js`.\n"
)
for g in os.listdir("static/img"):
    shutil.copy("static/img/" + g, PKG + "/شعارات/" + g)
zip_platform = f"{OUT}/منصة_تقييم_المؤسسات_التعليمية_v{V}.zip"
if os.path.exists(zip_platform):
    shutil.copy(zip_platform, PKG)

os.makedirs(OUT, exist_ok=True)
# إزالة حزم التسليم الأقدم حتى لا تلتبس بالحالية
for f in os.listdir(OUT):
    if f.startswith("حزمة_تسليم_المنصة_v") and f"_v{V}." not in f:
        os.remove(os.path.join(OUT, f))
zip_name = f"{OUT}/حزمة_تسليم_المنصة_v{V}.zip"
if os.path.exists(zip_name):
    os.remove(zip_name)
subprocess.run(["zip", "-qr", zip_name, "."], cwd=PKG, check=True)
shutil.copy(f"{PKG}/{md_name}", OUT)
print(f"{zip_name}\n{OUT}/{md_name}")
print(f"ملفات الشيفرة في الملحق: {len(files)}" + (f" · أُلحق تلقائياً: {extra}" if extra else ""))
PY
