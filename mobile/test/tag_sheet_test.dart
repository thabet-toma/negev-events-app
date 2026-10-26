import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/album.dart';
import 'package:negev_events/screens/albums_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ورقة «أنا في الصورة» في الموبايل — نفس ورقة الويب (T-07): تشرح الوسم
/// وتذكر شرطَيه قبل الإرسال، ولا ترسل شيئاً قبل استيفائهما.
///
/// الخادم وهمي هنا، والمُختبر ثلاثة أشياء لا غير: أن الزرّ في العارض لم يعد
/// يرسل من نفسه، وأن الجسم يُرسَل كاملاً بعد الشرطين، وأن 400 يبقى داخل الورقة
/// برسالة الخادم العربية كما وصلت.
class _TagServer {
  _TagServer({this.avatarUrl, this.tagError});

  /// `avatar_url` في `GET /api/auth/me` — null لمستخدم بلا صورة شخصية.
  final String? avatarUrl;

  /// رسالة 400 على طلب الوسم — الحالة التي يجب أن تبقى فيها الورقة مفتوحة.
  final String? tagError;

  /// كل طلب وصل، بالترتيب — عليه يُقرأ الجسم المُرسَل.
  final requests = <http.Request>[];

  Map<String, dynamic> get user => <String, dynamic>{
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

    if (path.endsWith('/api/auth/me')) {
      return _json({'success': true, 'user': user});
    }
    if (request.method == 'POST' && path.endsWith('/tags')) {
      if (tagError != null) {
        return _json({'success': false, 'message': tagError}, 400);
      }
      return _json({'success': true});
    }
    return _json({'success': true});
  }
}

/// جلسة محفوظة يخدمها الخادم الوهمي — `load()` يستدعي `/api/auth/me` فيمرّ
/// منه، فيصل `avatar_url` و`phone_number` إلى الورقة كما يصلا في التشغيل.
Future<({NegevApi api, AuthStore auth})> _signedIn(_TagServer server) async {
  SharedPreferences.setMockInitialValues({
    'negev_token': 'test-token',
    'negev_user': jsonEncode(server.user),
  });
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  await auth.load();
  return (api: api, auth: auth);
}

const _photo = EventPhoto(
  id: 7,
  albumId: 11,
  imageUrl: 'https://cdn.test/p.jpg',
);

/// عارض الصورة نفسه الذي يفتحه المناسبات — على 360dp عرضاً كي يُمسَك أي فيض
/// في الورقة (الاختبار يفشل بأي `RenderFlex overflowed`).
Future<void> _pumpViewer(
  WidgetTester tester,
  NegevApi api,
  AuthStore auth,
) async {
  await tester.binding.setSurfaceSize(const Size(360, 800));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth,
      realtime: RealtimeService(),
      child: MaterialApp(
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: PhotoViewerScreen(photos: [_photo], initialIndex: 0),
        ),
      ),
    ),
  );
  await _frames(tester);
}

