import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/negev_api.dart';
import '../main.dart';
import '../models/event.dart';
import '../state/share_event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/auth_action_button.dart';
import '../widgets/event_card.dart';
import 'add_event_screen.dart';
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
///
/// الشاشة المدفوعة صارت غلافاً رفيعاً حول [MyEventsSection]: الجسم نفسه
/// يُستعمل مضمَّناً في «مناسباتي» الوجهة الرابعة في الشريط السفلي
/// (`my_hub_screen.dart`)، فلا نسخة ثانية من القائمة ولا من منطق جلبها.
class MyEventsScreen extends StatelessWidget {
  const MyEventsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('مناسباتي'),
        actions: const [AuthActionButton()],
      ),
      body: const MyEventsSection(),
    );
  }
}

/// قائمة «مناسباتي» وحدها — الشاشة المدفوعة تعرضها بحجمها الكامل، و«مناسباتي»
/// تعرضها مضمَّنةً تحت عنوانها ثم «قائمتي» تحتها.
class MyEventsSection extends StatefulWidget {
  const MyEventsSection({
    super.key,
    this.embedded = false,
    this.isActive = true,
  });

  /// هل تُعرض داخل قائمة أبٍ تُمرَّر هي نفسها؟ المضمَّن لا يُمرَّر بنفسه (لا
  /// `ListView` متداخل بلا نهاية)، وحالته الفارغة تدعو إلى النشر بدل الرسالة
  /// وحدها — فهو المدخل الوحيد للنشر هناك.
  final bool embedded;

  /// هل القسم مرئيّ الآن؟ يُمرَّر `false` من أبٍ يضمّه مخفيّاً خلف تبويب آخر
  /// (`IndexedStack` في الهيكل) كي لا يجلب قبل ظهوره — وإلا بقي جلبه الأوّل
  /// من الإقلاع قديماً لا يتجدّد عند فتح الوجهة.
  final bool isActive;

  @override
  State<MyEventsSection> createState() => MyEventsSectionState();
}

