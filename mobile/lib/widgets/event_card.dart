import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

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

/// بطاقة مناسبة بملء الشاشة على نمط بطاقة الدعوة: الصورة كاملة في الأعلى،
/// وتحتها لوح معلومات مصمت. لا نصّ فوق الصورة — التفاصيل على تدرّج غامق فوق
/// أسفل الملصق لم تكن تُقرأ (طلب المالك 2026-09-30).
/// 1. Bezel: أرضية داكنة + زخرفة متكرّرة.
/// 2. Framed: لوح بنصف قطر 14، إطار ذهبي 2 على الحافة بلا إزاحة، وظلّ ناعم.
/// 3. Media: يأخذ كل الارتفاع فوق لوح المعلومات، والملصق كاملاً بلا قصّ.
/// 4. Caption: لوح المعلومات — شقيق عمودي تحت صندوق الوسائط لا طبقة فوقه.
class EventCard extends StatelessWidget {
  const EventCard({
    super.key,
    required this.event,
    required this.onTap,
    this.onCongratulationsTap,
    this.onRemindTap,
  });

  final Event event;

  /// يفتح صفحة المناسبة — من الصورة ومن زرّ «التفاصيل» معاً.
  final VoidCallback onTap;

  /// `null` يعطل النقر على التبريكات في الشريط.
  final VoidCallback? onCongratulationsTap;

  /// `null` يعطل زرّ «ذكّرني» في لوح المعلومات.
  final VoidCallback? onRemindTap;

