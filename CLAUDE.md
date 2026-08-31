# CLAUDE.md — منصة مناسبات النقب

موقع مناسبات اجتماعية لمجتمع النقب: نشر المناسبة، عرضها على الخريطة، التفاعل معها
لحظياً، ودفتر نقوط خاص بكل مستخدم. الواجهة عربية بالكامل (RTL).

---

## قواعد السلوك (مُطبَّقة دائماً)

- نفّذ ما طُلب فقط — لا أقل ولا أكثر
- لا تنشئ ملفات إلا إذا كانت ضرورية تماماً
- افضّل دائماً تعديل ملف موجود على إنشاء ملف جديد
- لا تنشئ ملفات docs أو README تلقائياً إلا إذا طُلب صراحةً
- اقرأ الملف دائماً قبل تعديله
- لا تحفظ أسرار أو credentials أو ملفات `.env` في git — `.env` الحقيقي موجود ومتجاهَل، لا تقرأ منه ولا تنسخ قيمه في أي ملف

## التوازي — قاعدة أساسية

جميع العمليات غير المترابطة **يجب** تنفيذها بشكل متوازٍ في رسالة واحدة:

- دائماً اجمع ALL قراءات/كتابات الملفات في رسالة واحدة
- دائماً اجمع ALL أوامر terminal في رسالة واحدة
- استخدم `Task` tool لإطلاق Agents متوازية لأي مهمة معقدة

---

## قراءة السياق — ابدأ من هنا

المشروع صغير (‎~1,300 سطر خادم + ‎~1,500 سطر واجهة). **لا يوجد رسم بياني معرفي ولا فهرس
API مولَّد** — `grep` و `Read` هما الأداة الصحيحة هنا، ولا داعي لأدوات استكشاف أثقل.

قبل أي مهمة اقرأ **هذه الثلاثة**:

1. `README.md` — المزايا، البنية، جدول واجهة API كاملاً، أحداث Socket.IO، ودليل النشر
2. `server/src/db/schema.sql` — المخطط هو مصدر الحقيقة للدومين: ما الحقول الموجودة فعلاً وما ليس موجوداً
3. `docs/adr/` — **لماذا** المشروع على ما هو عليه. خمسة قرارات لا يفصح عنها الكود،
   وبعضها يبدو قابلاً للتبسيط حتى تقرأ سببه. اقرأ ما يمسّ منطقتك قبل أن تغيّرها.

عند الحاجة فقط: `server/src/constants.js` (البلدات والإحداثيات وأنواع التفاعل) · `server/src/routes/` (كل
المسارات، خمسة ملفات) · `server/.env.example` (أسماء متغيرات البيئة).

### أين أبدأ؟

| المهمة | ابدأ من |
|---|---|
| إضافة/تعديل نقطة API | `server/src/routes/<المجال>.routes.js` ثم `server/src/services/<المجال>.service.js` |
| تغيير منطق عمل أو استعلام | `server/src/services/` — **لا شيء غيره** يكتب SQL |
| تغيير حقل أو جدول | `server/src/db/schema.sql` + عبارة `ALTER` (اقرأ «المخطط» أدناه) |
| تحقق من مدخلات | `server/src/middleware/validate.js` |
| صلاحيات ومصادقة | `server/src/middleware/auth.js` |
| رفع صورة أو صوت | `server/src/middleware/upload.js` |
| بث لحظي | `server/src/realtime/index.js` + `realtime.emit` من طبقة المسارات |
| شكل الاستجابة أو رسالة خطأ | `server/src/utils/ApiError.js` + `server/src/middleware/error.js` |
| أي شيء في واجهة الويب | `web/app.js` (الموقع) أو `web/admin.js` (اللوحة) |
| أي شيء في تطبيق الموبايل | `mobile/lib/screens/` ثم `mobile/lib/api/negev_api.dart` |
| بلدة جديدة | `server/src/constants.js` — `TOWNS` و `TOWN_COORDINATES` معاً |

---

## الدومين — ما هو مبنيّ فعلاً وما ليس بعد

**الأعراس فقط.** جدول `events` مصمَّم للعرس صراحةً: `groom_name`، `family_clan`،
`youth_party_date`، `dinner_time`، والتبريكة الافتراضية «مبارك الفرح»، وأنواع التفاعل
(`coffee` `horse` `fireworks` `rose` `hand`) كلها لغة أفراح.