class MyEventsSectionState extends State<MyEventsSection> {
  Future<List<Event>>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // أوّل جلب حين تكون مرئيّة وحدها: المخفيّة خلف تبويب آخر لا تطلب من
    // الإقلاع، فلا يعود جلبها قديماً بعد نشر مناسبة في الأثناء.
    if (_future == null && widget.isActive) {
      _future = AppServices.of(context).api.myEvents();
    }
  }

  @override
  void didUpdateWidget(covariant MyEventsSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    // عادت مرئيّة بعد أن كانت خلف تبويب آخر: جلب جديد كي تظهر ما نُشر في
    // الأثناء («أضف عرسك» من وجهة أخرى) بلا سحبٍ للتحديث.
    if (widget.isActive && !oldWidget.isActive) reload();
  }

  /// جلب جديد — يُستدعى من هذه الشاشة، ومن أبٍ يضمّ القسم (سحب «مناسباتي»
  /// للتحديث) عبر مفتاح على الحالة.
  ///
  /// جسم كتلة لا سهم، للسبب المكتوب في `_InvitesDialogState._reload` أدناه:
  /// `setState(() => _future = …)` يجعل التعبير يعيد `Future` وFlutter يرفضه.
  Future<void> reload() {
    final f = AppServices.of(context).api.myEvents();
    setState(() {
      _future = f;
    });
    // الفشل لا يصعد إلى مَن ينتظر السحب: الحالة تُعرض في `AsyncView` وحدها.
    return f.then((_) {}, onError: (_) {});
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

  /// «الدعوات» (تذكرة #183) — إنشاء دعوة لكل ضيف ومشاركة روابطها، بنفس شرط
  /// رسم «مين جاي» لأن الضيف لا يجيب إلا على نوع تقبل الحضور.
  Future<void> _openInvites(Event event) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _InvitesDialog(
        api: AppServices.of(context).api,
        eventId: event.id,
        title: event.displayTitle,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // مخفيّة ولم تُجلب بعد: لا شيء — لا مؤشّر ولا حالة «لا بيانات»، فالوجهة
    // ليست معروضة و`didUpdateWidget` أعلاه هو ما يجلب حين تعود.
    if (!widget.isActive && _future == null) return const SizedBox.shrink();

    return FutureBuilder<List<Event>>(
      future: _future,
      builder: (context, snapshot) {
        return AsyncView<List<Event>>(
          snapshot: snapshot,
          onRetry: reload,
          // المضمَّن لا يُفرغ: فراغه دعوةٌ إلى النشر داخل `builder` أدناه.
          isEmpty: (data) => !widget.embedded && data.isEmpty,
          emptyMessage: 'لم تنشر أي مناسبة بعد',
          builder: (events) {
            if (events.isEmpty) {
              // «مناسباتي» بلا منشورات: دعوة مباشرة إلى «أضف عرسك» بدل رسالة
              // فراغ تُترك بلا مخرج — وهي المدخل للنشر في هذه الوجهة.
              return Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 26,
                    vertical: 40,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'ما نشرت مناسبات بعد',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 15,
                          color: context.c.inkFaint,
                          height: 1.6,
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        key: const Key('my_hub_add_event'),
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const AddEventScreen(),
                            ),
                          );
                        },
                        icon: const Icon(Icons.add),
                        label: const Text('أضف عرسك'),
                      ),
                    ],
                  ),
                ),
              );
            }

            return ListView.builder(
              shrinkWrap: widget.embedded,
              physics: widget.embedded
                  ? const NeverScrollableScrollPhysics()
                  : null,
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
                        reload();
                      },
                    ),
                    // «مين جاي» (تذكرة #168) — صاحب المناسبة وحده، ولهذا الشاشة
                    // مناسباته وحدها. الأسماء والعدد والمصدر من `GET .../rsvps`،
                    // بلا هاتف: الخادم لا يرسله في أي ردّ. ومعها «الدعوات»
                    // (تذكرة #183) بنفس الشرط: الضيف لا يجيب إلا على نوع تقبل
                    // الحضور، فالشرط نفسه يفتح البابين.
                    if (event.occasionType?.rsvpEnabled == true &&
                        event.occasionType?.isSolemn != true)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextButton.icon(
                                onPressed: () => _openRsvpList(event),
                                icon: const Icon(Icons.how_to_reg_outlined, size: 18),
                                label: const Text('مين جاي'),
                              ),
                            ),
                            Expanded(
                              child: TextButton.icon(
                                onPressed: () => _openInvites(event),
                                icon: const Icon(Icons.mail_outline, size: 18),
                                label: const Text('الدعوات'),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            );
          },
        );
      },
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
                            [
                              '${rsvpSourceLabels[rsvp.source] ?? rsvp.source} — '
                                  'العدد: ${rsvp.partySize}',
                              // سطر الدعوة (تذكرة #183): الاسم الذي كتبه صاحب
                              // المناسبة، وهل فُتحت الدعوة — أو لا سطر لجواب عادي.
                              if (rsvp.invite != null)
                                'دعوة: ${rsvp.invite!.name} — '
                                    '${rsvp.invite!.isOpened ? 'فُتحت' : 'لم تُفتح'}',
                            ].join('\n'),
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

/// «الدعوات» (تذكرة #183) — صاحب المناسبة يُنشئ لكل ضيف دعوةً برابط
/// `/e/:id/i/<token>` يقول «أهلاً <الاسم>» وفيه نموذج الحضور باسمه مسبقاً.
///
/// كل شيء من الخادم: الأسماء والروابط المطلقة (`url`) وحالة الفتح (`opened_at`)
/// والجواب. ولا يبني العميل رابطاً بنفسه، ولا يعرف سقف الأسماء — الرفض 400
/// برسالة عربية من الخادم يُعرض كما وصل. والهاتف لا يصل في أي استجابة.
class _InvitesDialog extends StatefulWidget {
  const _InvitesDialog({
    required this.api,
    required this.eventId,
    required this.title,
  });

  final NegevApi api;
  final int eventId;
  final String title;

  @override
  State<_InvitesDialog> createState() => _InvitesDialogState();
}

