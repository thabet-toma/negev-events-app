import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/welcome.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// شريط الإحصائيات في الرئيسية (تذكرة #172): عدد المناسبات القادمة في كل
/// محافظة، والمجموع، و«حُدّث HH:MM» — والتعميم الحيّ يحلّ محلّه كاملاً.
///
/// الخادم جاهز (`GET /api/stats/ticker` و`GET /api/broadcasts/live`) ولا
/// يُلمس هنا: الردّان يُصنَّعان بالعقد الموثَّق نفسه، والأعداد تُعرض كما وصلت.

/// لحظة الحساب: 09:07 بالتوقيت **المحلي** للجهاز. تُبنى محلياً ثم تُرسَل UTC في
/// الردّ، فتحويل العميل إلى المحلي يجب أن يعيد 09:07 على أي جهاز وفي أي منطقة
/// زمنية — ولو قرأ العميل الـUTC أو نسي التحويل لسقط النصّ المُتوقَّع.
final DateTime _updatedLocal = DateTime(2026, 11, 2, 9, 7);
final String _updatedIso = _updatedLocal.toUtc().toIso8601String();

Map<String, dynamic> _statsBody({
  List<Map<String, dynamic>>? regions,
  // 16 لا 15 عمداً: مجموع الصفّين 12+3، فلو جمع العميل بنفسه لعرض 15 —
  // والتأكيد على «المجموع 16» يسقط حينها. العقد: `total` يُعرض كما وصل.
  int total = 16,
  bool withUpdatedAt = true,
}) =>
    {
      'success': true,
      'regions': regions ??
          [
            {'region_id': 1, 'name': 'النقب', 'upcoming_count': 12},
            {'region_id': 2, 'name': 'محافظة طولكرم', 'upcoming_count': 3},
          ],
      'total': total,
      if (withUpdatedAt) 'updated_at': _updatedIso,
    };

