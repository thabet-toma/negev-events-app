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
  final String? secondaryLocationName;
  final double? latitude;
  final double? longitude;
  final String eventDate;
  final String? eventEndDate;
  final String? youthPartyDate;
  final String dinnerTime;
  final String? posterUrl;
  final String? audioUrl;
  final String? audioTitle;
  final String? hostPhone;
  final int viewsCount;
  final Map<String, int> reactions;
  final List<Congratulation> congratulations;
  final OccasionType? occasionType;
  final List<Honoree> honorees;

  /// `null` يعني أنّ المفتاح غاب من استجابة الخادم (النوع مطفئ عرضه) — لا صفر.
  final int? congratulationsCount;
  final LatestCongratulation? latestCongratulation;

  /// `null` يعني أنّ المفتاح غاب من استجابة الخادم (النوع مطفئ عرضه) — لا صفر.
  final int? followersCount;
  final bool isReminded;

  /// `pending` / `approved` / `rejected` — يصل فقط من نقاط تُعيد الصف كاملاً
  /// (`GET /api/events/:id`، `GET /api/my-events`)؛ القائمة العامة تُسقطه
  /// عمداً (events.service.js LIST_COLUMNS) فيبقى `null` هناك.
  final String? status;

  const Event({
    required this.id,
    required this.title,
    required this.groomName,
    required this.familyClan,
    required this.town,
    required this.locationName,
    required this.eventDate,
    required this.dinnerTime,
    this.secondaryLocationName,
    this.latitude,
    this.longitude,
    this.eventEndDate,
    this.youthPartyDate,
    this.posterUrl,
    this.audioUrl,
    this.audioTitle,
    this.hostPhone,
    this.viewsCount = 0,
    this.reactions = const {},
    this.congratulations = const [],
    this.occasionType,
    this.honorees = const [],
    this.congratulationsCount,
    this.latestCongratulation,
    this.followersCount,
    this.isReminded = false,
    this.status,
  });

  int get totalReactions =>
      reactions.values.fold(0, (sum, value) => sum + value);

  /// نسخة بحالة تذكير محدَّثة — تحدّث محلياً بعد نجاح POST/DELETE .../remind
  /// دون إعادة جلب الصفحة كاملة فتفقد ما تراكم من "عرض المزيد".
  Event copyWithReminder({required bool isReminded, int? followersCount}) => Event(
        id: id,
        title: title,
        groomName: groomName,
        familyClan: familyClan,
        town: town,
        locationName: locationName,
        secondaryLocationName: secondaryLocationName,
        latitude: latitude,
        longitude: longitude,
        eventDate: eventDate,
        dinnerTime: dinnerTime,
        eventEndDate: eventEndDate,
        youthPartyDate: youthPartyDate,
        posterUrl: posterUrl,
        audioUrl: audioUrl,
        audioTitle: audioTitle,
        hostPhone: hostPhone,
        viewsCount: viewsCount,
        reactions: reactions,
        congratulations: congratulations,
        occasionType: occasionType,
        honorees: honorees,
        congratulationsCount: congratulationsCount,
        latestCongratulation: latestCongratulation,
        followersCount: followersCount,
        isReminded: isReminded,
        status: status,
      );

  /// عنوان بديل حين لا عنوان مخصّص — من النوع وأصحاب المناسبة، لا نص فرح ثابت.
  String get displayTitle {
    if (title.isNotEmpty) return title;
    final honoreeName = honorees.isNotEmpty ? honorees.first.name : groomName;
    final typeName = occasionType?.name ?? '';
    if (honoreeName.isEmpty) return typeName;
    return typeName.isEmpty ? honoreeName : '$typeName — $honoreeName';
  }

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

    final rawType = json['occasion_type'];
    final occasionType =
        rawType is Map<String, dynamic> ? OccasionType.fromJson(rawType) : null;

    final rawHonorees = json['honorees'];
    final honorees = rawHonorees is List
        ? rawHonorees.whereType<Map<String, dynamic>>().map(Honoree.fromJson).toList()
        : <Honoree>[];

    final rawLatest = json['latest_congratulation'];

    return Event(
      id: _toInt(json['id']),
      title: '${json['title'] ?? ''}',
      groomName: '${json['groom_name'] ?? ''}',
      familyClan: '${json['family_clan'] ?? ''}',
      town: '${json['town'] ?? ''}',
      locationName: '${json['location_name'] ?? ''}',
      secondaryLocationName: _nullableString(json['secondary_location_name']),
      latitude: _toDouble(json['latitude']),
      longitude: _toDouble(json['longitude']),
      eventDate: _toDate(json['event_date']),
      eventEndDate: json['event_end_date'] == null
          ? null
          : _toDate(json['event_end_date']),
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
      occasionType: occasionType,
      honorees: honorees,
      congratulationsCount: json.containsKey('congratulations_count')
          ? _toInt(json['congratulations_count'])
          : null,
      latestCongratulation: rawLatest is Map<String, dynamic>
          ? LatestCongratulation.fromJson(rawLatest)
          : null,
      followersCount: json.containsKey('followers_count')
          ? _toInt(json['followers_count'])
          : null,
      isReminded: json['is_reminded'] == true,
      status: _nullableString(json['status']),
    );
  }
}

