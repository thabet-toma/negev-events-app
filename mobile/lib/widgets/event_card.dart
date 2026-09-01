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

/// ارتفاع صورة الكرت — عادي مقابل نبرة `solemn` (#20 خطوة ١٥، قرار ٦):
/// الأردوازي أقصر لا مساوٍ، بنفس نسبة الويب (96/124 ≈ 0.774) مطبَّقة على
/// ارتفاع كرت الموبايل الأوسع نسبياً.
const double _cardPosterHeight = 190;
const double _cardPosterHeightSolemn = 147;

/// تدرّج صورة العزاء حين تُحمَّل أو تفشل — أردوازي ثابت لا يتبع الوضع، مطابقاً
/// لـ`.card-poster-wrapper.tone-mourning` في `web/styles.css` (ليس متغيّر CSS
/// بل تدرّج ثابت بذاته هناك أيضاً).
const _mourningGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF334155), Color(0xFF64748B)],
);

/// بطاقة مناسبة في القائمة.
class EventCard extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final type = event.occasionType;
    final typeColor = occasionTypeColor(type?.color, context.c.sky);
    final isSolemn = type?.isSolemn ?? false;
    final showDinnerTime = type?.showsField('dinner_time') ?? true;
    final showYouthParty = type?.showsField('youth_party_date') ?? true;
    final showViews = type?.showViewsCount ?? true;
    final reactionKeys = type?.reactions ?? const <String>[];

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (event.posterUrl != null && event.posterUrl!.isNotEmpty)
              EventPoster(
                url: event.posterUrl,
                height: isSolemn ? _cardPosterHeightSolemn : _cardPosterHeight,
                isSolemn: isSolemn,
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (type != null) ...[
                    _TypeBadge(type: type, color: typeColor),
                    const SizedBox(height: 6),
                  ],
                  Text(
                    event.displayTitle,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: context.c.ink,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  _IconLine(icon: Icons.groups_2_outlined, text: event.familyClan),
                  _IconLine(
                    icon: Icons.location_on_outlined,
                    text: '${event.town} — ${event.locationName}',
                  ),
                  _IconLine(
                    icon: Icons.event_outlined,
                    text: showDinnerTime && event.dinnerTime.isNotEmpty
                        ? '${event.eventDate}  •  ${event.dinnerTime}'
                        : event.eventDate,
                  ),
                  if (showYouthParty && event.youthPartyDate != null)
                    _IconLine(
                      icon: Icons.nightlife_outlined,
                      text: event.youthPartyDate!,
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
                  // `congratulationsCount == null` يعني أنّ الخادم أخفى العدّاد على هذا
                  // النوع — لا يُرسم شيء، لا صفراً ولا شرطة.
                  if (event.congratulationsCount != null) ...[
                    const SizedBox(height: 8),
                    _CongratulationsRow(event: event, onTap: onCongratulationsTap),
                  ],
                  if (onRemindTap != null) ...[
                    const SizedBox(height: 8),
                    _RemindRow(event: event, onTap: onRemindTap!),
                  ],
                ],
              ),
            ),
          ],
        ),
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

/// شارة نوع المناسبة — أيقونة ولون من الخادم، لا جدول ثابت في العميل.
class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type, required this.color});

  final OccasionType type;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.5)),
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
  });

  final String? url;
  final double? height;
  final bool isSolemn;

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) return const SizedBox.shrink();

    return CachedNetworkImage(
      imageUrl: url!,
      height: height,
      width: double.infinity,
      fit: BoxFit.cover,
      placeholder: (_, _) => Container(
        height: height,
        decoration: isSolemn
            ? const BoxDecoration(gradient: _mourningGradient)
            : BoxDecoration(color: context.c.surfaceSunk),
        child: const Center(
          child: SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      errorWidget: (_, _, _) => Container(
        height: height,
        width: double.infinity,
        decoration: isSolemn
            ? const BoxDecoration(gradient: _mourningGradient)
            : BoxDecoration(color: context.c.surfaceSunk),
        child: Icon(
          Icons.image_not_supported_outlined,
          color: isSolemn ? Colors.white70 : context.c.inkFaint,
          size: 38,
        ),
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
