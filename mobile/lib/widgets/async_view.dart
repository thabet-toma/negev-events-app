import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../theme.dart';

/// حالة تحميل / خطأ / فراغ موحّدة لكل الشاشات.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({
    super.key,
    required this.snapshot,
    required this.builder,
    required this.onRetry,
    this.emptyMessage,
    this.isEmpty,
  });

  final AsyncSnapshot<T> snapshot;
  final Widget Function(T data) builder;
  final VoidCallback onRetry;
  final String? emptyMessage;
  final bool Function(T data)? isEmpty;

  @override
  Widget build(BuildContext context) {
    if (snapshot.connectionState == ConnectionState.waiting) {
      return const Center(child: CircularProgressIndicator());
    }

    if (snapshot.hasError) {
      return ErrorView(message: '${snapshot.error}', onRetry: onRetry);
    }

    final data = snapshot.data;
    if (data == null) {
      return ErrorView(message: 'لا توجد بيانات', onRetry: onRetry);
    }

    if (isEmpty != null && isEmpty!(data)) {
      return EmptyView(message: emptyMessage ?? 'لا توجد نتائج');
    }

    return builder(data);
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off, size: 46, color: context.c.inkFaint),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.c.inkSoft, height: 1.6),
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة المحاولة'),
            ),
          ],
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.celebration_outlined,
              size: 46,
              color: context.c.inkFaint,
            ),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: context.c.inkFaint, fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }
}

/// يعرض رسالة قصيرة أسفل الشاشة.
///
/// خلفية الخطأ ثابتة لا تتبع الوضع — نفس منطق راية النظام في `home_shell.dart`
/// (تحذير مستقل عن هوية المناسبات)، ونصّها أبيض ثابت بنفس السبب.
void showMessage(BuildContext context, String message, {bool isError = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: isError ? const TextStyle(color: Colors.white) : null,
        ),
        backgroundColor: isError ? const Color(0xFF7F1D1D) : context.c.surface,
        duration: const Duration(seconds: 3),
      ),
    );
}

/// فتح محادثة الدعم الفني عبر واتساب مع حوار تأكيد الخصوصية (مطابق لقصة 35).
Future<void> openSupportWhatsApp(BuildContext context) async {
  final api = AppServices.of(context).api;
  final number = await api.getSupportWhatsappNumber();
  if (!context.mounted) return;
  if (number == null || number.isEmpty) {
    showMessage(context, 'الدعم الفني غير مُفعَّل بعد على المنصّة — حاول لاحقاً', isError: true);
    return;
  }

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('الدعم الفني عبر واتساب'),
      content: const Text('سيرى فريق الدعم الفني رقم هاتفك عند فتح واتساب — هل تريد المتابعة؟'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('إلغاء'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF25D366),
            foregroundColor: Colors.white,
          ),
          child: const Text('متابعة إلى واتساب'),
        ),
      ],
    ),
  );

  if (confirmed != true || !context.mounted) return;

  final cleanNumber = number.replaceAll(RegExp(r'[^0-9]'), '');
  final uri = Uri.parse('https://wa.me/$cleanNumber');
  try {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    if (context.mounted) {
      showMessage(context, 'تعذّر فتح تطبيق واتساب', isError: true);
    }
  }
}

