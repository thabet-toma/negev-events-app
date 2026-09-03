# برومت النشر والإصدار — الخادم `b95fea5` + التطبيق `1.3.0+5`

عمليةٌ واحدة بجلسة واحدة: تحديث الخادم من GitHub، **تعديل إعداد nginx على
المضيف**، ثم استبدال ملف التطبيق.

🔴 **هذا الإصدار وحده يختلف عن كل ما قبله: فيه خطوة nginx، وهي ليست تحسيناً.**
الخادم صار يولّد صفحة `GET /e/:id` (‏ADR-0006)، وnginx اليوم يوجّه كل ما ليس
`/api` أو `/uploads` أو `/downloads` أو `/socket.io` إلى حاوية الواجهة. فبلا هذه
الخطوة **يردّ nginx 404 من عنده ولا يصل الطلبُ الخادمَ أصلاً** — الميزة الأساسية
في هذا الإصدار تكون منشورة في الكود وغير موجودة للناس، بلا أي رسالة خطأ تدلّ.

الترتيب ليس اختيارياً: التطبيق `1.3.0` يفتح روابط `/e/` ويبثّ أحداث قياس إلى
`/api/analytics/events` — مسارٌ لا وجود له على الخادم القديم.

الملف قسمان: **(أ)** تنفّذه أنت على جهازك قبل أن تسلّم، **(ب)** تعطيه للوكيل على
السيرفر كما هو.

| | |
|---|---|
| السيرفر | `https://munasbat.ktra-pro.tech` · `root@munasbat.ktra-pro.tech` |
| مفتاح SSH | `~/.ssh/hostenger2/id_ed25519` — **المسار مجلد، والمفتاح داخله** |
| مسار التطبيق | `/root/munasbat/app` |
| إعداد nginx | `/etc/nginx/sites-enabled/munasbat.ktra-pro.tech` (على المضيف، لا في حاوية) |
| المستودع | `main` · `a27ca9d` ← **`b95fea5`** |
| نسخة التطبيق | `1.2.0+4` ← **`1.3.0+5`** |

---

# (أ) البناء والتوقيع والرفع — على جهازك

> ⚠️ **شغّل هذا القسم كلّه في Git Bash، لا في PowerShell.** `sign-release.sh`
> سكربت bash، و`sha256sum` و`strings` و`unzip` غير موجودة في PowerShell.

## ٠. ✅ هذا القسم نُفِّذ ووُثِّقت نتائجه

البناء والتوقيع والفحص تمّت فعلاً بتاريخ **2026-09-03**، وهذه نتائجها. لا تُعِدها
إلا إذا تغيّر الكود بعد `b95fea5`:

| | |
|---|---|
| الملف | `mobile/build/app/outputs/flutter-apk/app-release.apk` |
| `versionName` / `versionCode` | **`1.3.0`** / **`5`** (من `aapt2 dump badging`) |
| الحجم | **58,114,055** بايت |
| وقت البناء | **2026-09-03 17:52** |
| **SHA-256** | **`827fcbfa318657397a13a400a5bf1d631728b2de44f120070f9939c841e01446`** |
| العنوان المدمج | `https://munasbat.ktra-pro.tech` ✓ (قُرئ من `libapp.so` لا من المصدر) |
| بصمتا التوقيع | `0e2c7522…` (‏minSdk 33+) · `a4785e3d…` (‏minSdk 24–32) |
| مقابل `assetlinks.json` | **متطابقتان — الملف لا يحتاج تعديلاً في هذا الإصدار** |

🔑 **البصمتان تُطابقان `web/.well-known/assetlinks.json` حرفياً**، أي لا دوران
مفتاح في هذا الإصدار. لو كانتا اختلفتا لكان **واجباً** تحديث ذلك الملف ودفعه
**قبل** رفع الـAPK، وإلا فشل App Links بصمت على كل جهاز يتحقق بالبصمة القديمة.

**والبصمة المنشورة اليوم** (‏1.2.0+4) هي
`cbaaeb628f923c1e95c6040f5403cd579da34eddf4c733ecf5c2bca8f394f0ad` بحجم
`57,950,159` — الوكيل سيقارن بها ليثبت أن ما وصله جديد.

## ١. أعد البناء — فقط إن غيّرت الكود

