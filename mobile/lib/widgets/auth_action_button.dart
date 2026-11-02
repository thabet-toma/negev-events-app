import 'package:flutter/material.dart';

import '../screens/account_screen.dart';

/// زرّ «حسابي» الظاهر دائماً في أعلى كل شاشة رئيسية — رمز شخص ونصّ واحد لا
/// يتبدّلان مع الجلسة. النقر يدفع شاشة «حسابي» مدفوعةً فوق الشاشة الحالية،
/// والدخول والخروج مقيما هناك (`account_screen.dart`): لا نموذج دخول من هذا
/// الزرّ ولا حوار تأكيد خروج.
///
/// `compact` أيقونة وحدها بتلميح، لشريط علوي مزدحم على هاتف ضيّق.
/// `stacked` يضع الأيقونة فوق النص في تغذية ضيّقة. `color` لمن يرسمه فوق
/// التغذية المظلمة لا فوق شريط التطبيق.
class AuthActionButton extends StatelessWidget {
  const AuthActionButton({
    super.key,
    this.compact = false,
    this.stacked = false,
    this.color,
  });

  final bool compact;
  final bool stacked;
  final Color? color;

  /// النصّ الوحيد — تلميحاً في الصيغة المضغوطة، وكلمةً في الأخريين.
  static const String label = 'حسابي';

  static const IconData _icon = Icons.person_outline;

  /// يدفع شاشة «حسابي» فوق ما هو مفتوح، من أي شاشة كان الزرّ — التفاصيل،
  /// النشر، الخريطة، «قائمتي»… لم تعد وجهةً في الشريط السفلي، فلم يبقَ طلب
  /// تبديل ولا رجوعٌ إلى الجذر: الرجوع من الشاشة يترك المستخدم حيث كان.
  ///
  /// بلا وسيط `isActive` ⇒ قيمتها الافتراضية `true`، وهي المطلوبة عند الفتح
  /// (تحديث عدّاد «قائمتي» مرةً واحدة).
  void _openAccount(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AccountScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    void onPressed() => _openAccount(context);

    if (compact) {
      return IconButton(
        tooltip: label,
        icon: const Icon(_icon, size: 22),
        color: color,
        onPressed: onPressed,
      );
    }
    if (stacked) {
      return SizedBox(
        width: 100,
        child: TextButton(
          style: TextButton.styleFrom(
            foregroundColor: color,
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 4),
            visualDensity: VisualDensity.compact,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          onPressed: onPressed,
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_icon, size: 18),
              SizedBox(height: 2),
              Text(label, style: TextStyle(fontSize: 12)),
            ],
          ),
        ),
      );
    }
    return TextButton.icon(
      style: TextButton.styleFrom(
        foregroundColor: color,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        visualDensity: VisualDensity.compact,
      ),
      icon: const Icon(_icon, size: 18),
      label: const Text(label, style: TextStyle(fontSize: 13)),
      onPressed: onPressed,
    );
  }
}
