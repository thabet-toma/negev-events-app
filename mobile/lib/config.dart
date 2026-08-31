import 'package:flutter/foundation.dart';

/// إعدادات التطبيق.
///
/// الخادم هو نفسه الذي تستهلكه واجهة الويب (مجلد ../server) — التطبيق لا يملك
/// أي منطق خادم خاص به.
///
/// للنشر أو التشغيل على جهاز حقيقي:
///   flutter run --dart-define=API_BASE=https://api.example.com
class AppConfig {
  const AppConfig._();

  static const String _fromEnv = String.fromEnvironment('API_BASE');

  static String get apiBase {
    if (_fromEnv.isNotEmpty) return _fromEnv;
    // محاكي أندرويد يرى مضيف التطوير على 10.0.2.2 وليس localhost.
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  /// البلدات — مطابقة لـ server/src/constants.js. الخادم يرفض أي بلدة خارجها.
  static const List<String> towns = [
    'رهط',
    'حورة',
    'تل السبع',
    'كسيفة',
    'شقيب السلام',
    'اللقية',
    'عرعرة النقب',
    'القرى والتجمعات',
  ];

  /// أنواع التفاعل — مطابقة لـ REACTION_TYPES في الخادم.
  static const Map<String, String> reactions = {
    'coffee': '☕',
    'horse': '🐎',
    'fireworks': '🎆',
    'rose': '🌹',
    'hand': '👏',
  };

  static const Map<String, String> reactionLabels = {
    'coffee': 'قهوة',
    'horse': 'خيل',
    'fireworks': 'ألعاب نارية',
    'rose': 'وردة',
    'hand': 'تصفيق',
  };
}
