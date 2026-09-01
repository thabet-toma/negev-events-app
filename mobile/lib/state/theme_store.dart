import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// تفضيل الوضع (فاتح/داكن/نظام) — محفوظ محلياً بين الجلسات.
///
/// غياب تفضيل محفوظ يعني اتّباع النظام (`ThemeMode.system`)، تماماً كقاعدة
/// الويب: لا يوجد فرق بين "لم يختر بعد" و"اختار اتّباع النظام".
class ThemeStore extends ChangeNotifier {
  static const _key = 'negev_theme_mode';

  ThemeMode _mode = ThemeMode.system;
  bool _ready = false;

  ThemeMode get mode => _mode;
  bool get isReady => _ready;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_key);
    _mode = _fromKey(saved) ?? ThemeMode.system;
    _ready = true;
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, _toKey(mode));
  }

  static ThemeMode? _fromKey(String? key) {
    switch (key) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
        return ThemeMode.system;
      default:
        return null;
    }
  }

  static String _toKey(ThemeMode mode) => switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      };
}
