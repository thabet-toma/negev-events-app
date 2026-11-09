import 'dart:io';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../widgets/async_view.dart';
import 'analytics.dart';

/// مشاركة مناسبة — **تعريف واحد** يستدعيه كرت التغذية وشاشة التفاصيل معاً.
///
/// كان النصّ والرابط وحدث التحليل مكتوبين مرّتين (الكرت والشاشة)، فأي تعديل على
/// صيغة الرسالة كان يترك النسخة الأخرى على الصيغة القديمة بصمت. الرابط يُبنى من
/// [AppConfig.apiBase] لا من ثابت ثانٍ، والنصّ بلا «حمّل التطبيق» — تلك حكاية
/// صفحة الهبوط لا صحيفة المشاركة.
///
/// بلدة **المناسبة** المشارَكة لا بلدة المستخدم — نفس تمييز الويب. ويُسجَّل حدث
/// ورقة مشاركة النظام مع رسالة فشل عربية — **التعريف الوحيد** لكل سطح يشارك:
/// المناسبة والألبوم والصورة. فشل الورقة يُقال للمستخدم، لأن الصمت هنا يترك
/// النقرة بلا أثر مرئي فتُقرأ عطلاً. (الصمت نمط متّبع لحدث التحليل وحده.)
Future<void> shareViaSystem(BuildContext context, String text) async {
  try {
    await SharePlus.instance.share(ShareParams(text: text));
  } catch (error) {
    if (context.mounted) {
      showMessage(context, 'تعذّر فتح قائمة المشاركة', isError: true);
    }
  }
}

/// التحليل عند النقرة نفسها، بصرف النظر عن نجاح صحيفة المشاركة بعدها أو فشلها.
Future<void> shareEvent(BuildContext context, Event event) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: event.town,
  );

  final url = '${AppConfig.apiBase}/e/${event.id}';
  final text = '${event.displayTitle} — ${event.townDisplay}\n$url';
  await shareViaSystem(context, text);
}

/// توقيع مشاركة **ملف** عبر صحيفة النظام — يُبدَّل في widget test كي يتحقّق من
/// الملف والرابط بلا قناة منصّة حقيقية. الافتراضي هو `share_plus` القائم نفسه.
typedef ShareFileInvoker = Future<void> Function({
  required String path,
  required String text,
});

@visibleForTesting
ShareFileInvoker shareFileInvoker = _shareFileViaSystem;

/// المشاركة الفعلية بملف ورسالة: الصورة أولاً ثم الرابط في النصّ نفسه — نفس
/// ما تفعله صحيفة النظام في أي تطبيق آخر، ولا صورة بلا رابط.
Future<void> _shareFileViaSystem({
  required String path,
  required String text,
}) async {
  await SharePlus.instance.share(
    ShareParams(files: [XFile(path, mimeType: 'image/png')], text: text),
  );
}

/// «نزّل الصورة» (تذكرة #182) — كل صورة تُنزَّل أو تُشارَك تحمل «شريط أعراسنا»:
/// الخادم يرسم صورة المناسبة وفوق أسفلها العلامة و«امسح الرمز وافتح المناسبة»
/// وQR لصفحة المناسبة (`GET /e/:id/download.png`)، والعميل هنا ينزّلها كبايتات،
/// يكتبها ملفاً مؤقتاً، ثم يشاركها **مع رابط المناسبة** في صحيفة واحدة — معيار
/// التذكرة «الرابط ومعه الصورة» لا صورة وحدها.
///
/// و`Directory.systemTemp` لا `path_provider`: محرّك فلاتر يضبطه على مجلد كاش
/// التطبيق على أندرويد (`PathUtils.getCacheDirectory` في المحرّك) وعلى
/// `NSTemporaryDirectory` في iOS، فالمجلد صالح للكتابة بلا حزمة جديدة في
/// `pubspec.yaml`. والملف يبقى في الكاش بعد المشاركة عمداً: بعض المنصّات تقرأ
/// الملف بعد عودة `share` لا قبلها، ونظام التشغيل وحده ينظّف الكاش.
Future<void> shareEventImage(BuildContext context, Event event) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: event.town,
  );

  try {
    final bytes = await AppServices.of(context).api.downloadEventImage(event.id);
    final dir = await Directory.systemTemp.createTemp('aarasna-share-');
    final file = File('${dir.path}/aarasna-${event.id}.png');
    await file.writeAsBytes(bytes, flush: true);

    final text =
        '${event.displayTitle} — ${event.townDisplay}\n${AppConfig.apiBase}/e/${event.id}';
    await shareFileInvoker(path: file.path, text: text);
  } catch (error) {
    debugPrint('تعذّر تنزيل صورة المناسبة وشاركها: $error');
    if (context.mounted) {
      showMessage(context, 'تعذّر تنزيل الصورة — حاول مرة أخرى', isError: true);
    }
  }
}