/// تبريكة على مناسبة.
class Congratulation {
  final int id;
  final String senderName;
  final String? badgeTitle;
  final String message;
  final String? createdAt;
  final String? status;

  const Congratulation({
    required this.id,
    required this.senderName,
    required this.message,
    this.badgeTitle,
    this.createdAt,
    this.status,
  });

  /// معلَّقة ولم تُعتمد بعد — لا يراها إلا مُرسِلها (الخادم لا يبثّها لغيره).
  bool get isPending => status == 'pending';

  factory Congratulation.fromJson(Map<String, dynamic> json) => Congratulation(
        id: _toInt(json['id']),
        senderName: '${json['sender_name'] ?? ''}',
        // شارة فارغة تبقى فارغة — لا بديل ثابت («مبارك الفرح») يُحقَن هنا.
        badgeTitle: _nullableString(json['badge_title']),
        message: '${json['message'] ?? ''}',
        createdAt: _nullableString(json['created_at']),
        status: _nullableString(json['status']),
      );
}

/// آخر تبريكة على مناسبة — من `latest_congratulation` في GET /api/events.
class LatestCongratulation {
  final String senderName;
  final String message;
  final String? createdAt;

  const LatestCongratulation({
    required this.senderName,
    required this.message,
    this.createdAt,
  });

  factory LatestCongratulation.fromJson(Map<String, dynamic> json) =>
      LatestCongratulation(
        senderName: '${json['sender_name'] ?? ''}',
        message: '${json['message'] ?? ''}',
        createdAt: _nullableString(json['created_at']),
      );
}

/// صاحب مناسبة واحد — عرس له عريس (وربما عروس)، عزاء له متوفَّى، وهكذا.
class Honoree {
  final String name;
  final String? role;
  final int position;

  const Honoree({required this.name, this.role, this.position = 0});

  factory Honoree.fromJson(Map<String, dynamic> json) => Honoree(
        name: '${json['name'] ?? ''}',
        role: _nullableString(json['role']),
        position: _toInt(json['position']),
      );
}

/// حقل واحد من إعداد نوع المناسبة — من GET /api/occasion-types.
class OccasionTypeField {
  final String fieldKey;
  final String label;
  final bool isVisible;
  final bool isRequired;
  final int position;

  const OccasionTypeField({
    required this.fieldKey,
    required this.label,
    required this.isVisible,
    required this.isRequired,
    required this.position,
  });

  factory OccasionTypeField.fromJson(Map<String, dynamic> json) =>
      OccasionTypeField(
        fieldKey: '${json['field_key'] ?? ''}',
        label: '${json['label'] ?? ''}',
        isVisible: json['is_visible'] == true,
        isRequired: json['is_required'] == true,
        position: _toInt(json['position']),
      );
}

/// نوع مناسبة — بيانات وقت تشغيل من GET /api/occasion-types، لا ثابت في العميل.
class OccasionType {
  final int id;
  final String name;
  final String icon;
  final String color;
  final int position;
  final bool isActive;
  final bool createsCollision;
  final bool warnsOthers;
  final bool premoderateMessages;
  final bool showCongratulationsCount;
  final bool showFollowersCount;
  final bool showViewsCount;
  final String congratulationsLabel;
  final String? defaultBadgeTitle;
  final String? defaultPosterUrl;
  final bool legacyClientSupported;
  final String tone;
  final List<OccasionTypeField> fields;
  final List<String> reactions;

