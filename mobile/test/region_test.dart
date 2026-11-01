import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/screens/add_event_screen.dart';
import 'package:negev_events/screens/edit_event_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/places_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_store.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// محافظة الاكتشاف (تذكرة #125): الترويسة، والمخزن، ومنتقي «حسابي».
///
/// لا شبكة حقيقية: `MockClient` يوجّه حسب المسار كما في `feed_test.dart`،
/// والمحافظات تصل من `/api/towns` وحده — لا نسخة منها في الاختبار نفسه
/// بوصفها مصدر حقيقة، بل كما يرسلها الخادم.
class _RegionServer {
  _RegionServer({this.failRegionPatch = false, this.accountRegionId});

  /// يردّ 500 على `PATCH /api/auth/me` — فشلُ حفظ المحافظة على الحساب وحده.
  final bool failRegionPatch;

  /// `region_id` في حساب المستخدم — null لزائر أو لحساب لم يختر بعد.
  final int? accountRegionId;

  final requests = <http.Request>[];

  late Map<String, dynamic> user = <String, dynamic>{
    'id': 7,
    'phone_number': '0500000000',
    'full_name': 'سالم أبو محمد',
    'role': 'user',
    'region_id': accountRegionId,
  };

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
        'towns': ['الكل', 'رهط', 'حورة'],
        'regions': [
          {
            'id': 1,
            'name': 'النقب',
            'latitude': 31.25,
            'longitude': 34.79,
            'map_zoom': 10,
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
            'towns': const <String>[],
          },
        ],
        'villages': const <Map<String, dynamic>>[],
        'town_coordinates': <String, dynamic>{},
      });
    }
    if (path.endsWith('/api/auth/login')) {
      return _json({
        'success': true,
        'token': 'test-token',
        'user': user,
      });
    }
    if (path.endsWith('/api/auth/me')) {
      if (request.method == 'PATCH') {
        if (failRegionPatch) {
          return _json({'success': false, 'message': 'تعذّر الحفظ الآن'}, 500);
        }
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        user = {...user, 'region_id': body['region_id']};
        return _json({
          'success': true,
          'user': user,
          'message': 'تم تحديث بيانات حسابك',
        });
      }
      return _json({'success': true, 'user': user});
    }
    if (path.endsWith('/api/events')) {
      return _json({
        'success': true,
        'events': const <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
        'announcements': const <Map<String, dynamic>>[],
      });
    }
    return _json({'success': true});
  }
}

/// ثلاثية المخزن كما تُبنى في `main.dart` — بلا شاشات.
({NegevApi api, AuthStore auth, PlacesStore places, RegionStore regions})
    _store(_RegionServer server) {
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  final places = PlacesStore(api);
  final regions = RegionStore(api, places, auth);
  // نفس ربط `main.dart`: تبنّي محافظة الحساب عند تغيّر الجلسة.
  auth.addListener(regions.adoptAccountRegion);
  return (api: api, auth: auth, places: places, regions: regions);
}

/// جلسة محفوظة يخدمها الخادم الوهمي — `load()` يمرّ من `/api/auth/me`
/// فيصل المستخدم إلى الشاشة كما يصل في التشغيل الحقيقي.
Future<void> _signedIn(_RegionServer server, AuthStore auth) async {
  SharedPreferences.setMockInitialValues({
    'negev_token': 'test-token',
    'negev_user': jsonEncode(server.user),
  });
  await auth.load();
}

/// خادم نموذج النشر: بند جامع فيه قرية واحدة ومحافظتان، ونوع عرس بحقوله
/// الدنيا. كل جسم `POST /api/events` يُلتقط لقراءة حقول multipart كما وصلت.
class _FormServer {
  _FormServer({this.villagesHaveRegion = false});

  /// هل تحمل القرى `region_id`؟ `false` = ردّ بلا الحقل، فيبقى منتقي القرية
  /// بلا تصفية؛ و`true` يمثّل الردّ الحالي (`villages.listActive` يرسله مع كل
  /// قرية) الذي تُصفّى به القرى بمحافظة النموذج.
  final bool villagesHaveRegion;

