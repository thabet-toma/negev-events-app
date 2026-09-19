import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/negev_api.dart';
import '../models/user.dart';

/// حالة الحساب — الرمز والمستخدم، محفوظان محلياً بين الجلسات.
///
/// رمز المستخدم صالح 90 يوماً في الخادم، فلا حاجة لتسجيل دخول متكرر.
class AuthStore extends ChangeNotifier {
  AuthStore(this.api) {
    api.client.onUnauthorized = _handleUnauthorized;
  }

  static const _tokenKey = 'negev_token';
  static const _userKey = 'negev_user';

  /// النصّ الموحّد لانتهاء الجلسة — تعرضه main.dart وشاشات الكتابة معاً.
  static const sessionExpiredMessage = 'انتهت جلستك، يرجى تسجيل الدخول من جديد';

  final NegevApi api;

  /// يعرض رسالة انتهاء الجلسة على مستوى التطبيق — تضبطه main.dart بمفتاح
  /// ScaffoldMessenger العام (هذه الطبقة لا تعرف شجرة الودجت).
  void Function(String message)? onSessionExpired;

  AppUser? _user;
  String? _token;
  bool _ready = false;

  AppUser? get user => _user;
  String? get token => _token;
  bool get isSignedIn => _token != null && _user != null;

  /// هل انتهى تحميل الجلسة المحفوظة؟ الشاشات تنتظرها قبل الرسم.
  bool get isReady => _ready;

  /// معرّف يُرسل مع التفاعلات لتمييز الزائر عن المستخدم المسجّل.
  String get reactionIdentifier => _user?.phoneNumber ?? 'guest';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);

    final rawUser = prefs.getString(_userKey);
    if (rawUser != null) {
      try {
        final decoded = jsonDecode(rawUser);
        if (decoded is Map<String, dynamic>) _user = AppUser.fromJson(decoded);
      } catch (_) {
        _user = null;
      }
    }

    api.client.token = _token;
    _ready = true;
    notifyListeners();

    // تحقّق عند الإقلاع: جلسة انتهت على الخادم (401) تُخرج المستخدم عبر
    // [_handleUnauthorized]، ورمز مجدَّد في الردّ يحلّ محلّ المحفوظ.
    final checkedToken = _token;
    if (checkedToken != null) {
      try {
        final fresh = await api.me();
        // تبدّلت الجلسة أثناء الانتظار (خروج أو دخول آخر) — الردّ لم يعد لها.
        if (_token != checkedToken) return;
        _user = fresh.user;
        if (fresh.token != null) {
          _token = fresh.token;
          api.client.token = _token;
        }
        await _persist();
        notifyListeners();
      } on ApiException catch (error) {
        if (error.isUnauthorized && _token == checkedToken) await signOut();
      } catch (_) {
        // انقطاع شبكة — نُبقي الجلسة المحفوظة كما هي.
      }
    }
  }

  /// طلب برمز فعلي رُفض بـ401 — الجلسة انتهت. خروج محلي مرّة واحدة: طلبان
  /// متزامنان رُفضا معاً لا يُظهران الرسالة مرّتين، وردّ متأخّر على رمز قديم
  /// لا يُخرج جلسة جديدة فُتحت بعده.
  void _handleUnauthorized(String rejectedToken) {
    if (_token == null || _token != rejectedToken) return;
    signOut();
    onSessionExpired?.call(sessionExpiredMessage);
  }

  Future<void> signIn(String phone, String pin) async {
    final result = await api.login(phone, pin);
    await _apply(result.token, result.user);
  }

  Future<void> register({
    required String phone,
    required String fullName,
    required String pin,
    String? clanTown,
  }) async {
    final result = await api.register(
      phone: phone,
      fullName: fullName,
      pin: pin,
      clanTown: clanTown,
    );
    await _apply(result.token, result.user);
  }

  Future<void> signOut() async {
    _token = null;
    _user = null;
    api.client.token = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);

    notifyListeners();
  }

  Future<void> _apply(String token, AppUser user) async {
    _token = token;
    _user = user;
    api.client.token = token;
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    if (_token != null) await prefs.setString(_tokenKey, _token!);
    if (_user != null) {
      await prefs.setString(_userKey, jsonEncode(_user!.toJson()));
    }
  }
}
