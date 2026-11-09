import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «حسابي» في الموبايل: الصورة الشخصية، والاسم/البلدة، وتغيير رقم الدخول.
///
/// الخادم وهمي هنا، والنقاط الثلاث هي التي تُختبر: الجسم المُرسَل، وما يعود
/// إلى الشاشة والجلسة بعده. **`image_picker` نفسه غير مُختبَر** — قناة منصّة
/// لا تُخدم في `flutter test`، ومنطق التقاط الصورة يبقى يدوياً على جهاز.
class _AccountServer {
  _AccountServer({
    this.avatarUrl,
    this.wrongPin = false,
    this.providers = const [],
  });

  /// الرابط الذي يحمله `avatar_url` في `GET /api/auth/me` — null لمستخدم بلا صورة.
  final String? avatarUrl;

  /// يردّ 400 «رمز الدخول غير صحيح» على تغيير الرقم — الحالة التي يجب ألا
  /// تُخرج المستخدم من جلسته ولا تُغلق الحوار.
  final bool wrongPin;

  /// مزوّدات «مزوّدي» (تذكرة #187) كما يعيدها `GET /api/services/my-providers`.
  /// القائمة الفارغة تعني حساباً بلا ربط — والقسم كله لا يُبنى حينها.
  final List<Map<String, dynamic>> providers;

  /// كل طلب وصل، بالترتيب — عليه تُقرأ الأجسام المُرسَلة.
  final requests = <http.Request>[];

  late Map<String, dynamic> user = <String, dynamic>{
    'id': 7,
    'phone_number': '0500000000',
    'full_name': 'سالم أبو محمد',
    'clan_town': 'رهط',
    'role': 'user',
    'avatar_url': avatarUrl,
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

    if (path.endsWith('/api/auth/me/phone')) {
      if (wrongPin) {
        return _json({'success': false, 'message': 'رمز الدخول غير صحيح'}, 400);
      }
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      user = {...user, 'phone_number': body['phone_number']};
      return _json({
        'success': true,
        'user': user,
        'token': 'new-token',
        'message': 'تم تحديث رقم هاتفك — استخدمه في الدخول القادم',
      });
    }
    if (path.endsWith('/api/auth/me')) {
      if (request.method == 'PATCH') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        user = {
          ...user,
          'full_name': body['full_name'] ?? user['full_name'],
          'clan_town': body['clan_town'] ?? user['clan_town'],
        };
        return _json({
          'success': true,
          'user': user,
          'message': 'تم تحديث بيانات حسابك',
        });
      }
      return _json({'success': true, 'user': user});
    }
    // «مزوّدي» (تذكرة #187): القائمة من الخادم وحده، وصفحة المزوّد نفسها
    // تُفتح بالنقر على البطاقة — فيُخدم مسارها بتفصيل صالح.
    if (path.endsWith('/api/services/my-providers')) {
      return _json({'success': true, 'providers': providers});
    }
    if (path.endsWith('/api/services/providers/701') && request.method == 'GET') {
      return _json({
        'success': true,
        'provider': providers.isEmpty ? <String, dynamic>{} : providers.first,
      });
    }
    return _json({'success': true});
  }
}

/// جلسة محفوظة يخدمها الخادم الوهمي — `load()` يستدعي `/api/auth/me` فيمرّ
/// منه، فيصل المستخدم إلى الشاشة كما يصل في التشغيل الحقيقي.
Future<({NegevApi api, AuthStore auth})> _signedIn(_AccountServer server) async {
  SharedPreferences.setMockInitialValues({
    'negev_token': 'test-token',
    'negev_user': jsonEncode(server.user),
  });
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  await auth.load();
  return (api: api, auth: auth);
}

