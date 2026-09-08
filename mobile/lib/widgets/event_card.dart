import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../models/event.dart';
import '../state/share_event.dart';
import '../theme.dart';

/// ارتفاع احتياطي للكرت حين يضعه مستدعٍ تحت أب غير محدود الارتفاع. لا يُستعمل
/// في التغذية نفسها إطلاقاً — هناك `PageView` تفرض ارتفاع الصفحة دائماً.
const double _unboundedCardHeight = 560;

/// أقصى عرض للكرت — نفس `max-width: 650px` على `.app-main` في الويب (القصّة ٢١).
const double _cardMaxWidth = 650;

/// نسب مزج لون النوع في [cardGround] لكل طبقة — مطابقة لنِسب `color-mix` في
/// `web/styles.css`: ‏`--card-bezel-ground` ‏٨٪، و`--card-base-ground` ‏١٢٪،
/// و`--card-framed-ground` ‏١٤٪، وأعلى تدرّج الكرت بلا ملصق ‏٢٠٪.
const double _bezelGroundBlend = 0.08;
const double _mediaGroundBlend = 0.12;
const double _framedGroundBlend = 0.14;
const double _mediaEmptyTopBlend = 0.20;

/// يحوّل لون النوع (`#RRGGBB` من الخادم) إلى [Color]، ويسقط إلى [fallback]
/// إن فشل التحويل — نوع جديد بلون غير متوقّع لا يجب أن يُسقِط الواجهة.
Color occasionTypeColor(String? hex, Color fallback) {
  if (hex == null || hex.isEmpty) return fallback;
  var value = hex.trim();
  if (value.startsWith('#')) value = value.substring(1);
  if (value.length == 6) value = 'FF$value';
  if (value.length != 8) return fallback;
  final parsed = int.tryParse(value, radix: 16);
  return parsed == null ? fallback : Color(parsed);
}

const List<String> _arWeekdays = [
  'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد',
];

const List<String> _arMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/// يحوّل الأرقام الغربية إلى هندية (‏٠١٢٣٤٥٦٧٨٩).
String _arabicIndicDigits(int value) {
  const zero = 0x0660; // ٠
  return value
      .toString()
      .split('')
      .map((c) => String.fromCharCode(zero + (c.codeUnitAt(0) - 0x30)))
      .join();
}

/// يصوغ تاريخ المناسبة بالصيغة العربية الطويلة نفسها التي يصوغها الويب
/// (‏`Intl.DateTimeFormat('ar-EG', {weekday, year, month, day})` في `web/app.js`)
/// — «الأحد، ٢٠ سبتمبر ٢٠٢٦» لا `2026-09-20`. نصّان مختلفان لنفس المناسبة على
/// العميلين يُقرآن عطلاً لا اختلاف منصّة (المواصفة #98).
///
/// **بأرقام هندية**: نظام الأرقام الافتراضي للّغة `ar-EG` هو `arab` لا `latn`،
/// فالويب يخرج «٢٠ … ٢٠٢٦» فعلاً — تحقَّق بتشغيل `Intl.DateTimeFormat` نفسه.
/// أرقام غربية هنا تترك الفارق الذي جاءت هذه الدالة لإزالته قائماً.
///
/// الأسماء مكتوبة هنا لا مأخوذة من `intl`: ‏`DateFormat` بلغة غير الافتراضية
/// يتطلّب `initializeDateFormatting` عند الإقلاع، فيرمي في أي اختبار ودجت لا
/// يمرّ بـ`main()` — وهذه أسماء اثنتا عشرة لا تتغيّر. وأسماء الشهور بنكهة
/// `ar-EG` تحديداً (يناير لا كانون الثاني)، وهي ما يخرجه الويب فعلاً.
///
/// تاريخ لا يمكن تحليله يخرج كما جاء بدل أن يختفي: الحقيقة الخام أنفع من فراغ.
String arabicEventDate(String raw) {
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  final weekday = _arWeekdays[parsed.weekday - 1];
  final month = _arMonths[parsed.month - 1];
  final day = _arabicIndicDigits(parsed.day);
  final year = _arabicIndicDigits(parsed.year);
  return '$weekday، $day $month $year';
}

