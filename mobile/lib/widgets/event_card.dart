import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../models/event.dart';
import '../theme.dart';

/// بطاقة مناسبة في القائمة.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.onTap});

  final Event event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
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
                  Text(
                    event.title.isEmpty
                        ? 'زفاف العريس ${event.groomName}'
                        : event.title,
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
                    text: '${event.eventDate}  •  ${event.dinnerTime}',
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      ...AppConfig.reactions.entries.map((entry) {
                        final count = event.reactions[entry.key] ?? 0;
                        if (count == 0) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsetsDirectional.only(end: 10),
                          child: Text(
                            '${entry.value} $count',
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        );
                      }),
                      const Spacer(),
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
