import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/places_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/region_store.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/region_onboarding_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ورقة أول تشغيل (تذكرة #126): الظهور مرة واحدة، والإذن الصريح، وفروع
/// الموافقة والرفض والتعطّل والفشل، والتخطّي.
///
/// لا موقع حقيقي ولا شبكة حقيقية: `LocationLookup` تُحقَن ببديل يسجّل نداءاته
/// (فيُثبَت أن لا إذن قبل الضغط على «استخدم موقعي»)، والمحافظات ومراكز البلدات
/// تصل من `GET /api/towns` وحده — لا نسخة منها في الاختبار بوصفها مصدر حقيقة.
class _FakeLocation implements LocationLookup {
  _FakeLocation({
    this.serviceEnabled = true,
    this.permission = LocationAccess.granted,
    this.askedPermission = LocationAccess.granted,
    this.fix,
  });

  bool serviceEnabled;

  /// ما يعيده `checkPermission` قبل السؤال.
  LocationAccess permission;

  /// ما يعيده `requestPermission` إن سُئل.
  LocationAccess askedPermission;

  /// موضع الجهاز — `null` = فشل/مهلة.
  UserPosition? fix;

  /// سجلّ النداءات بالترتيب — عليه يُتحقَّق من «لا إذن قبل الضغط».
  final calls = <String>[];

  @override
  Future<bool> isServiceEnabled() async {
    calls.add('service');
    return serviceEnabled;
  }

  @override
  Future<LocationAccess> checkPermission() async {
    calls.add('check');
    return permission;
  }

  @override
  Future<LocationAccess> requestPermission() async {
    calls.add('request');
    return askedPermission;
  }

  @override
  Future<UserPosition?> currentPosition() async {
    calls.add('position');
    return fix;
  }
}

/// محافظتان ببلداتٍ لها مراكز، كما يعيدها `GET /api/towns`.
class _TownsServer {
  final requests = <http.Request>[];

  http.Response _json(Map<String, dynamic> body, [int status = 200]) =>
      http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  Future<http.Response> handle(http.Request request) async {
    requests.add(request);
    final path = request.url.path;

    if (path.endsWith('/api/towns')) {
      return _json({
        'success': true,
        'towns': ['الكل', 'رهط', 'حورة', 'الطيبة', 'كفر قاسم'],
        'regions': [
          {
            'id': 1,
            'name': 'النقب',
            'latitude': 31.25,
            'longitude': 34.79,
            'map_zoom': 9,
            'position': 1,
            'towns': ['رهط', 'حورة'],
          },
          {
            'id': 2,
            'name': 'المثلث',
            'latitude': 32.2,
            'longitude': 35.0,
            'map_zoom': 10,
            'position': 2,
            'towns': ['الطيبة', 'كفر قاسم'],
          },
        ],
        'villages': const <Map<String, dynamic>>[],
        'town_coordinates': {
          'رهط': {'lat': 31.392, 'lng': 34.756},
          'حورة': {'lat': 31.293, 'lng': 34.938},
          'الطيبة': {'lat': 32.266, 'lng': 35.008},
          'كفر قاسم': {'lat': 32.114, 'lng': 34.977},
        },
      });
    }
    return _json({'success': true});
  }
}

({NegevApi api, AuthStore auth, PlacesStore places, RegionStore regions})
    _services(_TownsServer server) {
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  final places = PlacesStore(api);
  final regions = RegionStore(api, places, auth);
  return (api: api, auth: auth, places: places, regions: regions);
}

Widget _app(
  ({NegevApi api, AuthStore auth, PlacesStore places, RegionStore regions})
      services,
  Widget home,
) {
  return AppServices(
    api: services.api,
    auth: services.auth,
    realtime: RealtimeService(),
    places: services.places,
    regions: services.regions,
    child: MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(textDirection: TextDirection.rtl, child: home),
    ),
  );
}