```bash
cd "C:/Users/asus/Desktop/negev_events_app (1)/negev_events_app"
git checkout main && git pull --ff-only origin main
git log --oneline -1                 # b95fea5 أو أحدث
grep '^version' mobile/pubspec.yaml  # يجب أن يظهر 1.3.0+5

cd mobile
flutter clean && flutter pub get
flutter build apk --release --dart-define=API_BASE=https://munasbat.ktra-pro.tech
./scripts/sign-release.sh
```

`--dart-define` هو الفرق بين تطبيق يعمل وتطبيق يُثبَّت ولا يصل الخادم أبداً.
بدونه يقع البناء على `http://10.0.2.2:3000` — عنوان محاكي أندرويد، ولا شيء على
هاتف حقيقي. **هذا ما شُحن فعلاً في 1.1.0+2**، والسكربت يقرأ العنوان من الثنائي
المبنيّ ويرفض التوقيع بدونه. **المصدر ليس دليلاً هنا.**

وإن أعدت البناء **فالبصمة أعلاه تبطل** — استعمل ما يطبعه السكربت، وسلّمه للوكيل.

## ٢. 🛑 أثبت أن الناتج جديد — قبل أن تلمس `scp`

`flutter build` يكتب دائماً على المسار نفسه، فناتج إصدارٍ سابق يبقى هناك بالاسم
نفسه ويرفعه `scp` بلا أن يسأل. **حدث فعلاً في أول محاولة لـ1.2.0**: رُفع ناتج
1.1.0+3، سليماً وموقَّعاً وبالحجم المتوقَّع، وكان الملف الخطأ.

```bash
APK=build/app/outputs/flutter-apk/app-release.apk
"$LOCALAPPDATA/Android/Sdk/build-tools/36.1.0/aapt2.exe" dump badging "$APK" | grep -oE "versionName='[^']*'"
sha256sum "$APK"
ls -l --time-style=long-iso "$APK"
```

ثلاثة شروط **معاً**: النسخة `1.3.0` · البصمة **ليست** `cbaaeb62…` · والتاريخ اليوم.
`AndroidManifest.xml` داخل الـAPK بترميز UTF-16، فـ`strings` العادي يخرج فارغاً
هنا — **والفراغ ليس نجاحاً**؛ استعمل `aapt2` أو `strings -e l`.

⚠️ **الحجم لا يميّز بناءً من آخر** — في 1.2.0 خرج بناءان بالحجم نفسه بالضبط.
البصمة وحدها تفصل.

## ٣. ارفعه إلى `/tmp`

```bash
scp -i ~/.ssh/hostenger2/id_ed25519 "C:/Users/asus/Desktop/negev_events_app (1)/negev_events_app/mobile/build/app/outputs/flutter-apk/app-release.apk" root@munasbat.ktra-pro.tech:/tmp/negev-events-1.3.0.apk
```

الوجهة `/tmp` قصداً لا `server/downloads/`: الملف يبقى خاملاً حتى ينتهي الوكيل من
الخادم، ولأن نقل ٥٨ ميغابايت يستغرق دقيقة وخلالها كل من يضغط «تحميل» ينزّل ملفاً
نصف مرفوع فيفشل تثبيته بلا رسالة مفهومة.

## ٤. سلّم

أعطِ الوكيل كل ما تحت الخط، ومعه البصمة. **وجرّب الـAPK على هاتفك بعد أن ينتهي
الوكيل** (الخطوة ١٠ أدناه) — لا قبله، فالخادم لا يخدم `/e/` بعد.

---

# (ب) للوكيل على السيرفر

---

ثلاث عمليات متتالية على `https://munasbat.ktra-pro.tech`: **أولاً** تحديث الخادم
من GitHub مع ترحيل قاعدة بيانات، **ثانياً** تعديل إعداد nginx على المضيف، **ثم**
استبدال ملف تطبيق الموبايل.

نفّذها بهذا الترتيب ولا تعكسه. إن فشل أي جزء، **قف ولا تلمس ملف التطبيق إطلاقاً**
— الملف في `/tmp` خامل ولا يضرّ أحداً ما دام هناك.

## ما في التحديث

| | |
|---|---|
| **صفحة رابط لكل مناسبة** | `GET /e/:id` يولّد HTML حقيقياً لمعاينات واتساب وفيسبوك. تحتاج **خطوة nginx** أدناه |
| **قياس سلوكي** | جدولان جديدان عندنا، ونقطة `POST /api/analytics/events` |
| **خصوصية** | إشعار عربي عام · مفتاح رفض · محو ذاتي · طابور طلبات للسوبر أدمن |
| **سجل الوصول** | **صار بلا عنوان IP** — تغيّر في صيغة `morgan` |
| **لوحة الإدارة** | زرّ «تعديل مناسبة» · تاب طلبات الاطّلاع والمحو |

