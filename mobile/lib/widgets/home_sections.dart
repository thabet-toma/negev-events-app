import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../models/event.dart';
import '../models/service.dart';
import '../models/stats_ticker.dart';
import '../theme.dart';
import 'event_card.dart'
    show
        EventCountdownChip,
        arabicDayNumber,
        arabicEventDate,
        arabicMonthName,
        arabicWeekdayName,
        jerusalemDateTime,
        jerusalemToday;

/// أقسام الرئيسية الجديدة — الشريط الإخباري، وبطاقة الترحيب، والأعراس
/// المميزة، و«هذا الأسبوع قربك»، وصفّ الأفعال السريعة، و«جديد عنا»، و«الأكثر
/// تفاعلاً»، وشرائط فئات الخدمات، وبانر المزوّد.
///
/// **لماذا ملف مستقل:** `events_screen.dart` يجمع البيانات ويربط المعالجات
/// ويرتّب الأقسام في ترويسته وحدها، ولا يعرف كيف يُرسم أيٌّ منها؛ فتبقى الشاشة
/// صغيرة وكل شكل قسم هنا. والمنطق لا يُكرَّر: كل فعل (تذكير، حضور، تبريك،
/// نشر، تبديل وجهة) يصل من الشاشة معالجاً جاهزاً — نفس المسارات القائمة.

// ===== ١. الشريط الإخباري =================================================

/// سطر واحد في الشريط الإخباري — نصّه العربي، ووجهته إن كانت له كبسة.
///
/// و[gold] للسطور الذهبية وحدها — أسعار الذهب بالعيارات الثلاثة — كما في
/// الويب (`.home-ticker-item.is-gold { color: var(--gold) }`): اللون يقول
/// «سعر» قبل أن يُقرأ النصّ، وبقية السطور بحبر السطح.
class HomeTickerItem {
  const HomeTickerItem(this.text, {this.onTap, this.gold = false});

  final String text;
  final VoidCallback? onTap;
  final bool gold;
}

/// يبني سطور الشريط من `GET /api/stats/ticker` — **دالة محضة** تُختبر وحدها
/// ([now] يُمرَّر لا يُقرأ)، فلا حسبة ولا نصّ في الودجت نفسه.
///
/// كل جزء غائب يُحذف ولا يُعوَّض: محافظة بلا مناسبات قادمة، أو مجموع صفري، أو
/// أسعار لم تصل (`prices: null`)، أو خبر غائب. والسطر الأخير — يوم اليوم في
/// القدس — لا يغيب أبداً، فالشريط لا يظهر فارغاً أبداً حين يُطلب.
List<HomeTickerItem> buildHomeTickerItems({
  StatsTicker? stats,
  DateTime? now,
  VoidCallback? onNewsTap,
}) {
  final items = <HomeTickerItem>[];
  if (stats != null) {
    for (final region in stats.regions) {
      if (region.upcomingCount <= 0 || region.name.trim().isEmpty) continue;
      items.add(HomeTickerItem(
        '📍 ${region.upcomingCount} مناسبة في ${region.name.trim()}',
      ));
    }
    if (stats.total > 0) {
      items.add(HomeTickerItem('🎉 ${stats.total} مناسبة قادمة'));
    }

    final prices = stats.prices;
    if (prices != null) {
      final gold = prices.gold;
      if (gold != null) {
        for (final karat in const [24, 21, 18]) {
          final perGram = gold.perGram(karat);
          if (perGram == null || perGram <= 0) continue;
          items.add(HomeTickerItem(
            'الذهب عيار $karat: ₪${perGram.toStringAsFixed(2)} للغرام',
            gold: true,
          ));
        }
      }
      // العملات الثلاث المطلوبة وحدها — عملة أخرى في الردّ لا سطر لها.
      for (final entry in _tickerCurrencies) {
        for (final currency in prices.currencies) {
          if (currency.code.toUpperCase() != entry.code) continue;
          if (currency.ilsPerUnit <= 0) continue;
          items.add(HomeTickerItem(
            '${entry.label} ₪${currency.ilsPerUnit.toStringAsFixed(2)}',
          ));
        }
      }
    }

    final news = stats.latestNews;
    if (news != null) {
      items.add(HomeTickerItem('📰 ${news.title}', onTap: onNewsTap));
    }

    final updatedAt = stats.updatedAt;
    if (updatedAt != null) {
      final local = jerusalemDateTime(updatedAt);
      final hh = local.hour.toString().padLeft(2, '0');
      final mm = local.minute.toString().padLeft(2, '0');
      items.add(HomeTickerItem('🕒 حُدّث $hh:$mm'));
    }
  }

  final today = jerusalemToday(now);
  items.add(HomeTickerItem(
    '📅 ${arabicWeekdayName(today.weekday)} '
    '${arabicDayNumber(today.day)} ${arabicMonthName(today.month)}',
  ));
  return items;
}

