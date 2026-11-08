import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/agenda_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// أجندة المناسبات — تقويم الشهر (تذكرة #175).
///
/// الخادم لا يُلمس هنا: الردود تُصنَّع بعقدها الموثَّق نفسه —
/// `GET /api/events/calendar` ← `{ days: [{ date, count }] }`،
/// و`GET /api/events` ← صفحة المناسبات، و`GET /api/towns` ← كتالوج المحافظات —
/// فما يُختبر هو ما تفعله الشاشة بهذه الردود لا حسابها الخاص.

/// الأيام المختارة في الشهر الحالي: **ثابتة داخل الشهر، لا الأوّل والثاني**،
/// ولا تساوي يوم اليوم أبداً. الأشهر كلها فيها ٥ و٨ و٢٠؛ ولو طابق أحدها اليومَ
/// لكان مختاراً سلفاً، فتُبتلع نقرة الاختيار (`_onDaySelected` يتجاهل النقر على
/// اليوم المختار) ويختلط تأكيد «اليوم مبروز» بتأكيد النقطة. والثالث (٢٠) بلا
/// مناسبة في ردود التقويم، فهو دليل يومٍ لا نقطة له.
final DateTime _now = DateTime.now();
final int _singleDay = _now.day == 5 ? 6 : 5;
final int _manyDay = _now.day == 8 ? 9 : 8;
final int _emptyDay = _now.day == 20 ? 21 : 20;

String _monthKey() => '${_now.year}-${_now.month.toString().padLeft(2, '0')}';
String _dayKey(int day) => '${_monthKey()}-${day.toString().padLeft(2, '0')}';

/// ردّ JSON ناجح كما يصنعه الخادم — بالترويسة نفسها.
http.Response _json(Object body) => http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// كتالوج الأماكن في `GET /api/towns`: بلدتان ومحافظتان نشِطتان — يكفي لرسم
/// حبات الفلتر ولاختيار محافظةٍ غير «كل المحافظات».
Map<String, dynamic> _townsBody() => {
      'success': true,
      'towns': ['رهط', 'حورة'],
      'town_coordinates': {
        'رهط': {'lat': 31.3, 'lng': 34.8},
        'حورة': {'lat': 31.2, 'lng': 34.9},
      },
      'villages': <Map<String, dynamic>>[],
      'regions': [
        {'id': 7, 'name': 'النقب', 'is_active': true},
        {'id': 8, 'name': 'المثلث', 'is_active': true},
      ],
      'regions_soon': <Map<String, dynamic>>[],
    };

/// صفحة فارغة من `GET /api/events` — عقد المسار نفسه (`pagination` كاملة).
Map<String, dynamic> _emptyPage() => {
      'success': true,
      'events': <Map<String, dynamic>>[],
      'pagination': {'page': 1, 'limit': 100, 'total': 0, 'totalPages': 0},
      'announcements': <Map<String, dynamic>>[],
    };

/// طلب واحد وصل إلى الخادم الوهمي — المسار والاستعلام والترويسات.
class _Call {
  final Uri url;
  final Map<String, String> headers;

  const _Call(this.url, this.headers);
}

/// خادم وهمي: تقويم فيه مناسبة واحدة في [_singleDay] واثنتان في [_manyDay]،
/// ومناسبات اليوم المختار تُصنَّع بحسب `date_from` — فاختيار يوم يغيّر القائمة
/// فعلاً، ولو عادت الشاشة إلى مصفوفة محلية لما ظهر شيء.
NegevApi _api(List<_Call> calls) {
  final client = MockClient((request) async {
    calls.add(_Call(request.url, request.headers));
    final path = request.url.path;
    final dateFrom = request.url.queryParameters['date_from'];
    Object body = {'success': true};

    if (path.endsWith('/api/towns')) {
      body = _townsBody();
    } else if (path.endsWith('/api/events/calendar')) {
      body = {
        'success': true,
        'days': [
          {'date': _dayKey(_singleDay), 'count': 1},
          {'date': _dayKey(_manyDay), 'count': 2},
        ],
      };
    } else if (path.endsWith('/api/events')) {
      final events = switch (dateFrom) {
        final String day when day == _dayKey(_singleDay) => [_event(101, 'مناسبة اليوم الأول')],
        final String day when day == _dayKey(_manyDay) => [
            _event(201, 'مناسبة اليوم الثاني'),
            _event(202, 'مناسبة اليوم الثاني الأخرى'),
          ],
        _ => [_event(1, 'مناسبة اليوم')],
      };
      body = {
        'success': true,
        'events': events,
        'pagination': {'page': 1, 'limit': 100, 'total': events.length, 'totalPages': 1},
        'announcements': <Map<String, dynamic>>[],
      };
    }

    return _json(body);
  });
  return NegevApi(ApiClient(client: client));
}

