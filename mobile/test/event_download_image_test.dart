import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/config.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/screens/event_details_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/share_event.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «نزّل الصورة» (تذكرة #182): الزرّ في شاشة تفاصيل المناسبة يطلب المسار العام
/// `GET /e/:id/download.png` (الخادم يرسم الصورة + شريط أعراسنا والـQR)، يكتب
/// البايتات ملفاً مؤقتاً، ثم يشاركها **مع رابط المناسبة** في صحيفة واحدة.
///
/// العميل وهمي بالكامل (MockClient) وصحيفة المشاركة تُبدَّل بدالة تلتقط الملف
/// والرابط — فلا قناة منصّة حقيقية ولا شبكة.

/// 1×1 PNG حقيقي — أصغر بايتات تُثبت أن ما مرّ هو صورة لا نصّ.
final Uint8List _pngBytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

const Map<String, dynamic> _eventJson = {
  'id': 60,
  'groom_name': 'محمد',
  'family_clan': 'آل فلان',
  'town': 'اللقية',
  'occasion_type': {
    'id': 1,
    'name': 'عرس',
    'icon': '💍',
    'color': '#0369a1',
    'position': 1,
    'is_active': true,
    'creates_collision': false,
    'warns_others': false,
    'premoderate_messages': false,
    'show_congratulations_count': false,
    'show_followers_count': false,
    'show_views_count': false,
    'congratulations_label': 'تبريكات',
    'default_badge_title': null,
    'default_poster_url': null,
    'legacy_client_supported': true,
    'tone': 'festive',
    'fields': <Map<String, dynamic>>[],
    'reactions': <String>[],
  },
  'honorees': [
    {'name': 'محمد', 'role': null, 'position': 1},
  ],
};

http.Response _jsonResponse(Object body, int status) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// يخدم المناسبة ومسار الصورة، ويسجّل كل طلب ليُقرأ مساره وترويساته.
MockClient _client({
  required List<http.Request> requests,
  http.Response Function()? onDownload,
}) {
  return MockClient((request) async {
    requests.add(request);
    if (request.url.path == '/e/60/download.png') {
      return onDownload?.call() ??
          http.Response.bytes(
            _pngBytes,
            200,
            headers: {'content-type': 'image/png'},
          );
    }
    if (request.url.path == '/api/auth/me') {
      return _jsonResponse({
        'success': true,
        'user': {
          'id': 7,
          'phone_number': '0500000000',
          'full_name': 'مستخدم فحص الصورة',
          'role': 'user',
        },
      }, 200);
    }
    if (request.url.path == '/api/events/60') {
      return _jsonResponse({'success': true, 'event': _eventJson}, 200);
    }
    return _jsonResponse({'success': true}, 201);
  });
}

Future<void> _pumpDetails(WidgetTester tester, NegevApi api, {AuthStore? auth}) async {
  // شاشة طويلة: الزرّ يلي زرّ المشاركة، وتكفي مساحة ٢٤٠٠ لأزرار الأسفل كلها
  // بلا تمرير — الاختبار يقيس الطلب والمشاركة لا التمرير.
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServices(
          api: api,
          auth: auth ?? AuthStore(api),
          realtime: RealtimeService(),
          child: const EventDetailsScreen(eventId: 60),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    PackageInfo.setMockInitialValues(
      appName: 'negev_events',
      packageName: 'com.negev.events',
      version: '1.2.0',
      buildNumber: '4',
      buildSignature: '',
    );
  });

  testWidgets(
    'زرّ «نزّل الصورة» في الشاشة يطلب /e/<id>/download.png بلا رمز دخول',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'negev_token': 'token-182-test',
        'negev_user': jsonEncode({
          'id': 7,
          'phone_number': '0500000000',
          'full_name': 'مستخدم فحص الصورة',
          'role': 'user',
        }),
      });

      final requests = <http.Request>[];
      final api = NegevApi(ApiClient(client: _client(requests: requests)));
      final auth = AuthStore(api);
      await auth.load();
      expect(api.client.token, 'token-182-test', reason: 'set up: الرمز محمَّل فعلاً في العميل');

      final originalInvoker = shareFileInvoker;
      shareFileInvoker = ({required String path, required String text}) async {};
      addTearDown(() => shareFileInvoker = originalInvoker);

      await _pumpDetails(tester, api, auth: auth);
      expect(find.byKey(const Key('event_download_image_button')), findsOneWidget);

      final eventRequest = requests.firstWhere(
        (request) => request.url.path == '/api/events/60',
        orElse: () => throw StateError('لم يُطلب جلب تفاصيل المناسبة إطلاقاً'),
      );
      expect(
        eventRequest.headers['Authorization'],
        'Bearer token-182-test',
        reason: 'طلب تفاصيل المناسبة يحتاج الرمز — يثبت أن الرمز كان متاحاً لهذا الطلب',
      );

      await tester.tap(find.byKey(const Key('event_download_image_button')));
      await tester.pump();

      final download = requests.firstWhere(
        (request) => request.url.path == '/e/60/download.png',
        orElse: () => throw StateError('لم يُطلب مسار صورة التنزيل إطلاقاً'),
      );
      expect(
        download.headers.containsKey('Authorization'),
        isFalse,
        reason: 'المسار عام — لا رمز دخول في طلب الصورة',
      );
    },
  );

  testWidgets(
    'المشاركة تمرّر الملف المؤقت وصورته هي ما نزّله الخادم ومعها رابط المناسبة',
    (tester) async {
      final requests = <http.Request>[];
      final api = NegevApi(ApiClient(client: _client(requests: requests)));

      final shared = <({String path, String text})>[];
      final originalInvoker = shareFileInvoker;
      shareFileInvoker = ({required String path, required String text}) async {
        shared.add((path: path, text: text));
      };
      addTearDown(() => shareFileInvoker = originalInvoker);

      await _pumpDetails(tester, api);

      // الدالة نفسها التي يناديها الزرّ (اختبار النقرة أعلاه يثبت الوصلة)،
      // مناداةً داخل runAsync (زمن حقيقي) لأن الكتابة إلى ملف مؤقّت حقيقية —
      // مؤقّتات الاختبار الوهمية تجعلها تعلق. ولا نقر من داخل runAsync:
      // الالتقاط هناك ينتظر pump فلا يعود.
      final context = tester.element(find.byKey(const Key('event_download_image_button')));
      await tester.runAsync(
        () => shareEventImage(context, Event.fromJson(Map<String, dynamic>.from(_eventJson))),
      );
      await tester.pump();

      expect(shared, hasLength(1), reason: 'نقرة واحدة = مشاركة واحدة');
      expect(shared.single.path, endsWith('.png'));
      expect(
        shared.single.text,
        contains('${AppConfig.apiBase}/e/60'),
        reason: 'المشاركة تحمل رابط المناسبة نفسه، لا الصورة وحدها',
      );
      expect(shared.single.text, contains('عرس'));

      final file = File(shared.single.path);
      // قراءة متزامنة: أي `await` لملف حقيقي خارج runAsync يعلق في مؤقّتات
      // الاختبار الوهمية (قِيس فعلاً — نفس سبب الـrunAsync أعلاه).
      expect(file.existsSync(), isTrue, reason: 'الصورة تُحفظ ملفاً مؤقتاً قبل المشاركة');
      expect(file.readAsBytesSync(), equals(_pngBytes));
    },
  );

  testWidgets(
    'فشل تنزيل الصورة يعرض رسالة عربية ولا يشارك شيئاً ولا يُسقط الشاشة',
    (tester) async {
      final requests = <http.Request>[];
      final api = NegevApi(
        ApiClient(
          client: _client(
            requests: requests,
            onDownload: () => _jsonResponse(
              {'success': false, 'message': 'المناسبة غير متاحة'},
              404,
            ),
          ),
        ),
      );

      var sharedCount = 0;
      final originalInvoker = shareFileInvoker;
      shareFileInvoker = ({required String path, required String text}) async {
        sharedCount += 1;
      };
      addTearDown(() => shareFileInvoker = originalInvoker);

      await _pumpDetails(tester, api);
      await tester.tap(find.byKey(const Key('event_download_image_button')));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('تعذّر تنزيل الصورة — حاول مرة أخرى'), findsOneWidget);
      expect(sharedCount, 0, reason: 'لا مشاركة بلا صورة');
      expect(tester.takeException(), isNull);
      // الشاشة باقية: زرّ التنزيل نفسه ما زال معروضاً بعد الفشل.
      expect(find.byKey(const Key('event_download_image_button')), findsOneWidget);
    },
  );
}
