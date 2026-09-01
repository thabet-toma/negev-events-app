import 'package:flutter/material.dart';

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
