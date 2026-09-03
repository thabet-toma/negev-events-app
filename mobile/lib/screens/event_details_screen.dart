import 'package:audioplayers/audioplayers.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../state/analytics.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/congratulations.dart';
import '../widgets/event_card.dart';

/// ارتفاع بوستر التفاصيل — عادي مقابل نبرة `solemn`، بنفس نسبة كرت القائمة
/// (#20 خطوة ١٥).
const double _detailsPosterHeight = 250;
const double _detailsPosterHeightSolemn = 194;

/// تفاصيل مناسبة: البوستر، المعلومات، الشيلة، التفاعلات، التبريكات — كلها
/// مقادة بإعداد نوع المناسبة (`occasion_type`)، لا نص فرح ثابت.
class EventDetailsScreen extends StatefulWidget {
  const EventDetailsScreen({super.key, required this.eventId});

  final int eventId;

  @override
  State<EventDetailsScreen> createState() => _EventDetailsScreenState();
}

class _EventDetailsScreenState extends State<EventDetailsScreen> {
  Future<Event>? _event;

  /// طابور مراجعة الرسائل — `null` يعني إمّا لا يزال يُحمَّل أو أنّ الخادم رفضه
  /// (403 لغير المالك/الإدارة)؛ الحالتان تُعرَضان بنفس الشكل: بلا مدخل إطلاقاً.
  /// لا استنتاج ملكية في العميل — القرار وحده عائد لاستجابة الخادم.
  Future<List<Congratulation>?>? _queue;

  final _player = AudioPlayer();
  bool _isPlaying = false;

  VoidCallback? _unsubscribeReactions;
  VoidCallback? _unsubscribeCongrats;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_event != null) return;

    final services = AppServices.of(context);
    _event = services.api.eventDetails(widget.eventId);
    if (services.auth.isSignedIn) _queue = _loadQueue();

    final realtime = services.realtime;
    _unsubscribeReactions =
        realtime.onEventReaction(widget.eventId, _reloadQuietly);
    _unsubscribeCongrats =
        realtime.onNewCongratulation(widget.eventId, (_) => _reloadQuietly());
  }

  Future<List<Congratulation>?> _loadQueue() async {
    try {
      return await AppServices.of(context)
          .api
          .moderationQueue(widget.eventId, status: 'pending');
    } catch (_) {
      return null;
    }
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
    final services = AppServices.of(context);
    setState(() {
      _event = services.api.eventDetails(widget.eventId);
      if (services.auth.isSignedIn) _queue = _loadQueue();
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

  /// يفتح صحيفة مشاركة النظام — لا رابطاً مباشراً لواتساب وحده، كي يختار
  /// المستخدم أي تطبيق يريد. الرابط من نفس عنوان الخادم الذي يستهلكه التطبيق
  /// أصلاً ([AppConfig.apiBase]) لا ثابتاً ثانياً، والنصّ بلا «حمّل التطبيق» —
  /// تلك حكاية صفحة الهبوط، لا صحيفة المشاركة.
  Future<void> _share(Event event) async {
    // بلدة *المناسبة* المشارَكة، لا بلدة المستخدم — نفس تمييز الويب
    // (recordAnalyticsEvent في web/app.js). يُسجَّل عند النقرة نفسها، بصرف
    // النظر عن نجاح صحيفة المشاركة بعدها أو فشلها.
    recordAnalyticsEvent(
      AppServices.of(context).api,
      'share_clicked',
      contentTown: event.town,
    );

    final url = '${AppConfig.apiBase}/e/${event.id}';
    final text = '${event.displayTitle} — ${event.townDisplay}\n$url';
    try {
      await SharePlus.instance.share(ShareParams(text: text));
    } catch (error) {
      if (mounted) showMessage(context, 'تعذّر فتح قائمة المشاركة', isError: true);
    }
  }

  Future<void> _callHost(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (mounted) showMessage(context, 'تعذّر إجراء الاتصال', isError: true);
    }
  }

  Future<void> _openCongratulateSheet(Event event) async {
    final label = event.occasionType?.congratulationsLabel ?? 'تبريكات';
    await openCongratulateSheet(
      context,
      eventId: event.id,
      label: label,
      onSuccess: _reloadQuietly,
    );
  }

  Future<void> _toggleRemind(Event event) async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لتفعيل التذكير');
      return;
    }

    try {
      if (event.isReminded) {
        await services.api.unremind(event.id);
      } else {
        await services.api.remind(event.id);
      }
      _reloadQuietly();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  Future<void> _report(int eventId, int congratulationId) async {
    try {
      await AppServices.of(context).api.reportCongratulation(eventId, congratulationId);
      if (mounted) showMessage(context, 'تم إرسال البلاغ، شكراً لك');
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تفاصيل المناسبة'),
        actions: [
          FutureBuilder<List<Congratulation>?>(
            future: _queue,
            builder: (context, snapshot) {
              final queue = snapshot.data;
              if (queue == null) return const SizedBox.shrink();
              return IconButton(
                tooltip: 'طابور المراجعة',
                icon: Badge(
                  label: Text('${queue.length}'),
                  isLabelVisible: queue.isNotEmpty,
                  child: const Icon(Icons.rule_folder_outlined),
                ),
                onPressed: () => showModerationQueueSheet(
                  context,
                  eventId: widget.eventId,
                  onChanged: _reloadQuietly,
                ),
              );
            },
          ),
        ],
      ),
      body: FutureBuilder<Event>(
        future: _event,
        builder: (context, snapshot) {
          return AsyncView<Event>(
            snapshot: snapshot,
            onRetry: _reloadQuietly,
            builder: (event) => _EventDetailsBody(
              event: event,
              isPlaying: _isPlaying,
              onRemindTap: () => _toggleRemind(event),
              onReport: (congratulationId) => _report(event.id, congratulationId),
              onToggleAudio: () => _toggleAudio(event.audioUrl!),
              onReact: _react,
              onNavigate: () => _openNavigation(event),
              onCallHost: () => _callHost(event.hostPhone!),
              onCongratulate: () => _openCongratulateSheet(event),
              onShare: () => _share(event),
            ),
          );
        },
      ),
    );
  }
}

