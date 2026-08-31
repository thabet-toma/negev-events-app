# منصة مناسبات النقب — Negev Events Platform

منصة ويب لأعراس ومناسبات النقب: عرض الأفراح على الخريطة، التفاعلات والتبريكات اللحظية،
دفتر النقوط الخاص لكل مستخدم، ولوحة تحكم للإدارة والمراجعة.

Node.js + Express + MySQL 8 + Socket.IO. الواجهة عربية بالكامل (RTL).

---

## المزايا

| المجال | التفاصيل |
|---|---|
| المناسبات | نشر، بحث، تصفية حسب البلدة والتاريخ، كشف تعارض المواعيد |
| الخريطة | إحداثيات لكل مناسبة + رابط ملاحة Waze مباشر |
| التفاعل اللحظي | تفاعلات وتبريكات تُبثّ عبر Socket.IO لحظياً |
| دفتر النقوط | سجل مالي خاص لكل مستخدم مع تحليلات حسب البلدة |
| الإدارة | مراجعة واعتماد المناسبات، إدارة التعليقات والمستخدمين، بث الإشعارات |

---

## البنية

المشروع ثلاث وحدات منفصلة: خادم JSON، وواجهة ويب، وتطبيق فلاتر. الخادم عديم
الحالة (JWT، بلا كوكيز) ويخدم العملاء الثلاثة وأي عميل جديد دون تعديل.

```
server/                    الخادم — JSON فقط، لا يخدم أي HTML
  server.js                نقطة التشغيل — انتظار MySQL ← الترحيل ← البذور ← تشغيل الخادم
  src/
    app.js                 تركيب Express والوسائط الأمنية
    config/                إعدادات موحّدة من متغيرات البيئة
    constants.js           البلدات، الإحداثيات، أنواع التفاعلات
    db/
      pool.js              مجمّع اتصالات MySQL (mysql2/promise)
      schema.sql           مخطط قاعدة البيانات
      migrate.js           تطبيق المخطط (آمن للتكرار)
      seed.js              بيانات أولية + حساب المدير (آمن للتكرار)
    middleware/            المصادقة، الأخطاء، رفع الملفات، التحقق من المدخلات
    routes/                مسارات HTTP رفيعة
    services/              منطق العمل والاستعلامات
    realtime/              مركز Socket.IO
    utils/                 السجلات، أخطاء API، مغلّف async، عنونة الوسائط المطلقة
  scripts/                 سكربتات تشغيلية (ترحيل، استيراد munasabatna)
  test/smoke.test.js       اختبارات شاملة من طرف إلى طرف
web/                       واجهة الويب — تُنشر على استضافة ثابتة مستقلة
  config.js                عنوان الخادم — الملف الوحيد الذي يتغيّر بين البيئات
  api.js                   عميل API موحّد (apiFetch / adminFetch)
  serve.js                 خادم ملفات ثابتة للتطوير المحلي (بلا اعتماديات)
mobile/                    تطبيق فلاتر — أندرويد و iOS، يستهلك نفس الخادم
  lib/api/                 عميل API وكل نقاط الخادم
  lib/screens/             المناسبات، الخريطة، إضافة، النقوط، الحساب
```

طبقات واضحة: المسار يتحقق من المدخلات، الخدمة تتعامل مع قاعدة البيانات، والوسائط تتولى
الأمن والأخطاء. لا استعلامات SQL داخل المسارات، ولا منطق عمل داخل الخدمات المساعدة.

---

## التشغيل السريع (Docker — الطريقة الموصى بها للسيرفر)

```bash
cp .env.example .env
```

عبّئ `.env` بالقيم الحقيقية — على الأقل:

```bash
openssl rand -hex 48    # ضع الناتج في JWT_SECRET
```

`JWT_SECRET` و `DB_PASSWORD` و `MYSQL_ROOT_PASSWORD` و `ADMIN_PIN` كلها إلزامية،
وسيرفض `docker compose` الإقلاع بدونها.

```bash
docker compose up -d --build
docker compose logs -f app
```

يقوم `docker compose` بتشغيل ثلاث خدمات: `mysql` (مع فحص صحة)، و `app` الذي لا يبدأ إلا
بعد جاهزية قاعدة البيانات، و `web` الذي يخدم الواجهة عبر nginx. المخطط والبذور تُطبَّق
تلقائياً عند أول إقلاع.

| العنوان | الوصف |
|---|---|
| `http://<server>:8080` | الواجهة الرئيسية |
| `http://<server>:8080/admin.html` | لوحة تحكم الإدارة |
| `http://<server>:3000/api` | الخادم — يستهلكه أي عميل |
| `http://<server>:3000/health` | فحص الصحة (يشمل حالة قاعدة البيانات) |

