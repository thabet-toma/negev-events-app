---
name: release-and-deploy
description: Build, sign, push and deploy a release of منصة مناسبات النقب — release APK, GitHub push, production server update at munasbat.ktra-pro.tech (backup, pull, image rebuild, .env version bump), APK publish and live verification. Use whenever the owner asks to release, deploy, publish the APK, or "ارفع/انشر".
---

# الإصدار والنشر — منصة مناسبات النقب

مأخوذة من مهارة وكلاء Antigravity (`.agents/skills/release-and-deploy/`) مع ثلاث
خطوات كانت ناقصة هناك وتُسقط الإصدار بصمت — مُعلَّمة ⚠️ أدناه.

**كل خطوة هنا موجَّهة للخارج (GitHub، خادم الإنتاج، ملف يُنزّله الناس) — لا تُنفَّذ إلا
بموافقة صريحة من المالك لهذا الإصدار بعينه.**

## المراجع

| | |
|---|---|
| الخادم | `root@187.124.164.58` (نفسه `munasbat.ktra-pro.tech`) |
| مفتاح SSH | `C:\Users\asus\.ssh\hostenger2\id_ed25519` — عنوان لا سرّ؛ لا يُنسخ محتواه أبداً |
| مجلد التطبيق | `/root/munasbat/app` (مستودع git على `main`) |
| الحاويات | `negev_events_mysql` · `negev_events_app` · `negev_events_web` |
| APK العام | `/root/munasbat/app/server/downloads/negev-events.apk` (bind mount — لا يحتاج إعادة تشغيل) |
| فحص النسخة | `https://munasbat.ktra-pro.tech/api/app/version` |
| apksigner | `C:\Users\asus\AppData\Local\Android\Sdk\build-tools\35.0.0\apksigner.bat` |
| flutter | `C:/Users/asus/flutter/bin/flutter.bat` (ليس على PATH) |

**ثوابت:** لا تطبع ولا تنسخ ولا تحفظ `.env` أو كلمات سر · لا تلمس `APP_MIN_VERSION`
(قرار ADR-0004: يبقى فارغاً) · لا تلمس `APP_APK_URL`.

## الخطوات

### 1. النسخة والتحقق
- ارفع `version` في `mobile/pubspec.yaml` (`X.Y.Z+BUILD`، البناء +1 دائماً). المقارنة في
  `update_checker.dart` رقمية، فـ`1.10.0` أحدث من `1.9.3`.
- `npm test` داخل `server/` (web-dom ثم smoke، يحتاج MySQL) · `flutter analyze` نظيف ·
  `flutter test`.
- اقرأ `git diff` كاملاً قبل الـcommit (قاعدة CLAUDE.md).

### 2. بناء APK والتحقق من توقيعه
```
cd mobile && flutter build apk --release
```
العنوان الإنتاجي افتراضي في بناء الإصدار (`AppConfig.productionApiBase`) — لا حاجة
لـ`--dart-define`. التوقيع من `mobile/android/key.properties` (gradle).

```
apksigner.bat verify --verbose --print-certs mobile/build/app/outputs/flutter-apk/app-release.apk
```
يجب: `v2 … true` و`Signer #1 certificate DN: CN=thabet toma, …`. ⚠️ **وقارن بصمة
SHA-256 بالـAPK المنشور حالياً** (نزّله وافحصه بنفس الأمر) — يجب أن تتطابق وعدد
الموقّعين نفسه. المنشور منذ ١.٩.x موقَّع بمفتاح الإصدار وحده (موقّع واحد، v2، بلا
lineage، SHA-256 يبدأ `0e2c7522`). **لا تشغّل `mobile/scripts/sign-release.sh`** ما دام
الحال كذلك: يضع مفتاح الـdebug القديم في v2 فيرفض كل جهاز أقدم من أندرويد 13 التحديث.

### 3. GitHub
```
git commit … && git push origin main
```
لا `git commit -am` أعمى — راجع ما يُضاف.

### 4. ⚠️ نسخة احتياطية قبل أي إعادة تشغيل
الترحيلات تعمل تلقائياً عند إقلاع حاوية `app` — لا نافذة للتدخّل بعدها:
```
ssh -i <key> root@187.124.164.58 \
  "docker exec negev_events_mysql sh -c 'mysqldump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines negev_events' > /root/backup-before-<ver>.sql && ls -la /root/backup-before-<ver>.sql"
```
تأكّد أن الملف غير فارغ قبل المتابعة.

### 5. رفع APK إلى مسار مؤقت
```
scp -i <key> mobile/build/app/outputs/flutter-apk/app-release.apk root@187.124.164.58:/tmp/negev-events-<ver>.apk
```

### 6. ⚠️ النشر على الخادم — مع إعادة بناء الصورة
`/app/src` داخل حاوية `app` يأتي من **الصورة المبنية** لا من المجلد، فـ`git pull` ثم
`up -d` وحدهما لا ينشران أي تغيير في الخادم. `web/` بالعكس: bind mount حيّ فور السحب.
```
cd /root/munasbat/app && git pull origin main \
&& cp /tmp/negev-events-<ver>.apk server/downloads/negev-events.apk \
&& chmod 644 server/downloads/negev-events.apk && rm /tmp/negev-events-<ver>.apk \
&& sed -i 's/^APP_LATEST_VERSION=.*/APP_LATEST_VERSION=<ver>/' .env \
&& sed -i 's|^APP_RELEASE_NOTES=.*|APP_RELEASE_NOTES=<ملاحظات عربية>|' .env \
&& docker compose build app && docker compose up -d app web
```
ملاحظات الإصدار: بلا `&` ولا `|` ولا `/` (تكسر `sed`).

### 7. تحقّق حيّ — بوابة، لا تقرير ختامي
- `curl -s https://munasbat.ktra-pro.tech/api/app/version` ⇒ `latest_version` الجديدة.
- `curl -I https://munasbat.ktra-pro.tech/downloads/negev-events.apk` ⇒ 200 و`Content-Length`
  بحجم الملف المحلي و`Last-Modified` اليوم.
- ⚠️ أن الصورة أُعيد بناؤها فعلاً: `docker exec negev_events_app grep -c <نص جديد> /app/src/<ملف>`
  لنصّ دخل في هذا الإصدار — لا تدّعِ النشر من الذاكرة.
- `docker logs --tail 50 negev_events_app` بلا خطأ ترحيل.
