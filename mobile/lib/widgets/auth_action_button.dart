import 'package:flutter/material.dart';

import '../main.dart';

/// زرّ «حسابي» الظاهر دائماً في أعلى كل شاشة رئيسية — رمز شخص ونصّ واحد لا
/// يتبدّلان مع الجلسة. النقر يفتح وجهة «حسابي»، والدخول والخروج مقيما هناك
/// (`account_screen.dart`): لا نموذج دخول من هذا الزرّ ولا حوار تأكيد خروج.
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

  /// يفتح وجهة «حسابي». الزرّ يعيش في شاشات مدفوعة فوق الشلّ أيضاً (التفاصيل،
  /// النشر، الخريطة، «قائمتي»…)، فلا يكفي طلب الوجهة وحده: الرجوع إلى الجذر
  /// أولاً يزيل الشاشة المدفوعة من تحت وجه «حسابي»، ثم يستهلك `HomeShell`
  /// الطلب بـ`tabRequest` كما يفعل أي طالب تبديل آخر.
  void _openAccount(BuildContext context) {
    final services = AppServices.of(context);
    final navigator = Navigator.of(context);
    if (navigator.canPop()) navigator.popUntil((route) => route.isFirst);
    services.tabRequest.value = AppServices.accountTabIndex;
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