/// تدرّج صورة العزاء حين تُحمَّل أو تفشل على **شاشة التفاصيل** — أردوازي ثابت
/// لا يتبع الوضع. لم يعد له مقابل في `web/styles.css`: قاعدة
/// `.card-poster-wrapper.tone-mourning` حُذفت مع الطمس في `be32907`، والكرت هنا
/// صار يأخذ أرضيته من لون النوع لا من النبرة.
const _mourningGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF334155), Color(0xFF64748B)],
);

/// بطاقة مناسبة بملء الشاشة بأربع طبقات مطابقة للويب تماماً (المواصفة #98):
/// 1. Bezel: أرضية داكنة + زخرفة متكرّرة، حشو 44 بالأعلى و10 بالجوانب والأسفل.
/// 2. Framed: لوح بنصف قطر 14، إطار ذهبي 2 على الحافة بلا إزاحة، وظلّ ناعم.
/// 3. Media: يأخذ كامل الارتفاع المتبقي، الملصق cover ومحاذى للأعلى.
/// 4. Caption: شريط تعريف مصمت بارتفاع محتواه وشعرية 1px بلون النوع بنسبة 40%،
/// وهو شقيق عمودي لصندوق الوسائط لا طبقة تطفو فوقه.
class EventCard extends StatefulWidget {
  const EventCard({
    super.key,
    required this.event,
    required this.onTap,
    this.onCongratulationsTap,
    this.onRemindTap,
  });

  final Event event;
  final VoidCallback onTap;

  /// `null` يعطل النقر على التبريكات في الشريط.
  final VoidCallback? onCongratulationsTap;

  /// `null` يعطل زرّ «ذكّرني» في شريط التعريف، ويُخفي سطره في ورقة التفاصيل.
  final VoidCallback? onRemindTap;

  @override
  State<EventCard> createState() => _EventCardState();
}

class _EventCardState extends State<EventCard> {
  bool _detailsExpanded = false;

  String get _countdownText {
    final eventDate = DateTime.tryParse(widget.event.eventDate);
    if (eventDate == null) return '';
    final today = DateTime.now();
    final todayOnly = DateTime(today.year, today.month, today.day);
    final diffDays = DateTime(eventDate.year, eventDate.month, eventDate.day)
        .difference(todayOnly)
        .inDays;
    if (diffDays == 0) return 'اليوم';
    if (diffDays == 1) return 'غداً';
    if (diffDays > 1) return 'باقي $diffDays أيام';
    return 'مناسبة سابقة';
  }

  @override
  Widget build(BuildContext context) {
    final event = widget.event;
    final type = event.occasionType;
    final toneColor = occasionTypeColor(type?.color, cardGold);
    final isSolemn = type?.isSolemn ?? false;

    return LayoutBuilder(
      builder: (context, constraints) {
        // داخل `PageView` الحقيقية الارتفاع محدود دائماً بارتفاع الصفحة، فهذا
        // الاحتياطي لا يعمل إلا حين يضع مستدعٍ الكرت تحت أب غير محدود الارتفاع
        // (اختبار يضعه مباشرة تحت `Scaffold`، مثلاً).
        final cardHeight = constraints.hasBoundedHeight
            ? constraints.maxHeight
            : _unboundedCardHeight;

        // القصّة ٢١: على شاشة عريضة (لوح) يبقى الكرت محصوراً في الوسط بدل أن
        // يمتدّ على العرض كلّه — نفس ما يفعله `.app-main { max-width: 650px }`
        // في الويب. الحصر على الكرت نفسه لا على المُمرِّر، كي يبقى القفز على
        // كامل العرض.
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: _cardMaxWidth),
            child: SizedBox(
          height: cardHeight,
          child: CardBezel(
            toneColor: toneColor,
            child: CardFramed(
              toneColor: toneColor,
              // ورقة التفاصيل تغطّي **اللوح كلّه** — الصورة وشريط التعريف معاً —
              // تماماً كـ`.card-details-collapsible { position:absolute; inset:0 }`
              // داخل `.card-framed` في الويب. لو غطّت الصورة وحدها لبقي الشريط
              // ظاهراً تحتها، وهو فارق بين العميلين لا اختلاف منصّة.
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: CardMedia(
                          event: event,
                          toneColor: toneColor,
                          isSolemn: isSolemn,
                          onTap: widget.onTap,
                        ),
                      ),
                      CardCaption(
                        event: event,
                        type: type,
                        toneColor: toneColor,
                        isSolemn: isSolemn,
                        countdownText: _countdownText,
                        detailsExpanded: _detailsExpanded,
                        onToggleDetails: () =>
                            setState(() => _detailsExpanded = !_detailsExpanded),
                        onCongratulationsTap: widget.onCongratulationsTap,
                        onRemindTap: widget.onRemindTap,
                        onShareTap: () => shareEvent(context, event),
                      ),
                    ],
                  ),
                  if (_detailsExpanded)
                    _CardDetailsPanel(
                      event: event,
                      type: type,
                      onClose: () => setState(() => _detailsExpanded = false),
                      onCongratulationsTap: widget.onCongratulationsTap,
                      onRemindTap: widget.onRemindTap,
                    ),
                ],
              ),
            ),
          ),
            ),
          ),
        );
      },
    );
  }
}

