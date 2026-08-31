import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../state/update_checker.dart';
import '../theme.dart';
import 'async_view.dart';

/// تنبيه التحديث.
///
/// عند التحديث الإلزامي لا يمكن إغلاق الحوار ولا الرجوع — النسخة الحالية لم
/// تعد مدعومة، فالمتابعة بها ستفشل على أي حال.
class UpdateDialog extends StatelessWidget {
  const UpdateDialog({super.key, required this.status});

  final UpdateStatus status;

  static Future<void> show(BuildContext context, UpdateStatus status) {
    return showDialog<void>(
      context: context,
      barrierDismissible: !status.required_,
      builder: (_) => UpdateDialog(status: status),
    );
  }

  Future<void> _download(BuildContext context) async {
    final url = status.apkUrl;
    if (url == null) {
      showMessage(context, 'لا يوجد رابط تحميل متاح', isError: true);
      return;
    }

    final launched = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!launched && context.mounted) {
      showMessage(context, 'تعذّر فتح رابط التحميل', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !status.required_,
      child: AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        icon: const Icon(
          Icons.system_update,
          color: AppTheme.gold,
          size: 34,
        ),
        title: Text(
          status.required_ ? 'تحديث مطلوب' : 'يتوفر تحديث جديد',
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppTheme.textGold, fontSize: 18),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (status.required_)
              const Text(
                'نسختك لم تعد مدعومة، ولا يمكن متابعة الاستخدام قبل التحديث.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  height: 1.6,
                ),
              )
            else
              const Text(
                'نسخة أحدث من التطبيق متاحة الآن.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  height: 1.6,
                ),
              ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.bgSurface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.borderSubtle),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    status.currentVersion,
                    style: const TextStyle(
                      color: AppTheme.textMuted,
                      fontSize: 13.5,
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    child: Icon(
                      Icons.arrow_back,
                      size: 15,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  Text(
                    status.latestVersion ?? '',
                    style: const TextStyle(
                      color: AppTheme.gold,
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
            if (status.releaseNotes.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                status.releaseNotes,
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 13,
                  height: 1.6,
                ),
              ),
            ],
          ],
        ),
        actions: [
          if (!status.required_)
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                'لاحقاً',
                style: TextStyle(color: AppTheme.textMuted),
              ),
            ),
          ElevatedButton.icon(
            onPressed: () => _download(context),
            icon: const Icon(Icons.download, size: 18),
            label: const Text('تحديث الآن'),
          ),
        ],
      ),
    );
  }
}
