import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/agenda_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/screens/my_list_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/region_store.dart';
import 'package:negev_events/state/welcome.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// شعار «اعراسنا» في ترويسة الهيكل — تذكرة #157 — والترويسة الغنية حوله —
/// تذكرة #174.
///
/// ما يُثبَت هنا: الشعار أصلٌ مولَّد (`assets/brand/mark-full.png`، طبقة `full`
/// بمقاسها المنطقي ٧٢px) ونسخة واحدة فوق الوجهات الثلاث؛ والنقر عليه من وجهة
/// ثانية يعيد إلى «المناسبات»؛ وعلى «المناسبات» نفسها يصعد بالقائمة إلى أولها
/// **بلا فلتر يتغيّر ولا تغذية تُجلب**. وحوله في الترويسة نفسها: «أهلاً، الاسم»
/// للمسجَّل وحده، وكبسولة المحافظة التي تحمل اسمها من الخادم وتفتح ورقة
/// المحافظة القائمة، وقلب «قائمتي»، وزرّ الأجندة — والشريط السفلي ثلاث وجهات.
///
/// ولا شيء من هذا يمسّ «تفاصيل مناسبة» و«حسابي»: الشعار في الهيكل تحتها،
/// والشاشات المدفوعة تغطّيها بخلفيتها و«رجوع + عنوان» كما هي.

Map<String, dynamic> _eventRow(int id, String day) => {
      'id': id,
      'title': 'مناسبة $id',
      'groom_name': 'اسم $id',
      'town': 'رهط',
      'event_date': day,
    };

/// عميل وهمي يوجّه حسب المسار: ثلاث مناسبات (تكفي لصفحتَي `PageView`)، وقصص
/// وأنواع فارغة، وبلدات الخادم (لا قائمة في العميل). [requests] يلتقط الطلبات
/// كي يُثبَت أنّ الشعار لم يُحدث جلباً.
NegevApi _shellApi({List<Uri>? requests}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    http.Response ok(Object body) => http.Response(
          jsonEncode(body),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );

    final path = request.url.path;
    if (path.endsWith('/api/stories')) {
      return ok({'success': true, 'stories': <Map<String, dynamic>>[]});
    }
    if (path.endsWith('/api/occasion-types')) {
      return ok({'success': true, 'types': <Map<String, dynamic>>[]});
    }
    if (path.endsWith('/api/towns')) {
      return ok({
        'success': true,
        'towns': ['الكل', 'رهط', 'حورة'],
        // محافظةٌ من الخادم وحده — الترويسة الغنية (#174) تحمل اسمها ولا
        // تكتبه، وورقة المحافظة ترسم حباتها من هذه القائمة نفسها.
        'regions': [
          {
            'id': 1,
            'name': 'النقب',
            'latitude': 31.2858,
            'longitude': 34.8431,
            'map_zoom': 9,
            'position': 1,
            'towns': ['رهط', 'حورة'],
          },
        ],
        'villages': <Map<String, dynamic>>[],
        'town_coordinates': <String, dynamic>{},
        'stats': <Map<String, dynamic>>[],
      });
    }
    if (path.endsWith('/api/events')) {
      return ok({
        'success': true,
        'events': [
          _eventRow(401, '2026-09-20'),
          _eventRow(402, '2026-09-21'),
          _eventRow(403, '2026-09-22'),
        ],
        'pagination': {'page': 1, 'limit': 30, 'total': 3, 'totalPages': 1},
        'announcements': <Map<String, dynamic>>[],
      });
    }
    return ok({'success': true});
  });
  return NegevApi(ApiClient(client: client));
}

