# خطة ألبومات الأعراس وستوريات التسويق — سجل التقدّم وحالة التسليم

**آخر تحديث:** 2026-10-22 (بعد النشر) · **الفرع:** `main`
**الحالة العامة:** نُشرت **v1.20.0+31** على الإنتاج (commit `accb236`). الخادم والويب
وAPK محدَّثون، والترحيل طُبِّق، و`/p` موصول في nginx. بقي اختبار يدوي حقيقي ببيانات عرس.

> اقرأ هذا الملف أولاً بعد أي ضغط سياق (compact)، ثم `CLAUDE.md`, `README.md`,
> `docs/adr/0009-event-albums-and-self-tagging.md`, `docs/adr/0010-marketing-stories.md`.

---

## 1) ابدأ من هنا بعد الكومباكت

**الاختبار الشامل الأخير نجح:** `full-test-final4.log`
- `web-dom`: **280 passed, 0 failed**
- `smoke`: **533 passed, 0 failed**
- `flutter analyze`: **No issues**
- `flutter test`: **173 passed**

الخطوات المتبقية:

1. راجع `git diff` كاملاً بعينك قبل أي commit — خصوصاً `web/app.js` و`web/admin.js`
   و`server/src/services/albums.service.js` (قاعدة المشروع: لا commit بلا قراءة).
2. إن أردت إعادة التحقق:
   ```bash
   cd server
   DB_HOST=127.0.0.1 DB_PORT=3309 DB_USER=negev_test DB_PASSWORD=testpass DB_NAME=negev_events_test npm test
   ```
   إن كانت MySQL المؤقتة متوقفة، راجع القسم ٥.
3. لا تنشر ولا ترحّل الإنتاج إلا بموافقة صريحة. راجع قسم ٤ (النشر) أولاً.
4. لا تعمل commit تلقائياً — التغييرات كلها غير مُودَعة، وبعض ملفات المستخدم
   (`AGENTS.md`, `plan26-9.md`, `ktra_marketing_kit/`, `web/terms.html`) ليست من هذا العمل.

---

## 2) ما أُنجز فعلاً

### الخادم

| البند | الحالة |
|---|---|
| `event_albums` + توسعة `event_photos` + `photo_tags` + `photo_reports` | ✅ schema + migration + backfill idempotent |
| **لا سقف لعدد صور الألبوم** | ✅ قرار المالك؛ الحماية فقط ٢٠ توقيعاً/طلب و١٥MB للصورة المستوردة |
| الظهور: معتمدة + منتهية + `archive_gallery` + `is_published` + `status='approved'` | ✅ في `albums.service.js` وحده |
| الرفع قبل انتهاء المناسبة | ✅ `assertEventAllowsGallery` لا يشترط الانتهاء |
| بحث موحّد: ألبومات/صور/أشخاص مع `nameKey` + `searchVariants` | ✅ `GET /api/search` و`?person=` |
| وسم ذاتي: الاسم من الحساب، `pending`، موافقة/رفض/سحب | ✅ `POST/DELETE /api/photos/:id/tags` |
| بلاغات: واحد لكل مستخدم، إخفاء عند ٣ بلاغات مفتوحة | ✅ `PHOTO_REPORT_HIDE_THRESHOLD` |
| استيراد فيسبوك: رفض رابط المنشور، رابط صورة مباشر بقائمة بيضاء، Page albums عبر Graph | ✅ `utils/remoteImage.js` + `facebook.service.js` |
| Cloudinary: `signBatch`, `uploadBuffer`, مجلد `albums/album-<id>` | ✅ بلا SDK |
| `GET /p/:id` صفحة صورة مستقلة | ✅ OG image + noindex + بلا `<script>` |
| `GET /api/events/:id` يحمل `albums` ملخّصاً | ✅ إضافة جديدة؛ اختبار smoke أُضيف ويحتاج تشغيل |
| توافق المسارات القديمة `/admin/events/:id/photos` | ✅ `archivePhotos.routes.js` وجه توافق؛ الخدمة القديمة حُذفت |
| ستوريو التسويق: تحليل رابط، oEmbed، بطاقة ١٠٨٠×١٩٢٠، رفع، ربط القصة | ✅ `storyStudio.service.js` + مسارات `/admin/stories/studio[/preview]` |
| حقول الستوري: `link_platform`, `cta_label`, `poster_public_id`, `poster_source`, `download_url` | ✅ |
| حذف صورة الستوري من Cloudinary مع القصة | ✅ |

