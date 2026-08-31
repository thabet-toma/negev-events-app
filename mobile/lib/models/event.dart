/// مناسبة — الحقول مطابقة لجدول `events` في الخادم.
///
/// روابط الوسائط تصل **مطلقة** من الخادم (withAbsoluteMedia)، فلا يبني التطبيق
/// أي عنوان بنفسه.
class Event {
  final int id;
  final String title;
  final String groomName;
  final String familyClan;
  final String town;
  final String locationName;
  final double? latitude;
  final double? longitude;
  final String eventDate;
  final String? youthPartyDate;
  final String dinnerTime;
  final String? posterUrl;
  final String? audioUrl;
  final String? audioTitle;
  final String? hostPhone;
  final int viewsCount;
  final Map<String, int> reactions;
  final List<Congratulation> congratulations;

  const Event({
    required this.id,
    required this.title,
    required this.groomName,
    required this.familyClan,
    required this.town,
    required this.locationName,
    required this.eventDate,
    required this.dinnerTime,
    this.latitude,
    this.longitude,
    this.youthPartyDate,
    this.posterUrl,
    this.audioUrl,
    this.audioTitle,
    this.hostPhone,
    this.viewsCount = 0,
    this.reactions = const {},
    this.congratulations = const [],
  });

  int get totalReactions =>
      reactions.values.fold(0, (sum, value) => sum + value);

  factory Event.fromJson(Map<String, dynamic> json) {
    final rawReactions = json['reactions'];
    final reactions = <String, int>{};
    if (rawReactions is Map) {
      rawReactions.forEach((key, value) {
        reactions['$key'] = _toInt(value);
      });
    }

    final rawCongrats = json['congratulations'];
    final congratulations = rawCongrats is List
        ? rawCongrats
            .whereType<Map<String, dynamic>>()
            .map(Congratulation.fromJson)
            .toList()
        : <Congratulation>[];

    return Event(
      id: _toInt(json['id']),
      title: '${json['title'] ?? ''}',
      groomName: '${json['groom_name'] ?? ''}',
      familyClan: '${json['family_clan'] ?? ''}',
      town: '${json['town'] ?? ''}',
      locationName: '${json['location_name'] ?? ''}',
      latitude: _toDouble(json['latitude']),
      longitude: _toDouble(json['longitude']),
      eventDate: _toDate(json['event_date']),
      youthPartyDate: json['youth_party_date'] == null
          ? null
          : _toDate(json['youth_party_date']),
      dinnerTime: '${json['dinner_time'] ?? ''}',
      posterUrl: _nullableString(json['poster_url']),
      audioUrl: _nullableString(json['audio_url']),
      audioTitle: _nullableString(json['audio_title']),
      hostPhone: _nullableString(json['host_phone']),
      viewsCount: _toInt(json['views_count']),
      reactions: reactions,
      congratulations: congratulations,
    );
  }
}

/// تبريكة على مناسبة.
class Congratulation {
  final int id;
  final String senderName;
  final String badgeTitle;
  final String message;
  final String? createdAt;

  const Congratulation({
    required this.id,
    required this.senderName,
    required this.badgeTitle,
    required this.message,
    this.createdAt,
  });

  factory Congratulation.fromJson(Map<String, dynamic> json) => Congratulation(
        id: _toInt(json['id']),
        senderName: '${json['sender_name'] ?? ''}',
        badgeTitle: '${json['badge_title'] ?? 'مبارك الفرح'}',
        message: '${json['message'] ?? ''}',
        createdAt: _nullableString(json['created_at']),
      );
}

/// نقطة على الخريطة — من GET /api/map/events.
class MapPoint {
  final int id;
  final String title;
  final String groomName;
  final String town;
  final String eventDate;
  final String locationName;
  final String? posterUrl;
  final double latitude;
  final double longitude;
  final String? wazeUrl;

  const MapPoint({
    required this.id,
    required this.title,
    required this.groomName,
    required this.town,
    required this.eventDate,
    required this.locationName,
    required this.latitude,
    required this.longitude,
    this.posterUrl,
    this.wazeUrl,
  });

  factory MapPoint.fromJson(Map<String, dynamic> json) => MapPoint(
        id: _toInt(json['id']),
        title: '${json['title'] ?? ''}',
        groomName: '${json['groom_name'] ?? ''}',
        town: '${json['town'] ?? ''}',
        eventDate: _toDate(json['event_date']),
        locationName: '${json['location_name'] ?? ''}',
        latitude: _toDouble(json['latitude']) ?? 0,
        longitude: _toDouble(json['longitude']) ?? 0,
        posterUrl: _nullableString(json['poster_url']),
        wazeUrl: _nullableString(json['waze_url']),
      );
}

/// قصة مباشرة — من GET /api/stories.
class Story {
  final int id;
  final String title;
  final String? clan;
  final String? town;
  final String? image;
  final bool isLive;

  const Story({
    required this.id,
    required this.title,
    this.clan,
    this.town,
    this.image,
    this.isLive = false,
  });

  factory Story.fromJson(Map<String, dynamic> json) => Story(
        id: _toInt(json['id']),
        title: '${json['title'] ?? ''}',
        clan: _nullableString(json['clan']),
        town: _nullableString(json['town']),
        image: _nullableString(json['image']),
        isLive: json['isLive'] == true || _toInt(json['is_live']) == 1,
      );
}

// --- مساعدات تحويل ------------------------------------------------

int _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}

double? _toDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

String? _nullableString(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}

/// MySQL يرجّع DATE كسلسلة ISO كاملة أحياناً — نأخذ الجزء اليومي فقط.
String _toDate(dynamic value) {
  final text = '${value ?? ''}';
  if (text.isEmpty) return '';
  final parsed = DateTime.tryParse(text);
  if (parsed == null) return text;
  final month = parsed.month.toString().padLeft(2, '0');
  final day = parsed.day.toString().padLeft(2, '0');
  return '${parsed.year}-$month-$day';
}
