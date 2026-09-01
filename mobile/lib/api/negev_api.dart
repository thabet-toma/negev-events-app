import 'package:http/http.dart' as http;

import '../models/event.dart';
import '../models/nokoot.dart';
import '../models/notification.dart';
import '../models/user.dart';
import 'api_client.dart';

/// كل نقاط الخادم في مكان واحد — نفس العقد الموثّق في README.
class NegevApi {
  NegevApi(this._client);

  final ApiClient _client;

  ApiClient get client => _client;

  // --- عام ---------------------------------------------------------

  /// صفحة من المناسبات العامة — القادمة افتراضياً، `archive: true` للمنتهية.
  /// الترشيح كله على الخادم؛ لا تُرشَّح النتيجة ثانيةً في العميل.
  Future<EventsPage> listEvents({
    String? town,
    String? search,
    int? occasionTypeId,
    bool archive = false,
    int page = 1,
    int limit = 30,
  }) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};
    if (town != null && town.isNotEmpty && town != 'الكل') query['town'] = town;
    if (search != null && search.trim().isNotEmpty) {
      query['search'] = search.trim();
    }
    if (occasionTypeId != null) query['occasion_type_id'] = '$occasionTypeId';
    if (archive) query['archive'] = '1';

    final data = await _client.get('/api/events', query: query);
    final list = data['events'];
    final events = list is List
        ? list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList()
        : <Event>[];

    final rawPagination = data['pagination'];
    final pagination = rawPagination is Map<String, dynamic>
        ? Pagination.fromJson(rawPagination)
        : Pagination(page: page, limit: limit, total: events.length, totalPages: 1);

    final rawAnnouncements = data['announcements'];
    final announcements = rawAnnouncements is List
        ? rawAnnouncements
            .whereType<Map<String, dynamic>>()
            .map(Announcement.fromJson)
            .toList()
        : <Announcement>[];

    return EventsPage(events: events, pagination: pagination, announcements: announcements);
  }

  /// مراكز البلدات — من GET /api/towns. `lib/config.dart` يحمل أسماء البلدات
  /// فقط؛ الإحداثيات من الخادم حصراً (كانت مغلوطة حتى ٨.٤ كم حين عاشت في
  /// العميل — نسخة ثانية تعني عطلاً يُصحَّح مرّتين). 'القرى والتجمعات' سلّة
  /// تجميع لا مكان، فلا مدخل لها هنا عمداً.
  Future<Map<String, TownCoordinate>> townCoordinates() async {
    final data = await _client.get('/api/towns');
    final raw = data['town_coordinates'];
    final result = <String, TownCoordinate>{};
    if (raw is Map) {
      raw.forEach((key, value) {
        if (value is! Map) return;
        final lat = value['lat'];
        final lng = value['lng'];
        final latD = lat is num ? lat.toDouble() : double.tryParse('$lat');
        final lngD = lng is num ? lng.toDouble() : double.tryParse('$lng');
        if (latD != null && lngD != null) {
          result['$key'] = TownCoordinate(lat: latD, lng: lngD);
        }
      });
    }
    return result;
  }

  /// أنواع المناسبات النشِطة، مرتّبة، وبحقول كل نوع وتفاعلاته — لا قائمة ثابتة.
  Future<List<OccasionType>> listOccasionTypes() async {
    final data = await _client.get('/api/occasion-types');
    final list = data['types'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(OccasionType.fromJson)
        .toList();
  }

  Future<Event> eventDetails(int id) async {
    final data = await _client.get('/api/events/$id');
    final event = data['event'];
    if (event is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات المناسبة');
    }
    return Event.fromJson(event);
  }

  Future<List<MapPoint>> mapPoints() async {
    final data = await _client.get('/api/map/events');
    final list = data['points'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(MapPoint.fromJson)
        .toList();
  }

  Future<List<Story>> stories() async {
    final data = await _client.get('/api/stories');
    final list = data['stories'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(Story.fromJson).toList();
  }

  /// تسجيل مشاهدة شريحة ستوري — عتبة "شوهدت" (ثانيتان) يقيسها العارض على
  /// الجهاز، لا هذا النداء نفسه؛ يُستدعى فقط بعدما بقيت الشريحة ظاهرة فعلاً.
  /// `auth: true` لتُنسَب لحساب المستخدم إن كان مسجَّلاً (الخادم يفضّله على
  /// device_id)، و`deviceId` يُرسَل دائماً لتغطية الزائر أيضاً.
  Future<void> viewStory(int storyId, {required String deviceId}) async {
    await _client.post(
      '/api/stories/$storyId/view',
      auth: true,
      body: {'device_id': deviceId},
    );
  }

  /// تسجيل نقرة على قصة — بلا حدّ تكرار على الخادم، كل نقرة حقيقية.
  Future<void> clickStory(int storyId, {required String deviceId}) async {
    await _client.post(
      '/api/stories/$storyId/click',
      auth: true,
      body: {'device_id': deviceId},
    );
  }

  /// إبلاغ عن قصة — مرّة واحدة لكل مستخدم، يتطلّب حساباً.
  Future<void> reportStory(int storyId) async {
    await _client.post('/api/stories/$storyId/report', auth: true);
  }

  Future<void> react(int eventId, String type, String identifier) async {
    await _client.post(
      '/api/events/$eventId/react',
      body: {'reaction_type': type, 'user_identifier': identifier},
    );
  }

  /// الهوية تُبنى من الحساب على الخادم — لا اسم ولا شارة يُرسَلان من العميل.
  Future<Congratulation> congratulate(int eventId, {required String message}) async {
    final data = await _client.post(
      '/api/events/$eventId/congratulate',
      auth: true,
      body: {'message': message},
    );
    final comment = data['comment'];
    if (comment is! Map<String, dynamic>) {
      throw const ApiException('تعذّر حفظ التبريكة');
    }
    return Congratulation.fromJson(comment);
  }

  /// «ذكّرني» — متابعة، لا حضور ولا "لن أحضر". يتطلب حساباً.
  Future<void> remind(int eventId) async {
    await _client.post('/api/events/$eventId/remind', auth: true);
  }

  Future<void> unremind(int eventId) async {
    await _client.delete('/api/events/$eventId/remind', auth: true);
  }

  /// طابور مراجعة رسائل مناسبة — للمالك أو الإدارة فقط (403 لغيرهم).
  Future<List<Congratulation>> moderationQueue(int eventId, {String? status}) async {
    final query = status == null ? null : {'status': status};
    final data = await _client.get(
      '/api/events/$eventId/congratulations',
      query: query,
      auth: true,
    );
    final list = data['comments'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(Congratulation.fromJson).toList();
  }

  Future<Congratulation> moderateCongratulation(
    int eventId,
    int congratulationId, {
    required bool approve,
  }) async {
    final data = await _client.patch(
      '/api/events/$eventId/congratulations/$congratulationId',
      auth: true,
      body: {'action': approve ? 'approve' : 'reject'},
    );
    final comment = data['comment'];
    if (comment is! Map<String, dynamic>) {
      throw const ApiException('تعذّر تحديث حالة التبريكة');
    }
    return Congratulation.fromJson(comment);
  }

  Future<void> deleteCongratulation(int eventId, int congratulationId) async {
    await _client.delete(
      '/api/events/$eventId/congratulations/$congratulationId',
      auth: true,
    );
  }

  /// إبلاغ عن رسالة — صف واحد لكل مستخدم؛ التكرار يعيد 409 برسالة عربية من الخادم.
  Future<void> reportCongratulation(int eventId, int congratulationId) async {
    await _client.post(
      '/api/events/$eventId/congratulations/$congratulationId/report',
      auth: true,
    );
  }

  // --- الإشعارات (يتطلب تسجيل دخول) ---------------------------------

  Future<List<AppNotification>> notifications() async {
    final data = await _client.get('/api/notifications', auth: true);
    final list = data['notifications'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<void> markNotificationRead(int id) async {
    await _client.patch('/api/notifications/$id/read', auth: true);
  }

  /// فحص تعارض التاريخ قبل تقديم المناسبة.
  Future<List<Event>> checkCollision({
    required String date,
    String? town,
  }) async {
    final data = await _client.post(
      '/api/check-collision',
      body: {'date': date, 'town': ?town},
    );
    final list = data['conflicts'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList();
  }

  /// تقديم مناسبة. تدخل قائمة المراجعة ما لم يكن المُرسِل مديراً. تتطلب حساباً
  /// (`events.created_by`) — `honorees` تُرسَل بصيغة الأقواس (`honorees[i][name]`)
  /// التي يفهمها الخادم حصراً.
  Future<EventSubmissionResult> submitEvent({
    required int occasionTypeId,
    required List<Map<String, String>> honorees,
    required Map<String, String> fields,
    http.MultipartFile? poster,
    http.MultipartFile? audio,
  }) async {
    final allFields = <String, String>{
      'occasion_type_id': '$occasionTypeId',
      ...fields,
    };

    var index = 0;
    for (final honoree in honorees) {
      final name = honoree['name']?.trim() ?? '';
      if (name.isEmpty) continue;
      allFields['honorees[$index][name]'] = name;
      final role = honoree['role']?.trim();
      if (role != null && role.isNotEmpty) {
        allFields['honorees[$index][role]'] = role;
      }
      index++;
    }

    final data = await _client.postMultipart(
      '/api/events',
      fields: allFields,
      files: [?poster, ?audio],
      auth: true,
    );
    final message = data['message'];
    final rawWarning = data['location_warning'];
    String? locationWarning;
    if (rawWarning is Map<String, dynamic>) {
      final text = rawWarning['message'];
      if (text is String && text.isNotEmpty) locationWarning = text;
    }
    return EventSubmissionResult(
      message: message is String ? message : 'تم استلام طلب المناسبة بنجاح',
      locationWarning: locationWarning,
    );
  }

  // --- مناسباتي ------------------------------------------------------

  /// كل ما نشره المستخدم الحالي، بكل حالاته وبلا حدّ «القادم فقط» — شاشة
  /// المالك تعرض تاريخه كاملاً، لا شهره القادم.
  Future<List<Event>> myEvents() async {
    final data = await _client.get('/api/my-events', auth: true);
    final list = data['events'];
    return list is List
        ? list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList()
        : <Event>[];
  }

  /// تعديل مناسبة يملكها المستخدم (أو أي مناسبة للإدارة). `fields` يحمل فقط
  /// المفاتيح التي تغيّرت فعلاً — مفتاح غائب يعني «بلا تعديل عليه» عند الخادم،
  /// لا قيمة فارغة. التصنيف (`amendment`) والحالة الجديدة (`status`) من الردّ
  /// وحده؛ لا يُعاد بناؤهما هنا.
  Future<EventUpdateResult> updateEvent(
    int eventId, {
    required Map<String, dynamic> fields,
  }) async {
    final data = await _client.patch('/api/events/$eventId', auth: true, body: fields);
    final message = data['message'];
    final rawWarning = data['location_warning'];
    String? locationWarning;
    if (rawWarning is Map<String, dynamic>) {
      final text = rawWarning['message'];
      if (text is String && text.isNotEmpty) locationWarning = text;
    }
    return EventUpdateResult(
      message: message is String ? message : 'تم حفظ التعديل',
      amendment: '${data['amendment'] ?? 'cosmetic'}',
      status: '${data['status'] ?? ''}',
      locationWarning: locationWarning,
    );
  }

  /// سجلّ تعديلات مناسبة، الأحدث أولاً — للمالك أو الإدارة.
  Future<List<Amendment>> eventAmendments(int eventId) async {
    final data = await _client.get('/api/events/$eventId/amendments', auth: true);
    final list = data['amendments'];
    return list is List
        ? list.whereType<Map<String, dynamic>>().map(Amendment.fromJson).toList()
        : <Amendment>[];
  }

  // --- الحساب ------------------------------------------------------

  Future<({String token, AppUser user})> login(
    String phone,
    String pin,
  ) async {
    final data = await _client.post(
      '/api/auth/login',
      body: {'phone_number': phone, 'pin_code': pin},
    );
    return _authResult(data);
  }

  Future<({String token, AppUser user})> register({
    required String phone,
    required String fullName,
    required String pin,
    String? clanTown,
  }) async {
    final data = await _client.post(
      '/api/auth/register',
      body: {
        'phone_number': phone,
        'full_name': fullName,
        'pin_code': pin,
        if (clanTown != null && clanTown.isNotEmpty) 'clan_town': clanTown,
      },
    );
    return _authResult(data);
  }

  Future<AppUser> me() async {
    final data = await _client.get('/api/auth/me', auth: true);
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات الحساب');
    }
    return AppUser.fromJson(user);
  }

  ({String token, AppUser user}) _authResult(Map<String, dynamic> data) {
    final token = data['token'];
    final user = data['user'];
    if (token is! String || user is! Map<String, dynamic>) {
      throw const ApiException('استجابة تسجيل دخول غير مكتملة');
    }
    return (token: token, user: AppUser.fromJson(user));
  }

  // --- دفتر النقوط (يتطلب تسجيل دخول) -------------------------------

  Future<NokootLedger> nokoot() async {
    final data = await _client.get('/api/nokoot', auth: true);
    return NokootLedger.fromJson(data);
  }

  Future<void> addNokoot({
    required String recipientName,
    required double amount,
    required String eventDate,
    String? clanTown,
    String? occasionType,
    String? notes,
  }) async {
    await _client.post(
      '/api/nokoot',
      auth: true,
      body: {
        'recipient_name': recipientName,
        'amount': amount,
        'event_date': eventDate,
        if (clanTown != null && clanTown.isNotEmpty) 'clan_town': clanTown,
        if (occasionType != null && occasionType.isNotEmpty)
          'occasion_type': occasionType,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
  }

  Future<void> deleteNokoot(int id) async {
    await _client.delete('/api/nokoot/$id', auth: true);
  }

  // --- تحديثات التطبيق ----------------------------------------------

  /// النسخة المنشورة كما يعلنها الخادم. المقارنة تجري في العميل.
  Future<AppRelease> appRelease() async {
    final data = await _client.get('/api/app/version');
    return AppRelease.fromJson(data);
  }
}

/// صفحة مناسبات — من GET /api/events. الترقيم والإعلانات تصلان مع نفس الاستدعاء.
class EventsPage {
  final List<Event> events;
  final Pagination pagination;
  final List<Announcement> announcements;

  const EventsPage({
    required this.events,
    required this.pagination,
    required this.announcements,
  });
}

/// مركز بلدة واحد — من `town_coordinates` في GET /api/towns.
class TownCoordinate {
  final double lat;
  final double lng;

  const TownCoordinate({required this.lat, required this.lng});
}

/// ردّ POST /api/events — الرسالة إلزامية، والتحذير اللين اختياري.
class EventSubmissionResult {
  final String message;
  final String? locationWarning;

  const EventSubmissionResult({required this.message, this.locationWarning});
}

/// ردّ PATCH /api/events/:id — `amendment` و`status` من الخادم وحده، وتظهران
/// على الشاشة كما وصلتا بلا إعادة تصنيف في العميل.
class EventUpdateResult {
  final String message;
  final String amendment;
  final String status;
  final String? locationWarning;

  const EventUpdateResult({
    required this.message,
    required this.amendment,
    required this.status,
    this.locationWarning,
  });

  bool get isCritical => amendment == 'critical';
}

/// إعلان الإصدار من GET /api/app/version.
class AppRelease {
  final String? latestVersion;
  final String? minVersion;
  final String? apkUrl;
  final String releaseNotes;

  const AppRelease({
    this.latestVersion,
    this.minVersion,
    this.apkUrl,
    this.releaseNotes = '',
  });

  factory AppRelease.fromJson(Map<String, dynamic> json) {
    String? text(dynamic value) {
      if (value == null) return null;
      final trimmed = '$value'.trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    return AppRelease(
      latestVersion: text(json['latest_version']),
      minVersion: text(json['min_version']),
      apkUrl: text(json['apk_url']),
      releaseNotes: text(json['release_notes']) ?? '',
    );
  }
}
