import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../models/event.dart';
import '../theme.dart';

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

/// تدرّج صورة العزاء حين تُحمَّل أو تفشل — أردوازي ثابت لا يتبع الوضع، مطابقاً
/// لـ`.card-poster-wrapper.tone-mourning` في `web/styles.css` (ليس متغيّر CSS
/// بل تدرّج ثابت بذاته هناك أيضاً).
const _mourningGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF334155), Color(0xFF64748B)],
);

/// بطاقة مناسبة في القائمة — صندوق صورة ٤:٥ ثابت (بملصق أو بلا ملصق) فوقه
/// كتلة نصّ سطران، وكل شيء آخر خلف «مزيد من التفاصيل» (#85 خطوة 47-53). حالة
/// الطيّ محلّية للبطاقة نفسها، لا تُرفع لأعلى — لا فائدة منها خارج الكرت.
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

  /// `null` يخفي كامل صفّ التبريكات — لا حاجة له خارج شاشة القائمة الفعلية.
  final VoidCallback? onCongratulationsTap;

  /// `null` يخفي زرّ «ذكّرني» بالكامل.
  final VoidCallback? onRemindTap;

  @override
  State<EventCard> createState() => _EventCardState();
}

class _EventCardState extends State<EventCard> {
  bool _detailsExpanded = false;

  @override
  Widget build(BuildContext context) {
    final event = widget.event;
    final type = event.occasionType;
    final typeColor = occasionTypeColor(type?.color, context.c.sky);
    final isSolemn = type?.isSolemn ?? false;
    final showViews = type?.showViewsCount ?? true;
    final reactionKeys = type?.reactions ?? const <String>[];

    final clanTownParts = [event.familyClan, event.townDisplay]
        .where((part) => part.trim().isNotEmpty)
        .toList();
    final clanTownLine = clanTownParts.join(' — ');

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap,
        // داخل `ListView.builder` الحقيقية الارتفاع غير محدود، فالصندوق يأخذ
        // نسبة ٤:٥ كاملة بلا سقف — هذا `LayoutBuilder` يتدخّل فقط حين يحصر
        // الأب الكرت بارتفاع محدود فعلاً (مثل اختبار يضع الكرت مباشرة تحت
        // `Scaffold` بلا قائمة قابلة للتمرير)، فيمنح النصّ تحت الصورة مساحته.
        child: LayoutBuilder(
          builder: (context, constraints) {
            final imageMaxHeight =
                constraints.hasBoundedHeight ? constraints.maxHeight * 0.5 : null;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _CardImageBox(
                  event: event,
                  type: type,
                  typeColor: typeColor,
                  isSolemn: isSolemn,
                  maxHeight: imageMaxHeight,
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.displayTitle,
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: context.c.ink,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (clanTownLine.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          clanTownLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.bold,
                            color: typeColor,
                          ),
                        ),
                      ],
                      // العزاء وحده يحمل سطراً ثالثاً هادئاً بالتاريخ — بلا شارة عدّاد
                      // فوق الصورة (٥٢)، لكن التاريخ نفسه يبقى ظاهراً لا خلف الطيّ.
                      if (isSolemn && event.eventDate.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          event.eventDate,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                        ),
                      ],
                      const SizedBox(height: 6),
                      _DetailsDisclosureButton(
                        expanded: _detailsExpanded,
                        onTap: () => setState(() => _detailsExpanded = !_detailsExpanded),
                      ),
                      if (_detailsExpanded) _CardDetailsPanel(event: event, type: type),
                      const SizedBox(height: 8),
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
                      // `congratulationsCount == null` يعني أنّ الخادم أخفى العدّاد على هذا
                      // النوع — لا يُرسم شيء، لا صفراً ولا شرطة.
                      if (event.congratulationsCount != null) ...[
                        const SizedBox(height: 8),
                        _CongratulationsRow(event: event, onTap: widget.onCongratulationsTap),
                      ],
                      if (widget.onRemindTap != null) ...[
                        const SizedBox(height: 8),
                        _RemindRow(event: event, onTap: widget.onRemindTap!),
                      ],
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// زرّ يطوي/يبسط كل ما ليس العنوان وسطر العشيرة/البلدة — «مزيد من التفاصيل»،
/// نفس فكرة `toggleCardDetails` في `web/app.js` (#85 خطوة 48).
class _DetailsDisclosureButton extends StatelessWidget {
  const _DetailsDisclosureButton({required this.expanded, required this.onTap});

  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              size: 18,
              color: context.c.sky,
            ),
            const SizedBox(width: 3),
            Text(
              expanded ? 'إخفاء التفاصيل' : 'مزيد من التفاصيل',
              style: TextStyle(fontSize: 12.5, color: context.c.sky, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}

/// كل ما طُوي خلف «مزيد من التفاصيل» — الفنان، التاريخ والعشاء، سهرة الشباب،
/// والموقع الكامل. العشيرة والبلدة لا تتكرران هنا — ظاهرتان أصلاً فوق الزرّ.
class _CardDetailsPanel extends StatelessWidget {
  const _CardDetailsPanel({required this.event, required this.type});

  final Event event;
  final OccasionType? type;

  @override
  Widget build(BuildContext context) {
    final showDinnerTime = type?.showsField('dinner_time') ?? true;
    final showYouthParty = type?.showsField('youth_party_date') ?? true;

    return Padding(
      padding: const EdgeInsets.only(top: 2, bottom: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // «يحيي الحفلة الفنان فلان» — تختفي كلياً حين يفرغ الحقل (لا نصّ
          // بديل)، وصورة الفنان تبقى في شاشة التفاصيل وحدها لا هنا.
          if (event.artistName != null && event.artistName!.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 22, bottom: 5),
              child: Text(
                'يحيي الحفلة الفنان ${event.artistName}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
              ),
            ),
          _IconLine(
            icon: Icons.event_outlined,
            text: showDinnerTime && event.dinnerTime.isNotEmpty
                ? '${event.eventDate}  •  ${event.dinnerTime}'
                : event.eventDate,
          ),
          if (showYouthParty && event.youthPartyDate != null)
            _IconLine(icon: Icons.nightlife_outlined, text: event.youthPartyDate!),
          _IconLine(icon: Icons.location_on_outlined, text: event.locationName),
        ],
      ),
    );
  }
}

/// صندوق صورة الكرت — نسبة **٤:٥** ثابتة في كل الحالات (بملصق أو بلا ملصق،
/// فرحاً أو عزاءً) كي تتساوى الكروت ارتفاعاً (#85 خطوة 50-51). الملصق
/// `contain` كاملاً بلا قصّ عبر `EventPoster(whole: true)` نفسها — نفس تركيبة
/// `drawHero` في `shareCard.service.js` التي تخدم شاشة التفاصيل أصلاً (٥٣)،
/// لا تكرار لها هنا. الشارتان فوق الصورة مباشرة، لا في صفّ يسبقها يأكل
/// ارتفاعاً (٤٩). العزاء بلا شارة عدّاد إطلاقاً (٥٢).
class _CardImageBox extends StatelessWidget {
  const _CardImageBox({
    required this.event,
    required this.type,
    required this.typeColor,
    required this.isSolemn,
    this.maxHeight,
  });