/// شاشة تحمل زرّاً واحداً يفتح الورقة — الورقة نفسها هي ما يُختبَر.
class _SheetHost extends StatelessWidget {
  const _SheetHost({required this.location});

  final LocationLookup location;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Builder(
        builder: (context) => Center(
          child: ElevatedButton(
            key: const Key('host_open_sheet'),
            onPressed: () => showRegionOnboardingSheet(context, location: location),
            child: const Text('فتح الورقة'),
          ),
        ),
      ),
    );
  }
}

const _title = 'من أي منطقة أنت؟';
const _deniedNotice = 'لم يُسمح بالموقع — اختر منطقتك يدوياً.';
const _serviceOffNotice = 'خدمة الموقع مطفأة على جهازك — اختر منطقتك يدوياً.';
const _failedNotice = 'تعذّر تحديد موقعك — اختر منطقتك يدوياً.';

/// يفتح الورقة فوق شاشة الاختبار وينتظر ظهورها.
Future<void> _openSheet(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('host_open_sheet')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

/// يمحو أثر رسالة `SnackBar` (مؤقّت ثلاث ثوانٍ) قبل نهاية الاختبار.
Future<void> _drainMessages(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 4));
  await tester.pump(const Duration(milliseconds: 400));
}

Future<bool?> _savedFlag() async =>
    (await SharedPreferences.getInstance()).getBool(regionOnboardedKey);