/// إطارات محدّدة بدل `pumpAndSettle`: صورة العارض تُحمَّل بـ`CachedNetworkImage`
/// ولا شبكة في الاختبار، فدائرة انتظارها قد تُبقي الرسم حيّاً بلا استقرار.
Future<void> _frames(WidgetTester tester, [int count = 4]) async {
  for (var i = 0; i < count; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _openSheet(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(FilledButton, 'أنا في الصورة'));
  await _frames(tester);
}

/// «أرسل الطلب» أسفل ورقة أطول من الشاشة على 360dp — يُمرَّر إليها قبل النقر.
Future<void> _tapSubmit(WidgetTester tester) async {
  final submit = find.byKey(const Key('tag_submit'));
  await tester.ensureVisible(submit);
  await _frames(tester);
  await tester.tap(submit);
  await _frames(tester);
}

void main() {
  testWidgets('بلا صورة شخصية: الورقة تشرح الشرط ولا يُرسَل أي طلب',
      (tester) async {
    final server = _TagServer();
    final session = await _signedIn(server);
    await _pumpViewer(tester, session.api, session.auth);

    await _openSheet(tester);

    expect(find.byKey(const Key('tag_avatar_state')), findsOneWidget,
        reason: 'الورقة نفسها ظهرت بدل الإرسال الفوري');
    expect(
      tester.widget<Text>(find.byKey(const Key('tag_avatar_state'))).data,
      '⚠️ لازم ترفع صورتك الشخصية أولاً',
    );
    expect(find.byKey(const Key('tag_upload_avatar')), findsOneWidget,
        reason: 'زرّ الرفع يظهر عند غياب الصورة فقط');
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('tag_submit'))).onPressed,
      isNull,
      reason: 'شرط الخادم الأول غائب — الزرّ لا يرسل',
    );
    expect(
      server.requests.where(
        (request) =>
            request.method == 'POST' && request.url.path.endsWith('/tags'),
      ),
      isEmpty,
      reason: 'لا طلب وسم قبل استيفاء الشرطين',
    );
  });

  testWidgets('بصورة وتأكيد الرقم: الجسم يصل كاملاً والورقة تُغلق', (tester) async {
    final server = _TagServer(avatarUrl: 'https://cdn.test/avatars/7.jpg');
    final session = await _signedIn(server);
    await _pumpViewer(tester, session.api, session.auth);

    await _openSheet(tester);

    expect(
      tester.widget<Text>(find.byKey(const Key('tag_avatar_state'))).data,
      '✅ صورتك الشخصية مرفوعة',
    );
    expect(find.byKey(const Key('tag_upload_avatar')), findsNothing);
    expect(
      tester.widget<Text>(find.byKey(const Key('tag_phone_state'))).data,
      'رقمك الشخصي: 0500000000',
    );

    await tester.tap(find.byKey(const Key('tag_confirm_phone')));
    await _frames(tester);

    await tester.enterText(
      find.byKey(const Key('tag_self_description')),
      'أنا اللي على اليمين',
    );
    await tester.enterText(
      find.byKey(const Key('tag_caption_suggestion')),
      'وصف الصورة',
    );
    await _frames(tester);

    await _tapSubmit(tester);

    final post = server.requests.singleWhere(
      (request) =>
          request.method == 'POST' &&
          request.url.path == '/api/photos/7/tags',
    );
    final body = jsonDecode(post.body) as Map<String, dynamic>;
    expect(body['confirm_phone'], isTrue, reason: 'الشرط الثاني على الخادم');
    expect(body['self_description'], 'أنا اللي على اليمين');
    expect(body['caption_suggestion'], 'وصف الصورة');
    expect(post.headers['Authorization'], 'Bearer test-token');

    expect(find.byKey(const Key('tag_self_description')), findsNothing,
        reason: 'النجاح وحده يغلق الورقة');
    expect(
      find.text('تم إرسال طلبك — يظهر اسمك بعد موافقة الإدارة'),
      findsOneWidget,
    );
  });

  testWidgets('ردّ 400: رسالة الخادم في سطر الخطأ والورقة تبقى مفتوحة',
      (tester) async {
    const message = 'ارفع صورتك الشخصية من حسابك أولاً — الوسم يربط الصورة بحسابك';
    final server = _TagServer(
      avatarUrl: 'https://cdn.test/avatars/7.jpg',
      tagError: message,
    );
    final session = await _signedIn(server);
    await _pumpViewer(tester, session.api, session.auth);

    await _openSheet(tester);
    await tester.tap(find.byKey(const Key('tag_confirm_phone')));
    await _frames(tester);

    await _tapSubmit(tester);

    expect(tester.widget<Text>(find.byKey(const Key('tag_error'))).data, message);
    expect(find.byKey(const Key('tag_self_description')), findsOneWidget,
        reason: 'الورقة تبقى مفتوحة كي يصحّح المستخدم ما ينقصه');
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('tag_submit'))).onPressed,
      isNotNull,
      reason: 'الفشل لا يعطّل الإرسال بعد التصحيح',
    );
  });
}