  const OccasionType({
    required this.id,
    required this.name,
    required this.icon,
    required this.color,
    required this.position,
    required this.isActive,
    required this.createsCollision,
    required this.warnsOthers,
    required this.premoderateMessages,
    required this.showCongratulationsCount,
    required this.showFollowersCount,
    required this.showViewsCount,
    required this.congratulationsLabel,
    required this.legacyClientSupported,
    required this.tone,
    this.defaultBadgeTitle,
    this.defaultPosterUrl,
    this.fields = const [],
    this.reactions = const [],
  });

  /// حصراً من `tone` — لا فحص على اسم النوع في أي مكان.
  bool get isSolemn => tone == 'solemn';

  /// `fields` تصل مرشَّحة مسبقاً من الخادم على `is_visible = 1`.
  bool showsField(String key) => fields.any((field) => field.fieldKey == key);

  String? labelFor(String key) {
    for (final field in fields) {
      if (field.fieldKey == key) return field.label;
    }
    return null;
  }

  bool isRequiredField(String key) =>
      fields.any((field) => field.fieldKey == key && field.isRequired);

  factory OccasionType.fromJson(Map<String, dynamic> json) {
    final rawFields = json['fields'];
    final fields = rawFields is List
        ? rawFields
            .whereType<Map<String, dynamic>>()
            .map(OccasionTypeField.fromJson)
            .toList()
        : <OccasionTypeField>[];

    final rawReactions = json['reactions'];
    final reactions =
        rawReactions is List ? rawReactions.map((r) => '$r').toList() : <String>[];

    return OccasionType(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      icon: '${json['icon'] ?? ''}',
      color: '${json['color'] ?? ''}',
      position: _toInt(json['position']),
      isActive: json['is_active'] == true,
      createsCollision: json['creates_collision'] == true,
      warnsOthers: json['warns_others'] == true,
      premoderateMessages: json['premoderate_messages'] == true,
      showCongratulationsCount: json['show_congratulations_count'] == true,
      showFollowersCount: json['show_followers_count'] == true,
      showViewsCount: json['show_views_count'] == true,
      congratulationsLabel: '${json['congratulations_label'] ?? ''}',
      defaultBadgeTitle: _nullableString(json['default_badge_title']),
      defaultPosterUrl: _nullableString(json['default_poster_url']),
      legacyClientSupported: json['legacy_client_supported'] == true,
      tone: '${json['tone'] ?? 'festive'}',
      fields: fields,
      reactions: reactions,
    );
  }
}

/// نقطة على الخريطة — من GET /api/map/events. لا يحمل نوع المناسبة (الخادم لا يرسله هنا).
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

  /// عنوان بديل محايد حين لا عنوان مخصّص — لا نوع مناسبة معروف هنا فلا يُخترع.
  String get displayTitle => title.isEmpty ? groomName : title;

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
  final bool isAd;
  final String? advertiserName;
  final String? targetUrl;
  final int slideDurationSeconds;

  const Story({
    required this.id,
    required this.title,
    this.clan,
    this.town,
    this.image,
    this.isLive = false,
    this.isAd = false,
    this.advertiserName,
    this.targetUrl,
    this.slideDurationSeconds = _defaultSlideDurationSeconds,
  });

  /// سقوط وحيد حين يغيب `slide_duration_seconds` من ردّ قديم — الخادم يرسل
  /// القيمة الفعلية دائماً لكل قصة على حدة (افتراضه هناك أيضاً ٥)، فهذا
  /// الرقم لا يُستعمل إلا حين يغيب المفتاح نفسه من الاستجابة.
  static const int _defaultSlideDurationSeconds = 5;

  factory Story.fromJson(Map<String, dynamic> json) => Story(
        id: _toInt(json['id']),
        title: '${json['title'] ?? ''}',
        clan: _nullableString(json['clan']),
        town: _nullableString(json['town']),
        image: _nullableString(json['image']),
        isLive: json['isLive'] == true || _toInt(json['is_live']) == 1,
        isAd: json['is_ad'] == true,
        advertiserName: _nullableString(json['advertiser_name']),
        targetUrl: _nullableString(json['target_url']),
        slideDurationSeconds: _slideDuration(json['slide_duration_seconds']),
      );

  /// مدّة غير موجبة تجعل `AnimationController` يكتمل فور انطلاقه، فيقفز
  /// العارض عبر كل القصص ويُغلق نفسه — عطلٌ كامل لا تدهور. الخادم لا ينتج
  /// هذه القيمة اليوم (`parseId` يرفضها والعمود `NOT NULL DEFAULT 5`)، لكن
  /// العارض لا يجب أن يتوقّف سلامته على ذلك.
  static int _slideDuration(Object? raw) {
    if (raw == null) return _defaultSlideDurationSeconds;
    final seconds = _toInt(raw);
    return seconds > 0 ? seconds : _defaultSlideDurationSeconds;
  }
}

