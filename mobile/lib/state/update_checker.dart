import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../api/negev_api.dart';

/// نتيجة فحص التحديث.
class UpdateStatus {
  final String currentVersion;
  final String? latestVersion;
  final String? apkUrl;
  final String releaseNotes;

  /// يوجد إصدار أحدث — تنبيه يمكن تجاهله.
  final bool available;

  /// النسخة الحالية أقدم من الحد الأدنى المدعوم — لا يمكن المتابعة.
  final bool required_;

  const UpdateStatus({
    required this.currentVersion,
    required this.available,
    required this.required_,
    this.latestVersion,
    this.apkUrl,
    this.releaseNotes = '',
  });
}

/// يقارن النسخة المثبَّتة بما يعلنه الخادم.
///
/// الخادم يعلن الحقائق فقط (`latest_version`، `min_version`) ولا يعرف نسخة
/// المتصل — القرار كله هنا، فيمكن تغيير سياسة التحديث دون لمس الخادم.
class UpdateChecker {
  const UpdateChecker(this._api);

  final NegevApi _api;

  /// يعيد null إذا تعذّر الفحص أو لم يُضبط الإعلان على الخادم — الفحص
  /// تحسين وليس شرطاً لعمل التطبيق.
  Future<UpdateStatus?> check() async {
    try {
      final release = await _api.appRelease();
      if (release.latestVersion == null && release.minVersion == null) {
        return null;
      }

      final info = await PackageInfo.fromPlatform();
      final current = info.version;

      final available = release.latestVersion != null &&
          compareVersions(current, release.latestVersion!) < 0;

      final mustUpdate = release.minVersion != null &&
          compareVersions(current, release.minVersion!) < 0;

      if (!available && !mustUpdate) return null;

      return UpdateStatus(
        currentVersion: current,
        latestVersion: release.latestVersion,
        apkUrl: release.apkUrl,
        releaseNotes: release.releaseNotes,
        available: available || mustUpdate,
        required_: mustUpdate,
      );
    } catch (error) {
      debugPrint('تعذّر فحص التحديث: $error');
      return null;
    }
  }
}

/// يقارن نسختين بصيغة "1.2.3".
///
/// يعيد سالباً إذا كانت [a] أقدم، وصفراً عند التساوي، وموجباً إذا كانت أحدث.
/// الأجزاء غير الرقمية (مثل "1.2.3+4" أو "-beta") تُتجاهَل، والأجزاء الناقصة
/// تُعامَل كأصفار حتى تساوي "1.2" و "1.2.0".
@visibleForTesting
int compareVersions(String a, String b) {
  final left = _parts(a);
  final right = _parts(b);
  final length = left.length > right.length ? left.length : right.length;

  for (var i = 0; i < length; i++) {
    final x = i < left.length ? left[i] : 0;
    final y = i < right.length ? right[i] : 0;
    if (x != y) return x < y ? -1 : 1;
  }
  return 0;
}

List<int> _parts(String version) {
  // نتجاهل لاحقة البناء (+1) وأي وسم (-beta) قبل التقسيم.
  final core = version.split('+').first.split('-').first;
  return core
      .split('.')
      .map((part) => int.tryParse(part.trim()) ?? 0)
      .toList(growable: false);
}