/// خادم وهمي: الشريط والتعاميم بالجسمين المُمرَّرين، وتغذية فارغة، وستوريات
/// وأنواع مناسبات فارغة، وبطاقة دخول مطفأة (لا مؤقّت ثلاث ثوانٍ يشوّش
/// `pumpAndSettle`). [requests] يلتقط كل طلب.
NegevApi _api({
  required Map<String, dynamic> stats,
  List<Map<String, dynamic>> broadcasts = const [],
  List<Map<String, dynamic>> events = const [],
  List<Uri>? requests,
  bool statsFails = false,
}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    final path = request.url.path;
    Object body = {'success': true};
    if (path.endsWith('/api/stats/ticker')) {
      if (statsFails) {
        return http.Response(
          jsonEncode({'success': false, 'message': 'خدمة الإحصاء غير متاحة'}),
          500,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }
      body = stats;
    } else if (path.endsWith('/api/broadcasts/live')) {
      body = {'success': true, 'broadcasts': broadcasts};
    } else if (path.endsWith('/api/events')) {
      body = {
        'success': true,
        'events': events,
        'pagination': {
          'page': 1,
          'limit': 30,
          'total': events.length,
          'totalPages': events.isEmpty ? 0 : 1,
        },
        'announcements': <Map<String, dynamic>>[],
      };
    } else if (path.endsWith('/api/stories/entry-card')) {
      body = {'success': true, 'enabled': false, 'source': null, 'story': null};
    } else if (path.endsWith('/api/stories')) {
      body = {'success': true, 'stories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/occasion-types')) {
      body = {'success': true, 'types': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/live')) {
      body = {'success': true, 'live': null};
    }
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

Future<void> _pumpFeed(WidgetTester tester, NegevApi api) async {
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: EventsScreen(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'الشريط يرسم محافظةً لكل صفّ وعددها كما وصل، والمجموع، و«حُدّث HH:MM» بالساعة المحلية',
    (tester) async {
      await _pumpFeed(tester, _api(stats: _statsBody()));

      expect(find.byKey(const Key('home_stats_ticker')), findsOneWidget,
          reason: 'رقم وصل من الخادم ⇒ الشريط ظاهر');

      final negevChip = find.byKey(const Key('home_stats_region_1'));
      expect(negevChip, findsOneWidget, reason: 'صفّ لكل محافظة');
      expect(
        find.descendant(of: negevChip, matching: find.text('النقب')),
        findsOneWidget,
        reason: 'اسم المحافظة كما وصل',
      );
      expect(
        find.descendant(of: negevChip, matching: find.text('12')),
        findsOneWidget,
        reason: 'عدد المحافظة كما وصل — لا جمع في العميل',
      );

      final tulkarmChip = find.byKey(const Key('home_stats_region_2'));
      expect(
        find.descendant(of: tulkarmChip, matching: find.text('محافظة طولكرم')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: tulkarmChip, matching: find.text('3')),
        findsOneWidget,
      );

      expect(find.text('المجموع 16'), findsOneWidget,
          reason: 'total يُعرض كما أعاده الخادم — لو جمعه العميل لصار 15 وسقط هنا');

      final updated = tester.widget<Text>(
        find.byKey(const Key('home_stats_ticker_updated')),
      );
      expect(
        updated.data,
        'حُدّث 09:07',
        reason: '«حُدّث HH:MM» بالساعة المحلية: 09:07 محلياً = 06:07 UTC في '
            'هذا الـfixture، فأي قراءة عالمية أو صيغة بساعة واحدة تسقط هنا',
      );
    },
  );

  testWidgets('تعميم حيّ يحلّ محلّ الشريط: يُعرض التعميم ولا يُرسم الشريط',
      (tester) async {
    final requests = <Uri>[];
    await _pumpFeed(
      tester,
      _api(
        stats: _statsBody(),
        broadcasts: [
          {
            'id': 9,
            'title': 'تعميم المنصة',
            'message': 'غداً صيانة مسائية',
            'tone': 'info',
          },
        ],
        requests: requests,
      ),
    );

    expect(find.byKey(const Key('home_broadcast_ticker')), findsOneWidget,
        reason: 'التعميم الحيّ معروض في مكان الشريط');
    expect(find.text('تعميم المنصة'), findsOneWidget);
    expect(find.text('غداً صيانة مسائية'), findsOneWidget);

    expect(find.byKey(const Key('home_stats_ticker')), findsNothing,
        reason: 'الشريط غاب: التعميم حلّ محلّه لا شاركه');
    expect(find.text('المجموع 16'), findsNothing,
        reason: 'ولا أرقام الشريط تُرسم تحته');

    // شاهد موجب: الشريط لم يغب لأننا لم نسأل عنه — الطلب وقع فعلاً.
    expect(
      requests.where((url) => url.path.endsWith('/api/stats/ticker')),
      hasLength(1),
      reason: 'العدّ طُلب ثم أُخفي لأن تعميماً حيّاً حلّ محلّه',
    );
  });

  testWidgets('داخل HomeShell: شريط تعميم واحد مشترك، وإغلاقه يعيد شريط الإحصاءات',
      (tester) async {
    // نافذة أعلى من الافتراضية: الهيكل يحمل ترويسة وكبستين وشريط تنقّل،
    // والكرت لا يفيض في ارتفاع هاتف فعلي.
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    SharedPreferences.setMockInitialValues({
      regionOnboardedKey: true,
      welcomeSeenKey: true,
    });

    final api = _api(
      stats: _statsBody(),
      broadcasts: [
        {
          'id': 9,
          'title': 'تعميم المنصة',
          'message': 'غداً صيانة مسائية',
          'tone': 'info',
        },
      ],
    );
    await tester.pumpWidget(
      AppServices(
        api: api,
        auth: AuthStore(api),
        realtime: RealtimeService(),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Directionality(
            textDirection: TextDirection.rtl,
            child: HomeShell(),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpAndSettle();

    // على «المناسبات»: شريط التغذية هو الوحيد — الحالة مشتركة مع الهيكل،
    // فلا يضيف الهيكل شريطاً ثانياً حين تكون وجهة التغذية هي المختارة.
    expect(find.byKey(const Key('home_broadcast_ticker')), findsOneWidget);
    expect(find.byKey(const Key('shell_broadcast_banner')), findsNothing,
        reason: 'شريط التعميم واحد: التغذية ترسمه من الحالة المشتركة نفسها');
    expect(find.byKey(const Key('home_stats_ticker')), findsNothing,
        reason: 'التعميم الحيّ حلّ محلّ شريط الإحصاءات');
    expect(find.text('المجموع 16'), findsNothing,
        reason: 'ولا أرقام الإحصاء تُرسم تحته');

    // على وجهة أخرى: شريط الهيكل يقف مكانه — تبادلٌ لا اجتماع.
    final navBar = find.byType(NavigationBar);
    await tester.tap(find.descendant(of: navBar, matching: find.text('خدماتنا')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('shell_broadcast_banner')), findsOneWidget,
        reason: 'على غير وجهة التغذية يرسم الهيكل التعميم من الحالة نفسها');
    expect(find.byKey(const Key('home_broadcast_ticker')), findsNothing,
        reason: 'وشريط التغذية تحت الوجهة غير المختارة ليس شريطاً ثانياً معروضاً');

    // عودة إلى «المناسبات»: الإغلاق من الشريط الجديد نفسه (بلا زرّ في الشاشة
    // وحدها ولا في الهيكل وحده — الحالة واحدة).
    await tester.tap(find.descendant(of: navBar, matching: find.text('المناسبات')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('home_broadcast_ticker_dismiss')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home_broadcast_ticker')), findsNothing,
        reason: 'التعميم أُغلق من الحالة المشتركة');
    expect(find.byKey(const Key('home_stats_ticker')), findsOneWidget,
        reason: 'وشريط الإحصاءات عاد فوراً: الإغلاق واحد للهيكل والتغذية');
    expect(find.text('المجموع 16'), findsOneWidget);
  });

  testWidgets('بلا تعميم حيّ: الشريط ظاهر وشريط التعميم غائب',
      (tester) async {
    await _pumpFeed(tester, _api(stats: _statsBody(), broadcasts: const []));

    expect(find.byKey(const Key('home_broadcast_ticker')), findsNothing,
        reason: 'لا تعميم حيّ ⇒ لا شريط تعميم');
    expect(find.byKey(const Key('home_stats_ticker')), findsOneWidget,
        reason: 'وما بقي معروضاً هو الشريط — الإخفاء مشروط بالتعميم لا دائم');
    expect(
      tester.widget<Text>(find.byKey(const Key('home_stats_ticker_updated'))).data,
      'حُدّث 09:07',
    );
  });

  testWidgets('شريط بلا محافظات لا يُرسم — لا إطار فارغ',
      (tester) async {
    await _pumpFeed(tester, _api(stats: _statsBody(regions: const [], total: 0)));

    expect(find.byKey(const Key('home_stats_ticker')), findsNothing,
        reason: 'قائمة محافظات فارغة (لا محافظة نشطة) ⇒ لا شريط أرقام فارغ');
  });

  testWidgets('فشل مسار الإحصاء صامت: لا شريط، والتغذية تُبنى كما هي',
      (tester) async {
    await _pumpFeed(
      tester,
      _api(
        stats: _statsBody(),
        statsFails: true,
        // شاهدٌ من محتوى التغذية نفسه: كرت المناسبة وعنوانه. `EventsScreen`
        // جذرٌ زرعه الاختبار فيسقط لو أُفرغت التغذية — لا يُثبت أن الكرت بُني.
        events: const [
          {
            'id': 77,
            'groom_name': 'اسم 77',
            'town': 'رهط',
            'event_date': '2026-09-20',
          },
        ],
      ),
    );

    expect(find.byKey(const Key('home_stats_ticker')), findsNothing,
        reason: 'ردّ فاشل ⇒ لا أرقام كاذبة');
    expect(find.byKey(const Key('home_broadcast_ticker')), findsNothing);
    expect(find.text('اسم 77'), findsOneWidget,
        reason: 'كرت التغذية بُني رغم فشل شريط الإحصاء — ولو أُفرغت التغذية لسقط هذا');
  });

  testWidgets('updated_at غائب لا يكتب وقتاً مخترعاً — الشريط يبقى بأرقامه',
      (tester) async {
    await _pumpFeed(tester, _api(stats: _statsBody(withUpdatedAt: false)));

    expect(find.byKey(const Key('home_stats_ticker')), findsOneWidget);
    expect(find.text('المجموع 16'), findsOneWidget);
    // `updated_at` غائب من الجسم في هذا الـfixture.
    final updated = tester.widget<Text>(
      find.byKey(const Key('home_stats_ticker_updated')),
    );
    expect(updated.data, '', reason: 'لا «حُدّث» بوقت غير معروف');
  });
}
