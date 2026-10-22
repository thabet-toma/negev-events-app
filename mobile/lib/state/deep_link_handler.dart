import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import '../api/negev_api.dart';
import '../screens/albums_screen.dart';
import '../screens/event_details_screen.dart';
import '../widgets/async_view.dart';

/// هدف الرابط: نوعٌ ومعرّف. `null` لمسار لا نعرفه أو رقم غير صالح.
typedef DeepLinkTarget = ({String kind, int id});

/// يفتح رابطاً من نطاقنا على شاشته مباشرة — بلا مربّع اختيار تطبيق، وبلا صفحة
/// فارغة إن كان الهدف قد حُذف: `/e/<id>` مناسبة، `/a/<id>` ألبوم، `/p/<id>`
/// صورة (تذكرة #104).
///
/// يغطي الحالتين معاً: الإقلاع البارد (`getInitialLink`، رابط فتح التطبيق
/// أصلاً) والاستئناف الدافئ (`uriLinkStream`، رابط وصل والتطبيق يعمل أصلاً في
/// الخلفية) — `android:launchMode="singleTop"` القائم في AndroidManifest.xml
/// هو ما يضمن وصول الرابط الثاني كـ`onNewIntent` لا كإقلاع مستقل.
///
/// رابط لا يطابق هذه المسارات يُتجاهل بصمت — لا رسالة خطأ عن رابط لا يخصّنا.
class DeepLinkHandler {
  DeepLinkHandler({
    required GlobalKey<NavigatorState> navigatorKey,
    required NegevApi api,
    AppLinks? appLinks,
  })  : _navigatorKey = navigatorKey,
        _api = api,
        _appLinks = appLinks ?? AppLinks();

  final GlobalKey<NavigatorState> _navigatorKey;
  final NegevApi _api;
  final AppLinks _appLinks;
  StreamSubscription<Uri>? _subscription;

  /// يبدأ الاستماع. لا يُنتظر — يُستدعى مرّة عند إقلاع التطبيق ولا يُلغى إلا
  /// عند إغلاقه كاملاً (لا شاشة تملك دورة حياته).
  Future<void> start() async {
    // ننتظر أوّل إطار كي يكون جذر الملاحة (`_navigatorKey.currentState`) قد
    // بُني فعلاً قبل أي محاولة دفع — رابط بارد قد يصل قبل ذلك.
    await WidgetsBinding.instance.endOfFrame;

    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) unawaited(_handle(initial));
    } catch (_) {
      // رابط بارد غير مفهوم لا يجب أن يمنع إقلاع التطبيق عادياً.
    }

    _subscription = _appLinks.uriLinkStream.listen(
      (uri) => unawaited(_handle(uri)),
      onError: (_) {},
    );
  }

  void dispose() {
    _subscription?.cancel();
  }

  Future<void> _handle(Uri uri) async {
    final target = extractTarget(uri);
    if (target == null) return;

    final navigator = _navigatorKey.currentState;
    if (navigator == null) return;

    // تحقّق من الوجود قبل الدفع — رابط قديم لشيء حُذف أو لم يُنشر يهبط على
    // الشاشة القائمة برسالة عربية، لا على شاشة فارغة أو عطل غير مفهوم.
    try {
      if (target.kind == 'event') {
        await _api.eventDetails(target.id);
        navigator.push(
          MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: target.id)),
        );
        return;
      }
      if (target.kind == 'album') {
        await _api.albumDetails(target.id);
        navigator.push(
          MaterialPageRoute(builder: (_) => AlbumDetailScreen.byId(albumId: target.id)),
        );
        return;
      }
      if (target.kind == 'photo') {
        // الصورة تُفتح داخل ألبومها وعلى موضعها — لا عارضاً فيه `1 / 1`.
        final photo = await _api.photo(target.id);
        navigator.push(
          MaterialPageRoute(
            builder: (_) => AlbumDetailScreen.byId(
              albumId: photo.albumId,
              focusPhotoId: photo.id,
            ),
          ),
        );
      }
    } catch (_) {
      final context = _navigatorKey.currentContext;
      if (context == null || !context.mounted) return;
      showMessage(
        context,
        'تعذّر فتح هذا الرابط، قد يكون غير موجود أو لم يُنشر بعد',
        isError: true,
      );
    }
  }

  /// `/e/<id>` مناسبة، `/a/<id>` ألبوم، `/p/<id>` صورة (تذكرة #104) — وأي
  /// مسار آخر يُتجاهل بصمت كما كان.
  static DeepLinkTarget? extractTarget(Uri uri) {
    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (segments.length < 2) return null;
    const kinds = {'e': 'event', 'a': 'album', 'p': 'photo'};
    final kind = kinds[segments[0]];
    if (kind == null) return null;
    final id = int.tryParse(segments[1]);
    if (id == null || id <= 0) return null;
    return (kind: kind, id: id);
  }
}
