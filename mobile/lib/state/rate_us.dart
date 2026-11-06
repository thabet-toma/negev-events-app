import 'package:shared_preferences/shared_preferences.dart';

/// عدّاد اللحظات الإيجابية («ذكّرني» و«التبريكة») — مفتاح محلي (تذكرة #163).
const String rateUsMomentsKey = 'negev_rate_us_moments';

/// وقت آخر ظهور لحوار «قيّمنا» — مللي ثانية منذ الحقبة.
const String rateUsPromptedAtKey = 'negev_rate_us_prompted_at';

/// اللحظة التي عندها — وبعدها — يحين الحوار: الثالثة.
const int rateUsThreshold = 3;

/// تبريد الحوار بعد ظهوره — تسعون يوماً (RATE_US_COOLDOWN_DAYS في التذكرة).
const int rateUsCooldownDays = 90;

/// معرّف حزمة أندرويد كما في `mobile/android/app/build.gradle.kts`
/// (`applicationId`) — لا معرّف مخترع هنا، ولا رابط متجر بلا حزمة.
const String rateUsPackageId = 'com.negev.negev_events';

/// صفحة Play الخارجية — تُفتح بـ`url_launcher`، لا In-App Review.
const String rateUsPlayStoreUrl =
    'https://play.google.com/store/apps/details?id=$rateUsPackageId';

/// عدد اللحظات الإيجابية المحفوظة؛ تعذّر القراءة = صفر فلا يُعرض حوار.
Future<int> rateUsMoments() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(rateUsMomentsKey) ?? 0;
  } catch (_) {
    return 0;
  }
}

/// ينفّذ [action]، **وإن نجح فقط** يزيد عدّاد اللحظات — الفشل يرمي قبل الوصول
/// إلى العدّ، فلا يزيد العدّاد بلحظة فاشلة.
Future<void> runPositiveMoment(Future<void> Function() action) async {
  await action();
  await recordRateUsMoment();
}

/// يزيد العدّاد واحداً؛ تعذّر التخزين يُبتلع فلا يكسر شيئاً.
Future<void> recordRateUsMoment() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final next = (prefs.getInt(rateUsMomentsKey) ?? 0) + 1;
    await prefs.setInt(rateUsMomentsKey, next);
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}

/// وقت آخر ظهور للحوار، أو `null` إن لم يظهر قط.
Future<DateTime?> rateUsPromptedAt() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final millis = prefs.getInt(rateUsPromptedAtKey);
    if (millis == null) return null;
    return DateTime.fromMillisecondsSinceEpoch(millis);
  } catch (_) {
    return null;
  }
}

/// يسجّل ظهور الحوار الآن — يُستدعى **قبل** عرضه كي يُكتب التبريد سواء فتح
/// المستخدم Play أو أغلق الحوار.
Future<void> markRateUsPrompted() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(
      rateUsPromptedAtKey,
      DateTime.now().millisecondsSinceEpoch,
    );
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}

/// هل يحين الحوار؟ شرطان معاً: الثالثة بلغت، و90 يوماً مرّت على آخر ظهور (أو
/// لم يظهر قط).
Future<bool> isRateUsPromptDue() async {
  final count = await rateUsMoments();
  if (count < rateUsThreshold) return false;

  final promptedAt = await rateUsPromptedAt();
  if (promptedAt == null) return true;

  final elapsed = DateTime.now().difference(promptedAt);
  return elapsed >= const Duration(days: rateUsCooldownDays);
}
