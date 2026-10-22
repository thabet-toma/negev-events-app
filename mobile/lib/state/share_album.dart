import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../config.dart';
import '../main.dart';
import '../models/album.dart';
import '../widgets/async_view.dart';
import 'analytics.dart';

/// مشاركة الألبوم والصورة (تذكرة #103) — تعريفٌ واحد يستدعيه سطحان.
///
/// الرابط صفحةٌ مصيَّرة على الخادم (`/a/:id` و`/p/:id`)، لا `#album/…`: ما بعد
/// `#` لا يفتحه التطبيق ولا ينتج معاينة في واتساب (ADR-0006).
///
/// وبناءُ النصّ والرابط في دالّتين نقيّتين بلا `BuildContext`، لأن ورقة مشاركة
/// النظام لا تُختبر في `flutter test` — فالمختبر هو ما يُبنى قبلها.
String albumShareUrl(EventAlbum album) {
  final shared = album.shareUrl;
  if (shared != null && shared.isNotEmpty) return shared;
  // خادمٌ لم يُحدَّث بعد: نبني من المعرّف بدل أن يرمي الزرّ.
  return '${AppConfig.apiBase}/a/${album.id}';
}

String albumShareMessage(EventAlbum album) {
  final line = [album.title, album.town]
      .where((part) => part != null && part.isNotEmpty)
      .join(' — ');
  return '$line\n${albumShareUrl(album)}';
}

String photoShareUrl(EventPhoto photo) => '${AppConfig.apiBase}/p/${photo.id}';

String photoShareMessage(EventPhoto photo) {
  final caption = photo.caption;
  final title = (caption != null && caption.isNotEmpty)
      ? caption
      : 'صورة من ألبوم العرس';
  return '$title\n${photoShareUrl(photo)}';
}

/// فشل ورقة المشاركة يُقال للمستخدم — الصمت هنا يترك النقرة بلا أثر مرئي
/// فتُقرأ عطلاً. (الصمت نمط متّبع لحدث التحليل وحده، لا للمشاركة نفسها.)
Future<void> _share(BuildContext context, String text) async {
  try {
    await SharePlus.instance.share(ShareParams(text: text));
  } catch (_) {
    if (context.mounted) {
      showMessage(context, 'تعذّر فتح قائمة المشاركة', isError: true);
    }
  }
}

Future<void> shareAlbum(BuildContext context, EventAlbum album) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: album.town,
  );
  await _share(context, albumShareMessage(album));
}

Future<void> sharePhoto(BuildContext context, EventPhoto photo) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: photo.town,
  );
  await _share(context, photoShareMessage(photo));
}
