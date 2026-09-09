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
      'no blur and no 4:5 box on rendered EventCard',
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

        // مرساة موجِبة قبل أي نفي: توكيدا الغياب أدناه ينجحان على كرت لم
        // يُرسَم أصلاً، فلا يعنيان شيئاً ما لم نثبت أوّلاً أنّ الكرت هنا فعلاً.
        expect(find.byType(CardBezel), findsOneWidget);
        expect(find.byType(CardFramed), findsOneWidget);
        expect(find.byType(CardMedia), findsOneWidget);
        expect(find.byType(CardCaption), findsOneWidget);

        // لا طمس على الإطلاق في كرت التغذية (#98)
        expect(find.byType(ImageFiltered), findsNothing);

        // لا صندوق 4:5 مقيّد
        final aspectRatioFinder = find.byWidgetPredicate(
          (w) => w is AspectRatio && (w.aspectRatio - 4 / 5).abs() < 0.001,
        );
        expect(aspectRatioFinder, findsNothing);
      },
    );

    testWidgets(
      'the four layers exist and caption is a sibling of the media box',
      (tester) async {
        final event = Event.fromJson({
          'id': 101,
          'title': 'عرس تجريبي',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'poster_url': 'https://api.example.com/uploads/poster101.jpg',
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

        expect(find.byType(CardBezel), findsOneWidget);
        expect(find.byType(CardFramed), findsOneWidget);
        expect(find.byType(CardMedia), findsOneWidget);
        expect(find.byType(CardCaption), findsOneWidget);

        // CardCaption ليس ابناً لـ CardMedia والعكس صحيح
        expect(
          find.descendant(
            of: find.byType(CardMedia),
            matching: find.byType(CardCaption),
          ),
          findsNothing,
        );
        expect(
          find.descendant(
            of: find.byType(CardCaption),
            matching: find.byType(CardMedia),
          ),
          findsNothing,
        );
      },
    );

    testWidgets(
      'frame colour source uses occasion_type color or gold fallback',
      (tester) async {
        final greenEvent = Event.fromJson({
          'id': 201,
          'title': 'مناسبة بلون مخصص',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'occasion_type': {
            'id': 1,
            'name': 'عرس',
            'color': '#10b981',
          },
        });

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: EventCard(event: greenEvent, onTap: () {}),
              ),
            ),
          ),
        );

        final greenFramed = tester.widget<CardFramed>(find.byType(CardFramed));
        expect(greenFramed.toneColor, const Color(0xFF10B981));

        final greenBorderBoxes = tester.widgetList<DecoratedBox>(
          find.descendant(
            of: find.byType(CardFramed),
            matching: find.byType(DecoratedBox),
          ),
        );
        final greenBorderBox = greenBorderBoxes.firstWhere(
          (db) =>
              db.decoration is BoxDecoration &&
              (db.decoration as BoxDecoration).border is Border &&
              ((db.decoration as BoxDecoration).border as Border).top.width == 2,
        );
        final greenBorder =
            (greenBorderBox.decoration as BoxDecoration).border as Border;
        expect(greenBorder.top.color, const Color(0xFF10B981));

        // مناسبة بلون فارغ تعود للذهبي 0xFFD4AF37
        final nullColorEvent = Event.fromJson({
          'id': 202,
          'title': 'مناسبة بلا لون',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'occasion_type': null,
        });

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: EventCard(event: nullColorEvent, onTap: () {}),
              ),
            ),
          ),
        );

        final fallbackFramed = tester.widget<CardFramed>(find.byType(CardFramed));
        expect(fallbackFramed.toneColor, const Color(0xFFD4AF37));

        final fallbackBorderBoxes = tester.widgetList<DecoratedBox>(
          find.descendant(
            of: find.byType(CardFramed),
            matching: find.byType(DecoratedBox),
          ),
        );
        final fallbackBorderBox = fallbackBorderBoxes.firstWhere(
          (db) =>
              db.decoration is BoxDecoration &&
              (db.decoration as BoxDecoration).border is Border &&
              ((db.decoration as BoxDecoration).border as Border).top.width == 2,
        );
        final fallbackBorder =
            (fallbackBorderBox.decoration as BoxDecoration).border as Border;
        expect(fallbackBorder.top.color, const Color(0xFFD4AF37));
      },
    );

    // الفرق الذي وقع فعلاً: الكرت كان يطبع `2026-09-20` نيّئاً بينما الويب
    // يطبع «الأحد، ٢٠ سبتمبر ٢٠٢٦». نصّان لنفس المناسبة على العميلين.
    test('arabicEventDate يطابق صيغة الويب العربية الطويلة', () {
      // أرقام هندية لأنّ `ar-EG` نظامها الافتراضي `arab` — وهو ما يخرجه الويب.
      expect(arabicEventDate('2026-09-20'), 'الأحد، ٢٠ سبتمبر ٢٠٢٦');
      expect(arabicEventDate('2026-01-01'), 'الخميس، ١ يناير ٢٠٢٦');
      // تاريخ لا يُحلَّل يخرج كما جاء، لا فارغاً
      expect(arabicEventDate('لا تاريخ'), 'لا تاريخ');
    });

    // المواصفة #98: «العزاء أردوازيّ بنفس الرسم تماماً — بلا فرع `isSolemn` في
    // أي عميل». الفرع عاد مرّة عبر حجاب التحميل، فهذا يمسك عودته.
    testWidgets(
      'أرضية صندوق الوسائط تأتي من لون النوع بلا فرع على النبرة',
      (tester) async {
        Future<Color> groundFor({required String tone, required String color}) async {
          final event = Event.fromJson({
            'id': 401,
            'title': 'مناسبة',
            'groom_name': 'سالم',
            'family_clan': 'آل فلان',
            'town': 'رهط',
            'event_date': '2026-09-20',
            'poster_url': 'https://api.example.com/uploads/p.jpg',
            'occasion_type': {
              'id': 1,
              'name': 'نوع',
              'icon': '',
              'color': color,
              'tone': tone,
              'fields': <Map<String, dynamic>>[],
              'reactions': <String>[],
            },
          });

          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light(),
              home: Directionality(
                textDirection: TextDirection.rtl,
                child: Scaffold(body: EventCard(event: event, onTap: () {})),
              ),
            ),
          );

          final poster = tester.widget<EventPoster>(find.byType(EventPoster));
          return poster.groundColor!;
        }

        // نفس اللون على النغمتين: النبرة لا تدخل في الحساب إطلاقاً.
        final festive = await groundFor(tone: 'festive', color: '#0369a1');
        final solemn = await groundFor(tone: 'solemn', color: '#0369a1');
        expect(solemn, festive);

        // ولون آخر يعطي أرضية أخرى — فالمصدر هو النوع فعلاً لا ثابت.
        final other = await groundFor(tone: 'festive', color: '#b91c1c');
        expect(other, isNot(festive));
      },
    );

    // نظير تأكيد لوحة الإدارة في الويب: الطمس حُذف من **مسار التغذية وحده**.
    // شاشة التفاصيل سطح قرار — من فتح مناسبة بعينها جاء ليراها كاملة — فيبقى
    // الطمس هناك. بلا هذا التأكيد، إزالة عامّة للطمس تمرّ صامتة.
    testWidgets(
      'الطمس باقٍ على سطح القرار: EventPoster بـ whole: true لا يزال يطمس',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: EventPoster(
                  url: 'https://api.example.com/uploads/p.jpg',
                  whole: true,
                ),
              ),
            ),
          ),
        );

        expect(find.byType(EventPoster), findsOneWidget);
        expect(find.byType(ImageFiltered), findsOneWidget);
      },
    );

    testWidgets(
      'poster-less event builds without error, renders short caption and icon, and has no 4:5 box or image',
      (tester) async {
        final posterlessEvent = Event.fromJson({
          'id': 203,
          'title': 'عرس بلا ملصق',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'occasion_type': {
            'id': 1,
            'name': 'عرس',
            'icon': '💍',
            'color': '#0369a1',
            'tone': 'festive',
          },
        });

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: EventCard(event: posterlessEvent, onTap: () {}),
              ),
            ),
          ),
        );

        expect(find.byType(CardCaption), findsOneWidget);
        expect(find.textContaining('آل فلان'), findsOneWidget);
        expect(find.byIcon(Icons.celebration_outlined), findsOneWidget);

        final aspectRatioFinder = find.byWidgetPredicate(
          (w) => w is AspectRatio && (w.aspectRatio - 4 / 5).abs() < 0.001,
        );
        expect(aspectRatioFinder, findsNothing);
        expect(find.byType(CachedNetworkImage), findsNothing);
      },
    );

    testWidgets(
      'feed is its own scroller holding only cards; announcements, search, and load-more are outside PageView',
      (tester) async {
        final api = feedScreenApi(
          eventsBody: {
            'success': true,
            'events': [
              {
                'id': 301,
                'title': 'مناسبة أولى',
                'groom_name': 'سالم',
                'family_clan': 'آل فلان',
                'town': 'رهط',
                'event_date': '2026-09-20',
              },
              {
                'id': 302,
                'title': 'مناسبة ثانية',
                'groom_name': 'علي',
                'family_clan': 'آل علان',
                'town': 'حورة',
                'event_date': '2026-09-21',
              },
            ],
            'pagination': {
              'page': 1,
              'limit': 2,
              'total': 4,
              'totalPages': 2,
            },
            'announcements': [
              {
                'id': 1,
                'event_id': 301,
                'old_value': '2026-09-19',
                'new_value': '2026-09-20',
                'event': {
                  'id': 301,
                  'title': 'مناسبة أولى',
                  'town': 'رهط',
                  'event_date': '2026-09-20',
                },
              },
            ],
          },
        );

        await pumpFeedScreen(tester, api);
        await tester.pumpAndSettle();

        final pageViewFinder = find.byType(PageView);
        expect(pageViewFinder, findsOneWidget);
        final pageView = tester.widget<PageView>(pageViewFinder);
        expect(pageView.scrollDirection, Axis.vertical);

        // PageView يحتوي كروت المناسبات
        expect(
          find.descendant(of: pageViewFinder, matching: find.byType(EventCard)),
          findsWidgets,
        );

        // الإعلانات وشريط البحث وزر تحميل المزيد لا تتبع الـ PageView
        expect(
          find.descendant(
            of: pageViewFinder,
            matching: find.text('تغيّر موعد المناسبة'),
          ),
          findsNothing,
        );
        expect(
          find.descendant(
            of: pageViewFinder,
            matching: find.byType(TextField),
          ),
          findsNothing,
        );
        expect(
          find.descendant(
            of: pageViewFinder,
            matching: find.text('عرض المزيد'),
          ),
          findsNothing,
        );

        // لكنها موجودة في الكروم الثابت والطبقات الخارجية (تظهر بالضغط على كبسة الفلاتر والبحث)
        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();

        expect(find.text('تغيّر موعد المناسبة'), findsOneWidget);
        expect(find.byType(TextField), findsOneWidget);
        expect(find.text('عرض المزيد'), findsOneWidget);

        // وهذا هو التوكيد الذي يحرس قرار الملحق فعلاً: محور القفز يحمل
        // **الكروت وحدها**، فعدد صفحاته يساوي عدد المناسبات بالضبط — لا صفحة
        // زائدة لتعميم ولا لذيل تحميل. «يحتوي كروتاً» أعلاه يبقى صحيحاً حتى لو
        // تسلّل عنصر ثالث بينها؛ هذا لا يبقى.
        // مناسبتان في التجهيزة أعلاه، وتعميم واحد، وصفحة تالية متاحة — فلو
        // بقي أيٌّ من الاثنين على المحور لصار العدد ثلاثة أو أربعة.
        expect(pageView.childrenDelegate.estimatedChildCount, 2);
      },
    );

    testWidgets(
      'poster is cover and top-aligned',
      (tester) async {
        final event = Event.fromJson({
          'id': 101,
          'title': 'عرس تجريبي',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'poster_url': 'https://api.example.com/uploads/poster101.jpg',
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

        final imageFinder = find.descendant(
          of: find.byType(CardMedia),
          matching: find.byType(CachedNetworkImage),
        );
        expect(imageFinder, findsOneWidget);
        final image = tester.widget<CachedNetworkImage>(imageFinder);
        expect(image.fit, BoxFit.cover);
        expect(image.alignment, Alignment.topCenter);
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
        // نصّ حرفيّ لا `arabicEventDate('2026-09-20')`: لو نُقِض التنسيق فرجّعت
        // الدالة الخام، لصار الكرت والتوقّع كلاهما خاماً ونجح التأكيد على عطل.
        expect(find.textContaining('الأحد، ٢٠ سبتمبر ٢٠٢٦'), findsOneWidget);
        expect(find.text('مزيد من التفاصيل'), findsOneWidget);
      },
    );

    testWidgets(
      'place chip never reads "كل الأماكن" once a town is selected, and villages come from the server',
      (tester) async {
        final api = feedScreenApi();
        await pumpFeedScreen(tester, api);

        // نفتح لوحة الفلاتر بالكبسة
        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();

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
