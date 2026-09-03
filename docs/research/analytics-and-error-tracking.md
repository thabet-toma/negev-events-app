# بحث: أدوات القياس السلوكي وتتبّع الأعطال تحت تيقون ١٣

> تذكرة: [#40](https://github.com/thabet-toma/negev-events-app/issues/40) — `wayfinder:research` · جزء من [#34](https://github.com/thabet-toma/negev-events-app/issues/34)
> فرع: `research/analytics-and-error-tracking` · تاريخ البحث: 2026-09-03
> **هذا الملف حقائق وكلفة ومقايضات وفجوات فقط. لا توصية فيه ولا قرار** — القرار في [#41](https://github.com/thabet-toma/negev-events-app/issues/41) و [#42](https://github.com/thabet-toma/negev-events-app/issues/42).

## المنهجية

كل ادّعاء أدناه مصدره **وثيقة مزوّد رسمية، أو مستودع المشروع نفسه (‏`LICENSE`، `README`،
`docker-compose.yml`، `pubspec.yaml`)، أو نصّ قانوني رسمي**. المدوّنات التسويقية وملخّصات
مكاتب المحاماة **مستبعَدة كمصدر**؛ استُعملت مؤشّراً للوصول إلى المصدر الأصلي ولا أكثر، وحيث
اضطررتُ إلى مصدر مملوك للمزوّد لكنه ليس صفحة رسمية (مدوّنة Rollbar للتسعير) وسمتُه صراحةً
ولم أبنِ عليه رقماً معتمَداً.

**الادّعاءات القابلة للفحص فُحصت لا نُقلت.** سؤال «هل تشحن هذه المكتبة حزمة متصفّح تعمل من
وسم ‎`<script>`‎ بلا bundler؟» قابل للتحقّق مباشرةً، فجُلب كل ملف CDN فعلياً وفُحصت أوّل
بايتاته وحجمه ورمزه العام — لا اكتفاءً بما تقوله وثيقته. النتائج في §1.2 تحمل الحجم بالبايت
والشكل (IIFE / UMD / ESM).

**النصّ القانوني قُرئ من المصدر لا من ملخّص.** كل اقتباس عبري في §4 مستخرَج من ملف
**ספר החוקים 3287** الرسمي على `fs.knesset.gov.il` (نصّ تيقون ١٣ كما نُشر) ومن **النوסח
המשולב** الرسمي للقانون على نفس النطاق. لم يُبنَ أي ادّعاء قانوني على ويكي‌مصدر ولا على
تلخيص مكتب محاماة.

حيث لم أجد جواباً موثوقاً قلتُه صراحةً في قسم [الفجوات](#الفجوات--ما-لم-أجده-ولا-أخمّنه).
**الفجوة الموسومة أنفع من ادّعاء واثق مفبرك.**

---

## الوضع الحالي عندنا (خط الأساس المفحوص)

| الحقيقة | التفصيل |
|---|---|
| أدوات القياس أو تتبّع الأعطال | **صفر.** `server/package.json` فيه ١٢ تبعية إنتاج، لا واحدة منها قياس أو أخطاء؛ `mobile/pubspec.yaml` فيه ١٦ تبعية، لا واحدة منها كذلك؛ `web/` بلا npm أصلاً |
| مضيفو CDN في `web/index.html` | **أربعة**: `cdnjs.cloudflare.com` (Font Awesome 6.5.1 CSS) · `cdn.jsdelivr.net` (Chart.js) · `unpkg.com` (Leaflet 1.9.4) · `cdn.socket.io` (4.8.1). وثلاثة ملفات محلية: `config.js` · `api.js` · `app.js` |
| خطوة بناء في `web/` | **لا شيء.** أي `import`/`export` يكسر الصفحة — قاعدة `CLAUDE.md` |
| نسخة الموبايل | `1.2.0+4` · `environment: sdk: ^3.10.4` |
| النشر | Docker Compose بثلاث حاويات: `mysql:8.0` · `app` (Node) · `nginx:alpine` |
| **سجلّ سلوكي مربوط بالشخص — موجود بالفعل** | `story_views` و `story_clicks` كلاهما يحمل `user_id` و `device_id`، و`story_views` يحمل `viewer_town` و `viewer_key` مولَّداً (`u:<id>` أو `d:<device>`) |
| عدّاد المشاهدات على المناسبة | `events.views_count` عدّاد `INT UNSIGNED` **بلا هوية** — لا يعرف من فتح |
| سجلّ الوصول | `morgan('combined')` في الإنتاج (`server/src/app.js:44`) — يكتب **IP وUser-Agent** إلى stdout الحاوية |
| المعرّف الطبيعي للشخص | `users.phone_number` — مفتاح فريد، وهو **بالضبط** ما تمنع Google وضعه في `user_id` (§2.1) |

**تصحيحان يجب أن يُقالا صراحةً قبل أي قرار:**

1. **«المشروع بلا أي قياس» صحيحة عن الأدوات، لا عن البيانات.** جدولا الستوريات يسجّلان
   «فلانٌ شاهد هذا المحتوى في هذا اليوم من هذه البلدة» — وهذا **سجلّ تصفّح مربوط بالشخص
   قائم فعلاً**. أي التزام قانوني في §4 يبدأ من اليوم، لا من يوم إضافة الأداة.
2. **`morgan('combined')` معالجة مستمرّة لعنوان IP.** «مזהה מקוון» (معرّف مقروء آلياً)
   مذكور اسماً في تعريف «מידע אישי» بعد تيقون ١٣ (§4.1). سجلّ stdout الحاوية معالجة قائمة.

---

## 1. تتبّع الأعطال — التغطية عبر ثلاث بيئات

المطلوب تغطيته: **Node 20 / Express 4.21 (CommonJS)** · **متصفّح بلا خطوة بناء** ·
**Flutter (‏`sdk: ^3.10.4`، أندرويد، APK ذاتي التوزيع)**.

### 1.1 الخلاصة — من يغطّي الثلاثة

| المزوّد | Node 20 / Express | متصفّح بلا bundler | Flutter | الثلاثة معاً؟ |
|---|---|---|---|---|
| **Sentry** (SaaS + ذاتي) | ✅ `@sentry/node` **10.73.0** | ✅ **مُتحقَّق** — IIFE، رمز عام `Sentry` | ✅ `sentry_flutter` **9.28.0** | ✅ نعم |
| **GlitchTip** | ✅ عبر `@sentry/node` نفسه | ✅ عبر حزمة Sentry نفسها | ✅ عبر `sentry_flutter` نفسه | ✅ نعم، بقيود |
| **Rollbar** | ✅ `rollbar` **3.1.0** | ✅ **مُتحقَّق** — IIFE، رمز عام `Rollbar` | ❌ **مهجور بإقرار Rollbar** | ❌ لا |
| **Bugsnag / Insight Hub** | ✅ `@bugsnag/js` **8.10.0** | ✅ **مُتحقَّق** — UMD، رمز عام `Bugsnag` | ✅ `bugsnag_flutter` **4.2.1** | ✅ نعم |

> **الاختبار الذي ظننّاه سيقصي مرشّحين لم يقصِ أحداً.** الأربعة جميعاً يشحنون حزمة متصفّح
> تعمل من ‎`<script src>`‎ عادي. المُقصي الفعلي كان **Flutter**، لا الويب.

### 1.2 اختبار «المتصفّح بلا bundler» — فحص مباشر لا قراءة وثيقة

جُلب كل ملف بـ`curl` وفُحصت ترويسته وأوّل بايتاته:

| المزوّد | الـURL المفحوص | HTTP | الحجم | الشكل | الرمز العام |
|---|---|---|---|---|---|
| Sentry | `https://browser.sentry-cdn.com/10.73.0/bundle.min.js` | 200 | 90,590 B | **IIFE** | `Sentry` |
| Rollbar | `https://cdn.rollbar.com/rollbarjs/refs/tags/v3.1.0/rollbar.min.js` | 200 | 131,506 B | **IIFE (webpack)** | `Rollbar` |
| Bugsnag | `https://d2wy8f7a9ursnm.cloudfront.net/v8/bugsnag.min.js` | 200 | 51,756 B | **UMD** | `Bugsnag` |
| GlitchTip | — حزمة Sentry نفسها — | — | — | — | `Sentry` |

**Sentry** — أوّل سطرين من الملف حرفياً:

```
/*! @sentry/browser 10.73.0 (f109d92) | https://github.com/getsentry/sentry-javascript */
var Sentry=function(t){t=window.Sentry||{};const n=globalThis,e="10.73.0";…
```

بحث عن `export{` في الملف: **صفر مطابقة**. الوسم الرسمي يأتي بـ`integrity` و`crossorigin`
([المصدر](https://docs.sentry.io/platforms/javascript/install/cdn/) — 2026-09-03).

Sentry تشحن أيضاً **Loader Script** بديلاً — ‎`<script src="https://js.sentry-cdn.com/<public-key>.min.js" crossorigin="anonymous">`‎ —
غير متزامن، لا يحمّل الـSDK الكامل إلا عند أوّل خطأ، ويُحدَّث إصداره من لوحة Sentry بلا لمس
`index.html` ([المصدر](https://docs.sentry.io/platforms/javascript/install/loader/) — 2026-09-03).
هذا الوحيد بين الأربعة الذي يحرّر `index.html` من رقم إصدار مثبَّت.

**Bugsnag** — مقدّمة UMD كلاسيكية تضع `window.Bugsnag` عند غياب CommonJS/AMD. **تحذير على
الوسم كما تكتبه الوثائق:** يستخدم `//` (protocol-relative) وبلا `integrity` ولا `crossorigin`
([المصدر](https://docs.bugsnag.com/platforms/javascript/#cdn) — 2026-09-03). وتثبيت إصدار
دقيق ممكن: `…/v8.10.0/bugsnag.min.js` يعيد 200.

**Rollbar** — يعمل، لكنه **أثقل بنحو ٤٥٪ من Sentry** (131 KB مقابل 90 KB غير مضغوطين) على
صفحة تحمل Leaflet وChart.js أصلاً.

**أثر معماري على `web/`:** أياً كان الاختيار فهو **مضيف CDN خامس**، وأي
`Content-Security-Policy` مستقبلية يجب أن تضيفه إلى `script-src` **و**`connect-src` معاً —
الـSDK يرسل إلى نطاق الابتلاع لا إلى نطاق الـCDN.

### 1.3 الخادم — Node 20 / Express 4.21

**Sentry** — `@sentry/node` 10.73.0 يعلن `engines: { node: ">=18" }`
([registry.npmjs.org](https://registry.npmjs.org/@sentry/node/latest) — 2026-09-03). النمط في
CommonJS ملف `instrument.js` يُستدعى **قبل** `require("express")` — الوثائق تقول حرفياً
`Require this first! require("./instrument")` — ثم `Sentry.setupExpressErrorHandler(app)`
([المصدر](https://docs.sentry.io/platforms/javascript/guides/express/) — 2026-09-03).

> **اشتباك مباشر مع بنيتنا:** `middleware/error.js` عندنا هو آخر معالج في السلسلة، فيجب
> تركيب `setupExpressErrorHandler` **قبله**. وبما أن `@sentry/node` يستخدم OpenTelemetry
> auto-instrumentation فسيلتقط `mysql2` تلقائياً — أي أن **نصوص استعلامات SQL ستصل Sentry**
> افتراضياً (§1.6).

**GlitchTip** — لا SDK خاص به: «See our general SDK setup instructions for getting started
with any **Sentry-compatible SDK**» ([المصدر](https://glitchtip.com/sdkdocs) — 2026-09-03).

**Rollbar** — `rollbar` 3.1.0، CommonJS أصيل، مع `app.use(rollbar.errorHandler())`
([المصدر](https://docs.rollbar.com/docs/nodejs) — 2026-09-03).

**Bugsnag** — `@bugsnag/js` 8.10.0 + `@bugsnag/plugin-express`، ويركّب **معالجَين** لا واحداً:
`middleware.requestHandler` أوّلاً و`middleware.errorHandler` أخيراً
([المصدر](https://docs.bugsnag.com/platforms/javascript/express/) — 2026-09-03).

### 1.4 Flutter — هنا يقع الإقصاء الحقيقي

من pub.dev و`https://pub.dev/api/packages/<name>` (2026-09-03):

| الحزمة | الإصدار | النشر | `sdk` | `flutter` | المنصّات | الناشر |
|---|---|---|---|---|---|---|
| `sentry_flutter` | **9.28.0** | 2026-08-27 | `>=3.5.0 <4.0.0` | `>=3.24.0` | android, ios, macos, linux, windows, web | `sentry.io` (موثّق) |
| `bugsnag_flutter` | **4.2.1** | 2026-04-29 | `>=3.0.0 <4.0.0` | `>=3.10.0` | android, ios | `bugsnag.com` (موثّق) |
| `rollbar_flutter` | **1.5.2** | 2026-01-05 | `>=2.17.0 <4.0.0` | `>=3.0.0` | android, ios | `rollbar.com` (موثّق) |

القيود الثلاثة كلها متوافقة مع `^3.10.4` عندنا. قيد `sentry_flutter` أُكِّد مرّتين: من pub.dev
ومن [`pubspec.yaml` في المستودع](https://raw.githubusercontent.com/getsentry/sentry-dart/main/packages/flutter/pubspec.yaml)
— متطابقان حرفياً.

**Rollbar تُقصي نفسها.** وثائقها الرسمية للفلاتر تقول حرفياً:

> «As of April 2024, Rollbar will not be actively updating this repository and plans to archive it.»
> — [docs.rollbar.com/docs/flutter](https://docs.rollbar.com/docs/flutter) (2026-09-03)

**Google Play Services** — لا اعتماد موثَّق على أيٍّ منها في الثلاثة. `bugsnag_flutter` يعلن
تبعيتين فقط (`bugsnag_bridge ^2.0.0` و`flutter`)، و`sentry_flutter` يعتمد على Sentry Android
SDK الأصلي (JNI/NDK).

**قيد GlitchTip على الموبايل — ليس تفصيلاً:** وثائقه تفرض `enableAutoSessionTracking = false`
بتعليل صريح «GlitchTip does not support sessions»
([المصدر](https://glitchtip.com/sdkdocs/dart-flutter) — 2026-09-03). أي أن **release health
و crash-free rate — وهو أنفع مقياس لتطبيق موبايل — غير متاح على GlitchTip.**

### 1.5 الرخص والاستضافة الذاتية

| | **Sentry self-hosted** | **GlitchTip self-hosted** |
|---|---|---|
| الرخصة | **`FSL-1.1-Apache-2.0`** — «Functional Source License, Version 1.1, Apache 2.0 Future License»، «Copyright 2016-2024 Functional Software, Inc. dba Sentry» | **MIT** — «Copyright (c) 2019 GlitchTip» |
| هل تسمح باستخدامنا؟ | ✅ **نعم صراحةً** — «Permitted Purposes specifically include using the Software: 1. **for your internal use and access**». الممنوع هو Competing Use فقط | ✅ نعم بلا أي تحفّظ |
| ملاحظة | ليست OSI-approved. تتحوّل إلى Apache 2.0 عند **الذكرى السنوية الثانية** لإتاحة كل إصدار | `NOTICE.md` يقرّ بتضمين كود **BSD** قديم من Sentry معزول في مجلّد `sentry/` — ولهذا موقفه القانوني سليم ولا يمسّه FSL |
| CPU | 4 cores | x86 أو arm64 (بلا حدّ أدنى للأنوية) |
| RAM | **16 GB + 16 GB swap** (والمستحسن 32 GB) | **256 MB** all-in-one · المستحسن **512 MB** · «128 MB + swap» بضبط دقيق |
| القرص | 20 GB حرّة | ~30 GB لكل مليون حدث/شهر |
| عدد الخدمات في compose | **54–56** (انظر الفجوة ١٩) | **٣** — `postgres:18` · `valkey:9` (اختيارية) · `web` |
| التبعيات | PostgreSQL + ClickHouse + Kafka + Redis + Memcached + SeaweedFS + pgbouncer + Symbolicator + Relay + ٢١ خدمة Snuba | PostgreSQL 14+ فقط، وValkey/Redis 7+ **اختياري** |

المصادر: [ملف رخصة Sentry](https://raw.githubusercontent.com/getsentry/self-hosted/master/LICENSE.md) ·
[متطلّبات Sentry](https://develop.sentry.dev/self-hosted/) ·
[`docker-compose.yml`](https://raw.githubusercontent.com/getsentry/self-hosted/master/docker-compose.yml) ·
[رخصة GlitchTip](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/LICENSE) ·
[`NOTICE.md`](https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/NOTICE.md) ·
[تثبيت GlitchTip](https://glitchtip.com/documentation/install/) ·
[`compose.sample.yml`](https://glitchtip.com/assets/compose.sample.yml) (مجلوب فعلياً، 1,948 بايت) — كلها 2026-09-03.

**قيدان تشغيليان صريحان من Sentry نفسها**
([المصدر](https://develop.sentry.dev/self-hosted/support/) — 2026-09-03):

> «We **DO NOT** provide dedicated support for self-hosted.»
> المستودع «is geared towards low traffic loads (less than ~1 million submitted Sentry events per month).»

**وعبء الترقية موثَّق وقاسٍ:** إصدارات شهرية (CalVer، «a primary release on the 15th of each
month»)، و**لا يجوز تخطّي الإصدارات**: «When upgrading one must upgrade to **each** hard stop
to pick up significant database changes.» المحطّات المعلنة: 9.1.2 · 21.5.0 · 21.6.3 · 23.6.2 ·
23.11.0 · 24.8.0 · 25.5.1 · 26.5.0 · 26.7.0. والمثال المنشور: من 22.8.0 إلى 24.2.0 يجب المرور
بـ«22.8.0 → 23.6.2 → 23.11.0 → 24.2.0»، مع تحذير «If you upgrade infrequently, it's less
likely that upgrading to the latest version will work.»
([المصدر](https://develop.sentry.dev/self-hosted/releases/) — 2026-09-03).

### 1.6 الـPII وربط الخطأ بالشخص

| المزوّد | ربط بمستخدم | التقاط IP افتراضياً | اسم الإعداد |
|---|---|---|---|
| Sentry | `Sentry.setUser({ id })` | ❌ **لا** | `sendDefaultPii` — **الافتراضي `false`** |
| Bugsnag | `Bugsnag.setUser(id, email, name)` | ✅ **نعم** | `collectUserIp` — الافتراضي `true` |
| Rollbar | `person: { id, username, email }` — `id` إلزامي | (فجوة ٩) | حمولة `person` |
| GlitchTip | يرث سلوك Sentry SDK بالكامل | ❌ لا | نفس الإعداد |

**Sentry — الوصف الرسمي حرفياً:**

> «Set this option to `true` to send default PII data to Sentry. Among other things, enabling
> this will enable automatic IP address collection on events.» — القيمة الافتراضية **`false`**
> ([المصدر](https://docs.sentry.io/platforms/javascript/configuration/options/) — 2026-09-03)

**تطوّر يجب تسجيله:** `sendDefaultPii` **صار deprecated اعتباراً من 10.54.0** وسيُزال في v11،
ويحلّ محلّه كائن `dataCollection` الأدقّ (‏`dataCollection: { userInfo: true, httpBodies: true }`).
مثال Express الرسمي **لم يعد يذكر `sendDefaultPii` إطلاقاً**. أي دليل يعلّمك
`sendDefaultPii: true` صار قديماً.

ما **لا يُرسل** افتراضياً: الكوكيز · IP المستخدم · أجساد الطلبات والاستجابات (يُرسل **الحجم
فقط**) · حقول هوية المستخدم. وما **يُرسل** افتراضياً: ترويسات HTTP (بتنقية تلقائية) · الـURL ·
سلسلة الاستعلام · معلومات الجهاز/المتصفّح · أسطر سياق الـstack trace · **واستعلامات قاعدة
البيانات** ([المصدر](https://docs.sentry.io/platforms/javascript/guides/express/data-management/data-collected/) — 2026-09-03).

والقاعدة الحاسمة: **«Data you set explicitly (for example, via `Sentry.setUser()`) is always
sent, regardless of `dataCollection`.»**

> **ما يعنيه هذا لقواعدنا الصلبة:** التقاط استعلامات قاعدة البيانات افتراضياً يصطدم مباشرةً
> بقاعدتَي `CLAUDE.md` — «`pin_code` لا يخرج في أي استجابة» و«دفتر النقوط خاص على مستوى
> الاستعلام». استعلامات `nokoot.service.js` و`adminScope.service.js` كلها `WHERE user_id = ?`.
> يجب التحقّق ألّا تُلتقط **قيم الـbindings** لا نصّ الاستعلام وحده — وإلا سُرِّبت معرّفات
> وأرقام نقوط إلى طرف ثالث.

**Bugsnag — الموقف الافتراضي المعاكس:** «The client's IP address is collected by default and
used in both the user identifier and Request tab on the dashboard.» ولإطفائه
`collectUserIp: false`، لكن الوثائق تحذّر أن التقارير حينها «will all appear to come from the
same user unless a user ID is specified»
([المصدر](https://docs.bugsnag.com/platforms/javascript/customizing-error-reports/) — 2026-09-03).

> لمنصّة تخدم مجتمعاً محدَّد الجغرافيا (بلدات وقرى النقب المعدودة في `constants.js`) فإن
> IP + بلدة المناسبة قد يقترب من تعريف الأفراد. هذا فارق افتراضي بين المزوّدَين لا إعداد
> تفصيلي.

### 1.7 الـsource maps — غياب خطوة البناء ميزة هنا لا عيب

الـsource map موجودة لسبب واحد: إعادة كود مُصغَّر إلى شكله الأصلي. Sentry تعنون القسم كلّه
**«Add Readable Stack Traces With Source Maps (Optional)»** — اختياري صراحةً — وتقول إن
الخرائط «only generated and uploaded during production builds»
([١](https://docs.sentry.io/platforms/javascript/) · [٢](https://docs.sentry.io/platforms/javascript/sourcemaps/) — 2026-09-03).
وهو بناء **لا وجود له عندنا**.

عملياً في `web/`: `app.js` و`admin.js` و`api.js` تُخدَم كما كُتبت حرفاً بحرف، فالـstack trace
سيقول `app.js:412` وسيكون **رقم السطر الحقيقي في الملف الحقيقي**. لا رفع artifacts، لا
`sentry-cli`، لا release pipeline. **صفر عمل إضافي، وقابلية قراءة كاملة.**

الأثر الحقيقي الوحيد في مكان آخر: **release tracking**. بلا build pipeline لا يوجد hash
تلقائي؛ الحلّ ثابت مكتوب في `web/config.js` (حيث يعيش عنوان الخادم أصلاً). وفي `mobile/`
المشكلة غير قائمة — `sentry_flutter` يقرأ الإصدار من `pubspec.yaml`.

### 1.8 التسعير (كل الأرقام قُرئت 2026-09-03)

| المزوّد | الطبقة المجانية | الاحتفاظ | المقاعد | الدخول المدفوع |
|---|---|---|---|---|
| **Sentry** | **5k** خطأ/شهر · 50 replay · 5M span | **30-day lookback** | **مستخدم واحد** | Team **$26/mo** سنوياً، 50k خطأ، مستخدمون بلا حدّ |
| **GlitchTip** | **1,000** حدث/شهر | (فجوة ٧) | (فجوة ٧) | Small **$15/mo** — 100k · Medium $50 — 500k · Large $250 — 3M |
| **Rollbar** | **5,000** occurrence · 1,000 replay | **٣٠ يوماً** | **بلا حدّ** | (فجوة ٦) — Essentials 90 يوماً، Advanced 180 يوماً |
| **Bugsnag** | **7,500** حدث/شهر · 1M span | **٧ أيام فقط** | **مستخدم واحد** | (فجوة ٨) — Select/Preferred باحتفاظ 60 يوماً |

المصادر: [sentry.io/pricing](https://sentry.io/pricing/) · [glitchtip.com/pricing](https://glitchtip.com/pricing) ·
[rollbar.com/pricing](https://rollbar.com/pricing) · [bugsnag.com/pricing](https://www.bugsnag.com/pricing/).

> **قيد «مستخدم واحد»** على الطبقة المجانية لدى Sentry وBugsnag هو القيد القاتل عملياً لفريق
> فيه `super_admin` وأدمن بلدات. **Rollbar وحده يعطي مقاعد بلا حدّ مجاناً** — وهو المزوّد
> نفسه الذي يسقط في Flutter. **واحتفاظ Bugsnag ٧ أيام** أقصر بأربع مرّات من الجميع؛ لمنصّة
> تُنشر مناسباتها أسبوعياً قد لا يكفي لملاحظة نمط.

### 1.9 إقامة البيانات

| المزوّد | منطقة EU؟ | التفصيل |
|---|---|---|
| **Sentry SaaS** | ✅ نعم — `de.sentry.io`، Frankfurt | **بتحفّظَين، انظر أدناه** |
| **GlitchTip SaaS** | ✅ نعم — `eu.glitchtip.com`، DigitalOcean FRA1 | «All data on the EU instance — including error events, **user accounts**, and transactional email — stays within the EU» و«The two instances are completely separate; there is no data replication between regions» ([المصدر](https://glitchtip.com/documentation/hosted-architecture/)) |
| **Rollbar** | ❌ لا | GCP، Iowa. البديل ضمانات تعاقدية (DPA + SCCs) لا جغرافية ([المصدر](https://docs.rollbar.com/docs/security)) |
| **Bugsnag** | ❌ لا | «We use data centers based in the United States» على GCP ([المصدر](https://docs.bugsnag.com/security/overview/)). البديل الوحيد On-premises في خطة Enterprise |

**تحفّظا Sentry — كلاهما مهمّ:**

1. **جزء من البيانات يبقى في الولايات المتحدة مهما كانت المنطقة المختارة**: حسابات المستخدمين
   وإعدادات الإشعارات و2FA، وتكاملات المنظّمة، ورموز الوصول، والإعدادات، وسجلّات التدقيق،
   وبيانات المشروع الوصفية. أي أن **«خارج الولايات المتحدة تماماً» غير قابل للتحقيق على
   Sentry SaaS.**
2. **الاختيار لا رجعة فيه**: «Once selected, your data storage location can't be changed. The
   only way to switch it is by creating a new organization.»

([المصدر](https://docs.sentry.io/organization/data-storage-location/) — 2026-09-03)

> **GlitchTip أنظف في هذه النقطة تحديداً** لأنه لا يستثني بيانات وصفية.

---

## 2. القياس السلوكي — من يدعم الربط بالشخص فعلاً

المتطلب الصارم: كل حدث سلوكي يحمل `user_id` من جدول `users` عندنا.

### 2.1 الجدول الحاسم

| الأداة | ربط بشخص؟ | الـAPI بالضبط | القيد على المعرّف |
|---|---|---|---|
| **PostHog** | ✅ بالتصميم | `posthog.identify(distinct_id)` | لا قيد منشور |
| **Matomo** | ✅ نعم | `_paq.push(['setUserId', '…'])` · المعامل `uid` في Tracking API | «unique and persistent non-empty string» |
| **Umami** | ✅ **نعم** — خلافاً للانطباع الشائع | `umami.identify({ id })` — «Distinct IDs» منذ **v2.18.0** | سقف **٥٠ حرفاً** |
| **Plausible** | ❌ **لا — مجهول بالتصميم** | لا حقل معرّف في السكربت ولا في Events API | ممنوع صراحةً |
| **Firebase Analytics** | ✅ نعم، بقيد Google | `FirebaseAnalytics.instance.setUserId(id: '…')` | **ممنوع** ما يمكن لطرف ثالث الاستدلال به على الهوية |

**Plausible — الحسم قاطع ونصّي:**

> «We do not generate persistent identifiers. We do not use cookies, browser cache or local storage.»
> «All data is isolated to a single day, a single website and a single device.»
> — [plausible.io/data-policy](https://plausible.io/data-policy) (2026-09-03)

وحتى الالتفاف عبر custom properties ممنوع نصّاً: «you must ensure that no personally
identifiable information (PII) is sent to Plausible with custom properties»، والقائمة الممنوعة
تشمل «pseudonymous cookie IDs, advertising IDs or **other pseudonymous end user identifiers**»
([المصدر](https://plausible.io/docs/custom-props/introduction) — 2026-09-03). وفي الـEvents API
الخادمية لا حقل هوية أصلاً؛ الهوية تُشتقّ من الترويسات: «The raw value of User-Agent is used to
calculate the _user_id_» ([المصدر](https://plausible.io/docs/events-api)).

> **Plausible لا تستطيع تلبية المتطلب، لا بحيلة ولا بإعداد.** استبعادها نتيجة تصميم مُعلَن لا
> تفضيل.

**تصحيح للفريق: Umami ليست anonymous-by-design.** سمعتها «cookieless» صحيحة، لكن Distinct IDs
موثّقة ومتاحة في النسخة الحرّة (المشروع كله MIT). فارق واحد عن PostHog: الوثائق تقول إنها
«does not merge sessions together» — أي تربط الجلسة بالمعرّف ولا تدمج الجلسات المجهولة السابقة
في الشخص ([١](https://docs.umami.is/docs/distinct-ids) · [٢](https://docs.umami.is/docs/guides/identify-logged-in-users) — 2026-09-03).

**Firebase — القيد الذي يمسّنا مباشرةً:**

> «Your user ID must not contain information that a third party could use to determine the
> identity of an individual user. For example, you cannot use a user's email address or social
> security number as a user ID.»
> — [firebase.google.com/docs/analytics/userid](https://firebase.google.com/docs/analytics/userid) (2026-09-03)

وسياسة Google Analytics الأشمل: «no data be passed to Google that Google could use or recognize
as personally identifiable information (PII)»، و«PII includes, but is not limited to,
information such as email addresses, **personal mobile numbers**, and social security numbers»
([المصدر](https://support.google.com/analytics/answer/6366371) — 2026-09-03).

> **أثر عملي حادّ:** `users.id` الرقمي عندنا مقبول. لكن **`users.phone_number` ممنوع** — وهو
> المعرّف الطبيعي في تطبيقنا (تسجيل بالهاتف + `pin_code`). أي تمرير للهاتف كـuser ID مخالفة
> صريحة لشروط Google.

### 2.2 التشغيل عبر البيئات الثلاث

**(أ) Node 20 على الخادم**

| الأداة | SDK رسمي لـNode؟ |
|---|---|
| PostHog | ✅ `posthog-node` ([المصدر](https://posthog.com/docs/libraries/node)) |
| Matomo | ❌ Node مذكور صراحةً ضمن «Other **community contributed** clients» ([المصدر](https://developer.matomo.org/guides/tracking-api-clients)). البديل السليم: نداء HTTP مباشر على Tracking API مع `uid` |
| Umami | ⚠️ عبر HTTP — `/api/send` يقبل `type: identify` ([المصدر](https://docs.umami.is/docs/api/sending-stats)) |
| Plausible | ⚠️ عبر HTTP فقط، بلا حقل هوية |
| Firebase | ❌ لا — Admin SDK لا يبثّ أحداث Analytics. البديل GA4 Measurement Protocol، وGoogle تحذّر: «The intent of the Measurement Protocol is to **augment** automatic collection … **not to replace it**» ([المصدر](https://developers.google.com/analytics/devguides/collection/protocol/ga4)) |

**(ب) المتصفّح بلا خطوة بناء**

| الأداة | ‎`<script>`‎ عادي؟ | التفصيل |
|---|---|---|
| **PostHog** | ✅ | `https://eu-assets.i.posthog.com/static/array.js`، وتثبيت الإصدار عبر `/static/1.380.0/array.js`. «Minor pins such as `/static/1.380/array.js` are currently **not** supported». **جُلب الملف فعلياً** وأعاد JS مصغّراً فيه `LIB_VERSION="1.425.1"` ([المصدر](https://posthog.com/docs/libraries/js/snippet-versioning)) |
| **Matomo** | ✅ | لا CDN خارجي أصلاً — السكربت يُخدَم من نسختك أنت: `g.src=u+'matomo.js'` |
| **Umami** | ✅ | وسم عادي بسمات `data-website-id` و`data-host-url` وغيرها ([المصدر](https://docs.umami.is/docs/tracker-configuration)) |
| **Plausible** | ✅ مبدئياً | الوثائق **لا تطبع** الرابط: «We display your snippet during the process of adding a new site» |
| **Firebase** | ⚠️ **ES modules فقط** | `import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'` ([المصدر](https://firebase.google.com/docs/web/alt-setup)) |

> **هذا فارق عملي كبير.** PostHog وMatomo وUmami تُركَّب في `web/` بسطر واحد بلا كسر قاعدة
> «لا خطوة بناء». **Firebase على الويب تحتاج ‎`<script type="module">`‎ وصيغة `import`** — وهو
> ما تمنعه قواعد `web/` حرفياً.

**(ج) Flutter**

| الأداة | الحزمة | الإصدار | الناشر | الحكم |
|---|---|---|---|---|
| PostHog | `posthog_flutter` | **5.39.0** | `posthog.com` موثّق | ✅ رسمية · `sdk: >=3.6.0 <4.0.0` — متوافقة |
| Firebase | `firebase_analytics` | **12.5.0** | `firebase.google.com` موثّق، BSD-3 | ✅ رسمية · `sdk: ^3.6.0`، `flutter: >=3.27.0` — متوافقة |
| Matomo | `matomo_tracker` | **6.1.1** | `floating-dartists.dev` — **ليس منظمة Matomo** | ⚠️ مجتمعية مصانة، تدعم `setVisitorUserId()` |
| Umami | — | — | — | ⚠️ حزم مجتمعية متعدّدة فقط |
| Plausible | — | — | — | ⚠️ حزم مجتمعية فقط (ومستبعَدة أصلاً) |

**Firebase على أندرويد خارج المتجر — ثلاث حقائق:**

- **`firebase_analytics` لا يشترط Play Services** لكنه يفقد جزءاً: «These SDKs require Google
  Play services to have _full_ functionality, but they still offer _most_ functionality even
  without». والحاشية أدقّ: «The Firebase SDK for Google Analytics can send events on **any
  device**, but some automatic insights such as demographics are only available on devices with
  Google Play services» ([المصدر](https://firebase.google.com/docs/android/android-play-services) — 2026-09-03).
- **`firebase_messaging` يشترطها فعلاً**: «FCM clients require devices … that also have Google
  Play services installed» ([المصدر](https://firebase.google.com/docs/cloud-messaging/flutter/client)).
- **التوزيع خارج المتجر لا يمنع شيئاً**: نفس الصفحة تنصّ «you are not limited to deploying your
  Android apps through Google Play Store».

### 2.3 الاستضافة الذاتية والترخيص — وهل الميزة الشخصية مجانية فعلاً؟

| الأداة | الرخصة | ذاتية؟ | الربط بالشخص في المجانية؟ |
|---|---|---|---|
| **PostHog** | **MIT Expat** لكل ما هو خارج `ee/`، و`ee/` تحت رخصتها الخاصة ([LICENSE](https://raw.githubusercontent.com/PostHog/posthog/master/LICENSE)) | ✅ ممكنة لكن **غير مدعومة رسمياً** | ✅ `identify` في الجوهر — لكن **كل مزايا الخطط المدفوعة Cloud-only** |
| **Matomo** | **GNU GPL v3** ([LICENSE](https://raw.githubusercontent.com/matomo-org/matomo/5.x-dev/LICENSE)) | ✅ On-Premise «Free forever»، «Unlimited users and hits» | ✅ `setUserId` في دليل التتبع الجوهري |
| **Umami** | **MIT** ([LICENSE](https://raw.githubusercontent.com/umami-software/umami/master/LICENSE)) | ✅ | ✅ غير موصوفة كميزة سحابية |
| **Plausible CE** | AGPLv3 حسب الوثائق (وانظر فجوة ١٣) | ✅ | ❌ الميزة غير موجودة أصلاً |
| **Firebase** | مملوك | ❌ مستحيلة | ✅ `setUserId` مجاني |

**PostHog self-hosted — ما تقوله PostHog عن منتجها، حرفياً:**

> «self-hosted deployments are **officially unsupported**, and every change, including security
> fixes, ships continuously.»
> «we don't offer any sort of guarantees around it working … you assume **all responsibility and risk**.»
> «All paid-plan features are **Cloud-only**»
> — [posthog.com/docs/self-host](https://posthog.com/docs/self-host) (2026-09-03)

وصفحة الإخلاء أوضح: «Self-hosted customers **cannot receive commercial support** from PostHog …
we cannot answer tickets and cannot help debug»، و«We're **unable to support recovery from data
loss**»، والجمهور المستهدف موصوف بأنه «hobbyists or hosting PostHog in weird and wonderful
ways». والمزايا الغائبة عن self-hosted تشمل: group analytics، data pipelines، correlation
analysis، advanced paths، lifecycle insights، extended event retention، RBAC، audit logs،
SAML/SSO، **custom data retention**
([المصدر](https://posthog.com/docs/self-host/open-source/disclaimer) — 2026-09-03).

### 2.4 التسعير السحابي (2026-09-03)

| الأداة | الطبقة المجانية | الدخول المدفوع |
|---|---|---|
| **PostHog** | **1M event/شهر**، تتجدّد شهرياً | pay-as-you-go — (فجوة ١٥) |
| **Matomo Cloud** | تجربة بلا بطاقة | **€29/شهر** لـ**50,000 hit/شهر**؛ سنوياً «2 months free» |
| **Matomo On-Premise** | «Free forever» — «Unlimited users and hits» | إضافات: Team bundle من €275/شهر حتى 5M hit |
| **Umami Cloud** | موجودة، بلا أرقام رسمية مقروءة | (فجوة ١٦) |
| **Plausible** | **لا خطة مجانية دائمة** — تجربة **٣٠ يوماً** | **Starter $9/شهر** حتى **10k pageview/شهر** |
| **Firebase Analytics** | **مجاني بالكامل** — «Analytics: No-cost» على Spark وBlaze معاً، وكذلك «Cloud Messaging (FCM): No-cost» | — |

### 2.5 إقامة البيانات

| الأداة | الموقع |
|---|---|
| **PostHog** | 🇩🇪 «PostHog Cloud EU — a managed version of PostHog that's hosted on servers based in **Frankfurt**»، وتُوصى صراحةً «If you require robust GDPR compliance» ([المصدر](https://posthog.com/docs/privacy/data-storage)) |
| **Matomo Cloud** | 🇩🇪 «hosted in **Frankfurt, Germany**» — لكن صفحة أخرى تذكر AC3 NZ / AWS New Zealand (فجوة ١٧) |
| **Umami Cloud** | ❓ (فجوة ١٨) |
| **Plausible** | 🇩🇪🇪🇺 الأقوى — «servers in **Falkenstein, Germany**, owned by Hetzner»، و«Your website data **never leaves the EU**»، والشركة مسجَّلة في إستونيا ([المصدر](https://plausible.io/privacy-focused-web-analytics)) |
| **Firebase Analytics** | 🇺🇸 عملياً، **بلا خيار إقليم** |

**Firebase — ثلاث حقائق تُقرأ معاً:**

1. Analytics خارج سياسة مواقع Firebase أصلاً: «Google Analytics is a separate service … subject
   to separate terms»، وليست مدرجة لا ضمن الخدمات US-only ولا ضمن Global
   ([المصدر](https://firebase.google.com/support/privacy)).
2. «Analytics reporting location» **ليست** مقرّ بيانات: «Your Analytics reporting location does
   _not_ affect where Google may process and store customer data for Firebase»
   ([المصدر](https://firebase.google.com/docs/projects/locations)).
3. ما يوجد فعلاً هو **جمع** إقليمي لا **تخزين** إقليمي: «Google Analytics collects all data from
   EU, Switzerland, or UK-based devices … through domains and on servers based in the EU …
   **before forwarding traffic to Analytics servers for processing**»
   ([المصدر](https://support.google.com/analytics/answer/12017362)).

> **لا يوجد اختيار إقليم تخزين لبيانات Firebase/GA4.** هذا الفارق الأوضح بينها وبين
> PostHog EU / Matomo / Plausible — وهو **البند الأثقل قانونياً** في §4.5.

### 2.6 Firebase وعلاقتها بـ#19 (FCM)

**هل هما منفصلان؟ نعم** — `firebase_messaging` و`firebase_analytics` حزمتان مستقلّتان، ولا شيء
في وثائق FCM لـFlutter يشترط إضافة Analytics.

**لكن هناك تفاعل موثَّق في الاتجاه المعاكس:** إن كانت Analytics موجودة يبدأ FCM بتسجيل أحداث
تلقائياً بلا كود منّا — `notification_open` · `notification_receive` (Android only) ·
`notification_foreground` · `notification_dismiss`، مع معاملات `message_id` و`topic` و`label`
([المصدر](https://support.google.com/firebase/answer/9234069) — 2026-09-03).

**ما يعنيه هذا:**

1. قرار الإشعارات **لا يقيّد** قرار التحليلات — يمكن أخذ FCM لـ#19 واختيار PostHog أو Matomo
   أو Umami للتحليلات.
2. لكن العكس فيه مكسب مجاني: إضافة `firebase_analytics` تعطي قياس فعالية الإشعارات بلا سطر
   كود — وهو بالضبط ما سنحتاجه لقياس «إعلان وتذكير المناسبة».
3. الثمن: بيانات تُعالَج خارج EU بلا خيار إقليم، وقيدُ ألّا يحمل `user_id` هاتفاً.
4. **وقيد الويب يبقى قائماً:** `web/` لا تستطيع Firebase JS SDK بلا `import`. أي أننا ننتهي
   بأداتين مختلفتين للمنصّتين — **وهذا يكسر وحدة «ما فعله هذا الشخص» عبر الويب والموبايل، وهي
   عين ما طلبه صاحب المنتج.**

---

## 3. الاستضافة الذاتية مقابل SaaS — الكلفة على صندوقنا

### 3.1 المجهول الذي يجب رفعه أوّلاً

> **فجوة تشغيلية أساسية:** لا نعرف مواصفات الـVPS فعلياً — لا الـRAM ولا عدد الـvCPU ولا
> المساحة الحرّة. **قبل أي قرار يجب تشغيل `free -h` و`nproc` و`df -h` على الخادم.** كل ما
> يلي مقارنة بين أرقام منشورة من المشاريع نفسها وبين VPS صغير نموذجي (2–4 GB)، ولم تُخمَّن
> أرقام صندوقنا.

### 3.2 جدول المقارنة

| المرشّح | الحد الأدنى المنشور | خدمات compose | التبعيات الثقيلة | يشارك صندوقنا؟ |
|---|---|---|---|---|
| **Sentry self-hosted** | **4 cores · 16 GB RAM + 16 GB swap · 20 GB disk** | **54–56** | Kafka · ClickHouse · Postgres · Redis · Memcached · SeaweedFS · Snuba (٢١ consumer) · Relay · Symbolicator | ❌ **مستحيل** |
| **PostHog self-hosted** | **4 vCPU · 16 GB RAM · >30 GB** | **35** | ClickHouse · Kafka · Zookeeper · Postgres · Redis · MinIO · Elasticsearch · Temporal · **Browserless (Chromium)** | ❌ **مستحيل** |
| **Plausible CE** | «At least **2 GB of RAM** is recommended» · CPU يدعم **SSE 4.2 أو NEON** | **٣** | ClickHouse + Postgres | ⚠️ ممكن على ≥4 GB |
| **Matomo** | 2 GB RAM · 50 GB SSD عند 100k pageview/شهر · 8 GB عند مليون | حاوية PHP + قاعدة | **MySQL/MariaDB — موجودة عندنا** | ✅ **الأخفّ عملياً** |
| **Umami** | Node **18.18+** · PostgreSQL **v12.14+** (بلا حدّ RAM منشور — فجوة ٢١) | **٢** | Postgres **إضافي** | ✅ نعم |
| **GlitchTip** | **512 MB** موصى · **256 MB** حدّ أدنى | **٣** | Postgres · Valkey **اختياري** | ✅ نعم |

المصادر: [Sentry](https://develop.sentry.dev/self-hosted/) ·
[PostHog](https://posthog.com/docs/self-host) ·
[`docker-compose.hobby.yml`](https://raw.githubusercontent.com/PostHog/posthog/master/docker-compose.hobby.yml) ·
[Plausible CE](https://github.com/plausible/community-edition) ·
[`compose.yml` v3.0.1](https://raw.githubusercontent.com/plausible/community-edition/v3.0.1/compose.yml) ·
[متطلّبات Matomo](https://matomo.org/faq/on-premise/matomo-requirements/) ·
[تثبيت Umami](https://docs.umami.is/docs/install) ·
[تثبيت GlitchTip](https://glitchtip.com/documentation/install/) — كلها 2026-09-03.

### 3.3 قراءات لا تحتمل الالتباس

**من لا يستطيع مشاركة صندوقنا — بأرقامه المنشورة وحدها، قبل حساب MySQL وNode وnginx:**

- **Sentry self-hosted**: 16 GB RAM + 16 GB swap و**أكثر من ٥٠ حاوية**. البنية المطلوبة
  لمراقبة المشروع **أضخم من المشروع نفسه** (‏~1,300 سطر خادم + ~1,500 سطر واجهة). ويُضاف
  عبء «hard stops» المتتالية في كل ترقية (§1.5).
- **PostHog self-hosted**: 16 GB RAM و٣٥ حاوية فيها ClickHouse وKafka وZookeeper
  وElasticsearch وChromium. وحتى لو توفّرت الموارد فإن PostHog نفسها تقول «officially
  unsupported» و«unable to support recovery from data loss». **المخاطرة تشغيلية لا مادية.**

**حدّيّ:** Plausible CE — 2 GB موصاة لـClickHouse وحده فوق ما لدينا، وشرط SSE 4.2 يستحق
التحقّق على معالج الـVPS. (ومستبعد أصلاً لعجزه عن الربط بشخص.)

**آمنة:** **Matomo** — والميزة البنيوية عندنا أنها **المرشّح الوحيد الذي يعمل على MySQL 8
الموجودة أصلاً**: لا ClickHouse، لا Kafka، لا Postgres ثانية؛ الإضافة الصافية حاوية PHP واحدة.
· **Umami** — حاويتان، **لكن تكلفتها الحقيقية محرّك Postgres ثانٍ بجانب MySQL**، لا حاوية
التطبيق. · **GlitchTip** — ٥١٢ MB موصاة، ويمكن تشغيله **بحاويتين** بتعطيل Valkey.

### 3.4 ما تلغيه الاستضافة الذاتية — وما لا تلغيه

الاستضافة الذاتية **تُلغي نقل البيانات لمعالج أجنبي**، وهو أثقل بند قانوني في §4.5. لكن يجب
تسجيل ثلاثة قيود مقابلة:

1. **لا تُلغي واجبات تيقون ١٣ الأخرى.** الإشعار (م.11)، وحق الاطّلاع (م.13)، وحقّ التصحيح
   (م.14)، ومسألة الممונה (م.17ב1) — كلّها قائمة سواء استُضيفت الأداة عندنا أو عند غيرنا.
   الاستضافة الذاتية تحلّ **بنداً واحداً** من ستة.
2. **تنقل عبء الأمان إلينا.** الأداة المستضافة ذاتياً تصير جزءاً من مسؤوليتنا تحت
   تקנות אבטחת מידע 2017، ورمز الوصول إليها يصير سطح هجوم جديداً على نفس الصندوق الذي يحمل
   قاعدة البيانات.
3. **تُدخل التزام ترقية دائماً.** موثَّقاً وقاسياً عند Sentry (hard stops)، وغير موثَّق أصلاً
   عند GlitchTip (فجوة ١٠) — والثاني ليس أفضل، بل أقلّ وضوحاً.

---

## 4. 🔑 تيقون ١٣ — ما يفرضه بالضبط على قياس مربوط بالشخص

> **مصدر هذا القسم كلّه:** نصّ **חוק הגנת הפרטיות (תיקון מס' 13), התשפ"ד-2024** كما نُشر في
> **ספר החוקים 3287** بتاريخ 14/08/2024، مستخرَجاً حرفياً من
> [`fs.knesset.gov.il/25/law/25_lsr_4810658.pdf`](https://fs.knesset.gov.il/25/law/25_lsr_4810658.pdf)،
> و**النוסח המשולב** الرسمي للقانون من
> [`fs.knesset.gov.il/25/law/25_ls_bk_4704176.pdf`](https://fs.knesset.gov.il/25/law/25_ls_bk_4704176.pdf).
> كلاهما قُرئ 2026-09-03. **ولم يُبنَ أي ادّعاء هنا على ملخّص أو مدوّنة.**

### 4.0 التاريخ

المادة 74(א): «**תחילתו של חוק זה שנה מיום פרסומו** (להלן - יום התחילה)». والنشر
14/08/2024 ⇒ **يوم النفاذ 14/08/2025**. القانون نافذ اليوم بالكامل (باستثناء مهلة ثلاث سنوات
لمאגרי משטרת ישראל).

### 4.1 التعاريف التي تجعل قياسنا داخل القانون بلا جدال

**«מידע אישי»** (م.7 بعد التعديل) — التعريف الجديد:

> «נתון הנוגע לאדם מזוהה או לאדם הניתן לזיהוי; … "אדם הניתן לזיהוי" - מי שניתן לזהותו במאמץ
> סביר, במישרין או בעקיפין, ובכלל זה באמצעות פרט מזהה, כגון שם, מספר זהות, מזהה ביומטרי,
> **נתוני מיקום, מזהה מקוון**, או נתון אחד או יותר הנוגע למצבו הפיזי, הבריאותי, הכלכלי,
> **החברתי** או התרבותי»

**«עיבוד», «שימוש»** — التعريف واسع بقصد:

> «כל פעולה שמבוצעת על מידע אישי, לרבות **קבלתו, איסופו, אחסונו, העתקתו, עיון בו, גילויו,
> חשיפתו, העברתו, מסירתו או מתן גישה אליו**»

**«מאגר מידע»** — التعريف الجديد:

> «אוסף פרטי מידע אישי **המעובד באמצעי דיגיטלי**, למעט: (1) אוסף לשימוש אישי שאינו למטרות
> עסק; (2) אוסף הכולל **רק שם, מען ודרכי התקשרות**, לגבי 100,000 בני אדם או פחות, שאינו מלמד
> כשלעצמו על מידע אישי נוסף …»

> **الاستنتاج الذي لا مهرب منه:** استثناء الـ100,000 لا ينطبق علينا إطلاقاً — لأنه مشروط
> بألّا يحوي الجمع **إلا** اسماً وعنواناً ووسيلة تواصل. جدول `users` عندنا يحمل `clan_town`
> و`role`، و`nokoot_ledger` يحمل مبالغ، و`story_views` يحمل سلوكاً. **قاعدة بياناتنا
> «מאגר מידע» بلا جدال، ومعالجتها «עיבוד» بلا جدال.**

**«מידע בעל רגישות מיוחדת»** — اثنتا عشرة فئة، ثلاث منها تمسّنا مباشرةً:

| الفقرة | النصّ | لماذا تمسّنا |
|---|---|---|
| (1) | «מידע אישי על **צנעת חיי המשפחה** של אדם» | العرس والخطوبة والعزاء **هي** شؤون حياة أسرية بالتعريف |
| (7) | «מידע אישי על אודות **דעותיו הפוליטיות או אמונותיו הדתיות** של אדם או השקפת עולמו» | نوع مناسبة **«حج وعمرة»** موجود في `occasion_types` المزروعة. سجلٌّ يقول «فلان تصفّح/تفاعل مع مناسبات حج» يستدلّ على معتقد ديني |
| (10) | «מידע אישי על **נתוני שכר** של אדם ועל **פעילותו הפיננסית**» | `nokoot_ledger` سجلّ مالي شخصي بمبالغ |

> **هذه أخطر نتيجة في البحث كلّه.** قياسٌ سلوكي مربوط بالشخص ومبوَّب حسب نوع المناسبة **قد
> يُنتج مידע בעל רגישות מיוחדת بحكم البنية لا بحكم النية.** وأثر ذلك مضاعِف: الغرامات تتضاعف
> (§4.6)، ومستوى الأمان يرتفع إلى «בינונית» على الأقل (§4.7)، وعتبة الإخطار للسلطة تصير
> ذات صلة (§4.4).

**فجوة:** لم أجد رأياً رسمياً للسلطة يحسم ما إذا كان **نوع المناسبة** وحده كافياً ليصير
سجلّ التفاعل «מידע על אמונותיו הדתיות». المنطق أعلاه **قراءتنا للنصّ**، لا نصّ السلطة.

### 4.2 المسوّغ القانوني والغرض — م.8

المادة 8 استُبدلت بالكامل («ניהול מאגר מידע ועיבוד חוקי של מידע אישי»):

> **8(ב)** «לא יעבד אדם מידע אישי במאגר מידע אלא **למטרת המאגר שנקבעה לו כדין**.»
> **8(ג)** «לא יעבד אדם מידע אישי ממאגר מידע **ללא הרשאה** מאת בעל השליטה במאגר המידע או
> בחריגה מהרשאה כאמור.»
> **8(ד)(1)** «בעל שליטה … לא יעבד מידע אישי … אם המידע האישי הכלול במאגר המידע **נוצר,
> התקבל, נצבר או נאסף בניגוד להוראות חוק זה** או להוראות כל דין אחר …»

> **ما يعنيه هذا عملياً:** القانون الإسرائيلي **لا يعدّد مسوّغات معالجة** على نمط م.6 من
> الـGDPR. ما يفرضه هو **تحديد غرض** والالتزام به. أي أن السؤال الصحيح لتذكرة القرار ليس
> «ما مسوّغنا؟» بل **«ما الغرض المعلَن لقاعدة البيانات، وهل القياس السلوكي داخله؟»** —
> والمعالجة خارج الغرض هي أغلى مخالفة في جدول الغرامات (§4.6).

**فجوة:** لم أعثر على تعريف قانوني لكيفية «تحديد الغرض كدين» (‏`שנקבעה לו כדין`) لجهة خاصة
غير ملزَمة بالتسجيل — أي أين يُكتب الغرض ومن يعتمده. النصّ يفترض وجوده ولا يصفه.

### 4.3 🔑 إشعار الخصوصية — م.11، وهذا أوضح واجب مباشر علينا

النصّ الكامل بعد التعديل (من النوסח המשולב، والإضافات التي جاء بها تيقون ١٣ **بالغامق**):

> **11. חובת מבקש מידע**
> (א) פניה לאדם לקבלת מידע אישי לשם **עיבודו** במאגר מידע תלווה בהודעה שיצוינו בה –
> (1) אם חלה על אותו אדם חובה חוקית למסור את המידע, או שמסירת המידע תלויה ברצונו ובהסכמתו
> **ומהי תוצאת אי-ההסכמה**;
> (2) המטרה אשר לשמה מבוקש המידע;
> **(2א) שמו של בעל השליטה במאגר המידע, ודרכי ההתקשרות עמו;**
> (3) למי יימסר המידע ומטרות המסירה;
> **(4) קיומן של זכות עיון במידע האישי לפי סעיף 13 ושל זכות לבקש תיקון של המידע האישי לפי
> סעיף 14.**

> **خمسة بنود يجب أن تظهر في شاشة التسجيل عندنا** (ولا شيء منها موجود اليوم): هل الإدلاء
> إلزامي أم طوعي **وماذا يحدث إن رفض** · الغرض · **اسم مالك السيطرة ووسيلة التواصل معه** ·
> لمن يُسلَّم المعلومات ولأي غرض (**وهنا يدخل مزوّد القياس صراحةً**) · **وجود حقّ الاطّلاع
> وحقّ طلب التصحيح**.

### 4.4 حقوق الشخص — الاطّلاع والتصحيح، ولا حقّ محو عام

**م.13 — זכות עיון:** «כל אדם זכאי לעיין בעצמו … במידע האישי שעליו המוחזק במאגר מידע»،
و**م.13(ב)** فيها تفصيل يمسّنا مباشرةً:

> «בעל שליטה במאגר מידע יאפשר עיון במידע האישי … **בשפה העברית, הערבית או האנגלית**.»

> **ملاحظة عملية لواجهة عربية بالكامل:** القانون يعترف بالعربية صراحةً كلغة لممارسة حقّ
> الاطّلاع. آلية اطّلاع بالعربية ليست مقبولة فحسب، بل هي المتوقَّع لجمهورنا.

**م.14 — تصحيح ومحو، لكن مقيَّدين:** «אדם **שעיין** במידע האישי שעליו **ומצא כי אינו נכון,
שלם, ברור או מעודכן**, רשאי לפנות … בבקשה **לתקן** את המידע האישי **או למוחקו**.»

> **قراءة حاسمة:** حقّ المحو في القانون الإسرائيلي **ليس** «right to erasure» على نمط م.17
> من الـGDPR. إنه فرع من **تصحيح الخطأ**: يُمحى ما هو غير صحيح أو ناقص أو غير واضح أو غير
> محدَّث — لا ما هو صحيح لكن الشخص لم يعد يريده. **سجلّ سلوكي دقيق لا يوجد نصّ عام يوجب
> محوه بطلب الشخص.**
>
> والاستثناء الوحيد الذي وجدتُه هو حقّ محو حقيقي، لكنه **لا يسري إلا على مידע منقول إلى
> إسرائيل من المنطقة الاقتصادية الأوروبية** بموجب
> **תקנות הגנת הפרטיות (הוראות לעניין מידע שהועבר לישראל מהאזור הכלכלי האירופי), התשפ"ג-2023**
> (التوספת הרביعة من تيقون ١٣ تفرض غرامات على خرقه). **بياناتنا ليست منقولة من الـEEA، فلا
> يسري.**

**التسجيل (م.8א):** التسجيل في السجلّ إلزامي فقط إذا كان **الغرض الرئيسي جمعُ المعلومات
لتسليمها للغير كدرך عيسوق أو بمقابل** وفيه أكثر من **10,000** شخص، أو كان المالك جهة عامة.
**لا ينطبق علينا.**

**الإخطار (م.8א(ب)):** إن تجاوز **عدد الأشخاص الذين لديهم מידע בעל רגישות מיוחדת في مאגר غير
مسجَّل مئة ألف (100,000)** وجب إخطار السلطة خلال ٣٠ يوماً بهوية المالك وعنوانه ووسيلة التواصل
وهوية الممונה (إن لزم تعيينه) **وتسليم نسخة من `מסמך הגדרות המאגר`**.

**فجوة:** لا نعرف عدد صفوف `users` في الإنتاج، فلا يمكن الجزم بموقعنا من عتبة الـ100,000.
يُحسم بعدّ واحد على قاعدة الإنتاج.

### 4.5 🔑 الممונה על הגנת הפרטיות — وهذا البند الذي يغيّر القرار

المادة **17ב1(א)** تعدّد الملزَمين بالتعيين، والفقرة **(3)** هي التي تمسّ قياساً سلوكياً:

> «(3) **בעל שליטה במאגר מידע או מחזיק במאגר מידע שעיסוקיו העיקריים כוללים פעולות עיבוד מידע
> או כרוכים בפעולות כאמור, אשר נוכח טיבן, היקפן או מטרתן מחייבות ניטור שוטף ושיטתי של בני
> אדם, ובכלל זה מעקב או התחקות שיטתית אחר התנהגותו, מיקומו או פעולותיו של אדם, בהיקף ניכר** …»

و**17ב1(ב)** تعطي معايير «היקף ניכר» حرفياً:

> «עיבוד מידע בהיקף ניכר יהיה בין השאר בשים לב **למספר בני האדם** שמידע מעובד לגביהם,
> **לשיעורם באוכלוסייה מסוימת**, **להיקף המידע**, לכמותו ולטווח של סוגי המידע המעובד,
> **למשך ולתדירות** של פעולות העיבוד, **למשך שמירת המידע** ולתחום הגאוגרפי של פעולות העיבוד.»

> **ثلاث قراءات يجب أن تُقال بوضوح:**
>
> 1. **«מעקب או התחקות שיטתית אחר התנהגותו … של אדם» هو التوصيف الحرفي لما طلبه صاحب
>    المنتج.** لا يحتاج البند إلى تأويل ليصل إلينا.
> 2. **«שיעורם באוכלוסייה מסוימת» معيار صريح.** جمهورنا مجتمع محدَّد جغرافياً وسكانياً
>    (ثماني قيم في `TOWNS`). **عدد مطلق صغير يمكن أن يكون نسبة كبيرة من سكّان محدَّدين** —
>    وهذا يعمل ضدّنا لا لصالحنا، ولا يشبه حساب شركة عالمية بمليون مستخدم موزّعين.
> 3. **«משך שמירת המידע» معيار صريح أيضاً.** أي أن **قرار الاحتفاظ (§6) يغذّي مباشرةً سؤال
>    الممונه** — القراران في #41 و#42 مترابطان لا مستقلّان.
>
> **لكن الشرط المقيِّد هو `עיסוקיו העיקריים`** — «أعماله الرئيسية». منصّة مناسبات ليست عملها
> الرئيسي معالجة البيانات أو الرصد؛ عملها نشر المناسبات. **هذا هو الحدّ الفاصل، وهو تقدير لا
> يحسمه النصّ وحده.**

**فجوة (الأهمّ في هذا القسم):** الهيئة الإسرائيلية لحماية الخصوصية نشرت **גילוי דעת מחייב
בעניין מינוי ממונה על הגנת הפרטיות** (نسخة 23/07/2025 وأخرى محدَّثة 14/07/2026)، وهي المصدر
الذي **يفسّر رسمياً** «ניטור שוטף ושיטתי» و«היקף ניכר» ويعطي أمثلة السلطة نفسها. **لم أستطع
سحب أي منشور من `gov.il`**: `WebFetch` أعاد **403** على كل صفحة وكل رابط PDF مباشر
(‏`/BlobFolder/legalinfo/amendment-13-26-07-26/he/media_06-07-26.pdf` ·
`/BlobFolder/reports/guide_tikon13_professional/he/tikun 13 _170825.pdf` ·
`/he/pages/guide_tikon13_professional`)، و`curl` بترويسة متصفّح أعاد 403 كذلك، والمتصفّح
الحقيقي واجه صفحة تحقّق آلي («Performing security verification») **ولم أحاول تجاوزها**. أي
أن **تفسير السلطة الرسمي غائب عن هذا الملف بالكامل**، وكل ما في §4 هو نصّ القانون وحده.
**هذه الفجوة يجب سدّها بقراءة بشرية للمستندين قبل حسم #42.**

### 4.6 نقل البيانات خارج البلاد

الأداة الحاكمة هي **תקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה),
התשס"א-2001** — وتيقون ١٣ **لم يستبدلها**. القاعدة الأساسية (תקנה 1) منع عام مع شرط كفاية:

> «לא יעביר אדם מידע ולא יאפשר העברה של מידע ממאגר מידע בישראל אל מחוץ לגבולותיה, אלא אם כן
> **דין המדינה שאליה מועבר המידע מבטיח רמת הגנה** … **שאינה פחותה** … מרמת ההגנה … בדין
> הישראלי.»

و**תקנה 2** تعدّد استثناءات، أبرزها لحالتنا: **(1)** موافقة الشخص · **(4)** التزام المتلقّي
بالحفاظ على شروط الحيازة والاستخدام السارية على مאגר في إسرائيل · **(8)** النقل إلى دول
أوروبية معيَّنة. و**תקנה 3** تشترط **التزاماً خطّياً من المتلقّي** يمنع نقلاً لاحقاً.

> **الأثر المباشر على §1 و§2:**
> - **الاستضافة الذاتية على صندوقنا تُسقط هذا البند كلّه** — لا نقل، فلا سؤال.
> - **SaaS في الاتحاد الأوروبي (Sentry EU · PostHog EU · Matomo Cloud · Plausible)** أسهل
>   مساراً عبر תקנה 2(8) و2(4) مع DPA.
> - **SaaS أمريكي بلا خيار إقليم — Rollbar وBugsnag وFirebase/GA4 — يقع في قلب البند.**
>   ولا يُنسى أن **Sentry EU نفسها تُبقي الحسابات ورموز الوصول وسجلّات التدقيق في الولايات
>   المتحدة** (§1.9)، فـ«EU» عندها ليست مطلقة.

**فجوة:** نصّ תקנות 2001 قُرئ من **transcription على `nevo.co.il`**، لا من `רשומות` الرسمية
(ק"ת 6120). المعنى مطابق لما ورد في المراجع، لكن **الاقتباسات أعلاه ليست من مصدر رسمي** —
وسمتُها كذلك عمداً.

**فجوة:** لم أتحقّق من قائمة الدول في תקנה 2(8) ولا مما إذا كانت תקנות 2001 عُدِّلت بعد تيقون
١٣؛ صفحة `nevo` مؤرّخة 18/09/2023 ولا تعرض ملاحظات تعديل.

### 4.7 الغرامات — الأرقام حرفياً من نصّ التعديل

المادة **23כ** تُدرج العقوبات الإدارية، وهذه هي المسارات التي تمسّ قياساً سلوكياً:

| البند | المخالفة | المبلغ |
|---|---|---|
| **23כ(ג)(1)(א)** | **عدم تسليم إشعار م.11** | **50 ₪ × عدد الأشخاص** المُتوجَّه إليهم · **100 ₪ × العدد** إن كان الطلب يخصّ **מידע בעל רגישות מיוחדת** |
| 23כ(ג)(2) | أرضية البند أعلاه | إن قلّ المحسوب عن 30,000 ₪ جاز فرض **30,000 ₪** |
| **23כ(ד)(1)(א)** | إشعار م.11 حين تكون الدعوة موجَّهة إلى **مجموعة غير معيَّنة** | **2 ₪ لكل شخص** في المאגר · **4 ₪** إن كان المعلومات حسّاسة |
| 23כ(ד)(1)(ב) | عدم تعيين **ממונה על אבטחת מידע** (م.17ב(א)) | نفس المقياس |
| 23כ(ד)(1)(ג) | عدم تعيين **ממונה על הגנת הפרטיות** — **بموجب 17ב1(א)(1) أو (2) فقط** | نفس المقياس |
| 23כ(ד)(3) | أرضية البند أعلاه | **20,000 ₪** · **40,000 ₪** للحسّاس |
| **23כ(ה)(1)(ב)** | **معالجة لغرض غير قانوني، خلافاً لـم.8(ב)** | **4 ₪ لكل شخص** · **8 ₪** للحسّاس |
| 23כ(ה)(2) | أرضية البند أعلاه | إن قلّ المحسوب عن 200,000 ₪ جاز فرض **200,000 ₪** |
| 23כ(ב) | رفض الاطّلاع (م.13) · عدم تنفيذ التصحيح (م.14(ב)) · عدم إبلاغ الرفض (م.14(ג)) | **15,000 ₪** |
| 23כ(א) | مخالفات التسجيل | **150,000 ₪**، ويُضاعَف إن حمل المאגר معلومات عن **مليون شخص فأكثر** |

**وتفصيل يستحق التسجيل:** غرامة عدم تعيين الممونה في **23כ(ד)(1)(ג)** تحيل إلى
**17ב1(א)(1) و(2) فقط** — أي الجهات العامة وتجّار البيانات. أما فقرتا **(3) الرصد المنهجي**
و**(4) الحساسية بحجم كبير** فلا غرامة مباشرة عليهما؛ **الإنفاذ عليهما يمرّ بأمر إيقاف مخالفة
(23כה) ثم غرامة على عدم الامتثال للأمر** (23כ(ד)(1)(ו))، وللوزير أن يوسّع ذلك بأمر
(23כ(ד)(1)(ז)).

> أي أن **مسار الإنفاذ على «الرصد المنهجي» تدرّجي لا فوري** — لكن النهاية واحدة، والفرق مهلة
> لا حصانة.

**وعلاوة على الغرامات الإدارية: تعويضات مثالية بلا إثبات ضرر.** المادة **15א** تجيز للمحكمة
قضاء **حتى 10,000 ₪** بلا ضرر، ومن بين الحالات المُدرجة: **عدم تسليم إشعار م.11** (بشرط أن
يكون الشخص طالب ذلك ومضت **٣٠ يوماً**)، وعدم إتاحة الاطّلاع (م.13)، وعدم تنفيذ تصحيح أو محو
وافق عليه المالك.

### 4.8 أمن المعلومات — مستوى المאגר

تיקון ١٣ يبقي **תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017** ويربط بها جدول غرامات
(التוספת השלישית). التصنيف المعرَّف في نفس الملحق:

- **רמת האבטחה הבסיסית** — من بين شروطها ألّا يحوي المאגר مידע בעל רגישות מיוחדת (إلّا في
  حالات مُستثناة ضيّقة).
- **רמת האבטחה הבינונית** — يكفي لبلوغها أن **«המאגר כולל מידע בעל רגישות מיוחדת»**.
- **רמת האבטחה הגבוהה** — إذا زاد عدد أصحاب الصلاحيات على **100** أو حوى معلومات عن
  **100,000 شخص فأكثر**.

> **الرابط المباشر مع §4.1:** إن قُرئ سجلّ سلوكي مبوَّب حسب نوع المناسبة على أنه مידע
> בעל רגישות מיוחדת، ارتفع مستوى الأمان الواجب من «بسيط» إلى «متوسّط» بحكم البنية — بكل ما
> يستتبعه من نظام أمان مكتوب ومراجعات دورية.

**فجوة:** لم أقرأ نصّ תקנות אבטחת מידע 2017 نفسه (الالتزامات التفصيلية لكل مستوى، ودورية
المراجعة، وواجب الإبلاغ عن «אירוע אבטחה חמור»). ما أعلاه من **التوספת השלישית لتيقون ١٣**
التي تعرّف المستويات لأغراض الغرامة فقط.

---

## 5. متجر Play — هل يسقط الالتزام فعلاً؟

### 5.1 إعلان «Data safety» — يسقط، والنصّ صريح

> «**All developers that have an app published on Google Play** must complete the Data safety
> form, including apps on closed, open, or production testing tracks.»
> — [support.google.com/googleplay/android-developer/answer/10787469](https://support.google.com/googleplay/android-developer/answer/10787469) (2026-09-03)

نحن نوزّع APK خارج المتجر ([ADR-0004](../adr/0004-self-hosted-app-updates.md))، فلا تطبيق
منشور على Google Play ⇒ **لا نموذج Data safety.** والصفحة **لا تتناول** التطبيقات الموزَّعة
خارج المتجر إطلاقاً.

للسجلّ، لو انضممنا يوماً فما كان سيلزمنا الإعلان عنه يشمل مكتبات الطرف الثالث صراحةً: «This
includes data collected and handled through **any third-party libraries or SDKs** used in their
apps»، مع تمييز «Collection» («Transmitting data from your app off a user's device») عن
«Sharing» («Transferring user data collected from your app to a third party»).

### 5.2 لكن شيئاً آخر **يحلّ محلّه فعلاً** — وهذا الجواب الحقيقي للسؤال

Google أعلنت **Android developer verification**، ونطاقها ليس المتجر:

> **الأجهزة:** «certified devices running Android 7+»
> **التطبيقات المشمولة:** التطبيقات من المتاجر المشاركة **وكذلك التطبيقات الموزَّعة خارج
> Google Play، بما فيها APK المثبَّت يدوياً (sideloaded)**
> **الجدول:** أغسطس 2026 — إطلاق واجهات المطوّرين وحسابات التوزيع المحدود ومسار «power user»
> · **30 سبتمبر 2026** — الموعد الإقليمي في البرازيل وإندونيسيا وسنغافورة وتايلند ·
> «**In 2027, we'll expand this globally to all apps on certified devices.**»
> — [developer.android.com/developer-verification](https://developer.android.com/developer-verification) (2026-09-03)

> **الجواب الدقيق على سؤال التذكرة:** **نعم، التزام Data safety يسقط. ولا، الأمر ليس صافي
> ربح.** ما يسقط هو إفصاح خصوصية أمام المستخدم؛ وما يحلّ محلّه شيء مختلف الطبيعة تماماً —
> **متطلَّب هوية للمطوّر يفرضه Google على قناة التوزيع نفسها التي بُني عليها ADR-0004.**
> إسرائيل ليست ضمن الموجة الأولى، لكن «globally in 2027» يجعله قيداً على أفق ADR-0004 لا
> على هذا البحث. **وهو يخصّ #34 لا #41/#42** — يُسجَّل هنا ولا يُبتّ فيه.

**فجوة:** الصفحة **لا تعرّف** «certified Android device» صراحةً، ولا تنصّ صراحةً على ما يحدث
لتطبيق مطوّر غير موثَّق (تذكر فقط وجود «advanced flow» يتيح للـ«power users» تثبيت تطبيقات
غير موثَّقة).

**فجوة:** لم أجد تاريخاً معلَناً لإسرائيل تحديداً ضمن التوسّع العالمي.

### 5.3 ما يحلّ محلّ إعلان المتجر قانونياً

بديل الإعلان **ليس فراغاً**، بل **م.11 من قانون حماية الخصوصية** (§4.3): البند (3) «למי יימסר
המידע ומטרות המסירה» يفرض تسمية مزوّد القياس والغرض — وهو مضمون أقرب لما يطلبه نموذج Data
safety، لكن سنده قانون الدولة لا سياسة متجر، وجزاؤه غرامة إدارية (§4.7) لا رفض نشر.

**وطبقة ثالثة تعاقدية تسري بغضّ النظر عن قناة التوزيع:** لو تبنّينا Firebase أو GA4، فإن
شروط Google Analytics تسري علينا كعقد — ومنها حظر رفع PII (§2.1) — **بلا أي علاقة بكوننا على
المتجر أو خارجه**.

---

## 6. الاحتفاظ — كم يبقى الحدث المربوط بالشخص

### 6.1 الحدّ القانوني الإسرائيلي

**لا يوجد سقف زمني رقمي في القانون.** ما يوجد ثلاثة قيود غير مباشرة:

1. **الغرض هو السقف (م.8(ב)).** الاحتفاظ بعد انتهاء الغرض معالجة خارج الغرض، وجزاؤها أغلى
   بند في جدول الغرامات — 4 ₪/شخص (8 ₪ للحسّاس) بأرضية **200,000 ₪** (§4.7).
2. **مدّة الاحتفاظ معيار صريح لواجب الممونה** — «**למשך שמירת המידע**» ضمن معايير «היקף ניכר»
   في م.17ב1(ב). **الاحتفاظ الأطول يقرّبنا من واجب التعيين، والأقصر يبعدنا عنه.**
3. **قاعدة تقليل صريحة موجودة — لكنها لا تسري علينا.** תקנה 4(א) من
   **תקנות … מידע שהועבר לישראל מהאזור הכלכלי האירופי, התשפ"ג-2023** توجب تفعيل «מנגנון
   ארגוני, טכנולוגי או אחר» يضمن ألّا يُحتفظ بـ«מידע שאינו נחוץ עוד למטרה שלשמה נאסף»،
   وغرامتها في التוספת הרביעית 2 ₪/شخص (4 ₪ للحسّاس) بأرضية 20,000/40,000 ₪.
   **وهي تسري على المعلومات المنقولة إلى إسرائيل من الـEEA فقط.**

> **الخلاصة القانونية:** **مدّة الاحتفاظ قرارنا، لكنها ليست حرّة.** يجب أن تكون **مبرَّرة
> بالغرض ومكتوبة**، لأنها في آن واحد دفاعنا أمام م.8(ב) وأحد معايير م.17ב1(ב).

**فجوة:** الهيئة الإسرائيلية لحماية الخصوصية لديها منشورات عن الاحتفاظ والمحو، ولم أستطع
الوصول إلى أيٍّ منها (‏`gov.il` يعيد 403 — انظر فجوة §4.5). **العرف الإسرائيلي المنشور غائب
عن هذا الملف.**

### 6.2 الاحتفاظ عند المزوّدين

| الأداة | الاحتفاظ | التحكّم |
|---|---|---|
| **Sentry SaaS** | «30-day lookback» على الطبقة المجانية | (فجوة ٢٢ — لم أجد جدول احتفاظ لكل خطة) |
| **Rollbar** | **٣٠ يوماً** مجاناً · 90 يوماً Essentials · 180 يوماً Advanced | حسب الخطة |
| **Bugsnag** | **٧ أيام** مجاناً · 60 يوماً في Select/Preferred | حسب الخطة |
| **GlitchTip** | (فجوة ٧ — غير منشور) | — |
| **PostHog** | **custom data retention مذكورة صراحةً ضمن ما هو غير متاح في self-hosted** | Cloud فقط |
| **Matomo** | «Regularly delete old raw data» في **Administration > Privacy > Anonymize Data**، «Delete logs older than N days» | تحكّم كامل بأيامٍ نختارها |
| **Firebase / GA4** | **مستوى المستخدم: شهران أو 14 شهراً فقط** · مستوى الحدث: شهران أو 14 شهراً (والمدد الأطول 360 فقط) | إعداد على الخاصية |

**تفصيلان يقلبان القراءة الساذجة:**

**Matomo — الحذف لا يحذف كل شيء.** الوثائق صريحة: «**Only the raw logs** of activity will be
deleted from the database» بينما «**all historical reports**» تبقى — تُحذف جداول `matomo_log_*`
وتبقى التقارير المجمَّعة الأرشيفية
([المصدر](https://matomo.org/faq/troubleshooting/faq_42/) — 2026-09-03).

> **أي أن حذف السجلّات الخام لا يُرضي طلب محو من شخص إلّا جزئياً** — ما يبقى مجمَّع لا يُعرَّف
> به فرد، لكنه يبقى.

**GA4 — «Reset user data on new activity» يبطل الاحتفاظ عملياً.** الإعداد «reset[s] the
retention period of the user identifier with each new event from that user»، أي أن **مستخدماً
نشطاً لا تنتهي مدّته أبداً**. وإضافةً إلى ذلك: «The data retention setting does **not** affect
standard aggregated reports»، والحذف يجري «automatically on a **monthly** basis»
([المصدر](https://support.google.com/analytics/answer/7667196) — 2026-09-03).

> **أي أن سقف الـ14 شهراً في GA4 سقفٌ على البيانات غير المجمَّعة للمستخدمين الخاملين فقط —
> لا سقف احتفاظ حقيقي.**

**فجوة:** لم أعثر على القيمة **الافتراضية** لاحتفاظ خاصية GA4 جديدة؛ الصفحة تعدّد الخيارات ولا
تسمّي الافتراضي.

### 6.3 العرف

**فجوة:** لم أجد مصدراً أولياً يوثّق «عرفاً» في مدّة الاحتفاظ بالأحداث السلوكية المربوطة
بالشخص. ما وجدتُه هو **إعدادات المنتجات** أعلاه (٧ أيام إلى ١٤ شهراً)، وهي دالّة على ما
يفرضه المزوّدون لا على معيار مهني منشور. **لم أُحوّل نطاق المنتجات إلى «عرف» — تلك قفزة
لا يسندها مصدر.**

---

## الفجوات — ما لم أجده ولا أخمّنه

### قانونية

1. **🔑 منشورات الهيئة الإسرائيلية لحماية الخصوصية غير متاحة بالكامل.** `gov.il` يعيد **403**
   على `WebFetch` وعلى `curl` بترويسة متصفّح، والمتصفّح الحقيقي يواجه صفحة تحقّق آلي لم
   أحاول تجاوزها. المتأثّر: **גילוי דעת على تعيين الممونה** (23/07/2025 و14/07/2026) —
   وهو **المصدر الرسمي الوحيد الذي يفسّر «ניטור שוטף ושיטתי» و«היקף ניכר»** — و**المدريך
   המקצועי لتيقون ١٣**. الروابط المعروفة:
   `gov.il/BlobFolder/legalinfo/amendment-13-26-07-26/he/media_06-07-26.pdf` ·
   `gov.il/BlobFolder/reports/guide_tikon13_professional/he/tikun 13 _170825.pdf` ·
   `gov.il/he/pages/dpo25_`. **يجب سدّها بقراءة بشرية قبل حسم #42.**
2. لا رأي رسمي يحسم ما إذا كان **نوع المناسبة** (حج/عزاء) وحده كافياً ليجعل سجلّ التفاعل
   «מידע על אמונותיו הדתיות» بالمعنى الوارد في الفقرة (7). المنطق في §4.1 قراءتنا للنصّ.
3. لا تعريف قانوني لكيفية «تحديد غرض المאגר كدين» (‏`שנקבעה לו כדין`) لجهة خاصة غير ملزَمة
   بالتسجيل — أين يُكتب الغرض ومن يعتمده.
4. نصّ **תקנות העברת מידע 2001** قُرئ من transcription على `nevo.co.il` لا من `רשומות`
   الرسمية (ק"ת 6120)؛ الاقتباسات في §4.6 **ليست من مصدر رسمي**.
5. لم أتحقّق من قائمة الدول في תקנה 2(8) ولا مما إذا عُدِّلت תקנות 2001 بعد تيقون ١٣.
6. لم أقرأ نصّ **תקנות אבטחת מידע, התשע"ז-2017** نفسه — الالتزامات لكل مستوى، ودورية
   المراجعة، وواجب الإبلاغ عن «אירוע אבטחה חמור». ما في §4.8 من التוספת השלישית لتيقون ١٣.
7. لا نعرف عدد صفوف `users` في الإنتاج، فلا يمكن الجزم بموقعنا من عتبتَي **100,000**
   (الإخطار ورמת האבטחה) و**1,000,000** (مضاعفة الغرامة). **يُحسم بعدّ واحد.**
8. لم أجد مصدراً أوّلياً يوثّق **عرفاً** في مدّة الاحتفاظ بالأحداث السلوكية المربوطة بالشخص.

### تشغيلية

9. **🔑 مواصفات الـVPS مجهولة** — لا RAM ولا vCPU ولا مساحة قرص حرّة. كل أحكام §3 مبنية على
   أرقام المشاريع المنشورة مقابل VPS صغير نموذجي. **يجب `free -h` و`nproc` و`df -h` قبل أي
   قرار استضافة ذاتية.**
10. لا سياسة ترقية موثّقة لـ**GlitchTip** (هل يجوز تخطّي الإصدارات؟) مقابل سياسة Sentry
    المنشورة بمحطّاتها الإلزامية.
11. لا بيان لدى **GlitchTip** بأقصى إصدار Sentry SDK مدعوم ولا بسياسة توافق مع صيغة الـenvelope
    — مخاطرة لأن `@sentry/node` 10.x يبعث spans وlogs وmetrics قد لا يستوعبها.

### تقنية

12. لم أجد لدى Sentry ولا Bugsnag ولا Rollbar عبارة **صريحة** تؤكّد العمل مع APK موزَّع خارج
    Google Play. الاستنتاج مبنيّ على **غياب** أي تبعية Play Services — دليل سلبي لا إيجابي.
13. تعارض ترخيص **Plausible CE**: الوثائق تقول AGPLv3، وملف `LICENSE` في مستودع
    `community-edition` يقول **MIT (2024)**. الأرجح أن سكربتات النشر MIT وشيفرة التطبيق
    `plausible/analytics` تحت AGPLv3، **لكن لا نصّ صريح يقرّر هذا التقسيم** فلم أُثبته.
14. لا تصريح رسمي من **Matomo** بأن ميزة User ID متاحة في On-Premise المجانية دون إضافة
    مدفوعة؛ الاستنتاج من موضعها في وثائق التتبّع الجوهرية.
15. **تسعير PostHog** لكل حدث بعد المليون المجاني — الجدول JS-rendered ولم يظهر أي رقم في ثلاث
    محاولات.
16. **تسعير Umami Cloud** وحدوده — `umami.is/pricing` بلا محتوى نصّي و`/docs/cloud/pricing`
    أعاد 404. الأرقام المتداولة من طرف ثالث ولم تُثبَّت.
17. تعارض بين صفحتَي **Matomo** عن مقرّ البيانات: إحداهما «Frankfurt, Germany» والأخرى تذكر
    عقوداً مع AC3 NZ و AWS New Zealand.
18. **مقرّ بيانات Umami Cloud** — لا بيان رسمي.
19. **عدد خدمات Sentry self-hosted** — قراءتان مستقلّتان للملف نفسه أعطتا **54** و**56**؛
    ووثائق Sentry **لا تنشر العدد** أصلاً. الرقم في §1.5 و§3.2 نطاق لا قيمة.
20. `compose.sample.yml` الرسمي لـGlitchTip على GitLab أعاد 404؛ العدّ من الملف المنشور على
    `glitchtip.com/assets/` (مجلوب فعلياً) ومن مرآة GitHub غير رسمية.
21. **Umami لا تنشر حدّاً أدنى للـRAM/CPU/القرص** — متطلّباتها المنشورة إصدارات Node وPostgres
    فقط.
22. لم أعثر على جدول احتفاظ **Sentry** لكل خطة؛ صفحات الأمان والحصص تحيل إلى «our
    documentation» بلا رقم.
23. **تسعير Rollbar** — الصفحة الرسمية **لا تعرض أي رقم دولاري**؛ الرقمان الوحيدان ($9 و$13
    شهرياً لـ10K حدث) مصدرهما **مدوّنة Rollbar** لا صفحة تسعيرها.
24. **تسعير Bugsnag** — «STARTING AT $0/month» لخطتَي Select وPreferred بلا رقم دخول فعلي.
25. **إقامة بيانات Bugsnag**: بحثتُ عن endpoint أوروبي (نمط `notify.eu.bugsnag.com`) في صفحة
    الأمان وصفحة الـendpoints — **ولا توثيق لأي منطقة EU**. و`docs.bugsnag.com/api/#regions`
    تعيد 301 إلى `developer.smartbear.com/bugsnag`.
26. **Rollbar / التقاط IP**: صفحة People Tracking لا تذكر السلوك الافتراضي ولا خيار
    `captureIp`؛ و`docs.rollbar.com/docs/identifying-users` تعيد **404**.
27. **حدّ أدنى لـAndroid API level** غير منصوص في وثائق `bugsnag_flutter`.
28. **قيد Dart SDK لحزمة `matomo_tracker` 6.1.1** — صفحة pub.dev لا تعرضه في المحتوى المستخرَج.
29. **حزم Flutter المجتمعية لـUmami وPlausible** — تُركت بلا أرقام إصدار ولا تقييم صيانة عمداً.
30. **نسخة `-compat` من Firebase JS SDK** تعمل بوسم ‎`<script>`‎ عادي بلا `type="module"` — لم
    أتحقّق من وجودها.
31. **نصّ snippet الكامل لـPostHog** — كل صفحات التثبيت تُقتطع عند الكود؛ الروابط من صفحة
    snippet-versioning ومن التحقّق المباشر بالملف.
32. **رابط سكربت Umami السحابي الكامل** — الوثائق تستخدم عنواناً وهمياً، وصفحتا
    `/docs/collect/tracker` و`/docs/getting-started/installation` أعادتا 404.
33. **تاريخ تحوّل رخصة FSL** — الملف لا يذكر تاريخاً محدَّداً لأي إصدار؛ التحوّل يقع عند
    الذكرى الثانية لكل إصدار على حدة ولا جدول منشور.
34. **تعريف «certified Android device»** غير منصوص في صفحة Android developer verification، ولا
    ما يحدث لتطبيق مطوّر غير موثَّق.
35. **تاريخ إسرائيل** ضمن التوسّع العالمي لـdeveloper verification — غير معلَن.
36. **القيمة الافتراضية لاحتفاظ خاصية GA4 جديدة** — الصفحة تعدّد الخيارات ولا تسمّي الافتراضي.

---

## المصادر

**قانون إسرائيلي — نصوص رسمية**

1. **חוק הגנת הפרטיות (תיקון מס' 13), התשפ"ד-2024** — ספר החוקים 3287، 14/08/2024، النصّ
   الرسمي (استُخرج ٦٨ صفحة وقُرئت العبارات المقتبسة حرفاً بحرف) —
   https://fs.knesset.gov.il/25/law/25_lsr_4810658.pdf
2. **חוק הגנת הפרטיות, התשמ"א-1981 — נוסח משולב** (الكنيست، يُظهر التعديل داخل النصّ) —
   https://fs.knesset.gov.il/25/law/25_ls_bk_4704176.pdf
3. **תקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה), תשס"א-2001** —
   **transcription غير رسمية**، انظر فجوة ٤ — https://www.nevo.co.il/law_html/law00/71639.htm
4. الهيئة الإسرائيلية لحماية الخصوصية — منشورات تيقون ١٣ والـDPO — **تعذّر الوصول (403)**،
   انظر فجوة ١ — https://www.gov.il/he/pages/guide_tikon13_professional ·
   https://www.gov.il/he/pages/dpo25_

**Sentry**

5. https://docs.sentry.io/platforms/javascript/install/cdn/
6. https://docs.sentry.io/platforms/javascript/install/loader/
7. https://docs.sentry.io/platforms/javascript/guides/express/
8. https://docs.sentry.io/platforms/javascript/configuration/options/
9. https://docs.sentry.io/platforms/javascript/guides/express/data-management/data-collected/
10. https://docs.sentry.io/platforms/javascript/guides/express/data-management/sensitive-data/
11. https://docs.sentry.io/platforms/javascript/enriching-events/identify-user/
12. https://docs.sentry.io/platforms/javascript/sourcemaps/ · https://docs.sentry.io/platforms/javascript/
13. https://docs.sentry.io/organization/data-storage-location/
14. https://sentry.io/pricing/ · https://sentry.io/security/
15. https://develop.sentry.dev/self-hosted/ · https://develop.sentry.dev/self-hosted/support/ · https://develop.sentry.dev/self-hosted/releases/
16. https://raw.githubusercontent.com/getsentry/self-hosted/master/LICENSE.md · https://raw.githubusercontent.com/getsentry/sentry/master/LICENSE.md
17. https://raw.githubusercontent.com/getsentry/self-hosted/master/docker-compose.yml
18. https://raw.githubusercontent.com/getsentry/sentry-dart/main/packages/flutter/pubspec.yaml · https://pub.dev/packages/sentry_flutter
19. https://registry.npmjs.org/@sentry/node/latest · https://registry.npmjs.org/@sentry/browser/latest
20. https://browser.sentry-cdn.com/10.73.0/bundle.min.js *(مجلوب فعلياً: 200، 90,590 B، IIFE)*

**GlitchTip**

21. https://glitchtip.com/pricing · https://glitchtip.com/documentation/install/
22. https://glitchtip.com/documentation/hosted-architecture/ · https://glitchtip.com/legal/privacy/
23. https://glitchtip.com/sdkdocs · https://glitchtip.com/sdkdocs/dart-flutter
24. https://glitchtip.com/assets/compose.sample.yml *(مجلوب فعلياً: 1,948 B، ٣ خدمات)*
25. https://gitlab.com/glitchtip/glitchtip-backend/-/raw/master/LICENSE · .../NOTICE.md

**Rollbar**

26. https://docs.rollbar.com/docs/browser-js · https://docs.rollbar.com/docs/nodejs
27. https://docs.rollbar.com/docs/flutter · https://pub.dev/packages/rollbar_flutter
28. https://docs.rollbar.com/docs/person-tracking · https://docs.rollbar.com/docs/security
29. https://docs.rollbar.com/docs/gdpr-rollbar · https://docs.rollbar.com/docs/data-processing-agreement
30. https://rollbar.com/pricing · https://registry.npmjs.org/rollbar/latest
31. https://cdn.rollbar.com/rollbarjs/refs/tags/v3.1.0/rollbar.min.js *(مجلوب فعلياً: 200، 131,506 B، IIFE)*
32. https://rollbar.com/blog/rollbar-pricing-explained-plans-features-and-what-you-actually-pay/ *(مدوّنة المزوّد — أرقام غير معتمدة، فجوة ٢٣)*

**Bugsnag / Insight Hub**

33. https://www.bugsnag.com/pricing/ · https://smartbear.com/insight-hub/pricing/ *(301)*
34. https://docs.bugsnag.com/platforms/javascript/#cdn · https://docs.bugsnag.com/platforms/javascript/express/
35. https://docs.bugsnag.com/platforms/javascript/customizing-error-reports/ · .../configuration-options/#endpoints
36. https://docs.bugsnag.com/platforms/flutter/ · https://pub.dev/packages/bugsnag_flutter
37. https://docs.bugsnag.com/security/overview/ · https://registry.npmjs.org/@bugsnag/js/latest
38. https://d2wy8f7a9ursnm.cloudfront.net/v8/bugsnag.min.js *(مجلوب فعلياً: 200، 51,756 B، UMD)*

**PostHog**

39. https://posthog.com/docs/product-analytics/identify · https://posthog.com/docs/libraries/node · https://posthog.com/docs/libraries/js
40. https://posthog.com/docs/libraries/js/snippet-versioning · https://us-assets.i.posthog.com/static/array.js *(مجلوب فعلياً)*
41. https://posthog.com/docs/self-host · https://posthog.com/docs/self-host/open-source/disclaimer
42. https://posthog.com/docs/privacy/data-storage · https://posthog.com/pricing
43. https://raw.githubusercontent.com/PostHog/posthog/master/LICENSE · .../docker-compose.hobby.yml
44. https://pub.dev/packages/posthog_flutter · https://raw.githubusercontent.com/PostHog/posthog-flutter/main/pubspec.yaml

**Matomo**

45. https://developer.matomo.org/guides/tracking-javascript-guide · https://developer.matomo.org/api-reference/tracking-api
46. https://developer.matomo.org/guides/tracking-api-clients · https://matomo.org/guide/reports/user-ids/
47. https://raw.githubusercontent.com/matomo-org/matomo/5.x-dev/LICENSE · https://matomo.org/pricing/
48. https://matomo.org/faq/on-premise/matomo-requirements/
49. https://matomo.org/faq/troubleshooting/faq_42/ · https://matomo.org/faq/general/faq_125/
50. https://matomo.org/faq/new-to-piwik/data-sovereignty-where-your-analytics-data-is-stored/ · https://matomo.org/faq/in-which-locations-does-the-matomo-cloud-store-the-data/
51. https://pub.dev/packages/matomo_tracker

**Umami**

52. https://docs.umami.is/docs/distinct-ids · https://docs.umami.is/docs/guides/identify-logged-in-users
53. https://docs.umami.is/docs/tracker-configuration · https://docs.umami.is/docs/api/sending-stats
54. https://docs.umami.is/docs/install · https://docs.umami.is/docs/cloud/faq
55. https://raw.githubusercontent.com/umami-software/umami/master/LICENSE · .../docker-compose.yml · .../README.md

**Plausible**

56. https://plausible.io/data-policy · https://plausible.io/docs/custom-props/introduction
57. https://plausible.io/docs/events-api · https://plausible.io/docs/plausible-script
58. https://plausible.io/docs/self-hosting · https://plausible.io/#pricing · https://plausible.io/privacy-focused-web-analytics
59. https://github.com/plausible/community-edition · https://raw.githubusercontent.com/plausible/community-edition/master/LICENSE
60. https://raw.githubusercontent.com/plausible/community-edition/v3.0.1/compose.yml · https://raw.githubusercontent.com/plausible/analytics/master/LICENSE.md

**Google / Firebase / Android**

61. https://firebase.google.com/docs/analytics/userid · https://support.google.com/analytics/answer/6366371
62. https://pub.dev/packages/firebase_analytics · https://raw.githubusercontent.com/firebase/flutterfire/main/packages/firebase_analytics/firebase_analytics/pubspec.yaml
63. https://firebase.google.com/docs/android/android-play-services · https://firebase.google.com/docs/cloud-messaging/flutter/client
64. https://firebase.google.com/support/privacy · https://firebase.google.com/docs/projects/locations
65. https://support.google.com/analytics/answer/12017362 · https://support.google.com/firebase/answer/9234069
66. https://firebase.google.com/docs/web/alt-setup · https://developers.google.com/analytics/devguides/collection/protocol/ga4
67. https://firebase.google.com/pricing · https://support.google.com/analytics/answer/7667196
68. **Google Play — Data safety** — https://support.google.com/googleplay/android-developer/answer/10787469
69. **Android — Developer verification** — https://developer.android.com/developer-verification

**داخل المستودع**

70. [`docs/adr/0004-self-hosted-app-updates.md`](../adr/0004-self-hosted-app-updates.md) — التوزيع خارج المتجر وتوقيع الـAPK
71. [`docs/research/services-directory.md`](./services-directory.md) — نمط الفجوات الموسومة والمصادر الأولية المتَّبع هنا
72. `server/src/db/schema.sql` · `server/package.json` · `web/index.html` · `mobile/pubspec.yaml` · `docker-compose.yml` — خط الأساس المفحوص في صدر الملف