class _EventDetailsBody extends StatelessWidget {
  const _EventDetailsBody({
    required this.event,
    required this.isPlaying,
    required this.onToggleAudio,
    required this.onReact,
    required this.onNavigate,
    required this.onCallHost,
    required this.onCongratulate,
    required this.onRemindTap,
    required this.onReport,
    required this.onShare,
  });

  final Event event;
  final bool isPlaying;
  final VoidCallback onToggleAudio;
  final ValueChanged<String> onReact;
  final VoidCallback onNavigate;
  final VoidCallback onCallHost;
  final VoidCallback onCongratulate;
  final VoidCallback onRemindTap;
  final ValueChanged<int> onReport;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final type = event.occasionType;
    final showYouthParty = type?.showsField('youth_party_date') ?? true;
    final showDinnerTime = type?.showsField('dinner_time') ?? true;
    final showAudio = type?.showsField('audio_url') ?? true;
    final showEndDate = type?.showsField('event_end_date') ?? false;
    final showSecondaryLocation = type?.showsField('secondary_location_name') ?? false;
    final reactionKeys = type?.reactions ?? const <String>[];
    final congratulationsLabel = type?.congratulationsLabel ?? 'تبريكات';

    final isSolemn = type?.isSolemn ?? false;

    return ListView(
      padding: const EdgeInsets.only(bottom: 28),
      children: [
        if (event.posterUrl != null && event.posterUrl!.isNotEmpty)
          EventPoster(
            url: event.posterUrl,
            height: isSolemn ? _detailsPosterHeightSolemn : _detailsPosterHeight,
            isSolemn: isSolemn,
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (type != null) ...[
                _TypeHeaderBadge(type: type),
                const SizedBox(height: 10),
              ],
              Text(
                event.displayTitle,
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const SizedBox(height: 14),
              if (event.honorees.isEmpty)
                _InfoRow(
                  icon: Icons.person_outline,
                  label: type?.labelFor('honorees') ?? 'صاحب المناسبة',
                  value: event.groomName,
                )
              else
                ...event.honorees.map(
                  (honoree) => _InfoRow(
                    icon: Icons.person_outline,
                    label: type?.labelFor('honorees') ?? 'أصحاب المناسبة',
                    value: honoree.role != null && honoree.role!.isNotEmpty
                        ? '${honoree.name} (${honoree.role})'
                        : honoree.name,
                  ),
                ),
              _InfoRow(
                icon: Icons.groups_2_outlined,
                label: type?.labelFor('family_clan') ?? 'العائلة',
                value: event.familyClan,
              ),
              // صورة الفنان تعيش هنا حصراً — الكرت يحمل الاسم وحده (#7).
              if (event.artistName != null && event.artistName!.trim().isNotEmpty)
                _ArtistTile(name: event.artistName!, imageUrl: event.artistImageUrl),
              _InfoRow(
                icon: Icons.location_on_outlined,
                label: type?.labelFor('location_name') ?? 'المكان',
                value: '${event.townDisplay} — ${event.locationName}',
              ),
              if (showSecondaryLocation && event.secondaryLocationName != null)
                _InfoRow(
                  icon: Icons.location_on_outlined,
                  label: type?.labelFor('secondary_location_name') ?? 'مكان آخر',
                  value: event.secondaryLocationName!,
                ),
              _InfoRow(
                icon: Icons.event_outlined,
                label: type?.labelFor('event_date') ?? 'التاريخ',
                value: event.eventDate,
              ),
              if (showEndDate && event.eventEndDate != null)
                _InfoRow(
                  icon: Icons.event_outlined,
                  label: type?.labelFor('event_end_date') ?? 'حتى',
                  value: event.eventEndDate!,
                ),
              if (showYouthParty && event.youthPartyDate != null)
                _InfoRow(
                  icon: Icons.nightlife_outlined,
                  label: type?.labelFor('youth_party_date') ?? 'سهرة الشباب',
                  value: event.youthPartyDate!,
                ),
              if (showDinnerTime && event.dinnerTime.isNotEmpty)
                _InfoRow(
                  icon: Icons.access_time,
                  label: type?.labelFor('dinner_time') ?? 'موعد العشاء',
                  value: event.dinnerTime,
                ),
              const SizedBox(height: 14),
              if (showAudio && event.audioUrl != null)
                _AudioTile(
                  title: event.audioTitle ?? type?.labelFor('audio_title') ?? 'مقطع صوتي',
                  isPlaying: isPlaying,
                  onToggle: onToggleAudio,
                ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onNavigate,
                      icon: const Icon(Icons.navigation_outlined),
                      label: const Text('اذهب بـ Waze'),
                    ),
                  ),
                  if (event.hostPhone != null) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: onCallHost,
                        icon: const Icon(Icons.phone_outlined),
                        label: const Text('اتصال'),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 10),
              // زرّ المشاركة — تفاصيل المناسبة وحدها (لا كرت القائمة، ثمانية
              // عناصر عليه أصلاً). الكلمة من نبرة النوع (`tone`) حصراً، لا اسمه.
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onShare,
                  icon: const Icon(Icons.ios_share_outlined),
                  label: Text(isSolemn ? 'أرسل النعي' : 'شارك المناسبة'),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: onRemindTap,
                    icon: Icon(
                      event.isReminded
                          ? Icons.notifications_active
                          : Icons.notifications_none,
                    ),
                    label: const Text('ذكّرني'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor:
                          event.isReminded ? context.c.sky : context.c.inkSoft,
                      side: BorderSide(
                        color: event.isReminded ? context.c.sky : context.c.line,
                      ),
                    ),
                  ),
                  if (event.followersCount != null) ...[
                    const SizedBox(width: 10),
                    Text(
                      'متابعون: ${event.followersCount}',
                      style: TextStyle(color: context.c.inkFaint, fontSize: 12.5),
                    ),
                  ],
                ],
              ),
              if (reactionKeys.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  'تفاعل مع المناسبة',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: reactionKeys.map((key) {
                    final count = event.reactions[key] ?? 0;
                    return _ReactionButton(
                      emoji: AppConfig.reactions[key] ?? key,
                      label: AppConfig.reactionLabels[key] ?? '',
                      count: count,
                      onTap: () => onReact(key),
                    );
                  }).toList(),
                ),
              ],
              const SizedBox(height: 24),
              Row(
                children: [
                  Text(
                    congratulationsLabel,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: context.c.ink,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '(${event.congratulations.length})',
                    style: TextStyle(color: context.c.inkFaint),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: onCongratulate,
                    icon: const Icon(Icons.add_comment_outlined, size: 18),
                    // «أضف» يميّز الزرّ عن العنوان الحامل لنفس التسمية.
                    label: Text('أضف $congratulationsLabel'),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              if (event.congratulations.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  child: Text(
                    (type?.isSolemn ?? false)
                        ? 'كن أول من يضيف $congratulationsLabel'
                        : 'كن أول من يضيف $congratulationsLabel 🌹',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: context.c.inkFaint),
                  ),
                )
              else
                ...event.congratulations.map(
                  (comment) => CongratulationTile(
                    comment: comment,
                    onReport: () => onReport(comment.id),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TypeHeaderBadge extends StatelessWidget {
  const _TypeHeaderBadge({required this.type});

  final OccasionType type;

  @override
  Widget build(BuildContext context) {
    final color = occasionTypeColor(type.color, context.c.sky);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (type.icon.isNotEmpty) ...[
            Text(type.icon, style: const TextStyle(fontSize: 14)),
            const SizedBox(width: 5),
          ],
          Text(
            type.name,
            style: TextStyle(fontSize: 12.5, color: color, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

/// الفنان الذي يحيي الحفلة — صورته هنا وحدها (الكرت يحمل الاسم فقط، #7).
/// بلا صورة: أيقونة موسيقى بديلة، لا مربع فارغ.
class _ArtistTile extends StatelessWidget {
  const _ArtistTile({required this.name, this.imageUrl});

  final String name;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final hasImage = imageUrl != null && imageUrl!.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: context.c.surfaceSunk,
            backgroundImage: hasImage ? CachedNetworkImageProvider(imageUrl!) : null,
            child: hasImage
                ? null
                : Icon(Icons.music_note_outlined, color: context.c.sky, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'يحيي الحفلة الفنان $name',
              style: TextStyle(fontSize: 14, color: context.c.inkSoft),
            ),
          ),
        ],
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
          Icon(icon, size: 17, color: context.c.sky),
          const SizedBox(width: 9),
          Text(
            '$label: ',
            style: TextStyle(
              color: context.c.inkFaint,
              fontSize: 14,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: context.c.ink,
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
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: context.c.sky,
          child: Icon(
            isPlaying ? Icons.pause : Icons.play_arrow,
            color: context.c.onSky,
          ),
        ),
        title: Text(
          title,
          style: TextStyle(fontSize: 14.5, color: context.c.ink),
        ),
        subtitle: Text(
          isPlaying ? 'قيد التشغيل…' : 'اضغط للاستماع',
          style: TextStyle(fontSize: 12, color: context.c.inkFaint),
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
          color: context.c.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.c.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 19)),
            const SizedBox(width: 7),
            Text(
              '$label $count',
              style: TextStyle(
                fontSize: 13,
                color: context.c.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

