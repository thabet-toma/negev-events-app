import 'package:http/http.dart' as http;

import '../models/event.dart';
import '../models/nokoot.dart';
import '../models/user.dart';
import 'api_client.dart';

/// كل نقاط الخادم في مكان واحد — نفس العقد الموثّق في README.
class NegevApi {
  NegevApi(this._client);

  final ApiClient _client;

  ApiClient get client => _client;

  // --- عام ---------------------------------------------------------

  Future<List<Event>> listEvents({String? town, String? search}) async {
    final query = <String, String>{};
    if (town != null && town.isNotEmpty && town != 'الكل') query['town'] = town;
    if (search != null && search.trim().isNotEmpty) {
      query['search'] = search.trim();
    }

    final data = await _client.get('/api/events', query: query);
    final list = data['events'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList();
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

  Future<void> react(int eventId, String type, String identifier) async {
    await _client.post(
      '/api/events/$eventId/react',
      body: {'reaction_type': type, 'user_identifier': identifier},
    );
  }

  Future<Congratulation> congratulate(
    int eventId, {
    required String senderName,
    required String message,
    String badgeTitle = 'مبارك الفرح',
  }) async {
    final data = await _client.post(
      '/api/events/$eventId/congratulate',
      body: {
        'sender_name': senderName,
        'message': message,
        'badge_title': badgeTitle,
      },
    );
    final comment = data['comment'];
    if (comment is! Map<String, dynamic>) {
      throw const ApiException('تعذّر حفظ التبريكة');
    }
    return Congratulation.fromJson(comment);
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

  /// تقديم مناسبة. تدخل قائمة المراجعة ما لم يكن المُرسِل مديراً.
  Future<String> submitEvent({
    required Map<String, String> fields,
    http.MultipartFile? poster,
    http.MultipartFile? audio,
  }) async {
    final data = await _client.postMultipart(
      '/api/events',
      fields: fields,
      files: [?poster, ?audio],
    );
    final message = data['message'];
    return message is String
        ? message
        : 'تم استلام طلب المناسبة بنجاح';
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
