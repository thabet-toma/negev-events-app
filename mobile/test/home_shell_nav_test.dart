import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/albums_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/screens/nokoot_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/welcome.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/event_card.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// الشريط السفلي الجديد في الرئيسية: خمس وجهات وزرٌّ ذهبي وسطي يفتح ورقة
/// «مميّز عندنا» — والوجهات كما يراها المستخدم في RTL من اليمين: المناسبات،
/// خدماتنا، الزرّ الوسطي، خدمات الأعراس، مناسباتي، حسابي.
///
/// ما يُثبَت هنا: الترتيب الفعلي (بموضع x لا بترتيب الشجرة وحدها)، وتثبيت
/// الستّة في ٣٩٠dp مقابل تمرير أفقي في ٣٢٠dp، وورقة المختارات السبعة ووجهاتها،
/// و«مناسباتي» (منشوراتي ثمّ قائمتي) للمسجَّل ودعوة الدخول للزائر، و«حسابي»
/// مقعدها الأخير، والكبستين فوق الشريط كما كانتا.
///
/// ولا يُعاد هنا بناء أي واجهة تحت الاختبار: الشاشات الحقيقية كما في
/// `HomeShell`، والخادم وهمي يجيب كل مسار يطلبه الإقلاع.

/// وجهات الشريط الخمس بترتيبها من اليمين — نصوص التسميات كما تُعرض.
const List<String> _navLabels = [
  'المناسبات',
  'خدماتنا',
  'خدمات الأعراس',
  'مناسباتي',
  'حسابي',
];

Finder _tabLabel(int index) => find.descendant(
      of: find.byKey(Key('nav_tab_$index')),
      matching: find.text(_navLabels[index]),
    );

/// الوجهة المختارة — من لون عنوانها: `c.sky` للمختارة و`c.inkSoft` لغيرها.
/// (لا `NavigationBar.selectedIndex` بعد اليوم: الشريط يدوي.)
int _selectedTab(WidgetTester tester) {
  for (var i = 0; i < _navLabels.length; i++) {
    final label = tester.widget<Text>(_tabLabel(i));
    if (label.style?.color == NegevPalette.light.sky) return i;
  }
  return -1;
}

/// صفّ مناسبة كما يعيده `GET /api/my-events` — نفس شكل بطاقة التغذية.
Map<String, dynamic> _publishedEvent() => {
      'id': 77,
      'title': '',
      'groom_name': 'سالم',
      'family_clan': 'آل فلان',
      'town': 'رهط',
      'location_name': 'قاعة السلام',
      'event_date': '2026-11-01',
      'status': 'approved',
      'honorees': [
        {'name': 'معاذ النباري', 'position': 0},
      ],
      'occasion_type': {
        'id': 1,
        'name': 'عرس',
        'icon': '💍',
        'color': '#0369a1',
        'tone': 'festive',
        'rsvp_enabled': false,
        'fields': <Map<String, dynamic>>[],
        'reactions': <String>[],
      },
    };

/// صفّ «قائمتي» كما يعيده `GET /api/my-reminders` (المناسبة مسطّحة + حقول
/// القائمة) — نفس شكل `entryJson` في my_list_test.dart.
Map<String, dynamic> _savedEntry(int id) => {
      'id': id,
      'title': '',
      'groom_name': 'سالم',
      'family_clan': 'آل فلان',
      'town': 'رهط',
      'location_name': 'قاعة السلام',
      'event_date': '2026-10-20',
      'dinner_time': '20:00',
      'poster_url': null,
      'honorees': [
        {'name': 'معاذ النباري', 'position': 0},
      ],
      'occasion_type': {
        'id': 1,
        'name': 'عرس',
        'icon': '💍',
        'color': '#0369a1',
        'tone': 'festive',
        'fields': <Map<String, dynamic>>[],
        'reactions': <String>[],
      },
      'notify': true,
      'saved_at': '2026-10-01T10:00:00.000Z',
      'span_start': '2026-10-20',
      'span_end': '2026-10-22',
      'days_until_start': 5,
      'bucket': 'later',
      'date_change': null,
    };

