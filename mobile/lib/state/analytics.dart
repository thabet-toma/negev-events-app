import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../api/negev_api.dart';
import 'device_id_store.dart';

/// يسجّل حدث تحليل سلوكي واحد (issue #44) — بلا انتظار وبلا استثناء يفلت،
/// مهما فشل الطلب. لا تُنتظَر هذه الدالة من موقع الاستدعاء أبداً: فشل تسجيل
/// حدث تحليل ليس حدثاً بالنسبة للمستخدم، فلا يجوز أن يبطئ نقرة مشاركة أو
/// يوقف نشر مناسبة أو يظهر أي رسالة خطأ.
///
/// `eventName` من القائمة المغلقة التي يملكها الخادم وحده
/// (`ANALYTICS_EVENTS` في server/src/constants.js) — هذا الملف لا يكرّرها
/// ولا يخترع اسماً جديداً، فقط يمرّر ما يطلبه موقع الاستدعاء.
///
/// `contentTown` هو بلدة *المناسبة موضوع الفعل*، لا بلدة المستخدم نفسه —
/// هذا هو الفرق الذي يبرّر وجود هذا الحقل أصلاً في هذا الجدول.
///
/// 🚧 ممنوع استدعاء هذه الدالة من أي شاشة أو مسار خاص بدفتر النقوط
/// (`nokoot_screen.dart` وما يشابهها) — الدفتر خاص على مستوى الاستعلام نفسه
/// في الخادم (`nokoot.service.js`)، وهو غير قابل للملاحظة بتصميم متعمَّد،
/// لا نسيان.
void recordAnalyticsEvent(
  NegevApi api,
  String eventName, {
  String? contentTown,
}) {
  // fire-and-forget بتصميم: لا `await` هنا يوقف المتصل، والدالة الداخلية
  // تبتلع كل خطأ داخلها فلا يفلت أي استثناء غير معالَج.
  unawaited(_send(api, eventName, contentTown));
}

Future<void> _send(NegevApi api, String eventName, String? contentTown) async {
  try {
    // النسخة من نفس المصدر الذي يقرأ منه فحص التحديث (update_checker.dart)
    // — لا رقم ثابت بالكود يفقد المزامنة مع pubspec.yaml عند كل إصدار.
    final results = await Future.wait([
      DeviceIdStore.get(),
      PackageInfo.fromPlatform().then((info) => info.version),
    ]);
    await api.recordAnalyticsEvent(
      eventName: eventName,
      platform: 'android',
      appVersion: results[1],
      deviceId: results[0],
      contentTown: contentTown,
    );
  } catch (error) {
    // لا شيء غير ذلك — هذا النداء لا يجوز أن يزعج المستخدم أبداً مهما فشل.
    debugPrint('تعذّر تسجيل حدث تحليل ($eventName): $error');
  }
}
