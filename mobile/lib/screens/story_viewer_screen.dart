import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../models/event.dart';
import '../state/device_id_store.dart';
import '../widgets/async_view.dart' show showMessage;
import '../widgets/congratulations.dart' show openSignInGate;

/// عتبة "شوهدت" (README، جدول الستوريات؛ `stories.routes.js`): ثانيتان
/// تُقاس على جهاز المشاهد، لا على الخادم. هذا الثابت هو تلك العتبة فقط —
/// مدة عرض الشريحة نفسها تأتي من `Story.slideDurationSeconds` (من الخادم).
const int _watchedThresholdMs = 2000;

/// عارض ستوري ملء الشاشة — يُفتح من أي حلقة في شريط الستوريات
/// (`_StoriesStrip` في `events_screen.dart`)، ويبدأ من الحلقة المنقورة.
///
/// سلوك RTL موثَّق حرفياً في README ("RTL في عارض الستوري — ما ينعكس وما لا
/// ينعكس"): أشرطة التقدّم ومناطق النقر معكوسة صراحةً في هذا الملف، والسحب
/// للإغلاق والضغط المطوّل للإيقاف ليسا كذلك.
class StoryViewerScreen extends StatefulWidget {
  const StoryViewerScreen({
    super.key,
    required this.stories,
    required this.initialIndex,
  });

  final List<Story> stories;
  final int initialIndex;

  @override
  State<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends State<StoryViewerScreen>
    with SingleTickerProviderStateMixin {
  late int _index;
  late final AnimationController _controller;
  bool _viewRecorded = false;
  double _verticalDrag = 0;

  Story get _current => widget.stories[_index];

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _controller = AnimationController(vsync: this)
      ..addListener(_onTick)
      ..addStatusListener(_onStatus);
    _startSlide();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _startSlide() {
    _viewRecorded = false;
    _controller
      ..duration = Duration(seconds: _current.slideDurationSeconds)
      ..value = 0
      ..forward();
  }

  /// يتحقّق من عتبة الثانيتين على كل نبضة رسم — `_controller.value` يتجمّد
  /// فعلياً حين يُستدعى `_pause` (الضغط المطوّل)، فزمن المشاهدة الفعلي يتوقّف
  /// معه تلقائياً بلا حاجة لمؤقّت منفصل يُدار يدوياً.
  void _onTick() {
    if (_viewRecorded) return;
    final durationMs = _controller.duration?.inMilliseconds ?? 0;
    if (durationMs == 0) return;
    final elapsedMs = _controller.value * durationMs;
    if (elapsedMs >= _watchedThresholdMs) {
      _viewRecorded = true;
      _recordView(_current);
    }
  }

  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed) _goNext();
  }

  Future<void> _recordView(Story story) async {
    try {
      final deviceId = await DeviceIdStore.get();
      if (!mounted) return;
      await AppServices.of(context).api.viewStory(story.id, deviceId: deviceId);
    } catch (_) {
      // تسجيل المشاهدة تحسين صامت — فشله لا يوقف العرض ولا يزعج المستخدم.
    }
  }

  void _goNext() {
    if (_index >= widget.stories.length - 1) {
      Navigator.of(context).maybePop();
      return;
    }
    setState(() => _index++);
    _startSlide();
  }

  void _goPrevious() {
    if (_index == 0) {
      _startSlide();
      return;
    }
    setState(() => _index--);
    _startSlide();
  }

  void _pause() => _controller.stop();

  void _resume() => _controller.forward();

  /// مناطق النقر تُعكس صراحةً هنا: `Directionality` يعكس كائنات الرسم
  /// تلقائياً (أشرطة التقدّم) لكن لا يعكس إحداثية نقر خام محسوبة يدوياً
  /// (README، "فخّان معروفان لأي عارض يُبنى لاحقاً"). يسار الشاشة (dx
  /// الأصغر من نصف العرض) = التالي، يمينها = السابق — هذا هو المقصود،
  /// معاكس للافتراض الغربي، ولا يُصلَح.
  void _handleTap(TapUpDetails details, double width) {
    if (details.localPosition.dx < width / 2) {
      _goNext();
    } else {
      _goPrevious();
    }
  }

  Future<void> _openTarget(Story story) async {
    final url = story.targetUrl;
    if (url == null || url.isEmpty) return;

    try {
      final deviceId = await DeviceIdStore.get();
      if (!mounted) return;
      await AppServices.of(context).api.clickStory(story.id, deviceId: deviceId);
    } catch (_) {
      // فشل تسجيل النقرة لا يمنع فتح الرابط نفسه.
    }

    final uri = Uri.tryParse(url);
    final launched = uri == null
        ? false
        : await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      showMessage(context, 'تعذّر فتح الرابط', isError: true);
    }
  }

  Future<void> _report(Story story) async {
    final auth = AppServices.of(context).auth;
    if (!auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول للإبلاغ عن هذه القصة');
      return;
    }

    _pause();
    try {
      await AppServices.of(context).api.reportStory(story.id);
      if (mounted) showMessage(context, 'تم استلام بلاغك');
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) _resume();
    }
  }

  @override
  Widget build(BuildContext context) {
    final story = _current;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (details) => _handleTap(details, constraints.maxWidth),
                onLongPressStart: (_) => _pause(),
                onLongPressEnd: (_) => _resume(),
                // السحب للأسفل للخروج — لا ينعكس بالـRTL (README).
                onVerticalDragUpdate: (details) => _verticalDrag += details.delta.dy,
                onVerticalDragEnd: (_) {
                  if (_verticalDrag > 80) Navigator.of(context).maybePop();
                  _verticalDrag = 0;
                },
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _StorySlideImage(story: story),
                    Positioned(
                      top: 8,
                      right: 10,
                      left: 10,
                      child: _ProgressBars(
                        count: widget.stories.length,
                        currentIndex: _index,
                        controller: _controller,
                      ),
                    ),
                    Positioned(
                      top: 22,
                      right: 6,
                      left: 6,
                      child: _StoryHeader(
                        story: story,
                        onClose: () => Navigator.of(context).maybePop(),
                      ),
                    ),
                    Positioned(
                      bottom: 20,
                      right: 16,
                      left: 16,
                      child: story.isAd
                          ? _AdActionBar(
                              story: story,
                              onOpenTarget: () => _openTarget(story),
                              onReport: () => _report(story),
                            )
                          : Align(
                              alignment: Alignment.centerLeft,
                              child: _ReportButton(onReport: () => _report(story)),
                            ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _StorySlideImage extends StatelessWidget {
  const _StorySlideImage({required this.story});

  final Story story;

  @override
  Widget build(BuildContext context) {
    final image = story.image;
    if (image == null || image.isEmpty) {
      return const ColoredBox(color: Colors.black87);
    }
    return CachedNetworkImage(
      imageUrl: image,
      fit: BoxFit.contain,
      placeholder: (_, _) =>
          const Center(child: CircularProgressIndicator(color: Colors.white54)),
      errorWidget: (_, _, _) => const ColoredBox(color: Colors.black87),
    );
  }
}

/// أشرطة التقدّم — بترتيب `count` عادي، لكن الملء داخل كل شريط مُثَبَّت
/// صراحةً على `Alignment.centerRight` (لا اعتماداً على انعكاس ضمني)، حتى
/// يمتلئ كل شريط من اليمين بلا لبس، بصرف النظر عن أي سلوك RTL افتراضي.
/// ترتيب الحلقات نفسه (الأولى أقصى اليمين) يأتي من `Row` عادي تحت
/// `Directionality.rtl` المحيطة بالشاشة — هذا انعكاس قياسي لا يحتاج كوداً إضافياً.
class _ProgressBars extends StatelessWidget {
  const _ProgressBars({
    required this.count,
    required this.currentIndex,
    required this.controller,
  });

  final int count;
  final int currentIndex;
  final Animation<double> controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Row(
          children: List.generate(count, (i) {
            final value = i < currentIndex
                ? 1.0
                : (i == currentIndex ? controller.value : 0.0);
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: _ProgressBar(value: value),
              ),
            );
          }),
        );
      },
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: Container(
        height: 3,
        color: Colors.white.withValues(alpha: 0.3),
        child: Align(
          alignment: Alignment.centerRight,
          child: FractionallySizedBox(
            widthFactor: value.clamp(0.0, 1.0),
            child: const ColoredBox(color: Colors.white),
          ),
        ),
      ),
    );
  }
}

