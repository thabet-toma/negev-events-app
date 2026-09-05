# برومت النشر — العلامة، التثبيت على الهاتف، وإصدار التطبيق ‎1.4.0

نشرٌ من **جزأين مستقلّين**. الأول واجهة بحتة ويسري فوراً؛ الثاني إصدار تطبيق
ويستلزم إعادة تشغيل ونسخة احتياطية.

**يمكن تنفيذ الجزء الأول وحده اليوم وتأجيل الثاني.** لا يعتمد أحدهما على الآخر.

| | |
|---|---|
| السيرفر | `root@munasbat.ktra-pro.tech` · مفتاح `~/.ssh/hostenger2/id_ed25519` (المسار مجلد، والمفتاح داخله) |
| مسار التطبيق | `/root/munasbat/app` |
| من | ‏`01e4ec7` |
| إلى | `main` بعد دمج `feat/brand-and-pwa` |
| التطبيق | ‏`1.3.0+5` ← **`1.4.0+6`** |

---

## ما الذي يتغيّر ولماذا

### ١. صار للمنصّة شعار — لأول مرة

لم يكن هناك شعار إطلاقاً. علامة الموقع كانت **إيموجي هلال** 🌙، وعلامة اللوحة
إيموجي تاج 👑، وأيقونات تطبيق فلاتر لم تُستبدَل يوماً (لا `flutter_launcher_icons`
في `pubspec.yaml`) فما كان على هواتف الناس أثرٌ افتراضي لا اختيار. **وعلى الآيفون
كانت أيقونة الشاشة الرئيسية لقطةً للصفحة** يشتقّها النظام، لأن لا شيء يعلن أيقونة.