/// العملات الثلاث المعروضة في الشريط بأسمائها العربية — رمز العملة كما يرسله
/// الخادم هو المفتاح، والاسم نصّ عرض لا يخترعه الخادم علينا.
const List<({String code, String label})> _tickerCurrencies = [
  (code: 'USD', label: 'الدولار'),
  (code: 'JOD', label: 'الدينار الأردني'),
  (code: 'EUR', label: 'اليورو'),
];

/// الشريط الإخباري المتحرّك: سطوره متّصلة بفاصل ذهبي ✦، تنساب من اليمين إلى
/// اليسار (اتجاه القراءة العربية: البداية تخرج من اليمين والتالي يدخل من
/// اليسار)، وتتكرّر بلا قطع.
///
/// **الحركة على شرائح:** الشريط يتحرّك [speed] بكسل في الثانية على مدى
/// [slide]، ثم يستريح [pause] ويبدأ الشريحة التالية. لا مؤقّت يعمل حين لا
/// يتحرّك شيء: `isActive == false` (تبويب آخر أو شاشة فوقها) أو
/// `MediaQuery.disableAnimations` (تقليل الحركة في النظام) أو سطر واحد يتّسع
/// له العرض.
class HomeTickerBar extends StatefulWidget {
  const HomeTickerBar({
    super.key,
    required this.items,
    required this.isActive,
  });

  final List<HomeTickerItem> items;
  final bool isActive;

  @override
  State<HomeTickerBar> createState() => _HomeTickerBarState();
}

