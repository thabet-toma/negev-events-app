import 'dart:async';

import 'package:flutter/material.dart';

import '../theme.dart';

/// هيكل تحميل بدل دوّارة — نفس صورة الكرت الحقيقي (صندوق وسائط يملأ الارتفاع
/// المتبقي ثم سطرا نصّ؛ صندوق ٤:٥ الثابت حُذف مع المواصفة #98)
/// كي لا تقفز التغذية حين تصل البيانات الفعلية (#85 قصة 53). ثابت بلا نبض:
/// النغمة الوقورة تكتفي بهياكل بلا أي حركة زائدة، وهذا الهيكل نفسه هو ما
/// يظهر في كل الأنواع أثناء التحميل — لا حركة فيه أصلاً لتُلغى.
class EventCardSkeleton extends StatelessWidget {
  const EventCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final base = context.c.surfaceSunk;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: ColoredBox(color: base)),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _bar(base, width: 160, height: 16),
                const SizedBox(height: 10),
                _bar(base, width: 110, height: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bar(Color color, {required double width, required double height}) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: SizedBox(width: width, height: height, child: ColoredBox(color: color)),
    );
  }
}

/// قائمة هياكل بديلة عن الدوّارة أثناء تحميل التغذية — بملء الشاشة مع التمرير الإنجذابي.
class EventFeedSkeletonList extends StatelessWidget {
  const EventFeedSkeletonList({super.key, this.itemCount = 3});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return PageView.builder(
      scrollDirection: Axis.vertical,
      physics: const PageScrollPhysics(),
      itemCount: itemCount,
      itemBuilder: (context, index) => const EventCardSkeleton(),
    );
  }
}

/// ظهور متدرّج للشاشة الأولى وحدها (#85 قصة 53-54) — تلاشٍ وانزلاق خفيف عند
/// أوّل بناء، بتأخير يتصاعد مع [index] (تأثير "تعاقب"). يحترم
/// `MediaQuery.disableAnimations` (يجمع تفضيل النظام ومحاكاة الاختبار معاً):
/// إن كان مفعَّلاً يظهر المحتوى فوراً بلا أي حركة — الهيكل وحده يبقى متحرّكاً
/// بمعنى "يظهر" لا "يتحرّك".
class FirstScreenFadeIn extends StatefulWidget {
  const FirstScreenFadeIn({super.key, required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<FirstScreenFadeIn> createState() => _FirstScreenFadeInState();
}

class _FirstScreenFadeInState extends State<FirstScreenFadeIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
  );
  late final Animation<double> _opacity = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOut,
  );
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, 0.04),
    end: Offset.zero,
  ).animate(_opacity);

  bool _started = false;
  Timer? _delayTimer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;

    if (MediaQuery.of(context).disableAnimations) {
      _controller.value = 1;
      return;
    }

    final delay = Duration(milliseconds: 30 * widget.index.clamp(0, 10));
    _delayTimer = Timer(delay, () => _controller.forward());
  }

  @override
  void dispose() {
    // بلا هذا الإلغاء يبقى المؤقّت معلَّقاً بعد تخلّص الودجت — يفشل به فحص
    // `flutter_test` نفسه (`!timersPending`) عند بناء ودجتين متتاليين بلا
    // انتظار كافٍ بينهما.
    _delayTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _slide, child: widget.child),
    );
  }
}
