import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/models/notification.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/reminder_alarms.dart';
import 'package:negev_events/state/reminder_scheduler.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// عميل وهمي بجسم ثابت — نفس نمط apiReturning في widget_test.dart، مكرَّر
/// هنا محلياً لأنّ الأصل غير مُصدَّر من هذا الملف.
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

/// حساب مسجَّل دخوله بلا أي طلب شبكة حقيقي — يمرّ عبر AuthStore.signIn فعلاً
/// (لا اختصار خاص) بعميل وهمي يردّ على /api/auth/login فقط.
Future<AuthStore> signedInAuth({int userId = 1}) async {
  final api = apiReturning({
    'success': true,
    'token': 'test-token',
    'user': {
      'id': userId,
      'phone_number': '0500000000',
      'full_name': 'مستخدم اختبار',
      'role': 'user',
    },
  });
  final auth = AuthStore(api);
  await auth.signIn('0500000000', '1234');
  return auth;
}

/// عميل وهمي يوجّه /api/reminders/schedule إلى جسم [scheduleBody] — يدعم
/// أيضاً /api/auth/login كي يُستعمل مباشرة في بناء [signedInAuth] بنفس العميل
/// الذي سيُستدعى عليه remindersSchedule لاحقاً.
NegevApi scheduleApi(
  Object Function() scheduleBody, {
  int loginUserId = 1,
}) {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/auth/login')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'token': 'test-token',
          'user': {
            'id': loginUserId,
            'phone_number': '0500000000',
            'full_name': 'مستخدم اختبار',
            'role': 'user',
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response(
      jsonEncode(scheduleBody()),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

/// سجلّ نداء جدولة واحد — يُبقي الجسم كاملاً كي يفحص كل اختبار ما يعنيه فقط.
class ScheduleCall {
  final int id;
  final String body;
  final DateTime fireAt;

  const ScheduleCall({required this.id, required this.body, required this.fireAt});
}

/// بوّابة منبّه مزيَّفة — تسجّل كل نداء بلا لمس أي قناة منصّة حقيقية. تُبقي
/// أيضاً حالة "المعلَّق حالياً" (كما يفعل flutter_local_notifications فعلياً)
/// كي يعكس [pendingIds] ما سيُغلَق [ReminderScheduler.syncAll] عليه.
class FakeReminderAlarms implements ReminderAlarms {
  final List<ScheduleCall> scheduleLog = [];
  final List<int> cancelLog = [];
  bool cancelAllCalled = false;
  bool permissionGranted = true;

  final Map<int, DateTime> _pending = {};

  @override
  Future<bool> requestPermission() async => permissionGranted;

  @override
  Future<void> schedule({
    required int id,
    required String title,
    required String body,
    required DateTime fireAt,
  }) async {
    scheduleLog.add(ScheduleCall(id: id, body: body, fireAt: fireAt));
    _pending[id] = fireAt;
  }

  @override
  Future<void> cancel(int id) async {
    cancelLog.add(id);
    _pending.remove(id);
  }

  @override
  Future<void> cancelAllScheduled() async {
    cancelAllCalled = true;
    _pending.clear();
  }

  @override
  Future<List<int>> pendingIds() async => _pending.keys.toList();
}

Map<String, dynamic> scheduleEntryJson({
  required int eventId,
  required String title,
  required List<int> daysBefore,
}) {
  final now = DateTime.now().toUtc();
  return {
    'event_id': eventId,
    'title': title,
    'event_date': now.add(const Duration(days: 3)).toIso8601String().split('T').first,
    'offsets': daysBefore
        .map((d) => {
              'days_before': d,
              // القيمة الفعلية غير مهمّة هنا — المهم أنها ضمن أفق ٣٠ يوماً.
              'fires_on': now.add(const Duration(hours: 6)).toIso8601String(),
            })
        .toList(),
  };
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('مركز الإشعارات — تمييز التعميم عن الإشعار الشخصي بنيوياً', () {
    test(
      'تعميم من القائمة المدموجة يحمل broadcast_id الخاصّ به ولا يصطدم بإشعار '
      'شخصي بنفس الرقم، وإغلاقه يضرب مسار التعميم لا مسار الإشعار الشخصي',
      () async {
        // نفس الرقم ٧ عمداً في كلا الشكلين — عدّادان مستقلّان على الخادم
        // (notifications.id و broadcasts.id) قد يتقاطعان.
        final personal = AppNotification.fromJson({
          'id': 7,
          'type': 'event_soon',
          'title': 'تذكير',
          'body': 'باقي 3 أيام',
          'event_id': 3,
          'is_read': false,
          'created_at': '2026-09-01T00:00:00Z',
        });
        final broadcast = AppNotification.fromJson({
          'broadcast_id': 7,
          'type': 'broadcast',
          'title': 'تعميم',
          'body': 'نصّ التعميم',
          'tone': 'urgent',
          'expires_at': null,
          'is_read': false,
          'created_at': '2026-09-01T00:00:01Z',
        });

        expect(personal.isBroadcast, isFalse);
        expect(personal.id, 7);
        expect(personal.broadcastId, isNull);

        expect(broadcast.isBroadcast, isTrue);
        expect(broadcast.broadcastId, 7);
        // الادّعاء الذي يحمل الشرط فعلاً: تعميمه لا يُقرأ أبداً كـ id شخصي،
        // مهما تساوت قيمة الرقم في الشكلين.
        expect(broadcast.id, isNull);
        expect(broadcast.tone, BroadcastTone.urgent);

        String? calledPath;
        String? calledMethod;
        final api = apiReturning(
          {'success': true},
          onRequest: (r) {
            calledPath = r.url.path;
            calledMethod = r.method;
          },
        );
        await api.dismissBroadcast(broadcast.broadcastId!);
        expect(calledMethod, 'PATCH');
        expect(calledPath, endsWith('/api/broadcasts/7/dismiss'));
      },
    );

    test('إشعار شخصي يحمل event_id يُعلَّم مقروءاً عبر مسار الإشعارات الشخصي', () async {
      String? calledPath;
      final api = apiReturning({'success': true}, onRequest: (r) => calledPath = r.url.path);

      final personal = AppNotification.fromJson({
        'id': 9,
        'type': 'event_soon',
        'title': 'تذكير',
        'body': 'باقي يوم واحد',
        'event_id': 12,
        'is_read': false,
        'created_at': '2026-09-01T00:00:00Z',
      });

      expect(personal.eventId, 12);
      await api.markNotificationRead(personal.id!);
      expect(calledPath, endsWith('/api/notifications/9/read'));
    });
  });

  group('جدولة المنبّه المحلي من GET /api/reminders/schedule', () {
    test('كل (مناسبة، فاصل) يُجدوَل بمعرّف مستقر مبني على stableId', () async {
      final api = scheduleApi(() => {
            'success': true,
            'schedule': [
              scheduleEntryJson(eventId: 5, title: 'عرس آل فلان', daysBefore: [3]),
            ],
          });
      final auth = await signedInAuth();
      final fake = FakeReminderAlarms();
      final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

      await scheduler.syncAll();

      expect(fake.scheduleLog, hasLength(1));
      expect(fake.scheduleLog.single.id, ReminderScheduler.stableId(5, 3));
    });

    test(
      'فاصل لحظته فاتت لا يُجدوَل — الخادم يفلتر بدقّة اليوم لا الساعة، فمناسبة '
      'بعد ٣ أيام تُرجِع الفاصل ٣ بلحظة الساعة ٩ صباحاً، وهي ماضية لكل من يفتح '
      'التطبيق بعدها',
      () async {
        final now = DateTime.now().toUtc();
        final api = scheduleApi(() => {
              'success': true,
              'schedule': [
                {
                  'event_id': 11,
                  'title': 'عرس آل فلان',
                  'event_date': '2030-01-01',
                  'offsets': [
                    // الحالة الواقعية: صباح اليوم مضى، والفاصل التالي لم يأتِ بعد.
                    {
                      'days_before': 3,
                      'fires_on': now.subtract(const Duration(hours: 5)).toIso8601String(),
                    },
                    {
                      'days_before': 1,
                      'fires_on': now.add(const Duration(days: 2)).toIso8601String(),
                    },
                  ],
                },
              ],
            });
        final auth = await signedInAuth();
        final fake = FakeReminderAlarms();
        final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

        await scheduler.syncAll();

        expect(
          fake.scheduleLog.map((entry) => entry.id),
          [ReminderScheduler.stableId(11, 1)],
          reason: 'لا يجوز جدولة منبّه بموعد فائت — إمّا ينبثق فوراً بلا سبب أو يُرفض',
        );
      },
    );

    test(
      'إعادة المزامنة بنفس الخطّة تستعمل نفس المعرّف في كل مرّة — لا معرّفاً '
      'جديداً يُكدَّس فوق سابقه',
      () async {
        final api = scheduleApi(() => {
              'success': true,
              'schedule': [
                scheduleEntryJson(eventId: 8, title: 'عرس آل سالم', daysBefore: [1]),
              ],
            });
        final auth = await signedInAuth();
        final fake = FakeReminderAlarms();
        final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

        await scheduler.syncAll();
        await scheduler.syncAll();

        expect(fake.scheduleLog, hasLength(2));
        // الادّعاء الذي يحمل الشرط: النداءان استعملا نفس المعرّف بالضبط —
        // معرّف غير مستقر (عدّاد متزايد مثلاً) كان سيُنتج قيمتين مختلفتين هنا.
        final idsUsed = fake.scheduleLog.map((call) => call.id).toSet();
        expect(idsUsed, hasLength(1));
      },
    );

    test('مناسبة سقطت من الخطّة يُلغى منبّهها فعلياً عند إعادة المزامنة', () async {
      var callCount = 0;
      final api = scheduleApi(() {
        callCount++;
        if (callCount == 1) {
          return {
            'success': true,
            'schedule': [
              scheduleEntryJson(eventId: 5, title: 'عرس آل فلان', daysBefore: [3]),
              scheduleEntryJson(eventId: 6, title: 'عرس آل سالم', daysBefore: [1]),
            ],
          };
        }
        // مناسبة ٦ سقطت من الخطّة — أُلغي تذكيرها أو نفدت فواصلها.
        return {
          'success': true,
          'schedule': [
            scheduleEntryJson(eventId: 5, title: 'عرس آل فلان', daysBefore: [3]),
          ],
        };
      });
      final auth = await signedInAuth();
      final fake = FakeReminderAlarms();
      final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

      await scheduler.syncAll();
      expect(await fake.pendingIds(), containsAll([
        ReminderScheduler.stableId(5, 3),
        ReminderScheduler.stableId(6, 1),
      ]));

      await scheduler.syncAll();

      expect(fake.cancelLog, contains(ReminderScheduler.stableId(6, 1)));
      final stillPending = await fake.pendingIds();
      expect(stillPending, contains(ReminderScheduler.stableId(5, 3)));
      expect(stillPending, isNot(contains(ReminderScheduler.stableId(6, 1))));
    });

    test('نصّ المنبّه لا يذكر تاريخاً — لا يحمل event_date الخام ولا صيغة يوم-شهر-سنة', () async {
      final api = scheduleApi(() => {
            'success': true,
            'schedule': [
              scheduleEntryJson(eventId: 5, title: 'عرس آل فلان', daysBefore: [3]),
            ],
          });
      final auth = await signedInAuth();
      final fake = FakeReminderAlarms();
      final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

      await scheduler.syncAll();

      final body = fake.scheduleLog.single.body;
      expect(body, contains('عرس آل فلان'));
      expect(RegExp(r'\d{4}-\d{2}-\d{2}').hasMatch(body), isFalse);
    });

    test('مستخدم غير مسجَّل الدخول: لا نداء للخادم ولا أي منبّه يُجدوَل', () async {
      var requested = false;
      final client = MockClient((request) async {
        requested = true;
        return http.Response(
          jsonEncode({'success': true, 'schedule': <Map<String, dynamic>>[]}),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      final api = NegevApi(ApiClient(client: client));
      final auth = AuthStore(api); // بلا signIn — isSignedIn تبقى false.
      final fake = FakeReminderAlarms();
      final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

      await scheduler.syncAll();

      expect(requested, isFalse);
      expect(fake.scheduleLog, isEmpty);
    });
  });

  group('إلغاء التذكير يُلغي المنبّه فوراً (قصة ٢٠)', () {
    test('onReminderRemoved يُلغي كل فواصل المناسبة بلا انتظار مزامنة تالية', () async {
      final api = apiReturning({'success': true});
      final auth = await signedInAuth();
      final fake = FakeReminderAlarms();
      final scheduler = ReminderScheduler(api: api, auth: auth, alarms: fake);

      await scheduler.onReminderRemoved(42);

      for (final d in [7, 5, 3, 1, 0]) {
        expect(fake.cancelLog, contains(ReminderScheduler.stableId(42, d)));
      }
    });
  });
}