كلها **إضافة لا كسر**، عدا إسقاط IP من السجل — وهو مقصود.

---

## الجزء الأول — الخادم

### ⚠️ ١. النسخة الاحتياطية — قبل أي شيء آخر

الترحيلات تُطبَّق **تلقائياً عند إقلاع حاوية `app`** (‏`RUN_MIGRATIONS` مفعّل
افتراضياً). لا أمر منفصل تشغّله، ولا فرصة للتدخل بين الإقلاع والترحيل.

**⇒ خذ النسخة قبل إعادة التشغيل، لا بعدها.**

```bash
cd /root/munasbat/app
docker exec negev_events_mysql sh -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines negev_events' \
  > ~/negev-backup-before-b95fea5.sql
ls -lh ~/negev-backup-before-b95fea5.sql && tail -1 ~/negev-backup-before-b95fea5.sql
```

السطر الأخير يجب أن يكون `-- Dump completed`. إن لم يكن، **قف وأبلغ**.

### ٢. اسحب الكود

```bash
git status                 # يجب أن تكون الشجرة نظيفة
git pull origin main
git log --oneline -1       # يجب أن يظهر b95fea5 أو أحدث
```

قد ترى `docker-compose.override.yml` غير متتبَّع — هذا ملفك المحلي (‏`name` و
`ports: !override`)، **اتركه كما هو**. أي تعارض في ملف **متتبَّع** عدّلته يدوياً:
**قف وأبلغ** قبل حله، لا تحلّه باجتهادك.

### ٣. ما ستفعله الترحيلة

ثلاث خطوات جديدة، آمنة للتكرار، لا تحذف ولا تعدّل صفاً قائماً:

| الخطوة | الأثر |
|---|---|
| `create-analytics-events-2026-09` | جدولان فارغان: `analytics_events` و`analytics_daily_counters` |
| `add-users-analytics-opt-out-2026-09` | عمود بوليان على `users`، افتراضيه ‏0 (أي: لا أحد رافض) |
| `create-privacy-requests-2026-09` | جدول فارغ لطابور طلبات الاطّلاع والمحو |

والخطوات الخمس الأقدم ستُطبع ثانيةً بـ«already present» — هذا صحيح لا خطأ.

`analytics_events.user_id` يحمل مفتاحاً أجنبياً بـ`ON DELETE CASCADE`: حذف حساب
يمحو صفوفه معه، **بالقاعدة لا بالتذكّر**. وليس في الجدول عمود `event_id` ولا `ip`
ولا `user_agent` — غيابها هو ما يجعل قاعدة «نسجّل ما فعله لا ما قرأه» غير قابلة
للكسر أصلاً.

### ٤. ابنِ وأقلِع

```bash
docker compose build app
docker compose up -d app web
docker compose logs -f app | head -60
```

راقب السجل حتى ترى أسماء الخطوات الثلاث الجديدة. أي خطأ في الترحيل يوقف الإقلاع.

حاوية `web` تخدم ملفات `web/` الثابتة وقد تغيّرت — تأكّد أنها أُعيد تشغيلها.

---

## الجزء الثاني — 🔴 nginx على المضيف (جديد في هذا الإصدار)

بلا هذه الخطوة **الميزة الأساسية في الإصدار غير موجودة للناس**، والفشل صامت
تماماً: nginx يردّ 404 من عنده ولا يظهر شيء في سجل الخادم لأن الطلب لا يصله.

### ٥. أضِف موضع `/e/`

الملف `/etc/nginx/sites-enabled/munasbat.ktra-pro.tech`. خذ نسخة أولاً:

```bash
cp /etc/nginx/sites-enabled/munasbat.ktra-pro.tech ~/nginx-munasbat.conf.bak
```

ثم أضف هذا الموضع **بجانب مواضع `/api/` و`/uploads/` القائمة**، داخل بلوك
`server` الذي يستمع على 443:

