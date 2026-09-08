import '../api/negev_api.dart';
import 'auth_store.dart';
import 'reminder_alarms.dart';

/// منبّه محسوب لمناسبة/فاصل واحد — نتيجة وسيطة داخل [ReminderScheduler.syncAll]
/// فقط، لا يخرج من هذا الملف.
class _PlannedAlarm {
  final int id;
  final DateTime fireAt;
  final String body;

  const _PlannedAlarm({required this.id, required this.fireAt, required this.body});
}

/// يحوّل خطّة التذكير القادمة من الخادم (GET /api/reminders/schedule) إلى
/// منبّهات جهاز فعلية — القرار المعماري الملزم في issue #85: «الموبايل
/// يقاطع محلياً، والخادم لا يدفع event_soon إلى الموبايل إطلاقاً». الخادم
/// يكتب سجلّ مركز الإشعارات دائماً؛ هذا الصنف مسؤول عن المقاطعة المحلية
/// وحدها، ولا يكتب شيئاً على الخادم بنفسه.
class ReminderScheduler {
  ReminderScheduler({required NegevApi api, required AuthStore auth, ReminderAlarms? alarms})
      : _api = api,
        _auth = auth,
        _alarms = alarms ?? FlutterLocalNotificationsReminderAlarms();

  final NegevApi _api;
  final AuthStore _auth;
  final ReminderAlarms _alarms;

  /// الفواصل الممكنة — مطابقة لـ COUNTDOWN_OFFSETS في notifications.service.js
  /// على الخادم؛ لازمة هنا فقط لحساب معرّفات الإلغاء الفوري لمناسبة واحدة
  /// (onReminderRemoved) بلا انتظار مزامنة كاملة.
  static const List<int> _offsets = [7, 5, 3, 1, 0];

  static const int _maxEvents = 20;
  static const int _maxOffsetsPerEvent = 5;
  static const int _horizonDays = 30;

  int? _lastSyncedUserId;

  /// معرّف مستقر لكل (مناسبة، فاصل) — نفس الزوج يعيد نفس الرقم دائماً، فإعادة
  /// الجدولة على نفس المعرّف تستبدل المنبّه القديم بدل تكديس ثانٍ فوقه (قصة ١٩).
  static int stableId(int eventId, int daysBefore) => eventId * 10 + daysBefore;

  /// يعيد بناء كل المنبّهات من الصفر اعتماداً على الخطّة الحالية من الخادم —
  /// يُلغي ما سقط منها (مناسبة أُلغي تذكيرها أو انتهت فواصلها) ويجدوِل ما تبقّى
  /// أو تغيّر توقيته (مناسبة أُجِّل موعدها، قصة ١٩). لا شيء يحدث لمستخدم غير
  /// مسجَّل الدخول.
  Future<void> syncAll() async {
    if (!_auth.isSignedIn) return;

    // الخادم يفلتر الفواصل بدقّة **اليوم** لا الساعة (`offset <= daysLeft` في
    // notifications.service.js، وتعليقه نفسه يقول «still ahead of today»). فمناسبة
    // بعد ثلاثة أيام تُرجِع الفاصل ٣ ولحظته الساعة ٩ من صباح اليوم — أي في الماضي
    // لكل من يفتح التطبيق بعد التاسعة، وهي الحالة الغالبة. الفلترة داخل اليوم
    // شغل العميل وحده: منبّه بموعد فائت إمّا يُطلَق فوراً («باقي ٣ أيام» تنبثق
    // بلا سبب) أو يُرفض، وكلاهما خطأ.
    final now = DateTime.now().toUtc();
    final horizon = now.add(const Duration(days: _horizonDays));
    final entries = await _api.remindersSchedule();

    final desired = <int, _PlannedAlarm>{};
    var scheduledEvents = 0;
    for (final entry in entries) {
      if (scheduledEvents >= _maxEvents) break;

      final withinHorizon = entry.offsets
          .where((offset) => offset.firesOn.isAfter(now) && !offset.firesOn.isAfter(horizon))
          .take(_maxOffsetsPerEvent);
      if (withinHorizon.isEmpty) continue;

      final title = entry.title.trim().isEmpty ? 'المناسبة' : entry.title.trim();
      for (final offset in withinHorizon) {
        final id = stableId(entry.eventId, offset.daysBefore);
        desired[id] = _PlannedAlarm(
          id: id,
          fireAt: offset.firesOn,
          body: _alarmBody(offset.daysBefore, title),
        );
      }
      scheduledEvents++;
    }

    final pending = await _alarms.pendingIds();
    for (final id in pending) {
      if (!desired.containsKey(id)) await _alarms.cancel(id);
    }
    for (final alarm in desired.values) {
      await _alarms.schedule(
        id: alarm.id,
        title: 'تذكير مناسبة',
        body: alarm.body,
        fireAt: alarm.fireAt,
      );
    }
  }

