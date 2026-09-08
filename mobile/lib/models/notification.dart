/// نبرة تعميم — من `broadcasts.tone` على الخادم حصراً، لا حساب في العميل.
/// عرَّفناها مرّة واحدة هنا كي لا تتكرّر قائمة القيم في أكثر من ملف.
enum BroadcastTone { info, urgent, solemn }

BroadcastTone _toneFromString(String? raw) {
  switch (raw) {
    case 'urgent':
      return BroadcastTone.urgent;
    case 'solemn':
      return BroadcastTone.solemn;
    default:
      return BroadcastTone.info;
  }
}

/// سطر واحد في مركز الإشعارات — من GET /api/notifications، قائمة مدموجة على
/// الخادم من شكلين مختلفين حقاً (notifications.service.js#listForUser):
///
///   * إشعار شخصي: `id`, `type`, `title`, `body`, `event_id`, `is_read`, `created_at`
///   * تعميم: `broadcast_id` (لا `id` إطلاقاً), `type`, `title`, `body`, `tone`,
///     `expires_at`, `is_read`, `created_at`
///
/// التمييز هنا **بنيوي** — أيّ مفتاح معرّف موجود — لا بحسب `type`، لأنّ
/// `notifications.type` عمود نصّ حرّ زاده الخادم بستّ قيم جديدة في الدفعة ٥ج؛
/// فحص عليه هنا كان سينكسر على أوّل قيمة لم تُذكر هنا صراحة. نفس انضباط
/// `isBroadcastEntry` في web/app.js.
class AppNotification {
  final int? id;
  final int? broadcastId;
  final int? eventId;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final String? createdAt;
  final BroadcastTone? tone;

  const AppNotification({
    this.id,
    this.broadcastId,
    required this.type,
    required this.title,
    required this.body,
    required this.isRead,
    this.eventId,
    this.createdAt,
    this.tone,
  });

  bool get isBroadcast => broadcastId != null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final broadcastId =
        json['broadcast_id'] == null ? null : _toInt(json['broadcast_id']);

    return AppNotification(
      id: broadcastId == null && json['id'] != null ? _toInt(json['id']) : null,
      broadcastId: broadcastId,
      eventId: json['event_id'] == null ? null : _toInt(json['event_id']),
      type: '${json['type'] ?? ''}',
      title: '${json['title'] ?? ''}',
      body: '${json['body'] ?? ''}',
      isRead: json['is_read'] == true || _toInt(json['is_read']) == 1,
      createdAt: json['created_at'] == null ? null : '${json['created_at']}',
      tone: broadcastId == null ? null : _toneFromString(json['tone'] as String?),
    );
  }
}

int _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}
