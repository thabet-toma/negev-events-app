import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/screens/service_provider_details_screen.dart';
import 'package:negev_events/screens/services_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/welcome.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// خطّ التطبيق الحقيقي في اختبارات القياس: افتراضياً يرسم اختبار فلاتر كل
/// محرف مربّعاً (Ahem)، فيطول الصفّ ويضلّل قياس «كم صفّاً تحمل الشاشة».
Future<void> _loadCairo() async {
  final loader = FontLoader('Cairo')
    ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
    ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
    ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'))
    ..addFont(rootBundle.load('assets/fonts/Cairo-Black.ttf'));
  await loader.load();
}

/// مزوّدان في القائمة العامة: واحد برقم وآخر بلا رقم — الثاني هو ما يثبت أن
/// زرّ «اتصال» يغيب (`has_phone` من الخادم، لا الرقم في القائمة).
const List<Map<String, dynamic>> _providersFixture = [
  {
    'id': 601,
    'name': 'خيام البادية',
    'category_id': 7,
    'category_name': 'بيوت شعر',
    'category_icon': '⛺',
    'category_color': '#B8860B',
    'has_phone': true,
    'image_url': null,
    'price': 4500,
    'price_type': 'estimated',
    'price_estimate_desc': '1000 كرسي + برجين إضاءة = 4500 ₪',
    'attributes': {'chairs': '1000'},
    'towns': ['رهط'],
  },
  {
    'id': 602,
    'name': 'طهاة الجليل',
    'category_id': 8,
    'category_name': 'طهاة',
    'category_icon': '🍲',
    'category_color': '#0F766E',
    'has_phone': false,
    'image_url': null,
    'price': null,
    'price_type': 'contact',
    'price_estimate_desc': null,
    'attributes': <String, dynamic>{},
    'towns': ['حورة'],
  },
];