class _HomeTickerBarState extends State<HomeTickerBar>
    with SingleTickerProviderStateMixin {
  final ScrollController _scroll = ScrollController();
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _slide,
  )
    ..addListener(_applyShift)
    ..addStatusListener(_onAnimationStatus);
  Timer? _pauseTimer;

  /// إجمالي ما انزاح منذ آخر إعادة تصفير — يُقصّ بالطول الكامل للنسخة عند
  /// الرسم، فيعود المحتوى إلى أوله بلا قفزة مرئية.
  double _shift = 0;
  double _shiftStart = 0;
  bool _disableAnimations = false;

  static const Duration _slide = Duration(milliseconds: 2000);
  static const Duration _pause = Duration(milliseconds: 240);
  static const double _speed = 55; // بكسل في الثانية

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _disableAnimations = MediaQuery.of(context).disableAnimations;
    // بعد أول تخطيط: المقاسات معروفة، فيُعرف أيتّسع المحتوى للعرض أم يحتاج
    // حركة — ولا مؤقّت يبدأ قبل ذلك.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _sync();
    });
  }

  @override
  void didUpdateWidget(covariant HomeTickerBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.items.length != widget.items.length ||
        oldWidget.isActive != widget.isActive) {
      _shift = 0;
      _shiftStart = 0;
      if (_scroll.hasClients) _scroll.jumpTo(0);
      _sync();
    }
  }

  @override
  void dispose() {
    _pauseTimer?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  bool get _shouldAnimate =>
      widget.isActive && !_disableAnimations && widget.items.isNotEmpty;

  void _sync() {
    if (!_shouldAnimate) {
      _pauseTimer?.cancel();
      _pauseTimer = null;
      _controller.stop();
      return;
    }
    _scheduleTick();
  }

  void _scheduleTick() {
    _pauseTimer ??= Timer(_pause, _tick);
  }

  void _tick() {
    _pauseTimer = null;
    if (!mounted || !_shouldAnimate) return;
    // سطر واحد يتّسع للعرض: لا حركة إطلاقاً — لا مؤقّت ولا إطار.
    if (!_scroll.hasClients || _scroll.position.maxScrollExtent <= 0) return;
    if (_controller.isAnimating) return;
    _shiftStart = _shift;
    _controller.forward(from: 0);
  }

  void _applyShift() {
    if (!mounted || !_scroll.hasClients) return;
    final position = _scroll.position;
    // النسختان متطابقتان، فعرض الواحدة نصف طول المحتوى الكامل.
    final copyWidth = (position.maxScrollExtent + position.viewportDimension) / 2;
    if (copyWidth <= 0) return;
    final shift =
        _shiftStart + _speed * _slide.inMilliseconds / 1000 * _controller.value;
    final offset = (copyWidth - (shift % copyWidth)) % copyWidth;
    if ((offset - position.pixels).abs() < 0.5) return;
    _scroll.jumpTo(offset);
  }

  void _onAnimationStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    _shift = _shiftStart + _speed * _slide.inMilliseconds / 1000;
    _scheduleTick();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();
    final c = context.c;

    return Container(
      key: const Key('home_ticker_bar'),
      height: 36,
      decoration: BoxDecoration(
        color: c.surfaceSunk,
        border: Border(
          top: BorderSide(color: c.lineSoft),
          bottom: BorderSide(color: c.lineSoft),
        ),
      ),
      child: ClipRect(
        child: SingleChildScrollView(
          controller: _scroll,
          scrollDirection: Axis.horizontal,
          physics: const NeverScrollableScrollPhysics(),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              ..._copy(context),
              ..._copy(context),
            ],
          ),
        ),
      ),
    );
  }

  /// نسخة واحدة من السطور، كلٌّ يتبعه فاصل ذهبي ✦ — والنسخة الثانية تُلصق
  /// بها فيُرى الشريط متّصلاً بلا فراغ حين يلتفّ.
  List<Widget> _copy(BuildContext context) {
    final c = context.c;
    final children = <Widget>[];
    for (final item in widget.items) {
      final text = Text(
        item.text,
        maxLines: 1,
        softWrap: false,
        style: TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          // سطور الذهب بلون الذهب — نفس `.home-ticker-item.is-gold` في الويب.
          color: item.gold ? c.gold : c.ink,
        ),
      );
      children.add(
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: item.onTap == null
              ? text
              : InkWell(
                  key: Key('home_ticker_item_${item.text}'),
                  onTap: item.onTap,
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: text,
                  ),
                ),
        ),
      );
      children.add(
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Text(
            '✦',
            style: TextStyle(fontSize: 11, color: c.gold),
          ),
        ),
      );
    }
    return children;
  }
}

// ===== ٢. بطاقة الترحيب ===================================================

/// بطاقة الترحيب: عنوان ورسالة يكتبهما السوبر أدمن (`home_welcome`)، بإطار
/// ذهبي ووردة وزرّ إغلاق. إغلاقها يُسجَّل ببصمة نصّها في الشاشة، فتعود
/// برسالة جديدة وحدها.
class HomeWelcomeCard extends StatelessWidget {
  const HomeWelcomeCard({
    super.key,
    required this.title,
    required this.message,
    required this.onDismiss,
  });

  final String title;
  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      key: const Key('home_welcome_card'),
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
      decoration: BoxDecoration(
        color: c.goldWash,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.gold, width: 1.2),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 1),
            child: Text('🌷', style: TextStyle(fontSize: 18)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (title.isNotEmpty)
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: c.ink,
                    ),
                  ),
                if (message.isNotEmpty) ...[
                  if (title.isNotEmpty) const SizedBox(height: 3),
                  Text(
                    message,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.5,
                      color: c.inkSoft,
                    ),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            key: const Key('home_welcome_dismiss'),
            onPressed: onDismiss,
            tooltip: 'إغلاق',
            visualDensity: VisualDensity.compact,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            padding: EdgeInsets.zero,
            icon: Icon(Icons.close, size: 16, color: c.inkSoft),
          ),
        ],
      ),
    );
  }
}

// ===== ٣. الأعراس المميزة =================================================