### الويب العام

| البند | الحالة |
|---|---|
| رقاقة «ألبومات الأعراس» في الفلاتر والدرج | ✅ |
| صفحة `#albums` كاملة: بحث واحد + تبويبات ألبومات/صور/أشخاص | ✅ `web/app.js` |
| بطاقة ألبوم + صفحة ألبوم + تحميل المزيد | ✅ |
| عارض صورة: عنوان، وسوم، «أنا في الصورة»، سحب، إبلاغ، رابط `/p/:id` | ✅ |
| «صوري» من الهيدر ومن «حسابي» | ✅ |
| روابط عميقة `#albums` / `#album/:id` / `#photo/:id` | ✅ |
| شريط ألبومات في صفحة المناسبة | ✅ `renderEventAlbumsHtml` + CSS |
| CTA لأي ستوري له رابط، لا للإعلان وحده | ✅ |

### لوحة الإدارة

| البند | الحالة |
|---|---|
| تبويب «ألبومات الأعراس» لكل أدمن داخل بلداته | ✅ |
| اختيار مناسبة، فتح/إنشاء ألبوم، رفع متعدد بحالة لكل ملف | ✅ |
| عنوان صورة، غلاف، إخفاء/إظهار، حذف، نقل بين الألبومات | ✅ |
| استيراد رابط صورة (Facebook CDN) | ✅ |
| طابور الوسوم: اعتماد/رفض/حذف | ✅ |
| طابور البلاغات: حل/تجاهل/إخفاء الصورة | ✅ |
| تبويب «ستوريات التسويق» (سوبر أدمن): رابط، معاينة، نشر، قائمة، قياس، تنزيل، نسخ النص، حذف | ✅ |
| تبويب الستوريات مخفي عن أدمن البلدة | ✅ |

### الموبايل

| البند | الحالة |
|---|---|
| نماذج `EventAlbum` / `EventPhoto` / `PhotoTag` / نتائج البحث | ✅ `mobile/lib/models/album.dart` |
| نداءات API: ألبومات/تفاصيل/صور/بحث/صوري/وسم/سحب/إبلاغ | ✅ `negev_api.dart` |
| شاشة ألبومات كاملة + تفاصيل ألبوم + عارض + صوري + صور شخص | ✅ `mobile/lib/screens/albums_screen.dart` |
| زر «ألبومات الأعراس» في كروم شاشة المناسبات | ✅ |
| ستوري: `linkPlatform`/`ctaLabel`، CTA لأي قصة، رفض `javascript:` | ✅ |
| اختبارات: ١٧٣ اختبار Flutter + تحليل نظيف | ✅ |

### إصلاحات قديمة وجدت في الطريق

1. **تسريب خصوصية في `/e/:id`:** JSON-LD كان يحمل التاريخ والمكان؛ حُذف. صفحة المشاركة بلا `<script>`.
2. **حقول الفنان ظاهرة على عزا/نجاح/حج:** أُصلحت البذرة، وأُضيفت خطوة تصحيح لمرة واحدة بعلامة `fix_artist_field_visibility_2026_10`.
3. **`target_url` في الستوري:** كان يقبل أي مخطّط؛ صار `http(s)` فقط على الخادم + فحص في الموبايل.
4. **حدّ ٦٠ صورة:** أُزيل من الخدمة والواجهة والاختبارات؛ `max_photos: null`.

### التوثيق

- `docs/adr/0009-event-albums-and-self-tagging.md` (جديد)
- `docs/adr/0010-marketing-stories.md` (جديد)
- `docs/adr/0008...` معدَّل جزئياً بـ0009
- `README.md` (جدول API، `/p`، nginx، الستوريات)
- `CLAUDE.md` + `AGENTS.md` (سطر التوجيه، فقرة الدومين، الوسائط)
- `web/privacy.html` + `server/src/privacyNotice.js` (صور/وسوم/بلاغات + نفي البيومتريا)
- هذا الملف

---

## 3) التحقق الفعلي — ما الذي نجح وما الذي بقي