العلامة الآن **بيت الشَّعَر** (‏#56) — مختارة من ثلاثة اتجاهات على خمسة معايير.
تنجو عند ١٦ بكسل، وتغطّي العزاء بلا تحفّظ (بيت العزاء خيمة، فالعلامة ترمز إلى
**المكان لا الحدث**)، ولا يملك أحد ظلّ خيمة فلا تحتاج إذناً.

الـ٢١ أيقونة **مولَّدة لا مرسومة**: `server/scripts/brand-icons.js` يعرّف العلامة
مرة واحدة ويشتقّ كل مقاس. لا تحرّر أي PNG بيدك.

### ٢. الموقع صار قابلاً للتثبيت فعلاً

كان `index.html` يحمل وسمَين تحت تعليق «Web App Manifest Meta» — **بلا مانيفست**.
وبحث #54 كشف أن هذا لم يكن ميزة نائمة بل **ميزة حيّة بوجه مشوّه**: على iOS 26 سقطت
كل شروط التثبيت، فأي موقع يُضاف للشاشة الرئيسية يُفتح مستقلاً — وموقعنا كان يُفتح
بأيقونة لقطة شاشة.

النطاق **الدرجة (أ) وحدها** (‏#55): مانيفست، أيقونات، وسوم، وشاشة إرشاد.
**لا عامل خدمة ولا إشعارات دفع** — ولماذا مذكورٌ في التذكرة لا هنا.

⚙️ **المانيفست اسمه `manifest.json` لا `.webmanifest` عن قصد**: `mime.types`
الافتراضي في nginx لا يحوي مدخلاً لـ`webmanifest`. **فهذا النشر لا يمسّ إعداد nginx
إطلاقاً.**

### ٣. إرشاد تثبيت لمستخدم الآيفون

زرّ «حمّل التطبيق» يختفي على الآيفون أصلاً (ملف APK لا يعمل هناك)، فكان مستخدم
الآيفون بلا أي مسار تطبيق. وiOS لا يعرض أي مُحفِّز تثبيت قابل للبرمجة، فالشرح
اليدوي خيارٌ وحيد. يُصرَف بضغطة ولا يعود.

### ٤. التطبيق ‎1.4.0+6

أيقونة جديدة + الملصق لم يعد يُقصّ عند الرأس. **رُفع الرقم لأن الحزمة اختلفت**:
شحن ثنائيّ مختلف تحت `1.3.0+5` نفسه هو كيف تفقد أثر ما على هواتف الناس.

**الخادم لم يتغيّر بحرف واحد في هذا النشر كلّه.**

---

# الجزء الأول — الواجهة (بلا بناء، بلا إعادة تشغيل)

## ١-أ. لا نسخة احتياطية لهذا الجزء

لا حاوية تُعاد تشغيلها هنا، فـ`RUN_MIGRATIONS` لا يعمل والقاعدة لا تُمَسّ. خدمة
`web` صورة nginx جاهزة مع ربط `./web` بالقرص، فالسحب وحده ينشر.

## ١-ب. اسحب

```bash
cd /root/munasbat/app
git status            # نظيفة (docker-compose.override.yml غير المتتبَّع طبيعي — اتركه)
git pull origin main
git log --oneline -1
```

**لا `docker compose build`. لا `docker compose up`.**

## ١-ج. تحقّق

```bash
# 1. المانيفست يُخدَم فعلاً وبنوع صحيح
curl -sI https://munasbat.ktra-pro.tech/manifest.json | grep -iE "^HTTP/|^content-type"

# 2. وأيقوناته الثلاث موجودة (لا 404 — أيقونة مفقودة أسوأ من غيابها)
for f in icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png favicon-32.png icon.svg; do
  printf "%-24s " "$f"
  curl -s -o /dev/null -w "%{http_code}\n" "https://munasbat.ktra-pro.tech/icons/$f"
done

# 3. الصفحة تشير إليها
curl -s https://munasbat.ktra-pro.tech/ | grep -oE 'rel="(manifest|apple-touch-icon|icon)"' | sort -u

# 4. الهلال اختفى من الترويسة
curl -s https://munasbat.ktra-pro.tech/ | grep -c "logo-moon"

# 5. لم ينكسر شيء قائم
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/
curl -sI "https://munasbat.ktra-pro.tech/e/13/card.jpg" | grep -iE "^HTTP/"
```

المتوقَّع: (1) `200` و`application/json` · (2) **`200` ست مرات** · (3) الثلاثة
`manifest` و`apple-touch-icon` و`icon` · (4) **صفر** · (5) **صفر** ثم `200` ثم `200`.

🛑 **إن جاء (5) الأول بغير الصفر — أوقف وأبلغ فوراً**؛ أرقام مزوّدين تُبَثّ في
استجابة عامة.

## ١-د. الفحص البصري

⚠️ **Ctrl + Shift + R أولاً.** الملفات ثابتة والمتصفّح يخزّنها.

1. **الموقع**: العلامة في الترويسة **خيمة** لا هلالاً، والتبويب يحمل أيقونة.
2. **`/admin.html`**: العلامة نفسها فوق نموذج الدخول، لا تاجاً.
3. **من آيفون حقيقي**: افتح الموقع — يجب أن تظهر **ورقة سفلية** تشرح
   «مشاركة ← إضافة إلى الشاشة الرئيسية». أغلقها وأعد التحميل: **لا تعود**.
4. **ثم ثبّتها فعلاً**: مشاركة ← إضافة إلى الشاشة الرئيسية. يجب أن تظهر
   **أيقونة الخيمة**، والاسم «مناسبات النقب»، وتُفتح **بلا شريط سفاري**.

النقطة ٤ هي الغاية من الجزء كله.

---

# الجزء الثاني — إصدار التطبيق ‎1.4.0 (يعيد تشغيل `app`)

## ٢-أ. النسخة الاحتياطية — إلزامية هنا

هذا الجزء يعيد تشغيل `app`، و`RUN_MIGRATIONS` يعمل عند كل إقلاع. **النسخة قبل
إعادة التشغيل لا بعدها.**

```bash
cd /root/munasbat/app
docker exec negev_events_mysql sh -c \
  'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines negev_events' \
  > ~/negev-backup-before-1.4.0.sql
tail -1 ~/negev-backup-before-1.4.0.sql
```

السطر الأخير يجب أن يكون `-- Dump completed`. إن لم يكن، **قف وأبلغ**.

## ٢-ب. ارفع ملف الـAPK

الملف مبنيّ على جهاز التطوير في:

```
mobile/build/app/outputs/flutter-apk/app-release.apk
```

**من جهازك أنت** (لا من السيرفر):

```bash
scp -i ~/.ssh/hostenger2/id_ed25519 \
  "mobile/build/app/outputs/flutter-apk/app-release.apk" \
  root@munasbat.ktra-pro.tech:/root/munasbat/app/server/downloads/negev-events.apk
```

`server/downloads` مربوط بالقرص في `docker-compose.yml` («تحديث APK لا يتطلب إعادة
بناء»)، فالملف يصير مخدوماً فور نسخه.

تحقّق من وصوله كاملاً:

```bash
ls -l /root/munasbat/app/server/downloads/negev-events.apk
curl -sI https://munasbat.ktra-pro.tech/downloads/negev-events.apk | grep -iE "^HTTP/|^content-length"
```

الحجم يجب أن يطابق ما على جهازك بالبايت.

## ٢-ج. أعلن الإصدار

```bash
cd /root/munasbat/app
grep -n "APP_LATEST_VERSION\|APP_MIN_VERSION\|APP_APK_URL" .env
```

اضبط **`APP_LATEST_VERSION=1.4.0`** فقط.

⚠️ **لا تلمس `APP_MIN_VERSION`.** رفعه يجبر كل مستخدم على التحديث قبل أن يستعمل
التطبيق — وهذا إصدار تجميلي لا يستحقّ ذلك.

> **لا تكتب ولا تنسخ أي قيمة أخرى من `.env` في أي مكان.**

```bash
docker compose up -d app
docker compose logs --tail=40 app
```

## ٢-د. تحقّق

```bash
curl -s https://munasbat.ktra-pro.tech/api/app/version
```

يجب أن يحمل `"latest_version":"1.4.0"` و`"apk_url"` مطلقاً (يبدأ بـ`https://`).

```bash
# الخادم لم ينكسر بإعادة التشغيل
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH https://munasbat.ktra-pro.tech/api/events/1   # 401
curl -s "https://munasbat.ktra-pro.tech/api/services/providers" | grep -c phone                  # 0
curl -sI "https://munasbat.ktra-pro.tech/e/13/card.jpg" | grep -iE "^HTTP/"                      # 200
```

## ٢-هـ. الفحص البصري

ثبّت الـAPK على هاتف أندرويد حقيقي:

1. **أيقونة الخيمة** على الشاشة الرئيسية بدل الأثر الافتراضي.
2. **قائمة المناسبات**: صورة عمودية لم يعد رأسها مقطوعاً — القصّ من الأسفل.
3. **افتح مناسبة**: الملصق يظهر **كاملاً** فوق خلفية مطموسة منه.

---

## التراجع

**الجزء الأول** — فوري، بلا بناء:

```bash
cd /root/munasbat/app && git checkout 01e4ec7
```

**الجزء الثاني** — أعد `APP_LATEST_VERSION` إلى `1.3.0` ثم `docker compose up -d app`.
الملف نفسه يمكن استرجاعه من نسخة الـAPK السابقة إن احتفظت بها؛ ملف واحد فقط
يُخدَم تحت `/downloads/negev-events.apk`.

## ما لا تفعله

- **لا تشغّل `npm test` على الإنتاج** — يرفض العمل عند `NODE_ENV=production`
  (‏ADR-0005) وهو يكتب بيانات تجريبية.
- **لا تعدّل `APP_MIN_VERSION`.**
- **لا تحذف من `/app/uploads`** — الملصقات القديمة لا تزال مشار إليها من صفوف قائمة.

## أبلغ في النهاية

أي الجزأين نفّذت · نتائج التحقّقات بأرقامها · وهل ظهرت أيقونة الخيمة فعلاً بعد
التثبيت على آيفون (الجزء ١) وعلى أندرويد (الجزء ٢).
