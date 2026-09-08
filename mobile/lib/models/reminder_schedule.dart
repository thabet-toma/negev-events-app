/// خطّة التذكير — من GET /api/reminders/schedule. الخادم يحسب `fires_on`
/// كاملاً (٩:٠٠ بتوقيت أورشليم القدس، مع التوقيت الصيفي) كلحظة UTC مطلَقة؛
/// العميل لا يعيد اشتقاق الساعة، فقط يحوّلها إلى منبّه محلي
/// (reminder_scheduler.dart).
class ReminderOffset {
  final int daysBefore;
  final DateTime firesOn;

  const ReminderOffset({required this.daysBefore, required this.firesOn});

  factory ReminderOffset.fromJson(Map<String, dynamic> json) => ReminderOffset(
        daysBefore: _toInt(json['days_before']),
        firesOn: DateTime.parse('${json['fires_on']}').toUtc(),
      );
}

/// مناسبة واحدة ضمن الخطّة — فقط لنوع نشِط `notify_countdown`، وفقط
/// الفواصل التي لا تزال في المستقبل (الخادم يستبعد الباقي بنفسه).
class ReminderScheduleEntry {
  final int eventId;
  final String title;
  final String eventDate;
  final List<ReminderOffset> offsets;

  const ReminderScheduleEntry({
    required this.eventId,
    required this.title,
    required this.eventDate,
    required this.offsets,
  });

  factory ReminderScheduleEntry.fromJson(Map<String, dynamic> json) {
    final rawOffsets = json['offsets'];
    final offsets = rawOffsets is List
        ? rawOffsets.whereType<Map<String, dynamic>>().map(ReminderOffset.fromJson).toList()
        : <ReminderOffset>[];

    return ReminderScheduleEntry(
      eventId: _toInt(json['event_id']),
      title: '${json['title'] ?? ''}',
      eventDate: '${json['event_date'] ?? ''}',
      offsets: offsets,
    );
  }
}

int _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}
