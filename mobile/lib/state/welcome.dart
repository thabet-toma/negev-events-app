import 'package:shared_preferences/shared_preferences.dart';

/// مفتاح «رأى شاشة الترحيب» (تذكرة #163) — مرة واحدة لكل تثبيت، وقبل ورقة
/// «من أي منطقة أنت؟» في أول تشغيل.
///
/// يُكتب عند **أي** خروج من الشاشة: «تخطّي»، أو سحب، أو نقرة خارجها، أو زرّ
/// رجوع الجهاز — كي لا يبقى لها مدخل يعيدها مع كل إقلاع.
const String welcomeSeenKey = 'negev_welcome_seen';

/// هل رأى المستخدم شاشة الترحيب سابقاً؟ تعذّر قراءة التخزين = «لم يرَ» كي
/// تظهر الشاشة، لكن كتابتها محصَّنة كما في [RegionStore] فتفشل بهدوء.
Future<bool> isWelcomeSeen() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(welcomeSeenKey) ?? false;
  } catch (_) {
    return false;
  }
}

/// يسجّل رؤية الشاشة عند أي خروج منها — فشل التخزين لا يكسر شيئاً في هذه
/// الجلسة، وقد تعود الشاشة في إقلاع لاحق لا أكثر.
Future<void> markWelcomeSeen() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(welcomeSeenKey, true);
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}