/// الطبقة الأولى: الحافة الخارجية (Bezel)
/// أرضية داكنة + زخرفة نجوم ثمانية بـCustomPainter + حشو 44 بالأعلى و10 بالجوانب والأسفل.
class CardBezel extends StatelessWidget {
  const CardBezel({
    super.key,
    required this.toneColor,
    required this.child,
  });

  final Color toneColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final bezelGround = Color.lerp(cardGround, toneColor, _bezelGroundBlend)!;

    return Container(
      color: bezelGround,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ExcludeSemantics(
            child: RepaintBoundary(
              child: CustomPaint(
                painter: BezelOrnamentPainter(toneColor: toneColor),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 44, 10, 10),
            child: child,
          ),
        ],
      ),
    );
  }
}

/// رسّام زخرفة النجمة الثمانية: بلاطة 64×64 بمربّعين 36×36 أحدهما مستدير 45 درجة
/// وبسماكة 1.1 بلون النغمة وشفافية 0.24 (مطابق للـSVG في web/app.js).
class BezelOrnamentPainter extends CustomPainter {
  const BezelOrnamentPainter({required this.toneColor});

  final Color toneColor;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1
      ..color = toneColor.withValues(alpha: 0.24);

    const tileSize = 64.0;
    // نفس طور `background-position: center` في الويب: أصل البلاطة عند
    // ‏(العرض − البلاطة) ÷ ٢، لا عند نصف العرض — الفرق نصف بلاطة.
    final startX = ((size.width - tileSize) / 2) % tileSize - tileSize;
    final startY = ((size.height - tileSize) / 2) % tileSize - tileSize;

    for (double x = startX; x < size.width; x += tileSize) {
      for (double y = startY; y < size.height; y += tileSize) {
        final cx = x + tileSize / 2;
        final cy = y + tileSize / 2;

        canvas.drawRect(
          Rect.fromCenter(center: Offset(cx, cy), width: 36, height: 36),
          paint,
        );

        canvas.save();
        canvas.translate(cx, cy);
        canvas.rotate(math.pi / 4);
        canvas.drawRect(
          Rect.fromCenter(center: Offset.zero, width: 36, height: 36),
          paint,
        );
        canvas.restore();
      }
    }
  }

  @override
  bool shouldRepaint(covariant BezelOrnamentPainter oldDelegate) {
    return oldDelegate.toneColor != toneColor;
  }
}

/// الطبقة الثانية: اللوح المؤطر (Framed)
/// نصف قطر 14، إطار 2 على الحافة بلون النغمة، ظلّ ناعم (blur 34, y 12, أسود 55%).
class CardFramed extends StatelessWidget {
  const CardFramed({
    super.key,
    required this.toneColor,
    required this.child,
  });

  final Color toneColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final framedGround = Color.lerp(cardGround, toneColor, _framedGroundBlend)!;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.55),
            blurRadius: 34,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColoredBox(color: framedGround, child: child),
            IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: toneColor, width: 2),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// الطبقة الثالثة: صندوق الوسائط (Media)
/// يأخذ الارتفاع المتبقي (Expanded في Column)، والملصق BoxFit.cover بمحاذاة أعلى.
class CardMedia extends StatelessWidget {
  const CardMedia({
    super.key,
    required this.event,
    required this.toneColor,
    required this.isSolemn,
    required this.onTap,
  });

