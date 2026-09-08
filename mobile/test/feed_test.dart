import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/event_card.dart';
import 'package:negev_events/widgets/motion.dart';

/// عميل وهمي يوجّه حسب المسار — القصص وأنواع المناسبات فارغة، `/api/towns`
/// يحمل قرية اختبار من الخادم (لا من أي قائمة في العميل)، و`/api/events`
/// يعيد قائمة فارغة ما لم يُمرَّر جسم مختلف صراحةً.
NegevApi feedScreenApi({Object? eventsBody}) {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/stories')) {
      return http.Response(
        jsonEncode({'success': true, 'stories': <Map<String, dynamic>>[]}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (request.url.path.endsWith('/api/occasion-types')) {
      return http.Response(
        jsonEncode({'success': true, 'types': <Map<String, dynamic>>[]}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (request.url.path.endsWith('/api/towns')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'towns': ['الكل', 'رهط', 'حورة'],
          'villages': [
            {'id': 4, 'name': 'أم بطين', 'latitude': '31.25', 'longitude': '34.85', 'position': 1},
          ],
          'town_coordinates': <String, dynamic>{},
          'stats': <Map<String, dynamic>>[],
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (request.url.path.endsWith('/api/events')) {
      return http.Response(
        jsonEncode(
          eventsBody ??
              {
                'success': true,
                'events': <Map<String, dynamic>>[],
                'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
                'announcements': <Map<String, dynamic>>[],
              },
        ),
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

Future<void> pumpFeedScreen(WidgetTester tester, NegevApi api) async {
  final auth = AuthStore(api);
  final realtime = RealtimeService();
  await tester.pumpWidget(
    MaterialApp(
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
}

void main() {
  group('تغذية الموبايل (issue #85 Batch 8) — اختبارات الإثبات الأولي', () {
    testWidgets(
      'the poster is drawn whole (contain) in a 4:5 box',
      (tester) async {
        final event = Event.fromJson({
          'id': 101,
          'title': 'عرس تجريبي',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'location_name': 'قاعة السلام',
          'event_date': '2026-09-20',
          'dinner_time': '20:00',
          'poster_url': 'https://api.example.com/uploads/poster101.jpg',
          'occasion_type': {
            'id': 1,
            'name': 'عرس',
            'icon': '💍',
            'color': '#0369a1',
            'tone': 'festive',
            'fields': <Map<String, dynamic>>[],
            'reactions': <String>[],
          },
        });

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: EventCard(event: event, onTap: () {}),
              ),
            ),
          ),
        );

        // الصندوق 4:5
        final aspectRatioFinder = find.byWidgetPredicate(
          (w) => w is AspectRatio && (w.aspectRatio - 4 / 5).abs() < 0.001,
        );
        expect(aspectRatioFinder, findsOneWidget);

        // الملصق contain كاملاً بلا قصّ
        final imageFinder = find.byWidgetPredicate(
          (w) => w is CachedNetworkImage && w.fit == BoxFit.contain,
        );
        expect(imageFinder, findsOneWidget);
      },
    );

    testWidgets(
      'two selected towns both reach the request',
      (tester) async {
        final requests = <Uri>[];
        final client = MockClient((request) async {
          requests.add(request.url);
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
        });

        final api = NegevApi(ApiClient(client: client));

        // طلب ببلدتين مختارتين معاً عبر واجهة الاختيار المتعدّد الجديدة
        await (api as dynamic).listEvents(towns: ['رهط', 'كسيفة']);

        expect(requests, isNotEmpty);
        final req = requests.firstWhere((u) => u.path.endsWith('/api/events'));
        expect(req.queryParameters['town'], 'رهط,كسيفة');
      },
    );

    testWidgets(
      'a card with no poster still occupies the same 4:5 box',
      (tester) async {
        final event = Event.fromJson({
          'id': 102,
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
        });

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: event, onTap: () {})),
            ),
          ),
        );

        final aspectRatioFinder = find.byWidgetPredicate(
          (w) => w is AspectRatio && (w.aspectRatio - 4 / 5).abs() < 0.001,
        );
        expect(
          aspectRatioFinder,
          findsOneWidget,
          reason: 'كرت بلا ملصق يجب أن يحجز نفس صندوق ٤:٥ — لا يختفي الصندوق كلياً',
        );
      },
    );

    testWidgets(
      'a mourning card has no countdown chip but does show its date visibly',
      (tester) async {
        final mourningEvent = Event.fromJson({
          'id': 103,
          'title': '',
          'groom_name': '',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'event_date': '2026-09-20',
          'poster_url': 'https://api.example.com/uploads/poster103.jpg',
          'occasion_type': {
            'id': 2,
            'name': 'عزا',
            'icon': '🕯️',
            'color': '#4b5563',
            'tone': 'solemn',
            'fields': <Map<String, dynamic>>[],
            'reactions': <String>[],
          },
        });

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: mourningEvent, onTap: () {})),
            ),
          ),
        );

        // لا عدّاد على الإطلاق — لا «باقي» ولا «اليوم» ولا «غداً» فوق نعي.
        expect(find.textContaining('باقي'), findsNothing);
        expect(find.text('اليوم'), findsNothing);
        expect(find.text('غداً'), findsNothing);
        // لكن التاريخ نفسه ظاهر في الجزء المرئي من الكرت — بلا فتح «مزيد من
        // التفاصيل» (الزرّ لا يزال بحالته المطوية الافتراضية هنا).
        expect(find.text('2026-09-20'), findsOneWidget);
        expect(find.text('مزيد من التفاصيل'), findsOneWidget);
      },
    );

    testWidgets(
      'place chip never reads "كل الأماكن" once a town is selected, and villages come from the server',
      (tester) async {
        final api = feedScreenApi();
        await pumpFeedScreen(tester, api);

        expect(find.text('كل الأماكن'), findsOneWidget);
        // «مسح الفلاتر» ظاهرة دائماً من اللحظة الأولى — لا فقط عند وجود اختيار
        // (قصة 45 كما وردت في نص التذكرة نفسها: «ظاهراً دائماً»).
        expect(find.text('مسح الفلاتر'), findsOneWidget);

        await tester.tap(find.text('كل الأماكن'));
        await tester.pumpAndSettle();

        // القرية «أم بطين» آخر خيار في القائمة (بعد ثماني بلدات) فتحتاج تمريراً
        // كي تُبنى — القائمة الكسولة لا تبني ما هو خارج نطاق العرض.
        await tester.dragUntilVisible(
          find.textContaining('بطين'),
          find.byType(ListView).first,
          const Offset(0, -80),
        );
        // القرية «أم بطين» أتت من استجابة GET /api/towns وحدها — لا من أي
        // قائمة ثابتة في العميل (مسار جديد لم تحمله هذه القرية من قبل).
        expect(find.textContaining('بطين'), findsOneWidget);

        // نعيد التمرير لأعلى — «رهط» خرجت من نطاق البناء الكسول بعد التمرير
        // السابق لأسفل.
        await tester.dragUntilVisible(
          find.text('رهط'),
          find.byType(ListView).first,
          const Offset(0, 80),
        );
        await tester.tap(find.text('رهط'));
        await tester.tap(find.text('تطبيق'));
        await tester.pumpAndSettle();

        expect(find.text('كل الأماكن'), findsNothing);
        expect(find.text('رهط'), findsOneWidget);
      },
    );

    testWidgets(
      'reduce motion shows entrance content immediately with no fade, unlike the default',
      (tester) async {
        Future<double> opacityAfterFirstPump({required bool disableAnimations}) async {
          await tester.pumpWidget(
            MediaQuery(
              data: MediaQueryData(disableAnimations: disableAnimations),
              child: Directionality(
                textDirection: TextDirection.rtl,
                child: FirstScreenFadeIn(index: 0, child: const Text('محتوى')),
              ),
            ),
          );
          await tester.pump();
          final transition = tester.widget<FadeTransition>(find.byType(FadeTransition));
          return transition.opacity.value;
        }

        expect(await opacityAfterFirstPump(disableAnimations: true), 1.0);

        await tester.pumpWidget(const SizedBox.shrink());
        expect(await opacityAfterFirstPump(disableAnimations: false), lessThan(1.0));
      },
    );
  });
}
