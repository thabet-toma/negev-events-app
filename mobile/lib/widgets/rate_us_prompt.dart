import 'package:flutter/material.dart';

import '../state/rate_us.dart';
import 'async_view.dart';

/// «قيّمنا» — الحوار الذي يفتح صفحة Play برابط خارجي (تذكرة #163).
///
/// لا In-App Review ولا حزمة جديدة: `url_launcher` القائم وحده، بوضع
/// `LaunchMode.externalApplication` في [openExternalLink].
Future<void> showRateUsDialog(BuildContext context) async {
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      key: const Key('rate_us_dialog'),
      title: const Text('رأيك يهمّنا'),
      content: const Text(
        'إن كانت أعراسنا تفيدك، قيّمنا على Google Play — دقيقة من وقتك '
        'تساعد غيرك على اكتشاف المنصّة.',
      ),
      actions: [
        TextButton(
          key: const Key('rate_us_later'),
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: const Text('لاحقاً'),
        ),
        FilledButton(
          key: const Key('rate_us_open_store'),
          onPressed: () {
            Navigator.of(dialogContext).pop();
            // رابط خارجي صريح، ورسالة فشل واحدة كما في بقية الروابط الخارجية.
            openExternalLink(
              context,
              Uri.parse(rateUsPlayStoreUrl),
              failureMessage: 'تعذّر فتح متجر Play',
            );
          },
          child: const Text('قيّمنا'),
        ),
      ],
    ),
  );
}

/// يعرض الحوار إن حان دوره فقط. التبريد يُكتب **قبل** العرض لا في زرّ:
/// سواء فتح المستخدم Play أو أغلق الحوار أو نقر خارجه، لا يعود قبل
/// [rateUsCooldownDays] يوماً.
Future<void> maybeShowRateUsPrompt(BuildContext context) async {
  if (!context.mounted) return;
  if (!await isRateUsPromptDue()) return;

  await markRateUsPrompted();
  if (!context.mounted) return;
  await showRateUsDialog(context);
}