Map<String, dynamic> _myListBody() => {
      'success': true,
      'events': [_savedEntry(2)],
      'counts': {'all': 1, 'upcoming': 1, 'ended': 0},
      'under_review_count': 0,
    };

/// خادم وهمي لكل ما يطلبه إقلاع الهيكل: التغذية والقصص والأنواع والبلدات
/// (كما في brand_header_test.dart)، ومعه ما تضيفه «مناسباتي» و«حسابي» وورقة
/// «مميّز عندنا». كل مسار آخر يردّ نجاحاً فارغاً، فلا يسقط الإقلاع بمسار
/// ناقص — وهو نفس ما تفعله اختبارات الهيكل القائمة. و[requests] يلتقط كل طلب
/// كي يُفحَص متى يُجلب `/api/my-events` (ومتى لا يُجلب).
NegevApi _shellApi({
  List<Uri>? requests,
  List<Map<String, dynamic>>? myEvents,
  Map<String, dynamic>? myList,
}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    http.Response ok(Object body) => http.Response(
          jsonEncode(body),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );

    final path = request.url.path;
    if (path.endsWith('/api/auth/me')) {
      return ok({
        'success': true,
        'user': {
          'id': 501,
          'phone_number': '0521234567',
          'full_name': 'سالم أبو معمر',
          'role': 'user',
        },
      });
    }
    if (path.endsWith('/api/my-events')) {
      return ok({'success': true, 'events': myEvents ?? <Map<String, dynamic>>[]});
    }
    if (path.endsWith('/api/my-reminders')) {
      return ok(
        myList ??
            {
              'success': true,
              'events': <Map<String, dynamic>>[],
              'counts': {'all': 0, 'upcoming': 0, 'ended': 0},
              'under_review_count': 0,
            },
      );
    }
    if (path.endsWith('/api/services/favorites')) {
      return ok({'success': true, 'providers': <Map<String, dynamic>>[]});
    }
    if (path.endsWith('/api/reminders/schedule')) {
      return ok({'success': true, 'schedule': <Map<String, dynamic>>[]});
    }
    if (path.endsWith('/api/stories/entry-card')) {
      return ok({'success': true, 'enabled': false, 'source': null, 'story': null});
    }
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
        'events': <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
        'announcements': <Map<String, dynamic>>[],
      });
    }
    if (path.endsWith('/api/live')) {
      return ok({'success': true, 'live': null});
    }
    if (path.endsWith('/api/broadcasts/live')) {
      return ok({'success': true, 'broadcasts': <Map<String, dynamic>>[]});
    }
    return ok({'success': true});
  });
  return NegevApi(ApiClient(client: client));
}

