import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/models/nokoot.dart';
import 'package:negev_events/state/update_checker.dart';

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

      final events = await api.listEvents();
      expect(events, hasLength(1));
      expect(events.first.groomName, 'أحمد');
    });

    test('يمرّر فلتر البلدة ويتجاهل "الكل"', () async {
      String? capturedQuery;
      final api = apiReturning(
        {'success': true, 'events': []},
        onRequest: (request) => capturedQuery = request.url.query,
      );

      await api.listEvents(town: 'الكل');
      expect(capturedQuery, isEmpty);

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
}