/// «الأعراس المميزة» — بطاقة واحدة بعرض الشاشة لكل صفحة، تتقدّم وحدها كل
/// [autoAdvance] وتتوقّف عند اللمس أو عدم النشاط أو تقليل الحركة. ونقاط تحت
/// البطاقة تفتح الصفحة المطلوبة.
class FeaturedCarousel extends StatefulWidget {
  const FeaturedCarousel({
    super.key,
    required this.events,
    required this.isActive,
    required this.onOpen,
    this.onRemind,
    this.onRsvp,
    this.onCongratulate,
  });

  final List<Event> events;
  final bool isActive;
  final void Function(int eventId) onOpen;

  /// «مهتم» ونجمة البطاقة — مسار «ذكّرني» القائم نفسه.
  final void Function(Event event)? onRemind;

  /// «جاي» — مسار تأكيد الحضور القائم نفسه.
  final void Function(Event event)? onRsvp;

  /// «بارك»/«عزّي» — مسار ورقة الرسائل القائم نفسه.
  final void Function(Event event)? onCongratulate;

  /// كل كم تتقدّم البطاقة وحدها.
  static const Duration autoAdvance = Duration(seconds: 5);

  @override
  State<FeaturedCarousel> createState() => _FeaturedCarouselState();
}

class _FeaturedCarouselState extends State<FeaturedCarousel> {
  final PageController _pageController = PageController(viewportFraction: 1.0);
  int _currentPage = 0;
  Timer? _autoTimer;
  bool _userTouching = false;
  bool _disableAnimations = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _disableAnimations = MediaQuery.of(context).disableAnimations;
    _syncTimer();
  }

  @override
  void didUpdateWidget(covariant FeaturedCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_currentPage >= widget.events.length && widget.events.isNotEmpty) {
      _currentPage = widget.events.length - 1;
      if (_pageController.hasClients) {
        _pageController.jumpToPage(_currentPage);
      }
    }
    _syncTimer();
  }

  void _syncTimer() {
    // بطاقة واحدة أو تقليل الحركة أو تبويب غير مختار: لا مؤقّت إطلاقاً.
    final shouldRun = widget.isActive &&
        widget.events.length > 1 &&
        !_userTouching &&
        !_disableAnimations;
    if (!shouldRun) {
      _autoTimer?.cancel();
      _autoTimer = null;
      return;
    }
    _autoTimer ??= Timer.periodic(FeaturedCarousel.autoAdvance, (_) {
      if (!mounted || !_pageController.hasClients || widget.events.length <= 1) {
        return;
      }
      final next = (_currentPage + 1) % widget.events.length;
      _pageController.animateToPage(
        next,
        duration: const Duration(milliseconds: 380),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _autoTimer?.cancel();
    _autoTimer = null;
    _pageController.dispose();
    super.dispose();
  }

  void _goToPage(int index) {
    if (!_pageController.hasClients) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    // البطاقة تُقاس من الشاشة: أطول من نصفها بقليل، فلا تدفع كل شيء خارجها.
    final screen = MediaQuery.sizeOf(context);
    final cardHeight = math.min(screen.height * 0.66, 560.0).clamp(300.0, 560.0);

    return Column(
      key: const Key('featured_carousel'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 8),
          child: Row(
            children: [
              const Icon(Icons.star_rounded, size: 18, color: cardGold),
              const SizedBox(width: 6),
              Text(
                'الأعراس المميزة',
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w900,
                  color: c.ink,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: cardHeight,
          child: Listener(
            onPointerDown: (_) {
              _userTouching = true;
              _syncTimer();
            },
            onPointerUp: (_) {
              _userTouching = false;
              _syncTimer();
            },
            onPointerCancel: (_) {
              _userTouching = false;
              _syncTimer();
            },
            child: PageView.builder(
              controller: _pageController,
              itemCount: widget.events.length,
              onPageChanged: (index) {
                if (mounted) setState(() => _currentPage = index);
              },
              itemBuilder: (context, index) {
                final event = widget.events[index];
                return _FeaturedCard(
                  event: event,
                  onOpen: () => widget.onOpen(event.id),
                  onRemind: widget.onRemind == null
                      ? null
                      : () => widget.onRemind!(event),
                  onRsvp: widget.onRsvp == null
                      ? null
                      : () => widget.onRsvp!(event),
                  onCongratulate: widget.onCongratulate == null
                      ? null
                      : () => widget.onCongratulate!(event),
                );
              },
            ),
          ),
        ),
        if (widget.events.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var index = 0; index < widget.events.length; index += 1)
                  _FeaturedDot(
                    key: Key('featured_dot_$index'),
                    selected: index == _currentPage,
                    onTap: () => _goToPage(index),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// نقطة واحدة في مؤشّر الصفحات — قابلة للكبس، فالنقاط تنقّل لا زينة.
class _FeaturedDot extends StatelessWidget {
  const _FeaturedDot({super.key, required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: selected ? 20 : 7,
            height: 7,
            decoration: BoxDecoration(
              color: selected ? c.gold : c.line,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
      ),
    );
  }
}

/// بطاقة مناسبة مميزة واحدة: الملصق كاملاً على أرضية داكنة (‏`BoxFit.contain`
/// فلا يُقصّ شيء)، وإطار ذهبي متوهّج، ووسام «✦ مناسبة مميزة»، وشارة العدّ
/// التنازلي على الزاوية، ثم لوح المعلومات وأفعاله.
class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({
    required this.event,
    required this.onOpen,
    this.onRemind,
    this.onRsvp,
    this.onCongratulate,
  });

  final Event event;
  final VoidCallback onOpen;
  final VoidCallback? onRemind;
  final VoidCallback? onRsvp;
  final VoidCallback? onCongratulate;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final type = event.occasionType;
    final isSolemn = type?.isSolemn ?? false;
    final isReminded = event.isReminded;
    final going = event.myRsvp?.isGoing ?? false;
    final showRsvp = !isSolemn && (type?.rsvpEnabled ?? false) && onRsvp != null;
    final messagesLabel = isSolemn ? 'عزّي' : 'بارك';
    final meta = [
      event.villageDisplayName ?? event.town,
      arabicEventDate(event.eventDate),
      if (event.dinnerTime.trim().isNotEmpty) event.dinnerTime.trim(),
    ].where((part) => part.trim().isNotEmpty).join(' · ');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: cardGold.withValues(alpha: 0.28),
              blurRadius: 18,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Material(
          color: c.surface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: cardGold, width: 1.4),
          ),
          child: InkWell(
            key: Key('featured_card_${event.id}'),
            onTap: onOpen,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      // ٤:٥ للصورة، مقيّدة بالمساحة المتاحة فلا تدفع اللوح
                      // خارج البطاقة على شاشة قصيرة.
                      final posterHeight = math.min(
                        constraints.maxHeight,
                        constraints.maxWidth * 5 / 4,
                      );
                      final posterWidth = math.min(
                        constraints.maxWidth,
                        posterHeight * 4 / 5,
                      );
                      return ColoredBox(
                        color: cardGround,
                        child: Center(
                          child: SizedBox(
                            width: posterWidth,
                            height: posterHeight,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                _poster(c),
                                const PositionedDirectional(
                                  top: 10,
                                  start: 10,
                                  child: _FeaturedBadge(),
                                ),
                                PositionedDirectional(
                                  top: 10,
                                  end: 10,
                                  child: EventCountdownChip(
                                    eventDate: event.eventDate,
                                    isSolemn: isSolemn,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              event.cardHeadline,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 16,
                                height: 1.3,
                                fontWeight: FontWeight.w900,
                                color: c.ink,
                              ),
                            ),
                          ),
                          if (onRemind != null)
                            IconButton(
                              key: Key('featured_remind_${event.id}'),
                              onPressed: onRemind,
                              tooltip: isReminded ? 'في قائمتي' : 'أضف لقائمتي',
                              visualDensity: VisualDensity.compact,
                              constraints:
                                  const BoxConstraints(minWidth: 34, minHeight: 34),
                              padding: EdgeInsets.zero,
                              icon: Icon(
                                isReminded ? Icons.star : Icons.star_border,
                                size: 22,
                                color: isReminded ? cardGold : c.inkSoft,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.3,
                          fontWeight: FontWeight.w600,
                          color: c.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          if (onRemind != null)
                            Expanded(
                              child: _FeaturedAction(
                                icon: isReminded
                                    ? Icons.favorite
                                    : Icons.favorite_border,
                                label: 'مهتم',
                                highlight: isReminded,
                                onTap: onRemind,
                              ),
                            ),
                          if (showRsvp) ...[
                            const SizedBox(width: 6),
                            Expanded(
                              child: _FeaturedAction(
                                icon: going
                                    ? Icons.check_circle
                                    : Icons.check_circle_outline,
                                label: 'جاي',
                                highlight: going,
                                onTap: onRsvp,
                              ),
                            ),
                          ],
                          if (onCongratulate != null) ...[
                            const SizedBox(width: 6),
                            Expanded(
                              child: _FeaturedAction(
                                icon: Icons.chat_bubble_outline,
                                label: messagesLabel,
                                onTap: onCongratulate,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _poster(NegevPalette c) {
    if (event.posterUrl == null || event.posterUrl!.trim().isEmpty) {
      return Center(
        child: Icon(Icons.celebration_outlined, size: 42, color: c.inkFaint),
      );
    }
    return CachedNetworkImage(
      imageUrl: event.posterUrl!,
      fit: BoxFit.contain,
      errorWidget: (_, _, _) => Center(
        child: Icon(Icons.celebration_outlined, size: 42, color: c.inkFaint),
      ),
    );
  }
}

/// وسام «✦ مناسبة مميزة» الذهبي فوق الملصق.
class _FeaturedBadge extends StatelessWidget {
  const _FeaturedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: cardGold,
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(color: Color(0x55000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: const Text(
        '✦ مناسبة مميزة',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w900,
          color: Color(0xFF1B1206),
        ),
      ),
    );
  }
}

/// فعل واحد في صفّ أفعال البطاقة المميزة.
class _FeaturedAction extends StatelessWidget {
  const _FeaturedAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.highlight = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: highlight ? c.skyWash : Colors.transparent,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: highlight ? c.sky : c.line),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: highlight ? c.sky : c.ink),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: highlight ? c.sky : c.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ===== ٤ و٦. كرت مختصر ====================================================

/// كرت مناسبة مختصر: مصغّرة، ورقاقة يوم الأسبوع، وعنوان بسطر، والمكان — لصفّ
/// أفقي في «هذا الأسبوع قربك» و«جديد عنا». النقر يفتح صفحة المناسبة.
class CompactEventCard extends StatelessWidget {
  const CompactEventCard({
    super.key,
    required this.event,
    required this.onTap,
    this.width = 168,
  });

  final Event event;
  final VoidCallback onTap;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final parsed = DateTime.tryParse(event.eventDate);
    final weekday = parsed == null ? null : arabicWeekdayName(parsed.weekday);
    final place = event.villageDisplayName ?? event.town;

    return SizedBox(
      width: width,
      child: Material(
        color: c.surface,
        clipBehavior: Clip.antiAlias,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          key: Key('compact_event_${event.id}'),
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ColoredBox(
                  color: cardGround,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (event.posterUrl == null ||
                          event.posterUrl!.trim().isEmpty)
                        Center(
                          child: Icon(
                            Icons.celebration_outlined,
                            size: 24,
                            color: c.inkFaint,
                          ),
                        )
                      else
                        CachedNetworkImage(
                          imageUrl: event.posterUrl!,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => Center(
                            child: Icon(
                              Icons.celebration_outlined,
                              size: 24,
                              color: c.inkFaint,
                            ),
                          ),
                        ),
                      if (weekday != null)
                        PositionedDirectional(
                          top: 6,
                          start: 6,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.62),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              weekday,
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(9, 7, 9, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      event.cardHeadline,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: c.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      place,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.inkSoft),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// صفّ أفقي من الكروت المختصرة — يُستعمل في «هذا الأسبوع قربك» و«جديد عنا»
/// معاً، فلا نسختان من القائمة.
class CompactEventRow extends StatelessWidget {
  const CompactEventRow({
    super.key,
    required this.events,
    required this.onOpen,
  });

  final List<Event> events;
  final void Function(int eventId) onOpen;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 162,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: events.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final event = events[index];
          return CompactEventCard(
            event: event,
            onTap: () => onOpen(event.id),
          );
        },
      ),
    );
  }
}

// ===== ٥. الأفعال السريعة =================================================

/// فعل سريع واحد: قرص ذهبي الإطار وأيقونة وتسمية تحته.
class QuickAction {
  const QuickAction({
    required this.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final Key key;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

/// صفّ الأفعال السريعة: «دعواتي»، «تقويمي»، «أنشئ مناسبة»، «استوديو الدعوات»،
/// «المزوّدون». كلٌّ يمرّ بمعالجه من الشاشة — لا منطق هنا.
class QuickActionsRow extends StatelessWidget {
  const QuickActionsRow({super.key, required this.actions});

  final List<QuickAction> actions;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      key: const Key('home_quick_actions'),
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 2),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.lineSoft),
      ),
      child: Row(
        children: [
          for (final action in actions)
            Expanded(
              child: Semantics(
                button: true,
                label: action.label,
                child: InkWell(
                  key: action.key,
                  onTap: action.onTap,
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: c.goldWash,
                            border: Border.all(color: c.gold, width: 1.2),
                          ),
                          child: Icon(action.icon, size: 20, color: c.gold),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          action.label,
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 10.5,
                            height: 1.25,
                            fontWeight: FontWeight.w700,
                            color: c.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ===== ٨. شرائط فئات الخدمات =============================================

/// يستخرج رمز إيموجي واحداً صالحاً لأيقونة فئة الخدمات، ويرفض النصوص العربية
/// واللاتينية والأرقام (مثل «طباخ الافراح» أو «ب») ويقتصر على أول إيموجي عند
/// تكدّس عدّة رموز مثل «🍬🍰🧁» كي لا ينقصّ النصّ داخل الدائرة أو الشارة.
String usableCategoryEmoji(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  if (RegExp(r'[A-Za-z0-9\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]')
      .hasMatch(trimmed)) {
    return '';
  }
  final first = trimmed.characters.first;
  final hasPictograph = first.runes.any(
    (cp) =>
        (cp >= 0x1F1E6 && cp <= 0x1FAFF) ||
        (cp >= 0x2600 && cp <= 0x27BF) ||
        (cp >= 0x231A && cp <= 0x23FF) ||
        cp == 0x2B50 ||
        cp == 0x2B55,
  );
  return hasPictograph ? first : '';
}

/// شريط فئات الخدمات: قرص لكل فئة بأيقونتها (إيموجي من الخادم) أو أيقونة
/// مادّية حين لا تحمل أيقونة، والنقر يفتح «خدمات الأعراس» مفلترةً على الفئة.
class ServiceCategoriesStrip extends StatelessWidget {
  const ServiceCategoriesStrip({
    super.key,
    required this.categories,
    required this.onTap,
  });

  final List<ServiceCategory> categories;
  final void Function(int categoryId) onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final category = categories[index];
          final icon = usableCategoryEmoji(category.icon);
          return SizedBox(
            width: 74,
            child: InkWell(
              key: Key('home_service_category_${category.id}'),
              onTap: () => onTap(category.id),
              borderRadius: BorderRadius.circular(14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: c.skyWash,
                      border: Border.all(color: c.sky.withValues(alpha: 0.45)),
                    ),
                    child: icon.isEmpty
                        ? Icon(Icons.handyman_outlined, size: 22, color: c.sky)
                        : Text(
                            icon,
                            style: const TextStyle(fontSize: 20),
                          ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    category.name,
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10.5,
                      height: 1.2,
                      fontWeight: FontWeight.w600,
                      color: c.inkSoft,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ===== ٩. بانر المزوّد ====================================================

/// بانر «هل تقدّم خدمة للمناسبات؟» — تدرّج فيروزي وزرّ أبيض يفتح ورقة تقديم
/// عرض الخدمة القائمة نفسها.
class ProviderCtaBanner extends StatelessWidget {
  const ProviderCtaBanner({super.key, required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('home_provider_cta'),
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 2),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: [Color(0xFF0F766E), Color(0xFF0D9488)],
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.storefront_outlined, color: Colors.white, size: 28),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'هل تقدّم خدمة للمناسبات؟',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'أضف عملك مجاناً وابدأ باستقبال الطلبات',
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.45,
                    color: Color(0xFFE6FFFA),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          FilledButton(
            key: const Key('home_provider_cta_button'),
            onPressed: onAdd,
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFF0F766E),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              textStyle: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w900,
              ),
            ),
            child: const Text('أضف عملك'),
          ),
        ],
      ),
    );
  }
}

// ===== ٧. الأكثر تفاعلاً ==================================================

/// «الأكثر تفاعلاً» — قسم مؤطّر ببطاقات أفقية كبيرة، وشارة ترتيب: الأولى
/// «🔥 الأكثر تفاعلاً» برتقالية، ثم «#2» و«#3»…، وشارة عدّ تنازلي على كل بطاقة.
class TrendingSection extends StatelessWidget {
  const TrendingSection({
    super.key,
    required this.events,
    required this.onOpen,
  });

  final List<Event> events;
  final void Function(int eventId) onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      key: const Key('home_trending_section'),
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 2),
      padding: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c.lineSoft),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 8),
            child: Row(
              children: [
                Icon(Icons.local_fire_department_outlined, size: 18, color: c.warn),
                const SizedBox(width: 6),
                Text(
                  'الأكثر تفاعلاً',
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w900,
                    color: c.ink,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 172,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              itemCount: events.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) => _TrendingCard(
                event: events[index],
                rank: index + 1,
                onTap: () => onOpen(events[index].id),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrendingCard extends StatelessWidget {
  const _TrendingCard({
    required this.event,
    required this.rank,
    required this.onTap,
  });

  final Event event;
  final int rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final isSolemn = event.occasionType?.isSolemn ?? false;
    return SizedBox(
      width: 250,
      child: Material(
        color: c.surfaceSunk,
        clipBehavior: Clip.antiAlias,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          key: Key('trending_card_${event.id}'),
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ColoredBox(
                  color: cardGround,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (event.posterUrl == null ||
                          event.posterUrl!.trim().isEmpty)
                        Center(
                          child: Icon(
                            Icons.celebration_outlined,
                            size: 26,
                            color: c.inkFaint,
                          ),
                        )
                      else
                        CachedNetworkImage(
                          imageUrl: event.posterUrl!,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => Center(
                            child: Icon(
                              Icons.celebration_outlined,
                              size: 26,
                              color: c.inkFaint,
                            ),
                          ),
                        ),
                      PositionedDirectional(
                        top: 8,
                        start: 8,
                        child: _RankBadge(rank: rank),
                      ),
                      PositionedDirectional(
                        top: 8,
                        end: 8,
                        child: EventCountdownChip(
                          eventDate: event.eventDate,
                          isSolemn: isSolemn,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 7, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      event.cardHeadline,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: c.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [event.villageDisplayName ?? event.town, event.dinnerTime]
                          .where((part) => part.trim().isNotEmpty)
                          .join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: c.inkSoft),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// شارة الترتيب: الأولى برتقالية بنصّها الكامل، وما بعدها رقمها.
class _RankBadge extends StatelessWidget {
  const _RankBadge({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    final first = rank == 1;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: first ? const Color(0xFFEA580C) : Colors.black.withValues(alpha: 0.62),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        first ? '🔥 الأكثر تفاعلاً' : '#$rank',
        style: const TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w900,
          color: Colors.white,
        ),
      ),
    );
  }
}

// ===== عنوان قسم ==========================================================

/// عنوان قسم في الرئيسية، ومعه رقاقة اختيارية (‏«أحدث المناسبات» في «جديد
/// عنا») — عنوان بلا بطاقات تحته لا يُرسم أصلاً، فالقسم كلّه يغيب.
class HomeSectionHeader extends StatelessWidget {
  const HomeSectionHeader({
    super.key,
    required this.title,
    this.icon,
    this.pill,
  });

  final String title;
  final IconData? icon;
  final String? pill;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final icon = this.icon;
    final pill = this.pill;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 12, 8),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 17, color: c.sky),
            const SizedBox(width: 6),
          ],
          Text(
            title,
            style: TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w900,
              color: c.ink,
            ),
          ),
          if (pill != null) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(
                color: c.goldWash,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: c.gold.withValues(alpha: 0.6)),
              ),
              child: Text(
                pill,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: c.gold,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