  final posted = <String>[];

  /// أجسام `PATCH /api/events/:id` — عليها يُقرأ ما أرسلته شاشة التعديل.
  final patches = <Map<String, dynamic>>[];

  static const type = {
    'id': 1,
    'name': 'عرس',
    'icon': '💍',
    'color': '#0369a1',
    'position': 1,
    'is_active': true,
    'tone': 'festive',
    'fields': [
      {'field_key': 'honorees', 'label': 'العريس/العروس', 'is_visible': true, 'is_required': true, 'position': 1},
      {'field_key': 'town', 'label': 'البلدة', 'is_visible': true, 'is_required': true, 'position': 2},
      {'field_key': 'event_date', 'label': 'تاريخ المناسبة', 'is_visible': true, 'is_required': true, 'position': 3},
    ],
    'reactions': <String>[],
  };

  http.Response _json(Map<String, dynamic> body, [int status = 200]) =>
      http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  Future<http.Response> handle(http.Request request) async {
    final path = request.url.path;
    if (path.endsWith('/api/towns')) {
      return _json({
        'success': true,
        'towns': ['الكل', 'رهط', 'القرى والتجمعات', 'كفر قاسم'],
        'regions': [
          {
            'id': 1,
            'name': 'النقب',
            'latitude': 31.25,
            'longitude': 34.79,
            'map_zoom': 10,
            'position': 1,
            'towns': ['رهط', 'القرى والتجمعات'],
          },
          {
            'id': 2,
            'name': 'المثلث',
            'latitude': 32.2,
            'longitude': 35.0,
            'map_zoom': 10,
            'position': 2,
            'towns': ['كفر قاسم'],
          },
        ],
        'villages': villagesHaveRegion
            ? [
                {
                  'id': 4,
                  'name': 'أم بطين',
                  'latitude': 31.25,
                  'longitude': 34.85,
                  'position': 1,
                  'region_id': 1,
                },
                {
                  'id': 5,
                  'name': 'دير حنا',
                  'latitude': 32.2,
                  'longitude': 35.1,
                  'position': 2,
                  'region_id': 2,
                },
              ]
            : [
                {'id': 4, 'name': 'أم بطين', 'latitude': 31.25, 'longitude': 34.85, 'position': 1},
              ],
        'town_coordinates': {
          'رهط': {'lat': 31.39, 'lng': 34.75},
        },
      });
    }
    if (path.endsWith('/api/occasion-types')) {
      return _json({
        'success': true,
        'types': [type],
      });
    }
    if (path.endsWith('/api/auth/me')) {
      return _json({
        'success': true,
        'user': {
          'id': 7,
          'phone_number': '0500000000',
          'full_name': 'مستخدم',
          'role': 'user',
        },
      });
    }
    if (request.method == 'POST' && path.endsWith('/api/events')) {
      posted.add(utf8.decode(request.bodyBytes));
      return _json({
        'success': true,
        'message': 'تم استلام طلب المناسبة بنجاح',
        'eventId': 5,
        'status': 'pending',
      }, 201);
    }
    if (request.method == 'PATCH' && path.contains('/api/events/')) {
      patches.add(jsonDecode(request.body) as Map<String, dynamic>);
      return _json({
        'success': true,
        'message': 'تم حفظ التعديل',
        'amendment': 'cosmetic',
        'status': 'approved',
        'location_warning': null,
      });
    }
    if (path.endsWith('/amendments')) {
      return _json({'success': true, 'amendments': const <Map<String, dynamic>>[]});
    }
    return _json({'success': true});
  }
}

