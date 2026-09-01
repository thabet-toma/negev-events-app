#!/usr/bin/env bash
#
# يوقّع APK الإصدار بمفتاحين مع "نسب" (lineage) يثبت أن مفتاح الإصدار وريث
# مفتاح الـdebug الذي وُقِّعت به النسخة المنشورة أول مرة (1.0.0).
#
#   أندرويد 13+   يتحقق من v3.1 → المفتاح الجديد + النسب → يحدّث بمكانه
#   أندرويد 7..12 يتحقق من v2   → المفتاح القديم         → يحدّث بمكانه
#
# فلا مستخدم يحتاج مسح التطبيق وإعادة تنزيله رغم تغيّر المفتاح.
#
# **شغّله بعد كل `flutter build apk --release`، بلا استثناء.** رفعُ APK موقّع
# بمفتاح الإصدار وحده (ما يخرج من gradle) يكسر التحديث على كل جهاز أقدم من
# أندرويد 13 — الجهاز يرى مفتاحاً لا يعرفه ويرفض التثبيت.
#
# كلمة السر تُقرأ من key.properties وتُمرَّر عبر متغيّر بيئة، فلا تظهر في سطر
# الأوامر ولا في قائمة العمليات.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$(dirname "$HERE")"

PROPS="$MOBILE/android/key.properties"
LINEAGE="$MOBILE/android/signing-lineage.bin"
APK="$MOBILE/build/app/outputs/flutter-apk/app-release.apk"
DEBUG_KS="$HOME/.android/debug.keystore"

APKSIGNER="${APKSIGNER:-$(ls "$LOCALAPPDATA/Android/Sdk/build-tools"/*/apksigner.bat 2>/dev/null | tail -1)}"
[ -n "$APKSIGNER" ] || { echo "!! لم يُعثر على apksigner — اضبط APKSIGNER يدوياً" >&2; exit 1; }
[ -f "$APK" ]   || { echo "!! لا يوجد APK — شغّل flutter build apk --release أولاً" >&2; exit 1; }
[ -f "$PROPS" ] || { echo "!! key.properties غير موجود — انظر التعليق أعلاه" >&2; exit 1; }

prop() { grep -E "^$1=" "$PROPS" | head -1 | cut -d= -f2- | tr -d '\r'; }

export RELEASE_PW="$(prop storePassword)"
export DEBUG_PW="android"        # كلمة سر مفتاح الـdebug ثابتة ومعروفة، ليست سراً
KS_FILE="$(prop storeFile)"
KS_ALIAS="$(prop keyAlias)"

[ -n "$RELEASE_PW" ] || { echo "!! storePassword فارغة في key.properties" >&2; exit 1; }

DEBUG_SIGNER=(--ks "$DEBUG_KS" --ks-key-alias androiddebugkey --ks-pass env:DEBUG_PW   --key-pass env:DEBUG_PW)
REL_SIGNER=(  --ks "$KS_FILE"  --ks-key-alias "$KS_ALIAS"      --ks-pass env:RELEASE_PW --key-pass env:RELEASE_PW)

# --- حارس عنوان الخادم ---------------------------------------------------
# 1.1.0+2 شُحنت مبنيّة بلا --dart-define=API_BASE، فوقعت على القيمة الاحتياطية
# في config.dart: http://10.0.2.2:3000 — عنوان المضيف كما يراه محاكي أندرويد،
# ولا شيء على هاتف حقيقي. التطبيق ثُبِّت ووُقِّع سليماً ثم لم يصل الخادمَ منه
# طلب واحد. لا اختبار يمسك هذا: الشيفرة صحيحة، والناقص وسيطُ بناء.
#
# لذلك يُقرأ العنوان من الثنائي المبنيّ نفسه قبل التوقيع. المصدر ليس دليلاً هنا.
API_BASE_EXPECTED="${API_BASE_EXPECTED:-https://munasbat.ktra-pro.tech}"

echo "== فحص العنوان المدمج =="
TMPDIR_CHK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_CHK"' EXIT
unzip -qo "$APK" "lib/arm64-v8a/libapp.so" -d "$TMPDIR_CHK"
EMBEDDED="$(strings -a "$TMPDIR_CHK/lib/arm64-v8a/libapp.so" | grep -oE 'https?://[a-zA-Z0-9._:-]+' | sort -u)"

if ! printf '%s
' "$EMBEDDED" | grep -qxF "$API_BASE_EXPECTED"; then
  echo "!! العنوان $API_BASE_EXPECTED غير مدمج في الـAPK." >&2
  echo "!! أعد البناء هكذا:" >&2
  echo "     flutter build apk --release --dart-define=API_BASE=$API_BASE_EXPECTED" >&2
  exit 1
fi
if printf '%s
' "$EMBEDDED" | grep -q '10\.0\.2\.2\|localhost'; then
  echo "!! الـAPK يحمل عنوان تطوير (10.0.2.2 أو localhost) — لا يُوقَّع." >&2
  exit 1
fi
echo "   $API_BASE_EXPECTED ✓"

# النسب يُنشأ مرة واحدة ويُلتزم في المستودع — إعادة توليده بمفتاح آخر تقطع
# السلسلة وتُبطل التحديث عند كل من ثبّت نسخة سابقة.
if [ ! -f "$LINEAGE" ]; then
  echo "== إنشاء ملف النسب =="
  "$APKSIGNER" rotate --out "$LINEAGE" \
    --old-signer "${DEBUG_SIGNER[@]}" \
    --new-signer "${REL_SIGNER[@]}"
fi

echo "== التوقيع بالمفتاحين =="
"$APKSIGNER" sign --lineage "$LINEAGE" \
  "${DEBUG_SIGNER[@]}" \
  --next-signer "${REL_SIGNER[@]}" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  "$APK"

echo "== التحقق =="
"$APKSIGNER" verify --print-certs "$APK" | grep -E "^Signer|Verified using v[23]"
echo
echo "البصمة (قارنها بعد الرفع):"
sha256sum "$APK"