  final Event event;
  final OccasionType? type;
  final Color typeColor;
  final bool isSolemn;

  /// سقف اختياري — `null` (الحالة الحقيقية داخل `ListView.builder`) يترك
  /// النسبة ٤:٥ تحكم الارتفاع كاملاً بلا قيد. يُمرَّر فقط حين يحصر أبٌ ما
  /// (كاختبار) الكرت بارتفاع محدود فعلاً، كي يبقى للنصّ تحت الصورة مكانه.
  final double? maxHeight;

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

  bool get _hasPoster => event.posterUrl != null && event.posterUrl!.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final box = AspectRatio(
      aspectRatio: 4 / 5,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // `EventPoster(whole: true)` نفسها تُنتج الملصق كاملاً فوق نسخة
          // مطموسة منه — نفس ما تحتاجه شاشة التفاصيل أصلاً (#53)، فلا داعي
          // لتكرار تركيب الطمس هنا. `height: null` تكفي: `AspectRatio` فوقها
          // يفرض القياس بقيد صارم قبل وصوله لها.
          _hasPoster
              ? EventPoster(url: event.posterUrl, isSolemn: isSolemn, whole: true)
              : _emptyPlaceholder(context),
          if (type != null)
            PositionedDirectional(
              top: 9,
              end: 10,
              child: _TypeBadge(type: type!, color: typeColor),
            ),
          // مُعزٍّ لا يقرأ «باقي ٣ أيام» فوق نعي — العدّاد يختفي كلياً على النغمة
          // الوقورة، لا يتحوّل نصّاً آخر.
          if (!isSolemn)
            PositionedDirectional(
              bottom: 9,
              start: 10,
              child: _DateChip(text: _countdownText),
            ),
        ],
      ),
    );

    final cap = maxHeight;
    if (cap == null) return box;
    return ConstrainedBox(constraints: BoxConstraints(maxHeight: cap), child: box);
  }

  /// مناسبة بلا ملصق أصلاً — أيقونة مركزية على خلفية متدرّجة تقول «هذا كرت
  /// بلا صورة» عمداً، لا صندوق فارغ يقرأ عطلاً (#85 خطوة 51).
  Widget _emptyPlaceholder(BuildContext context) {
    return DecoratedBox(
      decoration: isSolemn
          ? const BoxDecoration(gradient: _mourningGradient)
          : BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [context.c.surfaceSunk, context.c.surface],
              ),
            ),
      child: Center(
        child: Icon(
          isSolemn ? Icons.spa_outlined : Icons.celebration_outlined,
          size: 46,
          color: isSolemn ? Colors.white70 : context.c.inkFaint,
        ),
      ),
    );
  }
}