Map<String, dynamic> _event(int id, String title) => {
      'id': id,
      'title': title,
      'groom_name': title,
      'family_clan': 'عائلة الاختبار',
      'town': 'رهط',
      'event_date': _dayKey(_singleDay),
      'dinner_time': '',
      'status': 'approved',
      'visibility': 'public',
      'reactions': <String, int>{},
      'reactions_total': 0,
      'views_count': 0,
      'honorees': <Map<String, dynamic>>[],
      'extra_days': <Map<String, dynamic>>[],
    };

Future<void> _pumpAgenda(WidgetTester tester, NegevApi api) async {
  await _pumpAgendaScreen(tester, api);
  // ننتظر نقطة العدّ لا مجرّد الخلية: الخلية تُرسم قبل وصول ردّ التقويم،
  // والنقطة هي دليل أن الردّ طُبِّق فعلاً.
  await _pumpUntil(tester, find.byKey(ValueKey<String>('agenda_dot_${_dayKey(_singleDay)}')));
}

/// يبني الشاشة وحدها بلا انتظار ردّ بعينه — للاختبارات التي تنتظر ردّاً آخر
/// (ردّ محافظةٍ بعينها، أو اكتمال صفحتين) فلا تنتظر نقطةً لن تصل.
Future<void> _pumpAgendaScreen(WidgetTester tester, NegevApi api) async {
  // شاشة عالية كي يُبنى قسم «مناسبات اليوم» تحت شبكة التقويم: على المقاس
  // الافتراضي (800×600) تملأ الخلايا المربّعة الشاشة فيبقى القسم تحتها خارج
  // ما يبنيه `ListView` بالتحميل الكسول، فلا يدخل الاختبار أصلاً.
  tester.view.physicalSize = const Size(900, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: AgendaScreen(),
        ),
      ),
    ),
  );
}

/// يضخّ إطارات قصيرة حتى يظهر [finder] — لا `pumpAndSettle` (مؤشّر التحميل
/// يتحرّك بلا نهاية، فلا يستقرّ شيء قبل وصول الردّ).
Future<void> _pumpUntil(WidgetTester tester, Finder finder, {int tries = 30}) async {
  for (var i = 0; i < tries; i++) {
    if (finder.evaluate().isNotEmpty) return;
    await tester.pump(const Duration(milliseconds: 20));
  }
}

/// يضخّ إطارات قصيرة حتى يتحقّق [predicate] على أحد الطلبات الواصلة.
Future<void> _pumpUntilRequest(
  WidgetTester tester,
  List<_Call> calls,
  bool Function(_Call) predicate, {
  int tries = 30,
}) async {
  for (var i = 0; i < tries; i++) {
    if (calls.any(predicate)) return;
    await tester.pump(const Duration(milliseconds: 20));
  }
}

Color? _dotColor(WidgetTester tester, String dayKey) {
  final finder = find.byKey(ValueKey<String>('agenda_dot_$dayKey'));
  if (finder.evaluate().isEmpty) return null;
  final container = tester.widget<Container>(finder);
  return (container.decoration as BoxDecoration).color;
}

BoxBorder? _cellBorder(WidgetTester tester, String dayKey) {
  final container = tester.widget<Container>(find.byKey(ValueKey<String>('agenda_day_$dayKey')));
  return (container.decoration as BoxDecoration).border;
}

/// عدد كروت المناسبات في قائمة اليوم — من `children` التي بناها `build`، لا
/// من العناصر الحيّة: `ListView` يبني ما يظهر وحده، فيومٌ من ١٥٠ مناسبة لا
/// يكون فيه على الشاشة إلا نحو عشرين، والعدّ من الشاشة يقيس التمرير لا الحمل.
int _listedCards(WidgetTester tester) {
  final list = tester.widget<ListView>(
    find.descendant(of: find.byType(RefreshIndicator), matching: find.byType(ListView)),
  );
  final delegate = list.childrenDelegate as SliverChildListDelegate;
  return delegate.children.whereType<Card>().length;
}

