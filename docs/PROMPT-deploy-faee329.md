# برومت النشر — تحديث faee329 (منصة مناسبات متعددة الأنواع)

انسخ كل ما تحت الخط وأعطه للوكيل.

---

تحديث على `https://munasbat.ktra-pro.tech`.

المستودع: `https://github.com/thabet-toma/negev-events-app` · الفرع `main` ·
الالتزام `faee329`.

**هذا ليس تحديث واجهة.** ٢١ التزاماً، ٦٥ ملفاً، ويغيّر **مخطط قاعدة البيانات
وبيانات موجودة فيها**. اقرأ كل ما تحت قبل أن تكتب أول أمر.

## اقرأ هذا أولاً — الترحيل يعمل وحده

`server/server.js` يشغّل الترحيل والبذر عند كل إقلاع ما لم تُضبط
`RUN_MIGRATIONS=false`، وهي **غير مضبوطة** في `docker-compose.yml` ولا في
`.env`.

**النتيجة: مجرّد إعادة تشغيل الحاوية يطبّق ١٨ خطوة ترحيل على قاعدتك الحيّة،
بلا أن تطلب ذلك، وبلا نقطة تتوقّف عندها.** ولذلك النسخة الاحتياطية ليست
احتياطاً هنا — هي **الخطوة الأولى الإلزامية**، لأنها آخر لحظة يمكن أخذها فيها.

من هذه الخطوات ما يعدّل صفوفاً قائمة لا يضيف أعمدة فقط:

