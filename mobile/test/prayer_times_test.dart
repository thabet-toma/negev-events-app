import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/prayer_times.dart';
import 'package:negev_events/screens/prayer_times_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «مواقيت الصلاة» (M3-C) — التطبيق يعرض ما يحسبه الخادم فقط.
///
/// التاريخ ثابت في الردّ المزيّف كي لا يعتمد الاختبار على يوم التشغيل، والأسماء
/// والأوقات كلها من الردّ نفسه — لا ساعة في `prayer_times.dart` تحسب وقتاً.

const List<String> _townsFixture = ['رهط', 'تل السبع', 'حورة'];

/// ردّ `/api/prayer-times` كما في العقد، مع بلدة قابلة للتبديل (النقب للمحافظة،
/// ورهط للبلدة المختارة) كي يُختبر تغيّر العنوان بعد الجلب الثاني.
Map<String, dynamic> _prayerPayload({
  String placeName = 'النقب',
  String kind = 'region',
}) => {
  'success': true,
  'place': {'name': placeName, 'kind': kind},
  'date': '2026-11-17',
  'timezone': 'Asia/Jerusalem',
  'method': {'key': 'egyptian', 'name': 'الهيئة المصرية العامة للمساحة'},
  'times': [
    {'key': 'fajr', 'name': 'الفجر', 'time': '04:52'},
    {'key': 'sunrise', 'name': 'الشروق', 'time': '06:15'},
    {'key': 'dhuhr', 'name': 'الظهر', 'time': '11:32'},
    {'key': 'asr', 'name': 'العصر', 'time': '14:30'},
    {'key': 'maghrib', 'name': 'المغرب', 'time': '16:49'},
    {'key': 'isha', 'name': 'العشاء', 'time': '18:07'},
  ],
  'next': {
    'key': 'asr',
    'name': 'العصر',
    'time': '14:30',
    'date': '2026-11-17',
    'minutes_until': 47,
  },
};

http.Response _json(Object body, {int status = 200}) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

/// عميل وهمي لكل الاختبار: كتالوج البلدات من `/api/towns`، والمواقيت من
/// `/api/prayer-times` عبر [onPrayer]، وما عداها ردّ ناجح بلا جسم.
NegevApi _api({
  required Future<http.Response> Function(http.Request request) onPrayer,
  List<http.Request>? recorded,
  Future<http.Response> Function(http.Request request)? onTowns,
  List<http.Request>? townRequests,
}) {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/towns')) {
      townRequests?.add(request);
      if (onTowns != null) return onTowns(request);
      return _json({
        'success': true,
        'towns': _townsFixture,
        'town_coordinates': <String, dynamic>{},
      });
    }
    if (request.url.path.endsWith('/api/prayer-times')) {
      recorded?.add(request);
      return onPrayer(request);
    }
    return _json({'success': true});
  });
  return NegevApi(ApiClient(client: client));
}

