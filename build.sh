#!/usr/bin/env bash
# حزم المنصة للنشر باسم يحمل رقم الإصدار المقروء من data/seed.json
set -e
cd "$(dirname "$0")"
V=$(python3 -c "import json;print(json.load(open('data/seed.json'))['version'])")
OUT="${1:-/mnt/user-data/outputs}"
NAME="منصة_تقييم_المؤسسات_التعليمية_v${V}.zip"
rm -f "$OUT/$NAME"
rm -f ./*.db ./*.db-shm ./*.db-wal 2>/dev/null || true
zip -qr "$OUT/$NAME" . -x ".git/*"
echo "$OUT/$NAME"
unzip -l "$OUT/$NAME" | tail -2

# حزمة التسليم تُحدَّث مع كل إصدار آلياً فلا تتخلّف عن المنصة
if [ "${SKIP_HANDOFF:-0}" != "1" ]; then
  echo "· تحديث حزمة التسليم"
  ./handoff.sh "$OUT"
fi