class _InvitesDialogState extends State<_InvitesDialog> {
  late Future<EventInviteList> _future;
  final TextEditingController _namesController = TextEditingController();
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    _future = widget.api.eventInvites(widget.eventId);
  }

  @override
  void dispose() {
    _namesController.dispose();
    super.dispose();
  }

  void _reload() {
    // جسم كتلة لا سهم: `setState(() => _future = …)` يجعل التعبير يعيد `Future`،
    // وFlutter يرفض ذلك في وضع التنقيح ويرمي **قبل** `markNeedsBuild` — فلا
    // تُعاد القائمة بعد الحذف أبداً. الكتلة تعيد `null` فيُعلَّم العنصر للبناء.
    setState(() {
      _future = widget.api.eventInvites(widget.eventId);
    });
  }

  /// اسم في كل سطر، والسطور الفارغة تُسقَط — كصندوق الويب نفسه.
  List<String> _typedNames() => _namesController.text
      .split('\n')
      .map((line) => line.trim())
      .where((line) => line.isNotEmpty)
      .toList();

  Future<void> _create() async {
    final names = _typedNames();
    if (names.isEmpty) {
      showMessage(context, 'اكتب اسماً واحداً على الأقل — اسم في كل سطر',
          isError: true);
      return;
    }

    setState(() => _creating = true);
    try {
      final created = await widget.api.createEventInvites(widget.eventId, names);
      if (!mounted) return;
      _namesController.clear();
      showMessage(
        context,
        created.length == 1 ? 'تم إنشاء الدعوة' : 'تم إنشاء ${created.length} دعوات',
      );
      _reload();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _delete(EventInvite invite) async {
    try {
      await widget.api.deleteEventInvite(widget.eventId, invite.id);
      if (!mounted) return;
      showMessage(context, 'تم حذف الدعوة');
      _reload();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  Future<void> _copy(EventInvite invite) async {
    await Clipboard.setData(ClipboardData(text: invite.url));
    if (!mounted) return;
    showMessage(context, 'تم نسخ رابط الدعوة');
  }

  Future<void> _share(EventInvite invite) async {
    await shareViaSystem(context, 'أهلاً ${invite.name}\n${invite.url}');
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('الدعوات الشخصية'),
          const SizedBox(height: 4),
          Text(
            widget.title,
            style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
          ),
        ],
      ),
      content: SizedBox(
        width: 340,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _namesController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'أسماء الضيوف — اسم في كل سطر',
                isDense: true,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _creating ? null : _create,
                icon: const Icon(Icons.add, size: 18),
                label: Text(_creating ? 'جارٍ الإنشاء…' : 'أنشئ الدعوات'),
              ),
            ),
            const SizedBox(height: 12),
            Flexible(child: _invitesList()),
          ],
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

  Widget _invitesList() {
    return FutureBuilder<EventInviteList>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 18),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) {
          return Text(
            '${snapshot.error}',
            style: TextStyle(color: context.c.danger, fontSize: 13),
          );
        }

        final invites = snapshot.data?.invites ?? const <EventInvite>[];
        if (invites.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'لا دعوات بعد — اكتب الأسماء أعلاه ثم اضغط «أنشئ الدعوات»',
              style: TextStyle(color: context.c.inkFaint),
            ),
          );
        }

        return ListView.separated(
          shrinkWrap: true,
          itemCount: invites.length,
          separatorBuilder: (_, _) => Divider(color: context.c.lineSoft),
          itemBuilder: (context, index) {
            final invite = invites[index];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  invite.name,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
                Text(
                  invite.isOpened ? 'فُتحت' : 'لم تُفتح',
                  style: TextStyle(fontSize: 12, color: context.c.inkFaint),
                ),
                if (invite.rsvp != null)
                  Text(
                    'الجواب: ${invite.rsvp!.isGoing ? 'جاي' : 'مش جاي'} — '
                    'العدد ${invite.rsvp!.partySize}',
                    style: TextStyle(fontSize: 12, color: context.c.inkSoft),
                  ),
                Text(
                  invite.url,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 11, color: context.c.inkFaint),
                ),
                Wrap(
                  children: [
                    TextButton.icon(
                      onPressed: () => _copy(invite),
                      icon: const Icon(Icons.copy_all_outlined, size: 16),
                      label: const Text('نسخ'),
                    ),
                    TextButton.icon(
                      onPressed: () => _share(invite),
                      icon: const Icon(Icons.share_outlined, size: 16),
                      label: const Text('مشاركة'),
                    ),
                    TextButton.icon(
                      onPressed: () => _delete(invite),
                      icon: const Icon(Icons.delete_outline, size: 16),
                      label: const Text('حذف'),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );
  }
}
