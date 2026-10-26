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
  _AccountServer({this.avatarUrl, this.wrongPin = false});

  /// الرابط الذي يحمله `avatar_url` في `GET /api/auth/me` — null لمستخدم بلا صورة.
  final String? avatarUrl;

  /// يردّ 400 «رمز الدخول غير صحيح» على تغيير الرقم — الحالة التي يجب ألا
  /// تُخرج المستخدم من جلسته ولا تُغلق الحوار.
  final bool wrongPin;

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
}