class _StoryHeader extends StatelessWidget {
  const _StoryHeader({required this.story, required this.onClose});

  final Story story;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final subtitle = [story.clan, story.town].whereType<String>().join(' · ');
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (story.title.isNotEmpty)
                Text(
                  story.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
              if (subtitle.isNotEmpty)
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 12,
                  ),
                ),
            ],
          ),
        ),
        // شارة «إعلان» — الطبقة الأولى من طبقات فصل الإعلان الثلاث (README).
        if (story.isAd)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 6),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'إعلان',
              style: TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        // زرّ إغلاق ظاهر دائماً — مسؤولية العارض لا الخادم (README).
        IconButton(
          icon: const Icon(Icons.close, color: Colors.white),
          onPressed: onClose,
        ),
      ],
    );
  }
}

/// شريط إجراء الإعلان — الطبقتان الثانية والثالثة من فصل الإعلان: اسم المعلن
/// حرفياً كما أرسله الخادم، وزرّ الإبلاغ.
class _AdActionBar extends StatelessWidget {
  const _AdActionBar({
    required this.story,
    required this.onOpenTarget,
    required this.onReport,
  });

  final Story story;
  final VoidCallback onOpenTarget;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final hasTarget = story.targetUrl != null && story.targetUrl!.isNotEmpty;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              story.advertiserName ?? '',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
          if (hasTarget)
            ElevatedButton(onPressed: onOpenTarget, child: const Text('زيارة')),
          _ReportButton(onReport: onReport),
        ],
      ),
    );
  }
}

class _ReportButton extends StatelessWidget {
  const _ReportButton({required this.onReport});

  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.flag_outlined, color: Colors.white70),
      tooltip: 'إبلاغ',
      onPressed: onReport,
    );
  }
}