/// عميل وهمي لشاشة «خدمات الأعراس»: الإعداد العام، الفئات، القائمة، وصفّ
/// مزوّد واحد كامل بالرقم. [/api/settings/public] هو مصدر شكل العرض وحده.
NegevApi servicesApi({
  Map<String, dynamic>? settings,
  List<Map<String, dynamic>> providers = _providersFixture,
}) {
  final client = MockClient((request) async {
    final path = request.url.path;
    Map<String, dynamic> body;
    if (path == '/api/settings/public') {
      body = {'success': true, 'settings': settings ?? const {}};
    } else if (path == '/api/services/categories') {
      body = {'success': true, 'categories': <Map<String, dynamic>>[]};
    } else if (path == '/api/services/providers') {
      body = {
        'success': true,
        'providers': providers,
        'pagination': {
          'page': 1,
          'limit': 30,
          'total': providers.length,
          'totalPages': 1,
        },
      };
    } else if (path == '/api/services/providers/601') {
      body = {
        'success': true,
        'provider': {
          ...providers.first,
          'phone': '0501234567',
          'description': 'خيام وضيافة كاملة لكل المناسبات',
        },
      };
    } else {
      body = {'success': false};
    }
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

Future<void> pumpServices(
  WidgetTester tester,
  NegevApi api, {
  Size size = const Size(500, 1400),
  NavigatorObserver? observer,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        navigatorObservers: [?observer],
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: ServicesScreen(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// عميل الهيكل الحقيقي: كل ما تطلبه الوجهات الثلاث عند الإقلاع، مع خمسة
/// مزوّدين. لا شيء هنا يخصّ شكل الصفّ؛ القياس كله من التخطيط الحقيقي.
NegevApi shellServicesApi({int providerCount = 5}) {
  final providers = List.generate(
    providerCount,
    (i) => {
      ..._providersFixture.first,
      'id': 601 + i,
      'name': 'مزوّد ${i + 1}',
    },
  );
  final client = MockClient((request) async {
    final path = request.url.path;
    Map<String, dynamic> body;
    if (path.endsWith('/api/settings/public')) {
      body = {
        'success': true,
        'settings': {'providers_display': 'compact'},
      };
    } else if (path.endsWith('/api/services/categories')) {
      body = {'success': true, 'categories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/services/providers')) {
      body = {
        'success': true,
        'providers': providers,
        'pagination': {
          'page': 1,
          'limit': 30,
          'total': providers.length,
          'totalPages': 1,
        },
      };
    } else if (path.endsWith('/api/stories')) {
      body = {'success': true, 'stories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/occasion-types')) {
      body = {'success': true, 'types': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/towns')) {
      body = {
        'success': true,
        'towns': ['الكل', 'رهط', 'حورة'],
        'regions': <Map<String, dynamic>>[],
        'villages': <Map<String, dynamic>>[],
        'town_coordinates': <String, dynamic>{},
        'stats': <Map<String, dynamic>>[],
      };
    } else if (path.endsWith('/api/events')) {
      body = {
        'success': true,
        'events': <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
        'announcements': <Map<String, dynamic>>[],
      };
    } else {
      body = {'success': true};
    }
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

/// الهيكل الحقيقي على هاتف 360×840 ثم وجهة «خدمات الأعراس» — لا الشاشة وحدها:
/// ارتفاع الشاشة المجرّدة أكبر من ارتفاعها الحقيقي تحت شريط العلامة وكبستَي
/// النشر والشريط السفلي، فأي قياس صفوف بدونها ادّعاء لا أثر له.
Future<void> _pumpServicesInShell(WidgetTester tester, NegevApi api) async {
  tester.view.physicalSize = const Size(360, 840);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  SharedPreferences.setMockInitialValues({regionOnboardedKey: true, welcomeSeenKey: true});

  // الجلسة تُحمَّل كما يحمّلها `main.dart` قبل أول إطار: شاشة «حسابي» في
  // `IndexedStack` (المقعد الأخير في الشريط) ترسم مؤشّر تحميل حتى تصير جاهزة،
  // والمؤشّر الدائم يمنع `pumpAndSettle` بعده من الاستقرار.
  final auth = AuthStore(api);
  await auth.load();

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth,
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        // شريط حالة ٢٤px كما على جهاز حقيقي: بدونه يقيس الاختبار ارتفاعاً
        // أكبر من ارتفاع الهاتف الفعلي. الهيكل يستهلكه مرّة واحدة في `SafeArea`.
        builder: (context, child) {
          final data = MediaQuery.of(context);
          return MediaQuery(
            data: data.copyWith(
              padding: data.padding.copyWith(top: 24),
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
  await tester.pump(const Duration(milliseconds: 100));

  await tester.tap(find.byKey(const Key('nav_tab_2')));
  await tester.pumpAndSettle();
}

/// يسجّل المسارات المدفوعة وحدها، بلا بناء صفحاتها.
class _RecordingNavigatorObserver extends NavigatorObserver {
  final List<Route<dynamic>> pushed = [];

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    pushed.add(route);
  }
}

void main() {
  // القياس يحتاج خطّ التطبيق (Cairo) لا خطّ الاختبار المربّع (Ahem).
  setUpAll(_loadCairo);

  group('دليل خدمات الأعراس — العرض المختصر (تذكرة #158)', () {
    testWidgets('الصفّ المختصر: الاسم والفئة والبلدة وشارة السعر و«تفاصيل»، و«اتصال» غائب بلا رقم', (
      tester,
    ) async {
      await pumpServices(
        tester,
        servicesApi(settings: {'providers_display': 'compact'}),
      );

      final row = find.byKey(const Key('service_row_601'));
      final rowWithoutPhone = find.byKey(const Key('service_row_602'));
      expect(row, findsOneWidget);
      expect(rowWithoutPhone, findsOneWidget);

      // الكرت الكبير لا يُبنى إطلاقاً في هذا الشكل.
      expect(find.text('مزيد من التفاصيل'), findsNothing);

      expect(
        find.descendant(of: row, matching: find.text('خيام البادية')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.text('⛺ بيوت شعر')),
        findsOneWidget,
        reason: 'سطر الفئة',
      );
      expect(
        find.descendant(of: row, matching: find.text('رهط')),
        findsOneWidget,
        reason: 'سطر البلدة',
      );
      expect(
        find.descendant(of: row, matching: find.text('4500 ₪ · سعر تقديري')),
        findsOneWidget,
        reason: 'شارة السعر الصغيرة',
      );
      expect(
        find.descendant(of: rowWithoutPhone, matching: find.text('تواصل للسعر')),
        findsOneWidget,
        reason: 'مزوّد بلا سعر رقمي يبقى واضحاً في شارة السعر',
      );

      // «اتصال» موجود مع الرقم وغائب دونه — زرّ «تفاصيل» في الصفّين.
      expect(find.byKey(const Key('service_row_contact_601')), findsOneWidget);
      expect(
        find.byKey(const Key('service_row_contact_602')),
        findsNothing,
        reason: 'has_phone = false لا يترك زرّ اتصال معطّلاً أو مخفياً',
      );
      expect(find.byKey(const Key('service_row_details_601')), findsOneWidget);
      expect(find.byKey(const Key('service_row_details_602')), findsOneWidget);
    });

    testWidgets('بلدان كثيرة: يُسمّى أوّلها و«وغيرها» — لا ادّعاء خدمة كل البلدات', (
      tester,
    ) async {
      await pumpServices(
        tester,
        servicesApi(
          settings: {'providers_display': 'compact'},
          providers: [
            {
              ..._providersFixture.first,
              'towns': ['رهط', 'حورة', 'كسيفة', 'تل السبع'],
            },
          ],
        ),
      );

      final row = find.byKey(const Key('service_row_601'));
      expect(
        find.descendant(of: row, matching: find.text('رهط، حورة وغيرها')),
        findsOneWidget,
        reason: 'سطر البلدة يسمّي المعلوم ويعتذر عن الباقي',
      );
      expect(
        find.descendant(of: row, matching: find.textContaining('جميع')),
        findsNothing,
        reason: 'أربع بلدات ليست «جميع البلدات» (تذكرة #127)',
      );
    });

    testWidgets('كل نص في الصفّ 15px فأكبر، وكل زرّ 44px فأكثر', (tester) async {
      // عرض هاتف (360) لا نافذة 500: حدّ الارتفاع أدناه يُقاس حيث يضيق الصفّ.
      await pumpServices(
        tester,
        servicesApi(settings: {'providers_display': 'compact'}),
        size: const Size(360, 1400),
      );

      final row = find.byKey(const Key('service_row_601'));
      final texts = tester.widgetList<Text>(
        find.descendant(of: row, matching: find.byType(Text)),
      );
      expect(texts, isNotEmpty);
      for (final text in texts) {
        final size = text.style?.fontSize;
        expect(size, isNotNull, reason: '«${text.data}» بلا حجم خطّ صريح');
        expect(
          size!,
          greaterThanOrEqualTo(15),
          reason: '«${text.data}» أصغر من 15px في الصفّ المختصر',
        );
      }

      for (final key in const [
        'service_row_contact_601',
        'service_row_details_601',
        'service_row_details_602',
      ]) {
        final size = tester.getSize(find.byKey(Key(key)));
        expect(
          size.height,
          greaterThanOrEqualTo(44),
          reason: 'هدف اللمس $key أقصر من 44px',
        );
      }

      // الصورة مربّعة 88px كما في التذكرة.
      final media = tester.getSize(
        find.descendant(of: row, matching: find.byType(ClipRRect)).first,
      );
      expect(media.width, 88);
      expect(media.height, 88);

      // سطرٌ واحد لا كرت مكدّس: أربعة إلى خمسة مزوّدين في الشاشة (تذكرة #158).
      // الحدّ 138 هو أعلى المدى الموثَّق في services_screen.dart على عرض 360.
      expect(
        tester.getSize(row).height,
        lessThanOrEqualTo(138),
        reason: 'الصفّ المختصر أطول من أن يحمل الشاشة أربعة إلى خمسة مزوّدين',
      );
    });

    testWidgets('داخل HomeShell على 360×840: الرأس يمرّ ويظهر ٤ صفوف كاملة', (
      tester,
    ) async {
      await _pumpServicesInShell(tester, shellServicesApi());

      final services = find.byType(ServicesScreen);
      final scrollView = find.descendant(
        of: services,
        matching: find.byKey(const Key('services_scroll')),
      );
      expect(
        scrollView,
        findsOneWidget,
        reason: 'رأس الوجهة داخل ScrollView لا فوقه',
      );

      final scrollRect = tester.getRect(scrollView);
      final search = find.descendant(of: services, matching: find.byType(TextField));
      final divider = find.descendant(of: services, matching: find.byType(Divider)).first;
      final headerHeight = tester.getBottomLeft(divider).dy - scrollRect.top;
      expect(
        headerHeight,
        greaterThan(100),
        reason: 'الرأس كامل داخل التمرير (عنوان + بحث + فئات)',
      );
      expect(
        tester.getTopLeft(search).dy,
        greaterThanOrEqualTo(scrollRect.top),
        reason: 'الرأس ظاهر فوق القائمة عند الإقلاع',
      );

      final scrollable = tester.state<ScrollableState>(
        find.descendant(of: scrollView, matching: find.byType(Scrollable)).first,
      );
      scrollable.position.jumpTo(headerHeight + 1);
      await tester.pump();

      // بعد تمرير ارتفاع الرأس يكون قد خرج من الشاشة فعلاً؛ لو كان مثبّتاً
      // لبقيت خانة البحث ظاهرة. (SliverToBoxAdapter يُبقي ابنه مبنياً، لكن
      // المُعثِر يتخطّى ما خرج من الـviewport — skipOffstage — فينجح findsNothing.)
      expect(
        search,
        findsNothing,
        reason: 'الرأس تحرّك مع التمرير — لو عاد مثبّتاً لبقيت خانة البحث',
      );

      // الصفّ الكامل: أعلى وأسفل داخل مساحة القائمة الحقيقية (بين شريط العلامة
      // وكبستَي النشر والشريط السفلي)، لا مجرّد صفّ مبنيّ في الـcache.
      final fullRows = <int>[];
      for (var id = 601; id <= 605; id++) {
        final row = find.byKey(Key('service_row_$id'));
        if (row.evaluate().isEmpty) continue;
        final rect = tester.getRect(row);
        if (rect.top >= scrollRect.top - 0.5 &&
            rect.bottom <= scrollRect.bottom + 0.5) {
          fullRows.add(id);
        }
      }
      expect(
        fullRows.length,
        greaterThanOrEqualTo(4),
        reason: 'بعد تمرير الرأس تظهر أربعة صفوف كاملة على 360×840؛ '
            'المقيس: ${fullRows.length}',
      );
    });

    testWidgets('«تفاصيل» تدفع شاشة المزوّد القائمة وتبنيها بمحتواها', (
      tester,
    ) async {
      final observer = _RecordingNavigatorObserver();
      // نافذة أعرض من الهاتف: خطّ الاختبار يرسم كل محرف مربّعاً بعرض كامل،
      // فيفيض عنوان «حزمة نموذجية» في الشاشة القائمة عند عرض هاتف (زخرفة خطّ
      // الاختبار لا عيب تخطيط — الشاشة القائمة لم تُلمَس في هذه التذكرة).
      await pumpServices(
        tester,
        servicesApi(settings: {'providers_display': 'compact'}),
        size: const Size(1000, 1600),
        observer: observer,
      );

      // المسار الأول مسجَّل أصلاً (صفحة `home`)، فالمقارنة بما قبل الكبس.
      final before = observer.pushed.length;
      await tester.tap(find.byKey(const Key('service_row_details_601')));
      await tester.pumpAndSettle();

      // الشاشة القائمة تُبنى فعلاً — لا مسارها وحده. الاختبار السابق كان
      // يتجنّب بنائها لأن حدوداً غير موحّدة اللون مع `borderRadius` كانت
      // ترمي في debug؛ أُصلح العيب في الشاشة نفسها، فصار البناء ممكنًا.
      expect(observer.pushed, hasLength(before + 1));
      expect(find.byType(ServiceProviderDetailsScreen), findsOneWidget);

      final opened = tester.widget<ServiceProviderDetailsScreen>(
        find.byType(ServiceProviderDetailsScreen),
      );
      expect(
        opened.providerId,
        601,
        reason: '«تفاصيل» يفتح شاشة المزوّد القائمة بمزوّد الصفّ نفسه',
      );

      final details = find.byType(ServiceProviderDetailsScreen);
      expect(
        find.descendant(of: details, matching: find.text('خيام البادية')),
        findsWidgets,
        reason: 'اسم المزوّد في الترويسة والجسم',
      );
      expect(
        find.descendant(
          of: details,
          matching: find.text('خيام وضيافة كاملة لكل المناسبات'),
        ),
        findsOneWidget,
        reason: 'وصف المزوّد من GET /api/services/providers/:id',
      );
      expect(
        find.descendant(
          of: details,
          matching: find.text('1000 كرسي + برجين إضاءة = 4500 ₪'),
        ),
        findsOneWidget,
        reason: 'حزمة السعر الاسترشادية',
      );
      expect(
        find.descendant(of: details, matching: find.text('اتصال هاتفي')),
        findsOneWidget,
        reason: 'زرّ الاتصال القائم',
      );
      // الشاشة القائمة لا تطبع الرقم نصّاً — كشفه فعل تواصل صريح وحده.
      expect(
        find.descendant(of: details, matching: find.textContaining('0501234567')),
        findsNothing,
        reason: 'الرقم لا يُعرض نصّاً في شاشة المزوّد',
      );
    });

    testWidgets('providers_display = cards يعيد الكروت الكبيرة بلا أي إجراء يدوي', (
      tester,
    ) async {
      // نافذة أعرض من الهاتف: خطّ الاختبار يرسم كل محرف مربّعاً بعرض كامل،
      // فيفيض عنوان «حزمة نموذجية» في الكرت الكبير عند عرض هاتف (زخرفة خطّ
      // الاختبار لا عيب تخطيط — الكرت نفسه لم يُلمَس في هذه التذكرة).
      await pumpServices(
        tester,
        servicesApi(settings: {'providers_display': 'cards'}),
        size: const Size(1000, 1600),
      );

      expect(find.byKey(const Key('service_row_601')), findsNothing);
      expect(find.text('مزيد من التفاصيل'), findsWidgets);
      expect(
        find.text('📦 حزمة نموذجية استرشادية بهذا السعر:'),
        findsWidgets,
        reason: 'الكرت الكبير يحمل حزمة السعر',
      );
    });

    testWidgets('فتح «مزيد من التفاصيل» في الكرت الكبير (`cards`) يبني اللوحة بلا رمي', (
      tester,
    ) async {
      // نافذة أعرض من الهاتف لتفادي تضخيم خطّ الاختبار، كما في اختبار `cards`
      // أعلاه. الكرت نفسه لم يُعد تصميمه؛ المطلوب أن تُبنى لوحته الموسّعة.
      await pumpServices(
        tester,
        servicesApi(settings: {'providers_display': 'cards'}),
        size: const Size(1000, 1600),
      );

      expect(find.text('مزيد من التفاصيل'), findsWidgets);
      await tester.tap(find.text('مزيد من التفاصيل').first);
      await tester.pumpAndSettle();

      expect(find.text('إخفاء التفاصيل'), findsWidgets);
      expect(
        find.text('توضيح مهم بشأن المواصفات والكميات:'),
        findsOneWidget,
        reason: 'اللوحة الموسّعة تُبنى وتُقرأ بعد الإصلاح',
      );
      expect(
        find.textContaining('المواصفات الموضحة أدناه هي مثال لحزمة قياسية'),
        findsOneWidget,
      );
    });

    testWidgets('العميل: غياب الإعداد يعرض الصفوف المختصرة', (tester) async {
      await pumpServices(tester, servicesApi(settings: const {}));
      expect(find.byKey(const Key('service_row_601')), findsOneWidget);
      expect(find.text('مزيد من التفاصيل'), findsNothing);
    });

    testWidgets('العميل: قيمة غير معروفة تعرض الصفوف المختصرة', (tester) async {
      await pumpServices(
        tester,
        servicesApi(settings: {'providers_display': 'big'}),
      );
      expect(find.byKey(const Key('service_row_601')), findsOneWidget);
      expect(find.text('مزيد من التفاصيل'), findsNothing);
    });
  });

  group('عدّادا 👁/♥ في بطاقة القائمة (تذكرة #185)', () {
    /// المزوّد الأول بعدّاديه كما يعيدهما الخادم في القائمة، والثاني بلا
    /// الحقلين (كل APK قديم أو خادم لم يرسلهما) فيقع على الصفر لا على فراغ.
    List<Map<String, dynamic>> countersFixture() => [
          {
            ..._providersFixture.first,
            'views_count': 42,
            'favorites_count': 7,
          },
          _providersFixture.last,
        ];

    testWidgets('الصفّ المختصر يعرض العدّادين من الخادم، والصفر يُعرض 0', (tester) async {
      await pumpServices(
        tester,
        servicesApi(
          settings: {'providers_display': 'compact'},
          providers: countersFixture(),
        ),
      );

      expect(
        find.byKey(const Key('service_row_views_601')),
        findsOneWidget,
        reason: 'عدّاد المشاهدة في صفّ القائمة',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('service_row_views_601'))).data,
        '42',
        reason: 'الرقم هو views_count الذي أرسله الخادم لا عدّاً في العميل',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('service_row_favorites_601'))).data,
        '7',
        reason: 'والمفضّلة من favorites_count',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('service_row_views_602'))).data,
        '0',
        reason: 'مزوّد بلا العدّادين في الجسم يعرض صفراً لا فراغاً',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('service_row_favorites_602'))).data,
        '0',
      );
    });

    testWidgets('الكرت الكبير يعرض العدّادين نفسهما', (tester) async {
      // نافذة أعرض من الهاتف كما في اختبارات `cards` القائمة: خطّ الاختبار
      // يرسم كل محرف مربّعاً بعرض كامل فيفيض عنوان الحزمة عند عرض هاتف.
      await pumpServices(
        tester,
        servicesApi(
          settings: {'providers_display': 'cards'},
          providers: countersFixture(),
        ),
        size: const Size(1000, 1600),
      );

      expect(
        find.byKey(const Key('service_card_views_601')),
        findsOneWidget,
        reason: 'عدّاد المشاهدة في الكرت الكبير',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('service_card_views_601'))).data,
        '42',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('service_card_favorites_601'))).data,
        '7',
      );
    });
  });
}
