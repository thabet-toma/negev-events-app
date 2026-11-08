import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/models/user.dart';
import 'package:negev_events/screens/add_event_screen.dart';
import 'package:negev_events/screens/albums_screen.dart';
import 'package:negev_events/screens/event_details_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/screens/story_viewer_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/region_store.dart';
import 'package:negev_events/state/welcome.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/event_card.dart';
import 'package:negev_events/widgets/motion.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// عميل وهمي يوجّه حسب المسار — القصص وأنواع المناسبات فارغة، `/api/towns`
/// يحمل بلدة وقرية ومحافظة من الخادم (لا من أي قائمة في العميل)، و`/api/events`
/// يعيد قائمة فارغة ما لم يُمرَّر جسم مختلف صراحةً: [eventsBody] لردّ ثابت أو
/// [eventsBodyFor] لردّ يتبع استعلام الطلب. [requests] يلتقط كل طلب.
///
/// [trendingBody]/[trendingBodyFor] هما الردّ نفسه لـ`/api/events/trending`
/// (تذكرة #177)، وافتراضهما `{success: true, events: []}` — أي «لا نتيجة»،
/// فلا يحمل اختبارٌ شريطاً لم يطلبه.
NegevApi feedScreenApi({
  Object? eventsBody,
  List<Uri>? requests,
  Object? Function(Uri url)? eventsBodyFor,
  Object? storiesBody,
  Object? trendingBody,
  Object? Function(Uri url)? trendingBodyFor,
}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    if (request.url.path.endsWith('/api/stories')) {
      return http.Response(
        jsonEncode(
          storiesBody ??
              {'success': true, 'stories': <Map<String, dynamic>>[]},
        ),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (request.url.path.endsWith('/api/events/trending')) {
      return http.Response(
        jsonEncode(
          trendingBodyFor?.call(request.url) ??
              trendingBody ??
              {'success': true, 'events': <Map<String, dynamic>>[]},
        ),
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
          'towns': ['الكل', 'رهط', 'حورة', 'بلدة جديدة'],
          'regions': [
            {
              'id': 1,
              'name': 'النقب',
              'latitude': 31.25,
              'longitude': 34.79,
              'map_zoom': 10,
              'position': 1,
              'towns': ['رهط', 'حورة', 'بلدة جديدة'],
            },
          ],
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
          eventsBodyFor?.call(request.url) ??
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

Future<void> pumpFeedScreen(
  WidgetTester tester,
  NegevApi api, {
  ValueNotifier<int>? tabRequest,
}) async {
  final auth = AuthStore(api);
  final realtime = RealtimeService();
  // `AppServices` فوق `MaterialApp` — موضعه في `main.dart` — لأن وضعَه داخل
  // `home` يجعل الشاشات المدفوعة (‏AlbumsScreen مثلاً) لا تجده: المسار المدفوع
  // شقيقٌ لـ`home` في شجرة الملاحة لا ابنٌ له.
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth,
      realtime: realtime,
      tabRequest: tabRequest,
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
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

        // خلفية هندسية عربية فاخرة لتعبئة الفراغ وحماية الصور العريضة من القص بدلاً من الطمس
        expect(find.byType(CustomPaint), findsWidgets);

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
      'الخلفية الهندسية الفاخرة: EventPoster بـ whole: true يرسم نقوشاً فاخرة للصورة العريضة',
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
        expect(find.byType(CustomPaint), findsWidgets);
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
            matching: find.textContaining('تغيّر موعد المناسبة'),
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

        expect(find.textContaining('تغيّر موعد المناسبة'), findsOneWidget);
        expect(find.byType(TextField), findsOneWidget);
        // ولا زرّ «عرض المزيد» عائماً في أيّ طبقة: كان يغطّي صفّ أزرار الكرت،
        // والصفحة التالية تُجلب تلقائياً من `onPageChanged`.
        expect(find.text('عرض المزيد'), findsNothing);

        // وهذا هو التوكيد الذي يحرس قرار الملحق فعلاً: محور القفز يحمل
        // **الكروت وحدها**، فعدد صفحاته يساوي عدد المناسبات بالضبط — لا صفحة
        // زائدة لتعميم ولا لذيل تحميل. «يحتوي كروتاً» أعلاه يبقى صحيحاً حتى لو
        // تسلّل عنصر ثالث بينها؛ هذا لا يبقى.
        // مناسبتان في التجهيزة أعلاه، وتعميم واحد، وصفحة تالية متاحة — فلو
        // بقي أيٌّ من الاثنين على المحور لصار العدد ثلاثة أو أربعة.
        expect(pageView.childrenDelegate.estimatedChildCount, 2);
      },
    );

    // بلاغ المالك 2026-11-01: الإعلان كان يصل بحقول مختصرة (`title`, `town`,
    // `occasion_type_id`) فتخرج مناسبتان في البلدة نفسها كرتين متطابقين
    // مكتوباً فيهما «رهط». صار الخادم يرسل كرت المناسبة كاملاً، والكرت يقرأه
    // بنموذج `Event` نفسه الذي يقرأ به كرت التغذية.
    testWidgets(
      'the announcement card names the honoree, the type and the change — not the town its title carries',
      (tester) async {
        final api = feedScreenApi(
          eventsBody: {
            'success': true,
            'events': <Map<String, dynamic>>[],
            'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
            'announcements': [
              {
                'id': 5,
                'event_id': 121,
                'old_value': '2027-03-04',
                'new_value': '2027-03-10',
                'event': {
                  'id': 121,
                  'title': 'رهط',
                  'groom_name': 'أيوب نصر حمودة القصاصي',
                  'family_clan': 'آل القصاصي',
                  'town': 'رهط',
                  'event_date': '2027-03-10',
                  'occasion_type': {
                    'id': 1,
                    'name': 'عرس',
                    'icon': '💍',
                    'color': '#0369a1',
                    'tone': 'festive',
                    'fields': <Map<String, dynamic>>[],
                    'reactions': <String>[],
                  },
                  'honorees': [
                    {
                      'name': 'أيوب نصر حمودة القصاصي',
                      'role': 'العريس',
                      'position': 0,
                    },
                  ],
                },
              },
            ],
          },
        );

        await pumpFeedScreen(tester, api);
        await tester.pumpAndSettle();

        // كرت الإعلان في الكروم الثابت — يُفتح من كبسة «الفلاتر والبحث».
        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();

        expect(find.text('إعلان تعديل موعد'), findsOneWidget);
        // العنوان: النوع واسم صاحب المناسبة، لا `title` («رهط») وحده.
        expect(find.text('عرس أيوب نصر حمودة القصاصي'), findsOneWidget);
        expect(find.text('آل القصاصي'), findsOneWidget);
        // سطر التغيير بالتاريخ العربي الطويل لا ISO خام.
        expect(
          find.text(
            'تغيّر موعد المناسبة من '
            '${arabicEventDate('2027-03-04')} إلى ${arabicEventDate('2027-03-10')}',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('2027-03-04'), findsNothing);
      },
    );

    testWidgets(
      'poster uses contain with blurred background fill to display wide images without cropping',
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
        expect(image.fit, BoxFit.contain);
        expect(
          find.descendant(
            of: find.byType(CardMedia),
            matching: find.byType(CustomPaint),
          ),
          findsWidgets,
        );
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
            theme: AppTheme.light(),
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
        // لكن التاريخ نفسه ظاهر في لوح المعلومات — بلا فتح صفحة المناسبة.
        // نصّ حرفيّ لا `arabicEventDate('2026-09-20')`: لو نُقِض التنسيق فرجّعت
        // الدالة الخام، لصار الكرت والتوقّع كلاهما خاماً ونجح التأكيد على عطل.
        expect(find.textContaining('الأحد، ٢٠ سبتمبر ٢٠٢٦'), findsOneWidget);
        expect(find.text('التفاصيل'), findsOneWidget);
      },
    );

    // أفعال الكرت (تذكرة #170): عرس يحمل «ذكّرني ♥» و«جاي ✓» و«بارك»، والعزاء
    // «عزّي» وحده — الرسائل لا تُكتب في الكرت، بل تُفتح ورقتها.
    Map<String, dynamic> actingEventJson({bool rsvpEnabled = true}) => {
          'id': 611,
          'title': '',
          'groom_name': 'سالم أبو الاختبار',
          'town': 'رهط',
          'event_date': '2026-12-31',
          'occasion_type': {
            'id': 1,
            'name': 'عرس',
            'icon': '💍',
            'color': '#b8860b',
            'tone': 'festive',
            'congratulations_label': 'تبريكات',
            'rsvp_enabled': rsvpEnabled,
            'fields': <Map<String, dynamic>>[],
            'reactions': <String>[],
          },
        };

    Widget wrapCard(Widget card) => MaterialApp(
          theme: AppTheme.light(),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: card),
          ),
        );

    testWidgets(
      'a featured card carries the gold «مناسبة كبرى» badge ahead of the type badge, and a plain card carries none',
      (tester) async {
        await tester.pumpWidget(wrapCard(EventCard(
          event: Event.fromJson({...actingEventJson(), 'is_featured': true}),
          onTap: () {},
        )));

        expect(find.text('مناسبة كبرى'), findsOneWidget,
            reason: 'الوسام يُقرأ من `is_featured` الذي يحسبه الخادم على الصفّ');

        // ذهبية لا بلون النوع: حاوية الشارة نفسها تحمل `cardGold`.
        final badgeContainer = tester
            .widgetList<Container>(
              find.ancestor(of: find.text('مناسبة كبرى'), matching: find.byType(Container)),
            )
            .firstWhere((container) => container.decoration is BoxDecoration);
        expect(
          (badgeContainer.decoration as BoxDecoration).color,
          cardGold,
          reason: 'شارة المنصّة ذهبية أبداً، لا بلون نوع المناسبة',
        );

        // «أولاً» في RTL: الشارة قبل رقاقة النوع إلى اليمين، فالوسام يُقرأ أولاً.
        expect(
          tester.getTopLeft(find.text('مناسبة كبرى')).dx,
          greaterThan(tester.getTopLeft(find.text('عرس')).dx),
          reason: 'الشارة تسبق رقاقة النوع في صفّ الشارات',
        );

        await tester.pumpWidget(wrapCard(EventCard(
          event: Event.fromJson({...actingEventJson(), 'is_featured': false}),
          onTap: () {},
        )));
        expect(find.text('مناسبة كبرى'), findsNothing,
            reason: 'كرت غير مبرز لا يحمل الشارة');
      },
    );

    testWidgets(
      'a wedding card carries «ذكّرني» و«جاي» و«بارك», and each button calls its own action',
      (tester) async {
        var reminded = 0;
        var rsvpd = 0;
        var messaged = 0;

        await tester.pumpWidget(wrapCard(EventCard(
          event: Event.fromJson(actingEventJson()),
          onTap: () {},
          onRemindTap: () => reminded++,
          onRsvpTap: () => rsvpd++,
          onMessagesTap: () => messaged++,
        )));

        expect(find.text('ذكّرني'), findsOneWidget, reason: '«ذكّرني ♥» هو المسار القائم');
        expect(find.text('جاي'), findsOneWidget, reason: '«جاي ✓» على نوع يفتح تأكيد الحضور');
        expect(find.text('بارك'), findsOneWidget, reason: 'فعل الرسالة على الفرح');
        // لغة المواصفة للعزاء («عزّي») لا تظهر على عرس، ولا تسمية القسم الطويلة.
        expect(find.text('عزّي'), findsNothing);
        expect(find.text('تبريكات'), findsNothing);

        await tester.tap(find.text('ذكّرني'));
        await tester.tap(find.text('جاي'));
        await tester.tap(find.text('بارك'));
        await tester.pump();

        expect(reminded, 1, reason: '«ذكّرني» يمرّ بمساره القائم، والكرت لا يعرف النداء نفسه');
        expect(rsvpd, 1, reason: '«جاي» فعل مستقل عن ورقة التبريكات');
        expect(messaged, 1, reason: '«بارك» يفتح ورقة «اختر رسالة» لا غيرها');
      },
    );

    for (final outcome in ['الأيقونة ممتلئة', 'مهتمين يزيد واحداً']) {
      testWidgets('«جاي» من التغذية: $outcome بعد الردّ وPUT واحد (#170)', (tester) async {
        SharedPreferences.setMockInitialValues({});
        final reply = Completer<http.Response>();
        final puts = <http.Request>[];
        final row = {
          ...actingEventJson(),
          'followers_count': 20,
          'is_reminded': false,
          'my_rsvp': {'response': 'no', 'party_size': 1, 'source': 'account'},
        };
        final client = MockClient((request) async {
          final path = request.url.path;
          if (path == '/api/events/611/rsvp' && request.method == 'PUT') {
            puts.add(request);
            return reply.future;
          }
          Object body = {'success': true};
          if (path == '/api/events') {
            body = {
              'success': true,
              'events': [row],
              'pagination': {'page': 1, 'totalPages': 1, 'total': 1, 'limit': 30},
              'announcements': [],
            };
          } else if (path == '/api/events/611') {
            fail('الكرت يقرأ الحالة من PUT نفسه بلا GET يزيد المشاهدات');
          }
          return http.Response(jsonEncode(body), 200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        });
        final api = NegevApi(ApiClient(client: client));
        final auth = AuthStore(api);
        await auth.applySession('test-token', const AppUser(
          id: 7, phoneNumber: '0500000000', fullName: 'مستخدم اختبار', role: 'user',
        ));
        final services = AppServices(
          api: api,
          auth: auth,
          realtime: RealtimeService(),
          child: MaterialApp(theme: AppTheme.light(), home: const EventsScreen()),
        );
        var savedSignals = 0;
        services.savedChange.addListener(() => savedSignals++);
        await tester.pumpWidget(services);
        await tester.pumpAndSettle();
        Event cardEvent() => tester.widget<EventCard>(find.byType(EventCard)).event;
        expect(cardEvent().followersCount, 20);
        expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
        expect(find.byIcon(Icons.check_circle), findsNothing);

        await tester.tap(find.text('جاي'));
        await tester.pump();
        expect(puts, hasLength(1));
        expect(find.byIcon(Icons.check_circle), findsNothing, reason: 'لا اختيار قبل نجاح الردّ');
        expect(cardEvent().followersCount, 20);
        row['followers_count'] = 21;
        row['is_reminded'] = true;
        row['my_rsvp'] = {'response': 'yes', 'party_size': 1, 'source': 'account'};
        reply.complete(http.Response(jsonEncode({
          'success': true, 'my_rsvp': row['my_rsvp'], 'rsvp_going_count': 1,
          'is_reminded': true, 'followers_count': 21, 'interested_count': 21,
        }), 200, headers: {'content-type': 'application/json; charset=utf-8'}));
        await tester.pumpAndSettle();

        // تأكيدان مستقلّان ليظهر فشل كلّ مانع على الرأس القديم، لا يحجب أحدهما الآخر.
        if (outcome == 'الأيقونة ممتلئة') {
          expect(find.byIcon(Icons.check_circle), findsOneWidget,
              reason: 'myRsvp من الردّ يملأ أيقونة «جاي»');
        } else {
          expect(cardEvent().followersCount, 21,
              reason: 'عدّاد «مهتمين» من الخادم، لا زيادة المستمع ثم زيادة محلية ثانية');
        }
        expect(cardEvent().myRsvp?.isGoing, isTrue);
        expect(cardEvent().myRsvp?.partySize, 1);
        expect(cardEvent().rsvpGoingCount, 1);
        expect(cardEvent().isReminded, isTrue);
        expect(cardEvent().followersCount, 21);
        expect(puts, hasLength(1), reason: 'ضغطة الكرت PUT واحد فقط');
        expect(jsonDecode(puts.single.body), {'response': 'yes', 'party_size': 1});
        expect(puts.single.headers['Authorization'], 'Bearer test-token');
        expect(savedSignals, 1, reason: 'إشارة الحفظ تُرسل مرّة واحدة');
      });
    }

    testWidgets(
      'a type with rsvp_enabled off carries no «جاي» — a live handler does not override the switch',
      (tester) async {
        await tester.pumpWidget(wrapCard(EventCard(
          event: Event.fromJson(actingEventJson(rsvpEnabled: false)),
          onTap: () {},
          onRemindTap: () {},
          onRsvpTap: () => fail('a switched-off type must not even offer the action'),
          onMessagesTap: () {},
        )));

        expect(find.text('جاي'), findsNothing, reason: 'نوع بلا rsvp_enabled بلا «جاي»');
        expect(find.text('بارك'), findsOneWidget, reason: 'والتبريك باقٍ — العلَم لا يمسّه');
        expect(find.text('ذكّرني'), findsOneWidget);
      },
    );

    testWidgets(
      'a mourning card carries «عزّي» alone: no «جاي», no «ذكّرني», and no counter chip',
      (tester) async {
        final funeral = Event.fromJson({
          'id': 612,
          'groom_name': 'المرحوم سالم',
          'town': 'رهط',
          'event_date': '2026-12-31',
          'occasion_type': {
            'id': 2,
            'name': 'عزا',
            'icon': '🕊️',
            'color': '#475569',
            'tone': 'solemn',
            'congratulations_label': 'تعازي',
            // العلَم مرفوع عمداً: النغمة وحدها هي ما يمنع الأزرار.
            'rsvp_enabled': true,
            'fields': <Map<String, dynamic>>[],
            'reactions': <String>[],
          },
        });

        var messaged = 0;
        await tester.pumpWidget(wrapCard(EventCard(
          event: funeral,
          onTap: () {},
          onRemindTap: () => fail('no «ذكّرني» on a funeral card'),
          onRsvpTap: () => fail('no «جاي» on a funeral card'),
          onMessagesTap: () => messaged++,
        )));

        expect(find.text('عزّي'), findsOneWidget);
        expect(find.text('بارك'), findsNothing);
        expect(find.text('جاي'), findsNothing);
        expect(find.text('ذكّرني'), findsNothing);
        expect(find.text('غداً'), findsNothing, reason: 'العزاء لا عدّادات');

        await tester.tap(find.text('عزّي'));
        expect(messaged, 1);
      },
    );

    test('the countdown counts days in Jerusalem time, not in the device zone', () {
      // 2026-11-05 22:30 UTC = 00:30 من ٦ نوفمبر في القدس (‏UTC+2 شتاءً).
      final now = DateTime.utc(2026, 11, 5, 22, 30);
      expect(
        countdownDaysToEvent('2026-11-06', now: now),
        0,
        reason: 'اليوم في القدس هو السادس — لا الغد',
      );
      expect(countdownDaysToEvent('2026-11-07', now: now), 1, reason: 'غداً في القدس');
      expect(countdownDaysToEvent('2026-11-05', now: now), -1, reason: 'أمس في القدس');
      expect(countdownDaysToEvent('ليس تاريخاً', now: now), isNull);
    });

    testWidgets('«غداً» is the only red capsule: tomorrow is red, today is not', (tester) async {
      Map<String, dynamic> onDay(DateTime day) {
        final key = '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
        return {...actingEventJson(), 'id': 620 + day.day, 'event_date': key};
      }

      // «الغد» بتوقيت القدس — نفس القاعدة التي يطبّقها الكرت.
      final today = jerusalemToday();
      final tomorrow = DateTime(today.year, today.month, today.day + 1);

      await tester.pumpWidget(wrapCard(EventCard(
        event: Event.fromJson(onDay(tomorrow)),
        onTap: () {},
      )));
      final tomorrowChip = tester.widget<Text>(find.text('غداً'));
      expect(
        tomorrowChip.style?.color,
        NegevPalette.light.danger,
        reason: 'كبسولة «غداً» حمراء وحدها',
      );

      await tester.pumpWidget(wrapCard(EventCard(
        event: Event.fromJson(onDay(today)),
        onTap: () {},
      )));
      expect(find.text('اليوم'), findsOneWidget);
      expect(find.text('غداً'), findsNothing);
      expect(
        tester.widget<Text>(find.text('اليوم')).style?.color,
        NegevPalette.light.success,
        reason: 'شارة اليوم تبقى خضراء — الأحمر للغد وحده',
      );
    });

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

        // القرية «أم بطين» آخر خيار في القائمة (بعد البلدات والمحافظة) فقد تحتاج
        // تمريراً كي تُبنى — القائمة الكسولة لا تبني ما هو خارج نطاق العرض.
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
      'place filter offers a town only the server knows and the region, and the region reaches the request',
      (tester) async {
        final requests = <Uri>[];
        final api = feedScreenApi(requests: requests);
        await pumpFeedScreen(tester, api);

        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('كل الأماكن'));
        await tester.pumpAndSettle();

        // «بلدة جديدة» ليست في `AppConfig.towns` — وصلت من GET /api/towns وحده.
        expect(find.text('بلدة جديدة'), findsOneWidget);
        await tester.dragUntilVisible(
          find.text('النقب (بلا بلدة محدّدة)'),
          find.byType(ListView).first,
          const Offset(0, -80),
        );
        await tester.tap(find.text('النقب (بلا بلدة محدّدة)'));
        await tester.tap(find.text('تطبيق'));
        await tester.pumpAndSettle();

        final last = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(last.queryParameters['town'], 'النقب');
      },
    );

    testWidgets(
      'the card headline is the type and the honoree, the photo carries no text, and «التفاصيل» opens the event',
      (tester) async {
        // الحالة التي أبلغ عنها المالك: عنوان حرّ هو اسم البلدة وحده («اللد»)
        // واسم العريس غائب عن الكرت كلّه.
        final event = Event.fromJson({
          'id': 501,
          'title': 'اللد',
          'groom_name': '',
          'family_clan': 'ابو صيام',
          'town': 'القرى والتجمعات',
          'village_id': 7,
          'village_name': 'اللد',
          'location_name': 'قاعة رويال بالاس',
          'event_date': '2026-10-02',
          'dinner_time': '17:00',
          'honorees': [
            {'name': 'معاذ انور النباري', 'position': 0},
          ],
          'occasion_type': {
            'id': 1,
            'name': 'عرس',
            'icon': '💍',
            'color': '#b8860b',
            'tone': 'festive',
            'fields': [
              {'field_key': 'dinner_time', 'label': 'موعد العشاء', 'is_visible': true, 'is_required': false, 'position': 1},
            ],
            'reactions': <String>[],
          },
        });
        expect(event.cardHeadline, 'عرس معاذ انور النباري');
        // «اللد» اسم القرية — في سطر المكان أصلاً، فلا يتكرّر عنواناً فرعياً.
        expect(event.cardSubtitle, isNull);

        var opened = 0;
        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: event, onTap: () => opened++)),
            ),
          ),
        );

        expect(find.text('عرس معاذ انور النباري'), findsOneWidget);
        expect(find.text('اللد'), findsNothing);
        // سطر لكل معلومة، لا سطر واحد محشور بالفواصل.
        expect(find.textContaining('الجمعة، ٢ أكتوبر ٢٠٢٦'), findsOneWidget);
        expect(find.text('17:00'), findsOneWidget);
        expect(find.text('القرى والتجمعات (اللد) — قاعة رويال بالاس'), findsOneWidget);
        expect(find.text('ابو صيام'), findsOneWidget);
        // لا نصّ فوق الصورة: لوح المعلومات شقيق تحت صندوق الوسائط.
        expect(
          find.descendant(of: find.byType(CardMedia), matching: find.byType(Text)),
          findsNothing,
        );

        await tester.tap(find.text('التفاصيل'));
        expect(opened, 1);
      },
    );

    test('a free title that adds something shows under the headline; one repeating the honoree does not', () {
      Event build(String title) => Event.fromJson({
            'id': 1,
            'title': title,
            'town': 'رهط',
            'honorees': [
              {'name': 'سالم', 'position': 0},
              {'name': 'علي', 'position': 1},
            ],
            'occasion_type': {'id': 1, 'name': 'عرس', 'fields': <Map<String, dynamic>>[], 'reactions': <String>[]},
          });
      expect(build('').cardHeadline, 'عرس سالم و علي');
      expect(build('أفراح آل فلان — زفاف العريس سالم').cardSubtitle, isNull);
      // المستورَد بلا اسم الأب يبقى تكراراً للاسم نفسه.
      expect(
        Event.fromJson({
          'id': 3,
          'title': 'زفاف العريس سلمان أبو عصا',
          'town': 'رهط',
          'honorees': [
            {'name': 'سلمان جمعة أبو عصا'},
          ],
        }).cardSubtitle,
        isNull,
      );
      expect(build('ليلة الحنّاء الكبرى').cardSubtitle, 'ليلة الحنّاء الكبرى');
      // صفّ قديم بلا honorees: `groom_name` يكفي للعنوان.
      final legacy = Event.fromJson({'id': 2, 'title': 'x', 'groom_name': 'حمد', 'town': 'رهط'});
      expect(legacy.cardHeadline, 'حمد');
    });

    testWidgets(
      'returning from an opened event keeps the feed on the same card, not the first',
      (tester) async {
        Map<String, dynamic> row(int id, String day) => {
              'id': id,
              'title': 'مناسبة $id',
              'groom_name': 'اسم $id',
              'town': 'رهط',
              'event_date': day,
            };
        final api = feedScreenApi(
          eventsBody: {
            'success': true,
            'events': [row(401, '2026-09-20'), row(402, '2026-09-21'), row(403, '2026-09-22')],
            'pagination': {'page': 1, 'limit': 30, 'total': 3, 'totalPages': 1},
            'announcements': <Map<String, dynamic>>[],
          },
        );

        // `AppServices` فوق `MaterialApp` كما في `main.dart` — لا تحته كما في
        // `pumpFeedScreen`: شاشة التفاصيل المدفوعة تحتاجه من خارج مسار التغذية.
        await tester.pumpWidget(
          AppServices(
            api: api,
            auth: AuthStore(api),
            realtime: RealtimeService(),
            child: MaterialApp(
              theme: AppTheme.light(),
              home: const Directionality(
                textDirection: TextDirection.rtl,
                child: EventsScreen(),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final pageView = tester.widget<PageView>(find.byType(PageView));
        pageView.controller!.jumpToPage(2);
        await tester.pumpAndSettle();
        expect(pageView.controller!.page, 2);

        // فتح المناسبة من الكرت الثالث ثم الرجوع — المسار نفسه الذي كان يعيد
        // المستخدم إلى أوّل كرت (`_loadFirstPage` ← `jumpToPage(0)`).
        await tester.tap(find.byType(CardMedia).last);
        await tester.pumpAndSettle();
        tester.state<NavigatorState>(find.byType(Navigator).first).pop();
        await tester.pumpAndSettle();

        expect(pageView.controller!.page, 2);
      },
    );

    test('date filter ranges: today, tomorrow, the week to Saturday, and the coming Thursday–Saturday', () {
      String range(String key, DateTime now) {
        final f = FeedDateFilter.preset(key, now);
        return '${f.fromParam}..${f.toParam}';
      }

      final wednesday = DateTime(2026, 9, 30, 21, 15);
      expect(range('today', wednesday), '2026-09-30..2026-09-30');
      expect(range('tomorrow', wednesday), '2026-10-01..2026-10-01');
      expect(range('week', wednesday), '2026-09-30..2026-10-03');
      expect(range('weekend', wednesday), '2026-10-01..2026-10-03');

      // داخل الخميس–السبت: من اليوم نفسه لا من الخميس الماضي ولا القادم.
      expect(range('weekend', DateTime(2026, 10, 2)), '2026-10-02..2026-10-03');
      expect(range('week', DateTime(2026, 10, 3)), '2026-10-03..2026-10-03');
      // الأحد يفتح أسبوعاً جديداً، وخميسه بعد أربعة أيام.
      expect(range('week', DateTime(2026, 10, 4)), '2026-10-04..2026-10-10');
      expect(range('weekend', DateTime(2026, 10, 4)), '2026-10-08..2026-10-10');
      // آخر الشهر لا يكسر الحساب.
      expect(range('tomorrow', DateTime(2026, 12, 31)), '2027-01-01..2027-01-01');

      final picked = FeedDateFilter.day(DateTime(2026, 10, 2, 13));
      expect('${picked.fromParam}..${picked.toParam}', '2026-10-02..2026-10-02');
      expect(picked.label, 'الجمعة، ٢ أكتوبر ٢٠٢٦');
    });

    testWidgets(
      'picking «اليوم» in the date chip sends date_from and date_to for today, and «مسح الفلاتر» drops them',
      (tester) async {
        final requests = <Uri>[];
        final api = feedScreenApi(requests: requests);
        await pumpFeedScreen(tester, api);
        await tester.pumpAndSettle();

        await tester.tap(find.text('الفلاتر والبحث'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('كل التواريخ'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('اليوم'));
        await tester.pumpAndSettle();

        final today = FeedDateFilter.preset('today', DateTime.now());
        final withDate = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(withDate.queryParameters['date_from'], today.fromParam);
        expect(withDate.queryParameters['date_to'], today.toParam);
        // الرقاقة تحمل الاختيار لا «كل التواريخ».
        expect(find.text('كل التواريخ'), findsNothing);

        await tester.tap(find.text('مسح الفلاتر'));
        await tester.pumpAndSettle();
        final cleared = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(cleared.queryParameters.containsKey('date_from'), isFalse);
        expect(cleared.queryParameters.containsKey('date_to'), isFalse);
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
  group('جرس الإشعارات — مفتاح «إشعارات المناسبات الجديدة»', () {
    testWidgets(
      'المفتاح يُحمَّل من GET preferences عند فتح الورقة، والتبديل يرسل PATCH '
      'بقيمة منطقية',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        final patches = <Object?>[];
        final client = MockClient((request) async {
          final path = request.url.path;
          Object body = {'success': true};
          if (path.endsWith('/api/auth/login')) {
            body = {
              'success': true,
              'token': 'test-token',
              'user': {
                'id': 1,
                'phone_number': '0500000000',
                'full_name': 'مستخدم اختبار',
                'role': 'user',
              },
            };
          } else if (path.endsWith('/api/notifications/preferences')) {
            if (request.method == 'PATCH') {
              final sent = jsonDecode(request.body) as Map<String, dynamic>;
              patches.add(sent['notify_new_events']);
              body = {'success': true, 'preferences': sent};
            } else {
              body = {
                'success': true,
                'preferences': {'notify_new_events': true},
              };
            }
          } else if (path.endsWith('/api/notifications')) {
            body = {'success': true, 'notifications': <Map<String, dynamic>>[]};
          } else if (path.endsWith('/api/events')) {
            body = {
              'success': true,
              'events': <Map<String, dynamic>>[],
              'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
              'announcements': <Map<String, dynamic>>[],
            };
          } else if (path.endsWith('/api/stories')) {
            body = {'success': true, 'stories': <Map<String, dynamic>>[]};
          } else if (path.endsWith('/api/occasion-types')) {
            body = {'success': true, 'types': <Map<String, dynamic>>[]};
          }
          return http.Response(
            jsonEncode(body),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final api = NegevApi(ApiClient(client: client));
        final auth = AuthStore(api);
        await tester.runAsync(() => auth.signIn('0500000000', '1234'));

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: AppServices(
                api: api,
                auth: auth,
                realtime: RealtimeService(),
                child: const EventsScreen(),
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        await tester.tap(find.byTooltip('الإشعارات'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        final toggle = find.widgetWithText(SwitchListTile, 'إشعارات المناسبات الجديدة');
        expect(toggle, findsOneWidget);
        expect(tester.widget<SwitchListTile>(toggle).value, isTrue);

        await tester.tap(toggle);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        expect(patches, [false]);
        expect(tester.widget<SwitchListTile>(toggle).value, isFalse);
      },
    );
  });

  group('جرس الإشعارات — مقروء وغير مقروء', () {
    /// يفتح ورقة الإشعارات على إشعارَين غير مقروءَين بلا مناسبة (فالنقر لا يفتح
    /// شاشة أخرى)، ويسجّل كل نداء كتابة يصل الخادم.
    Future<List<String>> openSheet(WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final writes = <String>[];
      final client = MockClient((request) async {
        final path = request.url.path;
        if (request.method != 'GET') writes.add('${request.method} $path');
        Object body = {'success': true};
        if (path.endsWith('/api/auth/login')) {
          body = {
            'success': true,
            'token': 'test-token',
            'user': {
              'id': 1,
              'phone_number': '0500000000',
              'full_name': 'مستخدم اختبار',
              'role': 'user',
            },
          };
        } else if (path.endsWith('/api/notifications/preferences')) {
          body = {
            'success': true,
            'preferences': {'notify_new_events': true},
          };
        } else if (path.endsWith('/api/notifications')) {
          body = {
            'success': true,
            'notifications': [
              {'id': 11, 'type': 'event_new_digest', 'title': 'مناسبات جديدة اليوم', 'body': 'نص أول', 'is_read': 0, 'event_id': null},
              {'id': 12, 'type': 'event_new_digest', 'title': 'ملخص آخر', 'body': 'نص ثانٍ', 'is_read': 0, 'event_id': null},
            ],
          };
        } else if (path.endsWith('/api/events')) {
          body = {
            'success': true,
            'events': <Map<String, dynamic>>[],
            'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
            'announcements': <Map<String, dynamic>>[],
          };
        } else if (path.endsWith('/api/stories')) {
          body = {'success': true, 'stories': <Map<String, dynamic>>[]};
        } else if (path.endsWith('/api/occasion-types')) {
          body = {'success': true, 'types': <Map<String, dynamic>>[]};
        }
        return http.Response(
          jsonEncode(body),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final api = NegevApi(ApiClient(client: client));
      final auth = AuthStore(api);
      await tester.runAsync(() => auth.signIn('0500000000', '1234'));
      writes.clear();

      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: AppServices(
              api: api,
              auth: auth,
              realtime: RealtimeService(),
              child: const EventsScreen(),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      await tester.tap(find.byTooltip('الإشعارات'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      return writes;
    }

    testWidgets(
      '«جعل الكل مقروء» يرسل read-all وحده، فتبقى الإشعارات وتختفي النقاط الحمراء',
      (tester) async {
        final writes = await openSheet(tester);
        expect(find.byKey(const ValueKey('notif_unread_dot')), findsNWidgets(2));

        await tester.tap(find.text('جعل الكل مقروء'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        expect(writes, ['POST /api/notifications/read-all']);
        expect(find.byKey(const ValueKey('notif_unread_dot')), findsNothing);
        expect(find.text('مناسبات جديدة اليوم'), findsOneWidget, reason: 'لا شيء يُحذف');
        expect(find.text('ملخص آخر'), findsOneWidget);
        expect(find.text('جعل الكل مقروء'), findsNothing, reason: 'لا غير مقروء بعد الآن');
        expect(find.text('مسح الكل'), findsOneWidget, reason: '«مسح الكل» يبقى بجانبه');
      },
    );

    testWidgets(
      'النقر على إشعار يعلّمه مقروءاً بـ PATCH ولا يحذفه',
      (tester) async {
        final writes = await openSheet(tester);

        await tester.tap(find.text('مناسبات جديدة اليوم'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        expect(writes, ['PATCH /api/notifications/11/read']);

        await tester.tap(find.byTooltip('الإشعارات'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        expect(find.text('مناسبات جديدة اليوم'), findsOneWidget, reason: 'المقروء يبقى في القائمة');
        expect(find.byKey(const ValueKey('notif_unread_dot')), findsOneWidget, reason: 'نقطة الآخر وحده');
      },
    );

  });

  group('مدخل الألبومات (تذكرة #101)', () {
    testWidgets(
      'ظاهر بنصّه في أول إطار، ونقرة واحدة تفتح البحث',
      (tester) async {
        await pumpFeedScreen(tester, feedScreenApi());

        // النصّ داخل الكبسة نفسها، قبل أي تنقّل — وإلّا لمرّ التأكيد على عنوان
        // شاشة الألبومات بعد الدفع، ولبقيت الكبسة أيقونةً صامتة بلا أن يسقط شيء.
        final chip = find.byKey(const Key('albums_entry_chip'));
        expect(chip, findsOneWidget, reason: 'المدخل يُرى بلا فتح الكروم (القرار D11)');
        expect(
          find.descendant(of: chip, matching: find.text('ألبومات الأعراس')),
          findsOneWidget,
          reason: 'مكتوبٌ باسمه، لا أيقونةً صامتة',
        );

        await tester.tap(chip);
        await tester.pumpAndSettle();

        expect(find.text('ألبومات الأعراس'), findsOneWidget, reason: 'نقرة واحدة تفتح الشاشة');
        // الشرط الأخير صار «صورة معتمدة أو فيديو معتمد» — ألبومٌ فيه فيديو
        // وحده يظهر الآن، فعدُّ «خمسة» صار كذباً ووُصف الشرط بنصّه.
        expect(
          find.textContaining('صورة معتمدة أو فيديو معتمد'),
          findsOneWidget,
          reason: 'الحالة الفارغة تسمّي الشروط، لا «لا ألبومات» وحدها',
        );
        expect(find.text('تصفّح المناسبات'), findsOneWidget, reason: 'ولها مخرج');
      },
    );
  });

  group('مفتاح «المناسبات المنتهية» — رأس التغذية لا لوح الفلاتر', () {
    testWidgets(
      'ظاهر بنصّه في أول إطار، ويطلب archive=1 ثم يعود بلا archive',
      (tester) async {
        final requests = <Uri>[];
        final api = feedScreenApi(requests: requests);
        await pumpFeedScreen(tester, api);

        // أول إطار فعلاً: قبل `pumpAndSettle` وقبل أي فتح للوح.
        final chip = find.byKey(const Key('archive_toggle_chip'));
        expect(chip, findsOneWidget, reason: 'خارج اللوح، يُرى بلا فتح الفلاتر');
        expect(
          find.descendant(of: chip, matching: find.text('المناسبات المنتهية')),
          findsOneWidget,
          reason: 'مكتوبٌ باسمه لا أيقونةً صامتة',
        );
        expect(find.text('المناسبات المنتهية'), findsOneWidget, reason: 'الرأس وحده يسمّي الوضع');
        expect(
          find.descendant(of: chip, matching: find.byIcon(Icons.archive_outlined)),
          findsOneWidget,
          reason: 'يبدأ غير مفعّل',
        );

        await tester.pumpAndSettle();
        int eventRequests() => requests.where((u) => u.path.endsWith('/api/events')).length;
        final before = eventRequests();
        final idleColor = tester.widget<Material>(chip).color;

        await tester.tap(chip);
        await tester.pumpAndSettle();

        expect(eventRequests(), before + 1, reason: 'نقرة واحدة = طلب واحد');
        final withArchive = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(withArchive.queryParameters['archive'], '1', reason: 'الوضع يمرّ في الاستعلام');
        expect(
          tester.widget<Material>(chip).color,
          isNot(idleColor),
          reason: 'المفعّل يبدّل لونه، لا الأيقونة وحدها',
        );
        expect(
          find.descendant(of: chip, matching: find.byIcon(Icons.check)),
          findsOneWidget,
          reason: 'وعلامة صحّ تجعله بيّناً بنظرة',
        );
        expect(
          find.descendant(of: chip, matching: find.byIcon(Icons.archive_outlined)),
          findsNothing,
        );
        expect(
          find.text('الفلاتر والبحث'),
          findsOneWidget,
          reason: 'لم يعد الوضع فلتراً يُسمّى في كبسة الفلاتر',
        );

        await tester.tap(chip);
        await tester.pumpAndSettle();

        final cleared = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(cleared.queryParameters.containsKey('archive'), isFalse);
        expect(tester.widget<Material>(chip).color, idleColor, reason: 'عاد إلى هيئته');
        expect(
          find.descendant(of: chip, matching: find.byIcon(Icons.archive_outlined)),
          findsOneWidget,
        );
      },
    );

    testWidgets('لوح الفلاتر أُفرغ من مفتاح الأرشيف', (tester) async {
      await pumpFeedScreen(tester, feedScreenApi());
      await tester.pumpAndSettle();

      await tester.tap(find.text('الفلاتر والبحث'));
      await tester.pumpAndSettle();

      expect(find.text('عرض المناسبات المنتهية'), findsNothing, reason: 'السطر أُزيل من اللوح');
      expect(find.byType(Switch), findsNothing, reason: 'ولا مفتاح ثانٍ يبدّل الوضع');
      expect(find.text('المناسبات المنتهية'), findsNothing, reason: 'الرأس وحده يسمّيه');
    });

    testWidgets('على شاشة ٣٢٠dp يُرسم الرأس بلا فيض', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await pumpFeedScreen(tester, feedScreenApi());
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull, reason: 'Wrap يلفّ الصفّ بدل أن يفيض');
      expect(find.byKey(const Key('archive_toggle_chip')), findsOneWidget);
      expect(find.byKey(const Key('albums_entry_chip')), findsOneWidget);
    });
  });

  group('تقدّم القائمة عند البحث والفلترة', () {
    Map<String, dynamic> feedBody(List<Map<String, dynamic>> events) => {
          'success': true,
          'events': events,
          'pagination': {'page': 1, 'limit': 30, 'total': events.length, 'totalPages': 1},
          'announcements': <Map<String, dynamic>>[],
        };

    Map<String, dynamic> row(int id, String day) => {
          'id': id,
          'title': 'مناسبة $id',
          'groom_name': 'اسم $id',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'event_date': day,
        };

    testWidgets('البحث بالنص نفسه بعد trim لا يعيد جلب الصفحة الأولى', (tester) async {
      final requests = <Uri>[];
      final api = feedScreenApi(requests: requests);
      await pumpFeedScreen(tester, api);
      await tester.pumpAndSettle();

      await tester.tap(find.text('الفلاتر والبحث'));
      await tester.pumpAndSettle();

      int eventRequests() =>
          requests.where((u) => u.path.endsWith('/api/events')).length;
      final before = eventRequests();

      await tester.enterText(find.byType(TextField), 'رهط');
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pump();
      expect(eventRequests(), before + 1, reason: 'نصّ جديد يُجلب مرّة واحدة');
      final applied = eventRequests();

      // مسافة زائدة تُطبَّع بـtrim، فلا يُغيّر النصَّ المطبَّق ولا يجلب.
      await tester.enterText(find.byType(TextField), ' رهط ');
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pump();
      expect(eventRequests(), applied, reason: 'نفس النصّ لا يستدعي طلباً');
      expect(
        requests.lastWhere((u) => u.path.endsWith('/api/events')).queryParameters['search'],
        'رهط',
        reason: 'المُطبَّق هو النصّ المقصوص',
      );
    });

    testWidgets('تغيير فلتر يعرض «رجوع لنتائجك السابقة» ويعيد الكروت والموضع بلا طلب', (tester) async {
      final requests = <Uri>[];
      final all = [row(401, '2026-09-20'), row(402, '2026-09-21'), row(403, '2026-09-22')];
      final onlyTown = [row(402, '2026-09-21')];
      final api = feedScreenApi(
        requests: requests,
        eventsBodyFor: (url) =>
            url.queryParameters['town'] == 'رهط' ? feedBody(onlyTown) : feedBody(all),
      );
      await pumpFeedScreen(tester, api);
      await tester.pumpAndSettle();

      final pageView = tester.widget<PageView>(find.byType(PageView));
      pageView.controller!.jumpToPage(2);
      await tester.pumpAndSettle();
      expect(pageView.controller!.page, 2);

      final before = requests.where((u) => u.path.endsWith('/api/events')).length;

      // فلتر المكان: «كل الأماكن» ← «رهط». الخيار في ورقة الفلتر وحده (بلدة
      // الكرت في التغذية تحمل النصّ نفسه).
      await tester.tap(find.text('الفلاتر والبحث'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('كل الأماكن'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(CheckboxListTile, 'رهط'));
      await tester.tap(find.text('تطبيق'));
      await tester.pumpAndSettle();

      // نتائج الفلتر الجديد (كرت واحد) ورسالة الرجوع بعد وصولها.
      expect(find.text('↩ رجوع لنتائجك السابقة'), findsOneWidget);
      expect(
        tester.widget<PageView>(find.byType(PageView)).childrenDelegate.estimatedChildCount,
        1,
      );

      await tester.tap(find.text('↩ رجوع لنتائجك السابقة'));
      await tester.pumpAndSettle();

      final after = requests.where((u) => u.path.endsWith('/api/events')).length;
      expect(after, before + 1, reason: 'طلب الفلتر وحده، والرجوع بلا أي شبكة');
      expect(
        tester.widget<PageView>(find.byType(PageView)).childrenDelegate.estimatedChildCount,
        3,
        reason: 'كروت ما قبل التغيير عادت',
      );
      expect(
        tester.widget<PageView>(find.byType(PageView)).controller!.page,
        2,
        reason: 'الموضع الذي كان عليه القارئ يعود معها',
      );
    });
  });

  group('الحالة الفارغة — بابٌ لا جدار (#161)', () {
    testWidgets(
      'تعرض «أضف مناسبتك» وبطاقتَي «خدمات الأعراس في منطقتك» و«ألبومات منطقتك» و«وسّع إلى كل المحافظات»، وكل زرّ يقود إلى وجهته',
      (tester) async {
        final tabRequest = ValueNotifier<int>(-1);
        final api = feedScreenApi();
        await pumpFeedScreen(tester, api, tabRequest: tabRequest);
        await tester.pumpAndSettle();

        expect(find.byKey(const Key('feed_empty_add_event')), findsOneWidget, reason: 'الفعل الأول ظاهر');
        expect(find.text('أضف مناسبتك'), findsOneWidget);
        expect(find.byKey(const Key('feed_empty_services')), findsOneWidget);
        expect(find.text('خدمات الأعراس في منطقتك'), findsOneWidget);
        expect(find.byKey(const Key('feed_empty_albums')), findsOneWidget);
        expect(find.text('ألبومات منطقتك'), findsOneWidget);
        expect(find.byKey(const Key('feed_empty_expand')), findsOneWidget);
        expect(find.text('وسّع إلى كل المحافظات'), findsOneWidget);

        // وجهة الشاشة/التبويب: طلب تبديل تُنفّذه `HomeShell` — لا دفع شاشة ثانية.
        await tester.ensureVisible(find.byKey(const Key('feed_empty_services')));
        await tester.tap(find.byKey(const Key('feed_empty_services')));
        await tester.pump();
        expect(tabRequest.value, AppServices.servicesTabIndex, reason: '«خدمات الأعراس» تبويبُ الدليل القائم');

        // «ألبومات منطقتك» تدفع شاشة الألبومات نفسها التي يفتحها مدخل الألبومات.
        await tester.ensureVisible(find.byKey(const Key('feed_empty_albums')));
        await tester.tap(find.byKey(const Key('feed_empty_albums')));
        await tester.pumpAndSettle();
        expect(find.byType(AlbumsScreen), findsOneWidget, reason: 'البطاقة تفتح شاشة الألبومات');
        Navigator.of(tester.element(find.byType(AlbumsScreen))).pop();
        await tester.pumpAndSettle();

        // «أضف مناسبتك» شاشة النشر نفسها التي يفتحها زرّ الرأس.
        await tester.ensureVisible(find.byKey(const Key('feed_empty_add_event')));
        await tester.tap(find.byKey(const Key('feed_empty_add_event')));
        await tester.pumpAndSettle();
        expect(find.byType(AddEventScreen), findsOneWidget, reason: 'الزرّ يفتح شاشة النشر');
      },
    );

    testWidgets(
      '«وسّع إلى كل المحافظات» يجلب بالعلَم all_regions=1 ويترك ترويسة المحافظة المشتركة كما هي',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          RegionStore.storageKey: '2',
          // ورقة أول تشغيل سُئلت من قبل — وإلا غطّت الحالة الفارغة عند الإقلاع.
          regionOnboardedKey: true,
          // وشاشة الترحيب (#163) سبقت أيضاً، فلا تكون هي ما يغطي الحالة الفارغة.
          welcomeSeenKey: true,
        });
        final requests = <Uri>[];
        final api = feedScreenApi(requests: requests);
        final services = AppServices(
          api: api,
          auth: AuthStore(api),
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: HomeShell(),
            ),
          ),
        );
        // الإقلاع نفسه يقرأ التفضيل المحفوظ قبل أول طلب، كما في `main.dart`.
        await services.regions.restore();
        await tester.pumpWidget(services);
        await tester.pump();
        for (var i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }

        int eventRequests() =>
            requests.where((u) => u.path.endsWith('/api/events')).length;
        expect(api.client.regionId, '2', reason: 'المحافظة المحفوظة هي ما يُرسَل فعلاً قبل التوسيع');
        expect(
          requests.lastWhere((u) => u.path.endsWith('/api/events')).queryParameters.containsKey('all_regions'),
          isFalse,
          reason: 'الافتراضي بلا علَم: الجلب الأول يعود إلى المحافظة وحدها',
        );
        final before = eventRequests();

        // يُستدعى `onPressed` مباشرةً: الزرّ آخر عنصر في الحالة الفارغة، وقد
        // يقع مركزه تحت شريط التنقّل السفلي في نافذة الاختبار القصيرة
        // (النقرة الحقيقية عندها على الشريط لا عليه). المقيس هو وجهة الزرّ
        // نفسها، وهي دالة واحدة لا تعرف موضعه.
        tester.widget<TextButton>(find.byKey(const Key('feed_empty_expand'))).onPressed!();
        await tester.pump();
        for (var i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }

        expect(eventRequests(), before + 1, reason: 'التوسيع يجلب من جديد بلا انتظار إعادة بناء الهيكل');
        final widened = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(widened.queryParameters['all_regions'], '1', reason: 'الخادم يتجاوز تقييد المحافظة بهذا العلَم');
        expect(api.client.regionId, '2', reason: 'الترويسة المشتركة لا تُمسّ — العلَم للنداء لا للعميل كله');
        expect(services.regions.regionId, 2, reason: 'ولا يُمحى اختيار الجهاز من تغذيةٍ طلبت التوسيع');
      },
    );

    testWidgets(
      'اختيار محافظة بعد التوسيع يُلغي العلَم، فلا يبقى الفلتر معلَّقاً على التغذية الجديدة',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          RegionStore.storageKey: '2',
          regionOnboardedKey: true,
          welcomeSeenKey: true,
        });
        final requests = <Uri>[];
        final api = feedScreenApi(requests: requests);
        final services = AppServices(
          api: api,
          auth: AuthStore(api),
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: HomeShell(),
            ),
          ),
        );
        await services.regions.restore();
        await tester.pumpWidget(services);
        await tester.pump();
        for (var i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }

        tester.widget<TextButton>(find.byKey(const Key('feed_empty_expand'))).onPressed!();
        await tester.pump();
        for (var i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }
        final afterExpand = requests.where((u) => u.path.endsWith('/api/events')).length;
        expect(
          requests.lastWhere((u) => u.path.endsWith('/api/events')).queryParameters['all_regions'],
          '1',
          reason: 'التوسيع فعّل العلَم أولاً',
        );

        // تبديل المحافظة كما يفعله منتقي «حسابي»: ترويسة جديدة، ثم إعادة بناء
        // التغذية بمفتاح المحافظة في `HomeShell`.
        await services.regions.select(3);
        await tester.pump();
        for (var i = 0; i < 10; i++) {
          await tester.pump(const Duration(milliseconds: 300));
          if (requests.where((u) => u.path.endsWith('/api/events')).length > afterExpand) break;
        }

        expect(api.client.regionId, '3', reason: 'الاختيار الجديد هو ما يُرسَل ترويسةً');
        expect(
          requests.where((u) => u.path.endsWith('/api/events')).length,
          greaterThan(afterExpand),
          reason: 'تغيّر مفتاح المحافظة فجُلبت التغذية من جديد',
        );
        final afterSwitch = requests.lastWhere((u) => u.path.endsWith('/api/events'));
        expect(
          afterSwitch.queryParameters.containsKey('all_regions'),
          isFalse,
          reason: 'اختيار محافظة صريح يُلغي «كل المحافظات» — لا يبقى معلَّقاً بعد التبديل',
        );
      },
    );
  });

  group('موضع ظهور الستوري — الكاروسيل والإعلان بين الكروت (#173)', () {
    /// ثماني عشرة مناسبة: بالفاصل ٨ يأتي إعلانٌ بعد الثامنة وآخر بعد السادسة
    /// عشرة، فتصير الكروت ٩ و١٧ في صفحتين مختلفتين عن ترتيبهما في `events` —
    /// وهذا بالضبط ما يكشفه سقوط أي تأكيد على رقم الصفحة. وبفاصل ٥ يقع
    /// الإعلانان بعد الخامسة والعاشرة، فيكشفان ثابتاً داخلياً عاد إلى ٨.
    Map<String, dynamic> eventsBody18() => {
          'success': true,
          'events': List<Map<String, dynamic>>.generate(18, (index) {
            final ordinal = index + 1;
            return {
              'id': 300 + ordinal,
              'title': 'مناسبة رقم $ordinal',
              'groom_name': 'صاحب $ordinal',
              'family_clan': 'آل فلان',
              'town': 'رهط',
              'location_name': 'قاعة $ordinal',
              'event_date': '2026-12-01',
              'poster_url': null,
              'occasion_type': {
                'id': 1,
                'name': 'عرس',
                'icon': '💍',
                'color': '#0369a1',
                'tone': 'festive',
                'fields': <Map<String, dynamic>>[],
                'reactions': <String>[],
              },
            };
          }),
          'pagination': {'page': 1, 'limit': 30, 'total': 18, 'totalPages': 1},
          'announcements': <Map<String, dynamic>>[],
        };

    /// الردّ الحقيقي كما يبنيه الخادم بعد #173: `placement` لكل ستوري،
    /// و`feed_ad_interval` في الردّ نفسه. [interval] يتيح اختبار فاصل غير ٨
    /// يثبت أن العميل يقرأه من الردّ لا من ثابت داخله.
    Map<String, dynamic> storiesBody({int interval = 8}) => {
          'success': true,
          'feed_ad_interval': interval,
          'stories': [
            {'id': 901, 'title': 'ستوري الشريط', 'placement': 'bar'},
            {
              'id': 902,
              'title': 'بانر الكاروسيل',
              'placement': 'carousel',
              'target_url': 'https://example.com/carousel',
              'cta_label': 'تسوّق',
            },
            {
              'id': 903,
              'title': 'إعلان أول',
              'placement': 'feed',
              'is_ad': true,
              'advertiser_name': 'تاجر أول',
              'target_url': 'https://example.com/ad1',
              'cta_label': 'زيارة',
            },
            {
              'id': 904,
              'title': 'إعلان ثانٍ',
              'placement': 'feed',
              'is_ad': true,
              'advertiser_name': 'تاجر ثانٍ',
              'target_url': 'https://example.com/ad2',
              'cta_label': 'زيارة',
            },
          ],
        };

    Future<void> pumpPlacementFeed(
      WidgetTester tester, {
      required NegevApi api,
    }) async {
      // ٣٦٠×٧٨٠ منطقيّاً: الشريط (٨٢) والكاروسيل (٩٦) يقتطعان من ارتفاع
      // التغذية، فشاشة اختبارٍ أصغر تُنتج فيضاً لا علاقة له بالمواضع.
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      await pumpFeedScreen(tester, api);
      // وصول الستوريات والمناسبات معاً قبل أي قفزة: عدد الصفحات يتغيّر معها.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    /// كرت مناسبة بعينه — بالمعرّف لا بالعنوان، فالعنوان يعرضه الكرت بصياغته.
    Finder cardFor(int id) => find.byWidgetPredicate(
          (widget) => widget is EventCard && widget.event.id == id,
        );

    PageController pagerOf(WidgetTester tester) =>
        tester.widget<PageView>(find.byKey(const Key('feed_pager'))).controller!;

    testWidgets(
      'الشريط bar وحده، والكاروسيل أعلى التغذية، وإعلان بعد الكرت ٨ و١٦ بالتناوب',
      (tester) async {
        final requests = <Uri>[];
        final api = feedScreenApi(
          eventsBody: eventsBody18(),
          storiesBody: storiesBody(),
          requests: requests,
        );
        await pumpPlacementFeed(tester, api: api);

        // 1) الشريط: موضع `bar` وحده — لا بانر كاروسيل ولا إعلان بين الكروت.
        final strip = find.byKey(const Key('stories_strip'));
        expect(
          find.descendant(of: strip, matching: find.text('ستوري الشريط')),
          findsOneWidget,
          reason: 'ستوري موضع bar هي وحدها ما يعرضه الشريط',
        );
        expect(
          find.descendant(of: strip, matching: find.text('بانر الكاروسيل')),
          findsNothing,
          reason: 'ستوري الكاروسيل لا تُكرَّر في الشريط',
        );
        expect(
          find.descendant(of: strip, matching: find.text('إعلان أول')),
          findsNothing,
          reason: 'إعلان «بين الكروت» لا يسكن الشريط',
        );

        // 2) الكاروسيل: بانر الموضع carousel وحده، وأعلى التغذية نفسها.
        final carousel = find.byKey(const Key('story_carousel'));
        expect(carousel, findsOneWidget, reason: 'بانر الكاروسيل يظهر حين تصل ستوريات carousel');
        expect(
          find.descendant(of: carousel, matching: find.text('بانر الكاروسيل')),
          findsOneWidget,
          reason: 'كاروسيل واحد لستوري carousel الواحدة',
        );
        expect(
          find.descendant(of: carousel, matching: find.text('ستوري الشريط')),
          findsNothing,
          reason: 'ستوري الشريط لا تهاجر إلى الكاروسيل',
        );
        expect(
          tester.getTopLeft(carousel).dy,
          lessThan(tester.getTopLeft(find.byKey(const Key('feed_pager'))).dy),
          reason: 'الكاروسيل أعلى التغذية لا داخلها ولا تحتها',
        );

        // 3) الإعلان بعد الثامن: الصفحة ٧ ما زالت الكرت الثامن (رقم ٣٠٨)،
        // والصفحة ٨ إعلان، والصفحة ٩ الكرت التاسع (٣٠٩).
        final controller = pagerOf(tester);

        controller.jumpToPage(7);
        await tester.pumpAndSettle();
        expect(cardFor(308), findsOneWidget, reason: 'الصفحة ٧ ما زالت الكرت الثامن');
        expect(find.byKey(const Key('feed_ad_after_8')), findsNothing, reason: 'لا إعلان قبل الكرت الثامن');
        expect(find.byKey(const Key('feed_ad_after_16')), findsNothing, reason: 'ولا إعلان قبل الكرت الثامن');

        controller.jumpToPage(8);
        await tester.pumpAndSettle();
        expect(
          find.byKey(const Key('feed_ad_after_8')),
          findsOneWidget,
          reason: 'الإعلان الأول يأتي بعد الكرت الثامن مباشرةً — الصفحة ٨',
        );
        expect(find.text('إعلان أول'), findsOneWidget, reason: 'أول ستوري feed هو أول إعلان بالتناوب');
        expect(cardFor(309), findsNothing, reason: 'كرت المناسبة التاسعة بعد الإعلان لا قبله');

        controller.jumpToPage(9);
        await tester.pumpAndSettle();
        expect(cardFor(309), findsOneWidget, reason: 'الكرت التاسع يلي الإعلان مباشرةً');

        // 4) الإعلان بعد السادس عشر، وستوري feed الثاني فيها بالتناوب.
        controller.jumpToPage(16);
        await tester.pumpAndSettle();
        expect(cardFor(316), findsOneWidget, reason: 'الصفحة ١٦ الكرت السادس عشر');

        controller.jumpToPage(17);
        await tester.pumpAndSettle();
        expect(
          find.byKey(const Key('feed_ad_after_16')),
          findsOneWidget,
          reason: 'الإعلان الثاني بعد الكرت السادس عشر',
        );
        expect(find.text('إعلان ثانٍ'), findsOneWidget, reason: 'التناوب: الستوري الثاني هو الإعلان الثاني');

        controller.jumpToPage(18);
        await tester.pumpAndSettle();
        expect(cardFor(317), findsOneWidget, reason: 'الكرت السابع عشر يلي الإعلان الثاني');
      },
    );

    testWidgets(
      'المشاهدة والنقر من الكاروسيل ومن الإعلان بين الكروت: كلٌّ يفتح العارض ويسجّل مشاهدة ونقرة',
      (tester) async {
        final launched = <MethodCall>[];
        const launcherChannel = MethodChannel('plugins.flutter.io/url_launcher');
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(launcherChannel, (call) async {
          launched.add(call);
          return true;
        });
        addTearDown(() {
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
              .setMockMethodCallHandler(launcherChannel, null);
        });

        final requests = <Uri>[];
        final api = feedScreenApi(
          eventsBody: eventsBody18(),
          storiesBody: storiesBody(),
          requests: requests,
        );
        await pumpPlacementFeed(tester, api: api);

        List<Uri> clicksTo(int storyId) =>
            requests.where((uri) => uri.path == '/api/stories/$storyId/click').toList();
        List<Uri> viewsTo(int storyId) =>
            requests.where((uri) => uri.path == '/api/stories/$storyId/view').toList();

        // 1) الكاروسيل: البانر يفتح العارض — وهو من يسجّل المشاهدة بعد ثانيتين.
        await tester.tap(find.byKey(const Key('story_carousel_media_902')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          find.byType(StoryViewerScreen),
          findsOneWidget,
          reason: 'بانر الكاروسيل يفتح العارض — مسار المشاهدة نفسه لا نسخة ثانية',
        );
        // ثانيتا العرض عتبة المشاهدة (`_watchedThresholdMs`) — عبورها هنا هو
        // ما يثبت أن الفتح من الكاروسيل يصل `story_views` لا أنه فتح شكلي.
        await tester.pump(const Duration(milliseconds: 2100));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 10));
        expect(
          viewsTo(902),
          hasLength(1),
          reason: 'المشاهدة من الكاروسيل تُسجَّل بالمسار نفسه بعد ثانيتين',
        );
        Navigator.of(tester.element(find.byType(StoryViewerScreen))).pop();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        // 2) وزرّه يسجّل النقرة ثم يفتح الرابط نفسه.
        await tester.tap(find.byKey(const Key('story_carousel_cta_902')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(clicksTo(902), hasLength(1), reason: 'النقرة من الكاروسيل تصل story_clicks');
        expect(
          launched.where((call) => call.method == 'launch'),
          isNotEmpty,
          reason: 'وزرّ الكاروسيل يفتح الرابط في تطبيق خارجي',
        );

        // 3) الإعلان بين الكروت: الصورة تفتح العارض…
        pagerOf(tester).jumpToPage(8);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('feed_ad_media_903')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          find.byType(StoryViewerScreen),
          findsOneWidget,
          reason: 'صورة الإعلان تفتح العارض — مسار المشاهدة نفسه',
        );
        await tester.pump(const Duration(milliseconds: 2100));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 10));
        expect(
          viewsTo(903),
          hasLength(1),
          reason: 'المشاهدة من بطاقة الإعلان بين الكروت تُسجَّل بالمسار نفسه',
        );
        Navigator.of(tester.element(find.byType(StoryViewerScreen))).pop();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        // 4) …وزرّه يسجّل النقرة من موضعه لا من الشريط.
        await tester.tap(find.byKey(const Key('feed_ad_cta_903')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(clicksTo(903), hasLength(1), reason: 'النقرة من بطاقة الإعلان تصل story_clicks');
      },
    );

    testWidgets(
      'فاصل الخادم: feed_ad_interval 5 يضع أول إعلان بعد الكرت الخامس لا الثامن',
      (tester) async {
        final api = feedScreenApi(
          eventsBody: eventsBody18(),
          storiesBody: storiesBody(interval: 5),
        );
        await pumpPlacementFeed(tester, api: api);

        final controller = pagerOf(tester);

        controller.jumpToPage(4);
        await tester.pumpAndSettle();
        expect(cardFor(305), findsOneWidget, reason: 'الصفحة ٤ ما زالت الكرت الخامس');
        expect(find.byKey(const Key('feed_ad_after_5')), findsNothing,
            reason: 'لا إعلان قبل الكرت الخامس');

        // لو بقي الثابت 8 في العميل لكانت هذه الصفحة الكرت السادس ولا إعلان
        // فيها — فسقوط هذا التأكيد هو ما يثبت أن الفاصل قُرئ من الردّ.
        controller.jumpToPage(5);
        await tester.pumpAndSettle();
        expect(
          find.byKey(const Key('feed_ad_after_5')),
          findsOneWidget,
          reason: 'الفاصل من الخادم: أول إعلان بعد الكرت الخامس حين يقول 5',
        );
        expect(find.text('إعلان أول'), findsOneWidget, reason: 'أول ستوري feed هو أول إعلان');

        controller.jumpToPage(6);
        await tester.pumpAndSettle();
        expect(cardFor(306), findsOneWidget, reason: 'الكرت السادس يلي الإعلان مباشرةً');

        // ولا إعلان بعد الثامن: الصفحة ٨ الكرت الثامن نفسه — تأكيد يسقط لو
        // عاد العميل إلى فاصل 8.
        controller.jumpToPage(8);
        await tester.pumpAndSettle();
        expect(cardFor(308), findsOneWidget, reason: 'الصفحة ٨ الكرت الثامن مع فاصل 5');
        expect(find.byKey(const Key('feed_ad_after_8')), findsNothing,
            reason: 'لا إعلان بعد الكرت الثامن: الفاصل من الخادم 5 لا 8');

        controller.jumpToPage(11);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('feed_ad_after_10')), findsOneWidget,
            reason: 'الإعلان التالي بعد الكرت العاشر — الصفحة ١١ مع فاصل 5');
        expect(find.text('إعلان ثانٍ'), findsOneWidget, reason: 'التناوب بين ستوريات feed مستمر');
      },
    );
  });

  group('«الأكثر تفاعلاً هذا الأسبوع» — الشريط واختفاؤه (تذكرة #177)', () {
    /// الردّ كما يعيده `GET /api/events/trending`: صفوف بشكل كرت التغذية نفسه
    /// (`Event.fromJson` واحد)، فلا شكل ثانٍ في الاختبار ولا في العميل.
    Map<String, dynamic> trendingReply({List<int> ids = const [701, 702, 703]}) => {
          'success': true,
          'window_days': 7,
          'events': [
            for (final id in ids)
              {
                'id': id,
                'title': 'مناسبة الأكثر تفاعلاً $id',
                'groom_name': 'سالم',
                'family_clan': 'آل سالم',
                'town': 'رهط',
                'event_date': '2026-12-0${id - 700}',
              },
          ],
        };

    testWidgets(
      'ثلاث مناسبات في الرد ترسم ثلاثة كروت في الشريط، بترتيب الخادم نفسه',
      (tester) async {
        final api = feedScreenApi(trendingBody: trendingReply());
        await pumpFeedScreen(tester, api);
        await tester.pumpAndSettle();

        expect(find.byKey(const Key('trending_strip')), findsOneWidget,
            reason: 'ردّ فيه مناسبات يظهر الشريط');
        expect(find.text('الأكثر تفاعلاً هذا الأسبوع'), findsOneWidget,
            reason: 'العنوان الذي تسمّيه التذكرة');
        for (final id in [701, 702, 703]) {
          expect(find.byKey(Key('trending_card_$id')), findsOneWidget,
              reason: 'كرت لكل مناسبة في الردّ');
        }

        // الشريط RTL: البطاقة الأولى في الردّ هي أيمن الثلاث — فالموضع الأفقي
        // نفسه هو دليل «بترتيب الخادم»، لا ترتيبٌ يعيد العميل حسابه.
        final x0 = tester.getTopLeft(find.byKey(const Key('trending_card_701'))).dx;
        final x1 = tester.getTopLeft(find.byKey(const Key('trending_card_702'))).dx;
        final x2 = tester.getTopLeft(find.byKey(const Key('trending_card_703'))).dx;
        expect(x0 > x1 && x1 > x2, isTrue,
            reason: 'الترتيب 701 ثم 702 ثم 703 من اليمين إلى اليسار كما وصل');
      },
    );

    testWidgets(
      'ردّ فارغ لا يترك شريطاً: لا Key ولا عنوان ولا مساحة محجوزة',
      (tester) async {
        // الافتراضي في العميل الوهمي: `{success: true, events: []}`.
        final api = feedScreenApi();
        await pumpFeedScreen(tester, api);
        await tester.pumpAndSettle();

        expect(find.byKey(const Key('trending_strip')), findsNothing,
            reason: 'لا نتيجة = القسم غير موجود في الشجرة أصلاً');
        expect(find.text('الأكثر تفاعلاً هذا الأسبوع'), findsNothing,
            reason: 'ولا عنوان بلا بطاقات تحته');
      },
    );

    testWidgets(
      'النقر على كرت في الشريط يفتح صفحة تفاصيل المناسبة',
      (tester) async {
        final api = feedScreenApi(trendingBody: trendingReply(ids: [701]));
        await pumpFeedScreen(tester, api);
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(const Key('trending_card_701')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        expect(find.byType(EventDetailsScreen), findsOneWidget,
            reason: 'الكرت يفتح التفاصيل بالمسار نفسه الذي يفتحه كرت التغذية');
      },
    );
  });
}