  final Event event;
  final Color toneColor;
  final bool isSolemn;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasPoster =
        event.posterUrl != null && event.posterUrl!.trim().isNotEmpty;
    final mediaGround = Color.lerp(cardGround, toneColor, _mediaGroundBlend)!;

    Widget content;
    if (hasPoster) {
      content = EventPoster(
        url: event.posterUrl,
        isSolemn: isSolemn,
        whole: false,
        groundColor: mediaGround,
      );
    } else {
      content = Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color.lerp(cardGround, toneColor, _mediaEmptyTopBlend)!,
              mediaGround,
            ],
          ),
        ),
        child: Center(
          child: Icon(
            isSolemn ? Icons.spa_outlined : Icons.celebration_outlined,
            size: 46,
            color: toneColor,
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: content,
    );
  }
}

/// الطبقة الرابعة: شريط التعريف (Caption)
/// شقيق عمودي لصندوق الوسائط؛ خلفية مصمتة؛ شعرية 1px بلون النغمة بنسبة 40%؛
/// حشو 12 أعلى و16 جوانب و15 أسفل.
class CardCaption extends StatelessWidget {
  const CardCaption({
    super.key,
    required this.event,
    required this.type,
    required this.toneColor,
    required this.isSolemn,
    required this.countdownText,
    required this.detailsExpanded,
    required this.onToggleDetails,
    this.onCongratulationsTap,
    this.onRemindTap,
    this.onShareTap,
  });

  final Event event;
  final OccasionType? type;
  final Color toneColor;
  final bool isSolemn;
  final String countdownText;
  final bool detailsExpanded;
  final VoidCallback onToggleDetails;
  final VoidCallback? onCongratulationsTap;
  final VoidCallback? onRemindTap;
  final VoidCallback? onShareTap;

  @override
  Widget build(BuildContext context) {
    final clanTownParts = [event.familyClan, event.townDisplay]
        .where((part) => part.trim().isNotEmpty)
        .toList();
    final clanTownLine = clanTownParts.join(' — ');

    final dateVenueParts = [arabicEventDate(event.eventDate), event.locationName]
        .where((part) => part.trim().isNotEmpty)
        .toList();
    final dateVenueLine = dateVenueParts.join(' — ');

    final congratulationsLabel =
        type?.congratulationsLabel ?? 'تبريكات';
    final shareLabel = isSolemn ? 'أرسل النعي' : 'شارك المناسبة';

    return Container(
      decoration: BoxDecoration(
        color: context.c.surface,
        border: Border(
          top: BorderSide(
            color: toneColor.withValues(alpha: 0.40),
            width: 1,
          ),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 1. صف الشارات: شارة النوع + عدّاد الأيام (إلا على العزاء)
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (type != null) _TypeBadge(type: type!, color: toneColor),
              if (!isSolemn && countdownText.isNotEmpty)
                _DateChip(text: countdownText),
            ],
          ),
          // المسافات مطابقة للويب: الشارات 8 تحتها، سطر العشيرة 2 فوقه و4 تحته،
          // سطر التاريخ 6 تحته، وصفّ الأزرار 8 فوقه.
          const SizedBox(height: 8),

          // 2. العنوان الرئيسي
          Text(
            event.displayTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            // مطابق لـ`.event-main-title` في الويب: 1.35rem و900.
            style: TextStyle(
              fontSize: 21.6,
              fontWeight: FontWeight.w900,
              color: context.c.ink,
              height: 1.35,
            ),
          ),

          // 3. سطر العشيرة والبلدة بلون النوع
          if (clanTownLine.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              clanTownLine,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.bold,
                color: toneColor,
              ),
            ),
          ],