Future<void> _pumpAccount(
  WidgetTester tester,
  NegevApi api,
  AuthStore auth,
) async {
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth,
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: AccountScreen(),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('avatar_url المضبوط يُرسم صورةً شخصية في البطاقة', (tester) async {
    final server = _AccountServer(avatarUrl: 'https://cdn.test/avatars/7.jpg');
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    expect(find.byKey(const Key('profile_avatar')), findsOneWidget);
    final image = tester.widget<Image>(find.byKey(const Key('profile_avatar')));
    expect(image.image, isA<NetworkImage>());
    expect(
      (image.image as NetworkImage).url,
      'https://cdn.test/avatars/7.jpg',
      reason: 'الرابط كما وصل من الخادم — لا إعادة بنائه في العميل',
    );
    expect(find.byKey(const Key('profile_pick_avatar')), findsOneWidget);
  });

  testWidgets('حفظ الاسم والبلدة يرسلهما في PATCH /api/auth/me ويحدّث الشاشة',
      (tester) async {
    final server = _AccountServer();
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_edit_btn')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('profile_name_field')),
      'محمد أبو سالم',
    );
    await tester.enterText(
      find.byKey(const Key('profile_town_field')),
      'بئر السبع',
    );
    await tester.tap(find.byKey(const Key('profile_save')));
    await tester.pumpAndSettle();

    final patch = server.requests.singleWhere(
      (request) =>
          request.method == 'PATCH' &&
          request.url.path.endsWith('/api/auth/me'),
    );
    final body = jsonDecode(patch.body) as Map<String, dynamic>;
    expect(body['full_name'], 'محمد أبو سالم');
    expect(body['clan_town'], 'بئر السبع');

    expect(session.auth.user!.fullName, 'محمد أبو سالم');
    expect(find.text('محمد أبو سالم'), findsOneWidget, reason: 'الاسم الجديد على الشاشة');
    expect(find.text('بئر السبع'), findsOneWidget);
  });

  testWidgets('تغيير الرقم يرسل الرقم ورمز الدخول ويبدّل الجلسة إلى الرمز الجديد',
      (tester) async {
    final server = _AccountServer();
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_phone_btn')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('profile_phone_field')),
      '0501234567',
    );
    await tester.enterText(find.byKey(const Key('profile_pin_field')), '1234');
    await tester.tap(find.byKey(const Key('profile_phone_save')));
    await tester.pumpAndSettle();

    final patch = server.requests.singleWhere(
      (request) => request.url.path.endsWith('/api/auth/me/phone'),
    );
    expect(patch.method, 'PATCH');
    final body = jsonDecode(patch.body) as Map<String, dynamic>;
    expect(body['phone_number'], '0501234567');
    expect(body['pin_code'], '1234');

    expect(session.auth.token, 'new-token', reason: 'الرمز الجديد من الردّ');
    expect(session.api.client.token, 'new-token', reason: 'والطلبات التالية تحمله');
    expect(session.auth.user!.phoneNumber, '0501234567');
    expect(find.text('0501234567'), findsOneWidget, reason: 'الرقم الجديد على الشاشة');
  });

  testWidgets('رمز خاطئ: الرسالة تظهر والحوار يبقى والجلسة لا تُمسّ', (tester) async {
    final server = _AccountServer(wrongPin: true);
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_phone_btn')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('profile_phone_field')), '0501234567');
    await tester.enterText(find.byKey(const Key('profile_pin_field')), '0000');
    await tester.tap(find.byKey(const Key('profile_phone_save')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('رمز الدخول غير صحيح'), findsOneWidget);
    expect(session.auth.isSignedIn, isTrue, reason: '400 ليس 401 — لا خروج');
    expect(session.auth.token, 'test-token');
    expect(
      find.byKey(const Key('profile_pin_field')),
      findsOneWidget,
      reason: 'الحوار يبقى مفتوحاً كي يصحّح المستخدم رمزه',
    );
  });

  testWidgets('اسم فارغ: رسالة محلية بلا أي نداء', (tester) async {
    final server = _AccountServer();
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);
    final before = server.requests.length;

    await tester.tap(find.byKey(const Key('profile_edit_btn')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('profile_name_field')), '   ');
    await tester.tap(find.byKey(const Key('profile_save')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('الاسم لا يكون فارغاً'), findsOneWidget);
    expect(
      server.requests.length,
      before,
      reason: 'اسم فارغ لا يحتاج ردّ الخادم',
    );
    expect(session.auth.user!.fullName, 'سالم أبو محمد');
  });

  // --- «مزوّدي» (تذكرة #187) ------------------------------------------
  // القسم لا يُبنى إطلاقاً بلا ربط، وبطاقته تفتح صفحة المزوّد نفسها حيث الردّ
  // على التقييمات. الخادم هو مصدر القائمة وحده — لا نسخة في العميل.

  Map<String, dynamic> linkedProviderCard() => {
        'id': 701,
        'name': 'مزوّد الردّ',
        'category_id': 9,
        'category_name': 'صالات أفراح',
        'category_icon': '🏛️',
        'category_color': '#8a6109',
        'has_phone': true,
        'image_url': null,
        'price': 100,
        'price_type': 'fixed',
        'price_estimate_desc': null,
        'attributes': <String, dynamic>{},
        'is_verified': false,
        'is_featured': false,
        'status': 'approved',
        'towns': <dynamic>['رهط'],
        'views_count': 3,
        'favorites_count': 0,
        'rating_avg': 4.5,
        'rating_count': 2,
        'rating_distribution': {'1': 0, '2': 0, '3': 1, '4': 0, '5': 1},
        'is_favorite': false,
        'is_linked_provider': true,
      };

  testWidgets('«مزوّدي» يعرض مزوّد الحساب المربوط، وبطاقته تفتح صفحة المزوّد',
      (tester) async {
    // «حسابي» قائمة كسولة: القسم يقع تحت البطاقة والوصول السريع، فشاشة
    // الاختبار الافتراضية لا تبنيه أصلاً. ارتفاع يكفي لوصوله — لا أكثر.
    tester.view.physicalSize = const Size(1000, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final server = _AccountServer(providers: [linkedProviderCard()]);
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      find.byKey(const Key('account_my_providers')),
      findsOneWidget,
      reason: 'القسم مبنيّ لأن للحساب مزوّداً مربوطاً',
    );
    expect(find.text('مزوّد الردّ'), findsOneWidget, reason: 'باسمه من الخادم');
    expect(
      server.requests.where((request) => request.url.path.endsWith('/api/services/my-providers')),
      hasLength(1),
      reason: 'طلب واحد عند أول بناء — لا مع كل إعادة رسم',
    );

    await tester.tap(find.byKey(const Key('account_my_provider_701')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      server.requests.any((request) =>
          request.method == 'GET' &&
          request.url.path.endsWith('/api/services/providers/701')),
      isTrue,
      reason: 'البطاقة تفتح صفحة المزوّد حيث الردود',
    );
  });

  testWidgets('«مزوّدي» لا يظهر لحساب بلا مزوّد مربوط', (tester) async {
    tester.view.physicalSize = const Size(1000, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final server = _AccountServer(providers: const []);
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      server.requests.where((request) => request.url.path.endsWith('/api/services/my-providers')),
      hasLength(1),
      reason: 'الطلب يجري — الغياب من ردّ الخادم لا من إسقاط العميل',
    );
    expect(
      find.byKey(const Key('account_my_providers')),
      findsNothing,
      reason: 'لا عنوان لقسم فارغ',
    );
  });
}