**التعازي والوفيات غير مدعومة** — لا عمود نوع مناسبة، ولا حالة عزاء في أي مكان بالكود
(تحقّقتُ بالبحث: صفر نتيجة). المكان الوحيد الذي يقبل نوع مناسبة حرّاً اليوم هو
`nokoot_ledger.occasion_type` (نص، افتراضيه `'عرس'`).

إذا طُلب دعم التعازي فهي **ميزة جديدة لا تعديل تجميلي**، وتلمس على الأقل:
عمود نوع في `events` + تعميم `groom_name` + تفاعلات ورسائل بديلة + نصوص الواجهة +
`ai.routes.js` (قوالبه كلها شعر أفراح). لا تنفّذها جزئياً وتقل «تمت».

---

## البنية — ثلاث وحدات منفصلة

```
server/   خادم JSON فقط — لا يخدم أي HTML
web/      واجهة الويب — تُنشر على استضافة ثابتة مستقلة
mobile/   تطبيق فلاتر — يستهلك نفس الخادم
```

الخادم عديم الحالة (JWT، بلا كوكيز) ويخدم العملاء الثلاثة وأي عميل جديد.
**لا تُعِد ربط الطبقات**: أي `express.static` للواجهة داخل `server/` يلغي الفصل،
وأي منطق أعمال داخل `web/` أو `mobile/` يكرّر ما هو في الخدمات.

أوامر الخادم من داخل `server/` · الويب `node web/serve.js` · الموبايل
`flutter run` من داخل `mobile/`.

## Tech Stack

- **الخادم:** Node.js ‎20+‎، Express 4.21، MySQL 8 عبر `mysql2/promise`، Socket.IO 4.8
- **الواجهة:** HTML/CSS/JS عادي في `web/` — **لا React ولا TypeScript ولا خطوة بناء**. وحدة نشر مستقلة عن الخادم
- **المكتبات الخارجية:** كلها عبر CDN في `index.html` (Leaflet، Chart.js، Font Awesome، خطوط Google، وعميل Socket.IO) — الخادم لم يعد يخدم أي أصل للواجهة
- **CSS:** ملفات `web/styles.css` و `web/admin.css` مباشرةً — **لا Tailwind ولا أي معالِج**
- **النشر:** Docker Compose (`mysql` + `app` + `web`)، والخادم ينتظر جاهزية قاعدة البيانات قبل الإقلاع

| الأمر | الغرض |
|---|---|
| `npm run dev` | تشغيل مع إعادة تحميل تلقائي |
| `npm run db:migrate` | إنشاء قاعدة البيانات وتطبيق `schema.sql` (آمن للتكرار) |
| `npm run db:seed` | المدير الأول + بيانات تجريبية (لا يستبدل الموجود) |
| **قبل أي commit** | `npm test` — **لا تُتخطّى** |

`npm test` هو `server/test/smoke.test.js`: يُقلع التطبيق على منفذ عابر ويمرّ على المسارات
العامة ومسارات المستخدم والإدارة من طرف إلى طرف. **يتطلب MySQL يعمل فعلاً** — لا يوجد
mock ولا قاعدة بيانات في الذاكرة. إن لم تكن MySQL متاحة قل ذلك صراحةً، ولا تعتبر المهمة
منتهية بلا اختبار.

---

## قواعد لا يجوز كسرها

### الطبقات
- **المسار يتحقق، الخدمة تستعلم.** لا SQL خارج `server/src/services/` ولا `req`/`res` داخلها
- كل وصول لقاعدة البيانات عبر `server/src/db/pool.js` (`query` / `queryOne` / `execute` / `transaction`) — لا `pool.execute` مباشرةً ولا اتصال جديد
- كل استعلام مُعامَل بـ `?` — **لا دمج نصوص SQL أبداً**، ولا حتى لأسماء جاهزة. البحث النصّي يمرّ عبر `escapeLike` في `events.service.js`

### الأخطاء
- ارمِ `ApiError.badRequest/unauthorized/forbidden/notFound/conflict` — لا `res.status(500)` يدوي
- لفّ كل معالج مسار بـ `asyncHandler` وإلا ضاع الرفض دون معالجة
- كل رسالة تصل المستخدم **بالعربية** — هذا هو النمط في كل الملفات، لا تُدخل رسائل إنجليزية

### الوسائط
- الوسائط تُخزَّن نسبية (`/uploads/<ملف>`) وتخرج **مطلقة دائماً** عبر `withAbsoluteMedia` في `server/src/utils/mediaUrl.js`. أي استعلام جديد يرجّع `poster_url` أو `audio_url` أو `image` يمرّ من هناك — الرابط النسبي يعمل بالصدفة في الويب ويكسر كل عميل آخر
- `PUBLIC_URL` مطلوب في الإنتاج، وإلا خرجت الروابط على `localhost`