void main() {
  group('أقرب بلدة ← محافظتها', () {
    PlacesCatalog catalog({
      Map<String, TownCoordinate> coordinates = const {},
    }) =>
        PlacesCatalog(
          towns: const ['رهط', 'حورة', 'الطيبة', 'كفر قاسم'],
          townCoordinates: coordinates,
          regions: const [
            Region(
              id: 1,
              name: 'النقب',
              latitude: 31.25,
              longitude: 34.79,
              mapZoom: 9,
              towns: ['رهط', 'حورة'],
            ),
            Region(
              id: 2,
              name: 'المثلث',
              latitude: 32.2,
              longitude: 35.0,
              mapZoom: 10,
              towns: ['الطيبة', 'كفر قاسم'],
            ),
          ],
          fromServer: true,
        );

    test('موقع الجهاز يُنسب إلى محافظة أقرب بلدة، لا إلى أقرب مركز محافظة',
        () {
      final places = catalog(coordinates: {
        'رهط': const TownCoordinate(lat: 31.392, lng: 34.756),
        'الطيبة': const TownCoordinate(lat: 32.266, lng: 35.008),
      });

      // داخل النقب
      expect(nearestRegionFor(31.40, 34.76, places)!.id, 1);
      // داخل المثلث
      expect(nearestRegionFor(32.27, 35.01, places)!.id, 2);
    });

    test('بلا مراكز بلدات: أقرب مركز محافظة بدل اختراع إحداثيات', () {
      final places = catalog();

      expect(nearestRegionFor(31.30, 34.80, places)!.id, 1);
      expect(nearestRegionFor(32.19, 35.01, places)!.id, 2);
    });

    test('بلا محافظات: لا نتيجة — لا محافظة مخترعة', () {
      expect(
        nearestRegionFor(
          31.4,
          34.7,
          const PlacesCatalog(towns: ['رهط']),
        ),
        isNull,
      );
    });
  });

  group('ورقة أول تشغيل', () {
    testWidgets('الموافقة والموقع داخل منطقة: تُحفظ محافظتها ويُسجَّل الإنجاز',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final server = _TownsServer();
      final services = _services(server);
      await services.places.load();

      final location = _FakeLocation(
        fix: (latitude: 31.395, longitude: 34.760), // رهط
      );

      await tester.pumpWidget(_app(services, _SheetHost(location: location)));
      await _openSheet(tester);

      expect(find.text(_title), findsOneWidget);
      // لا إذن ولا سؤال موقع قبل الضغط على «استخدم موقعي».
      expect(
        location.calls,
        isEmpty,
        reason: 'لا يُسأل الموقع عند فتح الورقة — الضغطة الصريحة شرط',
      );

      // نقرة خارج الورقة لا تُغلقها: مخرجها زرّ لا نقر عابر.
      await tester.tapAt(const Offset(400, 40));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text(_title), findsOneWidget);

      await tester.tap(find.byKey(const Key('region_onboarding_use_location')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(location.calls, contains('position'));
      expect(services.regions.regionId, 1, reason: 'محافظة رهط هي النقب');
      expect(services.regions.headerRegionId, '1');
      expect(await _savedFlag(), isTrue);
      expect(find.text('منطقتك: النقب'), findsOneWidget);
      expect(find.text(_title), findsNothing, reason: 'أُغلقت بعد الاختيار');
      await _drainMessages(tester);
    });

    testWidgets('رفض الإذن: الاختيار اليدوي برسالة قصيرة، بلا اختيار تلقائي',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final services = _services(_TownsServer());
      await services.places.load();

      final location = _FakeLocation(
        permission: LocationAccess.denied,
        askedPermission: LocationAccess.denied,
        fix: (latitude: 31.395, longitude: 34.760),
      );

      await tester.pumpWidget(_app(services, _SheetHost(location: location)));
      await _openSheet(tester);

      await tester.tap(find.byKey(const Key('region_onboarding_use_location')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(location.calls, contains('request'));
      expect(find.text(_deniedNotice), findsOneWidget);
      expect(find.text('اختر محافظتك'), findsOneWidget);
      expect(find.byKey(const Key('region_onboarding_region_1')), findsOneWidget);
      expect(services.regions.regionId, isNull, reason: 'لا اختيار بلا موافقة');
      expect(services.regions.headerRegionId, isNull);
      expect(await _savedFlag(), isNull, reason: 'الورقة ما زالت مفتوحة');

      // ثم الاختيار اليدوي: محافظة، فبلدة تأكيداً — المحفوظ هو المحافظة.
      await tester.tap(find.byKey(const Key('region_onboarding_region_2')));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const Key('region_onboarding_town_0')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(services.regions.regionId, 2);
      expect(services.regions.headerRegionId, '2');
      expect(await _savedFlag(), isTrue);
      expect(find.text('منطقتك: المثلث'), findsOneWidget);
      await _drainMessages(tester);
    });

    testWidgets('رفض الإذن نهائياً: الاختيار اليدوي أيضاً', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final services = _services(_TownsServer());
      await services.places.load();

      final location = _FakeLocation(
        permission: LocationAccess.deniedForever,
        fix: (latitude: 31.395, longitude: 34.760),
      );

      await tester.pumpWidget(_app(services, _SheetHost(location: location)));
      await _openSheet(tester);

      await tester.tap(find.byKey(const Key('region_onboarding_use_location')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(
        find.text('إذن الموقع مرفوض نهائياً — اختر منطقتك يدوياً.'),
        findsOneWidget,
      );
      expect(find.text('اختر محافظتك'), findsOneWidget);
      expect(services.regions.regionId, isNull);
    });

    testWidgets('خدمة الموقع معطّلة: الاختيار اليدوي برسالة قصيرة', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final services = _services(_TownsServer());
      await services.places.load();

      final location = _FakeLocation(
        serviceEnabled: false,
        fix: (latitude: 31.395, longitude: 34.760),
      );

      await tester.pumpWidget(_app(services, _SheetHost(location: location)));
      await _openSheet(tester);

      await tester.tap(find.byKey(const Key('region_onboarding_use_location')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text(_serviceOffNotice), findsOneWidget);
      expect(find.text('اختر محافظتك'), findsOneWidget);
      expect(location.calls, isNot(contains('check')), reason: 'لا سؤال إذن بلا خدمة');
      expect(services.regions.regionId, isNull);
    });

    testWidgets('فشل التحديد/المهلة: الاختيار اليدوي، لا شاشة خطأ', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final services = _services(_TownsServer());
      await services.places.load();

      // موافقة على الإذن ثم لا موضع — مهلة أو مزوّد ساقط.
      final location = _FakeLocation(fix: null);

      await tester.pumpWidget(_app(services, _SheetHost(location: location)));
      await _openSheet(tester);

      await tester.tap(find.byKey(const Key('region_onboarding_use_location')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text(_failedNotice), findsOneWidget);
      expect(find.text('اختر محافظتك'), findsOneWidget);
      expect(
        find.text(_title),
        findsNothing,
        reason: 'انتقلت الورقة نفسها إلى الاختيار اليدوي — لم تُغلق ولم تُفتح ثانية',
      );
      expect(services.regions.regionId, isNull);
    });

    testWidgets('التخطّي: لا تغيير في المحافظة، والمفتاح يُكتب، ولا تظهر ثانيةً',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final server = _TownsServer();
      final services = _services(server);
      await services.places.load();

      final location = _FakeLocation(
        fix: (latitude: 31.395, longitude: 34.760),
      );

      await tester.pumpWidget(_app(services, _SheetHost(location: location)));
      await _openSheet(tester);
      expect(find.text(_title), findsOneWidget);

      await tester.tap(find.byKey(const Key('region_onboarding_skip')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text(_title), findsNothing);
      expect(services.regions.regionId, isNull, reason: 'التخطّي يبقي الافتراضية');
      expect(services.regions.headerRegionId, isNull);
      expect(await _savedFlag(), isTrue);
      expect(location.calls, isEmpty, reason: 'التخطّي لا يطلب موقعاً');
    });

    testWidgets('الإقلاع: تُعرض مرة واحدة، والتخطّي يمنع عودتها في تشغيلٍ تالٍ',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final server = _TownsServer();
      final services = _services(server);
      await services.places.load();

      Future<void> boot() async {
        await tester.pumpWidget(
          _app(services, const HomeShell()),
        );
        // بلا `pumpAndSettle`: تبويبات `IndexedStack` فيها مؤشّر تحميل لا ينتهي.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
      }

      await boot();
      expect(find.text(_title), findsOneWidget, reason: 'أول تشغيل يسأل');
      expect(find.byType(NavigationBar), findsOneWidget, reason: 'الشريط تحتها');

      await tester.tap(find.byKey(const Key('region_onboarding_skip')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text(_title), findsNothing);
      expect(await _savedFlag(), isTrue);

      // تشغيل تالٍ: مفتاح الإنجاز يمنع الورقة، والهيكل كما هو.
      await tester.pumpWidget(const SizedBox());
      await boot();
      expect(find.text(_title), findsNothing);
      expect(find.byType(NavigationBar), findsOneWidget);
    });

    testWidgets('بعد الإنجاز: «حسابي» وحدها تعيد الورقة، والاختيار اليدوي يُحفظ',
        (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(_TownsServer());
      await services.auth.load();
      await services.places.load();

      await tester.pumpWidget(_app(services, const AccountScreen()));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // ظهرت سابقاً فسُجّل الإنجاز: لا تُفتح من تلقاء نفسها.
      expect(find.text(_title), findsNothing);

      await tester.ensureVisible(find.byKey(const Key('account_region_reopen')));
      await tester.tap(find.byKey(const Key('account_region_reopen')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text(_title), findsOneWidget, reason: 'نفس الورقة من «حسابي»');

      await tester.tap(find.byKey(const Key('region_onboarding_manual')));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const Key('region_onboarding_region_1')));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const Key('region_onboarding_save')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(services.regions.regionId, 1);
      expect(find.text('منطقتك: النقب'), findsOneWidget);
      await _drainMessages(tester);
    });
  });
}