- `fix-town-coordinates-2026-08` — **يعيد كتابة إحداثيات بلدات على مناسبات
  منشورة**. الإحداثيات القديمة كانت مغلوطة حتى ٨ كم (issue #13).
- `backfill-events-occasion-type-2026-08` — يسند **كل** مناسبة قائمة إلى نوع
  «عرس».
- `backfill-event-honorees-2026-08` — يبني صفوف «أصحاب المناسبة» من
  `groom_name` الموجود.

## ثلاثة تغييرات سلوكية تكسر أي APK منصَّب — اقرأها قبل أن تقرّر التوقيت

**هذه ليست أعطالاً؛ هي تغييرات مقصودة. لكن ما تعرفه قبل النشر يختلف عمّا
تكتشفه بعده:**

1. **`POST /api/events` صار خلف تسجيل الدخول.** كان عاماً. أي نسخة تطبيق على
   هاتف اليوم تنشر بلا رمز — **ستتوقّف عن النشر وتتلقّى 401**.
2. **`POST /api/events/:id/congratulate` صار خلف تسجيل الدخول** أيضاً، ولنفس
   السبب.
3. **ترشيح حسب نسخة العميل**: الطلب الذي لا يحمل ترويسة `X-App-Version` — وكل
   APK منشور اليوم كذلك — **لا يرى إلا الأنواع الموسومة
   `legacy_client_supported`**. المزروع منها واحد فقط: **«عرس»**. أي أنّ
   مستخدمي النسخة القديمة يواصلون رؤية الأعراس (وكل مناسباتهم القديمة رُحِّلت
   إلى «عرس»)، **ولا يرون عزاءً ولا خطوبة ولا نجاحاً ولا حجاً**، و
   `GET /api/events/:id` لنوع آخر يعيد 404 برسالة «هذه المناسبة تحتاج نسخة
   أحدث من التطبيق».

**الخلاصة العملية: أصدِر APK جديداً وارفعه بأسرع ما يمكن بعد هذا النشر.** بناء
الـAPK ورفعه **ليسا جزءاً من هذا البرومت** — لكن حتى تفعلهما، النشر من الهاتف
معطَّل لكل مستخدم.

## ما لا يتغيّر

**لا جديد في:** `docker-compose.yml` · `Dockerfile` · nginx · `.env`
(**لا متغيّر بيئة جديد واحد**) · حزم npm (**لا اعتماد جديد**).

فلا تعديل يدوي على أيٍّ منها. إن وجدت نفسك تحرّر واحداً منها فقف وأبلغ.

## ١. النسخة الاحتياطية — قبل أي شيء آخر

```bash
cd <app-dir>
git log --oneline -1        # سجّل هذا الرقم، هو نقطة تراجعك

docker compose exec -T mysql mysqldump \
  -u root -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers \
  "${DB_NAME:-negev_events}" > ~/negev-backup-before-faee329.sql

ls -lh ~/negev-backup-before-faee329.sql
```

**لا تكمل إن كان الملف فارغاً أو أصغر من بضع عشرات الكيلوبايت.** تحقّق أنه
نسخة حقيقية:

```bash
tail -5 ~/negev-backup-before-faee329.sql   # يجب أن ينتهي بـ "Dump completed"
```

وسجّل ما ستقارنه لاحقاً:

```bash
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -D "${DB_NAME:-negev_events}" -e \
  "SELECT COUNT(*) AS events FROM events;
   SELECT COUNT(*) AS users FROM users;
   SELECT COUNT(*) AS congrats FROM congratulations;"
```

**اكتب هذه الأرقام.** ستؤكّد بها بعد الترحيل أنّ شيئاً لم يضِع.

## ٢. اسحب

```bash
git pull origin main
git log --oneline -1        # يجب أن يظهر faee329
```

إن ظهر تعارض في `web/config.js` (لأنك عدّلته يدوياً سابقاً): **تخلَّ عن
تعديلك المحلي واقبل نسخة المستودع**، كما في النشرات السابقة.

```bash
git checkout -- web/config.js && git pull origin main
grep apiBase web/config.js      # يجب أن يكون '' وليس أي عنوان مطلق
```

أي تعارض آخر: **قف وأبلغ** قبل حله.

## ٣. أعد البناء والتشغيل

كود الخادم تغيّر (٢١ ملفاً في `server/`)، فالحاوية تحتاج بناءً:

```bash
docker compose up -d --build
```

**الترحيل يجري الآن تلقائياً داخل هذا الأمر.** راقبه وهو يعمل:

```bash
docker compose logs -f app
```

توقّع أسطراً تبدأ بـ `[migrations]`، ثم بانر «خادم منصة مناسبات النقب — جاهز
للعمل». اتركه يعمل حتى ترى البانر.

**إن رأيت خطأ ترحيل، أوقف فوراً ولا تعِد المحاولة**: انسخ الخطأ كاملاً وأبلغ.
إعادة التشغيل بعد فشل جزئي قد تترك القاعدة بين حالتين.

## ٤. تحقّق

### الترحيل نفسه

```bash
docker compose logs app | grep "\[migrations\]" | tail -25
```

يجب أن ترى الخطوات الثماني عشرة. ثم:

```bash
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -D "${DB_NAME:-negev_events}" -e \
  "SELECT id, name, position, is_active, legacy_client_supported, tone
     FROM occasion_types ORDER BY position;"
```

**المتوقَّع: خمسة أنواع** — عرس (position 1، `legacy_client_supported=1`،
`tone=festive`) · عزا (`legacy=0`، `tone=solemn`) · خطوبة · نجاح · حج وعمرة.

**لا يوجد شيء ضائع:**

```bash
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  -D "${DB_NAME:-negev_events}" -e \
  "SELECT COUNT(*) AS events FROM events;
   SELECT COUNT(*) AS users FROM users;
   SELECT COUNT(*) AS congrats FROM congratulations;
   SELECT COUNT(*) AS without_type FROM events WHERE occasion_type_id IS NULL;
   SELECT COUNT(*) AS honorees FROM event_honorees;"
```

- `events` و `users` و `congrats` **تطابق أرقام الخطوة ١ تماماً**.
- `without_type` = **0** — كل مناسبة صار لها نوع.
- `honorees` **أكبر من صفر** إن كانت لديك مناسبات أصلاً.

### الخادم

```bash
curl -s https://munasbat.ktra-pro.tech/health
# الحالة سليمة

curl -s https://munasbat.ktra-pro.tech/api/occasion-types | head -c 400
# خمسة أنواع بحقولها وتفاعلاتها

# سلوك النسخة القديمة — بلا ترويسة
curl -s "https://munasbat.ktra-pro.tech/api/events?limit=5" | head -c 300

# سلوك النسخة الجديدة — بالترويسة
curl -s -H "X-App-Version: 1" "https://munasbat.ktra-pro.tech/api/events?limit=5" | head -c 300
```

الاستجابتان **يجب أن تختلفا** إن كان لديك أكثر من نوع مناسبة منشور. إن كانت
كل مناسباتك أعراساً فستتطابقان — وهذا صحيح أيضاً.

```bash
# النشر بلا رمز يجب أن يُرفض الآن
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://munasbat.ktra-pro.tech/api/events
# 401 — وهذا هو المتوقَّع، لا عطل
```

### الواجهة والوسائط

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://munasbat.ktra-pro.tech/app.js
# 200

curl -s https://munasbat.ktra-pro.tech/api/events | grep -o 'https://[^"]*uploads[^"]*' | head -2
# روابط مطلقة على النطاق الحقيقي — لا localhost.
# إن ظهرت localhost فـ PUBLIC_URL غير صحيحة، وكل صورة ستنكسر على كل عميل.
```

### في المتصفح

- الموقع بالهوية الجديدة — **فاتح** على أزرق سماوي، لا الأخضر الداكن القديم.
- شريط الستوريات: **النقر على حلقة يفتح عارضاً فعلياً** (كان يُظهر رسالة عابرة).
  زرّا التالي/السابق وزرّ الإغلاق ظاهرة، و**Escape يغلق**.
- لوحة التحكم `/admin.html`، **بحساب `super_admin` تحديداً**: تبويب سادس اسمه
  «أنواع المناسبات» يعرض الخمسة، وعمود «يظهر على النسخ المنشورة حالياً».
  بحساب أدمن عادي: **التبويب غير ظاهر**، وهذا صحيح.
- وحدة تحكم المتصفح: لا استثناءات.

## التراجع

```bash
git reset --hard 8edd1db
docker compose up -d --build
docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" \
  "${DB_NAME:-negev_events}" < ~/negev-backup-before-faee329.sql
```

**الترتيب مهم: الكود أولاً ثم القاعدة.** إن استعدت القاعدة أولاً وبقي الكود
الجديد يعمل، فسيعيد الترحيل تطبيق نفسه على القاعدة المستعادة فوراً عند أول
إقلاع، وتعود إلى حيث كنت.

الوسائط المرفوعة في `./server/uploads` لا يمسّها أي مما سبق.

## أبلغ عند الانتهاء

اذكر بالنصّ الحقيقي لا بالوصف:

1. أي التزام كنت عليه قبل السحب، وحجم ملف النسخة الاحتياطية.
2. أعداد `events`/`users`/`congrats` **قبل** الترحيل و**بعده**.
3. مخرجات `grep "\[migrations\]"` كاملة.
4. جدول `occasion_types` كما ظهر.
5. نتيجة كل أمر `curl` أعلاه.
6. هل انفتح عارض الستوري فعلاً في المتصفح، وهل ظهر تبويب «أنواع المناسبات».
7. **أي شيء توقّفت عنده وأبلغت بدل أن تحلّه.**