### الأمان
- `pin_code` مخزّن بـ bcrypt و**لا يخرج في أي استجابة** — مرّر المستخدم دائماً عبر `auth.service.publicUser`
- **دفتر النقوط خاص على مستوى الاستعلام نفسه**: كل استعلام في `nokoot.service.js` يحمل `WHERE user_id = ?` (والحذف `WHERE id = ? AND user_id = ?`). فلترة بعد الجلب في الـJS = تسريب بيانات
- كل مسارات `/admin` خلف `requireAdmin`، ولا مفاتيح تجاوز — النشر الفوري مشروط برمز إدارة صالح في `events.routes.js`
- المدخلات كلها عبر `server/src/middleware/validate.js` (`cleanString` يقصّ الطول، `parseId`، `parseAmount`، `requireDate`) — لا تحقق يدوي جديد
- البلدة يجب أن تكون من `TOWNS`، والإحداثيات الاحتياطية من `TOWN_COORDINATES` — لا تخمين
- الرفع عبر `middleware/upload.js` فقط: قائمة MIME بيضاء، وأسماء ملفات تُولَّد على الخادم ولا تُؤخذ من العميل

### البث اللحظي
- `realtime.emit` يُستدعى من **طبقة المسارات بعد نجاح الخدمة** — لا بثّ من داخل الخدمات
- أسماء القنوات بها معرّفات (`event_reaction_<id>`، `new_congratulation_<id>`) — أي قناة جديدة توثَّق في جدول أحداث Socket.IO في `README.md`

### المخطط
- `migrate.js` يطبّق `schema.sql` بعبارات `CREATE TABLE IF NOT EXISTS` فقط — لذلك
  **إضافة عمود إلى جدول موجود لن تُطبَّق أبداً** على قاعدة بيانات قائمة. عدّل `schema.sql`
  (للتنصيبات الجديدة) **و**أضف `ALTER TABLE` صريحاً، وابقِ الاثنين آمنَين للتكرار
- `seed.js` لا يستبدل صفاً موجوداً — أي إضافة يجب أن تحافظ على ذلك

---

## قواعد تطبيق الموبايل (`mobile/`)

- **كل نداء عبر `mobile/lib/api/negev_api.dart`** — لا `http` مباشر في الشاشات
- الرمز يُرفق عند `auth: true` فقط — نفس سبب الويب: `POST /api/events` ينشر فوراً برمز مدير
- البلدات في `mobile/lib/config.dart` تطابق `server/src/constants.js` حرفياً — أي بلدة جديدة تُضاف في الاثنين
- `flutter test` قبل أي commit يلمس `mobile/`، و`flutter analyze` يجب أن يكون نظيفاً
- كل نص يراه المستخدم بالعربية، مثل باقي المشروع

## قواعد واجهة الويب (`web/`)

- ملفات ثابتة يخدمها Express — لا خطوة بناء. أي `import`/`export` أو JSX سيكسر الصفحة
- الحالة متغيرات عامة أعلى `app.js`، والرمز في `localStorage` تحت `negev_token` و `negev_user`
- **كل نداء يمر عبر `web/api.js`** — `apiFetch` للموقع و `adminFetch` للوحة. **لا `fetch()` مباشر جديد**: عنوان الخادم يعيش في `web/config.js` وحده
- `apiFetch` يرفق رمز الدخول فقط عند `auth: true`. لا تجعله افتراضياً — `POST /api/events` ينشر فوراً إذا وصله رمز مدير، فإرفاق الرمز في كل مكان يكسر طابور المراجعة
- الواجهة RTL عربية — أي نص جديد بالعربية وبنفس نبرة الموجود

---

## مزامنة munasabatna

استيراد دعوات الأعراس من `munasabatna.com` يجري عبر مهارة `munasabatna-sync`
(`.claude/skills/munasabatna-sync/SKILL.md`) وسكربتَي `server/scripts/munasabatna-scan.js`
و `server/scripts/munasabatna-insert.js`. المهارة تحمل قواعدها الصارمة — **لا تخمين البلدة، ولا
إدخال عبر `POST /api/events`، ولا تعديل صفوف موجودة**. اتبعها كما هي ولا تختصرها.

---

## Agent skills

### Issue tracker

Issues live as GitHub issues in `thabet-toma/negev-events-app`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
