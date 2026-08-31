# بحث: التقاط الموقع من GPS في فلاتر — الحزمة والأذونات والحالات الفاشلة

> تذكرة: [#6](https://github.com/thabet-toma/negev-events-app/issues/6) · فرع: `research/gps-capture`
>
> **تاريخ البحث:** `Mon Aug 31 10:34:23 UTC 2026` — مقروء من الطرفية (`date -u`) قبل أي
> استعلام، كما يوجب `engineering-protocol` (MODE A، خطوة 1). **كل رقم إصدار في هذا الملف
> مستخرَج بذلك التاريخ من مصدر رسمي** (‏pub.dev API، مانيفست إصدارات فلاتر الرسمي، GitHub API،
> ‏developer.android.com، ‏MDN) — لا شيء منه من الذاكرة.
>
> **هذا الملف يعرض حقائق ومقارنات فقط. لا يختار التدفّق النهائي — ذاك قرار التذكرة #10.**

---

## 0. الوضع الحالي — تحقّقتُ منه بالكود

| الطبقة | الحالة اليوم | الملف |
|---|---|---|
| الموبايل | حقل نص «اسم المكان / القاعة» + قائمة بلدات منسدلة. **الحمولة المرسلة لا تحوي `latitude` ولا `longitude` إطلاقاً** | `mobile/lib/screens/add_event_screen.dart:120-130` (بناء `fields`) و `:209-231` (الحقول) |
| الموبايل | **لا توجد أي حزمة موقع** في التبعيات | `mobile/pubspec.yaml:30-50` |
| الموبايل | المانيفست فيه `INTERNET` فقط — لا إذن موقع | `mobile/android/app/src/main/AndroidManifest.xml:4` |
| الخادم | **يقبل الإحداثيات بالفعل** عبر `parseCoordinate` | `server/src/routes/events.routes.js:64-65` · `server/src/middleware/validate.js:48-53` |
| الخادم | العمود موجود ويقبل NULL | `server/src/db/schema.sql:27` — `latitude DECIMAL(10,7) DEFAULT NULL` |
| الخادم | يقع على `TOWN_COORDINATES` عند غياب الإحداثيات | `server/src/constants.js` |
| الويب | حقلا رقم يدويّان (`addLat` / `addLng`) يُرسلان كما هما | `web/index.html:219,223` · `web/app.js:588-589` |

**الخلاصة:** الطرف الخادم جاهز تماماً. الفجوة كلها في العميل — الموبايل لا يلتقط شيئاً،
والويب يطلب من المستخدم كتابة رقمين عشريين بيده.

---

## 1. الحزمة

### 1.1 نسخة فلاتر ودارت المستقرّة اليوم

من مانيفست الإصدارات الرسمي لفريق فلاتر
(`https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json`،
وهو ما تقرأه أداة `flutter` نفسها):

| فلاتر | دارت | تاريخ الإصدار |
|---|---|---|
| **3.47.2** (المستقرّ الحالي) | **3.13.2** | 2026-08-27 |
| 3.47.1 | 3.13.1 | 2026-08-19 |
| 3.47.0 | 3.13.0 | 2026-08-12 |

قيد المشروع هو `environment: sdk: ^3.10.4` (قيد **دارت** لا فلاتر) —
ودارت 3.13.2 يحقّقه. الحدّ الأدنى المدعوم لأندرويد في فلاتر المستقرّ هو **API 24**،
ولـiOS هو **15** ([supported-platforms](https://docs.flutter.dev/reference/supported-platforms)).

### 1.2 الحزم — أرقام مثبَّتة من pub.dev API بتاريخ 2026-08-31

استُخرجت من `https://pub.dev/api/packages/<name>` (نقطة الـAPI الرسمية، لا صفحة HTML):

| الحزمة | أحدث **مستقر** | تاريخ نشره | قيود البيئة المعلَنة |
|---|---|---|---|
| [`geolocator`](https://pub.dev/packages/geolocator) | **14.0.3** | 2026-06-12 | `sdk: ^3.5.0`، `flutter: >=2.8.0` |
| `geolocator_android` | **5.0.3** | 2026-06-12 | `sdk: ^3.5.0` |
| `geolocator_web` | **4.1.4** | 2026-06-12 | `sdk: ^3.5.0`، `flutter: >=3.16.0` |
| [`location`](https://pub.dev/packages/location) | **10.0.2** | 2026-07-23 | `sdk: >=3.6.0 <4.0.0`، `flutter: >=3.27.0` |
| [`geocoding`](https://pub.dev/packages/geocoding) | **5.0.0** | 2026-07-03 | `sdk: >=3.3.0 <4.0.0`، `flutter: >=3.0.0` |
| [`permission_handler`](https://pub.dev/packages/permission_handler) | **13.0.1** | 2026-08-11 | `sdk: ^3.6.0`، `flutter: >=3.24.0` |
| `fl_location` | 5.0.0 | **2024-11-13** | مهجورة عملياً — ‎21 شهراً بلا إصدار |
| `geocode` | 1.0.3 | **2023-05-23** | مهجورة عملياً — ‎3 سنوات بلا إصدار |

**كل الأربع الأولى متوافقة مع بيئة المشروع** (دارت 3.13.2 ≥ كل القيود أعلاه).

### 1.3 صحّة الصيانة — geolocator مقابل location

| المؤشر | `geolocator` | `location` |
|---|---|---|
| الناشر | Baseflow.com (موثَّق) | bernos.dev (موثَّق) |
| الترخيص | MIT | MIT |
| نجوم GitHub | 1,334 | 1,158 |
| **قضايا مفتوحة** | **159** | **4** |
| آخر دفعة كود (`pushed_at`) | 2026-08-21 | 2026-08-07 |
| إعجابات pub.dev | 6.13k | 3.2k |
| نقاط pub | 160 | 150 |
| التنزيلات | 2.13M | 205k أسبوعياً |
| المنصّات | Android, iOS, Linux, macOS, Web, Windows | Android, iOS, macOS, Web, Windows, Linux |

المصادر: [GitHub API — Baseflow/flutter-geolocator](https://github.com/Baseflow/flutter-geolocator) ·
[GitHub API — Lyokone/flutterlocation](https://github.com/Lyokone/flutterlocation) · صفحتا pub.dev.

**قراءة الأرقام:** `geolocator` هو المعياري في النظام البيئي (تنزيلات وإعجابات أكثر بكثير)،
لكن كومة قضاياه المفتوحة ‎159 مقابل ‎4. في المقابل `location` خرج للتوّ من دورة صيانة كثيفة:
‎9.0.0 → 10.0.2 كلها في تسعة أيام من يوليو 2026، وتشمل نقل بناء أندرويد إلى AGP 9 / Built-in
Kotlin. أي أن `location` أحدث توافقاً مع سلسلة أدوات أندرويد الجديدة، و`geolocator` أوسع انتشاراً.

### 1.4 صفر واجهات مهجورة — ما يجب تجنّبه بالضبط

**`geolocator` 13.0.0 أهمل ثلاث معاملات** على `getCurrentPosition`
([CHANGELOG](https://github.com/Baseflow/flutter-geolocator/blob/main/geolocator/CHANGELOG.md)):

> **BREAKING CHANGE:** Deprecates `getCurrentPosition` `desiredAccuracy`, `forceAndroidLocationManager`, and `timeLimit` parameters in favor of supplying a `LocationSettings` class.

فالشكل الصحيح اليوم — وهو ما يعرضه README الرسمي:

```dart
final LocationSettings locationSettings = LocationSettings(
  accuracy: LocationAccuracy.high,
  distanceFilter: 100,
);
Position position = await Geolocator.getCurrentPosition(
  locationSettings: locationSettings,
);
```

ولضبط سلوك أندرويد تحديداً تُستعمل `AndroidSettings` (من `package:geolocator_android`)
بدل المعاملات المهجورة.

**`geolocator` 14.0.0 يشترط فلاتر ‎3.29.0 فأعلى** («BREAKING CHANGE: for Flutter `3.27.0`
and below. Make sure you'll upgrade Flutter to `3.29.0` or above») — مُحقَّق عندنا (‏3.47.2).

**`geocoding` 5.0.0 أهمل `setLocaleIdentifier`** لصالح معامل `locale` في مُنشئ
`Geocoding({Locale locale})`، ولفّ كل الدوال داخل صنف `Geocoding`
([CHANGELOG](https://github.com/Baseflow/flutter-geocoding/blob/main/geocoding/CHANGELOG.md)).

### 1.5 فرق وظيفي حاسم بين الحزمتين: تشغيل خدمة الموقع من داخل التطبيق

- **`location`** يعرض `Future<bool> requestService()` صراحةً في واجهته العامة:
  «Show an alert dialog to request the user to activate the Location Service… Returns a boolean…
  (always `false` on iOS)» ([README](https://github.com/Lyokone/flutterlocation/blob/master/packages/location/README.md)).
- **`geolocator`** لا يعرض دالة بهذا الاسم، لكنه **يفعلها ضمنياً**: تحقّقتُ من المصدر —
  [`FusedLocationClient.java`](https://github.com/Baseflow/flutter-geolocator/blob/main/geolocator_android/android/src/main/java/com/baseflow/geolocator/location/FusedLocationClient.java)
  يستدعي `LocationServices.getSettingsClient(context).checkLocationSettings(...)`، وعند
  `ResolvableApiException` يستدعي `rae.startResolutionForResult(activity, ...)` — أي أن مربّع
  Google Play «تشغيل الموقع؟» يظهر داخل التطبيق دون مغادرته. وإن فشل ذلك يبقى
  `Geolocator.openLocationSettings()`.

كلاهما إذن يغطّي الحالة، لكن `location` يجعلها استدعاءً صريحاً و`geolocator` يجعلها أثراً جانبياً.

### 1.6 هل نحتاج `permission_handler`؟

لا لهذه الميزة. كلتا الحزمتين تديران إذن الموقع بنفسيهما
(`Geolocator.checkPermission/requestPermission` أو `location.hasPermission/requestPermission`).
إضافة `permission_handler` 13.0.1 تعني طبقة ثانية تطلب **نفس** الأذونات — تعقيد بلا مقابل
ما لم يظهر لاحقاً إذن آخر (كاميرا/إشعارات) يستحق موحِّداً.

---

## 2. نموذج أذونات أندرويد كما هو اليوم

المصدر الأساس:
[Location permissions](https://developer.android.com/develop/sensors-and-location/location/permissions) ·
[Request location access at runtime](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime) ·
[Access location in the background](https://developer.android.com/develop/sensors-and-location/location/permissions/background)

### 2.1 دقيق مقابل تقريبي — بالأرقام الرسمية

| الإذن | ما تقوله وثيقة Google حرفياً |
|---|---|
| `ACCESS_COARSE_LOCATION` (تقريبي) | «this estimate is accurate to within about **3 square kilometers** (about 1.2 square miles)» — أي نصف قطر ≈ 0.98 كم |
| `ACCESS_FINE_LOCATION` (دقيق) | «this estimate is usually within about **50 meters** (160 feet) and is sometimes as accurate as within **a few meters** (10 feet) or better» |

### 2.2 قاعدة أندرويد 12 (API 31) — لا تطلب `FINE` وحده أبداً

> «don't request the `ACCESS_FINE_LOCATION` permission by itself. Instead, request both the
> `ACCESS_FINE_LOCATION` permission and the `ACCESS_COARSE_LOCATION` permission in a single
> runtime request.»

وإن خالفت:

> «If you try to request only `ACCESS_FINE_LOCATION`, the system **ignores the request** on some
> releases of Android 12… the system logs the following error message in Logcat:
> `ACCESS_FINE_LOCATION must be requested with ACCESS_COARSE_LOCATION.`»

**كلتا الحزمتين تعتمدان على ما تُعلنه أنت في المانيفست**، فالإعلان المزدوج ليس تفصيلاً تجميلياً
بل شرط عمل على أندرويد 12+.

### 2.3 ما يجب أن يدخل `AndroidManifest.xml` بالضبط

لالتقاط لمرّة واحدة والتطبيق مفتوح (وهو كل ما تحتاجه هذه الميزة) — سطران فقط،
**أبناء مباشرون لوسم `<manifest>`**، أي فوق `<application>` تماماً حيث يجلس `INTERNET` اليوم:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
```

**ولا شيء غيرهما.** تحديداً:

| الإذن | متى يلزم | يلزمنا؟ |
|---|---|---|
| `ACCESS_BACKGROUND_LOCATION` | «On Android 10 (API level 29) and higher, you must declare [it] in your app's manifest in order to request background location access at runtime» | ❌ — لا تتبّع في الخلفية |
| `FOREGROUND_SERVICE_LOCATION` | أندرويد 14 (API 34) فأعلى، عند تشغيل خدمة أمامية للموقع ([README geolocator](https://pub.dev/packages/geolocator)) | ❌ — لا خدمة أمامية |

شرطان إضافيان يذكرهما README الخاص بـ`geolocator`: **AndroidX مفعَّل**، و**`compileSdkVersion` ≥ 35**.
عندنا `compileSdk = flutter.compileSdkVersion` في `mobile/android/app/build.gradle.kts`، أي أن
القيمة تتبع نسخة فلاتر — وفلاتر ‎3.47 يتجاوز ‎35، فلا تعديل مطلوب هنا على الأرجح، لكنها نقطة تُتحقَّق
عند التنفيذ لا تُفترض.

### 2.4 كيف يبدو مربّع النظام للمستخدم فعلياً

على **أندرويد 12 (API 31) فأعلى**، وحين يُطلب `FINE` و`COARSE` معاً، يعرض النظام:

- **خيارَي دقّة** في أعلى المربّع: **دقيق (Precise)** — «Allows your app to get precise location
  information» · **تقريبي (Approximate)** — «Allows your app to get only approximate location
  information». الافتراضي المحدَّد هو ما طلبتَه.
- **ثلاثة أزرار مدّة**: **أثناء استخدام التطبيق (While using the app)** ·
  **هذه المرّة فقط (Only this time)** · **رفض (Deny)**.

ماذا يُمنَح فعلياً (جدول Google):

| اختيار المستخدم | الممنوح |
|---|---|
| دقيق + أثناء الاستخدام | `ACCESS_FINE_LOCATION` و `ACCESS_COARSE_LOCATION` |
| دقيق + هذه المرّة فقط | `ACCESS_FINE_LOCATION` و `ACCESS_COARSE_LOCATION` |
| تقريبي + أثناء الاستخدام | `ACCESS_COARSE_LOCATION` فقط |
| تقريبي + هذه المرّة فقط | `ACCESS_COARSE_LOCATION` فقط |
| رفض | لا شيء |

**نتيجة عملية:** التطبيق **لا يستطيع** إجبار المستخدم على الدقّة العالية. عليه أن يقبل
احتمال وصول تثبيت بدقّة كيلومتر — وأن يقرأ `position.accuracy` (نصف القطر الأفقي التقديري
بالأمتار؛ «not available on all devices. In these cases the value is 0.0» —
[`position.dart:54-58`](https://github.com/Baseflow/flutter-geolocator/blob/main/geolocator_platform_interface/lib/src/models/position.dart))
ويقرّر على أساسه.

### 2.5 الخلفية — لماذا هي خارج النطاق ومكلِفة

على **أندرويد 11 (API 30) فأعلى**:

> «the system dialog doesn't include the **Allow all the time** option. Instead, users must enable
> background location on a settings page»

أي أن أي ميزة خلفية تتطلّب شاشة تعليمية داخل التطبيق تعرض التسمية التي يراها المستخدم
(`getBackgroundPermissionOptionLabel()`) ثم ترسله إلى الإعدادات يدوياً. لا حاجة لأي من هذا
لالتقاط لحظي أثناء ملء النموذج.

### 2.6 فخّ لا يظهر في أي دليل حزمة: إعادة ضبط الأذونات تلقائياً

[App hibernation](https://developer.android.com/topic/performance/app-hibernation):
التطبيقات التي تستهدف **API 30 فأعلى** تُعاد ضبط أذونات التشغيل لها تلقائياً بعد
«a few months» بلا تفاعل، والسلوك **مُرحَّل إلى أندرويد 6–10 عبر خدمات Google Play**
(اعتباراً من ديسمبر 2021). وعند عودة المستخدم: «Permissions are NOT re-granted — user must
manually re-grant them».

**الأثر:** لا يجوز تخزين «الإذن ممنوح» في `shared_preferences` والاعتماد عليه. يجب فحص
الإذن في كل مرّة قبل كل التقاط.

---

## 3. الحالات الفاشلة — وبديل لكل واحدة

أسماء الأخطاء من مصدر `geolocator_android`
([`ErrorCodes.java`](https://github.com/Baseflow/flutter-geolocator/blob/main/geolocator_android/android/src/main/java/com/baseflow/geolocator/errors/ErrorCodes.java))
ومن README الرسمي.

| # | الحالة | كيف تُكتشف | البديل / المخرج المتاح |
|---|---|---|---|
| 1 | **خدمة الموقع مطفأة** | `Geolocator.isLocationServiceEnabled()` == false · خطأ `LOCATION_SERVICES_DISABLED` («Location services are disabled…») | `geolocator` يحاول أولاً حلّاً تلقائياً عبر `SettingsClient` + `startResolutionForResult` (مربّع Google داخل التطبيق). وإن فشل: `Geolocator.openLocationSettings()`. البديل في `location`: `requestService()` صراحةً. **المخرج الأخير في كل الأحوال: الإدخال اليدوي.** |
| 2 | **رفض الإذن (قابل للتكرار)** | `LocationPermission.denied` — «You are free to request permission again (this is also the initial permission state)» | إظهار مبرِّر عربي ثم `requestPermission()` مرّة أخرى. **لا حلقة**: طلب واحد إضافي كحدّ أقصى. |
| 3 | **الرفض الدائم** | `LocationPermission.deniedForever` — «the permission dialog will not be shown until the user updates the permission in the App settings». وثيقة Google: «if the user taps Deny… **more than once** during your app's lifetime… The user's action implies "don't ask again," and is considered a permanent denial» ([requesting permissions](https://developer.android.com/training/permissions/requesting)) | `Geolocator.openAppSettings()` فقط — لا يوجد طريق برمجي آخر. **وهنا بالذات يجب أن يبقى المسار اليدوي عاملاً إلى الأبد.** ⚠️ **قيد جوهري:** على أندرويد لا يستطيع `checkPermission()` كشف الرفض الدائم إطلاقاً — «Android can only return `whileInUse`, `always` or `denied` when checking permissions… the geolocator is only able to do so as a result of the `requestPermission` method». |
| 4 | **انتهت المهلة** | `TimeoutException` عند ضبط `timeLimit` داخل `LocationSettings` — «When the time limit is passed a `TimeoutException` will be thrown and the call will be cancelled. **By default no limit is configured**» | ضبط مهلة صريحة **إلزامي** (الافتراضي بلا حدّ = تعليق إلى الأبد). ثم: `Geolocator.getLastKnownPosition()` كتقدير أوّلي، وإلّا إحداثيات البلدة، وإلّا اليدوي. |
| 5 | **جهاز بلا مستشعر / تعذّر التثبيت** | `ERROR_WHILE_ACQUIRING_POSITION` · `getLastKnownPosition()` يعيد `null` (مصرَّح بهذا في README) · `position.accuracy == 0.0` أي أن الدقّة غير متاحة | السقوط إلى `TOWN_COORDINATES` (موجود على الخادم أصلاً) ثم اليدوي. |
| 6 | **إعلان مفقود في المانيفست** | `PERMISSION_DEFINITIONS_NOT_FOUND` — «No location permissions are defined in the manifest…» | خطأ برمجي لا خطأ مستخدم. **هذه هي حالتنا الحرفية اليوم** — المانيفست فيه `INTERNET` فقط. |
| 7 | **لا Activity** | `ACTIVITY_MISSING` — «This might happen when running a certain function from the background that requires a UI element» | لا يُطلب الموقع إلّا من شاشة مرئية. |
| 8 | **إعادة ضبط الإذن بعد سبات** | لا خطأ خاص — الإذن ببساطة `denied` من جديد | راجع §2.6: افحص الإذن في كل التقاط، ولا تخزّنه. |
| 9 | **الموقع تقريبي رغم طلب الدقيق** | `Geolocator.getLocationAccuracy()` يعيد `LocationAccuracyStatus.reduced` · أو `position.accuracy` كبير | ليست حالة فشل بل تدرّج جودة — تُعرَض للمستخدم لا تُخفى. |

**البديل الجذري الموجود مسبقاً:** الخادم يسقط على `TOWN_COORDINATES` عند غياب الإحداثيات،
والويب يعرض حقلَي إدخال يدوي (`addLat`/`addLng`). فأي تدفّق GPS **إضافة** فوق مسار عامل،
لا استبدال له — ولا يجوز أن يجعل نموذج الإضافة غير قابل للإرسال في أي من الحالات التسع أعلاه.

---

## 4. الترجيع العكسي — هل يمكن اشتقاق بلدة من `TOWNS`؟

### 4.1 اختبار حيّ أجريتُه على Nominatim (2026-08-31)

استعلمتُ الترجيع العكسي عند **الإحداثيات المخزَّنة فعلياً** في `TOWN_COORDINATES`
(`accept-language=ar`، `zoom=12`، مع `User-Agent` معرِّف، وبفاصل ‎2 ثانية بين الطلبات
التزاماً بسياسة الاستعمال):

| البلدة في `TOWNS` | ما أعاده Nominatim عند الإحداثي المخزَّن | مطابق؟ |
|---|---|---|
| رهط | `رهط` | ✅ |
| حورة | `حورة` | ✅ |
| اللقية | `اللقية` (كـ`village`) | ✅ |
| تل السبع | **`عومر`** | ❌ بلدة أخرى |
| عرعرة النقب | **`ديمونة`** | ❌ بلدة أخرى |
| كسيفة | *(لا اسم بلدة إطلاقاً — دولة ومنطقة فقط)* | ❌ |
| شقيب السلام | *(لا اسم بلدة إطلاقاً)* | ❌ |

**‏3 من 7 فقط.** لكن السبب ليس الخدمة.

### 4.2 السبب الحقيقي: `TOWN_COORDINATES` نفسها مغلوطة

بحثتُ عن الأسماء العربية السبعة نصّياً في Nominatim (بحث أمامي، `countrycodes=il`) —
**السبعة كلها موجودة على OSM بأسمائها العربية**. ثم قارنتُ الإحداثيات:

| البلدة | المخزَّن في `constants.js` | إحداثي OSM | **الفارق** |
|---|---|---|---|
| رهط | 31.3925, 34.7554 | 31.393364, 34.754678 | **118 م** |
| اللقية | 31.3260, 34.8720 | 31.324231, 34.863202 | **859 م** |
| تل السبع | 31.2483, 34.8431 | 31.245649, 34.857768 | **1,425 م** |
| حورة | 31.2858, 34.9312 | 31.298567, 34.926782 | **1,480 م** |
| شقيب السلام | 31.2062, 34.8210 | 31.194398, 34.840581 | **2,278 م** |
| عرعرة النقب | 31.1890, 35.0120 | 31.157671, 35.013021 | **3,485 م** |
| **كسيفة** | 31.2980, 35.0310 | 31.245249, 35.095151 | **8,460 م** |

*(المسافات بصيغة Haversine على نصف قطر ‎6,371 كم.)*

ثم أعدتُ الترجيع العكسي **عند إحداثيات OSM** بنفس المعاملات:

| البلدة | ما أعاده Nominatim | مطابق حرفياً لـ`TOWNS`؟ |
|---|---|---|
| رهط · حورة · تل السبع · كسيفة · شقيب السلام · اللقية · عرعرة النقب | نفس الاسم بالضبط | ✅ **7 / 7** |

**الاستنتاج الموثَّق:** OpenStreetMap يعرف البلدات السبع **بحروفها العربية كما تكتبها
`TOWNS` تماماً**، والترجيع العكسي بالعربية يعمل. الخلل الحالي في بيانات المشروع لا في الخدمة —
`TOWN_COORDINATES['كسيفة']` بعيد ‎8.46 كم عن كسيفة الحقيقية، وهذا يعني عملياً أن كل عرس في
كسيفة يُرسم اليوم على الخريطة خارج البلدة.

> ⚠️ **`'القرى والتجمعات'` ليست مكاناً جغرافياً**، بل فئة إدارية في القائمة. **لا يوجد
> جيوكودر في العالم سيعيدها.** أي اشتقاق آلي للبلدة يحتاج قاعدة صريحة لهذا العنصر
> (سلّة افتراضية أو استبعاد من الاشتقاق).

### 4.3 الخدمات — تكلفة، حدود، ودعم العربية

| الخدمة | مفتاح؟ | التكلفة | حدود الاستعمال | العربية |
|---|---|---|---|---|
| **`geocoding` 5.0.0** (‏`android.location.Geocoder` + `CLGeocoder` أصليّان) | ❌ لا مفتاح | **مجاني** | غير موثَّقة رسمياً؛ توثيق الحزمة: «when a `PlatformException(IO_ERROR, ...)` gets thrown, most of the times it means that the **rate limit** has been reached» | نعم — معامل `locale` في `Geocoding({Locale locale})` |
| **Nominatim (OSM)** | ❌ | **مجاني** | **حدّ أقصى مطلق ‎1 طلب/ثانية** · `User-Agent`/`Referer` معرِّف إلزامي («stock User-Agents… will not do») · **«Results must be cached on your side»** · الاستعلامات المنهجية والإكمال التلقائي «strictly forbidden and will get you banned» · الإسناد إلزامي | ✅ — **مُثبَت ‎7/7 أعلاه** |
| **Google Geocoding API** (Essentials، SKU `BAC8-4E68-E261`) | ✅ + فوترة | **10,000 طلب/شهر مجاناً**، ثم: ‎$5.00/ألف (10,001–100k) · ‎$4.00 (100k–500k) · ‎$3.00 (500k–1M) · ‎$1.50 (1M–5M) · ‎$0.38 (5M+). واشتراك Essentials ‎$275/شهر مقابل ‎100,000 نداء | ‎25 QPS افتراضياً (v4) · ‎3,000 طلب/دقيقة | ✅ (`language=ar`) |
| **LocationIQ** | ✅ | مجاني ‎5,000/يوم · Developer ‎$100/شهر (‏25k/يوم) · Startup ‎$200/شهر (‏60k/يوم) | ‎2 req/s في المجاني، ‎20–22 في المدفوع | مبني على OSM |
| **OpenCage** | ✅ | تجربة ‎2,500/يوم (للاختبار فقط) · X-Small ‎€45/شهر (‏10k/يوم) · Small ‎€110/شهر (‏30k/يوم) | ‎1 req/s في التجربة، ‎15–40 في المدفوع · **التخزين الدائم للنتائج مسموح** | مبني على OSM |

**قيد بنيوي في `geocoding` (المسار الأصلي) لا يظهر إلّا في وثيقة أندرويد:**
`android.location.Geocoder` «may not be present on all devices. Check the result of `isPresent()`
before attempting to use the Geocoder» — الخدمة مدعومة بخلفية شبكية مرتبطة بخدمات Google Play،
فتغيب على الأجهزة بلا Play Services. وتوثيق الحزمة نفسه يقول إن مستخدمي البلدان بلا دعم
Play Services «may need a VPN connection».

**عن الإهمال:** `Geocoder.getFromLocation(double,double,int)` **مهجورة منذ API 33**
([API 33 diff](https://developer.android.com/sdk/api_diff/33/changes/android.location.Geocoder))
لصالح النسخة غير المتزامنة `getFromLocation(..., GeocodeListener)`. تحقّقتُ من مصدر الحزمة:
[`GeocoderProxyApi.kt`](https://github.com/Baseflow/flutter-geocoding/blob/main/geocoding_android/android/src/main/kotlin/com/baseflow/geocoding/proxies/GeocoderProxyApi.kt)
يعرض المسارين — `@RequiresApi(TIRAMISU)` للنسخة الحديثة و`@DeprecatedSinceApi(33)` للقديمة —
أي أن **`geocoding` 5.0.0 نظيف من هذه الناحية** ولا يجرّ تحذير إهمال إلينا.

### 4.4 البديل صفري التكلفة: أقرب بلدة محلياً

`TOWNS` قائمة **مغلقة من ثمانية عناصر** بإحداثيات معروفة على الخادم. اشتقاق البلدة لا يحتاج
أي خدمة خارجية: أقرب مركز بمسافة Haversine. حسبتُ لكل بلدة نصف المسافة إلى أقرب جارة —
وهو نصف القطر الذي يكون فيه «أقرب مركز» غير ملتبس:

| البلدة | أقرب جارة | المسافة | **نصف المسافة** |
|---|---|---|---|
| تل السبع | القرى والتجمعات | 3.74 كم | **1.87 كم** |
| القرى والتجمعات | تل السبع | 3.74 كم | **1.87 كم** |
| شقيب السلام | تل السبع | 5.13 كم | 2.57 كم |
| حورة | القرى والتجمعات | 5.65 كم | 2.82 كم |
| اللقية | حورة | 7.18 كم | 3.59 كم |
| كسيفة | حورة | 9.58 كم | 4.79 كم |
| عرعرة النقب | كسيفة | 12.25 كم | 6.13 كم |
| رهط | اللقية | 13.31 كم | 6.66 كم |

أضيق هامش هو **1.87 كم**. وبما أن حتى الموقع **التقريبي** (`COARSE`) دقيق ضمن «3 كم²»
أي نصف قطر ≈ **0.98 كم**، فإن أقرب-مركز يبقى صحيحاً حتى حين يختار المستخدم «تقريبي» —
**بشرط تصحيح `TOWN_COORDINATES` أولاً**. بالإحداثيات الحالية (خطأ حتى ‎8.46 كم) لا يصحّ.

مزايا هذا المسار: صفر تكلفة، صفر مفاتيح، صفر حدود، صفر تبعية شبكية، ونتيجة **دائماً** من
`TOWNS` فلا يرفضها الخادم. وعيبه: لا يعطي «اسم القاعة»، ولا يفرّق بين بلدة ومحيطها الريفي،
و`'القرى والتجمعات'` يبقى شاذّاً. وأدواته موجودة أصلاً: `latlong2` (`Distance()`) في
`pubspec.yaml`، أو `Geolocator.distanceBetween()`.

---

## 5. الدقّة الواقعية

### 5.1 في الهواء الطلق

[GPS.gov — GPS Accuracy](https://www.gps.gov/gps-accuracy) (المصدر الرسمي للحكومة الأمريكية):

> «GPS-enabled smartphones are typically accurate to within a **4.9 m (16 ft.) radius under open
> sky**. However, their accuracy **worsens near buildings, bridges, and trees**.»

وعن خطأ الإشارة نفسها:

> «The government commits to broadcasting the GPS signal in space with a daily global average
> user range error (URE) of **≤2.0 m (6.6 ft.), with 95% probability**» — وفي ‎2021-04-20 كان
> المقيس ‎≤0.643 م. لكن الوثيقة تحذّر صراحةً: «**URE is not user accuracy.** User accuracy depends
> on a combination of satellite geometry, URE, and local factors such as **signal blockage**,
> atmospheric conditions, and receiver design».

### 5.2 داخل قاعة

**لا توجد جهة رسمية تنشر رقماً واحداً للدقّة داخل المباني** — وهذا بحدّ ذاته نتيجة البحث.
ما يمكن الاستناد إليه من مصادر أولية:

1. GPS.gov يعدّ حجب الإشارة بالمباني، والانعكاس عن الجدران («multipath»)، أول أسباب تدهور الدقّة.
2. داخل مبنى خرساني تُحجب أقمار GNSS فعلياً، ويقع `FusedLocationProvider` على Wi-Fi والأبراج.
   والحدّ الأعلى الذي تلتزم به Google لهذا المسار هو ما تقوله وثيقة الأذونات نفسها عن
   `ACCESS_FINE_LOCATION`: «**usually within about 50 meters**».
3. لذلك الرقم الوحيد الذي يُبنى عليه قرار هندسي ليس تقديراً نظرياً بل **القيمة التي يعيدها
   الجهاز في اللحظة نفسها**: `position.accuracy` — «The estimated horizontal accuracy of the
   position in meters… not available on all devices. In these cases the value is 0.0».

**الأثر على هذا المشروع:** لتثبيت «بلدة» يكفي ‎50 م بمراحل (أضيق هامش ‎1.87 كم — §4.4).
أمّا لتثبيت **دبّوس القاعة** على الخريطة فـ‎50 م داخل قاعة تعني دبّوساً قد يقع على مبنى مجاور،
ويصير التقاط الموقع من داخل القاعة أثناء الحفل أضعف من التقاطه من ساحة المواقف.

---

## 6. الويب

الواجهة عندنا **HTML/JS عادي بلا خطوة بناء**، فلا `geolocator_web` ولا أي حزمة —
النداء يكون على `navigator.geolocation` مباشرةً.

### 6.1 الدعم

[caniuse — geolocation](https://caniuse.com/geolocation) (بيانات ‎2026-08-31):
**96.69%** من المستخدمين المتتبَّعين، وMDN تصنّفها **Baseline · Widely available**
(«available across browsers since **July 2020**»).
الدعم الكامل بدأ من: Chrome 5 · Firefox 3.5 · Safari 5 · Edge 12 · iOS Safari 3.2 · Samsung Internet 4.
ملاحظة caniuse الوحيدة على كل المتصفحات: **«Only works on secure (https) servers»**.

### 6.2 شرط HTTPS — غير قابل للتفاوض

- MDN: «This feature is available only in **secure contexts (HTTPS)**»
  ([Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)).
- Chrome منذ **الإصدار 50** (‏2016-04-20): «Chrome no longer supports obtaining the user's location
  using the HTML5 Geolocation API from pages delivered by **non-secure connections**»
  ([Chrome Developers](https://developer.chrome.com/blog/geolocation-on-secure-contexts-only)).
  الفشل يأتي كـ`PositionError` **رمز 1** برسالة «Only secure origins are allowed» —
  أي أنه **يبدو للمستخدم رفضاً للإذن، لا خطأ نشر**.
- **`localhost` مستثنى** («declared as 'potentially secure' in the spec»)، فالتطوير المحلي يعمل
  والإنتاج على HTTP لا يعمل — أخطر شكل للعطل: يمرّ الاختبار ويفشل الإنتاج صامتاً.

`README.md` يوجّه أصلاً إلى Nginx مع شهادة TLS (القسم «قبل النشر على سيرفر خارجي»، الخطوة 4)،
فالشرط مغطّى **إن نُفّذ**.

### 6.3 الواجهة البرمجية والحالات الفاشلة

```js
navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
```

`PositionOptions` والقيم الافتراضية (MDN):

| الخيار | الافتراضي | المعنى |
|---|---|---|
| `enableHighAccuracy` | `false` | `true` = دقّة أعلى، أبطأ وأكثر استهلاكاً للبطارية (تشغيل شريحة GPS) |
| `timeout` | **`Infinity`** | «`getCurrentPosition()` won't return until the position is available» — **يجب ضبطه صراحةً** |
| `maximumAge` | `0` | `0` = ممنوع استعمال موقع مخبَّأ · `Infinity` = أعد المخبَّأ مهما بلغ عمره |

`GeolocationPositionError` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError)):

| القيمة | الثابت | الحالة |
|---|---|---|
| **1** | `PERMISSION_DENIED` | المستخدم رفض — **أو** الصفحة على HTTP — **أو** حجبتها Permissions Policy |
| **2** | `POSITION_UNAVAILABLE` | فشل مصدر داخلي للموقع |
| **3** | `TIMEOUT` | انقضت المهلة قبل الحصول على الموقع |

⚠️ **الرمز 1 يجمع ثلاث حالات مختلفة تماماً** — لا يمكن التمييز بينها من الرمز وحده،
ورسالة عربية واحدة لن تكون صادقة في الثلاث.

### 6.4 شكل الإذن للمستخدم

المتصفح يعرض شريطاً/نافذة صغيرة تحت شريط العنوان: «يريد الموقع معرفة موقعك» مع
«سماح/حظر». وتنصّ MDN: «Users must grant explicit permission via a prompt when either
`getCurrentPosition()` or `watchPosition()` is called (unless the permission state is already
`granted` or `denied`)» — أي أن الاستدعاء الثاني بعد حظر دائم **لا يُظهر أي شيء** ويعود
بالرمز 1 فوراً، تماماً كنظير أندرويد `deniedForever`. وحالة الإذن تُقرأ مسبقاً بـ
`navigator.permissions.query({ name: 'geolocation' })` → `granted` / `denied` / `prompt`.

### 6.5 الإطارات (iframes)

قائمة السماح الافتراضية هي `self` — أي الإطارات من نفس الأصل فقط. لتمكين إطار من أصل آخر يلزم:

```http
Permissions-Policy: geolocation=(self b.example.com)
```
```html
<iframe src="https://b.example.com" allow="geolocation"></iframe>
```

غير ذي أثر اليوم (لا نُضمِّن الموقع في إطار)، لكنه يصير حاسماً إن استُضيفت الواجهة داخل WebView
أو إطار طرف ثالث.

---

## 7. جدول ما يجب تثبيته (لو مضى القرار — قرار #10 لا هذا الملف)

| العنصر | القيمة المثبَّتة | مصدرها |
|---|---|---|
| فلاتر / دارت | 3.47.2 / 3.13.2 | مانيفست الإصدارات الرسمي، 2026-08-27 |
| `geolocator` | `^14.0.3` | pub.dev API، 2026-06-12 |
| `location` | `^10.0.2` | pub.dev API، 2026-07-23 |
| `geocoding` (إن لزم) | `^5.0.0` | pub.dev API، 2026-07-03 |
| أذونات المانيفست | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` معاً، لا غير | developer.android.com/…/permissions/runtime |
| واجهة الالتقاط | `LocationSettings` / `AndroidSettings` — **لا** `desiredAccuracy` ولا `timeLimit` ولا `forceAndroidLocationManager` كمعاملات | geolocator CHANGELOG 13.0.0 |
| مهلة الويب | `timeout` صريح (الافتراضي `Infinity`) | MDN `PositionOptions` |
| شرط الويب | HTTPS إلزامي؛ `localhost` مستثنى | MDN + Chrome 50 |

---

## 8. أسئلة مفتوحة تخصّ #10 (لا يجيب عنها هذا البحث)

1. `TOWN_COORDINATES` مغلوطة حتى **8.46 كم**. تصحيحها ميزة مستقلة أم شرط مسبق لأي اشتقاق آلي للبلدة؟
2. هل نشتق البلدة آلياً أصلاً، أم يبقى الاختيار يدوياً والـGPS يملأ الدبّوس فقط؟
   (الخادم يرفض أي قيمة خارج `TOWNS`، فالاشتقاق يجب أن يُسقَط على القائمة لا أن يُرسَل خاماً.)
3. `'القرى والتجمعات'` — كيف يُعامَل في أي اشتقاق آلي؟
4. الخصوصية: إحداثيات القاعة تصير **علنية على الخريطة** لكل زائر. الالتقاط التلقائي يرفع دقّة
   ما يُنشَر عن منزل/قاعة عائلة بعينها. هذا سؤال منتَج لا سؤال تقني.
5. اللحظة: التقاط عند فتح النموذج (قبل الإذن، مزعج) أم بزر «حدّد موقعي» صريح؟
6. الويب: هل يُستبدل حقلا الرقم اليدويان (`addLat`/`addLng`) أم يبقيان كمخرج أخير؟

---

## 9. المصادر

**pub.dev / حزم**
- https://pub.dev/packages/geolocator · https://pub.dev/api/packages/geolocator
- https://pub.dev/packages/location · https://pub.dev/api/packages/location
- https://pub.dev/packages/geocoding · https://pub.dev/api/packages/geocoding
- https://pub.dev/packages/permission_handler
- https://github.com/Baseflow/flutter-geolocator (README · CHANGELOG · `ErrorCodes.java` · `FusedLocationClient.java` · `position.dart`)
- https://github.com/Lyokone/flutterlocation (README · CHANGELOG)
- https://github.com/Baseflow/flutter-geocoding (CHANGELOG · `GeocoderProxyApi.kt`)

**فلاتر**
- https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json
- https://docs.flutter.dev/reference/supported-platforms
- https://docs.flutter.dev/release/archive

**أندرويد**
- https://developer.android.com/develop/sensors-and-location/location/permissions
- https://developer.android.com/develop/sensors-and-location/location/permissions/runtime
- https://developer.android.com/develop/sensors-and-location/location/permissions/background
- https://developer.android.com/training/permissions/requesting
- https://developer.android.com/topic/performance/app-hibernation
- https://developer.android.com/reference/android/location/Geocoder
- https://developer.android.com/sdk/api_diff/33/changes/android.location.Geocoder

**الترجيع العكسي**
- https://operations.osmfoundation.org/policies/nominatim/
- https://nominatim.openstreetmap.org/ (اختبارات حيّة، 2026-08-31)
- https://developers.google.com/maps/billing-and-pricing/pricing (محدَّثة 2026-08-25)
- https://developers.google.com/maps/documentation/geocoding/usage-and-billing
- https://mapsplatform.google.com/pricing/
- https://locationiq.com/pricing · https://opencagedata.com/pricing

**الدقّة والويب**
- https://www.gps.gov/gps-accuracy
- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPositionError
- https://developer.chrome.com/blog/geolocation-on-secure-contexts-only
- https://caniuse.com/geolocation
