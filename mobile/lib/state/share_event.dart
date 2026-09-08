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
/// التحليل عند النقرة نفسها، بصرف النظر عن نجاح صحيفة المشاركة بعدها أو فشلها.
Future<void> shareEvent(BuildContext context, Event event) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: event.town,
  );

  final url = '${AppConfig.apiBase}/e/${event.id}';
  final text = '${event.displayTitle} — ${event.townDisplay}\n$url';
  try {
    await SharePlus.instance.share(ShareParams(text: text));
  } catch (error) {
    // فشل صحيفة المشاركة يُقال للمستخدم — الصمت هنا يترك النقرة بلا أثر مرئي
    // فتُقرأ عطلاً. (الصمت نمط متّبع لحدث التحليل وحده، لا للمشاركة نفسها.)
    if (context.mounted) {
      showMessage(context, 'تعذّر فتح قائمة المشاركة', isError: true);
    }
  }
}
