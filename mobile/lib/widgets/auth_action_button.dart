import 'package:flutter/material.dart';

import '../main.dart';
import '../screens/account_screen.dart';
import 'async_view.dart' show showMessage;

/// زرّ الدخول/الخروج الظاهر دائماً في أعلى كل شاشة رئيسية — يتبع `AuthStore`
/// فيتبدّل وحده عند الدخول، والخروج، وانتهاء الجلسة.
///
/// `compact` أيقونة وحدها بتلميح، لشريط علوي مزدحم على هاتف ضيّق. `color`
/// لمن يرسمه فوق التغذية المظلمة لا فوق شريط التطبيق.
class AuthActionButton extends StatelessWidget {
  const AuthActionButton({super.key, this.compact = false, this.color});

  final bool compact;
  final Color? color;

  Future<void> _signIn(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const SignInScreen()),
    );
  }

  Future<void> _signOut(BuildContext context) async {
    final auth = AppServices.of(context).auth;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تسجيل الخروج'),
        content: const Text('هل تريد تسجيل الخروج؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('تسجيل الخروج'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await auth.signOut();
    if (context.mounted) showMessage(context, 'تم تسجيل الخروج');
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppServices.of(context).auth;

    return AnimatedBuilder(
      animation: auth,
      builder: (context, _) {
        // قبل قراءة الجلسة المحفوظة لا نعرف أيّ الزرّين نرسم — لا وميض خاطئ.
        if (!auth.isReady) return const SizedBox.shrink();

        final signedIn = auth.isSignedIn;
        final label = signedIn ? 'تسجيل الخروج' : 'تسجيل الدخول';
        final icon = Icon(signedIn ? Icons.logout : Icons.login, size: compact ? 22 : 18);
        void onPressed() => signedIn ? _signOut(context) : _signIn(context);

        if (compact) {
          return IconButton(
            tooltip: label,
            icon: icon,
            color: color,
            onPressed: onPressed,
          );
        }
        return TextButton.icon(
          style: TextButton.styleFrom(
            foregroundColor: color,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            visualDensity: VisualDensity.compact,
          ),
          icon: icon,
          label: Text(label, style: const TextStyle(fontSize: 13)),
          onPressed: onPressed,
        );
      },
    );
  }
}