/// يبني الشاشة داخل `AppServices` حقيقي (مخزن البلدات والمصادقة كما في
/// التطبيق) على نافذة عالية كي تُبنى القائمة كلها.
Future<void> _pumpPrayerScreen(WidgetTester tester, NegevApi api) async {
  tester.view.physicalSize = const Size(900, 2000);
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
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: PrayerTimesScreen(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// يفتح منتقي البلدة ويختار [town] كما يفعل المستخدم.
Future<void> _chooseTown(WidgetTester tester, String town) async {
  await tester.tap(find.byKey(const Key('prayer_town_picker')));
  await tester.pumpAndSettle();
  await tester.tap(find.text(town).last);
  await tester.pumpAndSettle();
}

/// مضيف بصفحة واحدة: زرّ يدفع شاشة المواقيت، كي يُختبر فتحها **كل مرة** لا
/// مرة واحدة عند بناء الشاشة.
Future<void> _pumpPrayerHost(WidgetTester tester, NegevApi api) async {
  tester.view.physicalSize = const Size(900, 2000);
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
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  key: const Key('open_prayer_screen'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const PrayerTimesScreen(),
                    ),
                  ),
                  child: const Text('فتح المواقيت'),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('نموذج مواقيت الصلاة — قراءة دفاعية', () {
    test('يقرأ الردّ الكامل: المكان والتاريخ والطريقة والأوقات الستة والقادمة', () {
      final snapshot = PrayerTimesSnapshot.fromJson(_prayerPayload());

      expect(snapshot.place.name, 'النقب');
      expect(snapshot.place.kind, 'region');
      expect(snapshot.date, '2026-11-17');
      expect(snapshot.timezone, 'Asia/Jerusalem');
      expect(snapshot.method.key, 'egyptian');
      expect(snapshot.method.name, 'الهيئة المصرية العامة للمساحة');
      expect(snapshot.times.map((entry) => entry.key), [
        'fajr',
        'sunrise',
        'dhuhr',
        'asr',
        'maghrib',
        'isha',
      ]);
      expect(snapshot.times.first.name, 'الفجر');
      expect(snapshot.times.last.time, '18:07');
      expect(snapshot.next, isNotNull);
      expect(snapshot.next!.key, 'asr');
      expect(snapshot.next!.name, 'العصر');
      expect(snapshot.next!.date, '2026-11-17');
      expect(snapshot.next!.minutesUntil, 47);
      expect(snapshot.isUsable, true);
    });

    test('غياب next لا يكسر الشاشة: الأوقات تبقى صالحة والقادمة غائبة', () {
      final payload = _prayerPayload()..remove('next');
      final snapshot = PrayerTimesSnapshot.fromJson(payload);

      expect(snapshot.next, isNull);
      expect(snapshot.times, hasLength(6));
      expect(snapshot.isUsable, true);
    });

    test('ردّ فاسد أو ناقص يعود افتراضياً بلا استثناء', () {
      final snapshot = PrayerTimesSnapshot.fromJson(const <String, dynamic>{
        'success': true,
        'place': 'not-a-map',
        'method': 7,
        'times': 'not-a-list',
        'next': 5,
      });

      expect(snapshot.place.name, '');
      expect(snapshot.method.name, '');
      expect(snapshot.times, isEmpty);
      expect(snapshot.next, isNull);
      expect(snapshot.isUsable, false);

      final mixed = PrayerTimesSnapshot.fromJson({
        'success': true,
        'place': {'name': 'رهط'},
        'times': [
          null,
          5,
          {'key': 'fajr', 'name': 'الفجر', 'time': '04:52'},
        ],
      });
      expect(mixed.times, hasLength(1));
      expect(mixed.times.single.name, 'الفجر');
      expect(
        mixed.isUsable,
        false,
        reason: 'صفّ واحد ليس يوماً كاملاً — لا تُعرض بطاقة جزئية',
      );
    });

    test('ستة مفاتيح فريدة وأسماء وأوقات صالحة — وإلا فالردّ غير صالح', () {
      expect(PrayerTimesSnapshot.fromJson(_prayerPayload()).isUsable, true);

      Map<String, dynamic> broken({
        List<Map<String, dynamic>>? times,
        Object? date,
        Object? timezone,
        Object? method,
        Object? place,
      }) {
        final payload = _prayerPayload();
        if (times != null) payload['times'] = times;
        if (date != null) payload['date'] = date;
        if (timezone != null) payload['timezone'] = timezone;
        if (method != null) payload['method'] = method;
        if (place != null) payload['place'] = place;
        return payload;
      }

      final validTimes = (_prayerPayload()['times'] as List)
          .cast<Map<String, dynamic>>();

      expect(
        PrayerTimesSnapshot.fromJson(
          broken(times: validTimes.sublist(0, 5)),
        ).isUsable,
        false,
        reason: 'صفّ ناقص',
      );
      expect(
        PrayerTimesSnapshot.fromJson(
          broken(
            times: validTimes
                .map(
                  (row) => row['key'] == 'isha'
                      ? {...row, 'key': 'maghrib'}
                      : row,
                )
                .toList(),
          ),
        ).isUsable,
        false,
        reason: 'مفتاح مكرر',
      );
      expect(
        PrayerTimesSnapshot.fromJson(
          broken(
            times: validTimes
                .map(
                  (row) => row['key'] == 'asr'
                      ? {...row, 'time': '14:3'}
                      : row,
                )
                .toList(),
          ),
        ).isUsable,
        false,
        reason: 'وقت ليس HH:mm',
      );
      expect(
        PrayerTimesSnapshot.fromJson(
          broken(
            times: validTimes
                .map(
                  (row) => row['key'] == 'fajr' ? {...row, 'name': ' '} : row,
                )
                .toList(),
          ),
        ).isUsable,
        false,
        reason: 'اسم صلاة فارغ',
      );
      expect(
        PrayerTimesSnapshot.fromJson(broken(date: '2026-02-30')).isUsable,
        false,
        reason: 'تاريخ غير موجود',
      );
      expect(
        PrayerTimesSnapshot.fromJson(broken(timezone: '')).isUsable,
        false,
        reason: 'بلا منطقة زمنية',
      );
      expect(
        PrayerTimesSnapshot.fromJson(
          broken(method: {'key': 'egyptian', 'name': ''}),
        ).isUsable,
        false,
        reason: 'بلا اسم طريقة — حاشية فارغة',
      );
      expect(
        PrayerTimesSnapshot.fromJson(
          broken(place: {'name': 'رهط', 'kind': 'village'}),
        ).isUsable,
        false,
        reason: 'نوع مكان غير معروف',
      );
    });
  });

  group('المهلة النسبية من minutes_until', () {
    test('دقائق أقل من ساعة وساعات كاملة وأجزاؤها', () {
      expect(prayerRelativeText(0), 'أقل من دقيقة');
      expect(prayerRelativeText(null), 'أقل من دقيقة');
      expect(prayerRelativeText(1), 'دقيقة');
      expect(prayerRelativeText(2), 'دقيقتان');
      expect(prayerRelativeText(3), '٣ دقائق');
      expect(prayerRelativeText(11), '١١ دقيقة');
      expect(prayerRelativeText(47), '٤٧ دقيقة');
      expect(prayerRelativeText(60), 'ساعة');
      expect(prayerRelativeText(61), 'ساعة ودقيقة');
      expect(prayerRelativeText(72), 'ساعة و١٢ دقيقة');
      expect(prayerRelativeText(120), 'ساعتان');
      expect(prayerRelativeText(180), '٣ ساعات');
      expect(prayerRelativeText(720), '١٢ ساعة');
    });
  });

  group('شاشة مواقيت الصلاة', () {
    testWidgets('تعرض ستة صفوف بترتيب الخادم وصفّ القادمة وحده بالذهبي', (
      tester,
    ) async {
      final requests = <http.Request>[];
      final api = _api(
        recorded: requests,
        onPrayer: (request) async => _json(_prayerPayload()),
      );
      await _pumpPrayerScreen(tester, api);

      expect(find.text('مواقيت الصلاة — النقب'), findsOneWidget);
      expect(find.text('اليوم ١٧ نوفمبر ٢٠٢٦'), findsOneWidget);
      expect(
        find.text('الصلاة القادمة: العصر بعد ٤٧ دقيقة'),
        findsOneWidget,
      );
      expect(
        find.text(
          'حسب طريقة الهيئة المصرية العامة للمساحة — '
          'قد تختلف دقيقة أو دقيقتين عن تقويم مسجدك',
        ),
        findsOneWidget,
      );

      const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
      for (final key in keys) {
        expect(find.byKey(Key('prayer_row_$key')), findsOneWidget);
      }
      for (var index = 1; index < keys.length; index += 1) {
        expect(
          tester.getTopLeft(find.byKey(Key('prayer_row_${keys[index]}'))).dy,
          greaterThan(
            tester
                .getTopLeft(find.byKey(Key('prayer_row_${keys[index - 1]}')))
                .dy,
          ),
          reason: 'الصفوف بترتيب الخادم',
        );
      }

      final nextRow = tester.widget<Container>(
        find.byKey(const Key('prayer_row_asr')),
      );
      expect(
        (nextRow.decoration! as BoxDecoration).color,
        NegevPalette.light.goldWash,
        reason: 'صفّ الصلاة القادمة وحده بالذهبي',
      );
      final otherRow = tester.widget<Container>(
        find.byKey(const Key('prayer_row_fajr')),
      );
      expect(
        (otherRow.decoration! as BoxDecoration).color,
        NegevPalette.light.surfaceSunk,
      );

      expect(requests, hasLength(1));
      expect(requests.single.url.queryParameters.containsKey('town'), false,
          reason: 'الافتراضي «حسب محافظتي»');
      expect(requests.single.headers['Authorization'], isNull,
          reason: 'المسار عام — لا رمز دخول');
    });

    testWidgets('تبديل البلدة يحفظ negev_prayer_town ويعيد الجلب', (
      tester,
    ) async {
      final requests = <http.Request>[];
      final api = _api(
        recorded: requests,
        onPrayer: (request) async {
          final town = request.url.queryParameters['town'];
          return _json(
            _prayerPayload(
              placeName: town ?? 'النقب',
              kind: town == null ? 'region' : 'town',
            ),
          );
        },
      );
      await _pumpPrayerScreen(tester, api);

      expect(requests, hasLength(1));
      expect(requests.single.url.queryParameters['town'], isNull);
      expect(find.text('مواقيت الصلاة — النقب'), findsOneWidget);

      await _chooseTown(tester, 'رهط');

      expect(requests, hasLength(2));
      expect(requests[1].url.queryParameters['town'], 'رهط');
      expect(
        (await SharedPreferences.getInstance()).getString(
          prayerTownStorageKey,
        ),
        'رهط',
        reason: 'الاختيار محفوظ على الجهاز',
      );
      expect(find.text('مواقيت الصلاة — رهط'), findsOneWidget);
    });

    testWidgets('البلدة المحفوظة تُقرأ عند الفتح وتُرسَل في الطلب الأول', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({prayerTownStorageKey: 'رهط'});
      final requests = <http.Request>[];
      final api = _api(
        recorded: requests,
        onPrayer: (request) async => _json(
          _prayerPayload(
            placeName: request.url.queryParameters['town'] ?? 'النقب',
            kind: request.url.queryParameters['town'] == null
                ? 'region'
                : 'town',
          ),
        ),
      );
      await _pumpPrayerScreen(tester, api);

      expect(requests.single.url.queryParameters['town'], 'رهط');
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(const Key('prayer_town_picker')),
            )
            .value,
        'رهط',
      );
      expect(find.text('مواقيت الصلاة — رهط'), findsOneWidget);
    });

    testWidgets('تعذّر التحميل: رسالة عربية وزرّ محاولة بلا أوقات قديمة', (
      tester,
    ) async {
      var attempts = 0;
      final api = _api(
        onPrayer: (request) async {
          attempts += 1;
          return attempts == 1
              ? _json({'success': false}, status: 503)
              : _json(_prayerPayload());
        },
      );
      await _pumpPrayerScreen(tester, api);

      expect(find.text(prayerTimesErrorMessage), findsOneWidget);
      expect(find.byKey(const Key('prayer_retry')), findsOneWidget);
      expect(find.byKey(const Key('prayer_row_asr')), findsNothing);
      expect(
        find.byKey(const Key('prayer_next_line')),
        findsNothing,
        reason: 'لا سطر صلاة قادمة بلا مواقيت',
      );

      await tester.tap(find.byKey(const Key('prayer_retry')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('prayer_row_asr')), findsOneWidget);
      expect(find.text(prayerTimesErrorMessage), findsNothing);
      expect(attempts, 2);
    });

    testWidgets('ردّ 400 يعرض رسالة الخادم العربية كما هي', (tester) async {
      final api = _api(
        onPrayer: (request) async => _json(
          {'success': false, 'message': 'لا توجد بلدة بهذا الاسم'},
          status: 400,
        ),
      );
      await _pumpPrayerScreen(tester, api);

      expect(find.text('لا توجد بلدة بهذا الاسم'), findsOneWidget);
      expect(find.byKey(const Key('prayer_retry')), findsOneWidget);
      expect(find.byKey(const Key('prayer_row_asr')), findsNothing);
    });

    testWidgets('ردّ ناقص أو بوقت غير صالح يعود لخطأ — لا بطاقة جزئية', (
      tester,
    ) async {
      var attempts = 0;
      final api = _api(
        onPrayer: (request) async {
          attempts += 1;
          final payload = _prayerPayload();
          if (attempts == 1) {
            final times = (payload['times'] as List)
                .cast<Map<String, dynamic>>()
                .take(5)
                .map(
                  (row) => row['key'] == 'asr'
                      ? {...row, 'time': '14:3'}
                      : row,
                )
                .toList();
            payload['times'] = times;
          }
          return _json(payload);
        },
      );
      await _pumpPrayerScreen(tester, api);

      expect(find.text(prayerTimesErrorMessage), findsOneWidget);
      expect(find.byKey(const Key('prayer_retry')), findsOneWidget);
      expect(find.byKey(const Key('prayer_row_asr')), findsNothing);
      expect(find.byKey(const Key('prayer_next_line')), findsNothing);

      await tester.tap(find.byKey(const Key('prayer_retry')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('prayer_row_asr')), findsOneWidget);
      expect(find.text(prayerTimesErrorMessage), findsNothing);
      expect(attempts, 2);
    });

    testWidgets('تبديل البلدة السريع: ردّ الطلب القديم لا يكتب فوق الأحدث', (
      tester,
    ) async {
      final pending = <Completer<http.Response>>[];
      final requests = <http.Request>[];
      var calls = 0;
      final api = _api(
        recorded: requests,
        onPrayer: (request) {
          calls += 1;
          if (calls == 1) return Future.value(_json(_prayerPayload()));
          final completer = Completer<http.Response>();
          pending.add(completer);
          return completer.future;
        },
      );
      await _pumpPrayerScreen(tester, api);
      expect(find.byKey(const Key('prayer_row_asr')), findsOneWidget);

      final picker = tester.widget<DropdownButton<String>>(
        find.byKey(const Key('prayer_town_picker')),
      );
      picker.onChanged!('رهط');
      await tester.pump();
      picker.onChanged!('حورة');
      await tester.pump();

      expect(pending, hasLength(2));
      expect(requests[1].url.queryParameters['town'], 'رهط');
      expect(requests[2].url.queryParameters['town'], 'حورة');

      pending[1].complete(
        _json(_prayerPayload(placeName: 'حورة', kind: 'town')),
      );
      await tester.pumpAndSettle();
      expect(find.text('مواقيت الصلاة — حورة'), findsOneWidget);

      pending[0].complete(
        _json(_prayerPayload(placeName: 'رهط', kind: 'town')),
      );
      await tester.pumpAndSettle();

      expect(find.text('مواقيت الصلاة — حورة'), findsOneWidget);
      expect(find.text('مواقيت الصلاة — رهط'), findsNothing);
      expect(find.byKey(const Key('prayer_row_asr')), findsOneWidget);
    });

    testWidgets('الأوقات القديمة تُمحى فور الجلب وتُستبدل بخطأ لاحق', (
      tester,
    ) async {
      var calls = 0;
      Completer<http.Response>? second;
      final api = _api(
        onPrayer: (request) {
          calls += 1;
          if (calls == 1) return Future.value(_json(_prayerPayload()));
          second = Completer<http.Response>();
          return second!.future;
        },
      );
      await _pumpPrayerScreen(tester, api);
      expect(find.byKey(const Key('prayer_row_asr')), findsOneWidget);

      final picker = tester.widget<DropdownButton<String>>(
        find.byKey(const Key('prayer_town_picker')),
      );
      picker.onChanged!('رهط');
      await tester.pump();

      expect(find.byKey(const Key('prayer_loading')), findsOneWidget);
      expect(find.byKey(const Key('prayer_row_asr')), findsNothing);
      expect(find.text('مواقيت الصلاة — النقب'), findsNothing);

      second!.complete(_json({'success': false}, status: 503));
      await tester.pumpAndSettle();

      expect(find.text(prayerTimesErrorMessage), findsOneWidget);
      expect(find.byKey(const Key('prayer_retry')), findsOneWidget);
      expect(find.byKey(const Key('prayer_row_asr')), findsNothing);
    });

    testWidgets('next غائب: الستة تُعرض بلا صفّ مميّز وبلا سطر قادمة', (
      tester,
    ) async {
      final api = _api(
        onPrayer: (request) async {
          final payload = _prayerPayload()..remove('next');
          return _json(payload);
        },
      );
      await _pumpPrayerScreen(tester, api);

      const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
      for (final key in keys) {
        expect(find.byKey(Key('prayer_row_$key')), findsOneWidget);
      }
      expect(find.byKey(const Key('prayer_next_line')), findsNothing);
      for (final key in keys) {
        final row = tester.widget<Container>(
          find.byKey(Key('prayer_row_$key')),
        );
        expect(
          (row.decoration! as BoxDecoration).color,
          NegevPalette.light.surfaceSunk,
          reason: 'بلا next لا صفّ مميّزاً',
        );
      }
    });

    testWidgets('فجر الغد: السطر يقول «فجر الغد» ولا يُضاء فجر اليوم', (
      tester,
    ) async {
      final api = _api(
        onPrayer: (request) async {
          final payload = _prayerPayload();
          payload['next'] = {
            'key': 'fajr',
            'name': 'الفجر',
            'time': '04:52',
            'date': '2026-11-18',
            'minutes_until': 300,
          };
          return _json(payload);
        },
      );
      await _pumpPrayerScreen(tester, api);

      expect(
        find.text('الصلاة القادمة: فجر الغد بعد ٥ ساعات'),
        findsOneWidget,
      );
      final fajr = tester.widget<Container>(
        find.byKey(const Key('prayer_row_fajr')),
      );
      expect(
        (fajr.decoration! as BoxDecoration).color,
        NegevPalette.light.surfaceSunk,
        reason: 'فجر الغد ليس صفّ فجر اليوم',
      );
    });

    testWidgets('إعادة فتح الشاشة تعيد الجلب في كل مرة', (tester) async {
      final requests = <http.Request>[];
      final api = _api(
        recorded: requests,
        onPrayer: (request) async => _json(_prayerPayload()),
      );
      await _pumpPrayerHost(tester, api);

      await tester.tap(find.byKey(const Key('open_prayer_screen')));
      await tester.pumpAndSettle();
      expect(requests, hasLength(1));

      Navigator.of(tester.element(find.byType(PrayerTimesScreen))).pop();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('open_prayer_screen')));
      await tester.pumpAndSettle();
      expect(requests, hasLength(2));
      expect(find.byType(PrayerTimesScreen), findsOneWidget);
    });

    testWidgets('فشل الكتالوج يحفظ بلدة جديدة، وإعادة المحاولة تستعيده', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({
        prayerTownStorageKey: 'بلدة جديدة',
      });
      final prayerRequests = <http.Request>[];
      final townRequests = <http.Request>[];
      var townAttempts = 0;
      final api = _api(
        recorded: prayerRequests,
        townRequests: townRequests,
        onTowns: (request) async {
          townAttempts += 1;
          if (townAttempts == 1) {
            return _json({'success': false}, status: 503);
          }
          return _json({
            'success': true,
            'towns': [..._townsFixture, 'بلدة جديدة'],
            'town_coordinates': <String, dynamic>{},
          });
        },
        onPrayer: (request) async {
          final town = request.url.queryParameters['town'];
          if (prayerRequests.length == 1) {
            return _json({'success': false}, status: 503);
          }
          return _json(
            _prayerPayload(
              placeName: town ?? 'النقب',
              kind: town == null ? 'region' : 'town',
            ),
          );
        },
      );
      await _pumpPrayerScreen(tester, api);

      expect(find.text(prayerTimesErrorMessage), findsOneWidget);
      expect(prayerRequests.single.url.queryParameters['town'], 'بلدة جديدة');
      expect(townRequests, hasLength(1));
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(const Key('prayer_town_picker')),
            )
            .value,
        'بلدة جديدة',
        reason: 'فشل الكتالوج لا يمسح البلدة المحفوظة لأنها ليست في البذرة',
      );
      expect(
        (await SharedPreferences.getInstance()).getString(
          prayerTownStorageKey,
        ),
        'بلدة جديدة',
      );

      await tester.tap(find.byKey(const Key('prayer_retry')));
      await tester.pumpAndSettle();

      expect(townAttempts, 2, reason: 'المحاولة تعيد تحميل الكتالوج');
      expect(prayerRequests, hasLength(2));
      expect(prayerRequests[1].url.queryParameters['town'], 'بلدة جديدة');
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(const Key('prayer_town_picker')),
            )
            .value,
        'بلدة جديدة',
      );
      expect(find.text('مواقيت الصلاة — بلدة جديدة'), findsOneWidget);
      expect(
        (await SharedPreferences.getInstance()).getString(
          prayerTownStorageKey,
        ),
        'بلدة جديدة',
      );
    });

    testWidgets('الكتالوج المؤكَّد لا يحتفظ ببلدة لم يعد يذكرها', (tester) async {
      SharedPreferences.setMockInitialValues({
        prayerTownStorageKey: 'بلدة جديدة',
      });
      final requests = <http.Request>[];
      final api = _api(
        recorded: requests,
        onPrayer: (request) async {
          final town = request.url.queryParameters['town'];
          return _json(
            _prayerPayload(
              placeName: town ?? 'النقب',
              kind: town == null ? 'region' : 'town',
            ),
          );
        },
      );
      await _pumpPrayerScreen(tester, api);

      expect(requests.single.url.queryParameters['town'], isNull);
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(const Key('prayer_town_picker')),
            )
            .value,
        '',
      );
      expect(
        (await SharedPreferences.getInstance()).getString(
          prayerTownStorageKey,
        ),
        '',
        reason: 'الكتالوج المؤكَّد وحده يمسح بلدة لم تعد نشطة',
      );
    });
  });
}