  /// يُستدعى بعد نجاح POST /remind على الخادم مباشرة. يطلب الإذن أول مرّة
  /// يلزم فيها (قصة ١٦ لكن على الموبايل: أبداً عند الإقلاع)، ويعيد ما إذا كان
  /// منبّه سيُسمَع فعلاً على هذا الجهاز — `false` لا تُلغي التذكير نفسه، فهو
  /// محفوظ على الخادم أصلاً؛ الشاشة المستدعية تعرض سطراً صادقاً عند `false`.
  Future<bool> onReminderAdded() async {
    bool granted;
    try {
      granted = await _alarms.requestPermission();
    } catch (_) {
      granted = false;
    }

    try {
      await syncAll();
    } catch (_) {
      // مزامنة صامتة — التذكير نجح على الخادم فعلاً، وستُصحَّح المنبّهات عند
      // فتح تالٍ للتطبيق (قصة ١٩) إن فشلت المزامنة الآن لسبب شبكي عابر.
    }
    return granted;
  }

  /// يُستدعى بعد نجاح DELETE /remind مباشرة — إلغاء فوري، لا ينتظر مزامنة
  /// تالية (قصة ٢٠).
  Future<void> onReminderRemoved(int eventId) async {
    for (final daysBefore in _offsets) {
      await _alarms.cancel(stableId(eventId, daysBefore));
    }
  }

  /// يُستدعى من مستمع AuthStore في main.dart فقط — لا يُسجَّل هذا الصنف نفسه
  /// كمستمع كي يبقى إنشاؤه بلا أثر جانبي (AppServices تبني نسخة افتراضية منه
  /// في كل اختبار ودجت يستعمل خدماتها الأخرى دون أن يقصد اختبار التذكير).
  Future<void> handleAuthChange() async {
    if (!_auth.isReady) return;

    final userId = _auth.user?.id;
    if (userId == null) {
      // تسجيل خروج، أو لم يسجّل دخوله أصلاً — لا تُبقِ منبّهاً يخصّ حساباً آخر.
      if (_lastSyncedUserId != null) {
        _lastSyncedUserId = null;
        try {
          await _alarms.cancelAllScheduled();
        } catch (_) {}
      }
      return;
    }

    // نفس المستخدم الذي زُومن له بالفعل — لا تكرار على كل notifyListeners.
    if (userId == _lastSyncedUserId) return;
    _lastSyncedUserId = userId;
    try {
      await syncAll();
    } catch (_) {}
  }

  /// «باقي ٣ أيام على…» لا «الجمعة ٢٥» — النصّ لا يذكر تاريخاً إطلاقاً.
  String _alarmBody(int daysBefore, String title) {
    if (daysBefore == 0) return 'اليوم موعد $title';
    if (daysBefore == 1) return 'باقي يوم واحد على $title';
    return 'باقي $daysBefore أيام على $title';
  }
}
