/// إشعار داخل التطبيق — من GET /api/notifications. تسليم النظام (FCM) خارج
/// النطاق (محبوس على #19)؛ هذا مركز إشعارات داخل الصفحة فقط.
class AppNotification {
  final int id;
  final int? eventId;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final String? createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.isRead,
    this.eventId,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: _toInt(json['id']),
        eventId: json['event_id'] == null ? null : _toInt(json['event_id']),
        type: '${json['type'] ?? ''}',
        title: '${json['title'] ?? ''}',
        body: '${json['body'] ?? ''}',
        isRead: json['is_read'] == true || _toInt(json['is_read']) == 1,
        createdAt: json['created_at'] == null ? null : '${json['created_at']}',
      );
}

int _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}