### نجح

| الأمر | النتيجة |
|---|---|
| `npm run db:migrate` (مرتين، قاعدة اختبار) | `EXIT=0` — idempotent |
| backfill يدوي لصفّ قديم `album_id NULL` | ألبوم أُنشئ، الصورة رُبطت، `position` ضُبط |
| `npm test` — آخر تشغيل كامل بعد كل التعديلات | **web-dom 280 + smoke 533 = 813 passed, 0 failed** |
| اختبار `albums` في تفاصيل المناسبة | ✅ ضمن smoke |
| `flutter analyze` | **No issues found** |
| `flutter test` | **173 passed** (يشمل نماذج/API الألبومات وCTA الستوري) |
| اختبارات `/p/:id` وستوريو التسويق | ✅ ضمن smoke |

سجلات:
- `C:\Users\asus\AppData\Local\Temp\opencode\full-test-final4.log` (آخر تشغيل ناجح)
- `C:\Users\asus\AppData\Local\Temp\opencode\full-test-final1.log` (تشغيل كامل سابق)

### لا يوجد عمل كود إلزامي متبقٍ

- [x] الاختبار الشامل بعد آخر تعديل — **نجح**.
- [ ] مراجعة `git diff` والـcommit — قرارك، لم يُعمل commit.
- [ ] النشر/الترحيل/المفاتيح — قسم ٤، بموافقتك.

### اختياري (ليس مانعاً)

- [ ] اختبار Widget مباشر لـ`AlbumsScreen` (اليوم: تحليل + اختبارات نماذج/API فقط).
- [ ] تجربة يدوية على جهاز أندرويد حقيقي (رفع، وسم، إبلاغ).
- [ ] تحقق Cloudinary/فيسبوك الحقيقي (لا مفاتيح على جهاز التسليم؛ المسارات «بلا مفاتيح» مُختبرة).

---

## 4) النشر — تم ✅

**الخادم:** `root@187.124.164.58` · **المسار:** `/root/munasbat/app` · **commit:** `accb236`
**الإصدار:** `1.20.0+31` (versionCode 31) · **APK:** 65,059,577 بايت
**الرابط العام:** https://munasbat.ktra-pro.tech

1. ✅ الترحيل طُبِّق تلقائياً عند إقلاع الحاوية: `event_albums`, `photo_tags`, `photo_reports`, `event_photos.album_id`, `stories.link_platform/cta_label`.
2. ✅ nginx: أُضيف `location = /p` و`^~ /p/` → `127.0.0.1:3100`. النسخة الاحتياطية: `/root/munasbat-nginx-backup-20261022-143624.conf`. `nginx -t` نجح.
3. ✅ Cloudinary: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` مضبوطة على الخادم.
4. ✅ فيسبوك: `FACEBOOK_PAGE_ID/ACCESS_TOKEN` مضبوطان (استيراد Page يحتاج تحقق Graph فعلي).
5. ✅ APK الجديد رُفع إلى `server/downloads/negev-events.apk`، و`APP_LATEST_VERSION=1.20.0` و`APP_RELEASE_NOTES` محدَّثان.
6. ✅ `docker compose build app && docker compose up -d app` — الحاوية صحّية.

**تحقق حي:**
- `GET /api/app/version` → `latest_version=1.20.0`, `apk_url=https://munasbat.ktra-pro.tech/downloads/negev-events.apk`, release notes عربية.
- `HEAD /downloads/negev-events.apk` → 200 و`Content-Length=65059577`؛ SHA-256 المحلي = البعيد `9d6399ce…b11a1`.
- `apksigner verify` → v2 true، DN `CN=thabet toma, …`.
- `/p/1` → 404 من **الخادم** (لا من nginx) لأن لا صور منشورة بعد؛ التوجيه يعمل.
- `/api/albums` و`/api/search` → 200.
- `/health` → `{"status":"ok","database":"up"}`.
- الجداول والأعمدة موجودة في قاعدة الإنتاج.

**باقٍ (اختبار يدوي فقط):** مناسبة منتهية، رفع صور من اللوحة، عنوان/غطاء، بحث باسم، وسم/موافقة/سحب، إبلاغ، `/p/:id`، وستوري CTA على جهاز حقيقي.