          // 4. سطر التاريخ والمكان لكل الأنواع بلا استثناء
          if (dateVenueLine.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              dateVenueLine,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: context.c.inkFaint,
              ),
            ),
          ],

          // عدّاد المتابعين **لا يظهر في الشريط**: الويب حذفه من صفّه المدمج في
          // `be32907` لأنّ أربعة أزرار وعدّاداً لا يتّسع لها عرض هاتف. مكانه
          // ورقة التفاصيل، وهو معروض فيها فعلاً.
          const SizedBox(height: 8),

          // 5. صف الأزرار المدمج: تبريكات، تذكير، مشاركة، تفاصيل
          Row(
            children: [
              Expanded(
                child: _CaptionActionButton(
                  icon: Icons.chat_bubble_outline,
                  // التسمية وحدها بلا عدّاد — نفس زرّ الويب في صفّه المدمج.
                  // العدّاد شأن ورقة التفاصيل، وهناك يحكمه النوع: نوعٌ يُخفي
                  // العدّاد يرسل `congratulationsCount == null` فلا يُرسَم سطره.
                  label: congratulationsLabel,
                  onTap: onCongratulationsTap,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _CaptionActionButton(
                  icon: event.isReminded
                      ? Icons.notifications_active
                      : Icons.notifications_none,
                  label: event.isReminded ? 'إلغاء التذكير' : 'ذكّرني',
                  highlight: event.isReminded,
                  onTap: onRemindTap,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _CaptionActionButton(
                  icon: Icons.share_outlined,
                  label: shareLabel,
                  onTap: onShareTap,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _CaptionActionButton(
                  icon: detailsExpanded
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  label: detailsExpanded ? 'إخفاء التفاصيل' : 'مزيد من التفاصيل',
                  isOutline: true,
                  onTap: onToggleDetails,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CaptionActionButton extends StatelessWidget {
  const _CaptionActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.highlight = false,
    this.isOutline = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool highlight;
  final bool isOutline;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isOutline
          ? Colors.transparent
          : (highlight ? context.c.skyWash : context.c.surfaceSunk),
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: highlight
                  ? context.c.sky
                  : (isOutline
                      ? context.c.inkFaint.withValues(alpha: 0.5)
                      : context.c.line),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 13,
                color: highlight ? context.c.sky : context.c.inkSoft,
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.bold,
                    color: highlight ? context.c.sky : context.c.ink,
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

/// ورقة التفاصيل المفتوحة فوق صندوق الوسائط داخل الكرت نفسه مع تمرير مستقل.
class _CardDetailsPanel extends StatelessWidget {
  const _CardDetailsPanel({
    required this.event,
    required this.type,
    required this.onClose,
    this.onCongratulationsTap,
    this.onRemindTap,
  });

  final Event event;
  final OccasionType? type;
  final VoidCallback onClose;
  final VoidCallback? onCongratulationsTap;
  final VoidCallback? onRemindTap;

  @override
  Widget build(BuildContext context) {
    final showDinnerTime = type?.showsField('dinner_time') ?? true;
    final showYouthParty = type?.showsField('youth_party_date') ?? true;
    final reactionKeys = type?.reactions ?? const <String>[];
    final showViews = type?.showViewsCount ?? true;

    return Container(
      color: context.c.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // رأس الورقة مع زر الإغلاق
          Container(
            padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: context.c.line)),
            ),
            child: Row(
              children: [
                Text(
                  'تفاصيل المناسبة',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  tooltip: 'إغلاق',
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: onClose,
                ),
              ],
            ),
          ),
          // جسم الورقة القابل للتمرير
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (event.artistName != null &&
                      event.artistName!.trim().isNotEmpty)
                    Padding(
                      padding:
                          const EdgeInsetsDirectional.only(start: 6, bottom: 8),
                      child: Text(
                        'يحيي الحفلة الفنان ${event.artistName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                      ),
                    ),
                  _IconLine(
                    icon: Icons.event_outlined,
                    text: showDinnerTime && event.dinnerTime.isNotEmpty
                        ? '${arabicEventDate(event.eventDate)}  •  ${event.dinnerTime}'
                        : arabicEventDate(event.eventDate),
                  ),
                  if (showYouthParty && event.youthPartyDate != null)
                    _IconLine(
                      icon: Icons.nightlife_outlined,
                      text: event.youthPartyDate!,
                    ),
                  _IconLine(
                    icon: Icons.location_on_outlined,
                    text: event.locationName,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      ...reactionKeys.map((key) {
                        final count = event.reactions[key] ?? 0;
                        if (count == 0) return const SizedBox.shrink();
                        final emoji = AppConfig.reactions[key] ?? key;
                        return Padding(
                          padding: const EdgeInsetsDirectional.only(end: 10),
                          child: Text(
                            '$emoji $count',
                            style: TextStyle(
                              fontSize: 13,
                              color: context.c.inkSoft,
                            ),
                          ),
                        );
                      }),
                      const Spacer(),
                      if (showViews) ...[
                        Icon(
                          Icons.visibility_outlined,
                          size: 15,
                          color: context.c.inkFaint,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${event.viewsCount}',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: context.c.inkFaint,
                          ),
                        ),
                      ],
                    ],
                  ),
                  // `congratulationsCount == null` يعني أنّ النوع أخفى العدّاد،
                  // فلا يُرسَم السطر أصلاً — النوع يقرّر، لا التخطيط.
                  if (event.congratulationsCount != null) ...[
                    const SizedBox(height: 10),
                    _CongratulationsRow(
                      event: event,
                      onTap: onCongratulationsTap,
                    ),
                  ],
                  if (event.followersCount != null) ...[
                    const SizedBox(height: 10),
                    _FollowersLine(event: event),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}


/// شارة عدّاد/تاريخ
class _DateChip extends StatelessWidget {
  const _DateChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3.5),
      decoration: BoxDecoration(
        color: context.c.successWash,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.c.success),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          color: context.c.success,
        ),
      ),
    );
  }
}

/// شارة نوع المناسبة
class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type, required this.color});

  final OccasionType type;
  final Color color;

  @override
  Widget build(BuildContext context) {
    // الحبّة البيضاء المصمتة والظلّ تحتها كانا لأنّ الشارة كانت تطفو فوق ملصق
    // عشوائي، فلون النوع الشفّاف لم يكن مضموناً هناك. صارت الشارة على شريط
    // تعريف مصمت، فتحمل لون النوع نفسه — والويب حذف نفس القاعدة في `be32907`.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3.5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (type.icon.isNotEmpty) ...[
            Text(type.icon, style: const TextStyle(fontSize: 12)),
            const SizedBox(width: 4),
          ],
          Text(
            type.name,
            style: TextStyle(
              fontSize: 11.5,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

/// سطر التبريكات في ورقة التفاصيل
class _CongratulationsRow extends StatelessWidget {
  const _CongratulationsRow({required this.event, required this.onTap});

  final Event event;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final label = event.occasionType?.congratulationsLabel ?? 'تبريكات';
    final latest = event.latestCongratulation;

    final content = Row(
      children: [
        Icon(Icons.forum_outlined, size: 15, color: context.c.sky),
        const SizedBox(width: 6),
        Text(
          '$label (${event.congratulationsCount})',
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.bold,
            color: context.c.inkSoft,
          ),
        ),
        if (latest != null) ...[
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '${latest.senderName}: ${latest.message}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: context.c.inkFaint),
            ),
          ),
        ],
        if (onTap != null)
          Icon(Icons.chevron_left, size: 16, color: context.c.inkFaint),
      ],
    );

    if (onTap == null) return content;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: content,
      ),
    );
  }
}