/// الهيكل كما يُبنى في `main.dart`: `AppServices` فوق `MaterialApp` (مسارُ
/// التفاصيل المدفوع يحتاجها من خارج التغذية)، وورقة أول تشغيل مُعلَنة الطرح.
///
/// و[navigatorKey] هو مفتاح `main.dart` نفسه: قلب «قائمتي» في الترويسة الغنية
/// يفتح شاشته من هناك (`AppServices.openMyList`) كما يفتحها التطبيق الحقيقي،
/// فبلا هذا المفتاح لا يصل الدفع إلى متنقّل الاختبار.
///
/// و[auth] جلسةٌ جاهزة (مسجَّلة أو زائرة) حين يهمّ الاختبار حال الحساب؛
/// والافتراضي مخزنٌ لم يُحمَّل بعد = زائر.
///
/// ونافذة أعلى من الافتراضية (٨٠٠×٦٠٠): الترويسة شريطٌ حقيقي فوق التغذية،
/// فالكرت لا يفيض في ارتفاع هاتف فعلي. هذا ارتفاع نافذة الاختبار، لا تخطيط
/// الشاشة. و[statusBarPadding] يحاكي شريط الحالة على جهاز حقيقي — الافتراضي
/// في الاختبارات صفر، فلا يُرى أثر منطقة الأمان إطلاقاً.
Future<void> _pumpShell(
  WidgetTester tester,
  NegevApi api, {
  double statusBarPadding = 0,
  AuthStore? auth,
}) async {
  tester.view.physicalSize = const Size(800, 2000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  SharedPreferences.setMockInitialValues({regionOnboardedKey: true, welcomeSeenKey: true});

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth ?? AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        navigatorKey: navigatorKey,
        theme: AppTheme.light(),
        // الحشوة تُحقن فوق الـ`Navigator` كي تقرأها الشاشات كما تقرأ حشوة
        // الجهاز، ويُنسخ باقي `MediaQueryData` (المقاس ونسبة الكثافة) كما هو.
        builder: (context, child) {
          final data = MediaQuery.of(context);
          return MediaQuery(
            data: data.copyWith(
              padding: data.padding.copyWith(top: statusBarPadding),
            ),
            child: child!,
          );
        },
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: HomeShell(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

int _feedRequests(List<Uri> requests) =>
    requests.where((uri) => uri.path.endsWith('/api/events')).length;

void main() {
  group('شعار «اعراسنا» في ترويسة الهيكل (#157)', () {
    testWidgets(
      'نسخة واحدة من الأصل mark-full.png، بمقاس منطقي لا يقل عن ٧٢px، على جهة البداية',
      (tester) async {
        await _pumpShell(tester, _shellApi(), statusBarPadding: 24);

        // الأصل المولَّد نفسه — لا رسم بكود Flutter ولا صورة شبكة — ونسخة
        // واحدة فوق الوجهات الثلاث (لا نسخة لكل وجهة).
        final logo = find.image(const AssetImage('assets/brand/mark-full.png'));
        expect(logo, findsOneWidget, reason: 'الشعار من assets/brand/mark-full.png وحدها');

        // ما يُفحص هنا اسم الملف ومقاسه المنطقي فقط — لا محتوى بكسلاته: أنّ
        // الملف نفسه مولَّد بطبقة `full` (بالكلمة) يحرسه توليد brand-icons.js
        // (`APP_MARK_SIZES` ← `detailFor(72) == 'full'`) لا هذا الاختبار.
        // ٧٢px منطقي = `FULL_MIN_SIZE` في server/scripts/brand-icons.js.
        final size = tester.getSize(find.byKey(const Key('shell_brand_logo')));
        expect(size.height, greaterThanOrEqualTo(72));
        expect(size.width, greaterThanOrEqualTo(72));

        // جهة البداية في RTL: يمين الشاشة (مركز النافذة ٤٠٠ منطقي في الاختبار).
        expect(
          tester.getCenter(logo).dx,
          greaterThan(400),
          reason: 'الشعار على جهة البداية (يمين في RTL)',
        );

        // حشوة شريط الحالة (٢٤) تُستهلك مرّة واحدة فوق الترويسة: الشريط يبدأ
        // عندها والشعار بعد حشوته (٦)، ورأس التغذية تحته لا يُضيف حشوة ثانية
        // (`SafeArea` تقرأ صفراً) — وهو ما يُرى بمسافة أقل من ٢٤ بين الشريط
        // وأوّل عنصر في التغذية.
        final bar = find.byKey(const Key('shell_brand_bar'));
        expect(tester.getTopLeft(bar).dy, 24);
        expect(tester.getTopLeft(logo).dy, 30);
        expect(
          tester.getTopLeft(find.text('الفلاتر والبحث')).dy - tester.getBottomLeft(bar).dy,
          lessThan(24),
          reason: 'منطقة الأمان لا تُحسب مرّتين: ترويسة الهيكل وحدها تستهلكها',
        );
      },
    );

    testWidgets(
      'من وجهة ثانية، النقر عليه يعيد إلى «المناسبات» بلا جلب جديد',
      (tester) async {
        final requests = <Uri>[];
        await _pumpShell(tester, _shellApi(requests: requests));
        await tester.pumpAndSettle();

        final navBar = find.byType(NavigationBar);
        await tester.tap(
          find.descendant(of: navBar, matching: find.text('خدماتنا')),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(
          tester.widget<NavigationBar>(navBar).selectedIndex,
          1,
          reason: 'الاختبار يبدأ من وجهة ثانية فعلاً',
        );
        // الشعار فوق الوجهات الثلاث كلها — لا يختفي بتبديلها.
        expect(
          find.byKey(const Key('shell_brand_logo')),
          findsOneWidget,
          reason: 'الترويسة مشتركة بين الوجهات الثلاث',
        );

        final before = _feedRequests(requests);
        await tester.tap(find.byKey(const Key('shell_brand_logo')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        expect(tester.widget<NavigationBar>(navBar).selectedIndex, 0);
        expect(
          _feedRequests(requests),
          before,
          reason: 'العودة إلى الوجهة لا تعيد جلب التغذية',
        );
      },
    );

    testWidgets(
      'شريط علوي واحد في كل وجهة — لا AppBar تحت ترويسة الهيكل',
      (tester) async {
        await _pumpShell(tester, _shellApi());
        await tester.pumpAndSettle();

        final navBar = find.byType(NavigationBar);
        for (final destination in const ['خدماتنا', 'خدمات الأعراس']) {
          await tester.tap(
            find.descendant(of: navBar, matching: find.text(destination)),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 400));

          // `find` يتخطّى غير الظاهر، فهو يفحص الشريط الذي يراه المستخدم الآن:
          // وجهةٌ واحدة ظاهرة، وفوقها ترويسة الهيكل وحدها — لا شريط ثانٍ.
          expect(
            find.byType(AppBar),
            findsNothing,
            reason: 'وجهة «$destination»: شريط واحد لا شريطان',
          );
          expect(
            find.byKey(const Key('shell_brand_bar')),
            findsOneWidget,
            reason: 'ترويسة الهيكل وحدها فوق وجهة «$destination»',
          );
        }

        // وظائف شريط «خدمات الأعراس» القديم باقية في صفّ الجسم: منتقي البلدة،
        // و«حسابي»، و«قدّم عرضك» — لا شيء منها فُقد بحذف `AppBar` صامتاً.
        final rowY = tester.getCenter(find.byTooltip('فلترة حسب البلدة')).dy;
        expect(find.byTooltip('فلترة حسب البلدة'), findsOneWidget);
        expect(find.byTooltip('حسابي'), findsOneWidget);
        expect(find.text('قدّم عرضك'), findsOneWidget);
        expect(
          (tester.getCenter(find.byTooltip('حسابي')).dy - rowY).abs(),
          lessThan(24),
          reason: '«حسابي» في الصفّ نفسه لا أسفل منه',
        );
        expect(
          (tester.getCenter(find.text('قدّم عرضك')).dy - rowY).abs(),
          lessThan(24),
          reason: '«قدّم عرضك» في الصفّ نفسه',
        );
        // والصفّ هو أوّل الجسم: فوق حقل البحث الذي كان يليه في `AppBar` سابقاً.
        expect(
          rowY,
          lessThan(tester.getTopLeft(find.byType(TextField)).dy),
          reason: 'أدوات الوجهة فوق حقل البحث — لا صفّ ثانٍ تحته',
        );
        // العنوان في صفّ الجسم وفي الشريط السفلي — لا ثالث.
        expect(find.text('خدمات الأعراس'), findsNWidgets(2));
      },
    );

    testWidgets(
      'والدرج مفتوح: الشعار يغلق لوح الفلاتر أوّلاً ثم يصعد بالقائمة بلا جلب',
      (tester) async {
        final requests = <Uri>[];
        await _pumpShell(tester, _shellApi(requests: requests));
        await tester.pumpAndSettle();

        // درج الفلاتر طبقةٌ داخل شاشة التغذية لا مسار في المتنقّل، فلا يغطّي
        // ترويسة الهيكل: الشعار مرئي ويُنقر وهو مفتوح — فهذا ما يجب أن يغلقه.
        final pageController =
            tester.widget<PageView>(find.byType(PageView)).controller!;
        pageController.jumpToPage(2);
        await tester.pumpAndSettle();
        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();
        expect(find.text('مناسبات منطقتك'), findsOneWidget, reason: 'الدرج مفتوح فعلاً');

        final before = _feedRequests(requests);
        await tester.tap(find.byKey(const Key('shell_brand_logo')));
        await tester.pumpAndSettle();

        expect(
          find.text('مناسبات منطقتك'),
          findsNothing,
          reason: '«الرئيسية» تغلق الدرج، فلا يبقى سطحٌ مفتوح فوق القائمة',
        );
        expect(pageController.page, 0, reason: 'ثم تصعد بالقائمة إلى أوّلها');
        expect(
          _feedRequests(requests),
          before,
          reason: 'والإغلاق والصعود كلاهما بلا جلب',
        );
      },
    );

    testWidgets(
      'الدرج مفتوح ثم تبديل الوجهة ثم الشعار: يعود إلى «المناسبات» والدرج مغلق، بلا جلب',
      (tester) async {
        final requests = <Uri>[];
        await _pumpShell(tester, _shellApi(requests: requests));
        await tester.pumpAndSettle();

        // التغذية حيّة خلف `IndexedStack` وهي غير مختارة، فلوحها المفتوح يبقى
        // مفتوحاً تحتها — هذا ما كان فرع «وجهة أخرى» لا يغلقه.
        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();
        expect(find.text('مناسبات منطقتك'), findsOneWidget, reason: 'الدرج مفتوح فعلاً');

        final navBar = find.byType(NavigationBar);
        await tester.tap(
          find.descendant(of: navBar, matching: find.text('خدماتنا')),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(tester.widget<NavigationBar>(navBar).selectedIndex, 1);

        final before = _feedRequests(requests);
        await tester.tap(find.byKey(const Key('shell_brand_logo')));
        await tester.pumpAndSettle();

        expect(tester.widget<NavigationBar>(navBar).selectedIndex, 0);
        expect(
          find.text('مناسبات منطقتك'),
          findsNothing,
          reason: 'الكبسة من وجهة أخرى تغلق الدرج أيضاً، لا حين تكون على «المناسبات» وحدها',
        );
        expect(_feedRequests(requests), before, reason: 'ولا جلب بسبب الكبسة');
      },
    );

    testWidgets(
      'على «المناسبات» نفسها يصعد إلى أول القائمة، والفلتر المختار باقٍ بلا جلب',
      (tester) async {
        final requests = <Uri>[];
        await _pumpShell(tester, _shellApi(requests: requests));
        await tester.pumpAndSettle();

        // فلتر بحث فعلي — نصّه يظهر في رأس التغذية وحده بعد إغلاق اللوح، فيصلح
        // شاهداً وحيداً على أنّ ما اختاره المستخدم لم يُمسّ. والحقل يُطلب من
        // شاشة التغذية وحدها: شاشة الخدمات في `IndexedStack` لها حقلها أيضاً.
        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.descendant(
            of: find.byType(EventsScreen),
            matching: find.byType(TextField),
          ),
          'سالم',
        );
        await tester.pump(const Duration(milliseconds: 450)); // مهلة البحث
        await tester.pump();
        await tester.tap(find.byTooltip('إغلاق'));
        await tester.pumpAndSettle();
        expect(find.text('بحث: سالم'), findsOneWidget);

        final pageController =
            tester.widget<PageView>(find.byType(PageView)).controller!;
        pageController.jumpToPage(2);
        await tester.pumpAndSettle();
        expect(pageController.page, 2, reason: 'الاختبار يبدأ من كرت متأخّر فعلاً');

        final before = _feedRequests(requests);
        await tester.tap(find.byKey(const Key('shell_brand_logo')));
        await tester.pumpAndSettle();

        expect(
          pageController.page,
          0,
          reason: 'الشعار على «المناسبات» يصعد إلى أول القائمة',
        );
        expect(
          find.text('بحث: سالم'),
          findsOneWidget,
          reason: 'الفلتر المختار يبقى كما هو بعد النقر',
        );
        expect(
          _feedRequests(requests),
          before,
          reason: 'الصعود تمريرٌ وحده — لا صفحة أولى ولا force',
        );
      },
    );
  });

  group('الترويسة الغنية حول الشعار (#174)', () {
    /// جلسة مسجَّلة محفوظة كما يحفظها `AuthStore` نفسه — تُقرأ في `load()`
    /// قبل بناء الهيكل، فتظهر التحية عند أول إطار لا بعد نداء شبكة.
    Future<AuthStore> signedInAuth(NegevApi api) async {
      SharedPreferences.setMockInitialValues({
        'negev_token': 'test-token-rich-header',
        'negev_user': jsonEncode({
          'id': 501,
          'phone_number': '0521234567',
          'full_name': 'سالم أبو معمر',
          'role': 'user',
        }),
      });
      final auth = AuthStore(api);
      await auth.load();
      return auth;
    }

    testWidgets('الزائر لا يرى «أهلاً، …» — والمسجَّل يراه باسمه الأول', (tester) async {
      // الزائر: المخزن محمَّل بلا جلسة، كما يفتح الزائر التطبيق فعلاً.
      SharedPreferences.setMockInitialValues({});
      final guestApi = _shellApi();
      final guestAuth = AuthStore(guestApi);
      await guestAuth.load();
      await _pumpShell(tester, guestApi, auth: guestAuth);
      await tester.pumpAndSettle();

      expect(guestAuth.isSignedIn, isFalse, reason: 'الاختبار يبدأ زائراً فعلاً');
      expect(
        find.byKey(const Key('shell_header_greeting')),
        findsNothing,
        reason: 'التحية للمسجَّل وحده',
      );

      // والمسجَّل: الاسم الأول من `full_name` في الحساب نفسه.
      final signedApi = _shellApi();
      final signedAuth = await signedInAuth(signedApi);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await _pumpShell(tester, signedApi, auth: signedAuth);
      await tester.pumpAndSettle();

      expect(signedAuth.isSignedIn, isTrue);
      expect(
        find.byKey(const Key('shell_header_greeting')),
        findsOneWidget,
        reason: 'المسجَّل يرى التحية',
      );
      expect(
        find.text('أهلاً، سالم'),
        findsOneWidget,
        reason: 'الاسم الأول من الحساب لا نصّاً مكتوباً',
      );
    });

    testWidgets('حساب محفوظ بلا رمز دخول: زائر — لا تحية، والكبسولة والقلب باقيان', (tester) async {
      // `AuthStore.load()` يقرأ `negev_user` مستقلاً عن `negev_token`، فبقاء
      // الاسم وحده لا يصنع جلسة. التحية تتبع `isSignedIn` لا الاسم، وهذا هو
      // السبب الذي كان يمرّ بلا اختبار: الاسم موجود فيُعرض «أهلاً، …» لزائر.
      SharedPreferences.setMockInitialValues({
        'negev_user': jsonEncode({
          'id': 502,
          'phone_number': '0527654321',
          'full_name': 'نورة أبو سالم',
          'role': 'user',
        }),
      });
      final api = _shellApi();
      final auth = AuthStore(api);
      await auth.load();
      await _pumpShell(tester, api, auth: auth);
      await tester.pumpAndSettle();

      expect(
        auth.user,
        isNotNull,
        reason: 'الاسم المحفوظ قُرئ فعلاً — الاختبار يسقط لسببه لا لفراغ المخزن',
      );
      expect(auth.token, isNull);
      expect(
        auth.isSignedIn,
        isFalse,
        reason: 'بلا رمز لا جلسة، ولو بقي الاسم محفوظاً',
      );
      expect(
        find.byKey(const Key('shell_header_greeting')),
        findsNothing,
        reason: 'التحية للمسجَّل وحده، لا لاسمٍ محفوظ بلا رمز',
      );
      expect(find.text('أهلاً، نورة'), findsNothing);

      // والزائر يبقى له ما للتذكرة: الكبسولة والقلب ليسا للمسجَّل وحده.
      expect(find.byKey(const Key('shell_header_region')), findsOneWidget);
      expect(find.byKey(const Key('shell_header_my_list')), findsOneWidget);
    });

    testWidgets('كبسولة المحافظة تحمل اسمها من الخادم وتفتح ورقة المحافظة القائمة', (tester) async {
      // تخزينٌ فارغ يبدأ منه الاختبار، فالتأكيد أدناه يقيس كتابة هذا الاختيار
      // لا بقايا اختبار سبقه.
      SharedPreferences.setMockInitialValues({});
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      final capsule = find.byKey(const Key('shell_header_region'));
      expect(capsule, findsOneWidget, reason: 'الكبسولة في ترويسة الهيكل');
      expect(
        find.descendant(of: capsule, matching: find.text('النقب')),
        findsOneWidget,
        reason: 'اسم المحافظة من GET /api/towns لا مكتوباً في العميل',
      );

      await tester.tap(capsule);
      await tester.pumpAndSettle();
      expect(
        find.text('من أي منطقة أنت؟'),
        findsOneWidget,
        reason: 'الورقة القائمة نفسها (#126) لا نسخة ثانية',
      );

      // والاختيار يمشي في مسار الورقة القائم نفسه: يدوي ← محافظة ← حفظ.
      await tester.tap(find.byKey(const Key('region_onboarding_manual')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('region_onboarding_region_1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('region_onboarding_save')));
      await tester.pumpAndSettle();

      // التفضيل محفوظ فعلاً على الجهاز: يُقرأ بمفتاح التخزين الذي يكتبه
      // `RegionStore` نفسه (`storageKey`، لا نصّاً مكتوباً هنا) — فالذاكرة
      // وحدها لا تُثبت «كُتب على الجهاز».
      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getString(RegionStore.storageKey),
        '1',
        reason: 'اختيار الورقة يكتب المحافظة على الجهاز',
      );
      // والورقة أُغلقت فعلاً: عنوانها غائب، والترويسة تحته ظاهرة. (كان التأكيد
      // السابق يجد الترويسة وهي تحت الورقة أصلاً، فلا يسقط إن بقيت الورقة.)
      expect(
        find.text('من أي منطقة أنت؟'),
        findsNothing,
        reason: 'الورقة أُغلقت بعد الاختيار، فلا تبقى مفتوحة فوق الترويسة',
      );
      expect(
        find.byKey(const Key('shell_header_region')),
        findsOneWidget,
        reason: 'والترويسة باقية ظاهرة بعد إغلاقها',
      );

      // رسالة الاختيار (SnackBar) تعيش ٣ ثوانٍ — تُنتهى هنا كي لا يبقى مؤقّتها
      // معلَّقاً بعد انتهاء الاختبار.
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
    });

    testWidgets('القلب يفتح «قائمتي» وزرّ الأجندة يفتح الأجندة، والشريط يبقى ثلاث وجهات', (tester) async {
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).destinations.length,
        3,
        reason: 'الشريط السفلي ثلاث وجهات كما كان',
      );

      await tester.tap(find.byKey(const Key('shell_header_my_list')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(
        find.byType(MyListScreen),
        findsOneWidget,
        reason: 'قلب الترويسة يفتح «قائمتي» القائمة',
      );

      navigatorKey.currentState!.pop();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('shell_header_agenda')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(
        find.byType(AgendaScreen),
        findsOneWidget,
        reason: 'زرّ الأجندة يفتح «أجندة المناسبات» (تقويم الشهر الذي جدّدته #175)',
      );

      navigatorKey.currentState!.pop();
      await tester.pumpAndSettle();

      // والترويسة الغنية فوق الوجهات الثلاث كلها، لا على «المناسبات» وحدها.
      final navBar = find.byType(NavigationBar);
      await tester.tap(
        find.descendant(of: navBar, matching: find.text('خدماتنا')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(
        tester.widget<NavigationBar>(navBar).selectedIndex,
        1,
        reason: 'الاختبار يبدأ من وجهة ثانية فعلاً',
      );
      expect(
        find.byKey(const Key('shell_header_region')),
        findsOneWidget,
        reason: 'كبسولة المحافظة فوق «خدماتنا» أيضاً',
      );
      expect(
        find.byKey(const Key('shell_header_my_list')),
        findsOneWidget,
        reason: 'قلب «قائمتي» فوق «خدماتنا» أيضاً',
      );
      expect(
        find.byKey(const Key('shell_header_agenda')),
        findsOneWidget,
        reason: 'زرّ الأجندة فوق «خدماتنا» أيضاً',
      );
    });
  });
}