```nginx
    # ---- صفحة رابط المناسبة (ADR-0006) ----
    # HTML يولّده الخادم لمعاينات واتساب وفيسبوك — العارضات لا تُشغّل
    # JavaScript فلا تلتقط شيئاً من واجهة الـSPA. الشرطة المائلة و`^~`
    # مقصودتان، على نمط /api/ أعلاه بالضبط.
    location ^~ /e/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

**العنوان `127.0.0.1:3100` لا `3000`** — المنفذ 3000 محجوز لمشروع آخر على هذا
الصندوق، والحاوية منشورة على 3100. انسخه من موضع `/api/` المجاور ولا تكتبه من
ذاكرتك.

ثم:

```bash
nginx -t && systemctl reload nginx
```

🛑 **إن قال `nginx -t` أي شيء غير `syntax is ok` + `test is successful` — أرجِع
النسخة (`cp ~/nginx-munasbat.conf.bak /etc/nginx/sites-enabled/munasbat.ktra-pro.tech`)
ولا تُعِد التحميل.** إعادة تحميل إعداد مكسور تُسقط الموقع كله، لا صفحة الرابط
وحدها.

### ٦. تحقّق من nginx — الأربعة كلها

```bash
# 1. صفحة رابط لمناسبة معتمدة حقيقية — ضع رقماً حقيقياً
curl -s https://munasbat.ktra-pro.tech/e/1 | grep -oE 'property="og:(title|image|url)"' | sort -u

# 2. ترويسة CSP موجودة على هذا المسار
curl -sI https://munasbat.ktra-pro.tech/e/1 | grep -i content-security-policy

# 3. assetlinks.json — بلا تحويل، وبنوع JSON، وببصمتين
curl -sI https://munasbat.ktra-pro.tech/.well-known/assetlinks.json | grep -iE "HTTP/|content-type|location"
curl -s  https://munasbat.ktra-pro.tech/.well-known/assetlinks.json | grep -c '":' 

# 4. الواجهة ما زالت تُخدَم من حاوية web ولم يبتلعها الموضع الجديد
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/app.js
```

المتوقَّع: (1) الثلاثة `og:title` و`og:image` و`og:url` · (2) سطر
`content-security-policy: default-src 'none'; …` · (3) **`200`** بـ
`application/json` و**بلا سطر `Location`** ومصفوفة فيها **بصمتان** ·
(4) `200` و`200`.

🛑 **إن جاء (3) بتحويل (‏301/302) أو بنوع غير JSON، فApp Links سيفشل بصمت** —
أندرويد لا يتّبع تحويلاً أثناء التحقق ولا يُظهر خطأ. أبلغ ولا تكمل.

بشأن (1): إن جاء فارغاً فتأكّد أن رقم المناسبة **معتمد فعلاً** (`approved`) —
مناسبة معلَّقة أو غير موجودة تردّ **404 بجسم متطابق** بالتصميم، وهذا سلوك صحيح لا
عطل. جرّب رقماً آخر من `curl -s https://munasbat.ktra-pro.tech/api/events | head -c 300`.

### ٧. تحقّق من الخادم — الخمسة كلها

```bash
# 1. الأهم، ولم يتغيّر: لا رقم هاتف في استجابة القائمة العامة
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone

# 2. الإشعار العام يُخدَم ويذكر مدّة الاحتفاظ
curl -s https://munasbat.ktra-pro.tech/api/privacy/notice | grep -c "90"

# 3. نقطة القياس ترفض اسماً خارج القائمة المغلقة
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d '{"event_name":"whatever_i_want","platform":"web"}' \
  https://munasbat.ktra-pro.tech/api/analytics/events

# 4. طابور الطلبات وقراءة القياس للسوبر أدمن حصراً
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/api/admin/privacy-requests
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/api/admin/analytics/counts

# 5. سجل الوصول صار بلا IP — افحص سطراً حقيقياً بعد الطلبات أعلاه
docker compose logs --tail=5 app | tail -3
```

المتوقَّع: (1) **صفر** · (2) رقم موجب · (3) **`400`** · (4) **`401`** للاثنين ·
(5) أسطر فيها الطريقة والمسار والحالة والزمن، **وبلا عنوان IP في أولها**.

🛑 **إن جاء (1) بغير الصفر، أو (3) بـ`201`، أو (5) بعنوان IP — أوقف وأبلغ فوراً
ولا تكمل إلى الجزء الثالث.** الأولى تعني أرقام مزوّدين تُبَثّ في استجابة عامة،
والثانية تعني أن أي عميل يكتب في جدولنا ما يشاء، والثالثة تعني أنّ الصورة لم
تُبنَ فعلاً من الكود الجديد.

**لا تكمل قبل أن تعود التسعة كلها (٦ و٧) كما هو متوقَّع.**

---

## الجزء الثالث — تطبيق الموبايل

