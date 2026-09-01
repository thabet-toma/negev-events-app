import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// خطأ قادم من الخادم — يحمل الرسالة العربية كما أرسلها.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, [this.statusCode]);

  bool get isUnauthorized => statusCode == 401 || statusCode == 403;

  @override
  String toString() => message;
}

/// عميل HTTP وحيد لكل نداءات التطبيق.
///
/// نفس الدور الذي يلعبه web/api.js في واجهة الويب: عنوان الخادم ورمز الدخول
/// في مكان واحد. الرمز يُرفق فقط عند طلبه صراحةً — إرفاقه في كل مكان يغيّر
/// سلوك POST /api/events (المدير ينشر فوراً).
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  /// يُضبط من AuthStore بعد تسجيل الدخول.
  String? token;

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = Uri.parse(AppConfig.apiBase);
    return base.replace(
      path: '${base.path}$path',
      queryParameters: (query == null || query.isEmpty) ? null : query,
    );
  }

  /// وجودها وحده يخبر الخادم أنّ هذا عميل يعرف أنواع المناسبات — طلب بلا هذه
  /// الترويسة لا يرى إلا النوع المدعوم للعملاء القدامى (عرس). القيمة نفسها
  /// لا تُقارَن على الخادم، فرقم ثابت كافٍ (events.routes.js: isLegacyClient).
  static const String _appVersionHeader = '1';

  Map<String, String> _headers({bool auth = false, bool json = false}) {
    final headers = <String, String>{
      'Accept': 'application/json',
      'X-App-Version': _appVersionHeader,
    };
    if (json) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (auth && token != null && token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, String>? query,
    bool auth = false,
  }) async {
    return _send(() => _client.get(_uri(path, query), headers: _headers(auth: auth)));
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    bool auth = false,
  }) async {
    return _send(
      () => _client.post(
        _uri(path),
        headers: _headers(auth: auth, json: true),
        body: jsonEncode(body ?? const {}),
      ),
    );
  }

  Future<Map<String, dynamic>> delete(String path, {bool auth = false}) async {
    return _send(() => _client.delete(_uri(path), headers: _headers(auth: auth)));
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    Map<String, dynamic>? body,
    bool auth = false,
  }) async {
    return _send(
      () => _client.patch(
        _uri(path),
        headers: _headers(auth: auth, json: true),
        body: jsonEncode(body ?? const {}),
      ),
    );
  }

  /// إرسال متعدد الأجزاء — لرفع البوستر والصوت مع المناسبة.
  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required Map<String, String> fields,
    List<http.MultipartFile> files = const [],
    bool auth = false,
  }) async {
    return _send(() async {
      final request = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers(auth: auth))
        ..fields.addAll(fields)
        ..files.addAll(files);
      final streamed = await _client.send(request);
      return http.Response.fromStream(streamed);
    });
  }

  Future<Map<String, dynamic>> _send(
    Future<http.Response> Function() run,
  ) async {
    http.Response response;
    try {
      response = await run().timeout(const Duration(seconds: 20));
    } catch (error) {
      throw ApiException(
        'تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت ومن أن الخادم يعمل على ${AppConfig.apiBase}',
      );
    }

    Map<String, dynamic> decoded;
    try {
      final raw = jsonDecode(utf8.decode(response.bodyBytes));
      decoded = raw is Map<String, dynamic> ? raw : <String, dynamic>{};
    } catch (_) {
      throw ApiException('استجابة غير مفهومة من الخادم', response.statusCode);
    }

    if (response.statusCode >= 400 || decoded['success'] == false) {
      final message = decoded['message'];
      throw ApiException(
        message is String && message.isNotEmpty
            ? message
            : 'حدث خطأ غير متوقع',
        response.statusCode,
      );
    }

    return decoded;
  }

  void close() => _client.close();
}
