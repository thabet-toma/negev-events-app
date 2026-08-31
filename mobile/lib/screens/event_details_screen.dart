import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/event_card.dart';

/// تفاصيل مناسبة: البوستر، المعلومات، الشيلة، التفاعلات، التبريكات.
class EventDetailsScreen extends StatefulWidget {
  const EventDetailsScreen({super.key, required this.eventId});

  final int eventId;

  @override
  State<EventDetailsScreen> createState() => _EventDetailsScreenState();
}

class _EventDetailsScreenState extends State<EventDetailsScreen> {
  Future<Event>? _event;
  final _player = AudioPlayer();
  bool _isPlaying = false;
  bool _sending = false;

  VoidCallback? _unsubscribeReactions;
  VoidCallback? _unsubscribeCongrats;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_event != null) return;

    _event = AppServices.of(context).api.eventDetails(widget.eventId);

    final realtime = AppServices.of(context).realtime;
    _unsubscribeReactions =
        realtime.onEventReaction(widget.eventId, _reloadQuietly);
    _unsubscribeCongrats =
        realtime.onNewCongratulation(widget.eventId, (_) => _reloadQuietly());
  }

  @override
  void dispose() {
    _unsubscribeReactions?.call();
    _unsubscribeCongrats?.call();
    _player.dispose();
    super.dispose();
  }

  void _reloadQuietly() {
    if (!mounted) return;
    setState(() {
      _event = AppServices.of(context).api.eventDetails(widget.eventId);
    });
  }

  Future<void> _toggleAudio(String url) async {
    try {
      if (_isPlaying) {
        await _player.pause();
        setState(() => _isPlaying = false);
      } else {
        await _player.play(UrlSource(url));
        setState(() => _isPlaying = true);
        _player.onPlayerComplete.listen((_) {
          if (mounted) setState(() => _isPlaying = false);
        });
      }
    } catch (_) {
      if (mounted) showMessage(context, 'تعذّر تشغيل الشيلة', isError: true);
    }
  }

  Future<void> _react(String type) async {
    final services = AppServices.of(context);
    try {
      await services.api.react(
        widget.eventId,
        type,
        services.auth.reactionIdentifier,
      );
      _reloadQuietly();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  Future<void> _openNavigation(Event event) async {
    if (event.latitude == null || event.longitude == null) {
      showMessage(context, 'لا توجد إحداثيات لهذه المناسبة', isError: true);
      return;
    }

    final uri = Uri.parse(
      'https://waze.com/ul?ll=${event.latitude},${event.longitude}&navigate=yes',
    );
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) showMessage(context, 'تعذّر فتح التطبيق', isError: true);
    }
  }

  Future<void> _callHost(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (mounted) showMessage(context, 'تعذّر إجراء الاتصال', isError: true);
    }
  }

  Future<void> _openCongratulateSheet(Event event) async {
    final nameController = TextEditingController(
      text: AppServices.of(context).auth.user?.fullName ?? '',
    );
    final messageController = TextEditingController();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 18,
          right: 18,
          top: 20,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'أضف تبريكتك',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppTheme.textGold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'اسمك'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: messageController,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'التبريكة'),
            ),
            const SizedBox(height: 18),
            StatefulBuilder(
              builder: (context, setSheetState) => ElevatedButton(
                onPressed: _sending
                    ? null
                    : () async {
                        final name = nameController.text.trim();
                        final message = messageController.text.trim();
                        if (name.isEmpty || message.isEmpty) {
                          showMessage(
                            context,
                            'الاسم والتبريكة مطلوبان',
                            isError: true,
                          );
                          return;
                        }

                        setSheetState(() => _sending = true);
                        try {
                          await AppServices.of(context).api.congratulate(
                                event.id,
                                senderName: name,
                                message: message,
                              );
                          if (sheetContext.mounted) {
                            Navigator.of(sheetContext).pop();
                          }
                          _reloadQuietly();
                        } catch (error) {
                          if (context.mounted) {
                            showMessage(context, '$error', isError: true);
                          }
                        } finally {
                          setSheetState(() => _sending = false);
                        }
                      },
                child: Text(_sending ? 'جارٍ الإرسال…' : 'إرسال التبريكة'),
              ),
            ),
          ],
        ),
      ),
    );

    nameController.dispose();
    messageController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل المناسبة')),
      body: FutureBuilder<Event>(
        future: _event,
        builder: (context, snapshot) {
          return AsyncView<Event>(
            snapshot: snapshot,
            onRetry: _reloadQuietly,
            builder: (event) => ListView(
              padding: const EdgeInsets.only(bottom: 28),
              children: [
                EventPoster(url: event.posterUrl, height: 250),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.title.isEmpty
                            ? 'زفاف العريس ${event.groomName}'
                            : event.title,
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textGold,
                        ),
                      ),
                      const SizedBox(height: 14),
                      _InfoRow(
                        icon: Icons.person_outline,
                        label: 'العريس',
                        value: event.groomName,
                      ),
                      _InfoRow(
                        icon: Icons.groups_2_outlined,
                        label: 'العائلة',
                        value: event.familyClan,
                      ),
                      _InfoRow(
                        icon: Icons.location_on_outlined,
                        label: 'المكان',
                        value: '${event.town} — ${event.locationName}',
                      ),
                      _InfoRow(
                        icon: Icons.event_outlined,
                        label: 'تاريخ العرس',
                        value: event.eventDate,
                      ),
                      if (event.youthPartyDate != null)
                        _InfoRow(
                          icon: Icons.nightlife_outlined,
                          label: 'سهرة الشباب',
                          value: event.youthPartyDate!,
                        ),
                      _InfoRow(
                        icon: Icons.access_time,
                        label: 'موعد العشاء',
                        value: event.dinnerTime,
                      ),
                      const SizedBox(height: 14),
                      if (event.audioUrl != null)
                        _AudioTile(
                          title: event.audioTitle ?? 'شيلة الفرح',
                          isPlaying: _isPlaying,
                          onToggle: () => _toggleAudio(event.audioUrl!),
                        ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _openNavigation(event),
                              icon: const Icon(Icons.navigation_outlined),
                              label: const Text('اذهب بـ Waze'),
                            ),
                          ),
                          if (event.hostPhone != null) ...[
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => _callHost(event.hostPhone!),
                                icon: const Icon(Icons.phone_outlined),
                                label: const Text('اتصال'),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'شارك فرحتهم',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textGold,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: AppConfig.reactions.entries.map((entry) {
                          final count = event.reactions[entry.key] ?? 0;
                          return _ReactionButton(
                            emoji: entry.value,
                            label: AppConfig.reactionLabels[entry.key] ?? '',
                            count: count,
                            onTap: () => _react(entry.key),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        children: [
                          const Text(
                            'التبريكات',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textGold,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '(${event.congratulations.length})',
                            style: const TextStyle(color: AppTheme.textMuted),
                          ),
                          const Spacer(),
                          TextButton.icon(
                            onPressed: () => _openCongratulateSheet(event),
                            icon: const Icon(Icons.add_comment_outlined, size: 18),
                            label: const Text('بارك'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      if (event.congratulations.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 18),
                          child: Text(
                            'كن أول من يبارك لهم 🌹',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppTheme.textMuted),
                          ),
                        )
                      else
                        ...event.congratulations.map(
                          (comment) => _CongratulationTile(comment: comment),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    if (value.trim().isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: AppTheme.gold),
          const SizedBox(width: 9),
          Text(
            '$label: ',
            style: const TextStyle(
              color: AppTheme.textMuted,
              fontSize: 14,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 14.5,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AudioTile extends StatelessWidget {
  const _AudioTile({
    required this.title,
    required this.isPlaying,
    required this.onToggle,
  });

  final String title;
  final bool isPlaying;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppTheme.gold,
          child: Icon(
            isPlaying ? Icons.pause : Icons.play_arrow,
            color: AppTheme.bgPrimary,
          ),
        ),
        title: Text(
          title,
          style: const TextStyle(fontSize: 14.5, color: AppTheme.textPrimary),
        ),
        subtitle: Text(
          isPlaying ? 'قيد التشغيل…' : 'اضغط للاستماع',
          style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
        ),
        onTap: onToggle,
      ),
    );
  }
}

class _ReactionButton extends StatelessWidget {
  const _ReactionButton({
    required this.emoji,
    required this.label,
    required this.count,
    required this.onTap,
  });

  final String emoji;
  final String label;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: AppTheme.bgSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.borderSubtle),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 19)),
            const SizedBox(width: 7),
            Text(
              '$label $count',
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CongratulationTile extends StatelessWidget {
  const _CongratulationTile({required this.comment});

  final Congratulation comment;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.person, size: 15, color: AppTheme.gold),
              const SizedBox(width: 6),
              Text(
                comment.senderName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                  fontSize: 14,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.goldDark.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  comment.badgeTitle,
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppTheme.textGold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            comment.message,
            style: const TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 14,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
