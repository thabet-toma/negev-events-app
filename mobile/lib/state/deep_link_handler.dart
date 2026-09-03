import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import '../api/negev_api.dart';
import '../screens/event_details_screen.dart';
import '../widgets/async_view.dart';

/// يفتح رابط مناسبة (`https://<الدومين>/e/<id>`) على شاشة تفاصيلها مباشرة —
/// بلا مربّع اختيار تطبيق، وبلا صفحة فارغة إن كانت المناسبة قد حُذفت.
///
/// يغطي الحالتين معاً: الإقلاع البارد (`getInitialLink`، رابط فتح التطبيق
/// أصلاً) والاستئناف الدافئ (`uriLinkStream`، رابط وصل والتطبيق يعمل أصلاً في
/// الخلفية) — `android:launchMode="singleTop"` القائم في AndroidManifest.xml
/// هو ما يضمن وصول الرابط الثاني كـ`onNewIntent` لا كإقلاع مستقل.
///
/// رابط لا يطابق `/e/<رقم>` يُتجاهل بصمت — لا مسار آخر يُستهلك اليوم.
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
    final eventId = _extractEventId(uri);
    if (eventId == null) return;

    final navigator = _navigatorKey.currentState;
    if (navigator == null) return;

    // تحقّق من وجود المناسبة قبل الدفع — رابط قديم لمناسبة حُذفت يهبط على
    // الشاشة القائمة (الرئيسية عادةً) برسالة عربية، لا على شاشة تفاصيل فارغة
    // أو عطل غير مفهوم.
    try {
      await _api.eventDetails(eventId);
    } catch (_) {
      final context = _navigatorKey.currentContext;
      if (context == null || !context.mounted) return;
      showMessage(
        context,
        'تعذّر فتح هذه المناسبة، قد تكون غير موجودة بعد الآن',
        isError: true,
      );
      return;
    }

    navigator.push(
      MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: eventId)),
    );
  }

  /// `/e/<id>` فقط — أي مسار آخر (أو رقم غير صالح) يُتجاهل.
  static int? _extractEventId(Uri uri) {
    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (segments.length < 2 || segments[0] != 'e') return null;
    return int.tryParse(segments[1]);
  }
}
