# بحث: تتبّع الأعطال في الوحدات الثلاث — Sentry أم GlitchTip أم Crashlytics؟

> تذكرة: [#139](https://github.com/thabet-toma/negev-events-app/issues/139) · تاريخ البحث: **2026-11-05 (UTC)** · فرع العمل: `research/crash-tracking`
>
> **بحث فقط — لم يتغيّر أي كود.** كل ادّعاء أدناه موسوم: **[حقيقة]** = نصّ صريح في مصدر أوّلي،
> **[استنتاج]** = استنتاجي أنا من تلك المصادر أو من كود هذا المستودع، وليس نصّاً في وثيقة.
> الحدود الكاملة لما لم أتحقق منه في القسم الأخير.

**الخلاصة في سطر:** الأداة الوحيدة التي تغطي الوحدات الثلاث اليوم بحساب واحد هي **Sentry** (أو توأمها
المتوافق GlitchTip). الطبقة المجانية في Sentry أكبر (5٬000 خطأ/شهر مقابل 1٬000 حدث في GlitchTip)
وتبعث بيانات أقل افتراضياً في فلاتر، لكن **الويب يبعث IP وReferer/User-Agent، والخادم يبعث IP
وheaders وbody افتراضياً في SDK الإصدار 10/11**، فقيد «لا IP» لا يتحقق بالتهيئة الحالية وحدها بل
بإعداد `dataCollection` صريح
وإعداد مشروع على خادم Sentry — وهذا كله موثَّق وقابل للتنفيذ. Crashlytics ليس أداة منصّة: هو فلاتر
وحده، ويحتاج مشروع Firebase غير المنشأ بعد، ولا يوثّق أي تحكّم في IP.

---

## 0. الوضع الحالي — مقروء من الكود، لا من الوثائق

| الوحدة | الحالة | الدليل في المستودع |
|---|---|---|
| الموبايل | **لا حزمة أعطال إطلاقاً**؛ التبعيات كلها وظيفية (http، خرائط، إشعارات…) | [`mobile/pubspec.yaml`](../../mobile/pubspec.yaml#L30-L57) |
| الموبايل | `minSdk = flutter.minSdkVersion` — أي القيمة الافتراضية لفلاتر، لا قيمة صريحة | [`mobile/android/app/build.gradle.kts`](../../mobile/android/app/build.gradle.kts#L46) |
| الويب | ربط Sentry **مكتوب ونائم**: سكربت CDN بإصدار مثبَّت `7.120.3`، و`sendDefaultPii: false`، ويتوقّف كلياً إن كان `errorDsn` فارغاً | [`web/app.js`](../../web/app.js#L326-L343) |
| الويب | `errorDsn: ''` — فارغ افتراضياً عمداً، و`releaseVersion` موجود | [`web/config.js`](../../web/config.js#L26) · [`web/config.js`](../../web/config.js#L33) |
| الخادم | `console` فقط عبر `logger`، ولا حزمة Sentry | [`server/src/utils/logger.js`](../../server/src/utils/logger.js) |
| الخادم | معالج أخطاء واحد يكتب 5xx في السجل ويشكّل استجابة JSON عربية | [`server/src/middleware/error.js`](../../server/src/middleware/error.js#L28-L65) |
| الخادم | سجل الوصول أُزيل منه IP وUser-Agent عمداً (تعليق يشرح قاعدة الغرض) | [`server/src/app.js`](../../server/src/app.js#L58-L66) |
| الإشعار | إشعار الخصوصية ينصّ حرفياً: «سجل الوصول للخادم لا يحتفظ بعنوان IP الزائر» | [`server/src/privacyNotice.js`](../../server/src/privacyNotice.js#L82-L83) |
| النشر | لا `env_file` في Compose؛ **كل** متغيّر بيئة يجب أن يُذكر صراحةً في `app.environment` وإلا لا يصل الحاوية | [`docker-compose.yml`](../../docker-compose.yml#L53-L58) |
| النشر | صورة الخادم `node:20-alpine`، و`engines.node: ">=20"` | [`server/Dockerfile`](../../server/Dockerfile#L3) · [`server/package.json`](../../server/package.json#L6-L8) |
| التوزيع | APK ذاتي الاستضافة + Play؛ التوقيع والتحديث قيدان قائمان | [`docs/adr/0004-self-hosted-app-updates.md`](../adr/0004-self-hosted-app-updates.md) |

---

## 1. المنهج وحدود المصادر

- قرأتُ صفحات الوثائق **مباشرة من نطاق البائع** (HTML خام عند الحاجة، لأن بعض صفحات GlitchTip
  تُبنى في المتصفح). لم أستخدم أي مقال وسيط.
- صفحات التسعير ليست تحت `docs.sentry.io`/`firebase.google.com/docs`، فقرأتُها من نطاق البائع نفسه
  (`sentry.io/pricing`، `glitchtip.com/pricing`، `firebase.google.com/pricing`) لأن حدود الطبقة
  المجانية لا تُنشر في صفحات الـdocs. هي مصادر أوّلية (البائع) لا شروح طرف ثالث، وأشير إليها
  صراحةً حيث تُستعمل.
- أرقام حزم Flutter مأخوذة من **pub.dev API** مباشرة (لا من الذاكرة) بتاريخ البحث أعلاه.
- لم أشغّل `flutter` ولا `npm install` (ممنوع في التذكرة)، ولم أنشئ أي حساب. لذلك: **لا شيء هنا
  يثبت أن الحزم تُحلّ فعلياً مع نسخة فلاتر المثبَّتة عندك، ولا أن الأحداث تصل فعلاً** — هذا فحص
  تنفيذي يحتاج تشغيلاً وحساباً.

---

## 2. جدول المقارنة

| البند | Sentry السحابي — Developer | GlitchTip السحابي | GlitchTip ذاتي الاستضافة | Firebase Crashlytics |
|---|---|---|---|---|
| الوحدات المدعومة | Flutter + Web + Node/Express (نفس SDK لعائلة Sentry) | نفس عائلة SDK: Flutter + Web + Node/Express | نفسها | **Flutter وحده** (iOS/Android/NDK/Unity) — لا سكربت ويب ولا حزمة Node ([نظرة عامة](https://firebase.google.com/docs/crashlytics)) |
| الكلفة | **$0** — «Limited to one user»، وTeam $26/شهر ([تسعير Sentry](https://sentry.io/pricing/)) | **$0** Hobby، وSmall $15/شهر ([تسعير GlitchTip](https://glitchtip.com/pricing)) | البرنامج بلا ترخيص؛ الكلفة خادم + قرص + صيانة (غير مسعّرة في الوثائق) | **No-cost** على Spark وBlaze ([تسعير Firebase](https://firebase.google.com/pricing)) |
| حدود الطبقة المجانية | **5٬000 خطأ/شهر**، 30-day lookback، 1GB مرفقات، 50 replay، 5M span، مشاريع غير محدودة ([تسعير Sentry](https://sentry.io/pricing/)) | **1٬000 حدث/شهر**، احتفاظ 30 يوماً ([تسعير GlitchTip](https://glitchtip.com/pricing)) | بلا سقف أحداث؛ سقفك هو القرص ([التركيب](https://glitchtip.com/documentation/install)) | **لا رقم منشور** في صفحة التسعير؛ Crashlytics بند «No-cost» بلا حصة ([تسعير Firebase](https://firebase.google.com/pricing)) |
| ما يُحسب حدثاً | خطأ = حدث؛ التتبّع سبان منفصلة ([تسعير](https://sentry.io/pricing/)) | كل خطأ **وكل معاملة أداء** حدث؛ 10 عمليات uptime/سجل = حدث ([تسعير GlitchTip](https://glitchtip.com/pricing)) | لا يُحسب — قرص فقط | لا مفهوم حصة/حدث منشور |
| عند تجاوز الحد | بيانات ما بعد الحصة تُسقَط ([وثائق التسعير](https://docs.sentry.io/pricing/)) | تخفيف تدريجي: إسقاط ~10% ثم أكثر، وحجب كامل عند ضعف الحد افتراضياً ([تسعير GlitchTip](https://glitchtip.com/pricing)) | لا ينطبق | لا ينطبق |
| الاحتفاظ | 30 يوماً على Developer ([تسعير Sentry](https://sentry.io/pricing/)) | 30 يوماً في المجاني، 90 في Small ([تسعير GlitchTip](https://glitchtip.com/pricing)) | `GLITCHTIP_RETENTION_DAYS` افتراضي **90**؛ الأحداث «ساخنة» في Postgres 30 يوماً ثم أرشفة ([التركيب](https://glitchtip.com/documentation/install)) | **غير موثَّق** في الصفحات التي قرأتها ([الحدود](#10-ما-لم-أتحقق-منه--تعذّر-الوصول)) |
| المستخدمون | **مستخدم واحد** في المجاني ([تسعير Sentry](https://sentry.io/pricing/)) | غير مذكور في المجاني؛ «Unlimited team members» من Small ([تسعير GlitchTip](https://glitchtip.com/pricing)) | بلا حدّ ترخيص مذكور | غير مذكور في التسعير (لا بند مستخدمين) ([تسعير Firebase](https://firebase.google.com/pricing)) |
| IP افتراضياً | **الويب: يُرسَل** ([Data Collected](https://docs.sentry.io/platforms/javascript/data-management/data-collected/)) · **Node: يُرسَل** ([Express](https://docs.sentry.io/platforms/javascript/guides/express/)) · **Flutter: لا يُرسَل** ([Flutter Data Collected](https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/)) | نفس SDK ونفس الافتراضيات | نفس SDK ونفس الافتراضيات؛ البيانات على خادمك أنت | لا تحكّم موثَّق؛ «يجمع تقارير الانهيار الأصلية تلقائياً لكل المستخدمين» افتراضياً ([تخصيص التقارير](https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports)) |
| إطفاء IP | `dataCollection.userInfo: false` (أو `sendDefaultPii: false` في v10 فقط) + **إعداد مشروع**: منع تخزين IP + قاعدة حذف `[$user.geo.**]` ([الخادم](https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/)) | نفس مفتاح SDK؛ لا settings خادم موثّقة | نفس مفتاح SDK؛ لا طرف ثالث أصلاً | لا مقبض مكافئ؛ البديل «opt-in reporting» يوقف الجمع التلقائي كاملاً ([تخصيص التقارير](https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports)) |
| User-Agent / Referer | المتصفح يبعثهما افتراضياً؛ يُطفآن بـ`dataCollection.httpHeaders: false` ([Data Collected](https://docs.sentry.io/platforms/javascript/data-management/data-collected/)) | نفس SDK | نفس SDK | غير موثَّق في الصفحات المقروءة |
| ويب بلا bundler | **Loader Script** رسمي (يُحدِّث SDK تلقائياً)، أو حزمة CDN مثبَّتة كما في كودكم ([Loader](https://docs.sentry.io/platforms/javascript/install/loader/)) | لا Loader في وثائقهم؛ استعمل نفس حزمة CDN بـDSN الخاص بهم **[استنتاج]** ([JS SDK](https://glitchtip.com/sdkdocs/javascript)) | نفس الجواب | **غير مدعوم** |
| رموز التشويش (Flutter) | `sentry_dart_plugin` + `SENTRY_AUTH_TOKEN` + بناء `--obfuscate --split-debug-info` ([Dart Plugin](https://docs.sentry.io/platforms/dart/guides/flutter/debug-symbols/dart-plugin/)) | `glitchtip-cli dart-symbol-map upload` ([Flutter SDK](https://glitchtip.com/sdkdocs/dart-flutter)) | نفس الأمر | `firebase crashlytics:symbols:upload` بـFirebase CLI ≥11.9 ([البدء](https://firebase.google.com/docs/crashlytics/flutter/get-started)) |
| APK خارج Play | يعمل — لا اعتماد على Play في SDK **[استنتاج من غياب أي شرط Play في وثائق SDK]** | يعمل **[استنتاج]** | يعمل **[استنتاج]** | يعمل؛ صفحة تكامل Play خطوة **اختيارية** ([نظرة عامة](https://firebase.google.com/docs/crashlytics)) — لكنها الطريقة الوحيدة لفصل قناة Play عن APK في اللوحة |
| Node/Express | `@sentry/node` 11.11.0، Node ≥20.19، `expressIntegration` يمسك 5xx تلقائياً ([Express](https://docs.sentry.io/platforms/javascript/guides/express/)) | `@sentry/node` + `Sentry.setupExpressErrorHandler(app)` قبل أي middleware أخطاء آخر ([GlitchTip Express](https://glitchtip.com/sdkdocs/node-express)) | نفسه | **غير مدعوم** |
| التاريخ | آخر نشر للحزمة 2026-11-05 ([npm](https://www.npmjs.com/package/@sentry/node)) | مستقل عن الإصدار | مستقل | `firebase_crashlytics` 6.0.1 (2026-10-23) ([pub.dev API](https://pub.dev/api/packages/firebase_crashlytics)) |
| ملاءمة قيد «لا IP» | **قابلة للتحقيق بإعداد صريح**، مع بقاء مسار URL مُرسَلاً دائماً ووصول IP إلى حافة الشبكة | قابلة بإعداد SDK، لكن سلوك خادمهم غير موثَّق | **الأقوى**: البيانات لا تغادر خادمك؛ ما زال SDK يجب ضبطه | **لا ضمان موثَّق** |

---

## 3. الخصوصية — الفرق بين «لا يُخزَّن» و«لا يصل»

### 3.1 Sentry: طبقتان، لا مفتاح واحد

**[حقيقة]** الوثائق تفصل بين ما يجمعه SDK وما يفعله خادم Sentry:

- المتصفح (v10+): «By default, the SDK sends the user's IP address» — يُطفأ بـ`dataCollection: { userInfo: false }`.
  وحتى بعد إطفائه «IP addresses can still reach Sentry through collected HTTP headers, cookies, or query
  parameters (for example, X-Forwarded-For)» — فالحل الكامل يجمع الإطفاء مع قوائم منع على
  `httpHeaders`/`cookies`/`urlQueryParams`. ([Data Collected — JS](https://docs.sentry.io/platforms/javascript/data-management/data-collected/))
- المتصفح يبعث أيضاً `Referer` و`User-Agent` افتراضياً؛ `httpHeaders: false` يمنعهما.
  ([Data Collected — JS](https://docs.sentry.io/platforms/javascript/data-management/data-collected/))
- Node/Express: «By default, the SDK sends user identity data (IP address, ID, and similar) and other data
  like HTTP bodies and URL query parameters». ([Express Quick Start](https://docs.sentry.io/platforms/javascript/guides/express/))
- فلاتر: **بالعكس** — «By default, the Sentry SDK doesn't send the user's IP address» ولا headers ولا
  هوية المستخدم ولا اسم الجهاز، وكلها تحتاج `sendDefaultPii = true`. ([Flutter Data Collected](https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/))
  وهذا مهم لأن **مقتطف التهيئة الرسمي في صفحة Manual Setup يضع `sendDefaultPii = true`** — نسخه
  حرفياً يقلب الافتراض الآمن. ([Manual Setup](https://docs.sentry.io/platforms/dart/guides/flutter/manual-setup/))
- خادم Sentry: يمكن «prevent IP addresses from being stored» من إعدادات المشروع، **لكن**
  «Geographic information is extracted from the user's IP address. This occurs even if the setting to stop
  storing IP addresses is turned on» — ولا بد من قاعدة Advanced Data Scrubbing مثل
  `[Remove] [Anything] from [$user.geo.**]`. ([Server-Side Data Scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/))

**[حقيقة]** `sendDefaultPii` صار مهملاً: «In version 10 of the SDK, the defaults below apply only when you
set the `dataCollection` option. Without it, the deprecated `sendDefaultPii` option controls data collection.
Starting with version 11, the defaults always apply.» ([Options — dataCollection](https://docs.sentry.io/platforms/javascript/guides/express/configuration/options/#dataCollection))

**[استنتاج]** إذن التهيئة الحالية في `web/app.js` (`sendDefaultPii: false`) كافية **على الحزمة المثبَّتة
7.120.3 فقط**؛ أي ترقية إلى v10/11 بلا `dataCollection` صريح تعيد جمع IP تلقائياً. ووثائق v7 لم تعد
منشورة على الموقع (الوثائق تعرض `latest`)، فلا أستطيع إثبات سلوك 7.120.3 من مصدر حالي.

**[حقيقة]** إضافة إلى ما يُرسَل في الحدث: عنوان الطلب الكامل (scheme/host/path) **لا يمكن إطفاؤه**؛
وquery string يُرسَل كاملاً افتراضياً. ([Data Collected — JS](https://docs.sentry.io/platforms/javascript/data-management/data-collected/))

**[حقيقة]** على Node تُضاف افتراضياً: cookies الطلبات القادمة، headersها، body الطلب، **قيم متغيّرات
الـstack المحلية** (`stackFrameVariables` افتراضي true، والإضافة مبنية افتراضياً في Node)، وبيانات
استعلامات قاعدة البيانات (`databaseQueryData` افتراضي true). ([Options](https://docs.sentry.io/platforms/javascript/guides/express/configuration/options/#dataCollection))
هذه أخطر نقطة في هذا المستودع: استعلامات الخدمات تحمل أسماء وهواتف وبيانات مستخدمين.

### 3.2 GlitchTip: نفس SDK، ووثائق أقل وضوحاً

**[حقيقة]** GlitchTip متوافق مع SDKs الخاصة بـSentry، ووثائقهم لكل لغة هي مقتطف `Sentry.init` عادي:
JS ([sdkdocs/javascript](https://glitchtip.com/sdkdocs/javascript))، Express
([sdkdocs/node-express](https://glitchtip.com/sdkdocs/node-express))، Flutter
([sdkdocs/dart-flutter](https://glitchtip.com/sdkdocs/dart-flutter)).

**[حقيقة]** يعطّلون الجلسات: `autoSessionTracking: false` (JS/Express) و`enableAutoSessionTracking = false`
(Flutter) لأن «GlitchTip does not support sessions». ([sdkdocs/javascript](https://glitchtip.com/sdkdocs/javascript) ·
[sdkdocs/dart-flutter](https://glitchtip.com/sdkdocs/dart-flutter))

**[حقيقة]** لا تذكر وثائقهم أي مفتاح `dataCollection`، ولا أي إعداد خادم يمنع تخزين IP. صفحاتهم عن
الخصوصية تتحدث عن GDPR والاحتفاظ والاستضافة الأوروبية، لا عن IP.
([FAQ](https://glitchtip.com/documentation/frequently-asked-questions) ·
[Hosted Architecture](https://glitchtip.com/documentation/hosted-architecture))

**[استنتاج]** باتباع مقتطفاتهم كما هي على SDK 11، ستُرسَل افتراضيات v11 (IP وheaders وbody) إلى
GlitchTip — لأن الإطفاء مسؤولية SDK لا الخادم. وعلى الاستضافة الذاتية تبقى البيانات عندك، لكنها
**تُخزَّن عندك** إن لم تُطفئها في SDK.

**[حقيقة]** الاستضافة السحابية: نسخة أمريكية وأخرى أوروبية (Frankfurt) منفصلتان تماماً، والبيانات
— بما فيها الأحداث — تبقى في المنطقة المختارة. ([Hosted Architecture](https://glitchtip.com/documentation/hosted-architecture))
ولا تدريب على بياناتك: «We do not use your data to train AI models». ([FAQ](https://glitchtip.com/documentation/frequently-asked-questions))

### 3.3 Crashlytics: جمع تلقائي، وتحكّم من نوع «كل شيء أو لا شيء»

**[حقيقة]** «by default, Crashlytics automatically collects platform-native crash reports for all of your
app's users»، ويمكن «Turn off automatic crash reporting and enable opt-in reporting for your users».
([تخصيص التقارير](https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports))

**[حقيقة]** معرّف المستخدم اختياري عبر `setUserIdentifier`، ومسحه لا يمحو السجلات السابقة.
([تخصيص التقارير](https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports))

**[حقيقة]** توصي الوثائق بتفعيل Google Analytics للحصول على breadcrumbs — أي مجرى جمع إضافي
منفصل عن الأعطال. ([البدء](https://firebase.google.com/docs/crashlytics/flutter/get-started))

**[استنتاج]** لا يوجد في هذه الصفحات ما يثبت جمع IP أو عدمه، ولا مقبض لإطفائه؛ الشفافية هنا أقل من
Sentry، والتحقّق يحتاج قراءة سياسات Google أو اختبار حدث فعلي.

### 3.4 ماذا يعني هذا لقيد المشروع؟

1. **[حقيقة]** قيد المستودع هو **عدم الاحتفاظ بعنوان IP في سجل الخادم**، لا منع اتصال شبكي —
   فحتى استضافة ذاتية ترى IP العميل على مستوى TCP. ([`server/src/app.js`](../../server/src/app.js#L58-L66) ·
   [`server/src/privacyNotice.js`](../../server/src/privacyNotice.js#L82-L83))
2. **[استنتاج]** مع Sentry تصبح الجملة في الإشعار صحيحة **فقط** إذا: أُطفئ `userInfo` في SDK، وفُعِّل
   «منع تخزين IP» في المشروع، وأُضيفت قاعدة حذف `user.geo`، وأُطفئت headers/body/query على الويب
   والخادم. أربعة شروط، لا واحد.
3. **[استنتاج]** إن كان المقصود «ألا يصل IP إلى طرف ثالث إطلاقاً» فالجواب الوحيد بين المرشحين هو
   GlitchTip ذاتي الاستضافة — وما زال SDK يحتاج الإطفاء كي لا يُخزَّن في قاعدة GlitchTip.
4. **[حقيقة]** Crashlytics يفتح باباً ثالثاً لا يغطيه النقاش: Google Analytics الموصى به للـbreadcrumbs
   له التزامات موافقة مستقلة. ([البدء](https://firebase.google.com/docs/crashlytics/flutter/get-started))

---

## 4. فلاتر (Flutter)

### 4.1 Sentry

**[حقيقة]** `sentry_flutter` 10.3.0 (نشر 2026-11-02) يشترط **Dart ≥3.12 وFlutter ≥3.44**، ووثائق
الإعداد تشترط **Android API 26+**. ([pub.dev API](https://pub.dev/api/packages/sentry_flutter) ·
[البدء](https://docs.sentry.io/platforms/dart/guides/flutter/))
المستودع يعلن `sdk: ^3.10.4` في [`mobile/pubspec.yaml`](../../mobile/pubspec.yaml#L21-L22)، وهو قيد
يسمح بـ3.12؛ **[استنتاج]** لكن نسخة فلاتر المثبَّتة عندك يجب أن تكون ≥3.44، و`minSdk` يجب أن يُرفع
إلى 26 إن كان الافتراضي أقل — وكلاهما لا يُتحقّق منه إلا بتشغيل `flutter`، وهو ممنوع في هذه التذكرة.

الخطوات المختصرة كما في الوثائق:

1. أضف `sentry_flutter: ^10.3.0` إلى `dependencies`. ([Manual Setup](https://docs.sentry.io/platforms/dart/guides/flutter/manual-setup/))
2. لفّ `main` بـ`SentryFlutter.init` مع `appRunner: () => runApp(...)`؛ SDK يثبّت
   `PlatformDispatcher.onError` بنفسه فيلتقط أخطاء الإطار وغير المتزامنة.
   ([pub.dev](https://pub.dev/packages/sentry_flutter))
3. في `options`: `dsn`، و`release` (مثلاً `negev-events@1.22.5`)، و`dist` (رقم البناء 46)،
   و`tracesSampleRate = 0` إن أردت الأخطاء فقط. **لا تضع `sendDefaultPii = true`** — الافتراضي هو
   الآمن، والمقتطف الرسمي يفعّله. ([Flutter Data Collected](https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/) ·
   [Manual Setup](https://docs.sentry.io/platforms/dart/guides/flutter/manual-setup/))
4. رموز التشويش: أضف `sentry_dart_plugin` كـdev dependency، واضبط `sentry: { org, project }`
   و`dart_symbol_map_path`، وضع `SENTRY_AUTH_TOKEN` في البيئة/CI (لا في المستودع)، وابنِ بـ
   `flutter build apk --obfuscate --split-debug-info=<dir> --extra-gen-snapshot-options=--save-obfuscation-map=build/app/obfuscation.map.json`.
   ([Dart Plugin](https://docs.sentry.io/platforms/dart/guides/flutter/debug-symbols/dart-plugin/))
5. الحجم: «approximately 1-1.5 MB to an app's binary size». ([SDK Overhead](https://docs.sentry.io/platforms/dart/guides/flutter/overhead/))

**[حقيقة]** SDK الموبايل يستخدم معرّفات عشوائية لكل جهاز/تطبيق/تنصيب، لا `ANDROID_ID` ولا IDFA.
([Data Privacy for Mobile](https://docs.sentry.io/security-legal-pii/security/mobile-privacy/))

### 4.2 GlitchTip (فلاتر)

1. نفس الحزمة `sentry_flutter`، ونفس التهيئة تقريباً، لكن `enableAutoSessionTracking = false`
   و`tracesSampleRate` منخفض. ([sdkdocs/dart-flutter](https://glitchtip.com/sdkdocs/dart-flutter))
2. رمز DSN من مشروع GlitchTip بدل DSN الخاص بـSentry.
3. الرموز: لا `sentry_dart_plugin` في وثائقهم، بل `glitchtip-cli`:
   `glitchtip-cli dart-symbol-map upload ./build/app.android-arm64.symbols ./build/app.android-arm64 --org … --project …`.
   ([sdkdocs/dart-flutter](https://glitchtip.com/sdkdocs/dart-flutter) · [CLI](https://glitchtip.com/documentation/cli))
4. **[استنتاج]** حجم الحزمة والأثر على الجهاز مثل Sentry (نفس SDK)؛ لا ميزة أداء لـGlitchTip هنا.

### 4.3 Crashlytics (فلاتر)

**[حقيقة]** الحزمة `firebase_crashlytics` 6.0.1 (2026-10-23) تشترط Dart `^3.6.0` وFlutter ≥3.27
و`firebase_core ^5.1.0`. ([pub.dev API](https://pub.dev/api/packages/firebase_crashlytics))

الخطوات كما في الوثائق:

1. أنشئ مشروع Firebase وأضف تطبيق أندرويد — **المشروع غير منشأ اليوم**، وهذه خطوة يدوية كاملة.
2. `flutter pub add firebase_crashlytics` (و`firebase_analytics` اختيارياً للـbreadcrumbs)، ثم
   `flutterfire configure` (يضيف إضافة Gradle و`google-services.json`). ([البدء](https://firebase.google.com/docs/crashlytics/flutter/get-started))
3. `await Firebase.initializeApp()`، ثم اربط `FlutterError.onError` بـ`recordFlutterFatalError`،
   و`PlatformDispatcher.instance.onError` بـ`recordError(..., fatal: true)`. ([البدء](https://firebase.google.com/docs/crashlytics/flutter/get-started))
4. لنسخ `--split-debug-info/--obfuscate`: ارفع الرموز قبل إرسال أي انهيار من نسخة مشوّشة عبر
   Firebase CLI ≥11.9: `firebase crashlytics:symbols:upload --app=<APP_ID> <PATH/TO/symbols>`.
   ([البدء](https://firebase.google.com/docs/crashlytics/flutter/get-started))
5. حدود مثبتة في الوثائق: **8 استثناءات غير قاتلة فقط**، **64 زوج مفتاح/قيمة** بحجم 1kB لكل زوج،
   و**64kB سجلات**. ([تخصيص التقارير](https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports))
6. **[استنتاج]** يعمل مع APK خارج Play: الوثائق لا تشترط Play، وتكامل Play خطوة اختيارية — لكنه
   الطريق الوحيد لتصفية اللوحة بحسب قناة Play؛ بدونها التمييز بالنسخة فقط. ([نظرة عامة](https://firebase.google.com/docs/crashlytics) ·
   [تكامل Play](https://firebase.google.com/docs/crashlytics/integrate-with-google-play))

---

## 5. الويب (HTML/CSS/JS بلا bundler)

### 5.1 Sentry

**[حقيقة]** طريقتا التركيب المنشورتان اليوم هما npm و**Loader Script** فقط؛ لا صفحة CDN مستقلة.
([تركيب JS](https://docs.sentry.io/platforms/javascript/install/))

- Loader: وسم `<script src="https://<loader-host>/<public-key>.min.js" crossorigin="anonymous">`،
  ويعمل بلا خطوة بناء، ويُحدِّث SDK تلقائياً، ويؤجّل تحميل الحزمة الكاملة حتى أول خطأ (أو مع
  `data-lazy="no"`). ([Loader Script](https://docs.sentry.io/platforms/javascript/install/loader/))
- **الوضع الحالي في المستودع** يخالف ذلك: حزمة CDN مثبَّتة يدوياً على `7.120.3` تُحمَّل فقط إن كان
  `errorDsn` غير فارغ، ثم `Sentry.init({ dsn, release, sendDefaultPii: false })`.
  ([`web/app.js`](../../web/app.js#L326-L343)) تحقّقتُ أن الرابط نفسه يستجيب الآن (HTTP 200،
  `application/javascript`)، لكنه **ليس مسار تركيب موثّقاً حالياً** — أي ترقية له تحتاج قراراً واعياً.
- **[استنتاج]** المطلوب لدعم no-bundler مع الإصدار الجديد: إما Loader من لوحة Sentry، أو الإبقاء على
  الحزمة المثبَّتة وترقيتها مع إضافة `dataCollection` صريح — لا شيء منهما يحتاج bundler.
- بدون source maps (لا بناء ولا تصغير) تصل آثار stack كما هي؛ الوثائق تربط source maps بالملفات
  المصغَّرة فقط. ([Loader Script](https://docs.sentry.io/platforms/javascript/install/loader/))

### 5.2 GlitchTip للويب

**[حقيقة]** وثائق GlitchTip للـJavaScript تعرض `npm install @sentry/browser` فقط، مع
`autoSessionTracking: false`، ولا تعرض Loader ولا CDN. ([sdkdocs/javascript](https://glitchtip.com/sdkdocs/javascript))
**[استنتاج]** عملياً: حزمة CDN نفسها في `web/app.js` مع DSN من GlitchTip — مبدئياً متوافق لأن
المرسَل هو بروتوكول Sentry، لكن هذا **غير موثَّق** ولا يمكن تأكيده بلا حساب/اختبار.

### 5.3 Crashlytics للويب

**[حقيقة]** لا يوجد SDK ويب؛ المنصّات المعلنة iOS+/Android/NDK/Flutter/Unity.
([نظرة عامة](https://firebase.google.com/docs/crashlytics))

---

## 6. Node/Express

### 6.1 Sentry

**[حقيقة]** `@sentry/node` 11.11.0 (نُشر 2026-11-05)، ويشترط Node ≥20.19 (و22.12+ لـ22، و23.2+ لـ23).
([npm](https://www.npmjs.com/package/@sentry/node) · [Express](https://docs.sentry.io/platforms/javascript/guides/express/))
`node:20-alpine` يرضي الشرط متى كان الوسم الحالي ≥20.19 — **[استنتاج]** يجب التحقق من `node -v`
داخل الصورة، فوسم `20` عائم.

الخطوات:

1. أنشئ `server/instrument.js` فيه `Sentry.init({ dsn, dataCollection: {...} })`، وشغّل الخادم بـ
   `node --import ./instrument.js server.js` — أي تعديل `CMD` في [`server/Dockerfile`](../../server/Dockerfile#L27).
   ([Express](https://docs.sentry.io/platforms/javascript/guides/express/))
2. `expressIntegration` يلتقط أخطاء المسارات والـmiddleware تلقائياً و**يتخطى 3xx/4xx**، فلا حاجة
   لمعالج Sentry منفصل. ([Express](https://docs.sentry.io/platforms/javascript/guides/express/))
3. إن أردت التحكم بالتقاط: `Sentry.expressIntegration({ shouldHandleError(error) {...} })`؛ وإن كنت
   تلتقط يدوياً داخل [`errorHandler`](../../server/src/middleware/error.js#L28-L65) فاضبط
   `shouldHandleError: false` كي لا يتكرر الحدث. ([Express](https://docs.sentry.io/platforms/javascript/guides/express/))
4. معالج الأخطاء الحالي يبقى كما هو: Sentry يلتقط ثم يمرّر الخطأ إلى `errorHandler` الذي يشكّل
   استجابة JSON العربية. **[استنتاج]** لا تعارض بين الاثنين ما دام Sentry لا يكتب استجابة بنفسه.
5. أضف `SENTRY_DSN` **صراحةً** إلى `app.environment` في [`docker-compose.yml`](../../docker-compose.yml#L35-L73)؛
   لا `env_file` هناك، فمتغيّر غير مذكور لا يصل الحاوية — نفس فخّ VAPID الموثَّق في الملف.

إعداد الخصوصية المقترح (مفاتيح موثّقة في [Options](https://docs.sentry.io/platforms/javascript/guides/express/configuration/options/#dataCollection)):

```js
dataCollection: {
  userInfo: false,          // لا IP ولا هوية مستخدم
  httpHeaders: false,       // لا headers
  cookies: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false, // استعلامات MySQL تحمل بيانات مستخدمين
  stackFrameVariables: false // متغيّرات محلية قد تحمل كائنات مستخدم
}
```

**[حقيقة]** `userInfo`/`databaseQueryData`/`stackFrameVariables` كلها `true` افتراضياً، والمقتطف أعلاه
يقلبها. ([Options](https://docs.sentry.io/platforms/javascript/guides/express/configuration/options/#dataCollection))

### 6.2 GlitchTip

**[حقيقة]** وثائقهم: `Sentry.init` ثم `Sentry.setupExpressErrorHandler(app)` **قبل** أي middleware
أخطاء آخر، مع `autoSessionTracking: false`. ([sdkdocs/node-express](https://glitchtip.com/sdkdocs/node-express))
**[استنتاج]** إن كان الإصدار المثبَّت حديثاً وقد أزال/غيّر هذه الدالة، فوثيقتهم متأخرة عن Sentry —
تحقّق من واجهة SDK المثبَّتة قبل الاعتماد عليها.

### 6.3 Crashlytics

**[حقيقة]** لا حزمة Node؛ Crashlytics لتطبيقات الموبايل فقط. ([نظرة عامة](https://firebase.google.com/docs/crashlytics))

---

## 7. GlitchTip ذاتي الاستضافة بجانب Compose

**[حقيقة]** نموذج `compose.sample.yml` الرسمي ([الملف](https://glitchtip.com/assets/compose.sample.yml)) يحدد:

- `postgres:18` (مع `max_locks_per_transaction=512` لأن جداول GlitchTip المقسمة تحتاج أقفالاً أكثر)،
  وحجم `pg-data`.
- `valkey:9` **اختياري** — حذفه أو `VALKEY_URL: ""` يستخدم Postgres للطابور والكاش والجلسات.
- `glitchtip/glitchtip:6` بوضع `SERVER_ROLE: all_in_one`، منفذ `8000`، وحجم `uploads`.
- متغيّرات إلزامية: `SECRET_KEY`، `EMAIL_URL`، `DEFAULT_FROM_EMAIL`، `GLITCHTIP_DOMAIN`، `DATABASE_URL`.
- تخفيف الذاكرة إلى 256–512MB: تعطيل Valkey و`GLITCHTIP_ENABLE_LOGS` و`GLITCHTIP_ENABLE_UPTIME`.

**[حقيقة]** المتطلبات: PostgreSQL 14+، وخدمة واحدة أو web+worker منفصلين؛ **512MB RAM موصى بها**،
و**256MB حد أدنى** في all-in-one، و«128 MB + swap» بإعداد حذر. والقرص: «a 1 million event per month
instance may require 30GB of disk». ([التركيب](https://glitchtip.com/documentation/install))

**[حقيقة]** الاحتفاظ: `GLITCHTIP_RETENTION_DAYS=90` افتراضياً، و`GLITCHTIP_EVENT_HOT_DAYS=30`؛
الأحداث تبقى في Postgres «ساخنة» 30 يوماً، ثم تُحذف عند حدّ الاحتفاظ أو تُؤرشف إلى Parquet/DuckDB
إن فُعِّلت الأرشفة (اختيارية). ([التركيب](https://glitchtip.com/documentation/install))

**[استنتاج]** على خادم الإنتاج الموصوف في [`web/config.js`](../../web/config.js#L19-L24) بأنه «معالج واحد
وswap ممتلئة أصلاً»، إضافة Postgres+Valkey+GlitchTip (512MB موصى بها، وقرص ينمو ~30GB لكل مليون
حدث شهرياً) **خطر تشغيلي حقيقي**، وليس مجرد حاوية إضافية. هذا أكبر سبب لعدم اختياره الآن.

---

## 8. التوصية

**الأداة: Sentry السحابي — خطة Developer ($0).**

### لماذا

1. **تغطي الوحدات الثلاث بأداة واحدة وحساب واحد**، وهي الوحيدة بين المرشحين التي تفعل ذلك: Crashlytics
   فلاتر فقط، وGlitchTip يغطيها لكن بحدود أقل. ([نظرة Crashlytics](https://firebase.google.com/docs/crashlytics))
2. **الكلفة صفر فعلياً**: 5٬000 خطأ/شهر و30 يوماً ومستخدم واحد تكفي مالكاً منفرداً؛ والخطة المجانية
   لا تحتاج ترقية. ([تسعير Sentry](https://sentry.io/pricing/))
3. **الطبقة المجانية أكبر من GlitchTip**: 5٬000 مقابل 1٬000 حدث، وGlitchTip يحسب كل معاملة أداء حدثاً
   — أي أن 1٬000 تنفد بسرعة إن فُعِّل التتبّع. ([تسعير GlitchTip](https://glitchtip.com/pricing))
4. **أقل عمل على الويب**: الربط النائم موجود أصلاً في [`web/app.js`](../../web/app.js#L326-L343)،
   ويكفي ضبط `errorDsn` + `dataCollection`؛ لا bundler ولا بناء. ([Loader](https://docs.sentry.io/platforms/javascript/install/loader/))
5. **الخصوصية قابلة للضبط بالوثائق، وليست وعداً**: مفتاح SDK + إعداد مشروع + قاعدة حذف geo، كلها
   منشورة. ([Scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/) ·
   [Data Collected](https://docs.sentry.io/platforms/javascript/data-management/data-collected/))
6. **فلاتر آمن افتراضياً**: لا IP ولا headers ولا هوية بلا `sendDefaultPii=true` — فقط لا تنسخ مقتطف
   الوثائق حرفياً. ([Flutter Data Collected](https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/))

### ما يقلب التوصية

- إن كان الشرط «ألا يصل IP إلى طرف ثالث إطلاقاً» لا «ألا يُخزَّن» → **GlitchTip ذاتي الاستضافة** هو
  الوحيد، بشرط ترقية الخادم (ذاكرة/قرص) وقبول عبء Postgres ونسخ احتياطي وترقيات.
- إن تجاوزت الأخطاء 5٬000/شهر أو احتجت مستخدماً ثانياً في اللوحة → Sentry Team $26/شهر (بالحساب
  السنوي) ([تسعير](https://sentry.io/pricing/)) أو GlitchTip ذاتي الاستضافة $0 + بنية تحتية.
- إن قرر المالك لاحقاً أن الاعتماد على Google مقبول ويريد لوحة Play وحدها → Crashlytics يبقى
  **مكمّلاً** لفلاتر لا بديلاً، لأنه لا يغطي الويب والخادم.

### ما يحتاجه صاحب المنتج يدوياً (لا يستطيع أي وكيل فعله)

1. إنشاء حساب Sentry واختيار **منطقة تخزين البيانات** (US أو EU) — الاختيار **لا يُغيَّر بعد الإنشاء**
   إلا بإنشاء مؤسسة جديدة. ([Data Storage Location](https://docs.sentry.io/organization/data-storage-location/))
2. إنشاء مؤسسة و**ثلاثة مشاريع**: `negev-flutter`، `negev-node`، `negev-web` — ولصق DSN لكل واحد.
3. توليد **Auth Token** لرفع رموز التشويش (صلاحية إصدارات/مشروع)، وحفظه كسرّ بيئة/CI، **لا في git**.
4. إعدادات المشروع في لوحة Sentry: تفعيل «Prevent Storing of IP Addresses»، وإضافة قاعدة
   Advanced Scrubbing لحذف `$user.geo.**`، ومراجعة Inbound Filters. ([Scrubbing](https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/))
5. لصق DSN الويب في [`web/config.js`](../../web/config.js#L26) (DSN عام، ليس سراً)، وإضافة
   `SENTRY_DSN` في `.env` **وسطراً جديداً** في `app.environment` بـ[`docker-compose.yml`](../../docker-compose.yml#L35-L73)
   ثم إعادة بناء `app`.
6. بناء APK بالإصدار الموقّع مع `--obfuscate --split-debug-info` ورفع الرموز، وتشغيل خطأ اختباري
   في كل وحدة والتأكد من وصوله.
7. **تحديث إشعار الخصوصية** ([`server/src/privacyNotice.js`](../../server/src/privacyNotice.js)) ليذكر
   معالِجاً خارجياً جديداً ونوع البيانات، وتحديث نموذج Data safety في Google Play إن كان التطبيق
   منشوراً هناك — قرار قانوني/منتج لا تقني.
8. قرار واعٍ: هل يبقى تتبّع الأعطال خارج مفتاح رفض التحليلات كما هو اليوم؟
   ([`web/app.js`](../../web/app.js#L318-L319)) — القيد الحالي يبرّره بأن تقرير العطل بلا هوية،
   لكن الإعدادات أعلاه هي ما يجعل ذلك صحيحاً فعلاً.

---

## 9. المصادر

**Sentry — الوثائق**
- <https://docs.sentry.io/pricing/>
- <https://docs.sentry.io/organization/data-storage-location/>
- <https://docs.sentry.io/platforms/javascript/install/>
- <https://docs.sentry.io/platforms/javascript/install/loader/>
- <https://docs.sentry.io/platforms/javascript/data-management/data-collected/>
- <https://docs.sentry.io/platforms/javascript/guides/express/>
- <https://docs.sentry.io/platforms/javascript/guides/express/configuration/options/>
- <https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/>
- <https://docs.sentry.io/platforms/dart/guides/flutter/>
- <https://docs.sentry.io/platforms/dart/guides/flutter/manual-setup/>
- <https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/>
- <https://docs.sentry.io/platforms/dart/guides/flutter/debug-symbols/dart-plugin/>
- <https://docs.sentry.io/platforms/dart/guides/flutter/overhead/>
- <https://docs.sentry.io/security-legal-pii/security/mobile-privacy/>

**Sentry — تسعير وحزم**
- <https://sentry.io/pricing/>
- <https://www.npmjs.com/package/@sentry/node>
- <https://www.npmjs.com/package/@sentry/browser>
- <https://pub.dev/packages/sentry_flutter>
- <https://pub.dev/api/packages/sentry_flutter>
- <https://browser.sentry-cdn.com/7.120.3/bundle.min.js> (تحقّق HEAD: 200)

**GlitchTip**
- <https://glitchtip.com/pricing>
- <https://glitchtip.com/documentation/install>
- <https://glitchtip.com/assets/compose.sample.yml>
- <https://glitchtip.com/documentation/hosted-architecture>
- <https://glitchtip.com/documentation/frequently-asked-questions>
- <https://glitchtip.com/documentation/on-demand-billing>
- <https://glitchtip.com/sdkdocs/javascript>
- <https://glitchtip.com/sdkdocs/node-express>
- <https://glitchtip.com/sdkdocs/dart-flutter>
- <https://glitchtip.com/documentation/cli>

**Firebase**
- <https://firebase.google.com/docs/crashlytics>
- <https://firebase.google.com/docs/crashlytics/flutter/get-started>
- <https://firebase.google.com/docs/crashlytics/flutter/customize-crash-reports>
- <https://firebase.google.com/docs/crashlytics/integrate-with-google-play>
- <https://firebase.google.com/pricing>
- <https://pub.dev/packages/firebase_crashlytics>
- <https://pub.dev/api/packages/firebase_crashlytics>

---

## 10. ما لم أتحقق منه — تعذّر الوصول

- **لم أشغّل `flutter` ولا `npm install`** (ممنوع في التذكرة). لذلك: توافق `sentry_flutter` 10.3.0 مع
  نسخة فلاتر المثبَّتة، وتوافق `@sentry/node` مع `node:20-alpine` الفعلي، وحجم الحزمة النهائي في
  APK — كلها غير مثبتة عملياً.
- **لا حسابات** على Sentry أو GlitchTip أو Firebase، لذا لم أرسل حدثاً واحداً ولم أختبر DSN ولا
  رفع الرموز ولا لوحة Crashlytics.
- **مدة احتفاظ Crashlytics** غير مذكورة في الصفحات التي قرأتها (نظرة عامة، البدء، التخصيص، تكامل Play).
  ولم أجد نصاً يثبت جمع IP أو عدمه في Crashlytics، ولا مقبضاً لإطفائه.
- **GlitchTip لا يوثّق** أي إعداد خادم يمنع تخزين IP، ولا إن كان خادمه يشتقّ الموقع الجغرافي من IP. لم أستطع
  التحقق من قراءة مصدر المشروع (خارج نطاقات المصادر المسموحة).
- **حزمة الويب المثبَّتة `7.120.3`**: وثائق الموقع تعرض `latest` (v10/v11)؛ لم أجد وثيقة حالية
  تصف سلوك v7 بدقة، فلا أستطيع تأكيد ما يرسله `sendDefaultPii: false` في v7 من مصدر حالي.
- **Loader لـGlitchTip**: غير موثَّق؛ إن كان موجوداً فلم أعثر عليه في صفحات `glitchtip.com`.
- **صفحات التسعير** (`sentry.io/pricing`، `glitchtip.com/pricing`، `firebase.google.com/pricing`)
  ليست تحت مسارات `docs` المذكورة في قواعد التذكرة؛ اعتمدتها كمصدر أوّلي من البائع، لأن أرقام
  الطبقات المجانية لا توجد في صفحات الوثائق. من يريد الالتزام الحرفي بنطاق `docs` وحده سيجد
  هذه الأرقام غير قابلة للتحقق.
- **حالة Firebase**: المشروع غير منشأ، و`flutterfire configure` يحتاج تسجيل دخول Firebase CLI؛
  لم أحاول.
