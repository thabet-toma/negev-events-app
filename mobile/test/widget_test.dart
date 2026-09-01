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
import 'package:negev_events/screens/add_event_screen.dart';
import 'package:negev_events/screens/event_details_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/update_checker.dart';
import 'package:negev_events/widgets/event_card.dart';

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
}