لا `git pull` هنا ولا ترحيل ولا إعادة بناء: ملف يُستبدَل ومتغيّران يُضبطان.
`docker-compose.yml` يربط المجلّد ربطاً حيّاً (`./server/downloads:/app/downloads`)
فما تكتبه على المضيف تخدمه الحاوية فوراً — إعادة التشغيل لأجل المتغيّرات وحدها.

### ٨. تحقّق من الملف الواصل

```bash
ls -lh /tmp/negev-events-1.3.0.apk
sha256sum /tmp/negev-events-1.3.0.apk
sha256sum server/downloads/negev-events.apk
unzip -p /tmp/negev-events-1.3.0.apk AndroidManifest.xml | strings -e l | grep -oE '^1\.[0-9]+\.[0-9]+$' | sort -u
```

🛑 **قبل مقارنة البصمة بالمالك، افحص أنّ الملف جديد أصلاً:**

- بصمة `/tmp` يجب أن تكون
  **`827fcbfa318657397a13a400a5bf1d631728b2de44f120070f9939c841e01446`**
- و**يجب ألّا تساوي** بصمة المنشور الحالي
  `cbaaeb628f923c1e95c6040f5403cd579da34eddf4c733ecf5c2bca8f394f0ad`.
  إن تساوتا فما وصل هو النسخة المنشورة نفسها — **قف، والمالك لم يُعِد البناء**.
- ورقم النسخة داخل `AndroidManifest.xml` يجب أن يكون **`1.3.0`**. (‏`strings`
  العادي يخرج فارغاً هنا لأن الملف بترميز UTF-16 — `strings -e l` هو الصحيح،
  **والفراغ ليس نجاحاً**.)

إن اختلفت البصمة عن المذكورة فالنقل ناقص أو تالف — **قف واطلب إعادة الرفع**. ملف
APK مقطوع ينزل عند المستخدم ويفشل تثبيته بلا رسالة مفهومة.

### ٩. احتفظ بالقديم ثم انقل الجديد

```bash
cp /root/munasbat/app/server/downloads/negev-events.apk ~/negev-events-1.2.0.apk.bak
ls -lh ~/negev-events-1.2.0.apk.bak

mv /tmp/negev-events-1.3.0.apk /root/munasbat/app/server/downloads/negev-events.apk
ls -lh /root/munasbat/app/server/downloads/negev-events.apk
sha256sum /root/munasbat/app/server/downloads/negev-events.apk
```

النسخة الاحتياطية نقطة تراجعك الوحيدة لملف التطبيق — لا تكمل إن فشلت.
**والاسم يجب أن يبقى `negev-events.apk` حرفياً**؛ هو ما يشير إليه `APP_APK_URL`.
البصمة بعد النقل يجب أن تطابق الخطوة ٨.

### ١٠. اضبط المتغيّرين

في `.env` بجانب `docker-compose.yml`:

```env
APP_LATEST_VERSION=1.3.0
APP_RELEASE_NOTES=شارك المناسبة على واتساب وفيسبوك برابط · الرابط يفتح التطبيق مباشرة · إعدادات خصوصية جديدة في حسابي
```

**`APP_APK_URL` موجود أصلاً ويعمل — لا تلمسه** (قيمته المطلقة
`https://munasbat.ktra-pro.tech/downloads/negev-events.apk`، وقد تحقّقنا منها حيّاً).

`RATE_LIMIT_ANALYTICS_MAX` متغيّر جديد في `.env.example` — **لا تضفه**؛ افتراضيه
في الكود ‏15 وهو المطلوب.

⚠️ **`APP_MIN_VERSION` يبقى فارغاً. لا تضبطه، ولا تنسخ إليه رقم النسخة.**
قرارٌ لا سهو (‏ADR-0004): كل ما في الخادم الجديد **إضافة**، فنسخة 1.2.0 تظل تعمل
كما هي. ضبطُه يحبس مستخدماً خارج تطبيق يعمل عنده، مقابل لا شيء.

ثم:

```bash
docker compose up -d app
docker compose logs --tail=30 app
```

**بلا `--build`** — لا كود تغيّر في هذا الجزء.

### ١١. تحقّق من التطبيق

```bash
curl -s https://munasbat.ktra-pro.tech/api/app/version
curl -sI https://munasbat.ktra-pro.tech/downloads/negev-events.apk | grep -iE "HTTP/|content-length|last-modified"
```

المتوقَّع: `1.3.0` في الأول · و`200` مع **`Last-Modified` بتاريخ اليوم** و
`content-length: 58114055` في الثاني · و**`min_version` فارغاً أو غائباً**. إن ظهر
بقيمة، **أزلها من `.env` وأعد التشغيل**.

