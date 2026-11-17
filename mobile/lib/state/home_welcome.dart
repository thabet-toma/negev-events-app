import 'package:shared_preferences/shared_preferences.dart';

/// إغلاق بطاقة الترحيب في الرئيسية — **مفتاحها بصمةُ نصّها** لا اسمٌ ثابت
/// (تذكرة الرئيسية الجديدة).
///
/// لو كان المفتاح ثابتاً («رأى الترحيب») لبقي نصٌّ جديد يكتبه السوبر أدمن
/// مخفيّاً عن كل من أغلق البطاقة القديمة. البصمة تجعل الإغلاق **لهذا النصّ
/// وحده**: تغيير العنوان أو الرسالة يغيّر البصمة، فتعود البطاقة بالنصّ الجديد.
const String homeWelcomeDismissedKey = 'negev_home_welcome_dismissed';

/// بصمة نصّ البطاقة: FNV-1a ‏٣٢ بت على `title\u0000message`.
///
/// دالة محضة وحتمية عبر التشغيلات والأجهزة — بخلاف `String.hashCode` الذي لا
/// يُضمن ثباته بين تشغيلين، فكان يُعيد بطاقةً أُغلقت بعد كل إقلاع. والفاصل
/// `\u0000` يمنع أن يعطي (`أب`، `ج`) البصمة نفسها لـ(`أ`، `بج`).
String homeWelcomeHash(String title, String message) {
  const int offsetBasis = 0x811c9dc5;
  const int prime = 0x01000193;
  var hash = offsetBasis;
  for (final unit in '$title\u0000$message'.codeUnits) {
    hash = ((hash ^ unit) * prime) & 0xFFFFFFFF;
  }
  return hash.toRadixString(16).padLeft(8, '0');
}

/// هل أُغلقت بطاقة بهذه البصمة؟ تعذّر قراءة التخزين = «لم تُغلق» كي تظهر
/// البطاقة، والقراءة محصَّنة كبقية مخازن الجهاز في هذا التطبيق.
Future<bool> isHomeWelcomeDismissed(String hash) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(homeWelcomeDismissedKey) == hash;
  } catch (_) {
    return false;
  }
}

/// يسجّل إغلاق البطاقة الحالية. فشل التخزين لا يكسر شيئاً في هذه الجلسة، وقد
/// تعود البطاقة في إقلاع لاحق لا أكثر.
Future<void> markHomeWelcomeDismissed(String hash) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(homeWelcomeDismissedKey, hash);
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}
