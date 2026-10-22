import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';
import '../models/album.dart';
import 'analytics.dart';
import 'share_event.dart' show shareViaSystem;

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
  // الصيغة المتفَق عليها (Q10/D8): «عنوان الألبوم — المناسبة · البلدة».
  // سطرُ المناسبة ليس زينة: ألبومان في بلدة واحدة لا يتميّزان بدونه.
  final place = [album.eventTitle, album.town]
      .where((part) => part != null && part.isNotEmpty)
      .join(' · ');
  final line = place.isEmpty ? album.title : '${album.title} — $place';
  return '$line\n${albumShareUrl(album)}';
}

String photoShareUrl(EventPhoto photo) {
  final shared = photo.shareUrl;
  if (shared != null && shared.isNotEmpty) return shared;
  return '${AppConfig.apiBase}/p/${photo.id}';
}

String photoShareMessage(EventPhoto photo) {
  final caption = photo.caption;
  // بلا تعليق: عنوان الألبوم ثم المناسبة، لا «ألبوم عرس» — فالألبوم قد يكون
  // حنّة أو عزاء أو نجاحاً، والنصّ لا يجوز أن يفترض عرساً.
  final fallback = [photo.albumTitle, photo.eventTitle]
      .where((part) => part != null && part.isNotEmpty)
      .join(' — ');
  final title = (caption != null && caption.isNotEmpty)
      ? caption
      : (fallback.isEmpty ? 'صورة' : fallback);
  return '$title\n${photoShareUrl(photo)}';
}

Future<void> shareAlbum(BuildContext context, EventAlbum album) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: album.town,
  );
  await shareViaSystem(context, albumShareMessage(album));
}

Future<void> sharePhoto(BuildContext context, EventPhoto photo) async {
  recordAnalyticsEvent(
    AppServices.of(context).api,
    'share_clicked',
    contentTown: photo.town,
  );
  await shareViaSystem(context, photoShareMessage(photo));
}