---

## 5) بيئة التحقق (كيف تعيد تشغيل MySQL المؤقتة)

- خدمة MySQL80 على الجهاز متوقفة ولا توجد صلاحية لتشغيلها.
- استُخدمت نسخة مؤقتة:
  ```bash
  "/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe" --no-defaults \
    --initialize-insecure --basedir="C:\Program Files\MySQL\MySQL Server 8.0" \
    --datadir="C:\Users\asus\AppData\Local\Temp\opencode\mysql-negev-test3"
  "/c/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe" --no-defaults \
    --basedir="C:\Program Files\MySQL\MySQL Server 8.0" \
    --datadir="C:\Users\asus\AppData\Local\Temp\opencode\mysql-negev-test3" \
    --port=3309 --bind-address=127.0.0.1 --mysqlx=0 --console
  ```
  ثم:
  ```bash
  mysql -h 127.0.0.1 -P 3309 -u root --skip-password -e \
    "CREATE DATABASE IF NOT EXISTS negev_events_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'negev_test'@'%' IDENTIFIED BY 'testpass'; GRANT ALL PRIVILEGES ON negev_events_test.* TO 'negev_test'@'%'; FLUSH PRIVILEGES;"
  ```
  وبعد الاختبار: `mysqladmin ... shutdown` ثم حذف مجلد البيانات المؤقت.
- Flutter مثبّت في `C:\src\flutter` (ليس ضمن المشروع):
  ```bash
  /c/src/flutter/bin/flutter.bat analyze
  /c/src/flutter/bin/flutter.bat test
  ```
- `mobile/pubspec.yaml`: `intl` رُفع من `0.20.2` إلى `^0.20.3` لأن Flutter 3.47.7 يفرضه مع `flutter_localizations`. `pubspec.lock` تغيّر تبعاً. `analysis_options.yaml` أضاف استثناءات build/android/ios/web تلقائياً.
- لا مفاتيح Cloudinary/فيسبوك على الجهاز.

---

## 6) الملفات الرئيسية

**خادم**
- `server/src/services/albums.service.js` (كل استعلامات الألبوم/الصورة/الوسم/البلاغ/البحث)
- `server/src/routes/albums.routes.js`
- `server/src/utils/remoteImage.js`
- `server/src/services/storyStudio.service.js`
- `server/src/routes/share.routes.js` (`/p/:id`)
- `server/src/services/events.service.js` (`albums` + `archive_photos`)
- `server/src/db/schema.sql` + `dataMigrations.js`
- `server/src/routes/archivePhotos.routes.js` (توافق)
- `server/test/smoke.test.js` + `web-dom.test.js`

**ويب**
- `web/app.js` (صفحة الألبومات/العارض/CTA/روابط عميقة/شريط المناسبة)
- `web/index.html` + `web/styles.css`
- `web/admin.js` + `web/admin.html` + `web/admin.css` (ألبومات + ستوريو)
- `web/privacy.html`

**موبايل**
- `mobile/lib/models/album.dart`
- `mobile/lib/screens/albums_screen.dart`
- `mobile/lib/screens/story_viewer_screen.dart`
- `mobile/lib/api/negev_api.dart`
- `mobile/test/albums_test.dart` + `albums_api_test.dart`

**قرارات**
- `docs/adr/0009-event-albums-and-self-tagging.md`
- `docs/adr/0010-marketing-stories.md`

---

## 7) قواعد لا تُكسر

- كل SQL في `server/src/services/` فقط، عبر `db/pool.js`، وبـ`?`، والبحث عبر `escapeLike`.
- لا تعرّف وجوه/بيومتريا. الوسم بشري، الاسم من الحساب، والموافقة قابلة للسحب.
- لا سقف لصور الألبوم. لا تُعد `MAX_PHOTOS_PER_EVENT` أو `max_photos` كرقم.
- الظهور العام في `albums.service.js` وحده.
- `target_url` http(s) فقط، والتحقق على الخادم.
- استيراد فيسبوك: لا سحب لرابط منشور؛ القائمة البيضاء فقط.
- `/admin` خلف `requireAdmin`/`requireSuperAdmin`، والنطاق في `adminScope`.
- لا commit/نشر/ترحيل إنتاج بلا إذن صريح.