/// معلومات ترقيم صفحات — من `pagination` في GET /api/events.
class Pagination {
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const Pagination({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  bool get hasMore => page < totalPages;

  factory Pagination.fromJson(Map<String, dynamic> json) => Pagination(
        page: _toInt(json['page']),
        limit: _toInt(json['limit']),
        total: _toInt(json['total']),
        totalPages: _toInt(json['totalPages']),
      );
}

/// إعلان تعديل تاريخ/مكان مناسبة — من `announcements` في GET /api/events.
/// بلا نوع مناسبة كامل (`occasion_type_id` وحده) — فلا شارة نوع تُبنى عليه.
class Announcement {
  final int id;
  final int eventId;
  final String oldValue;
  final String newValue;
  final String? publishedAt;
  final AnnouncementEvent event;

  const Announcement({
    required this.id,
    required this.eventId,
    required this.oldValue,
    required this.newValue,
    required this.event,
    this.publishedAt,
  });

  factory Announcement.fromJson(Map<String, dynamic> json) {
    final rawEvent = json['event'];
    return Announcement(
      id: _toInt(json['id']),
      eventId: _toInt(json['event_id']),
      oldValue: '${json['old_value'] ?? ''}',
      newValue: '${json['new_value'] ?? ''}',
      publishedAt: _nullableString(json['published_at']),
      event: rawEvent is Map<String, dynamic>
          ? AnnouncementEvent.fromJson(rawEvent)
          : AnnouncementEvent.fromJson(const {}),
    );
  }
}

/// المناسبة المرفقة بإعلان — حقول مختصرة فقط، بلا نوع مناسبة كامل.
class AnnouncementEvent {
  final int id;
  final String title;
  final String groomName;
  final String town;
  final String eventDate;
  final String? eventEndDate;
  final int? occasionTypeId;
  final String? posterUrl;

  const AnnouncementEvent({
    required this.id,
    required this.title,
    required this.groomName,
    required this.town,
    required this.eventDate,
    this.eventEndDate,
    this.occasionTypeId,
    this.posterUrl,
  });

  String get displayTitle => title.isEmpty ? groomName : title;

  factory AnnouncementEvent.fromJson(Map<String, dynamic> json) => AnnouncementEvent(
        id: _toInt(json['id']),
        title: '${json['title'] ?? ''}',
        groomName: '${json['groom_name'] ?? ''}',
        town: '${json['town'] ?? ''}',
        eventDate: _toDate(json['event_date']),
        eventEndDate:
            json['event_end_date'] == null ? null : _toDate(json['event_end_date']),
        occasionTypeId:
            json['occasion_type_id'] == null ? null : _toInt(json['occasion_type_id']),
        posterUrl: _nullableString(json['poster_url']),
      );
}

/// سطر واحد في سجلّ تعديلات مناسبة — من GET /api/events/:id/amendments.
/// التصنيف (`critical`/`cosmetic`) وحالة الصفّ (`pending`/`approved`/`rejected`)
/// من الخادم وحده، لا تُشتقّان هنا.
class Amendment {
  final int id;
  final String field;
  final String? oldValue;
  final String? newValue;
  final String classification;
  final String status;
  final String? createdAt;
  final String? changedByName;

  const Amendment({
    required this.id,
    required this.field,
    required this.classification,
    required this.status,
    this.oldValue,
    this.newValue,
    this.createdAt,
    this.changedByName,
  });

  bool get isCritical => classification == 'critical';

  factory Amendment.fromJson(Map<String, dynamic> json) => Amendment(
        id: _toInt(json['id']),
        field: '${json['field'] ?? ''}',
        oldValue: _nullableString(json['old_value']),
        newValue: _nullableString(json['new_value']),
        classification: '${json['classification'] ?? 'cosmetic'}',
        status: '${json['status'] ?? 'approved'}',
        createdAt: _nullableString(json['created_at']),
        changedByName: _nullableString(json['changed_by_name']),
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