⚠️ اضبط `PUBLIC_URL` على العنوان العلني للخادم و `CORS_ORIGINS` على أصل الواجهة، وإلا
انكسرت الصور والصوت أو رفض المتصفح النداءات. وفي `web/config.js` اضبط `apiBase`.

منفذ MySQL **غير منشور** خارج شبكة Docker — التطبيق وحده يصل إليه.

---

## التشغيل محلياً (بدون Docker)

يتطلب Node.js 20+ و MySQL 8 يعمل محلياً.

الخادم:

```bash
cd server
npm install
cp .env.example .env        # واضبط DB_HOST=127.0.0.1 وبيانات الاتصال
npm run db:migrate
npm run db:seed
npm run dev
```

الواجهة، في طرفية أخرى:

```bash
node web/serve.js           # http://localhost:8080
```

الافتراضي في `web/config.js` هو `http://localhost:3000` — يطابق الخادم أعلاه.

---

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm start` | تشغيل الخادم (إنتاج) |
| `npm run dev` | تشغيل مع إعادة التحميل التلقائي |
| `npm run db:migrate` | إنشاء قاعدة البيانات وتطبيق المخطط |
| `npm run db:seed` | بيانات أولية + حساب المدير (لا يستبدل الموجود) |
| `npm run db:import-legacy` | ترحيل `database/negev_events_data.json` القديم إلى MySQL |
| `npm test` | اختبارات شاملة من طرف إلى طرف (تحتاج MySQL يعمل) |

`RUN_MIGRATIONS=false` و `RUN_SEED=false` يعطّلان الترحيل/البذور عند الإقلاع.

---

## الترحيل من النسخة القديمة

النسخة السابقة كانت تخزّن كل شيء في ملف JSON واحد. لنقل بياناتك:

```bash
npm run db:import-legacy
```

يقرأ السكربت `database/negev_events_data.json` (أو مساراً تمرّره كوسيط)، يعيد ربط
المعرّفات القديمة بالمعرّفات الجديدة، ويتخطى أي صف موجود مسبقاً — فتشغيله مرتين آمن.

---

## الأمان

- **JWT_SECRET إلزامي في الإنتاج** — الخادم يرفض الإقلاع بدونه.
- رموز PIN مخزّنة بـ bcrypt، ولا تُعاد أبداً في أي استجابة.
- لا توجد أي بيانات دخول ثابتة في الكود؛ حساب المدير يُنشأ من `ADMIN_PHONE` و `ADMIN_PIN`.
- النشر الفوري للمناسبات يتطلب رمز إدارة صالحاً (لا مفاتيح تجاوز).
- `helmet` للترويسات الأمنية، وتحديد معدل الطلبات (أشدّ على مسارات الدخول والتسجيل).
- كل الاستعلامات مُعامَلة (parameterized) — لا دمج نصوص SQL.
- رفع الملفات مقيّد بالنوع والحجم، وأسماء الملفات تُولَّد على الخادم.
- دفتر النقوط مقيّد بمالكه على مستوى الاستعلام نفسه.

### قبل النشر على سيرفر خارجي

1. ولّد `JWT_SECRET` عشوائياً وضعه في `.env`.
2. غيّر `ADMIN_PIN` عن القيمة الافتراضية `9999`، واستخدم رمزاً أطول.
3. اضبط `CORS_ORIGINS` على نطاقك الفعلي بدل `*`.
4. ضع التطبيق خلف Nginx مع شهادة TLS.
5. خذ نسخاً احتياطية دورية لمجلد `uploads` وقاعدة البيانات.

مثال Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name events.example.com;

    ssl_certificate     /etc/letsencrypt/live/events.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/events.example.com/privkey.pem;

    client_max_body_size 35m;   # يجب أن يتجاوز UPLOAD_MAX_MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;     # ضروري لـ Socket.IO
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

نسخة احتياطية لقاعدة البيانات:

```bash
docker compose exec mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" negev_events > backup.sql
```

---

## واجهة API

### عام

| الطريقة | المسار | الوصف |
|---|---|---|
| `GET` | `/api/events` | المناسبات المعتمدة (`?town=` `?date=` `?search=` — البحث يمسك أيضاً كل اسم في أصحاب المناسبة) |
| `GET` | `/api/events/:id` | تفاصيل مناسبة + أصحابها ونوعها + التفاعلات والتبريكات |
| `POST` | `/api/events` | تقديم مناسبة (تدخل قائمة المراجعة، أو تُنشر فوراً لحساب إدارة) 🔒 |
| `GET` | `/api/map/events` | نقاط الخريطة + روابط Waze |
| `GET` | `/api/stories` | القصص المباشرة |
| `GET` | `/api/towns` | البلدات وإحصاءاتها |
| `POST` | `/api/check-collision` | فحص تعارض تاريخ |
| `POST` | `/api/events/:id/react` | إضافة تفاعل |
| `POST` | `/api/events/:id/congratulate` | إضافة تبريكة |
| `GET` | `/api/occasion-types` | أنواع المناسبات النشِطة، مرتّبة، مع حقولها الظاهرة وتفاعلاتها |

⚠️ **تغيّر سلوك:** `POST /api/events` كان عاماً (بلا رمز) ويدخل قائمة المراجعة؛ صار يتطلب
رمز دخول صالح 🔒 — طلب بلا رمز يُرفض بـ401. القراءة العامة (`GET`) بلا حساب لم تتغيّر.
النموذج صار يقبل `occasion_type_id` (إلزامي) و`honorees[]` (`{name, role}`، واحد على
الأقل) بدل `groom_name` مفرد، إضافة إلى `event_end_date` و`secondary_location_name`.
أيّ حقل غير ظاهر في النوع المختار يُتجاهَل بصمت إن أُرسل.

### مناسباتي 🔒

| الطريقة | المسار | الوصف |
|---|---|---|
| `GET` | `/api/my-events` | كل ما نشره المستخدم الحالي، بكل حالاته |
| `PATCH` | `/api/events/:id` | تعديل مناسبة يملكها المستخدم (أو أي مناسبة للإدارة) — تعديل تجميلي يبقى معتمداً، وتعديل حرِج (التاريخ/المكان) يعيدها للمراجعة |

### الحساب

| الطريقة | المسار | الوصف |
|---|---|---|
| `POST` | `/api/auth/register` | إنشاء حساب |
| `POST` | `/api/auth/login` | تسجيل الدخول |
| `GET` | `/api/auth/me` | بيانات الحساب الحالي 🔒 |

### دفتر النقوط 🔒

| الطريقة | المسار | الوصف |
|---|---|---|
| `GET` | `/api/nokoot` | السجل + التحليلات |
| `POST` | `/api/nokoot` | إضافة قيد |
| `DELETE` | `/api/nokoot/:id` | حذف قيد |

### الإدارة 👑

| الطريقة | المسار | الوصف |
|---|---|---|
| `POST` | `/api/admin/login` | دخول الإدارة |
| `GET` | `/api/admin/stats` | مؤشرات اللوحة |
| `GET` | `/api/admin/events` | كل المناسبات (`?status=`) |
| `PATCH` | `/api/admin/events/:id/status` | اعتماد أو رفض |
| `DELETE` | `/api/admin/events/:id` | حذف مناسبة |
| `PATCH` | `/api/admin/events/:id/owner` | نقل ملكية مناسبة إلى مستخدم آخر (فعل إداري بشري، بلا استدلال قرابة آلي) |
| `GET` / `DELETE` | `/api/admin/comments[/:id]` | إدارة التبريكات |
| `GET` | `/api/admin/users` | قائمة المستخدمين |
| `POST` | `/api/admin/broadcast` | بث إشعار عام |
| `GET` | `/api/admin/occasion-types` | كل أنواع المناسبات (نشِطة ومعطَّلة) مع عدد المناسبات لكل نوع 🛡️ |
| `POST` | `/api/admin/occasion-types` | إنشاء نوع مناسبة 🛡️ |
| `PATCH` | `/api/admin/occasion-types/:id` | تعديل نوع مناسبة (حقوله، تفاعلاته، أعلامه) 🛡️ |
| `DELETE` | `/api/admin/occasion-types/:id` | حذف نوع مناسبة، أو تعطيله إن كانت له مناسبات 🛡️ |

🔒 يتطلب رمز مستخدم · 👑 يتطلب رمز إدارة · 🛡️ يتطلب رمز مدير عام (`super_admin`)

### أحداث Socket.IO

`new_event_created` · `admin_new_pending_event` · `event_reaction_<id>` ·
`new_congratulation_<id>` · `system_broadcast`

---

## ملاحظة حول مسارات `/api/ai/*`

`generate-poem` و `scan-card` مساعدان محليان لا يستدعيان أي نموذج خارجي: الأول يختار من
قوالب شعر نبطي معدّة مسبقاً، والثاني يعيد بيانات تجريبية. كلاهما يعيد `simulated: true`
في الاستجابة.

---

## الرخصة

MIT