⚠️ **لا تستعمل `Content-Length` وحده دليلاً على أن الملف تغيّر** — في 1.2.0 خرج
بناءان بالحجم نفسه بالضبط. `Last-Modified` والبصمة هما الدليل.

### ١٢. 🛑 App Links على جهاز حقيقي — لا بديل آلي عنه

**على هاتف حقيقي مثبَّت عليه `1.3.0`**: افتح رابط
`https://munasbat.ktra-pro.tech/e/<رقم مناسبة معتمدة>` **من رسالة واتساب أو
ملاحظة** — لا من شريط عنوان المتصفح، فبعض المتصفحات لا تُشغّل تحقق App Links من
هناك. تأكّد أنه **يفتح التطبيق مباشرة على شاشة تفاصيل تلك المناسبة، بلا مربّع
اختيار تطبيق**.

⚠️ **فشل هذا الفحص لا يُظهر أي رسالة ولا يكتب أي سجل.** إن كان التحقق الرقمي
(Digital Asset Links) لم يكتمل — بصمة ناقصة، أو الملف يُخدَم بتحويل، أو الواجهة لم
تُنشر بعد — أندرويد **يفتح المتصفح بصمت** وكأن لا تطبيق مثبَّتاً. لا طريقة
لاكتشاف هذا إلا التجربة الفعلية.

وجرّب معها **المعاينة في محادثة واتساب حقيقية ومنشور فيسبوك حقيقي**: أرسل الرابط
وتأكّد أن الصورة والاسم يظهران قبل الضغط. **هذا الفحص هو ما يحسم سؤالاً مفتوحاً
في المواصفة** — إن قصّت المعاينة أسماء ملصقٍ طولي، يُعاد فتح قرار توليد صورة
معاينة على الخادم.

---

## التراجع

**nginx وحده** (إن كسرت الموقع):

```bash
cp ~/nginx-munasbat.conf.bak /etc/nginx/sites-enabled/munasbat.ktra-pro.tech
nginx -t && systemctl reload nginx
```

**ملف التطبيق وحده** (الخادم يبقى على الجديد):

```bash
cp ~/negev-events-1.2.0.apk.bak /root/munasbat/app/server/downloads/negev-events.apk
# ثم أعد APP_LATEST_VERSION إلى 1.2.0 في .env
docker compose up -d app
```

**الخادم كله:** الترحيلة **إضافية بحتة** — لا عمود حُذف ولا صف عُدِّل. فالرجوع
إلى الالتزام السابق يعيد السلوك القديم فوراً، والجداول الجديدة تبقى بلا ضرر ولا
حاجة لاستعادة النسخة الاحتياطية:

```bash
git checkout a27ca9d && docker compose build app && docker compose up -d app web
```

النسخة الاحتياطية للحالة القصوى وحدها (تلف غير متوقَّع)، لا للتراجع العادي.

## ما لا تفعله

- **لا تشغّل `npm test` على الإنتاج** — الملف نفسه يرفض العمل عند
  `NODE_ENV=production` (‏ADR-0005)، وهو يكتب بيانات تجريبية.
- **لا تشغّل `npm run db:seed` يدوياً** — يعمل تلقائياً ولا يستبدل صفاً قائماً.
- **لا تضبط `errorDsn` في `web/config.js`.** تتبّع الأخطاء موصول ونائم عمداً: لا
  مستقبِل منشوراً، وهذا الصندوق (نواة واحدة، ‏swap ممتلئة) لا يحتمل استضافة واحد.
  القرار لصاحب المنتج.
- **لا تضف أي مزوّد خدمات، ولا أي قرية أو فئة.** بيانات يدخلها صاحب المنتج من
  اللوحة، وإدخال مزوّد يعني تخزين رقم هاتف شخص — محكوم بمراجعة قانونية لم تكتمل.

## أبلغ في النهاية

الالتزام المنشور · **نصّ موضع `/e/` كما أضفته فعلاً ونتيجة `nginx -t`** · نتائج
التحقّقات التسعة (٦ و٧) بأرقامها · بصمة الـAPK قبل النقل وبعده · ما كان يعيده
`/api/app/version` وما صار يعيده · `Last-Modified` و`Content-Length` من ترويسة
التنزيل · تأكيداً صريحاً أن `APP_MIN_VERSION` بقي فارغاً · نتيجة فحص App Links على
جهاز حقيقي · وأي تعارض `git` صادفته وكيف حُسم.
