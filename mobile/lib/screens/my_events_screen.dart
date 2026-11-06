import 'package:flutter/material.dart';

import '../api/negev_api.dart';
import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/auth_action_button.dart';
import '../widgets/event_card.dart';
import 'edit_event_screen.dart';

/// تسمية مصدر الجواب في «مين جاي» — القيم من الخادم كما هي (`event_rsvps.source`).
const Map<String, String> rsvpSourceLabels = {
  'account': 'حساب',
  'share_page': 'رابط المشاركة',
};

/// التسمية العربية لحالة مناسبة — نفس القيم الثلاث في `events.status`
/// (`pending`/`approved`/`rejected`) على الخادم، بلا افتراض رابع.
String eventStatusLabel(String? status) {
  switch (status) {
    case 'approved':
      return 'منشورة';
    case 'rejected':
      return 'مرفوضة';
    case 'pending':
      return 'قيد المراجعة';
    default:
      return status ?? '';
  }
}

Color eventStatusColor(BuildContext context, String? status) {
  switch (status) {
    case 'approved':
      return context.c.success;
    case 'rejected':
      return context.c.danger;
    default:
      return context.c.warn;
  }
}

Color eventStatusWash(BuildContext context, String? status) {
  switch (status) {
    case 'approved':
      return context.c.successWash;
    case 'rejected':
      return context.c.dangerWash;
    default:
      return context.c.warnWash;
  }
}

/// كل ما نشره المستخدم الحالي — بكل الحالات وبلا حدّ «القادم فقط»: مناسبة
/// قيد المراجعة يجب أن تبقى ظاهرة هنا بوضوح، ومناسبة منتهية تبقى في تاريخه.
class MyEventsScreen extends StatefulWidget {
  const MyEventsScreen({super.key});

  @override
  State<MyEventsScreen> createState() => _MyEventsScreenState();
}

class _MyEventsScreenState extends State<MyEventsScreen> {
  Future<List<Event>>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= AppServices.of(context).api.myEvents();
  }

  void _reload() {
    setState(() => _future = AppServices.of(context).api.myEvents());
  }

  /// «مين جاي» — نصيب صاحب المناسبة وحده؛ الخادم يردّ 404 لكل غيره، فلا حاجة
  /// إلى استنتاج ملكية في العميل (هنا المناسبات كلها ملك المستخدم أصلاً).
  /// والزرّ لا يُرسم لنوع بلا `rsvp_enabled` ولا لنغمة وقورة.
  Future<void> _openRsvpList(Event event) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _RsvpListDialog(
        api: AppServices.of(context).api,
        eventId: event.id,
        title: event.displayTitle,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('مناسباتي'),
        actions: const [AuthActionButton()],
      ),
      body: FutureBuilder<List<Event>>(
        future: _future,
        builder: (context, snapshot) {
          return AsyncView<List<Event>>(
            snapshot: snapshot,
            onRetry: _reload,
            isEmpty: (data) => data.isEmpty,
            emptyMessage: 'لم تنشر أي مناسبة بعد',
            builder: (events) => ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: events.length,
              itemBuilder: (context, index) {
                final event = events[index];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 4),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: eventStatusWash(context, event.status),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            eventStatusLabel(event.status),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: eventStatusColor(context, event.status),
                            ),
                          ),
                        ),
                      ),
                    ),
                    EventCard(
                      event: event,
                      onTap: () async {
                        // نعيد التحميل دائماً بعد العودة — شاشة التعديل لا
                        // تُغلَق تلقائياً بعد الحفظ (قد يعدّل المستخدم أكثر
                        // من مرة قبل الرجوع)، فالحالة الجديدة تصل هنا فقط
                        // بجلب جديد، لا بقيمة إرجاع من الشاشة.
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => EditEventScreen(event: event),
                          ),
                        );
                        _reload();
                      },
                    ),
                    // «مين جاي» (تذكرة #168) — صاحب المناسبة وحده، ولهذا الشاشة
                    // مناسباته وحدها. الأسماء والعدد والمصدر من `GET .../rsvps`،
                    // بلا هاتف: الخادم لا يرسله في أي ردّ.
                    if (event.occasionType?.rsvpEnabled == true &&
                        event.occasionType?.isSolemn != true)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
                        child: TextButton.icon(
                          onPressed: () => _openRsvpList(event),
                          icon: const Icon(Icons.how_to_reg_outlined, size: 18),
                          label: const Text('مين جاي'),
                        ),
                      ),
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }
}

/// «مين جاي» (تذكرة #168) — قائمة أجوبة الحضور لصاحب المناسبة، بأسمائها وعددها
/// وجوابها ومصدرها ومجاميعها. **لا هاتف**: الخادم لا ينتقي `guest_phone` في أي
/// استعلام، فلا حقل في النموذج يمكن أن يُعرض يوماً.
///
/// الشكل والأسماء كما يرسلها `GET /api/events/:id/rsvps`؛ والرفض (404 لغيره) لا
/// يُترجَم إلى «لا أجوبة» بل إلى رسالة الخادم العربية كما وصلت.
class _RsvpListDialog extends StatefulWidget {
  const _RsvpListDialog({
    required this.api,
    required this.eventId,
    required this.title,
  });

  final NegevApi api;
  final int eventId;
  final String title;

  @override
  State<_RsvpListDialog> createState() => _RsvpListDialogState();
}

class _RsvpListDialogState extends State<_RsvpListDialog> {
  late Future<EventRsvpList> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.eventRsvps(widget.eventId);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('مين جاي'),
          const SizedBox(height: 4),
          Text(
            widget.title,
            style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
          ),
        ],
      ),
      content: SizedBox(
        width: 340,
        child: FutureBuilder<EventRsvpList>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snapshot.hasError) {
              return Text(
                '${snapshot.error}',
                style: TextStyle(color: context.c.danger, fontSize: 13),
              );
            }

            final data = snapshot.data;
            final rsvps = data?.rsvps ?? const <EventRsvpEntry>[];
            final totals = data?.totals;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (totals != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      'جايين: ${totals.goingCount} — أجوبة «جاي»: ${totals.goingRows} — '
                      'أجوبة «مش جاي»: ${totals.notGoingRows}',
                      style: TextStyle(fontSize: 12.5, color: context.c.inkSoft),
                    ),
                  ),
                if (rsvps.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Text(
                      'لا أجوبة حضور بعد',
                      style: TextStyle(color: context.c.inkFaint),
                    ),
                  )
                else
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: rsvps.length,
                      separatorBuilder: (_, _) => Divider(color: context.c.lineSoft),
                      itemBuilder: (context, index) {
                        final rsvp = rsvps[index];
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            rsvp.name,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: context.c.ink,
                            ),
                          ),
                          subtitle: Text(
                            '${rsvpSourceLabels[rsvp.source] ?? rsvp.source} — '
                            'العدد: ${rsvp.partySize}',
                            style: TextStyle(
                              fontSize: 12,
                              color: context.c.inkFaint,
                            ),
                          ),
                          trailing: Text(
                            rsvp.isGoing ? 'جاي' : 'مش جاي',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: rsvp.isGoing ? context.c.success : context.c.warn,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('إغلاق'),
        ),
      ],
    );
  }
}