void main() {
  group('الترويسة — X-Region مع كل نداء (تذكرة #125)', () {
    test('تُرفق حين يُضبط regionId، وتغيب كلياً حين لا يُضبط', () async {
      final sentHeaders = <Map<String, String>>[];
      final client = MockClient((request) async {
        sentHeaders.add(request.headers);
        return http.Response(
          jsonEncode({
            'success': true,
            'events': const <Map<String, dynamic>>[],
            'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
            'announcements': const <Map<String, dynamic>>[],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final api = NegevApi(ApiClient(client: client));

      // بلا اختيار: لا ترويسة إطلاقاً — سلوك ما قبل التذكرة كما هو.
      await api.listEvents();
      expect(sentHeaders.single.containsKey('X-Region'), isFalse);

      api.client.regionId = '2';
      await api.listEvents();
      expect(sentHeaders.last['X-Region'], '2');

      // نصّ فارغ = «لا محافظة»، لا ترويسة فارغة.
      api.client.regionId = '';
      await api.listEvents();
      expect(sentHeaders.last.containsKey('X-Region'), isFalse);
    });

    test('تُرفق مع طلب الكتابة أيضاً لا مع القراءة وحدها', () async {
      final sentHeaders = <Map<String, String>>[];
      final client = MockClient((request) async {
        sentHeaders.add(request.headers);
        return http.Response(
          jsonEncode({'success': true, 'user': {'id': 7, 'region_id': 2}}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final api = NegevApi(ApiClient(client: client))..client.regionId = '2';

      await api.setRegion(2);

      expect(sentHeaders.single['X-Region'], '2');
    });
  });

  group('مخزن المحافظة — الحفظ على الجهاز', () {
    test('حفظٌ ثم إعادة تحميل تُرجع المحافظة نفسها وترويسةً سارية', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer();
      final store = _store(server);

      await store.regions.select(2, signedIn: false);

      expect(store.regions.regionId, 2);
      expect(store.api.client.regionId, '2', reason: 'الترويسة تسري فوراً');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(RegionStore.storageKey), '2');

      // إقلاع جديد: مخزن آخر يقرأ نفس التخزين — بلا شبكة، كما في `main.dart`.
      final restarted = RegionStore(store.api, store.places, store.auth);
      await restarted.restore();
      expect(restarted.regionId, 2);
      expect(store.api.client.regionId, '2');
    });

    test('بلا محفوظ: لا اختيار ولا ترويسة — الخادم يقرّر الافتراضية', () async {
      SharedPreferences.setMockInitialValues({});
      final store = _store(_RegionServer());

      await store.regions.restore();

      expect(store.regions.regionId, isNull);
      expect(store.api.client.regionId, isNull);
    });

    test('معرّف محفوظ لم يعد موجوداً: يُمسح، وتُزال ترويسته، ويُخطر ليُعاد الجلب',
        () async {
      SharedPreferences.setMockInitialValues({RegionStore.storageKey: '99'});
      final store = _store(_RegionServer());

      // الإقلاع: المحفوظ يُرسَل كما هو قبل أن يتحقّق منه شيء (`restore` محلية).
      await store.regions.restore();
      expect(store.api.client.regionId, '99');

      var notified = 0;
      store.regions.addListener(() => notified++);
      await store.regions.reconcile();

      expect(store.regions.regionId, isNull);
      expect(store.api.client.regionId, isNull);
      expect(store.regions.headerRegionId, isNull, reason: 'لا ترويسة لمعرّف مرفوض');
      expect(notified, greaterThan(0), reason: 'HomeShell يسمع فيعيد الجلب');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(RegionStore.storageKey), isNull);
    });

    test('حساب له محافظة بلا تفضيل جهاز: الترويسة تساوي محافظة الحساب', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer(accountRegionId: 2);
      final store = _store(server);
      await _signedIn(server, store.auth);

      // قبل وصول المحافظات لا يُعرف أهي نشطة، فلا تُرسَل.
      expect(store.api.client.regionId, isNull);

      await store.regions.reconcile();

      // نداءات الاكتشاف عامة (`auth: false`) فلا يبلغ الخادمَ `req.user`:
      // محافظة الحساب لا تصل إلا بهذه الترويسة.
      expect(store.api.client.regionId, '2');
      expect(store.regions.headerRegionId, '2');
      expect(store.regions.effectiveRegionId, 2, reason: 'المنتقي يعلّمها');

      server.requests.clear();
      await store.api.listEvents();
      expect(server.requests.last.headers['X-Region'], '2');
    });

    test('اختيار جهاز صريح يغلب محافظة الحساب', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer(accountRegionId: 2);
      final store = _store(server);
      await _signedIn(server, store.auth);
      await store.regions.reconcile();
      expect(store.api.client.regionId, '2');

      await store.regions.select(1, signedIn: false);

      expect(store.regions.regionId, 1);
      expect(store.api.client.regionId, '1');
      expect(store.regions.effectiveRegionId, 1);

      // ومحافظة الحساب لا تعلو عليه عند تحديث الجلسة.
      store.regions.adoptAccountRegion();
      expect(store.api.client.regionId, '1');
    });
  });

  group('مخزن المحافظة — الحفظ على الحساب', () {
    test('select يرسل PATCH /api/auth/me بحقل region_id ويحدّث الجلسة', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer();
      final store = _store(server);
      await _signedIn(server, store.auth);

      await store.regions.select(2);

      final patch = server.requests.singleWhere(
        (request) =>
            request.method == 'PATCH' &&
            request.url.path.endsWith('/api/auth/me'),
      );
      expect(jsonDecode(patch.body), {'region_id': 2});
      expect(store.auth.user!.regionId, 2, reason: 'ردّ الخادم يحدّث الحساب');
    });

    test('فشل الحساب لا يمنع حفظ الجهاز', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer(failRegionPatch: true);
      final store = _store(server);
      await _signedIn(server, store.auth);

      await expectLater(
        store.regions.select(1),
        throwsA(isA<ApiException>()),
        reason: 'الفشل يُبلَّغ للمستخدم، والحفظ المحلي وقع قبله',
      );

      expect(store.regions.regionId, 1);
      expect(store.api.client.regionId, '1');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(RegionStore.storageKey), '1');
    });

    test('تسجيل الخروج لا يمسح تفضيل الجهاز ولا ترويسته', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer();
      final store = _store(server);
      await _signedIn(server, store.auth);
      await store.regions.select(1);

      await store.auth.signOut();

      expect(store.auth.isSignedIn, isFalse);
      expect(store.regions.regionId, 1);
      expect(store.api.client.regionId, '1', reason: 'الترويسة تبقى بعد الخروج');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(RegionStore.storageKey), '1');
    });

    test('الزائر: الحفظ على الجهاز وحده، بلا نداء حساب', () async {
      SharedPreferences.setMockInitialValues({});
      final server = _RegionServer();
      final store = _store(server);
      await store.places.load();
      server.requests.clear();

      await store.regions.select(2);

      expect(store.regions.regionId, 2);
      expect(
        server.requests.where((request) => request.method == 'PATCH'),
        isEmpty,
        reason: 'بلا جلسة لا شيء يُكتب على حساب',
      );
    });
  });

  group('«حسابي» — منتقي المنطقة', () {
    testWidgets('يعرض المحافظات النشطة ويعلّم محافظة الحساب، والنقر يبدّلها',
        (tester) async {
      final server = _RegionServer(accountRegionId: 2);
      final store = _store(server);
      await _signedIn(server, store.auth);
      await store.regions.restore();
      // كما في `main.dart`: التحقق من النشاط بعد وصول المحافظات.
      await store.regions.reconcile();

      await tester.pumpWidget(
        AppServices(
          api: store.api,
          auth: store.auth,
          realtime: RealtimeService(),
          places: store.places,
          regions: store.regions,
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: AccountScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('المنطقة'), findsOneWidget);
      // المحافظتان من `GET /api/towns` وحدهما — لا اسم مكتوب في العميل.
      expect(find.text('النقب'), findsOneWidget);
      expect(find.text('المثلث'), findsOneWidget);

      ChoiceChip chip(String id) =>
          tester.widget<ChoiceChip>(find.byKey(Key('region_chip_$id')));

      // محافظة الحساب معلَّمة — لا الأولى افتراضاً — وهي المُرسَلة ترويسةً.
      expect(chip('2').selected, isTrue, reason: 'محافظة الحساب معلَّمة');
      expect(chip('1').selected, isFalse);
      expect(store.regions.headerRegionId, '2');

      await tester.ensureVisible(find.byKey(const Key('region_chip_1')));
      await tester.tap(find.byKey(const Key('region_chip_1')));
      await tester.pumpAndSettle();

      expect(chip('1').selected, isTrue, reason: 'الحالة من المخزن لا من نسخة محلية');
      expect(chip('2').selected, isFalse);
      expect(store.regions.regionId, 1);
      expect(store.regions.headerRegionId, '1');
      expect(
        (await SharedPreferences.getInstance())
            .getString(RegionStore.storageKey),
        '1',
      );

      final patch = server.requests.singleWhere(
        (request) =>
            request.method == 'PATCH' &&
            request.url.path.endsWith('/api/auth/me'),
      );
      expect(jsonDecode(patch.body), {'region_id': 1});
    });
  });

  group('نموذج النشر — محافظة القرية', () {
    testWidgets('تبدأ على المحافظة الفعّالة، ويُرسَل region_id مع الطلب',
        (tester) async {
      final server = _FormServer();
      final api = NegevApi(ApiClient(client: MockClient(server.handle)));
      final auth = AuthStore(api);
      SharedPreferences.setMockInitialValues({
        'negev_token': 'test-token',
        'negev_user': jsonEncode({
          'id': 7,
          'phone_number': '0500000000',
          'full_name': 'مستخدم',
          'role': 'user',
        }),
      });
      await auth.load();

      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        AppServices(
          api: api,
          auth: auth,
          realtime: RealtimeService(),
          child: MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: const AddEventScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextFormField, 'العريس/العروس'),
        'محمد',
      );

      // البند الجامع ثم القرية — كلاهما من GET /api/towns وحده.
      await tester.tap(find.text('رهط').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('القرى والتجمعات').last);
      await tester.pumpAndSettle();

      await tester.tap(find.byType(DropdownButton<Village>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('أم بطين').last);
      await tester.pumpAndSettle();

      await tester.tap(find.text('اختر التاريخ'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      // المحافظة ليست فارغة تحت البند الجامع: تبدأ على محافظة الجهاز
      // الفعّالة (أول النشطة هنا: النقب) — فالنموذج يُرسَل بلا اختيار مسبق،
      // وقرى المحافظة نفسها هي المعروضة في منتقي القرية.
      final regionPicker = tester.widget<DropdownButtonFormField<int>>(
        find.byKey(const Key('add_region_picker')),
      );
      expect(regionPicker.initialValue, 1);

      await tester.tap(find.text('إرسال المناسبة'));
      await tester.pumpAndSettle();

      expect(server.posted, hasLength(1));
      final body = server.posted.single;
      final regionPart = body
          .split('--')
          .firstWhere((part) => part.contains('name="region_id"'));
      expect(regionPart, contains('\r\n\r\n1\r\n'));
      final villagePart = body
          .split('--')
          .firstWhere((part) => part.contains('name="village_id"'));
      expect(villagePart, contains('\r\n\r\n4\r\n'));
    });

    testWidgets('قرية المنتقي من محافظة النموذج وحدها، وتُفرَّغ حين تُبدَّل المحافظة',
        (tester) async {
      // ردّ يحمل `region_id` مع كل قرية — وهو الذي يُفعِّل تصفية المنتقي.
      final server = _FormServer(villagesHaveRegion: true);
      final api = NegevApi(ApiClient(client: MockClient(server.handle)));
      final auth = AuthStore(api);
      SharedPreferences.setMockInitialValues({
        'negev_token': 'test-token',
        'negev_user': jsonEncode({
          'id': 7,
          'phone_number': '0500000000',
          'full_name': 'مستخدم',
          'role': 'user',
        }),
      });
      await auth.load();

      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        AppServices(
          api: api,
          auth: auth,
          realtime: RealtimeService(),
          child: MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: const AddEventScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('رهط').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('القرى والتجمعات').last);
      await tester.pumpAndSettle();

      // المحافظة افتراضاً النقب (1): قرى النقب وحدها.
      await tester.tap(find.byType(DropdownButton<Village>));
      await tester.pumpAndSettle();
      expect(find.text('أم بطين'), findsWidgets);
      expect(find.text('دير حنا'), findsNothing, reason: 'قرية المثلث ليست في النقب');

      await tester.tap(find.text('أم بطين').last);
      await tester.pumpAndSettle();
      expect(find.text('أم بطين'), findsOneWidget, reason: 'القرية مختارة');

      // تبديل المحافظة يُعيد بناء القائمة: قرى المثلث وحدها، والقرية النقبية
      // المختارة تُفرَّغ لئلا يبقى منتقٍ بقيمة خارج بنوده.
      await tester.tap(find.byKey(const Key('add_region_picker')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('المثلث').last);
      await tester.pumpAndSettle();

      expect(find.text('أم بطين'), findsNothing, reason: 'قرية المحافظة السابقة');

      await tester.tap(find.byType(DropdownButton<Village>));
      await tester.pumpAndSettle();
      expect(find.text('دير حنا'), findsWidgets);
      expect(find.text('أم بطين'), findsNothing);
    });
  });

  group('نموذج التعديل — المحافظة ليست حرِجة', () {
    testWidgets('تغيير المحافظة وحده لا يعرض تحذير المراجعة، وتغيير البلدة يعرضه',
        (tester) async {
      final server = _FormServer();
      final api = NegevApi(ApiClient(client: MockClient(server.handle)));
      final auth = AuthStore(api);
      SharedPreferences.setMockInitialValues({
        'negev_token': 'test-token',
        'negev_user': jsonEncode({
          'id': 7,
          'phone_number': '0500000000',
          'full_name': 'مستخدم',
          'role': 'user',
        }),
      });
      await auth.load();

      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final event = Event.fromJson({
        'id': 1,
        'title': 'زفاف محمد',
        'groom_name': 'محمد',
        'town': 'القرى والتجمعات',
        'village_id': 4,
        'village_name': 'أم بطين',
        'event_date': '2026-10-01',
        'status': 'approved',
        'region_id': 2,
        'occasion_type': _FormServer.type,
        'honorees': [
          {'name': 'محمد', 'position': 0},
        ],
      });

      await tester.pumpWidget(
        AppServices(
          api: api,
          auth: auth,
          realtime: RealtimeService(),
          child: MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: EditEventScreen(event: event),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // محافظة القرية وحدها (المثلث 2 ← النقب 1): ليست في
      // CRITICAL_AMENDMENT_FIELDS، ولا تدخل changedColumns على الخادم.
      await tester.tap(find.byKey(const Key('edit_region_picker')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('النقب').last);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('save_event_button')));
      await tester.pumpAndSettle();

      expect(
        find.text('حفظ والمتابعة'),
        findsNothing,
        reason: 'تحذير المراجعة كان كذباً على الخادم: المحافظة مشتقّة لا حرِجة',
      );
      expect(server.patches.single['region_id'], 1);

      // والبلدة حرِجة فعلاً — التحذير يظهر قبل الإرسال الثاني. منتقي التعديل
      // بلدات محافظة المناسبة (المثلث) وحدها، فبند «كفر قاسم» من محافظتها،
      // و«القرى والتجمعات» بندٌ فيها أيضاً (`eventTownOptions` يلحقه آخر بلدة
      // قبل بند اسم المحافظة لكل محافظة لا تسرده) — كما يدخل بند `keep` حين
      // تكون بلدة المناسبة الحالية.
      await tester.tap(find.text('القرى والتجمعات').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('كفر قاسم').last);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('save_event_button')));
      await tester.pumpAndSettle();

      expect(find.text('حفظ والمتابعة'), findsOneWidget);
    });
  });
}
