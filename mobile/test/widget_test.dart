import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/models/nokoot.dart';
import 'package:negev_events/models/service.dart';
import 'package:negev_events/screens/add_event_screen.dart';
import 'package:negev_events/screens/edit_event_screen.dart';
import 'package:negev_events/screens/event_details_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/screens/story_viewer_screen.dart';
import 'package:negev_events/state/analytics.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/update_checker.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/event_card.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// عميل وهمي يرد بجسم ثابت — يختبر منطق العميل دون خادم حقيقي.
NegevApi apiReturning(
  Object body, {
  int status = 200,
  void Function(http.Request request)? onRequest,
}) {
  final client = MockClient((request) async {
    onRequest?.call(request);
    return http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

void main() {
  group('تحليل المناسبة', () {
    test('يقرأ الحقول والتفاعلات ويطبّع التاريخ', () {
      final event = Event.fromJson({
        'id': 7,
        'title': 'زفاف العريس محمد',
        'groom_name': 'محمد',
        'family_clan': 'آل أبو صيام',
        'town': 'رهط',
        'location_name': 'قاعة الأفراح',
        'event_date': '2026-09-01T00:00:00.000Z',
        'dinner_time': 'الساعة 8:00 مساءً',
        'poster_url': 'https://api.example.com/uploads/a.jpg',
        'views_count': 12,
        'reactions': {'coffee': 3, 'rose': 2},
      });

      expect(event.id, 7);
      expect(event.town, 'رهط');
      // MySQL قد يرجّع DATE كسلسلة ISO كاملة — نعرض اليوم فقط.
      expect(event.eventDate, '2026-09-01');
      expect(event.reactions['coffee'], 3);
      expect(event.totalReactions, 5);
    });

    test('يتحمّل الحقول الناقصة دون رمي استثناء', () {
      final event = Event.fromJson({'id': '3', 'groom_name': 'سالم'});

      expect(event.id, 3);
      expect(event.posterUrl, isNull);
      expect(event.reactions, isEmpty);
      expect(event.congratulations, isEmpty);
    });
  });

  group('عميل API', () {
    test('يعيد قائمة المناسبات', () async {
      final api = apiReturning({
        'success': true,
        'events': [
          {'id': 1, 'groom_name': 'أحمد', 'town': 'حورة'},
        ],
      });

      final page = await api.listEvents();
      expect(page.events, hasLength(1));
      expect(page.events.first.groomName, 'أحمد');
    });

    test('يمرّر فلتر البلدة ويتجاهل "الكل"، ويرسل page/limit دائماً', () async {
      String? capturedQuery;
      final api = apiReturning(
        {
          'success': true,
          'events': [],
          'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
        },
        onRequest: (request) => capturedQuery = request.url.query,
      );

      await api.listEvents(town: 'الكل');
      expect(capturedQuery, isNot(contains('town=')));
      expect(capturedQuery, contains('page=1'));

      await api.listEvents(town: 'رهط');
      expect(capturedQuery, contains('town='));
    });

    test('يرفع رسالة الخادم العربية كما هي', () async {
      final api = apiReturning(
        {'success': false, 'message': 'البلدة المختارة غير معروفة'},
        status: 400,
      );

      expect(
        () => api.listEvents(),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            'البلدة المختارة غير معروفة',
          ),
        ),
      );
    });

    test('يميّز انتهاء الجلسة', () async {
      final api = apiReturning(
        {'success': false, 'message': 'الجلسة منتهية أو غير صالحة'},
        status: 403,
      );

      try {
        await api.me();
        fail('كان يجب رمي استثناء');
      } on ApiException catch (error) {
        expect(error.isUnauthorized, isTrue);
      }
    });

    test('يرفق رمز الدخول لدفتر النقوط فقط عند وجوده', () async {
      String? authHeader;
      final api = apiReturning(
        {'success': true, 'totalAmount': 0, 'count': 0, 'records': []},
        onRequest: (request) => authHeader = request.headers['Authorization'],
      );

      api.client.token = 'test-token';
      await api.nokoot();
      expect(authHeader, 'Bearer test-token');

      // النداءات العامة لا تحمل الرمز — إرفاقه يغيّر سلوك النشر في الخادم.
      authHeader = null;
      await api.listEvents();
      expect(authHeader, isNull);
    });
  });

  group('مقارنة النسخ', () {
    test('ترتّب النسخ ترتيباً صحيحاً', () {
      expect(compareVersions('1.0.0', '1.0.1'), lessThan(0));
      expect(compareVersions('1.2.0', '1.10.0'), lessThan(0));
      expect(compareVersions('2.0.0', '1.9.9'), greaterThan(0));
      expect(compareVersions('1.0.0', '1.0.0'), 0);
    });

    test('تعامل الأجزاء الناقصة كأصفار', () {
      expect(compareVersions('1.2', '1.2.0'), 0);
      expect(compareVersions('1.2', '1.2.1'), lessThan(0));
      expect(compareVersions('1', '1.0.0'), 0);
    });

    test('تتجاهل لاحقة البناء والوسم', () {
      expect(compareVersions('1.0.0+5', '1.0.0+9'), 0);
      expect(compareVersions('1.0.0-beta', '1.0.0'), 0);
      expect(compareVersions('1.0.0+1', '1.0.1'), lessThan(0));
    });

    test('لا ترمي على مدخل غير متوقع', () {
      expect(compareVersions('', '1.0.0'), lessThan(0));
      expect(compareVersions('abc', '1.0.0'), lessThan(0));
    });
  });

  group('مناسبة من نوع عزا — لا نصّ فرح، شرط إطلاق #20 (issue #11)', () {
    // نوع «عزا»: solemn، بلا تفاعلات، وبلا حقول dinner_time/youth_party_date/audio_url —
    // ونصوص أتت من إعداد النوع، لا من ثابت في العميل.
    final solemnTypeJson = {
      'id': 2,
      'name': 'عزا',
      'icon': '🕯️',
      'color': '#4b5563',
      'position': 2,
      'is_active': true,
      'creates_collision': false,
      'warns_others': true,
      'premoderate_messages': true,
      'show_congratulations_count': true,
      'show_followers_count': false,
      'show_views_count': true,
      'congratulations_label': 'تعازي',
      'default_badge_title': null,
      'default_poster_url': null,
      'legacy_client_supported': false,
      'tone': 'solemn',
      'fields': [
        {
          'field_key': 'honorees',
          'label': 'المتوفَّى',
          'is_visible': true,
          'is_required': true,
          'position': 1,
        },
        {
          'field_key': 'family_clan',
          'label': 'العائلة',
          'is_visible': true,
          'is_required': false,
          'position': 2,
        },
        {
          'field_key': 'location_name',
          'label': 'مكان العزاء',
          'is_visible': true,
          'is_required': true,
          'position': 3,
        },
        {
          'field_key': 'event_date',
          'label': 'تاريخ الوفاة',
          'is_visible': true,
          'is_required': true,
          'position': 4,
        },
      ],
      'reactions': <String>[],
    };

    final solemnEventJson = {
      'id': 9,
      'title': '',
      'groom_name': '',
      'family_clan': 'آل فلان',
      'town': 'رهط',
      'location_name': 'بيت العزاء',
      'event_date': '2026-09-01',
      'dinner_time': '',
      'occasion_type': solemnTypeJson,
      'honorees': [
        {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
      ],
      'congratulations_count': 3,
      'congratulations': <Map<String, dynamic>>[],
    };

    testWidgets('كرت المناسبة لا يعرض عنوان زفاف ولا شريط تفاعلات', (tester) async {
      final event = Event.fromJson(solemnEventJson);

      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: EventCard(event: event, onTap: () {})),
          ),
        ),
      );

      // الضرر المؤكَّد في #11: "زفاف العريس ‹اسم المتوفَّى›" فوق بطاقة عزاء.
      expect(find.textContaining('زفاف العريس'), findsNothing);
      // نوع بلا تفاعلات (عزا) لا يعرض أي شريط تفاعل إطلاقاً.
      expect(find.textContaining('☕'), findsNothing);
      expect(find.textContaining('🐎'), findsNothing);

      // العنوان البديل جاء من النوع وأصحاب المناسبة، لا نص ثابت.
      expect(find.textContaining('سالم أبو فلان'), findsOneWidget);
      expect(find.textContaining('عزا'), findsWidgets);
    });

    testWidgets(
      'تفاصيل مناسبة عزا: كل تسمية من النوع، ولا "شارك فرحتهم" ولا "العريس" ولا "تاريخ العرس"',
      (tester) async {
        final client = MockClient((request) async {
          return http.Response(
            jsonEncode({'success': true, 'event': solemnEventJson}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final api = NegevApi(ApiClient(client: client));
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
                child: const EventDetailsScreen(eventId: 9),
              ),
            ),
          ),
        );

        // تحميل: مؤشر انتظار قبل استجابة MockClient.
        await tester.pump();
        // استقرار بعد اكتمال الـFuture — لا pumpAndSettle لأنّ مؤشر التحميل متحرّك بلا نهاية.
        await tester.pump(const Duration(milliseconds: 50));

        // الضرر المؤكَّد في #11 — نصوص فرح ثابتة يجب أن تغيب كلها في نوع عزا.
        expect(find.textContaining('زفاف العريس'), findsNothing);
        expect(find.text('شارك فرحتهم'), findsNothing);
        expect(find.textContaining('العريس'), findsNothing);
        expect(find.textContaining('تاريخ العرس'), findsNothing);

        // بدلاً منها: التسميات جاءت من إعداد النوع نفسه.
        expect(find.textContaining('المتوفَّى'), findsWidgets);
        expect(find.textContaining('تاريخ الوفاة'), findsWidgets);
        expect(find.textContaining('تعازي'), findsWidgets);

        // نوع بلا تفاعلات: لا عنوان تفاعل ولا شريط تفاعلات إطلاقاً.
        expect(find.text('تفاعل مع المناسبة'), findsNothing);

        // dinner_time وyouth_party_date وaudio_url غير ظاهرة في هذا النوع.
        expect(find.textContaining('موعد العشاء'), findsNothing);
        expect(find.textContaining('سهرة الشباب'), findsNothing);
      },
    );
  });

  group('دفتر النقوط', () {
    test('يقرأ الإجماليات والتوزيع', () {
      final ledger = NokootLedger.fromJson({
        'totalAmount': 1500,
        'count': 2,
        'records': [
          {
            'id': 1,
            'recipient_name': 'أبو خالد',
            'amount': '1000',
            'event_date': '2026-05-10',
            'clan_town': 'رهط',
          },
          {
            'id': 2,
            'recipient_name': 'أبو علي',
            'amount': 500,
            'event_date': '2026-06-02',
          },
        ],
        'analytics': {
          'townBreakdown': {'رهط': 1000},
          'averageNokoot': 750,
        },
      });

      expect(ledger.totalAmount, 1500);
      expect(ledger.records, hasLength(2));
      expect(ledger.records.first.amount, 1000);
      expect(ledger.townBreakdown['رهط'], 1000);
      expect(ledger.averageNokoot, 750);
    });
  });

  group('عدّادات التبريكات والمتابعين — الغياب لا يصير صفراً (سطح القراءة #20 خطوة ١٣)', () {
    testWidgets('النموذج والكرت: الغياب لا يُقرأ ولا يُرسم كصفر، والصفر الحقيقي يُقرأ ويُرسم', (tester) async {
      final missing = Event.fromJson({'id': 1, 'groom_name': 'م', 'town': 'رهط'});
      // النموذج: مفتاح غائب من الـJSON يُقرأ null، لا صفراً.
      expect(missing.congratulationsCount, isNull);
      expect(missing.followersCount, isNull);

      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: EventCard(
                event: missing,
                onTap: () {},
                onCongratulationsTap: () {},
                onRemindTap: () {},
              ),
            ),
          ),
        ),
      );

      // النوع مطفئ العدّادين (بلا congratulations_count ولا followers_count
      // في الـJSON إطلاقاً) — لا يظهر أي عدّاد، لا صفراً ولا شرطة.
      expect(find.textContaining('تبريكات ('), findsNothing);
      expect(find.textContaining('متابعون:'), findsNothing);

      final zeroed = Event.fromJson({
        'id': 2,
        'groom_name': 'م',
        'town': 'رهط',
        'congratulations_count': 0,
        'followers_count': 0,
      });
      // بالمقابل: صفر حقيقي من الخادم يُقرأ كصفر فعلاً في النموذج أيضاً.
      expect(zeroed.congratulationsCount, 0);
      expect(zeroed.followersCount, 0);

      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: EventCard(
                event: zeroed,
                onTap: () {},
                onCongratulationsTap: () {},
                onRemindTap: () {},
              ),
            ),
          ),
        ),
      );

      // وعلى الكرت: يُرسم كصفر فعلاً.
      expect(find.text('تبريكات (0)'), findsOneWidget);
      expect(find.text('متابعون: 0'), findsOneWidget);
    });
  });

  group('شاشة المناسبات — تبويبات الأنواع (سطح القراءة #20 خطوة ١٣)', () {
    testWidgets('تغيير التبويب يعيد الترقيم لصفحة ١ ويمرّر occasion_type_id للخادم', (tester) async {
      final requests = <Uri>[];
      final client = MockClient((request) async {
        requests.add(request.url);

        if (request.url.path.endsWith('/api/occasion-types')) {
          return http.Response(
            jsonEncode({
              'success': true,
              'types': [
                {
                  'id': 5,
                  'name': 'عزا',
                  'icon': '🕯️',
                  'color': '#4b5563',
                  'position': 1,
                  'is_active': true,
                  'creates_collision': false,
                  'warns_others': true,
                  'premoderate_messages': true,
                  'show_congratulations_count': true,
                  'show_followers_count': false,
                  'show_views_count': true,
                  'congratulations_label': 'تعازي',
                  'default_badge_title': null,
                  'default_poster_url': null,
                  'legacy_client_supported': false,
                  'tone': 'solemn',
                  'fields': <Map<String, dynamic>>[],
                  'reactions': <String>[],
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }

        if (request.url.path.endsWith('/api/stories')) {
          return http.Response(
            jsonEncode({'success': true, 'stories': <Map<String, dynamic>>[]}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }

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

      // نُصفّر السجلّ بعد التحميل الأول — يحمل هو نفسه page=1 أصلاً، والمطلوب
      // إثباته هو ما يُرسَل بعد الضغط على التبويب تحديداً.
      requests.clear();

      await tester.tap(find.text('🕯️ عزا'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final eventsRequest = requests.firstWhere((uri) => uri.path.endsWith('/api/events'));
      expect(eventsRequest.queryParameters['page'], '1');
      expect(eventsRequest.queryParameters['occasion_type_id'], '5');
    });
  });

  group('كرت المناسبة — منطقة الصورة بناءٌ لا وسام (#20 خطوة ١٥)', () {
    testWidgets(
      'نوع solemn بلا poster_url لا يرسم أي منطقة صورة، ونوع عادي بـ poster_url يرسمها',
      (tester) async {
        final solemnNoPoster = Event.fromJson({
          'id': 30,
          'groom_name': '',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'location_name': 'بيت العزاء',
          'event_date': '2026-09-01',
          'dinner_time': '',
          'occasion_type': {
            'id': 2,
            'name': 'عزا',
            'icon': '🕯️',
            'color': '#4b5563',
            'position': 2,
            'is_active': true,
            'creates_collision': false,
            'warns_others': true,
            'premoderate_messages': true,
            'show_congratulations_count': false,
            'show_followers_count': false,
            'show_views_count': false,
            'congratulations_label': 'تعازي',
            'default_badge_title': null,
            'default_poster_url': null,
            'legacy_client_supported': false,
            'tone': 'solemn',
            'fields': <Map<String, dynamic>>[],
            'reactions': <String>[],
          },
          'honorees': [
            {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
          ],
        });

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: solemnNoPoster, onTap: () {})),
            ),
          ),
        );

        expect(find.byType(EventPoster), findsNothing);

        final normalWithPoster = Event.fromJson({
          'id': 31,
          'groom_name': 'محمد',
          'town': 'رهط',
          'poster_url': 'https://api.example.com/uploads/a.jpg',
        });

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: normalWithPoster, onTap: () {})),
            ),
          ),
        );

        expect(find.byType(EventPoster), findsOneWidget);
      },
    );

    // الاختبار أعلاه يغيّر متغيّرين معاً (النبرة والصورة)، فلا يميّز «بلا صورة
    // لا منطقة» عن «العزاء بلا صورة أبداً» — وخطأ يُخفي صورة كل مناسبة solemn
    // كان سيمرّ فيه. هنا الصورة موجودة في الحالتين والنبرة وحدها تتغيّر.
    testWidgets(
      'نوع solemn بصورة يرسمها فعلاً، لكن أقصر من نوع عادي بصورة',
      (tester) async {
        Future<double?> posterHeightFor({required bool solemn}) async {
          final event = Event.fromJson({
            'id': solemn ? 32 : 33,
            'groom_name': 'سالم أبو فلان',
            'town': 'رهط',
            'poster_url': 'https://api.example.com/uploads/a.jpg',
            'occasion_type': {
              'id': solemn ? 2 : 1,
              'name': solemn ? 'عزا' : 'عرس',
              'icon': solemn ? '🕯️' : '💍',
              'color': '#4b5563',
              'tone': solemn ? 'solemn' : 'festive',
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

          expect(find.byType(EventPoster), findsOneWidget);
          return tester.widget<EventPoster>(find.byType(EventPoster)).height;
        }

        final solemnHeight = await posterHeightFor(solemn: true);
        final festiveHeight = await posterHeightFor(solemn: false);

        expect(solemnHeight, isNotNull);
        expect(festiveHeight, isNotNull);
        // العلاقة هي المقصودة، لا الرقمان: صورة العزاء أقصر، لا مساوية ولا غائبة.
        expect(solemnHeight! < festiveHeight!, isTrue);
      },
    );
  });

  group('منتقي خريطة النشر — الإحداثيات (issue #20 خطوة ١٤)', () {
    test(
      'الدبّوس المختار يصل الخادم بقيمته، ويغيب الحقلان تماماً بلا دبّوس — لا صفرَين',
      () async {
        // منطق الشاشة نفسه: بلا دبّوس لا يُبنى أي مفتاح إحداثي إطلاقاً.
        expect(buildLocationFields(latitude: null, longitude: null), isEmpty);
        expect(
          buildLocationFields(latitude: 31.4, longitude: 34.8),
          {'latitude': '31.4', 'longitude': '34.8'},
        );

        String? capturedBody;
        final client = MockClient((request) async {
          capturedBody = utf8.decode(request.bodyBytes);
          return http.Response(
            jsonEncode({
              'success': true,
              'message': 'تم نشر المناسبة فوراً بنجاح!',
              'eventId': 1,
              'status': 'approved',
              'location_warning': null,
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final api = NegevApi(ApiClient(client: client));

        // المستخدم وضع دبّوساً: القيمتان تصلان كما هما.
        await api.submitEvent(
          occasionTypeId: 1,
          honorees: [
            {'name': 'محمد'},
          ],
          fields: {
            'town': 'رهط',
            'event_date': '2026-09-01',
            'latitude': '31.4',
            'longitude': '34.8',
          },
        );
        expect(capturedBody, contains('name="latitude"'));
        expect(capturedBody, contains('31.4'));
        expect(capturedBody, contains('name="longitude"'));
        expect(capturedBody, contains('34.8'));

        // بلا دبّوس: الحقلان غائبان تماماً عن الحمولة — لا "0" ولا سلسلة فارغة.
        capturedBody = null;
        await api.submitEvent(
          occasionTypeId: 1,
          honorees: [
            {'name': 'محمد'},
          ],
          fields: {'town': 'رهط', 'event_date': '2026-09-01'},
        );
        expect(capturedBody, isNot(contains('name="latitude"')));
        expect(capturedBody, isNot(contains('name="longitude"')));
      },
    );
  });

  group('تحذير عدم توافق البلدة بعد النشر (issue #20 خطوة ١٤)', () {
    test(
      'location_warning يُقرأ من ردّ الخادم ويُنتج رسالته على الشاشة، وغيابه لا يُنتج شيئاً',
      () async {
        final withWarning = MockClient((request) async {
          return http.Response(
            jsonEncode({
              'success': true,
              'message': 'تم نشر المناسبة فوراً بنجاح!',
              'eventId': 1,
              'status': 'approved',
              'location_warning': {
                'nearest_town': 'حورة',
                'message':
                    'المكان الذي حدّدته على الخريطة أقرب إلى بلدة "حورة" منه إلى "رهط" — تم الحفظ بالبلدة التي اخترتها كما هي',
              },
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final resultWithWarning = await NegevApi(ApiClient(client: withWarning)).submitEvent(
          occasionTypeId: 1,
          honorees: [
            {'name': 'محمد'},
          ],
          fields: {
            'town': 'رهط',
            'event_date': '2026-09-01',
            'latitude': '31.29',
            'longitude': '34.92',
          },
        );
        expect(
          resultWithWarning.locationWarning,
          'المكان الذي حدّدته على الخريطة أقرب إلى بلدة "حورة" منه إلى "رهط" — تم الحفظ بالبلدة التي اخترتها كما هي',
        );
        // العرض يُلحق النصّ كما وصل من الخادم، بلا إعادة صياغة.
        expect(
          composeEventSubmitMessage(resultWithWarning),
          'تم نشر المناسبة فوراً بنجاح!\nالمكان الذي حدّدته على الخريطة أقرب إلى بلدة "حورة" منه إلى "رهط" — تم الحفظ بالبلدة التي اخترتها كما هي',
        );

        final withoutWarning = MockClient((request) async {
          return http.Response(
            jsonEncode({
              'success': true,
              'message': 'تم نشر المناسبة فوراً بنجاح!',
              'eventId': 2,
              'status': 'approved',
              'location_warning': null,
            }),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final resultWithoutWarning = await NegevApi(ApiClient(client: withoutWarning)).submitEvent(
          occasionTypeId: 1,
          honorees: [
            {'name': 'محمد'},
          ],
          fields: {'town': 'رهط', 'event_date': '2026-09-01'},
        );
        expect(resultWithoutWarning.locationWarning, isNull);
        // لا شيء يُلحق حين لا تحذير — الرسالة كما هي بلا زيادة.
        expect(
          composeEventSubmitMessage(resultWithoutWarning),
          'تم نشر المناسبة فوراً بنجاح!',
        );
      },
    );
  });

  group('عارض الستوري — مناطق النقر بالـRTL (issue #20 خطوة ١٧)', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    // شرط الإطلاق: النقر يسار الشاشة = التالي، ويمينها = السابق — معاكس
    // للافتراض الغربي عمداً. اختبار يمرّ لو كان الاتجاهان معكوسين لا قيمة له،
    // فهو يثبت الاتجاه صراحةً في الاتجاهين معاً، لا وجود الانتقال فقط.
    testWidgets(
      'النقر يسار الشاشة يتقدّم للتالية، والنقر يمينها يرجع للسابقة',
      (tester) async {
        const stories = [
          Story(id: 1, title: 'قصة أولى', slideDurationSeconds: 30),
          Story(id: 2, title: 'قصة ثانية', slideDurationSeconds: 30),
          Story(id: 3, title: 'قصة ثالثة', slideDurationSeconds: 30),
        ];

        final api = apiReturning({'success': true});
        final auth = AuthStore(api);
        final realtime = RealtimeService();

        await tester.pumpWidget(
          MaterialApp(
            home: AppServices(
              api: api,
              auth: auth,
              realtime: realtime,
              child: const StoryViewerScreen(stories: stories, initialIndex: 1),
            ),
          ),
        );
        await tester.pump();

        expect(find.text('قصة ثانية'), findsOneWidget);

        // يسار الشاشة (dx أصغر من نصف العرض، ٨٠٠ منطقي افتراضياً) = التالي.
        await tester.tapAt(const Offset(100, 300));
        await tester.pump();
        expect(find.text('قصة ثالثة'), findsOneWidget);

        // يمين الشاشة (dx أكبر من نصف العرض) = السابق.
        await tester.tapAt(const Offset(700, 300));
        await tester.pump();
        expect(find.text('قصة ثانية'), findsOneWidget);
      },
    );
  });

  group('عارض الستوري — عتبة الثانيتين للمشاهدة (issue #20 خطوة ١٧)', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    testWidgets(
      'POST .../view لا يُرسَل قبل ثانيتين من العرض الفعلي، ويُرسَل بعدهما',
      (tester) async {
        final requests = <Uri>[];
        final client = MockClient((request) async {
          requests.add(request.url);
          return http.Response(
            jsonEncode({'success': true}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final api = NegevApi(ApiClient(client: client));
        final auth = AuthStore(api);
        final realtime = RealtimeService();

        const stories = [Story(id: 11, title: 'قصة', slideDurationSeconds: 10)];

        await tester.pumpWidget(
          MaterialApp(
            home: AppServices(
              api: api,
              auth: auth,
              realtime: realtime,
              child: const StoryViewerScreen(stories: stories, initialIndex: 0),
            ),
          ),
        );
        await tester.pump();

        // قبل الثانيتين — لا مشاهدة، بصرف النظر عن مدة الشريحة الكلية (١٠ ثوانٍ هنا).
        await tester.pump(const Duration(milliseconds: 1500));
        expect(requests.where((u) => u.path.endsWith('/view')), isEmpty);

        // تجاوز العتبة — العارض يستدعي view تلقائياً بلا أي فعل من المستخدم.
        await tester.pump(const Duration(milliseconds: 700));
        // فسحة لإتمام سلسلة async (DeviceIdStore.get ثم POST) بلا مؤقّت حقيقي.
        await tester.pump();
        await tester.pump();
        expect(requests.where((u) => u.path.endsWith('/view')), isNotEmpty);
      },
    );
  });

  group('شاشة تعديل المناسبة (issue #20 خطوة ١٩)', () {
    Map<String, dynamic> festiveTypeJson() => {
      'id': 1,
      'name': 'عرس',
      'icon': '💍',
      'color': '#0369a1',
      'position': 1,
      'is_active': true,
      'creates_collision': true,
      'warns_others': false,
      'premoderate_messages': false,
      'show_congratulations_count': true,
      'show_followers_count': true,
      'show_views_count': true,
      'congratulations_label': 'تبريكات',
      'default_badge_title': 'مبارك الفرح',
      'default_poster_url': null,
      'legacy_client_supported': true,
      'tone': 'festive',
      'fields': [
        {
          'field_key': 'honorees',
          'label': 'العريس/العروس',
          'is_visible': true,
          'is_required': true,
          'position': 1,
        },
        {
          'field_key': 'town',
          'label': 'البلدة',
          'is_visible': true,
          'is_required': true,
          'position': 2,
        },
        {
          'field_key': 'event_date',
          'label': 'تاريخ المناسبة',
          'is_visible': true,
          'is_required': true,
          'position': 3,
        },
        {
          'field_key': 'location_name',
          'label': 'المكان',
          'is_visible': true,
          'is_required': false,
          'position': 4,
        },
      ],
      'reactions': <String>['coffee'],
    };

    Event buildEditableEvent() => Event.fromJson({
      'id': 1,
      'title': 'زفاف محمد',
      'groom_name': 'محمد',
      'family_clan': 'آل فلان',
      'town': 'رهط',
      'location_name': 'قاعة الأفراح',
      'event_date': '2026-10-01',
      'dinner_time': 'الساعة 8:00 مساءً',
      'status': 'approved',
      'occasion_type': festiveTypeJson(),
      'honorees': [
        {'name': 'محمد', 'role': null, 'position': 1},
      ],
    });

    /// عميل وهمي يوجّه حسب المسار: `/api/towns` و`/amendments` بردود ثابتة،
    /// وأي PATCH يرد بالجسم المُعطى — نفس نمط `apiReturning` أعلاه لكن بتفرّع
    /// على الطلب لأنّ الشاشة تستدعي أكثر من نقطة واحدة معاً.
    NegevApi editScreenApi(Map<String, dynamic> patchBody) {
      final client = MockClient((request) async {
        if (request.method == 'PATCH') {
          return http.Response(
            jsonEncode(patchBody),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (request.url.path.endsWith('/api/towns')) {
          return http.Response(
            jsonEncode({
              'success': true,
              'towns': ['الكل', 'رهط', 'حورة'],
              'town_coordinates': <String, dynamic>{},
              'stats': <Map<String, dynamic>>[],
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (request.url.path.contains('/amendments')) {
          return http.Response(
            jsonEncode({'success': true, 'amendments': <Map<String, dynamic>>[]}),
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

    Future<void> pumpEditScreen(WidgetTester tester, NegevApi api) async {
      // نافذة اختبار طويلة كي يُبنى النموذج كاملاً دون تمرير — ListView سلفرية
      // تبني الأبناء القريبين من نافذة العرض فقط، والنموذج أطول من الحجم
      // الافتراضي بسبب منتقي الخريطة.
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

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
              child: EditEventScreen(event: buildEditableEvent()),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    testWidgets(
      'ردّ critical من الخادم يعرض للمستخدم أنّ المناسبة عادت للمراجعة، بنصّ الخادم كما هو',
      (tester) async {
        final criticalApi = editScreenApi({
          'success': true,
          'message':
              'تم حفظ التعديل، ولأنه يمسّ تاريخ أو مكان المناسبة أُعيدت إلى قائمة المراجعة حتى تُعتمد مجدداً',
          'amendment': 'critical',
          'status': 'pending',
          'collision': null,
          'location_warning': null,
        });
        await pumpEditScreen(tester, criticalApi);

        // تغيير مكان المناسبة — حقل حرِج (location_name ضمن
        // CRITICAL_AMENDMENT_FIELDS في الخادم).
        await tester.enterText(
          find.byKey(const Key('event_field_location_name')),
          'قاعة جديدة',
        );
        await tester.pump();

        // زرّ الحفظ صار مفعَّلاً بعد التغيير — تأكيد قبل الحرِج، ثم متابعة.
        await tester.tap(find.byKey(const Key('save_event_button')));
        await tester.pump();
        expect(find.text('حفظ والمتابعة'), findsOneWidget);
        await tester.tap(find.text('حفظ والمتابعة'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        // الرسالة المعروضة هي نصّ الخادم حرفياً — لا إعادة صياغة في العميل.
        expect(find.textContaining('أُعيدت إلى قائمة المراجعة'), findsOneWidget);
        expect(find.textContaining('الحالة الحالية: قيد المراجعة'), findsOneWidget);
      },
    );

    testWidgets(
      'ردّ cosmetic من الخادم لا يقول إنّ المناسبة عادت للمراجعة',
      (tester) async {
        final cosmeticApi = editScreenApi({
          'success': true,
          'message': 'تم حفظ التعديل، والمناسبة تبقى منشورة كما هي',
          'amendment': 'cosmetic',
          'status': 'approved',
          'collision': null,
          'location_warning': null,
        });
        await pumpEditScreen(tester, cosmeticApi);

        await tester.enterText(
          find.byKey(const Key('event_field_location_name')),
          'قاعة جديدة',
        );
        await tester.pump();

        await tester.tap(find.byKey(const Key('save_event_button')));
        await tester.pump();
        expect(find.text('حفظ والمتابعة'), findsOneWidget);
        await tester.tap(find.text('حفظ والمتابعة'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        expect(find.textContaining('أُعيدت إلى قائمة المراجعة'), findsNothing);
        expect(find.text('تم حفظ التعديل، والمناسبة تبقى منشورة كما هي'), findsOneWidget);
      },
    );

    testWidgets(
      'بلا تغيير فعلي: زرّ الحفظ معطَّل ولا يُرسَل أي PATCH',
      (tester) async {
        final requests = <http.Request>[];
        final client = MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/api/towns')) {
            return http.Response(
              jsonEncode({
                'success': true,
                'towns': ['الكل', 'رهط', 'حورة'],
                'town_coordinates': <String, dynamic>{},
                'stats': <Map<String, dynamic>>[],
              }),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          if (request.url.path.contains('/amendments')) {
            return http.Response(
              jsonEncode({'success': true, 'amendments': <Map<String, dynamic>>[]}),
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
        final api = NegevApi(ApiClient(client: client));

        await pumpEditScreen(tester, api);

        final saveButton = tester.widget<ElevatedButton>(
          find.byKey(const Key('save_event_button')),
        );
        expect(saveButton.onPressed, isNull);

        // نضغط رغم التعطيل — زرّ بلا onPressed لا يفعل شيئاً، ولإثبات ذلك
        // بيقين بدل الاكتفاء بقراءة onPressed فقط.
        await tester.tap(find.byKey(const Key('save_event_button')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        expect(requests.where((r) => r.method == 'PATCH'), isEmpty);
      },
    );
  });

  group('القرى والفنان — تحليل النموذج (wayfinder #21)', () {
    test('Village.fromJson يقرأ الإحداثيات كأرقام', () {
      final village = Village.fromJson({
        'id': 4,
        'name': 'أم بطين',
        'latitude': '31.2500000',
        'longitude': '34.8500000',
        'position': 2,
      });

      expect(village.id, 4);
      expect(village.name, 'أم بطين');
      expect(village.latitude, 31.25);
      expect(village.longitude, 34.85);
    });

    test('مناسبة بحقول قرية وفنان تُقرأ كاملة', () {
      final event = Event.fromJson({
        'id': 12,
        'groom_name': 'أحمد',
        'town': 'القرى والتجمعات',
        'village_id': 4,
        'village_name': 'أم بطين',
        'artist_name': 'فلان الفلاني',
        'artist_image_url': 'https://api.example.com/uploads/artist.jpg',
      });

      expect(event.villageId, 4);
      expect(event.villageName, 'أم بطين');
      expect(event.artistName, 'فلان الفلاني');
      expect(event.artistImageUrl, 'https://api.example.com/uploads/artist.jpg');
      // البلدة المعروضة تُلحق باسم القرية، ولا تُغيّر القيمة الخام `town`.
      expect(event.townDisplay, 'القرى والتجمعات (أم بطين)');
      expect(event.town, 'القرى والتجمعات');
    });

    test('غياب القرية والفنان يبقى null بلا نصّ بديل، وtownDisplay يساوي town', () {
      final event = Event.fromJson({'id': 13, 'groom_name': 'سالم', 'town': 'رهط'});

      expect(event.villageId, isNull);
      expect(event.villageName, isNull);
      expect(event.artistName, isNull);
      expect(event.artistImageUrl, isNull);
      expect(event.townDisplay, 'رهط');
    });

    testWidgets('سطر الفنان يظهر على الكرت فقط حين يُملأ الحقل', (tester) async {
      final withArtist = Event.fromJson({
        'id': 1,
        'groom_name': 'أحمد',
        'family_clan': 'آل فلان',
        'town': 'رهط',
        'artist_name': 'راشد الماجد',
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: EventCard(event: withArtist, onTap: () {})),
          ),
        ),
      );
      expect(find.textContaining('يحيي الحفلة الفنان راشد الماجد'), findsOneWidget);

      final withoutArtist = Event.fromJson({
        'id': 2,
        'groom_name': 'أحمد',
        'family_clan': 'آل فلان',
        'town': 'رهط',
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: EventCard(event: withoutArtist, onTap: () {})),
          ),
        ),
      );
      expect(find.textContaining('يحيي الحفلة الفنان'), findsNothing);
    });
  });

  group('دليل الخدمات — تحليل النموذج (wayfinder #21 خطوة ٣)', () {
    test('سطر مزوّد في القائمة العامة يتحلّل بلا مفتاح phone إطلاقاً', () {
      final provider = ServiceProvider.fromJson({
        'id': 5,
        'name': 'أبو خالد للولائم',
        'category_id': 1,
        'category_name': 'طبّاخون',
        'image_url': 'https://api.example.com/uploads/cook.jpg',
        'towns': ['رهط', 'اللقية'],
      });

      expect(provider.id, 5);
      expect(provider.name, 'أبو خالد للولائم');
      expect(provider.towns, ['رهط', 'اللقية']);
      // لا استثناء رغم غياب `phone` كلياً من الحمولة — هذا هو المقصود بالضبط.
      expect(provider, isA<ServiceProvider>());
    });

    test('مزوّد التفاصيل وحده يحمل phone والوصف', () {
      final detail = ServiceProviderDetail.fromJson({
        'id': 5,
        'name': 'أبو خالد للولائم',
        'category_id': 1,
        'category_name': 'طبّاخون',
        'phone': '0501234567',
        'description': 'ولائم أعراس ومناسبات في كل أنحاء النقب',
        'towns': ['رهط'],
      });

      expect(detail.phone, '0501234567');
      expect(detail.description, 'ولائم أعراس ومناسبات في كل أنحاء النقب');
    });

    test('عميل API يقرأ صفحة المزوّدين وفئات الدليل', () async {
      final api = apiReturning({
        'success': true,
        'providers': [
          {
            'id': 1,
            'name': 'استوديو الصحراء',
            'category_id': 2,
            'category_name': 'مصوّرون',
            'towns': ['تل السبع'],
          },
        ],
        'pagination': {'page': 1, 'limit': 30, 'total': 1, 'totalPages': 1},
      });

      final page = await api.serviceProviders();
      expect(page.providers, hasLength(1));
      expect(page.providers.first.categoryName, 'مصوّرون');
    });
  });

  group('الشريط السفلي — «الخدمات» بدل «إضافة»، وزرّ عائم للنشر (wayfinder #21)', () {
    testWidgets('خمس وجهات فقط بلا "إضافة"، و"الخدمات" ضمنها، وزرّ عائم', (tester) async {
      final api = apiReturning({'success': true});
      final auth = AuthStore(api);
      final realtime = RealtimeService();

      // AppServices يجب أن يلفّ MaterialApp نفسه هنا، لا العكس — نفس ترتيب
      // main.dart فعلياً: أيّ مسار يدفعه Navigator (كزرّ النشر العائم أدناه)
      // يُدرَج تحت هذا الـNavigator مباشرة، فيبقى حفيداً لـAppServices فقط
      // إن كان AppServices فوق الـNavigator، لا داخل `home` تحته.
      await tester.pumpWidget(
        AppServices(
          api: api,
          auth: auth,
          realtime: realtime,
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: HomeShell(),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(navBar.destinations, hasLength(5));

      // «إضافة» لم تعد وجهة في الشريط — الزرّ العائم هو النشر الآن.
      expect(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('إضافة')),
        findsNothing,
      );
      expect(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('الخدمات')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('حسابي')),
        findsOneWidget,
      );
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('الزرّ العائم يفتح شاشة النشر', (tester) async {
      final api = apiReturning({'success': true});
      final auth = AuthStore(api);
      final realtime = RealtimeService();

      // AppServices يجب أن يلفّ MaterialApp نفسه هنا، لا العكس — نفس ترتيب
      // main.dart فعلياً: أيّ مسار يدفعه Navigator (كزرّ النشر العائم أدناه)
      // يُدرَج تحت هذا الـNavigator مباشرة، فيبقى حفيداً لـAppServices فقط
      // إن كان AppServices فوق الـNavigator، لا داخل `home` تحته.
      await tester.pumpWidget(
        AppServices(
          api: api,
          auth: auth,
          realtime: realtime,
          child: const MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: HomeShell(),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      await tester.tap(find.byType(FloatingActionButton));
      await tester.pumpAndSettle();

      expect(find.byType(AddEventScreen), findsOneWidget);
    });
  });

  group('زرّ المشاركة، سطر سهرة الشباب، وترتيب كتلة المعلومات (issue #44)', () {
    Map<String, dynamic> occasionTypeJson({
      required String tone,
      List<Map<String, dynamic>> fields = const [],
    }) => {
      'id': tone == 'solemn' ? 2 : 1,
      'name': tone == 'solemn' ? 'عزا' : 'عرس',
      'icon': tone == 'solemn' ? '🕯️' : '💍',
      'color': '#0369a1',
      'position': 1,
      'is_active': true,
      'creates_collision': false,
      'warns_others': false,
      'premoderate_messages': false,
      'show_congratulations_count': false,
      'show_followers_count': false,
      'show_views_count': false,
      'congratulations_label': tone == 'solemn' ? 'تعازي' : 'تبريكات',
      'default_badge_title': null,
      'default_poster_url': null,
      'legacy_client_supported': true,
      'tone': tone,
      'fields': fields,
      'reactions': <String>[],
    };

    Future<void> pumpDetails(WidgetTester tester, Map<String, dynamic> eventBody) async {
      final client = MockClient((request) async {
        return http.Response(
          jsonEncode({'success': true, 'event': eventBody}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final api = NegevApi(ApiClient(client: client));
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
              child: EventDetailsScreen(eventId: eventBody['id'] as int),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    // اختباران منفصلان لا نداءان لـ`pumpDetails` داخل اختبار واحد: `EventDetailsScreen`
    // شاشة State-ful، و`tester.pumpWidget` الثاني بنفس شكل الشجرة يُبقي الحالة
    // القديمة حيّة (`didChangeDependencies` يتجاهل الجلب لأن `_event` صار غير
    // null من المرّة الأولى) بدل بناء شاشة جديدة فعلاً — فيبقى النصّ القديم ظاهراً.
    testWidgets(
      'كلمة زرّ المشاركة لنوع festive: «شارك المناسبة» لا «أرسل النعي»',
      (tester) async {
        await pumpDetails(tester, {
          'id': 40,
          'groom_name': 'محمد',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'occasion_type': occasionTypeJson(tone: 'festive'),
          'honorees': [
            {'name': 'محمد', 'role': null, 'position': 1},
          ],
        });
        expect(find.text('شارك المناسبة'), findsOneWidget);
        expect(find.text('أرسل النعي'), findsNothing);
      },
    );

    testWidgets(
      'كلمة زرّ المشاركة لنوع solemn: «أرسل النعي» لا «شارك المناسبة» — من tone حصراً لا اسم النوع',
      (tester) async {
        await pumpDetails(tester, {
          'id': 50,
          'groom_name': '',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'occasion_type': occasionTypeJson(tone: 'solemn'),
          'honorees': [
            {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
          ],
        });
        expect(find.text('أرسل النعي'), findsOneWidget);
        expect(find.text('شارك المناسبة'), findsNothing);
      },
    );

    testWidgets(
      'سطر سهرة الشباب على الكرت: يظهر حين تُملأ القيمة، ويغيب تماماً من شجرة الودجت حين تفرغ',
      (tester) async {
        final typeShowingField = occasionTypeJson(
          tone: 'festive',
          fields: const [
            {
              'field_key': 'youth_party_date',
              'label': 'سهرة الشباب',
              'is_visible': true,
              'is_required': false,
              'position': 1,
            },
          ],
        );

        final withParty = Event.fromJson({
          'id': 41,
          'groom_name': 'محمد',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'youth_party_date': '2026-09-20',
          'occasion_type': typeShowingField,
        });

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: withParty, onTap: () {})),
            ),
          ),
        );
        expect(find.text('2026-09-20'), findsOneWidget);
        expect(find.byIcon(Icons.nightlife_outlined), findsOneWidget);

        final withoutParty = Event.fromJson({
          'id': 42,
          'groom_name': 'محمد',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'occasion_type': typeShowingField,
        });

        await tester.pumpWidget(
          MaterialApp(
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(body: EventCard(event: withoutParty, onTap: () {})),
            ),
          ),
        );
        expect(find.text('2026-09-20'), findsNothing);
        expect(find.byIcon(Icons.nightlife_outlined), findsNothing);
      },
    );

    testWidgets(
      'تفاصيل المناسبة: كتلة المعلومات تحت سطر الفنان مباشرة، بالترتيب المكان ثم التاريخ ثم سهرة الشباب ثم وقت العشاء',
      (tester) async {
        // نافذة اختبار طويلة كي تُبنى كل الصفوف فعلاً (ListView سلفرية لا تبني
        // إلا القريب من نافذة العرض) — نفس نمط شاشة تعديل المناسبة أعلاه.
        tester.view.physicalSize = const Size(800, 3000);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        final type = occasionTypeJson(
          tone: 'festive',
          fields: const [
            {
              'field_key': 'youth_party_date',
              'label': 'سهرة الشباب',
              'is_visible': true,
              'is_required': false,
              'position': 1,
            },
            {
              'field_key': 'dinner_time',
              'label': 'موعد العشاء',
              'is_visible': true,
              'is_required': false,
              'position': 2,
            },
          ],
        );

        await pumpDetails(tester, {
          'id': 43,
          'groom_name': 'محمد',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'location_name': 'قاعة الأفراح',
          'event_date': '2026-10-01',
          'dinner_time': 'الساعة 8:00 مساءً',
          'youth_party_date': '2026-09-20',
          'artist_name': 'راشد الماجد',
          'occasion_type': type,
          'honorees': [
            {'name': 'محمد', 'role': null, 'position': 1},
          ],
        });

        final artistY =
            tester.getTopLeft(find.textContaining('يحيي الحفلة الفنان راشد الماجد')).dy;
        final locationY = tester.getTopLeft(find.text('رهط — قاعة الأفراح')).dy;
        final dateY = tester.getTopLeft(find.text('2026-10-01')).dy;
        final youthY = tester.getTopLeft(find.text('2026-09-20')).dy;
        final dinnerY = tester.getTopLeft(find.text('الساعة 8:00 مساءً')).dy;

        expect(artistY, lessThan(locationY));
        expect(locationY, lessThan(dateY));
        expect(dateY, lessThan(youthY));
        expect(youthY, lessThan(dinnerY));
      },
    );
  });

  group('التحليل السلوكي في الموبايل (issue #44)', () {
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
      'الضغط على «شارك المناسبة» يرسل share_clicked وcontent_town ببلدة المناسبة نفسها لا بلدة المستخدم',
      (tester) async {
        final requests = <http.Request>[];
        final eventJson = {
          'id': 60,
          'groom_name': 'محمد',
          'family_clan': 'آل فلان',
          // بلدة المناسبة — عمداً مختلفة عن أي بلدة قد تُنسَب للمستخدم، كي
          // يفشل الاختبار بوضوح لو انقلب المصدر إلى بلدة المستخدم خطأً.
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

        final client = MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/api/events/60')) {
            return http.Response(
              jsonEncode({'success': true, 'event': eventJson}),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          return http.Response(
            jsonEncode({'success': true}),
            201,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final api = NegevApi(ApiClient(client: client));
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
                child: const EventDetailsScreen(eventId: 60),
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        await tester.tap(find.text('شارك المناسبة'));
        // فسحة لإتمام سلسلة async (DeviceIdStore.get وPackageInfo.fromPlatform
        // ثم POST التحليل) بلا مؤقّت حقيقي — نفس نمط اختبار الستوري أعلاه.
        await tester.pump();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        final analyticsRequest = requests.firstWhere(
          (r) => r.url.path.endsWith('/api/analytics/events'),
        );
        final body = jsonDecode(analyticsRequest.body) as Map<String, dynamic>;
        expect(body['event_name'], 'share_clicked');
        expect(body['platform'], 'android');
        expect(body['content_town'], 'اللقية');
        expect(body['app_version'], '1.2.0');
        expect(body['device_id'], isNotEmpty);
      },
    );

    testWidgets(
      'فشل الطلب (٥٠٠) لا يُسقط استثناء غير معالَج ولا يظهر أي رسالة للمستخدم',
      (tester) async {
        var requestSent = false;
        final client = MockClient((request) async {
          requestSent = true;
          return http.Response(
            jsonEncode({'success': false, 'message': 'خطأ في الخادم'}),
            500,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        final api = NegevApi(ApiClient(client: client));

        await tester.pumpWidget(
          const MaterialApp(home: Scaffold(body: Text('شاشة اختبار'))),
        );

        // النداء لا يُنتظَر من موقع الاستدعاء — تماماً كموقعي الاستدعاء
        // الحقيقيين (المشاركة والنشر). أي استثناء يفلت من الداخل بلا التقاط
        // يُسقط هذا الاختبار نفسه (flutter_test يفشل الاختبار على أي خطأ
        // غير ملتقَط في Zone غير متزامن) — فنجاح الاختبار هو الإثبات.
        recordAnalyticsEvent(api, 'publish_started', contentTown: 'رهط');

        await tester.pump();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        expect(requestSent, isTrue);
        expect(find.byType(SnackBar), findsNothing);
        expect(find.text('خطأ في الخادم'), findsNothing);
      },
    );
  });
}
