import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/event.dart';

/// نافذة تأكيد «تكرار محتمل» — نسخة واحدة يستعملها **النشر** و**التعديل**
/// (تذكرة #159)، فلا نسختان تفترقان في نصّ أو تفصيل. تعيد `true` حين يقرّر
/// المستخدم المضي رغم الشبه، و`false` في «إلغاء» أو الإغلاق.
///
/// `confirmLabel` وحده يختلف: المناسبة التي تُنشر «نشر رغم ذلك»، والتي
/// تُعدَّل «حفظ رغم ذلك» — النصّان يصفان الفعل الذي سيقع فعلاً.
Future<bool> confirmPossibleDuplicateAction(
  BuildContext context,
  PossibleDuplicateException duplicate, {
  String confirmLabel = 'نشر رغم ذلك',
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: const Text('تنبيه: مناسبة مشابهة موجودة'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(duplicate.message, style: const TextStyle(height: 1.6)),
              for (final item in duplicate.duplicates) ...[
                const SizedBox(height: 12),
                PossibleDuplicateTile(item),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    ),
  );
  return confirmed ?? false;
}

/// سطر واحد مضغوط لمناسبة مشابهة في نافذة التأكيد.
class PossibleDuplicateTile extends StatelessWidget {
  const PossibleDuplicateTile(this.item, {super.key});

  final PossibleDuplicate item;

  @override
  Widget build(BuildContext context) {
    final names = item.honorees.join(' و ');
    final heading = [
      if (item.occasionTypeName != null) item.occasionTypeName!,
      if (names.isNotEmpty) names else if (item.title.isNotEmpty) item.title,
    ].join(' — ');
    final date = item.eventEndDate == null || item.eventEndDate == item.eventDate
        ? item.eventDate
        : '${item.eventDate} ← ${item.eventEndDate}';
    final status = item.status == 'approved' ? 'منشورة' : 'قيد المراجعة';
    final confidence = item.isCertain ? 'شبه مؤكدة' : 'محتملة';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(heading, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text('${item.town} · $date', style: const TextStyle(height: 1.5)),
          Text('$status · مطابقة $confidence', style: const TextStyle(height: 1.5)),
          for (final reason in item.reasons)
            Text('• $reason', style: const TextStyle(height: 1.5)),
        ],
      ),
    );
  }
}
