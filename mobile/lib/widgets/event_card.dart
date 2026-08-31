import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../models/event.dart';
import '../theme.dart';

/// يحوّل لون النوع (`#RRGGBB` من الخادم) إلى [Color]، ويسقط إلى لون محايد
/// إن فشل التحويل — نوع جديد بلون غير متوقّع لا يجب أن يُسقِط الواجهة.
Color occasionTypeColor(String? hex) {
  if (hex == null || hex.isEmpty) return AppTheme.gold;
  var value = hex.trim();
  if (value.startsWith('#')) value = value.substring(1);
  if (value.length == 6) value = 'FF$value';
  if (value.length != 8) return AppTheme.gold;
  final parsed = int.tryParse(value, radix: 16);
  return parsed == null ? AppTheme.gold : Color(parsed);
}

/// بطاقة مناسبة في القائمة.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.onTap});

  final Event event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final type = event.occasionType;
    final typeColor = occasionTypeColor(type?.color);
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
            EventPoster(url: event.posterUrl, height: 190),
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
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textGold,
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
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        );
                      }),
                      const Spacer(),
                      if (showViews) ...[
                        const Icon(
                          Icons.visibility_outlined,
                          size: 15,
                          color: AppTheme.textMuted,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${event.viewsCount}',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppTheme.textMuted,
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
class EventPoster extends StatelessWidget {
  const EventPoster({super.key, required this.url, this.height});

  final String? url;
  final double? height;

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) return _placeholder();

    return CachedNetworkImage(
      imageUrl: url!,
      height: height,
      width: double.infinity,
      fit: BoxFit.cover,
      placeholder: (_, _) => Container(
        height: height,
        color: AppTheme.bgSurface,
        child: const Center(
          child: SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      errorWidget: (_, _, _) => _placeholder(),
    );
  }

  Widget _placeholder() => Container(
        height: height,
        width: double.infinity,
        color: AppTheme.bgSurface,
        child: const Icon(
          Icons.image_not_supported_outlined,
          color: AppTheme.textMuted,
          size: 38,
        ),
      );
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
          Icon(icon, size: 15, color: AppTheme.gold),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13.5,
                color: AppTheme.textSecondary,
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
