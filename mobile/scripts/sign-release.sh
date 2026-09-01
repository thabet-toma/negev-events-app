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
