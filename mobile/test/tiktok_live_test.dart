import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/story_viewer_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// عميل وهمي يوجّه حسب المسار — نفس نمط `feedScreenApi` في feed_test.dart،
/// مع مفتاح إضافي: `liveBody` يتحكّم بردّ GET /api/live (نائبه الافتراضي
/// «لا شيء مضبوط»، مطابقاً لِما يردّه الخادم فعلاً حين لم يضبط المالك قناة
/// ولا بثّاً)، و`stories` تملأ GET /api/stories.
NegevApi liveScreenApi({
  Object? liveBody,
  List<Map<String, dynamic>> stories = const [],
}) {
  final client = MockClient((request) async {
    final path = request.url.path;
    if (path.endsWith('/api/live')) {
      return http.Response(
        jsonEncode(liveBody ?? {'success': true, 'profile_url': null, 'live': null}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/api/stories')) {
      return http.Response(
        jsonEncode({'success': true, 'stories': stories}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/api/occasion-types')) {
      return http.Response(
        jsonEncode({'success': true, 'types': <Map<String, dynamic>>[]}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/api/towns')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'towns': ['الكل', 'رهط'],
          'villages': <Map<String, dynamic>>[],
          'town_coordinates': <String, dynamic>{},
          'stats': <Map<String, dynamic>>[],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/api/events')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'events': <Map<String, dynamic>>[],
          'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
          'announcements': <Map<String, dynamic>>[],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response(
      jsonEncode({'success': true}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

/// شاشة المناسبات مع شريط القصص مفتوحاً — الفقاعة والقصص لا تُرسَمان إلا داخل
/// لوحة الفلاتر المنسدلة (`_showTopChrome`)، تماماً كما في feed_test.dart.
Future<void> pumpEventsScreenWithStripOpen(WidgetTester tester, NegevApi api) async {
  final auth = AuthStore(api);
  final realtime = RealtimeService();
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServices(
          api: api,
          auth: auth,
          realtime: realtime,
          child: const EventsScreen(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));

  await tester.tap(find.text('الفلاتر والبحث'));
  await tester.pumpAndSettle();
}

/// شاشة «حسابي» لزائر غير مسجَّل — الصفّ يجب أن يظهر له أيضاً (القناة عامة).
Future<void> pumpSignedOutAccountScreen(WidgetTester tester, NegevApi api) async {
  SharedPreferences.setMockInitialValues({});
  final auth = AuthStore(api);
  await auth.load();
  final realtime = RealtimeService();
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServices(
          api: api,
          auth: auth,
          realtime: realtime,
          child: const AccountScreen(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

const _bubbleLabel = 'تيك توك أعراسنا';
const _rowLabel = 'تابعونا على تيك توك';

/// حلقة الفقاعة — `Container` الدائري ٥٤×٥٤ الذي يحمل لون البثّ، أب
/// `Icons.video_camera_front_rounded` مباشرة (اللون هو ما نفحصه في كل اختبار
/// من اختبارات المعاملة الحيّة أدناه).
Border _bubbleRingBorder(WidgetTester tester) {
  final container = tester.widget<Container>(
    find.ancestor(
      of: find.byIcon(Icons.video_camera_front_rounded),
      matching: find.byType(Container),
    ),
  );
  return (container.decoration as BoxDecoration).border as Border;
}

void main() {
  group('مدخل تيك توك للزوار في الموبايل (LIVE-04b)', () {
    testWidgets(
      'لا قناة ولا بثّ مضبوطان: لا فقاعة في شريط القصص، ولا صفّ في «حسابي»',
      (tester) async {
        final feedApi = liveScreenApi(
          stories: [
            {'id': 1, 'title': 'قصة عادية'},
          ],
        );
        await pumpEventsScreenWithStripOpen(tester, feedApi);
        // مرساة موجبة قبل كل `findsNothing`: بدونها ينجح الاختبار نجاحاً
        // فارغاً لو لم يُبنَ الشريط ولا الشاشة أصلاً، وهو ما لا يحرس شيئاً.
        expect(find.text('قصة عادية'), findsOneWidget);
        expect(find.text(_bubbleLabel), findsNothing);

        final accountApi = liveScreenApi();
        await pumpSignedOutAccountScreen(tester, accountApi);
        expect(find.text('الدعم الفني عبر واتساب'), findsOneWidget);
        expect(find.text(_rowLabel), findsNothing);
      },
    );

    testWidgets(
      'قناة مضبوطة بلا بثّ: الفقاعة ظاهرة بلون الحلقة العادي لا لون البثّ',
      (tester) async {
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': 'https://www.tiktok.com/@aaresna',
            'live': null,
          },
        );
        await pumpEventsScreenWithStripOpen(tester, api);

        expect(find.text(_bubbleLabel), findsOneWidget);
        final border = _bubbleRingBorder(tester);
        expect(border.top.color, NegevPalette.light.line);
      },
    );

    testWidgets(
      'بثّ نشِط (active: true من الخادم): الفقاعة تلبس لون البثّ في هذا الشريط',
      (tester) async {
        final futureUntil = DateTime.now().add(const Duration(hours: 2)).toIso8601String();
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': null,
            'live': {
              'title': 'بثّ مباشر الآن',
              'until': futureUntil,
              'url': 'https://www.tiktok.com/@aaresna/live',
              'active': true,
            },
          },
        );
        await pumpEventsScreenWithStripOpen(tester, api);

        expect(find.text(_bubbleLabel), findsOneWidget);
        final border = _bubbleRingBorder(tester);
        expect(border.top.color, NegevPalette.light.success);
      },
    );

    testWidgets(
      'بثّ منتهٍ (active: false من الخادم رغم عنوان وموعد): الفقاعة ظاهرة '
      'لكن بلا لون البثّ',
      (tester) async {
        final pastUntil = DateTime.now().subtract(const Duration(hours: 2)).toIso8601String();
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': 'https://www.tiktok.com/@aaresna',
            'live': {
              'title': 'بثّ انتهى',
              'until': pastUntil,
              'url': 'https://www.tiktok.com/@aaresna/live',
              // active:false صراحةً من الخادم رغم أنّ حساباً محلياً ساذجاً من
              // `until` وحدها كان سيعطي نفس النتيجة هنا — الاختبار التالي
              // (active:true مع until ماضٍ) هو من يفصل الحالتين فعلاً.
              'active': false,
            },
          },
        );
        await pumpEventsScreenWithStripOpen(tester, api);

        expect(find.text(_bubbleLabel), findsOneWidget);
        final border = _bubbleRingBorder(tester);
        expect(border.top.color, NegevPalette.light.line);
      },
    );

    testWidgets(
      'active: true من الخادم مع until ماضٍ: العميل يأخذ active كما وصلت '
      'ولا يعيد اشتقاقها من until — لو أعاد اشتقاقها لظهرت هنا بلا لون البثّ',
      (tester) async {
        final pastUntil = DateTime.now().subtract(const Duration(hours: 2)).toIso8601String();
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': null,
            'live': {
              'title': 'بثّ',
              'until': pastUntil,
              'url': 'https://www.tiktok.com/@aaresna/live',
              'active': true,
            },
          },
        );
        await pumpEventsScreenWithStripOpen(tester, api);

        final border = _bubbleRingBorder(tester);
        expect(border.top.color, NegevPalette.light.success);
      },
    );

    testWidgets(
      'قناة مضبوطة وصفّ حسابي: الصفّ ظاهر لزائر غير مسجَّل — القناة عامة',
      (tester) async {
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': 'https://www.tiktok.com/@aaresna',
            'live': null,
          },
        );
        await pumpSignedOutAccountScreen(tester, api);
        expect(find.text(_rowLabel), findsOneWidget);
      },
    );

    testWidgets(
      'الفقاعة لا تُزيح فهارس القصص: مع قصّتين، الضغط على القصة الحقيقية '
      'الأولى يفتح فهرس ٠ لا ١',
      (tester) async {
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': 'https://www.tiktok.com/@aaresna',
            'live': null,
          },
          stories: [
            {'id': 10, 'title': 'قصة أولى'},
            {'id': 20, 'title': 'قصة ثانية'},
          ],
        );
        await pumpEventsScreenWithStripOpen(tester, api);

        // الفقاعة والقصّتان الحقيقيتان الثلاثة موجودة معاً — مرساة موجبة قبل
        // فحص الفهرس: لو غابت الفقاعة هنا خطأً لصار الاختبار التالي بلا معنى.
        expect(find.text(_bubbleLabel), findsOneWidget);
        expect(find.text('قصة أولى'), findsOneWidget);
        expect(find.text('قصة ثانية'), findsOneWidget);

        await tester.tap(find.text('قصة أولى'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));

        final viewer = tester.widget<StoryViewerScreen>(find.byType(StoryViewerScreen));
        expect(viewer.initialIndex, 0);
        expect(viewer.stories[viewer.initialIndex].title, 'قصة أولى');
      },
    );

    testWidgets(
      'قناة مضبوطة بلا أي قصة: الفقاعة تظهر وحدها بدل اختفاء الشريط كاملاً',
      (tester) async {
        final api = liveScreenApi(
          liveBody: {
            'success': true,
            'profile_url': 'https://www.tiktok.com/@aaresna',
            'live': null,
          },
          stories: const [],
        );
        await pumpEventsScreenWithStripOpen(tester, api);

        expect(find.text(_bubbleLabel), findsOneWidget);
      },
    );

    test(
      'وجهة الفقاعة/الصفّ هي GET /live/go لا /live نفسها',
      () {
        final client = ApiClient(client: MockClient((_) async => http.Response('', 404)));
        final uri = NegevApi(client).tiktokLiveGoUrl;
        expect(uri.path, '/live/go');
        // ونفس أصل خادمنا الذي تمشي عليه نداءات JSON — لا مضيف مكتوب بالكود،
        // ولا قفزة مباشرة إلى tiktok.com من العميل: نحن الوسيط، والنقرة
        // تُحسَب عندنا قبل التحويل. (`isNot('/live')` كان هنا قبلاً، وهو
        // مستلزَم حرفياً من السطر الذي فوقه فلا يستطيع السقوط وحده.)
        expect(uri.origin, client.buildUrl('/api/live').origin);
      },
    );
  });
}