/// سطر «ذكّرني» في ورقة التفاصيل
/// عدّاد المتابعين في ورقة التفاصيل.
///
/// **بلا زرّ «ذكّرني» ثانٍ**: الزرّ صار في شريط التعريف مع بقية الأزرار، تماماً
/// كما في الويب حيث يظهر مرّة واحدة. زرّان لنفس الفعل على كرت واحد فارقٌ عن
/// الويب وارتباكٌ للقارئ معاً.
///
/// و`followersCount == null` يعني أنّ النوع أخفى العدّاد — فلا يُرسم شيء، لا
/// صفر ولا شرطة (#20 خطوة ١٣).
class _FollowersLine extends StatelessWidget {
  const _FollowersLine({required this.event});

  final Event event;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Icons.people_outline, size: 15, color: context.c.inkFaint),
        const SizedBox(width: 6),
        Text(
          'متابعون: ${event.followersCount}',
          style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
        ),
      ],
    );
  }
}

/// بوستر المناسبة. الرابط يصل مطلقاً من الخادم، فلا نبني عنواناً هنا.
///
/// بلا رابط لا يُرسم شيء إطلاقاً — لا مربع بديل (#20 خطوة ١٥، قرار ٥): كرت
/// عزاء بلا صورة يجب ألا يحجز مساحة فارغة توحي بأنّ صورة "ينبغي أن تكون هناك".
/// `isSolemn` يلوّن التحميل/الفشل بأردوازي هادئ لا سماوي، مطابقاً لصورة
/// المتوفَّى في الويب.
class EventPoster extends StatelessWidget {
  const EventPoster({
    super.key,
    required this.url,
    this.height,
    this.isSolemn = false,
    this.whole = false,
    this.groundColor,
  });