/// شارة عدّاد/تاريخ فوق الصورة — خلفية بيضاء شبه صلبة موثوقة فوق أي صورة
/// عشوائية، مطابقة لـ`.card-datechip` في `web/styles.css`.
class _DateChip extends StatelessWidget {
  const _DateChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(color: Color(0x400C1B2A), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Color(0xFF0C1B2A)),
      ),
    );
  }
}

/// عدّاد التبريكات وسطر معاينة آخر رسالة — الضغط يفتح ورقة الرسائل مباشرةً،
/// لا شاشة التفاصيل (هذا هو الإصلاح الفعلي، لا مجرّد رقم).
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
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: content),
    );
  }
}

/// زرّ «ذكّرني» — نفس الكلمة في كل الأنواع (لا اشتقاق من النوع)، وعدّاد متابعين
/// اختياري بجانبه. لا زرّ حضور ولا "لن أحضر" هنا إطلاقاً.
class _RemindRow extends StatelessWidget {
  const _RemindRow({required this.event, required this.onTap});

  final Event event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isReminded = event.isReminded;
    return Row(
      children: [
        OutlinedButton.icon(
          onPressed: onTap,
          icon: Icon(
            isReminded ? Icons.notifications_active : Icons.notifications_none,
            size: 16,
          ),
          label: const Text('ذكّرني'),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            foregroundColor: isReminded ? context.c.sky : context.c.inkSoft,
            side: BorderSide(color: isReminded ? context.c.sky : context.c.line),
          ),
        ),
        // `followersCount == null` يعني أنّ النوع أخفى العدّاد — لا يُرسم شيء.
        if (event.followersCount != null) ...[
          const SizedBox(width: 8),
          Text(
            'متابعون: ${event.followersCount}',
            style: TextStyle(fontSize: 12, color: context.c.inkFaint),
          ),
        ],
      ],
    );
  }
}

/// شارة نوع المناسبة — أيقونة ولون من الخادم، لا جدول ثابت في العميل. خلفية
/// بيضاء شبه صلبة (لا تلوين شفّاف) لأنها تجلس فوق صورة عشوائية اليوم، لا فوق
/// خلفية الكرت الثابتة كما كانت قبل ٤:٥ (مطابقة لـ`.card-kindchip .town-badge`).
class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type, required this.color});

  final OccasionType type;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.5)),
        boxShadow: const [
          BoxShadow(color: Color(0x400C1B2A), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (type.icon.isNotEmpty) ...[
            Text(type.icon, style: const TextStyle(fontSize: 13)),
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
  });

  final String? url;
  final double? height;
  final bool isSolemn;

  /// سطح **قرار** لا سطح مسح (#53): يعرض الملصق كاملاً فوق تعبئة مطموسة منه
  /// بدل قصّه. تستعمله شاشة التفاصيل — من فتح مناسبة بعينها جاء ليراها. والكرت
  /// يبقى على القصّ: ارتفاعه لا يتّسع لملصق كامل إلا كطابع صغير وسط فراغ.
  final bool whole;

  /// الخلفية الهادئة تحت التحميل والفشل — أردوازي للعزاء لا سماوي.
  BoxDecoration _veil(BuildContext context) => isSolemn
      ? const BoxDecoration(gradient: _mourningGradient)
      : BoxDecoration(color: context.c.surfaceSunk);

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
      color: isSolemn ? Colors.white70 : context.c.inkFaint,
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
