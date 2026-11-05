# تدقيق: أين تقف «أعراسنا» أمام معايير التطبيق الاحترافي

> تذكرة: [#133](https://github.com/thabet-toma/negev-events-app/issues/133) · فرع: `research/pro-audit`
>
> **تاريخ الفحص:** `2026-11-05` — قراءة فقط. لم أعدّل أي ملف غير هذا، ولم أشغّل
> `npm install` ولا الخادم ولا أي اختبار، ولم أكتب على GitHub.
>
> **هذا الملف يطابق الكود بالمعايير فقط.** لا يقترح معماريّة جديدة ولا يقرّر أولويات
> المنتج — الأثر والجهد هنا تقديران مؤسَّسان على ما في المستودع، لا على خطة إطلاق.

---

## 0. الملخّص في ثلاثة أسطر

1. **الامتثال لسياسات Play شبه مكتمل:** حذف الحساب من داخل التطبيق موجود وفوري ومحمي
   برمز الدخول، وسياسة الخصوصية منشورة، وصفحة حذف بلا تطبيق موجودة، والأذونات محدودة
   ومبرَّرة في المانيفست.
2. **الفجوة الكبرى ليست سياسات بل رؤية:** لا يوجد **أي** تتبّع أعطال في التطبيق
   (لا Crashlytics ولا Sentry)، والويب يملك ربط Sentry **نائماً** بمفتاح فارغ، والخادم
   لا يملك سوى `console`. أي عطل يُبلَّغ عنه اليوم يأتي من المستخدم على واتساب.
3. **الأداء والوصولية هما التكلفة اليومية على هواتف النقب المتوسطة/الضعيفة:** صور
   المناسبات تُحمَّل بحجمها الأصلي في الويب، و`app.js` وحده 465 كيلوبايت غير مصغَّر،
   وأربع عائلات خطوط وLeaflet وChart.js تُحجب الرسم في `<head>`، والتكبير باللمس ممنوع
   في `index.html`، وعشرات الأزرار أصغر من 48dp.

---

## 1. المنهج وحدود الفحص

| ما فعلته | التفصيل |
|---|---|
| قرأت الكود | `web/` (index.html, app.js, api.js, config.js, manifest.json, sw.js, privacy.html, delete-account.html, styles.css), `mobile/lib/` (main, theme, api/, state/, widgets/, screens/ ذات الصلة), `server/src/` (app.js, routes/privacy.routes.js, routes/auth.routes.js, routes/app.routes.js, services/auth.service.js, services/privacy.service.js, middleware/upload.js, constants.js, db/schema.sql) |
| قرأت الوثائق | `CLAUDE.md`، `README.md`، `docs/adr/0004-self-hosted-app-updates.md` |
| تحقّقت من كل رابط مصدر | سحبتُ كل روابط الملف (٣٦ رابطاً فريداً) وفحصت كل واحد طلباً حقيقياً: كلها أعادت `200`. واحد فقط أعاد `404` (`web.dev/articles/uses-optimized-images`) فاستُبدل بمساره الصحيح على `developer.chrome.com` |
| **لم أشغّل** | `npm test`، الخادم، `flutter test`، `flutter analyze`، Lighthouse، أي قياس Core Web Vitals حقيقي |
| **لم أتحقّق منه** | حالة Play Console (نموذج Data safety، أرقام Android vitals الفعلية)، وتهيئة nginx للإنتاج (ليست في المستودع) |

**نتيجة مهمة مترتّبة على ذلك:** أحكام الأداء هنا **استنتاجية من حجم الأصول وترتيب الوسوم**،
لا من قياس. الرقم الوحيد المؤكَّد هو أحجام الملفات على القرص. أي حكم Core Web Vitals في
هذا الملف يجب أن يُقرأ بـ«خطر مرجَّح» لا «قياس».

**تمييز مقصود:** «الأثر» هنا = احتمال أن يمنع المستخدم من التثبيت أو يجعله يهجر
التطبيق. «الجهد» = صغير (ساعات/يوم)، متوسط (أيام)، كبير (أسبوع أو أكثر).

---

## 2. الجدول: المعيار · المصدر · حالتنا · الدليل · الأثر · الجهد

### 2.1 Google Play

| المعيار | المصدر | حالتنا | الدليل (مسار:سطر) | الأثر | الجهد |
|---|---|---|---|---|---|
| تتبّع الانهيار ومعدّل ANR (Android vitals) | [Crashes](https://developer.android.com/topic/performance/issues/crash) · [ANRs](https://developer.android.com/topic/performance/issues/anr) | **ناقص** | لا حزمة تتبّع في التبعيات: `mobile/pubspec.yaml:30-58`؛ ولا خطّاف خطأ عام في أي ملف من `mobile/lib/` (بحث عن `FlutterError.onError` و`PlatformDispatcher.onError` و`runZonedGuarded` = صفر) | عالٍ | متوسط |
| حذف الحساب من داخل التطبيق | [App account deletion](https://support.google.com/googleplay/android-developer/answer/13327111) | **موجود** | `mobile/lib/screens/account_screen.dart:258` (الصفّ)، `:1150-1255` (تأكيد + رمز PIN)؛ الخادم: `server/src/routes/auth.routes.js:209-215` ← `server/src/services/auth.service.js:280-301` | — | — |
| حذف الحساب من الويب (بلا تطبيق) | [App account deletion](https://support.google.com/googleplay/android-developer/answer/13327111) | **جزئي** | الصفحة والمسار موجودان: `web/delete-account.html:155-168`، `server/src/routes/privacy.routes.js:78-96` (ردّ موحّد يمنع استكشاف الأرقام). **لكن التنفيذ يدوي**: `server/src/services/privacy.service.js:26-30`، والمهلة ٣٠ يوماً نصّ لا وظيفة مجدولة: `server/src/constants.js:191`. وتطبيق الويب نفسه لا يحمل زرّ حذف حساب إطلاقاً (`web/index.html:819-835` = رفض التحليلات وحذف بياناتها فقط) | متوسط | صغير |
| سياسة خصوصية منشورة ومُشار إليها | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) | **جزئي** | الويب: `web/privacy.html:138-148` وربطها من `web/index.html:1014`؛ والخادم يولّد نصّ الإشعار: `server/src/routes/privacy.routes.js:37-39` و`server/src/privacyNotice.js:96`. **وتطبيق فلاتر لا يعرضها ولا يربطها**: كتلة «الخصوصية» في `mobile/lib/screens/account_screen.dart:1066-1131` فيها مفتاح الإحصاءات وحذفها فقط، ولا مستهلك لـ`/api/privacy/notice` في `mobile/lib/` | متوسط | صغير |
| تقليل جمع البيانات وإخفاء الهوية | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) | **موجود** | لا IP ولا User-Agent في السجل: `server/src/app.js:58-66`؛ جدول التحليلات بلا `ip`/`user_agent` عمداً: `server/src/db/schema.sql:730-766`؛ احتفاظ ٩٠ يوماً ثم طيّ: `server/src/services/analytics.service.js:19` | — | — |
| الأذونات (الحد الأدنى) | [Permissions](https://support.google.com/googleplay/android-developer/answer/9888170) | **موجود** | `mobile/android/app/src/main/AndroidManifest.xml:5-16`: `INTERNET`، `ACCESS_FINE/COARSE_LOCATION` (بمبرّر مكتوب: التقاط لمرّة واحدة)، `RECEIVE_BOOT_COMPLETED` لإعادة جدولة المنبّهات. لا موقع خلفي، ولا `QUERY_ALL_PACKAGES`، ولا `SCHEDULE_EXACT_ALARM` | — | — |
| In-App Review API | [In-App Reviews](https://developer.android.com/guide/playcore/in-app-review) | **ناقص** | لا حزمة `in_app_review` (`mobile/pubspec.yaml:30-58`)، ولا زرّ «قيّمنا» ولا رابط للمتجر في أي شاشة | متوسط | صغير |
| In-App Updates API | [In-App Updates](https://developer.android.com/guide/playcore/in-app-updates) · [ADR-0004](../adr/0004-self-hosted-app-updates.md) | **بديل مقصود** | التوزيع ذاتي الاستضافة هو الأصل (ADR-0004:105-111)، و`in_app_updates` لا يصل إلا النسخ المثبَّتة من المتجر — فلا يغطي أغلب الأجهزة هنا. البديل قائم ويعمل: `server/src/routes/app.routes.js:19-28` + `mobile/lib/state/update_checker.dart:40-70` + `mobile/lib/widgets/update_dialog.dart:17-44` | — | — |

### 2.2 Android و Material Design 3

| المعيار | المصدر | حالتنا | الدليل (مسار:سطر) | الأثر | الجهد |
|---|---|---|---|---|---|
| Material 3 مفعّل | [Material 3](https://m3.material.io/) | **جزئي** | `useMaterial3: true` في `mobile/lib/theme.dart:230`، لكن المخطّط `copyWith` على ألوان مخصّصة لا `ColorScheme.fromSeed`: `mobile/lib/theme.dart:237-244` | منخفض | صغير |
| أول تشغيل يشرح **قيمة** التطبيق | [Onboarding](https://m2.material.io/design/communication/onboarding.html) | **ناقص** | الموجود ورقة **سؤال منطقة** لا تعريفاً: عنوانها «من أي منطقة أنت؟» `mobile/lib/widgets/region_onboarding_sheet.dart:286` ونصّها `:297-300`، وتُعرض من `mobile/lib/screens/home_shell.dart:68-90`. الويب لا يملك أي شيء مقابل: لا طبقة ترحيب، وأقرب شيء توست بعد الدخول `web/app.js:9085` | عالٍ | متوسط |
| الحالات الفارغة بفعل | [Empty states](https://m2.material.io/design/communication/empty-states.html) | **جزئي** | الموبايل: نصّ فقط بلا زرّ `mobile/lib/screens/events_screen.dart:1486-1517` (السحب للتحديث يعمل، لكن لا CTA). الويب: رسالة بلا زرّ أيضاً `web/app.js:2433-2441` | متوسط | صغير |
| RTL كامل | [Bidirectionality](https://m2.material.io/design/usability/bidirectionality.html) | **موجود** | `web/index.html:2`، `web/manifest.json:5-6`، `mobile/lib/main.dart:284-290` (locale `ar` + مندوبي الترجمة). لا `EdgeInsets.only(left/right)` غير متماثل في الموبايل | — | — |
| أهداف لمس ≥ 48dp | [Accessibility](https://m2.material.io/design/usability/accessibility.html) | **جزئي** | الويب: `.nav-btn` مضبوط على 48px (`web/styles.css:2077`) لكن `.nav-capsule` 36px (`:2102`)، أزرار عائمة 34px (`:2747-2748`)، وشريط التعميم 26px (`:167-168` و`:198-199`). الموبايل: `IconButton` الافتراضي 48dp | متوسط | صغير |

### 2.3 WCAG 2.2

| المعيار | المصدر | حالتنا | الدليل (مسار:سطر) | الأثر | الجهد |
|---|---|---|---|---|---|
| 1.1.1 نصّ بديل | [Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) | **جزئي** | الويب جيّد: كل `<img>` مولَّد في `web/app.js` يحمل `alt` (مثال `:2336`, `:6182`, `:7727`)، والزخرفي `alt=""` مع `aria-hidden` (`web/index.html:943-968`). الموبايل: صفر `semanticLabel`، والبديل `tooltip` (٣٦ من ٤١ `IconButton`) | متوسط | متوسط |
| 1.4.3 تباين النصّ | [Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | **موجود** | `--ink #0c1b2a` / `--ink-soft #47617a` / `--ink-faint #4f6c83` على `#ffffff` (`web/styles.css:9-11`) ⇒ ≈17:1 و6.4:1 و5.5:1؛ ولون العلامة خُفِّض قصداً من 4.37:1 إلى 4.94:1 بتعليق يشرح الرقم (`:18-20`). الاستثناء: حالة التعطيل `opacity: .55` (`:644`) تسقط تحت AA | — | — |
| 1.4.4 تكبير النصّ / التكبير باللمس | [Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | **ناقص** | `web/index.html:5`: `maximum-scale=1.0, user-scalable=no` — يمنع قرصة التكبير على صفحة التغذية، وهي أكثر صفحة تُقرأ. الصفحات المساعدة نظيفة (`web/about.html:5`, `web/privacy.html:5`, `web/delete-account.html:5`) | عالٍ | صغير |
| 2.5.8 هدف اللمس 24px (AA) و2.5.5 ‏44px (AAA) | [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | **جزئي** | تمرّ AA لكنها تحت 44: `.floating-icon-btn` 34px (`web/styles.css:2747-2748`)، `.theme-toggle-btn` 38px (`:408`)، وأزرار 26px في الشريط (`:167-168`, `:198-199`) | متوسط | صغير |
| 2.4.7 تركيز مرئي | [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) | **جزئي** | ست قواعد `:focus-visible` فقط (مثل `web/styles.css:2115`, `:4058`, `:4122`)، و`outline: none` بلا بديل في حقل الدرج `web/styles.css:2983` (ومعه `:825`, `:1557` ولهما حلقة بديلة) | متوسط | صغير |
| 4.1.3 رسائل الحالة | [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | **جزئي** | منطقة حيّة واحدة في الصفحة كلها: `web/index.html:363` (`role="status" aria-live="polite"`). والتوست، وهو أهمّ تأكيد عابر، `div` بلا `role` ولا `aria-live`: `web/app.js:9943-9958` | منخفض | صغير |
| 1.3.1 / 4.1.2 علاقات وأسماء الحوارات والتبويبات | [Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) | **جزئي** | ست حوارات لها `role="dialog" aria-modal` (`web/index.html:1502, 1532, 1782, 1826, 1840, 1863`) وباقيها بلا دور (`:1054-1620`)، ولا `aria-selected` على `role="tablist"` (`:1799-1802`)، ولا مصيدة تركيز في أي حوار | منخفض | متوسط |

### 2.4 web.dev — PWA وCore Web Vitals

المرجع العام لهذا القسم: [Core Web Vitals](https://web.dev/articles/vitals) — ثلاثة مقاييس
(LCP وCLS وINP) تُقاس في الميدان، ولا شيء منها مقيسٌ هنا (انظر حدود الفحص في §1).

| المعيار | المصدر | حالتنا | الدليل (مسار:سطر) | الأثر | الجهد |
|---|---|---|---|---|---|
| قابلية التثبيت (مانيفست + HTTPS) | [Install criteria](https://web.dev/articles/install-criteria) · [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) | **موجود** | `web/manifest.json:1-18`: `name`/`short_name` و`icons` 192 و512 (ومعها `maskable`) و`start_url` و`display: standalone` وبلا `prefer_related_applications`. وربط المانيفست `web/index.html:14`، وأيقونة iOS `:81` | — | — |
| دعوة تثبيت مخصّصة (`beforeinstallprompt`) | [Customize install](https://web.dev/articles/customize-install) | **ناقص** | لا معالج للحدث في `web/app.js`؛ الموجود إرشاد **سفاري وحده** `web/index.html:1666-1681` ومنطقه `web/app.js:478-496`. مستخدم أندرويد — وهو الأغلب هنا — لا يُدعى أبداً | متوسط | صغير |
| العمل بلا اتصال / تخزين مؤقت | [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | **ناقص** | `web/sw.js:8-75`: مستمعو `install` و`activate` و`push` و`notificationclick` فقط — **لا `fetch` ولا `cache`**. عامل الخدمة موجود للدفع وحده، فانقطاع الشبكة = شاشة فارغة. التسجيل في `web/app.js:9464-9485` | متوسط | متوسط |
| LCP (أصول حاجبة + حجم الحزمة) | [LCP](https://web.dev/articles/lcp) | **ناقص** | أربع عائلات خطوط/١٣ وجهاً `web/index.html:88`، Font Awesome `:91`، Leaflet CSS `:94`، **Chart.js غير مثبَّت الإصدار** `:97`، Leaflet JS `:100` — كلها في `<head>` بلا `defer`/`async`. والحزمة: `web/app.js` ‎465,722‎ بايت (‏9,972 سطراً) و`web/styles.css` ‎176,846‎ بايت، بلا تصغير ولا خطوة بناء | عالٍ | متوسط |
| صور الويب بحجمها الأصلي | [Uses optimized images](https://developer.chrome.com/docs/lighthouse/performance/uses-optimized-images) | **ناقص** | كرت التغذية يطلب `poster_url` كاملاً: `web/app.js:2336` (ومثله `:2665`, `:3065`) بلا `srcset` ولا تحويل ولا مقاس. والرفع مسقوف بـ1600px وجودة 85-90 (`web/app.js:5821-5825`, `mobile/lib/screens/add_event_screen.dart:99`) — أي ≈200–500 كيلوبايت للصورة، ×30 كرتاً في الصفحة الأولى | عالٍ | متوسط |
| CLS | [CLS](https://web.dev/articles/cls) | **جزئي** | `.card-media` ارتفاعه `min-height: 180px` لا `aspect-ratio`، و`<img>` بلا `width`/`height` (`web/styles.css:1025-1043`) ⇒ قفزة عند وصول الصورة. بعض المكوّنات الأخرى سليمة (`:4636`, `:5095`) | متوسط | صغير |
| INP | [INP](https://web.dev/articles/inp) | **غير مقيس** | لا قياس متاح في هذا الفحص؛ `web/app.js` يُعيد رسم التغذية كاملة بـ`innerHTML` (`:2451`) وهو خطر مرجَّح لا مؤكَّد | متوسط | كبير |
| `theme-color` يتبع الوضع | [MDN theme-color](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name/theme-color) | **ناقص** | ثابت `#eef2f6` في `web/index.html:15`، والوضع الداكن موجود (`web/app.js:281-295`) فلا يتغيّر شريط المتصفّح معه | منخفض | صغير |

### 2.5 تتبّع الأعطال والأخطاء

| المعيار | المصدر | حالتنا | الدليل (مسار:سطر) | الأثر | الجهد |
|---|---|---|---|---|---|
| تتبّع في تطبيق فلاتر | [Crashlytics](https://firebase.google.com/docs/crashlytics) · [Sentry Flutter](https://docs.sentry.io/platforms/flutter/) | **ناقص** | لا حزمة (`mobile/pubspec.yaml:30-58`) ولا خطّاف عام. الفشل يُبتلع أو يُطبع: `mobile/lib/state/analytics.dart:50-52`، `mobile/lib/state/update_checker.dart:67`. وشارة الاستثناءات غير المعالَجة تبقى شاشة حمراء للمستخدم وبيانات صفر لنا | عالٍ | متوسط |
| تتبّع في الويب | [Sentry](https://docs.sentry.io/platforms/javascript/) | **ناقص عملياً** | الربط مكتوب (`web/app.js:326-343`) لكنه مشروط بـ`errorDsn`، وهو فارغ بالنصّ: `web/config.js:26` ⇒ لا يُحمَّل سكربت ولا يُرسل تقرير واحد. الشرط نفسه في `web/app.js:329` | عالٍ | صغير (بعد توفير خادم استقبال) |
| تتبّع في الخادم | [Sentry Node](https://docs.sentry.io/platforms/javascript/guides/node/) | **ناقص** | `server/src/utils/logger.js:1-17` مجرّد غلاف `console`، و`server/src/middleware/error.js:55-56` يسجّل `method + url + stack` فقط. لا معرّف طلب، ولا تجميع أخطاء، ولا تنبيه. (الجانب الجيد: لا يُسجَّل جسم طلب ولا PII) | متوسط | متوسط |

---

## 3. أهم ١٠ نواقص — مرتّبة بالأثر على الإقبال ثم الجهد

الترتيب: أثر عالٍ أولاً، وداخل الأثر الواحد الأقل جهداً أولاً. (ترتيب تنفيذ لا تصنيف
خطورة تقنية: أخطر ما في الملف هو الأداء، وأسرع ما فيه سطر `<meta>` واحد.)

**1. لا رؤية لأعطال المستخدمين — في تطبيق ولا ويب ولا خادم** · أثر **عالٍ** · جهد **متوسط**
`mobile/pubspec.yaml:30-58` بلا أي SDK، و`web/config.js:26` بلا DSN، و`server/src/utils/logger.js:1-17`
مجرد `console`. النتيجة: أي انهيار على هاتف ضعيف في رهط أو اللد لا يترك أثراً، وأول من
يعلم هو صاحب العرس الذي اختفى تطبيقه. أصغر خطوة: `Sentry` في فلاتر بخطّاف
`FlutterError.onError` + `PlatformDispatcher.onError`، ومفتاح الويب الذي بُني أصلاً
(`web/app.js:326-343`) يُملأ متى وُجد خادم استقبال.

**2. الصور والحزمة تُثقِل هواتف النقب المتوسطة** · أثر **عالٍ** · جهد **متوسط**
كرت التغذية يجلب الملصق الأصلي (`web/app.js:2336`) بلا تحويل ولا مقاس، والعشرات في
الصفحة الأولى، وفوقها `app.js` ‎465KB‎ و`styles.css` ‎177KB‎ غير مصغَّرين، وأربع عائلات
خطوط وثلاث مكتبات CDN تحجب الرسم في `<head>` (`web/index.html:88-100`) وإحداها
(Chart.js, `:97`) غير مثبَّتة الإصدار. أصغر خطوة مؤثّرة: صور مصغّرة للملصق على الخادم
أو عبر Cloudinary (البنية موجودة أصلاً للألبومات: `server/src/services/cloudinary.service.js:137-145`)،
وتثبيت Chart.js، و`defer` على ما ليس ضرورياً للشاشة الأولى.

**3. الموقع يُثبَّت لكن لا يُدعى ولا يعمل بلا اتصال** · أثر **عالٍ** · جهد **صغير**
المانيفست يستوفي شروط التثبيت كاملة (`web/manifest.json:1-18`)، وهذا إنجاز. لكن لا
`beforeinstallprompt` (`web/app.js:478-496` سفاري فقط)، وعامل الخدمة بلا `fetch` ولا
كاش (`web/sw.js:8-75`) ⇒ لا دعوة تثبيت على أندرويد ولا عمل عند انقطاع الشبكة.
أصغر خطوة: معالج `beforeinstallprompt` يعيد استخدام نفس `#installHint`، وكاش صغير
لهيكل الصفحة والملفات الثابتة.

**4. التشغيل الأول لا يبيع التطبيق** · أثر **عالٍ** · جهد **متوسط**
أول ما يواجه المستخدم هو «من أي منطقة أنت؟» (`mobile/lib/widgets/region_onboarding_sheet.dart:286`)،
وفي الويب لا شيء. لا شاشة تقول له ما الذي يفعله هذا التطبيق في ثلاث ثوانٍ: مناسبات
بلدته، ألبومات الأعراس، دفتر النقوط. أصغر خطوة: صفحة/شاشة واحدة (شعار + جملة واحدة +
ثلاث بطاقات) قبل ورقة المنطقة، وزرّ «تخطّي» يبقى كما هو.

**5. التكبير باللمس ممنوع في أكثر صفحة تُقرأ** · أثر **عالٍ** · جهد **صغير**
`web/index.html:5` فيها `maximum-scale=1.0, user-scalable=no`. جمهور كبار السن
وقليلو البصر هو جمهور هذه المنصّة بالضبط، والصفحات الثلاث المساعدة تضبطها صحيحة
(`web/about.html:5` وغيرها) — أي أن الإصلاح سطر واحد ويوحّد السلوك.

**6. الحالة الفارغة طريق مسدود** · أثر **متوسط** · جهد **صغير**
عندما لا توجد مناسبات قادمة في المحافظة، يرى المستخدم نصّاً فقط بلا فعل
(`mobile/lib/screens/events_screen.dart:1486-1517`، و`web/app.js:2433-2441`). أخطر
حالة فارغة في المنتج هي أول تجربة لمستخدم جديد في بلدة هادئة. أصغر خطوة: زرّ واحد
«أضف مناسبتك» أو «وسّع النطاق إلى كل المحافظات» داخل الحالة نفسها.

**7. لا يُطلب من المستخدم تقييم** · أثر **متوسط** · جهد **صغير**
لا حزمة `in_app_review` ولا زرّ تقييم في أي شاشة. ولأن التوزيع الأساسي اليوم APK ذاتيّ
الاستضافة (وبجانبه صفحة على Play)، فرضا المستخدم لا يتحوّل تلقائياً إلى إشارة عامة.
ملاحظة مهمة: `In-App Review` من Play لا يعمل إلا لنسخ مثبَّتة من المتجر — فإن بقي
التوزيع الذاتي هو الأصل فالأصغر «قيّمنا» يفتح صفحة المتجر في المتصفّح ويكفي.

**8. أهداف لمس صغيرة وتركيز غير مرئي** · أثر **متوسط** · جهد **صغير**
26px للتعميم و34px للأزرار العائمة و38px لزرّ الوضع (`web/styles.css:167-168`,
`:198-199`, `:2747-2748`, `:408`)، وست قواعد `:focus-visible` فقط مع `outline: none`
بلا بديل في `web/styles.css:2983`. أصغر خطوة: قاعدة `:focus-visible` عامة، وحدّ
أدنى 44px للأزرار العائمة (التمرير على الشاشات الصغيرة مضبوط أصلاً فالعمل صغير).

**9. تطبيق فلاتر لا يعرض سياسة الخصوصية ولا يربطها** · أثر **متوسط** · جهد **صغير**
`/api/privacy/notice` عام وجاهز (`server/src/routes/privacy.routes.js:37-39`) والنصّ
مولَّد بالعربية أصلاً (`server/src/privacyNotice.js:96`)، لكن `mobile/lib/` لا تستهلكه،
وكتلة «الخصوصية» (`mobile/lib/screens/account_screen.dart:1066-1131`) تحمل مفتاحين
فقط. قد يكون هذا مقبولاً في Play Console (الرابط العام كافٍ) لكنه ليس سياسة خصوصية
«داخل التطبيق» بالمفهوم المتعارف عليه.

**10. حذف الحساب من الويب وعدٌ بلا ساعة** · أثر **متوسط** · جهد **متوسط**
الصفحة والمسار مصمَّمان جيداً (ردّ موحّد بلا تسريب وجود الرقم: `server/src/routes/privacy.routes.js:87-95`،
وحدّ ٥ طلبات/ساعة: `:28-34`)، لكن التنفيذ يدوي في طابور سوبر أدمن بلا عمر ولا تنبيه،
والمهلة ٣٠ يوماً نصّ في `server/src/constants.js:191` لا شيء يفرضه. أصغر خطوة: عمود
`due_at` لكل طلب وشارة «متأخر» في اللوحة، وإلا فالأولوية أن يعرض تطبيق الويب زرّ
حذف حقيقي لحساب مسجَّل الدخول.

---

## 4. ما نفعله جيداً بالفعل

| ما هو | لماذا هو جيد | الدليل |
|---|---|---|
| **حذف الحساب مصمَّم كسياسة لا كزرّ** | إعادة تحقق بكلمة السر نفسها (PIN) كي لا يحذف رمز مسروق حساباً، وحذف فوري بلا انتظار بريد، و`DELETE` لا `POST` كي تبقى النية عبر الوسائط، وحدّ ادعاء صريح: الرمز لا يُبطَل | `server/src/routes/auth.routes.js:202-215` · `server/src/services/auth.service.js:255-301` |
| **مسار حذف بلا تطبيق لا يكشف من له حساب** | ردّ متطابق حرفياً للمسجَّل والمكرَّر والغريب، والنتيجة الحقيقية تُهلَك قصداً، وحدّ أشدّ من العام على المسار الوحيد القابل للاستكشاف | `server/src/routes/privacy.routes.js:28-34`, `:78-96` |
| **الخصوصية كقائمة مغلقة معلنة** | كل حدث تحليل معرَّف في مكان واحد باسم عربي مقروء، والنصّ يُولَّد منه، وحدثان يُكتبان بلا هوية قصداً (`countOnly`)، والاحتفاظ ٩٠ يوماً ثم طيّ إلى عدّادات مجهولة | `server/src/constants.js` (‏`ANALYTICS_EVENTS`) · `server/src/db/schema.sql:730-766` · `server/src/services/analytics.service.js:19` |
| **سجل الخادم بلا IP ولا User-Agent** | تعليق يشرح أنه تعمّد إسقاطهما (مبدأ الغرض سقفاً)، فالوعي في سياسة الخصوصية مسنود بالكود | `server/src/app.js:58-66` |
| **سياسة تحديث ذاتية الاستضافة مكتملة القصة** | المقارنة في العميل، `min_version` حوار غير قابل للإغلاق، فشل الفحص صامت، وتوقيع المفتاح وتدوير النسب موثَّقان — وهذا سقف التوزيع خارج المتجر بصدق | `docs/adr/0004-self-hosted-app-updates.md:16-43`, `:70-103` · `mobile/lib/state/update_checker.dart:40-70` · `mobile/lib/widgets/update_dialog.dart:17-44` |
| **مانيفست PWA كامل لغير المطوّر** | `lang`/`dir` و`maskable` و`apple-touch-icon` وإرشاد سفاري اليدوي، مع تعليق يشرح لماذا لا يُحذف وسم Apple | `web/manifest.json:1-18` · `web/index.html:8-19`, `:81`, `:1666-1681` |
| **نظام ألوان يعرف رياضياته** | لون العلامة خُفِّض من 4.37:1 إلى 4.94:1 بتعليق يذكر الرقمين، ولون النصّ الأساسي 17:1، ووضع داكن كامل عبر متغيّرات لا عبر ملف ثانٍ | `web/styles.css:1-40` (والتعليق `:18-20`) · `web/app.js:281-295` |
| **صور مُحسَّنة عند الرفع ومُخدَّمة عند الطلب — حيث تعمل** | قصّ وتصغير 1600px بجودة 85-90 قبل الرفع، و`f_auto,q_auto` ونسخة 600px للألبومات، و`cached_network_image` مع `placeholder` و`errorWidget` في التغذية والألبومات | `mobile/lib/screens/add_event_screen.dart:99`, `:457-468` · `web/app.js:5821-5825` · `server/src/services/cloudinary.service.js:137-145` · `mobile/lib/widgets/event_card.dart:761-806` |
| **كل شيء يفشل بهدوء إلا ما يستحق أن يُعلَن** | التحليلات والتحديث والتتبّع كلها صامتة عند الفشل، والتغذية وحدها تعرض خطأً + «إعادة المحاولة»، و`AsyncView` يفرّق بين الخطأ والفراغ | `mobile/lib/screens/events_screen.dart:1457-1483` · `mobile/lib/widgets/async_view.dart:26-110` |
| **أمان ميزانيّ بلا زخرفة** | `helmet`، وحدّان للطلبات (مجهول لكل IP وموثَّق لكل مستخدم) كي لا يستهلك رفعُ ألبوم حصةَ غيره، ولا `express.static` للواجهة من الخادم | `server/src/app.js:43-53`, `:68-93`, `:114-123` |
| **فحص صحة يقرأ قاعدة البيانات فعلاً** | `/health` يجري `SELECT 1` ويعيد 503 عند التدهور بدل `200` كاذب — أي أن مراقباً خارجياً يعرف الفرق بين «الخادم حيّ» و«الخادم يخدم» | `server/src/app.js:96-103` |

---

## 5. ملاحظات جانبية اكتُشفت أثناء الفحص (خارج نطاق التذكرة)

هذه ليست من معايير التذكرة، وتُركت كما هي عمداً — تُذكر فقط كي لا تُنسى:

| الملاحظة | الدليل |
|---|---|
| `Chart.js` يُحمَّل من `jsdelivr` بلا إصدار ⇒ تغيّر رئيسي قد يكسر دفتر النقوط بلا تغيير سطر واحد عندنا | `web/index.html:97` |
| CSP معطَّل في `helmet` بلا سياسة بديلة | `server/src/app.js:43-48` |
| أزرار ومنطقة إدخال المحادثة (`chat-send-btn`، `emoji-chip`) مستعملة في HTML بلا قاعدة CSS إطلاقاً ⇒ ارتفاعها هو ارتفاع المتصفّح الافتراضي | `web/index.html:1117-1128` مقابل غيابها من `web/styles.css` |
| مهلة الـ٣٠ يوماً وطابور الطلبات لا شيء يشغّلهما دورياً: لا وظيفة في `server/src/jobs/` تقرأ `privacy_requests` | `server/src/constants.js:191` · `server/src/services/privacy.service.js:26-30` |
| `analytics` ٩٠ يوماً: الاستدعاء الدوري خارج `src/` (في `server/server.js`) فالذي يقرأ `src/jobs/` وحده قد يظنّها لا تعمل | `server/src/services/analytics.service.js:107-129` |

---

## 6. المراجع — كل ما استُشهد به

**Google Play**
1. [Crashes — App quality](https://developer.android.com/topic/performance/issues/crash)
2. [ANRs — App quality](https://developer.android.com/topic/performance/issues/anr)
3. [Understanding app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
4. [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
5. [Permissions and APIs that access sensitive information](https://support.google.com/googleplay/android-developer/answer/9888170)

**Android وMaterial**
6. [Google Play In-App Reviews API](https://developer.android.com/guide/playcore/in-app-review)
7. [In-app updates](https://developer.android.com/guide/playcore/in-app-updates)
8. [Material 3](https://m3.material.io/)
9. [Onboarding — Material](https://m2.material.io/design/communication/onboarding.html)
10. [Empty states — Material](https://m2.material.io/design/communication/empty-states.html)
11. [Bidirectionality — Material](https://m2.material.io/design/usability/bidirectionality.html)
12. [Accessibility — Material](https://m2.material.io/design/usability/accessibility.html)

**WCAG 2.2 (W3C)**
13. [WCAG 2.2 — Recommendation](https://www.w3.org/TR/WCAG22/)
14. [Understanding SC 1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)
15. [Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
16. [Understanding SC 1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
17. [Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
18. [Understanding SC 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
19. [Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
20. [Understanding SC 1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)

**web.dev وPWA**
21. [Core Web Vitals](https://web.dev/articles/vitals)
22. [What does it take to be installable?](https://web.dev/articles/install-criteria)
23. [How to provide your own in-app install experience](https://web.dev/articles/customize-install)
24. [Largest Contentful Paint (LCP)](https://web.dev/articles/lcp)
25. [Cumulative Layout Shift (CLS)](https://web.dev/articles/cls)
26. [Interaction to Next Paint (INP)](https://web.dev/articles/inp)
27. [Uses optimized images](https://developer.chrome.com/docs/lighthouse/performance/uses-optimized-images)
28. [Making PWAs installable — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

**المتصفّح (MDN)**
29. [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
30. [`theme-color` — meta name](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name/theme-color)

**تتبّع الأعطال**
31. [Firebase Crashlytics](https://firebase.google.com/docs/crashlytics)
32. [Sentry for Flutter](https://docs.sentry.io/platforms/flutter/)
33. [Sentry for JavaScript](https://docs.sentry.io/platforms/javascript/)
34. [Sentry for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/)