  final String? url;
  final double? height;
  final bool isSolemn;

  /// أرضية التحميل والفشل حين يفرضها المستدعي. كرت التغذية يمرّرها **دائماً**
  /// محسوبةً من لون النوع، فلا يبقى فرع على النبرة يقرّر لوناً هناك (المواصفة
  /// ‏#98: «العزاء أردوازيّ بنفس الرسم تماماً — بلا فرع `isSolemn` في أي عميل»)،
  /// ولا يومض الكرت أبيض ثم يقفز إلى لون النوع أثناء التحميل (القصة ٢٤).
  final Color? groundColor;

  /// سطح **قرار** لا سطح مسح (#53): يعرض الملصق كاملاً فوق تعبئة مطموسة منه
  /// بدل قصّه. تستعمله شاشة التفاصيل — من فتح مناسبة بعينها جاء ليراها. والكرت
  /// يبقى على القصّ: ارتفاعه لا يتّسع لملصق كامل إلا كطابع صغير وسط فراغ.
  final bool whole;

  /// الخلفية الهادئة تحت التحميل والفشل. حين يمرّر المستدعي [groundColor] —
  /// وكرت التغذية يمرّرها دائماً — تُستعمل كما هي بلا أي فرع على النبرة. وحين
  /// لا يمرّرها (شاشة التفاصيل) يبقى تمييز العزاء الأردوازي، وهو قرارها هي.
  BoxDecoration _veil(BuildContext context) {
    if (groundColor != null) return BoxDecoration(color: groundColor);
    return isSolemn
        ? const BoxDecoration(gradient: _mourningGradient)
        : BoxDecoration(color: context.c.surfaceSunk);
  }

  Widget _placeholder(BuildContext context) => Container(
    height: height,
    width: double.infinity,
    decoration: _veil(context),
    child: const Center(
      child: SizedBox(
        width: 26,
        height: 26,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    ),
  );

  Widget _failed(BuildContext context) => Container(
    height: height,
    width: double.infinity,
    decoration: _veil(context),
    child: Icon(
      Icons.image_not_supported_outlined,
      color: groundColor != null
          ? Colors.white70
          : (isSolemn ? Colors.white70 : context.c.inkFaint),
      size: 38,
    ),
  );

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) return const SizedBox.shrink();
    if (whole) return _buildWhole(context);

    return CachedNetworkImage(
      imageUrl: url!,
      height: height,
      width: double.infinity,
      fit: BoxFit.cover,
      // مربوط بالأعلى لا بالمركز (#53): القصّ المركزي الافتراضي يأكل الوجه في
      // صورة عمودية، وهو بالضبط ما أبلغ عنه صاحب المنتج.
      alignment: Alignment.topCenter,
      placeholder: (_, _) => _placeholder(context),
      errorWidget: (_, _, _) => _failed(context),
    );
  }

  /// الملصق كاملاً فوق نسخة مطموسة منه تملأ ما يتركه الاحتواء — فلا حوافّ
  /// فارغة والارتفاع يبقى ثابتاً. نفس تركيب `drawHero` في
  /// `server/src/services/shareCard.service.js`.
  Widget _buildWhole(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRect(
            child: ImageFiltered(
              imageFilter: ui.ImageFilter.blur(sigmaX: 22, sigmaY: 22),
              child: Opacity(
                opacity: 0.55,
                child: CachedNetworkImage(
                  imageUrl: url!,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => _placeholder(context),
                  errorWidget: (_, _, _) => _failed(context),
                ),
              ),
            ),
          ),
          CachedNetworkImage(
            imageUrl: url!,
            fit: BoxFit.contain,
            placeholder: (_, _) => const SizedBox.shrink(),
            errorWidget: (_, _, _) => _failed(context),
          ),
        ],
      ),
    );
  }
}

class _IconLine extends StatelessWidget {
  const _IconLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: context.c.sky),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13.5,
                color: context.c.inkSoft,
                height: 1.4,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
