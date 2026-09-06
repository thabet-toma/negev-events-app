import 'package:flutter/foundation.dart';

/// إعدادات التطبيق.
///
/// الخادم هو نفسه الذي تستهلكه واجهة الويب (مجلد ../server) — التطبيق لا يملك
/// أي منطق خادم خاص به.
///
/// للتشغيل على خادم آخر (بيئة اختبار مثلاً):
///   flutter run --dart-define=API_BASE=https://api.example.com
class AppConfig {
  const AppConfig._();

  static const String _fromEnv = String.fromEnvironment('API_BASE');

  /// عنوان الإنتاج. بناء الإصدار يقصده **افتراضياً**، ولا يعتمد على تذكّر
  /// `--dart-define`: نسخة 1.5.0+7 بُنيت بلا العلَم فحملت عنوان المحاكي
  /// (`10.0.2.2`) إلى أجهزة حقيقية، فلم يغادر أي طلب الجهاز. البناء نجح
  /// و`analyze` نظيف و‏٤٢ اختباراً مرّت — لأن لا شيء منها يلمس الشبكة.
  static const String productionApiBase = 'https://munasbat.ktra-pro.tech';

  /// يحلّ العنوان من مدخلاته الصريحة — دالة نقيّة كي يفحصها الاختبار مباشرةً
  /// بدل انتظار `kReleaseMode` الذي لا يكون صحيحاً أصلاً داخل `flutter test`.
  static String resolveApiBase({
    required String fromEnv,
    required bool releaseMode,
    required bool isWeb,
    required TargetPlatform platform,
  }) {
    if (fromEnv.isNotEmpty) return fromEnv; // تجاوز صريح يبقى مسموحاً
    if (releaseMode) return productionApiBase;
    // ما تحت هذا السطر للتطوير وحده — حذفه يكسر `flutter run` على المحاكي:
    // محاكي أندرويد يرى مضيف التطوير على 10.0.2.2 وليس localhost.
    if (!isWeb && platform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  static String get apiBase => resolveApiBase(
        fromEnv: _fromEnv,
        releaseMode: kReleaseMode,
        isWeb: kIsWeb,
        platform: defaultTargetPlatform,
      );

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
