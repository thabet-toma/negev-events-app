/// يحوّل تاريخ MySQL (قد يصل كسلسلة ISO كاملة) إلى YYYY-MM-DD.
String _dayOnly(dynamic value) {
  final text = '${value ?? ''}';
  if (text.isEmpty) return '';
  final parsed = DateTime.tryParse(text);
  if (parsed == null) return text;
  final month = parsed.month.toString().padLeft(2, '0');
  final day = parsed.day.toString().padLeft(2, '0');
  return '${parsed.year}-$month-$day';
}

double _toDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('${value ?? ''}') ?? 0;
}

/// قيد في دفتر النقوط. الدفتر خاص بالمستخدم على مستوى الاستعلام في الخادم.
class NokootRecord {
  final int id;
  final String recipientName;
  final String? clanTown;
  final double amount;
  final String currency;
  final String occasionType;
  final String eventDate;
  final String? notes;

  const NokootRecord({
    required this.id,
    required this.recipientName,
    required this.amount,
    required this.currency,
    required this.occasionType,
    required this.eventDate,
    this.clanTown,
    this.notes,
  });

  factory NokootRecord.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    return NokootRecord(
      id: rawId is int ? rawId : int.tryParse('$rawId') ?? 0,
      recipientName: '${json['recipient_name'] ?? ''}',
      clanTown: json['clan_town'] == null ? null : '${json['clan_town']}',
      amount: _toDouble(json['amount']),
      currency: '${json['currency'] ?? 'ILS'}',
      occasionType: '${json['occasion_type'] ?? 'عرس'}',
      eventDate: _dayOnly(json['event_date']),
      notes: json['notes'] == null ? null : '${json['notes']}',
    );
  }
}

/// الدفتر كاملاً مع الإجماليات — شكل استجابة GET /api/nokoot.
class NokootLedger {
  final double totalAmount;
  final int count;
  final List<NokootRecord> records;
  final Map<String, double> townBreakdown;
  final double averageNokoot;

  const NokootLedger({
    required this.totalAmount,
    required this.count,
    required this.records,
    required this.townBreakdown,
    required this.averageNokoot,
  });

  static const empty = NokootLedger(
    totalAmount: 0,
    count: 0,
    records: [],
    townBreakdown: {},
    averageNokoot: 0,
  );

  factory NokootLedger.fromJson(Map<String, dynamic> json) {
    final rawRecords = json['records'];
    final analytics = json['analytics'];

    final breakdown = <String, double>{};
    if (analytics is Map && analytics['townBreakdown'] is Map) {
      (analytics['townBreakdown'] as Map).forEach((key, value) {
        breakdown['$key'] = _toDouble(value);
      });
    }

    return NokootLedger(
      totalAmount: _toDouble(json['totalAmount']),
      count: json['count'] is int ? json['count'] as int : 0,
      records: rawRecords is List
          ? rawRecords
              .whereType<Map<String, dynamic>>()
              .map(NokootRecord.fromJson)
              .toList()
          : const [],
      townBreakdown: breakdown,
      averageNokoot: analytics is Map
          ? _toDouble(analytics['averageNokoot'])
          : 0,
    );
  }
}