/// الهيكل كما يُبنى في `main.dart`: `AppServices` فوق `MaterialApp` (مسارات
/// الورقة والدفع تحتاجها)، ومفتاح الملاحة العام نفسه، وورقة أول تشغيل معلنة
/// الطرح.
///
/// والجلسة تُحمَّل **قبل** أول إطار كما يحمّلها `main.dart`: شاشة «حسابي» في
/// `IndexedStack` ترسم مؤشّر تحميل حتى `isReady`، ومؤشّرٌ دائم يمنع
/// `pumpAndSettle` من الاستقرار. [auth] جاهزٌ يمرّره اختبار الحساب المسجَّل
/// (يُحمَّل قبل استدعائنا، لأننا نضبط تفضيلات الإقلاع هنا).
Future<void> _pumpShell(
  WidgetTester tester,
  NegevApi api, {
  AuthStore? auth,
  Size physicalSize = const Size(800, 2000),
  double devicePixelRatio = 1.0,
}) async {
  tester.view.physicalSize = physicalSize;
  tester.view.devicePixelRatio = devicePixelRatio;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  SharedPreferences.setMockInitialValues({
    regionOnboardedKey: true,
    welcomeSeenKey: true,
  });

  final store = auth ?? AuthStore(api);
  if (auth == null) await store.load();

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: store,
      realtime: RealtimeService(),
      // العربية هي مصدر RTL لكل الأسطح كما في `main.dart` — بما فيها المسارات
      // المدفوعة والورقة السفلية: هذه خارج `home`، فلا يغطّيها أيّ
      // `Directionality` يوضع حول `HomeShell` وحده.
      child: MaterialApp(
        navigatorKey: navigatorKey,
        theme: AppTheme.light(),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const HomeShell(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

/// جلسة مسجَّلة محفوظة كما يحفظها `AuthStore` نفسه — تُقرأ في `load()` قبل
/// بناء الهيكل، فيصل `/api/auth/me` من الخادم الوهمي.
Future<AuthStore> _signedInAuth(NegevApi api) async {
  SharedPreferences.setMockInitialValues({
    'negev_token': 'test-token-shell-nav',
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

void main() {
  testWidgets(
    '(أ) الشريط: خمس وجهات بترتيبها من اليمين، والزرّ الوسطي بين «خدماتنا» و«خدمات الأعراس»',
    (tester) async {
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('home_bottom_nav')), findsOneWidget);

      for (var i = 0; i < _navLabels.length; i++) {
        expect(
          find.byKey(Key('nav_tab_$i')),
          findsOneWidget,
          reason: 'الموضع $i موجود في الشريط',
        );
        expect(
          _tabLabel(i),
          findsOneWidget,
          reason: 'تسمية الموضع $i هي «${_navLabels[i]}»',
        );
      }

      final center = find.byKey(const Key('nav_center_button'));
      expect(center, findsOneWidget);

      // RTL: ترتيب المواضع من اليمين يعني تناقص x من الأولى إلى الأخيرة.
      final xs = [
        for (var i = 0; i < _navLabels.length; i++)
          tester.getCenter(find.byKey(Key('nav_tab_$i'))).dx,
      ];
      for (var i = 1; i < xs.length; i++) {
        expect(
          xs[i - 1],
          greaterThan(xs[i]),
          reason: 'الموضع $i على يسار الموضع ${i - 1} في RTL',
        );
      }

      final centerX = tester.getCenter(center).dx;
      expect(
        centerX,
        lessThan(xs[1]),
        reason: 'الزرّ الوسطي بعد «خدماتنا» (الموضع ١)',
      );
      expect(
        centerX,
        greaterThan(xs[2]),
        reason: 'وقبل «خدمات الأعراس» (الموضع ٢)',
      );
    },
  );

  testWidgets(
    '(ب) ٣٩٠dp: الستّة تظهر بلا تمرير أفقي؛ و٣٢٠dp: الشريط يُمرَّر أفقياً',
    (tester) async {
      // ٣٩٠×٨٤٤dp على كثافة ٣ — قياس هاتف حقيقي، لا نافذة اختبار عريضة.
      await _pumpShell(
        tester,
        _shellApi(),
        physicalSize: const Size(390 * 3.0, 844 * 3.0),
        devicePixelRatio: 3,
      );
      await tester.pumpAndSettle();

      final bar = find.byKey(const Key('home_bottom_nav'));
      expect(
        tester.getSize(bar).width,
        moreOrLessEquals(390, epsilon: 0.5),
        reason: 'عرض الشريط عرض الشاشة المنطقي',
      );
      expect(
        find.descendant(of: bar, matching: find.byType(SingleChildScrollView)),
        findsNothing,
        reason: '٣٩٠dp ≥ ٣٤٤dp (٥×٥٦ + ٦٤) ⇒ صفٌّ بلا تمرير',
      );

      final barRect = tester.getRect(bar);
      for (var i = 0; i < _navLabels.length; i++) {
        final label = _tabLabel(i);
        expect(label, findsOneWidget);
        final rect = tester.getRect(label);
        expect(
          rect.left,
          greaterThanOrEqualTo(barRect.left - 0.5),
          reason: 'تسمية الموضع $i داخل الشريط أفقياً',
        );
        expect(rect.right, lessThanOrEqualTo(barRect.right + 0.5));
        expect(
          rect.top,
          greaterThanOrEqualTo(barRect.top - 0.5),
          reason: 'وتظهر كاملةً — لا تُقصّ خارج ارتفاع الشريط',
        );
        expect(rect.bottom, lessThanOrEqualTo(barRect.bottom + 0.5));
      }

      // أضيق من اللازم: صفٌّ بعرض ثابت داخل تمرير أفقي.
      tester.view.physicalSize = const Size(320 * 3.0, 844 * 3.0);
      tester.view.devicePixelRatio = 3;
      await tester.pump();

      expect(
        find.descendant(
          of: find.byKey(const Key('home_bottom_nav')),
          matching: find.byType(SingleChildScrollView),
        ),
        findsOneWidget,
        reason: '٣٢٠dp < ٣٤٤dp ⇒ الشريط يُمرَّر أفقياً',
      );
    },
  );

  testWidgets(
    '(ج) الزرّ الوسطي يفتح «مميّز عندنا» بالعناصر السبعة، ولا يغيّر الوجهة',
    (tester) async {
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('nav_center_button')));
      await tester.pumpAndSettle();

      expect(find.text('مميّز عندنا'), findsOneWidget, reason: 'عنوان الورقة');
      expect(find.byKey(const Key('featured_hub_hero')), findsOneWidget);

      const titles = [
        'حاسبة الذهب',
        'محوّل العملات',
        'ألبومات الأعراس',
        'البث المباشر',
        'آخر خبر',
        'متاجرنا',
        'دفتر النقوط',
      ];
      final rects = <Rect>[];
      for (var i = 0; i < titles.length; i++) {
        final item = find.byKey(Key('featured_hub_item_$i'));
        expect(item, findsOneWidget, reason: 'العنصر $i موجود');
        expect(
          find.descendant(of: item, matching: find.text(titles[i])),
          findsOneWidget,
          reason: 'عنوان العنصر $i هو «${titles[i]}»',
        );
        rects.add(tester.getRect(item));
      }

      // الشبكة ثلاثية: ٠١٢ في صفّ، ثم ٣٤٥، ثم ٦ — والترتيب من اليمين (x
      // يتناقص) داخل الصفّ الواحد.
      for (final pair in const [(0, 1), (1, 2), (3, 4), (4, 5)]) {
        expect(
          rects[pair.$1].top,
          moreOrLessEquals(rects[pair.$2].top, epsilon: 0.5),
          reason: 'العنصران ${pair.$1} و${pair.$2} في صفّ واحد',
        );
        expect(
          rects[pair.$1].center.dx,
          greaterThan(rects[pair.$2].center.dx),
          reason: 'العنصر ${pair.$1} على يمين ${pair.$2}',
        );
      }
      expect(rects[3].top, greaterThan(rects[0].top + 1), reason: 'الصفّ الثاني');
      expect(rects[6].top, greaterThan(rects[3].top + 1), reason: 'الصفّ الثالث');

      // الزرّ ليس وجهة: الوجهة المختارة ما زالت «المناسبات».
      expect(_selectedTab(tester), 0, reason: 'فتح الورقة لا يبدّل الوجهة');

      // و«أضف عرسك» كبسةٌ فوق الشريط لا عنصراً في الورقة.
      expect(
        find.descendant(of: find.byType(BottomSheet), matching: find.text('أضف عرسك')),
        findsNothing,
        reason: 'النشر مكانه الكبستان فوق الشريط، لا هذه الورقة',
      );
      expect(
        find.text('أضف عرسك'),
        findsOneWidget,
        reason: 'شاهد: الكبسة موجودة خارج الورقة',
      );

      // الإغلاق من زرّه.
      await tester.tap(find.byKey(const Key('featured_hub_close')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('featured_hub_hero')), findsNothing);
    },
  );

  testWidgets(
    '(د) «ألبومات الأعراس» تدفع شاشتها، و«دفتر النقوط» للزائر يُوقَف بحاجز الدخول',
    (tester) async {
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('nav_center_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('featured_hub_item_2')));
      await tester.pumpAndSettle();

      expect(
        find.byType(AlbumsScreen),
        findsOneWidget,
        reason: 'البطاقة تفتح شاشة الألبومات القائمة',
      );
      expect(
        find.byKey(const Key('featured_hub_hero')),
        findsNothing,
        reason: 'الورقة أُغلقت قبل الدفع',
      );

      navigatorKey.currentState!.pop();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('nav_center_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('featured_hub_item_6')));
      await tester.pumpAndSettle();

      expect(
        find.byType(NokootScreen),
        findsNothing,
        reason: 'الزائر لا يدخل دفتر النقوط',
      );
      expect(
        find.text('سجّل الدخول لفتح دفتر النقوط'),
        findsOneWidget,
        reason: 'حاجز الدخول الموحّد برسالته العربية',
      );
    },
  );

  testWidgets(
    '(هـ) المسجَّل: «مناسباتي» تعرض المنشورات أوّلاً ثمّ «قائمتي» تحتها',
    (tester) async {
      final api = _shellApi(
        myEvents: [_publishedEvent()],
        myList: _myListBody(),
      );
      final auth = await _signedInAuth(api);
      await _pumpShell(tester, api, auth: auth);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('nav_tab_3')));
      await tester.pumpAndSettle();

      final published = find.byKey(const Key('my_hub_header_published'));
      final list = find.byKey(const Key('my_hub_header_list'));
      expect(published, findsOneWidget);
      expect(list, findsOneWidget);
      expect(
        tester.getTopLeft(published).dy,
        lessThan(tester.getTopLeft(list).dy),
        reason: 'المنشورات فوق «قائمتي»',
      );

      expect(
        find.byType(EventCard),
        findsOneWidget,
        reason: 'مناسبة منشورة من /api/my-events',
      );
      expect(
        find.byKey(const Key('my_list_row_2')),
        findsOneWidget,
        reason: 'صفّ محفوظ من /api/my-reminders تحت العنوان الثاني',
      );
      expect(
        tester.getTopLeft(find.byKey(const Key('my_list_row_2'))).dy,
        greaterThan(tester.getTopLeft(list).dy),
        reason: 'صفّ «قائمتي» تحت عنوانها لا فوقه',
      );
    },
  );

  testWidgets(
    '(و) الزائر: «مناسباتي» دعوةُ دخول، و«حسابي» شاشتها الزائرة',
    (tester) async {
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('nav_tab_3')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('my_hub_guest')),
        findsOneWidget,
        reason: 'دعوة الدخول بدل قائمتين فارغتين',
      );

      await tester.tap(find.byKey(const Key('nav_tab_4')));
      await tester.pumpAndSettle();
      expect(
        find.text('لم تسجّل الدخول بعد'),
        findsOneWidget,
        reason: '«حسابي» آخر وجهة، وشاشتها الزائرة كما هي',
      );
    },
  );

  testWidgets(
    '(ز) كبستا «أضف عرسك/أضف خدمتك» باقيتان تحت الجسم وفوق الشريط',
    (tester) async {
      await _pumpShell(tester, _shellApi());
      await tester.pumpAndSettle();

      final addEvent = find.byKey(const Key('shell_add_event'));
      final addService = find.byKey(const Key('shell_add_service'));
      final bar = find.byKey(const Key('home_bottom_nav'));

      expect(addEvent, findsOneWidget);
      expect(addService, findsOneWidget);

      // الجسم فوقهما والشريط تحتهما: موضعهما في `bottomNavigationBar` بينهما.
      final bodyBottom = tester
          .getBottomLeft(find.byType(IndexedStack))
          .dy;
      final barTop = tester.getTopLeft(bar).dy;
      final capsulesTop = tester.getTopLeft(addEvent).dy;
      final capsulesBottom = tester.getBottomLeft(addEvent).dy;

      expect(
        capsulesTop,
        greaterThanOrEqualTo(bodyBottom - 0.5),
        reason: 'الكبستان تحت جسم الشاشة',
      );
      expect(
        capsulesBottom,
        lessThanOrEqualTo(barTop + 0.5),
        reason: 'وفوق الشريط السفلي',
      );
      expect(
        tester.getBottomLeft(addService).dy,
        lessThanOrEqualTo(barTop + 0.5),
        reason: '«أضف خدمتك» في الصفّ نفسه',
      );

      // وتبقى الظاهرة في وجهة أخرى أيضاً.
      await tester.tap(find.byKey(const Key('nav_tab_1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('shell_add_event')), findsOneWidget);
      expect(find.byKey(const Key('shell_add_service')), findsOneWidget);
    },
  );

  testWidgets(
    '(ح) المسجَّل: «صمّم بطاقة دعوتك» يغلق الورقة وينتقل إلى «مناسباتي»',
    (tester) async {
      final api = _shellApi(
        myEvents: [_publishedEvent()],
        myList: _myListBody(),
      );
      final auth = await _signedInAuth(api);
      await _pumpShell(tester, api, auth: auth);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('nav_center_button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('featured_hub_hero')));
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('featured_hub_hero')),
        findsNothing,
        reason: 'الورقة أُغلقت',
      );
      expect(_selectedTab(tester), 3, reason: 'والانتقال إلى «مناسباتي»');
      expect(
        find.byKey(const Key('my_hub_header_published')),
        findsOneWidget,
        reason: 'شاشة «مناسباتي» ظاهرة بعد الانتقال',
      );
    },
  );

  testWidgets(
    '(ط) «مناسباتي» لا تجلب وهي مخفيّة، وتجلب من جديد مع كل عودة إليها',
    (tester) async {
      final requests = <Uri>[];
      final api = _shellApi(
        requests: requests,
        myEvents: [_publishedEvent()],
        myList: _myListBody(),
      );
      final auth = await _signedInAuth(api);
      await _pumpShell(tester, api, auth: auth);
      await tester.pumpAndSettle();

      int myEventsRequests() => requests
          .where((uri) => uri.path.endsWith('/api/my-events'))
          .length;

      // مخفيّة عند الإقلاع: لا طلب. لو جُلبت حينها لبقيت نسختها من البداية
      // قديمةً لا تتجدّد بعد نشر مناسبة من وجهة أخرى.
      expect(
        myEventsRequests(),
        0,
        reason: 'القسم مخفيّ خلف التبويب فلا يُجلب قبل ظهوره',
      );

      await tester.tap(find.byKey(const Key('nav_tab_3')));
      await tester.pumpAndSettle();
      expect(myEventsRequests(), 1, reason: 'أوّل ظهورٍ جلبٌ واحد');
      expect(find.byType(EventCard), findsOneWidget, reason: 'القائمة رُسمت');

      // مغادرة الوجهة ثم العودة إليها: جلب جديد — وإلا لم تظهر مناسبة أُضيفت
      // في الأثناء (نشرٌ من «أضف عرسك» في وجهة أخرى) حتى سحبٍ للتحديث.
      await tester.tap(find.byKey(const Key('nav_tab_0')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('nav_tab_3')));
      await tester.pumpAndSettle();

      expect(
        myEventsRequests(),
        2,
        reason: 'العودة إلى «مناسباتي» جلبٌ جديد لا نسخة الإقلاع',
      );
      expect(find.byType(EventCard), findsOneWidget, reason: 'والقائمة باقية');
    },
  );
}