  String get _countdownText {
    final eventDate = DateTime.tryParse(event.eventDate);
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: CardMedia(
                          event: event,
                          toneColor: toneColor,
                          isSolemn: isSolemn,
                          onTap: onTap,
                        ),
                      ),
                      CardCaption(
                        event: event,
                        type: type,
                        toneColor: toneColor,
                        isSolemn: isSolemn,
                        countdownText: _countdownText,
                        onDetailsTap: onTap,
                        onCongratulationsTap: onCongratulationsTap,
                        onRemindTap: onRemindTap,
                        onShareTap: () => shareEvent(context, event),
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
            padding: const EdgeInsets.all(6),
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
        whole: true,
        groundColor: mediaGround,
        toneColor: toneColor,
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

/// الطبقة الرابعة: لوح المعلومات (Caption)
/// خلفية السطح المصمتة فيُقرأ بأي صورة، وشعرية بلون النوع فوقه تفصله عنها.
/// العنوان النوع واسم صاحب المناسبة، ثم سطر لكل معلومة بأيقونتها — لا سطر
/// واحد تُحشر فيه كلها بفواصل — ثم صفّ الأزرار يتقدّمه «التفاصيل».
class CardCaption extends StatelessWidget {
  const CardCaption({
    super.key,
    required this.event,
    required this.type,
    required this.toneColor,
    required this.isSolemn,
    required this.countdownText,
    required this.onDetailsTap,
    this.onCongratulationsTap,
    this.onRemindTap,
    this.onShareTap,
  });

  final Event event;
  final OccasionType? type;
  final Color toneColor;
  final bool isSolemn;
  final String countdownText;
  final VoidCallback onDetailsTap;
  final VoidCallback? onCongratulationsTap;
  final VoidCallback? onRemindTap;
  final VoidCallback? onShareTap;

  @override
  Widget build(BuildContext context) {
    final subtitle = event.cardSubtitle;
    final showDinnerTime = (type?.showsField('dinner_time') ?? true) &&
        event.dinnerTime.trim().isNotEmpty;
    final placeLine = [event.townDisplay, event.locationName]
        .where((part) => part.trim().isNotEmpty)
        .join(' — ');
    final clan = event.familyClan.trim();

    final congratulationsLabel =
        type?.congratulationsLabel ?? 'تبريكات';
    final shareLabel = isSolemn ? 'أرسل النعي' : 'شارك المناسبة';

    return Container(
      decoration: BoxDecoration(
        color: context.c.surface,
        border: Border(
          top: BorderSide(color: toneColor.withValues(alpha: 0.4)),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
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
          const SizedBox(height: 6),

          // 2. العنوان: النوع واسم صاحب المناسبة، على سطرين إن طال الاسم
          Text(
            event.cardHeadline,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w900,
              color: context.c.ink,
              height: 1.3,
            ),
          ),
          if (subtitle != null)
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
            ),
          const SizedBox(height: 6),

          // 3. سطر لكل معلومة: التاريخ، الوقت، المكان، العائلة
          _InfoLine(
            icon: Icons.event_outlined,
            color: toneColor,
            text: arabicEventDate(event.eventDate),
          ),
          if (showDinnerTime)
            _InfoLine(
              icon: Icons.schedule,
              color: toneColor,
              text: event.dinnerTime,
            ),
          _InfoLine(
            icon: Icons.location_on_outlined,
            color: toneColor,
            text: placeLine,
          ),
          if (clan.isNotEmpty)
            _InfoLine(
              icon: Icons.groups_outlined,
              color: toneColor,
              text: clan,
            ),
          const SizedBox(height: 8),

          // 4. صفّ الأزرار: التفاصيل (مصمت بلون النوع)، تبريكات، تذكير، مشاركة
          Row(
            children: [
              Expanded(
                child: _CaptionActionButton(
                  icon: Icons.info_outline,
                  label: 'التفاصيل',
                  fill: toneColor,
                  onTap: onDetailsTap,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _CaptionActionButton(
                  icon: Icons.chat_bubble_outline,
                  // التسمية وحدها بلا عدّاد — العدّاد في صفحة المناسبة، وهناك
                  // يحكمه النوع.
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
            ],
          ),
        ],
      ),
    );
  }
}

/// زرّ في صفّ لوح المعلومات: محدّد على السطح، أو مصمت بلون [fill] («التفاصيل»)
/// ونصّه أبيض أو داكن حسب سطوع اللون — لون نوع فاتح (ذهبي) لا يحمل نصاً أبيض.
class _CaptionActionButton extends StatelessWidget {
  const _CaptionActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.highlight = false,
    this.fill,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool highlight;
  final Color? fill;

  @override
  Widget build(BuildContext context) {
    final fill = this.fill;
    final foreground = fill != null
        ? (ThemeData.estimateBrightnessForColor(fill) == Brightness.dark
            ? Colors.white
            : Colors.black87)
        : (highlight ? context.c.sky : context.c.ink);

    return Material(
      color: fill ?? (highlight ? context.c.skyWash : Colors.transparent),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: fill ?? (highlight ? context.c.sky : context.c.line),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: foreground),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: foreground,
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
    this.toneColor,
  });

  final String? url;
  final double? height;
  final bool isSolemn;
  final bool whole;
  final Color? groundColor;
  final Color? toneColor;

  /// أرضية التحميل والفشل حين يفرضها المستدعي. كرت التغذية يمرّرها **دائماً**
  /// محسوبةً من لون النوع، فلا يبقى فرع على النبرة يقرّر لوناً هناك (المواصفة
  /// ‏#98: «العزاء أردوازيّ بنفس الرسم تماماً — بلا فرع `isSolemn` في أي عميل»)،
  /// ولا يومض الكرت أبيض ثم يقفز إلى لون النوع أثناء التحميل (القصة ٢٤).
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

  /// خلفية هندسية إسلامية/بدوية فاخرة بنقوش مذهبة وإطار ناعم بدلاً من التمويه
  /// المشوه للصورة المكبرة، مع الحفاظ على سلامة أبعاد الصورة بالكامل.
  Widget _buildWhole(BuildContext context) {
    final ornamentTone = toneColor ?? (isSolemn ? const Color(0xFF94A3B8) : cardGold);
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _LuxuryLetterboxBackdrop(
            groundColor: groundColor,
            toneColor: ornamentTone,
            isSolemn: isSolemn,
          ),
          Center(
            child: Container(
              decoration: BoxDecoration(
                boxShadow: [
                  BoxShadow(
                    color: isSolemn
                        ? Colors.black.withValues(alpha: 0.50)
                        : const Color(0xFF8F6A20).withValues(alpha: 0.22),
                    blurRadius: 22,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: CachedNetworkImage(
                imageUrl: url!,
                fit: BoxFit.contain,
                placeholder: (_, _) => _placeholder(context),
                errorWidget: (_, _, _) => _failed(context),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LuxuryLetterboxBackdrop extends StatelessWidget {
  const _LuxuryLetterboxBackdrop({
    required this.groundColor,
    required this.toneColor,
    required this.isSolemn,
  });

  final Color? groundColor;
  final Color toneColor;
  final bool isSolemn;

  @override
  Widget build(BuildContext context) {
    final solemnBase = groundColor ?? const Color(0xFF1E293B);
    final solemnDarkEdge = const Color(0xFF0B111A);

    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: isSolemn
                ? RadialGradient(
                    center: Alignment.center,
                    radius: 1.1,
                    colors: [solemnBase, solemnDarkEdge],
                  )
                : const RadialGradient(
                    center: Alignment.center,
                    radius: 1.15,
                    colors: [
                      Color(0xFFFFFDF8),
                      Color(0xFFFBF1D9),
                      Color(0xFFF3DFAD),
                    ],
                    stops: [0.0, 0.55, 1.0],
                  ),
          ),
        ),
        CustomPaint(
          painter: _LetterboxPatternPainter(
            toneColor: toneColor,
            isSolemn: isSolemn,
          ),
        ),
      ],
    );
  }
}

class _LetterboxPatternPainter extends CustomPainter {
  const _LetterboxPatternPainter({
    required this.toneColor,
    required this.isSolemn,
  });

  final Color toneColor;
  final bool isSolemn;

  @override
  void paint(Canvas canvas, Size size) {
    final strokeColor = isSolemn ? toneColor : const Color(0xFFC59425);
    final fillColor = isSolemn ? toneColor : const Color(0xFFD4AF37);

    final strokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSolemn ? 0.9 : 1.1
      ..color = strokeColor.withValues(alpha: isSolemn ? 0.14 : 0.28);

    final fillPaint = Paint()
      ..style = PaintingStyle.fill
      ..color = fillColor.withValues(alpha: isSolemn ? 0.05 : 0.10);

    const tileSize = 56.0;
    final cols = (size.width / tileSize).ceil() + 1;
    final rows = (size.height / tileSize).ceil() + 1;
    final offsetX = ((size.width - (cols * tileSize)) / 2);
    final offsetY = ((size.height - (rows * tileSize)) / 2);

    for (int i = 0; i < cols; i++) {
      for (int j = 0; j < rows; j++) {
        final cx = offsetX + i * tileSize + tileSize / 2;
        final cy = offsetY + j * tileSize + tileSize / 2;

        const r1 = 14.0;
        const r2 = 9.8;
        final path = Path();
        for (int step = 0; step < 16; step++) {
          final radius = (step % 2 == 0) ? r1 : r2;
          final angle = (step * math.pi / 8) - (math.pi / 2);
          final px = cx + radius * math.cos(angle);
          final py = cy + radius * math.sin(angle);
          if (step == 0) {
            path.moveTo(px, py);
          } else {
            path.lineTo(px, py);
          }
        }
        path.close();

        canvas.drawPath(path, fillPaint);
        canvas.drawPath(path, strokePaint);

        canvas.drawCircle(
          Offset(cx, cy),
          2.2,
          fillPaint,
        );
      }
    }

    final cornerPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = toneColor.withValues(alpha: isSolemn ? 0.28 : 0.40);

    const cornerSize = 28.0;
    const margin = 10.0;

    // Top-Left
    canvas.drawLine(const Offset(margin, margin), const Offset(margin + cornerSize, margin), cornerPaint);
    canvas.drawLine(const Offset(margin, margin), const Offset(margin, margin + cornerSize), cornerPaint);
    // Top-Right
    canvas.drawLine(Offset(size.width - margin, margin), Offset(size.width - margin - cornerSize, margin), cornerPaint);
    canvas.drawLine(Offset(size.width - margin, margin), Offset(size.width - margin, margin + cornerSize), cornerPaint);
    // Bottom-Left
    canvas.drawLine(Offset(margin, size.height - margin), Offset(margin + cornerSize, size.height - margin), cornerPaint);
    canvas.drawLine(Offset(margin, size.height - margin), Offset(margin, size.height - margin - cornerSize), cornerPaint);
    // Bottom-Right
    canvas.drawLine(Offset(size.width - margin, size.height - margin), Offset(size.width - margin - cornerSize, size.height - margin), cornerPaint);
    canvas.drawLine(Offset(size.width - margin, size.height - margin), Offset(size.width - margin, size.height - margin - cornerSize), cornerPaint);
  }

  @override
  bool shouldRepaint(covariant _LetterboxPatternPainter oldDelegate) {
    return oldDelegate.toneColor != toneColor || oldDelegate.isSolemn != isSolemn;
  }
}

/// سطر معلومة واحد في لوح المعلومات: أيقونة بلون النوع ثم النصّ. سطر فارغ لا
/// يُرسم إطلاقاً.
class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: context.c.inkSoft,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
