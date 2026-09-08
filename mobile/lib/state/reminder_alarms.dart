import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// بوابة المنبّه المحلي — واجهة مجرّدة كي يستطيع [ReminderScheduler] استبدالها
/// بمزيّف في الاختبارات بلا لمس أي قناة منصّة حقيقية (issue #85 دفعة ٧).
abstract class ReminderAlarms {
  /// يطلب إذن الإشعارات من نظام التشغيل. `true` يعني أنّ منبّهاً سيُسمَع فعلاً.
  Future<bool> requestPermission();

  Future<void> schedule({
    required int id,
    required String title,
    required String body,
    required DateTime fireAt,
  });

  Future<void> cancel(int id);

  /// تُستدعى عند تسجيل الخروج فقط — لا تُبقي منبّهاً يخصّ حساباً لم يعد مسجَّلاً.
  Future<void> cancelAllScheduled();

  Future<List<int>> pendingIds();
}

const String _channelId = 'event_reminders';
const String _channelName = 'تذكيرات المناسبات';
const String _channelDescription = 'تنبيه محلي عند اقتراب موعد مناسبة تتابعها';

/// كل حساب `fires_on` مبني على `Asia/Jerusalem` أصلاً على الخادم
/// (jerusalemTime.js)، ولحظة UTC المطلَقة القادمة معه هي مصدر الحقيقة
/// الوحيد للتوقيت الفعلي — منطقة الجهاز هنا لا تغيّر متى يُطلَق المنبّه،
/// فلا حاجة لاكتشافها عبر حزمة إضافية؛ منطقة الخادم كافية لبناء `TZDateTime`.
const String _serverZone = 'Asia/Jerusalem';

/// التطبيق الحقيقي لبوّابة المنبّه فوق `flutter_local_notifications`. جدولة
/// **غير دقيقة** (`inexactAllowWhileIdle`) عمداً — قرار المواصفة، لأنّ الدقيقة
/// تتطلّب إذن `SCHEDULE_EXACT_ALARM` الذي يمنحه المستخدم يدوياً ولن يفعل
/// غالباً.
class FlutterLocalNotificationsReminderAlarms implements ReminderAlarms {
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> _ensureInitialized() async {
    if (_initialized) return;

    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation(_serverZone));

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    // طلب الإذن هنا معطَّل عمداً على iOS — لا يُطلب إلا عند إضافة تذكير
    // فعلياً (requestPermission أدناه)، لا عند إقلاع التطبيق.
    const darwinSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _plugin.initialize(
      settings: const InitializationSettings(android: androidSettings, iOS: darwinSettings),
    );
    _initialized = true;
  }

  @override
  Future<bool> requestPermission() async {
    await _ensureInitialized();
    if (kIsWeb) return true;

    if (Platform.isAndroid) {
      final granted = await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      return granted ?? true;
    }
    if (Platform.isIOS) {
      final granted = await _plugin
          .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(alert: true, badge: true, sound: true);
      return granted ?? true;
    }
    // منصّات أخرى (سطح مكتب أثناء التطوير مثلاً) — لا تدعم التذكير المحلي
    // أصلاً هنا، فلا داعٍ لتحذير المستخدم بشأنها.
    return true;
  }

  @override
  Future<void> schedule({
    required int id,
    required String title,
    required String body,
    required DateTime fireAt,
  }) async {
    await _ensureInitialized();
    final scheduledDate = tz.TZDateTime.from(fireAt, tz.local);
    await _plugin.zonedSchedule(
      id: id,
      title: title,
      body: body,
      scheduledDate: scheduledDate,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: _channelDescription,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    );
  }

  @override
  Future<void> cancel(int id) async {
    await _ensureInitialized();
    await _plugin.cancel(id: id);
  }

  @override
  Future<void> cancelAllScheduled() async {
    await _ensureInitialized();
    await _plugin.cancelAll();
  }

  @override
  Future<List<int>> pendingIds() async {
    await _ensureInitialized();
    final pending = await _plugin.pendingNotificationRequests();
    return pending.map((request) => request.id).toList();
  }
}