/// يضخّ إطارات قصيرة حتى تصير قائمة اليوم [expected] مناسبة.
Future<void> _pumpUntilListed(WidgetTester tester, int expected, {int tries = 40}) async {
  for (var i = 0; i < tries; i++) {
    if (_listedCards(tester) == expected) return;
    await tester.pump(const Duration(milliseconds: 20));
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('التقويم يعدّ من مسار الخادم: نقطة ذهبية لواحدة وحمراء لاثنتين، ولا عدّ محلي', (tester) async {
    final calls = <_Call>[];
    await _pumpAgenda(tester, _api(calls));

    // عدّ الأيام من `GET /api/events/calendar` لا من `GET /api/events`.
    expect(
      calls.where((call) => call.url.path.endsWith('/api/events/calendar')).length,
      1,
      reason: 'الشهر يُجلب من مسار التقويم مرّة عند الفتح',
    );
    expect(
      calls.firstWhere((call) => call.url.path.endsWith('/api/events/calendar')).url.queryParameters['month'],
      _monthKey(),
      reason: 'الشهر بصيغة YYYY-MM',
    );

    // نقطة واحدة ذهبية، ونقطتان حمراوان — لونٌ لكل عدد لا لونٌ واحد.
    expect(_dotColor(tester, _dayKey(_singleDay)), NegevPalette.light.gold,
        reason: 'مناسبة واحدة = نقطة ذهبية');
    expect(_dotColor(tester, _dayKey(_manyDay)), NegevPalette.light.danger,
        reason: 'مناسبتان فأكثر = نقطة حمراء');

    // يومٌ لا مناسبة فيه لا نقطة له — الدليل الموجب على أن النقاط من العدّ.
    expect(_dotColor(tester, _dayKey(_emptyDay)), isNull, reason: 'يوم بلا مناسبة بلا نقطة');
  });

  testWidgets('اليوم الحالي مبروز بإطار سموي حتى وهو غير مختار', (tester) async {
    final calls = <_Call>[];
    await _pumpAgenda(tester, _api(calls));

    final todayKey = _dayKey(_now.day);
    // اختيار يوم آخر أوّلاً، كي يُقاس تمييز «اليوم» لا تمييز «المختار».
    await tester.tap(find.byKey(ValueKey<String>('agenda_day_${_dayKey(_manyDay)}')));
    await tester.pump();

    final todayBorder = _cellBorder(tester, todayKey) as Border?;
    expect(todayBorder, isNotNull, reason: 'لخلية اليوم إطار');
    expect(todayBorder!.top.color, NegevPalette.light.sky, reason: 'لون إطار اليوم سموي');
    expect(todayBorder.top.width, 2, reason: 'وإطاره أسمك من خلية عادية');

    final plainBorder = _cellBorder(tester, _dayKey(_singleDay)) as Border?;
    expect(plainBorder!.top.color, Colors.transparent, reason: 'خلية غير اليوم وغير المختارة بلا إطار');
  });

  testWidgets('النقر على يوم يعرض مناسباته وحدها من GET /api/events بـdate_from/date_to', (tester) async {
    final calls = <_Call>[];
    await _pumpAgenda(tester, _api(calls));

    // القائمة الأولى: يوم اليوم كما طلبه الإقلاع.
    expect(
      calls.firstWhere((call) => call.url.path.endsWith('/api/events')).url.queryParameters['date_from'],
      _dayKey(_now.day),
      reason: 'قائمة اليوم المختار تُطلب من المسار القائم بحدّ يوم واحد',
    );

    calls.clear();
    await tester.tap(find.byKey(ValueKey<String>('agenda_day_${_dayKey(_manyDay)}')));
    await _pumpUntil(tester, find.text('مناسبة اليوم الثاني'));

    final dayRequest = calls.firstWhere((call) => call.url.path.endsWith('/api/events')).url;
    expect(dayRequest.queryParameters['date_from'], _dayKey(_manyDay), reason: 'بداية النطاق يوم النقر');
    expect(dayRequest.queryParameters['date_to'], _dayKey(_manyDay), reason: 'ونهايته اليوم نفسه');
    expect(find.text('مناسبة اليوم الثاني'), findsOneWidget);
    expect(find.text('مناسبة اليوم الثاني الأخرى'), findsOneWidget);
    expect(find.text('مناسبة اليوم'), findsNothing, reason: 'مناسبات يوم آخر لا تظهر تحت اليوم المختار');
    expect(find.text('2 مناسبة'), findsOneWidget, reason: 'عدّاد العنوان يعدّ مناسبات اليوم المختار');
  });

  testWidgets('فلتر المحافظة يعيد جلب الشهر بـregion_id واليوم بترويسة X-Region', (tester) async {
    final calls = <_Call>[];
    await _pumpAgenda(tester, _api(calls));

    // الافتراضي: كل المحافظات — بلا region_id، والمسار الموسَّع علَم لا ترويسة.
    expect(
      calls.firstWhere((call) => call.url.path.endsWith('/api/events/calendar')).url.queryParameters.containsKey('region_id'),
      isFalse,
      reason: '«كل المحافظات» لا يرسل region_id',
    );
    expect(
      calls.firstWhere((call) => call.url.path.endsWith('/api/events')).url.queryParameters['all_regions'],
      '1',
      reason: 'وقائمة اليوم توسيعٌ صريح لا تقييد بمحافظة محفوظة',
    );

    // الحبات تُرسم عند وصول كتالوج البلدات (GET /api/towns) لا قبله.
    await _pumpUntil(tester, find.byKey(const ValueKey<String>('agenda_region_7')));
    expect(find.byKey(const ValueKey<String>('agenda_region_7')), findsOneWidget,
        reason: 'حبات المحافظات من GET /api/towns وحده');
    expect(find.text('المثلث'), findsOneWidget);

    calls.clear();
    await tester.tap(find.byKey(const ValueKey<String>('agenda_region_7')));
    await _pumpUntilRequest(
      tester,
      calls,
      (call) => call.url.path.endsWith('/api/events/calendar') && call.url.queryParameters['region_id'] == '7',
    );
    final monthRequest = calls.firstWhere((call) => call.url.path.endsWith('/api/events/calendar'));
    expect(monthRequest.url.queryParameters['region_id'], '7', reason: 'عدّ الشهر يُعاد جلبه بمحافظة الفلتر');

    final dayRequest = calls.firstWhere((call) => call.url.path.endsWith('/api/events'));
    expect(dayRequest.headers['X-Region'], '7', reason: 'وقائمة اليوم تُقيَّد بالمحافظة نفسها ترويسةً');
    expect(dayRequest.url.queryParameters.containsKey('all_regions'), isFalse,
        reason: 'محافظة محدّدة ليست طلب «كل المحافظات»');
  });

  testWidgets('ردّ تقويم محافظةٍ سابقة يصل أخيراً فلا يرسم نقاطه (#175)', (tester) async {
    final calls = <_Call>[];
    final pending = <Completer<void>>[];
    final client = MockClient((request) async {
      calls.add(_Call(request.url, request.headers));
      final path = request.url.path;

      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        final region = request.url.queryParameters['region_id'];
        if (region == '7') {
          // جواب المحافظة الأولى يُحلّ متى شاء الاختبار — بعد جواب الثانية.
          final gate = Completer<void>();
          pending.add(gate);
          await gate.future;
          return _json({
            'success': true,
            'days': [
              {'date': _dayKey(_singleDay), 'count': 3},
            ],
          });
        }
        if (region == '8') {
          return _json({
            'success': true,
            'days': [
              {'date': _dayKey(_manyDay), 'count': 2},
            ],
          });
        }
        return _json({'success': true, 'days': <Map<String, dynamic>>[]});
      }
      if (path.endsWith('/api/events')) return _json(_emptyPage());
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    await _pumpUntil(tester, find.byKey(const ValueKey<String>('agenda_region_7')));

    // محافظة ٧ تُختار أولاً وجوابها معلَّق.
    await tester.tap(find.byKey(const ValueKey<String>('agenda_region_7')));
    await _pumpUntilRequest(
      tester,
      calls,
      (call) => call.url.path.endsWith('/api/events/calendar') && call.url.queryParameters['region_id'] == '7',
    );
    expect(pending.length, 1, reason: 'طلب المحافظة الأولى لم يجب بعد');

    // ثم ٨، وجوابها يصل فوراً فيرسم نقاطها وحدها.
    await tester.tap(find.byKey(const ValueKey<String>('agenda_region_8')));
    await _pumpUntil(tester, find.byKey(ValueKey<String>('agenda_dot_${_dayKey(_manyDay)}')));
    expect(_dotColor(tester, _dayKey(_manyDay)), NegevPalette.light.danger,
        reason: 'مناسبتا المحافظة الأخيرة = نقطة حمراء');

    // جواب ٧ يصل أخيراً: لا يكتب العدّ ولا يعيد الرسم.
    pending.single.complete();
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(_dotColor(tester, _dayKey(_manyDay)), NegevPalette.light.danger,
        reason: 'نقاط المحافظة المختارة تبقى بعد وصول الجواب الأقدم');
    expect(_dotColor(tester, _dayKey(_singleDay)), isNull,
        reason: 'جواب محافظةٍ سابقة متأخّر لا يرسم نقطة — حارس الهوية يشمل المحافظة لا الشهر وحده');
  });

  testWidgets('صفحة ثانية فارغة تبقي شارة اليوم من pagination.total وتعلن القائمة الناقصة (#175)', (tester) async {
    const total = 150;
    final calls = <_Call>[];
    final firstPage = [for (var i = 1; i <= 100; i++) _event(1000 + i, 'مناسبة رقمية $i')];
    final client = MockClient((request) async {
      calls.add(_Call(request.url, request.headers));
      final path = request.url.path;

      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        // اليوم غائب عمداً، كي لا تأتي الشارة من `_dayCounts` بل من `_dayTotal`.
        return _json({'success': true, 'days': <Map<String, dynamic>>[]});
      }
      if (path.endsWith('/api/events')) {
        final isSelectedDay = request.url.queryParameters['date_from'] == _dayKey(_manyDay);
        final page = int.tryParse(request.url.queryParameters['page'] ?? '1') ?? 1;
        final events = isSelectedDay && page == 1 ? firstPage : const <Map<String, dynamic>>[];
        return _json({
          'success': true,
          'events': events,
          // حُذفت الخمسون مناسبة بين طلبي الصفحة: العدّ الذي بدأ به الخادم 150،
          // لكن الصفحة الثانية صارت فارغة. لا يجوز أن تتحول الشارة إلى 100.
          'pagination': {'page': page, 'limit': 100, 'total': isSelectedDay ? total : 0, 'totalPages': isSelectedDay ? 2 : 0},
          'announcements': <Map<String, dynamic>>[],
        });
      }
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    calls.clear();
    await tester.tap(find.byKey(ValueKey<String>('agenda_day_${_dayKey(_manyDay)}')));
    await _pumpUntilListed(tester, 100);
    // تكتمل الصفحة الثانية الفارغة بعد ظهور عناصر الأولى.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }

    expect(_listedCards(tester), 100, reason: 'الصفحة الثانية الفارغة لا تضيف مناسبات محذوفة');
    expect(find.text('150 مناسبة'), findsOneWidget,
        reason: 'العدّاد من pagination.total لا من طول القائمة الناقصة');

    // السطر بعد مئة كرت، فيُبنى حين يصل إليه تمرير قائمة اليوم مثلما يراه المستخدم.
    final dayList = find.descendant(of: find.byType(RefreshIndicator), matching: find.byType(ListView));
    await tester.drag(dayList, const Offset(0, -10000));
    await tester.pump();
    expect(find.text('تُعرض أول 100 من 150 مناسبة'), findsOneWidget,
        reason: 'القائمة الناقصة معلنة للمستخدم ولا تبدو قائمة مكتملة');
    expect(
      calls.where((call) => call.url.path.endsWith('/api/events') && call.url.queryParameters['page'] == '2'),
      isNotEmpty,
      reason: 'الصفحة الثانية طُلبت فعلاً قبل اكتشاف أنها فارغة',
    );
  });

  testWidgets('فشل محافظة جديدة يمسح نقاط السابقة وتصير شارة اليوم «—» لا عدّها (#175)', (tester) async {
    final client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        final region = request.url.queryParameters['region_id'];
        if (region == '7') {
          return _json({
            'success': true,
            'days': [{'date': _dayKey(_singleDay), 'count': 1}],
          });
        }
        if (region == '8') {
          return http.Response('{"success":false,"message":"تعذّر الجلب"}', 500,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return _json({'success': true, 'days': <Map<String, dynamic>>[]});
      }
      if (path.endsWith('/api/events')) {
        // فشل اليوم مع فشل التقويم عمداً: الشارة «—» حالة اليوم الفاشل نفسها،
        // لا سقوطٌ إلى `_dayTotal` يُخفي بقاء `_dayCounts` السابقة.
        if (request.headers['X-Region'] != '7') {
          return http.Response('{"success":false,"message":"تعذّر الجلب"}', 500,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        final events = [_event(701, 'مناسبة المحافظة السابعة')];
        return _json({
          'success': true,
          'events': events,
          'pagination': {'page': 1, 'limit': 100, 'total': events.length, 'totalPages': 1},
          'announcements': <Map<String, dynamic>>[],
        });
      }
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    await _pumpUntil(tester, find.byKey(const ValueKey<String>('agenda_region_7')));
    await tester.tap(find.byKey(const ValueKey<String>('agenda_region_7')));
    await _pumpUntil(tester, find.text('مناسبة المحافظة السابعة'));
    expect(find.text('1 مناسبة'), findsOneWidget, reason: 'شارة المحافظة ٧ مؤكدة قبل التبديل');

    await tester.tap(find.byKey(const ValueKey<String>('agenda_region_8')));
    await _pumpUntil(tester, find.textContaining('تعذّر تحميل مناسبات هذا اليوم'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }

    expect(find.byKey(ValueKey<String>('agenda_dot_${_dayKey(_singleDay)}')), findsNothing,
        reason: 'فشل ٨ لا يترك نقطة ٧ تحت فلتر المحافظة الجديدة');
    expect(find.text('—'), findsOneWidget,
        reason: 'الشارة «—» عند فشل اليوم، لا عدّ المحافظة السابقة');
    expect(find.text('1 مناسبة'), findsNothing,
        reason: 'ولا يبقى عدّ المحافظة ٧');
    expect(find.text('0 مناسبة'), findsNothing,
        reason: 'ولا يُدَّعى صفرُ مناسبات ليومٍ فشل جلبُه');
    expect(find.text('مناسبة المحافظة السابعة'), findsNothing,
        reason: 'ولا تبقى مناسبات المحافظة السابقة تحت اليوم الجديد');
    expect(find.text('لا توجد مناسبات مسجلة في هذا اليوم'), findsNothing,
        reason: 'فشل الجلب ليس يوماً فارغاً');
    expect(find.text('تعذّر تحديث عدّ الشهر'), findsOneWidget,
        reason: 'وفشل التقويم يُعلَن سطراً صغيراً تحت الشبكة');
  });

  testWidgets('قائمة يومٍ لـ«كل المحافظات» تصل بعد قائمة المحافظة المختارة فلا تستبدلها (#175)', (tester) async {
    final calls = <_Call>[];
    final pending = <Completer<void>>[];
    final client = MockClient((request) async {
      calls.add(_Call(request.url, request.headers));
      final path = request.url.path;

      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        // عدّ الشهر فارغ عمداً: العدّاد هنا من عدّ الخادم ليوم القائمة وحده
        // (`pagination.total`)، فيقع الفرق بين الجوابين على العدّاد لا على التقويم.
        return _json({'success': true, 'days': <Map<String, dynamic>>[]});
      }
      if (path.endsWith('/api/events')) {
        if (request.headers['X-Region'] == '7') {
          return _json({
            'success': true,
            'events': [_event(803, 'مناسبة المحافظة السابعة')],
            'pagination': {'page': 1, 'limit': 100, 'total': 1, 'totalPages': 1},
            'announcements': <Map<String, dynamic>>[],
          });
        }
        // «كل المحافظات» (بلا ترويسة `X-Region`): الجواب يُحلّ متى شاء الاختبار.
        final gate = Completer<void>();
        pending.add(gate);
        await gate.future;
        return _json({
          'success': true,
          'events': [
            _event(801, 'مناسبة كل المحافظات'),
            _event(802, 'مناسبة كل المحافظات الأخرى'),
          ],
          'pagination': {'page': 1, 'limit': 100, 'total': 2, 'totalPages': 1},
          'announcements': <Map<String, dynamic>>[],
        });
      }
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    // طلب اليوم الأول (كل المحافظات) وصل ومعطَّل، وحبات المحافظة ظهرت.
    await _pumpUntilRequest(
      tester,
      calls,
      (call) => call.url.path.endsWith('/api/events') && !call.headers.containsKey('X-Region'),
    );
    expect(pending.length, 1, reason: 'جواب «كل المحافظات» معلَّق');
    await _pumpUntil(tester, find.byKey(const ValueKey<String>('agenda_region_7')));

    // ثم المحافظة ٧: اليوم نفسه يُعاد طلبه بترويسة X-Region ويصل فوراً.
    await tester.tap(find.byKey(const ValueKey<String>('agenda_region_7')));
    await _pumpUntil(tester, find.text('مناسبة المحافظة السابعة'));
    expect(_listedCards(tester), 1, reason: 'قائمة المحافظة وحدها بعد اختيارها');
    expect(find.text('1 مناسبة'), findsOneWidget, reason: 'وعدّاد اليوم من عدّ الخادم');

    // جواب «كل المحافظات» يصل أخيراً: اليوم لم يتغيّر، فالمحافظة وحدها هي
    // الفرق بين الطلبين — وهي ما يجب أن يسقط الجواب المتأخّر لأجله.
    pending.single.complete();
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.text('مناسبة المحافظة السابعة'), findsOneWidget,
        reason: 'قائمة المحافظة تبقى بعد وصول جواب «كل المحافظات» المتأخّر');
    expect(find.text('مناسبة كل المحافظات'), findsNothing,
        reason: 'الجواب المتأخّر ليومٍ لم يتغيّر لا يُقبل — حارس هوية الطلب يشمل المحافظة');
    expect(find.text('مناسبة كل المحافظات الأخرى'), findsNothing);
    expect(_listedCards(tester), 1, reason: 'ولا يُضاف إلى القائمة شيء');
    expect(find.text('1 مناسبة'), findsOneWidget, reason: 'ولا يتغيّر العدّاد');
  });

  testWidgets('فشل أول جلب ليوم يُعلن خطأه وشارة «—» لا «0 مناسبة» ولا «لا توجد» (#175)', (tester) async {
    final client = MockClient((request) async {
      final path = request.url.path;
      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        return _json({
          'success': true,
          'days': [{'date': _dayKey(_singleDay), 'count': 1}],
        });
      }
      if (path.endsWith('/api/events')) {
        return http.Response('{"success":false,"message":"تعذّر الجلب"}', 500,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    await _pumpUntil(tester, find.textContaining('تعذّر تحميل مناسبات هذا اليوم'));

    expect(find.textContaining('تعذّر تحميل مناسبات هذا اليوم'), findsOneWidget,
        reason: 'فشل جلب اليوم يُعلن خطأ اليوم');
    expect(find.text('—'), findsOneWidget,
        reason: 'الشارة لا تنسب ليومٍ فشل جلبُه عدّاً ولو جاء من تقويم الشهر');
    expect(find.text('1 مناسبة'), findsNothing,
        reason: 'ولا يُستعار عدّ التقويم لشارة اليوم');
    expect(find.text('0 مناسبة'), findsNothing, reason: 'ولا يُدَّعى صفرُ مناسبات');
    expect(find.text('لا توجد مناسبات مسجلة في هذا اليوم'), findsNothing,
        reason: '«لا توجد» ليوم فارغ، لا ليومٍ فشل جلبُه');
  });

  testWidgets('فشل اليوم لا يُمسح بسهم الشهر فلا يُعرض يوم سابق كأنه اليوم المختار (#175)', (tester) async {
    final calls = <_Call>[];
    final client = MockClient((request) async {
      calls.add(_Call(request.url, request.headers));
      final path = request.url.path;
      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        return _json({'success': true, 'days': <Map<String, dynamic>>[]});
      }
      if (path.endsWith('/api/events')) {
        if (request.url.queryParameters['date_from'] == _dayKey(_manyDay)) {
          return http.Response('{"success":false,"message":"تعذّر الجلب"}', 500,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        final events = [_event(1, 'مناسبة اليوم')];
        return _json({
          'success': true,
          'events': events,
          'pagination': {'page': 1, 'limit': 100, 'total': events.length, 'totalPages': 1},
          'announcements': <Map<String, dynamic>>[],
        });
      }
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    await _pumpUntil(tester, find.text('مناسبة اليوم'));
    expect(_listedCards(tester), 1, reason: 'قائمة اليوم الأول محمَّلة قبل الفشل');

    await tester.tap(find.byKey(ValueKey<String>('agenda_day_${_dayKey(_manyDay)}')));
    await _pumpUntil(tester, find.textContaining('تعذّر تحميل مناسبات هذا اليوم'));
    expect(find.text('مناسبة اليوم'), findsNothing,
        reason: 'يوم فشل جلبُه لا يبقي عنصر يومٍ سابق تحت عنوانه');
    expect(find.text('—'), findsOneWidget, reason: 'وشارته «—»');

    final dayRequestsBefore = calls.where((call) => call.url.path.endsWith('/api/events')).length;
    final previousMonth = DateTime(_now.year, _now.month - 1, 1);
    final previousMonthKey = '${previousMonth.year}-${previousMonth.month.toString().padLeft(2, '0')}';
    await tester.tap(find.byTooltip('الشهر السابق'));
    await _pumpUntilRequest(
      tester,
      calls,
      (call) => call.url.path.endsWith('/api/events/calendar') && call.url.queryParameters['month'] == previousMonthKey,
    );
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }

    expect(find.textContaining('تعذّر تحميل مناسبات هذا اليوم'), findsOneWidget,
        reason: 'سهم الشهر لا يمسح خطأ اليوم: اليوم لم يُعَد جلبه، فالخطأ ما زال قائماً');
    expect(find.text('—'), findsOneWidget, reason: 'والشارة تبقى «—» لا عدداً من يومٍ آخر');
    expect(find.text('0 مناسبة'), findsNothing,
        reason: 'ولا تُعلَن قائمة فارغة ليومٍ لم يُحمَّل');
    expect(find.text('لا توجد مناسبات مسجلة في هذا اليوم'), findsNothing,
        reason: 'ولا «لا توجد» — الجلب فشل لا أن اليوم فارغ');
    expect(find.text('مناسبة اليوم'), findsNothing,
        reason: 'ولا يظهر يوم سابق كأنه اليوم المختار');
    expect(_listedCards(tester), 0, reason: 'ولا كرت من يوم سابق تحت العنوان الجديد');
    expect(
      calls.where((call) => call.url.path.endsWith('/api/events')).length,
      dayRequestsBefore,
      reason: 'سهم الشهر لا يعيد جلب اليوم — لذا يبقى خطؤه هو ما يُعرض',
    );
  });

  testWidgets('فشل تقويم الشهر بعد نجاح اليوم يبقي القائمة ولا يستبدلها بخطأ المناسبات (#175)', (tester) async {
    final calls = <_Call>[];
    var calendarRequests = 0;
    final client = MockClient((request) async {
      calls.add(_Call(request.url, request.headers));
      final path = request.url.path;
      if (path.endsWith('/api/towns')) return _json(_townsBody());
      if (path.endsWith('/api/events/calendar')) {
        calendarRequests += 1;
        if (calendarRequests == 1) {
          return _json({'success': true, 'days': <Map<String, dynamic>>[]});
        }
        return http.Response('{"success":false,"message":"تعذّر الجلب"}', 500,
            headers: {'content-type': 'application/json; charset=utf-8'});
      }
      if (path.endsWith('/api/events')) {
        final events = [_event(1, 'مناسبة اليوم')];
        return _json({
          'success': true,
          'events': events,
          'pagination': {'page': 1, 'limit': 100, 'total': events.length, 'totalPages': 1},
          'announcements': <Map<String, dynamic>>[],
        });
      }
      return _json({'success': true});
    });

    await _pumpAgendaScreen(tester, NegevApi(ApiClient(client: client)));
    await _pumpUntil(tester, find.text('مناسبة اليوم'));
    expect(find.text('1 مناسبة'), findsOneWidget, reason: 'قائمة اليوم وشارتها محمَّلتان');

    await tester.tap(find.byTooltip('الشهر التالي'));
    await _pumpUntil(tester, find.text('تعذّر تحديث عدّ الشهر'));

    expect(find.text('مناسبة اليوم'), findsOneWidget,
        reason: 'فشل التقويم لا يحجب اليوم ولا يستبدل قائمته');
    expect(find.textContaining('تعذّر تحميل مناسبات هذا اليوم'), findsNothing,
        reason: 'ولا يُوصَف اليوم المحمَّل جيداً بأنه تعذّر تحميله');
    expect(find.text('1 مناسبة'), findsOneWidget,
        reason: 'وعدّ اليوم من العدّ المحمَّل، لا من تقويم فشل');
    expect(_listedCards(tester), 1, reason: 'وقائمة اليوم تبقى كما كانت');
  });
}
