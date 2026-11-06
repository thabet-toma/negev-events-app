import 'package:flutter/material.dart';

import '../main.dart';
import '../models/event.dart';
import '../screens/account_screen.dart';
import '../state/rate_us.dart';
import '../theme.dart';
import 'async_view.dart';
import 'rate_us_prompt.dart';

/// حاجز دخول موحّد — نفس النمط المستعمل في شاشة التفاصيل وإضافة مناسبة.
Future<void> openSignInGate(BuildContext context, String message) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetContext) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_outline, size: 40, color: sheetContext.c.inkFaint),
          const SizedBox(height: 14),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15.5,
              color: sheetContext.c.inkSoft,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 18),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.of(sheetContext).pop();
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SignInScreen()),
              );
            },
            icon: const Icon(Icons.login),
            label: const Text('تسجيل الدخول'),
          ),
        ],
      ),
    ),
  );
}

/// ورقة كتابة تبريكة/تعزية — نفس منطق شاشة التفاصيل، مستخرَج هنا ليعاد
/// استعماله من ورقة عرض الرسائل التي يفتحها الكرت مباشرةً.
///
/// `presetMessage` (تذكرة #170): نصّ رسالة جاهزة اختاره المستخدم من ورقة
/// «اختر رسالة». يُكتب في الحقل ويبقى **قابلاً للتعديل** — الورقة تقترح،
/// والإرسال زرّ المستخدم نفسه.
Future<void> openCongratulateSheet(
  BuildContext context, {
  required int eventId,
  required String label,
  required VoidCallback onSuccess,
  String? presetMessage,
}) async {
  final auth = AppServices.of(context).auth;
  if (!auth.isSignedIn) {
    await openSignInGate(context, 'سجّل الدخول لإرسال $label');
    return;
  }

  final messageController = TextEditingController(text: presetMessage ?? '');
  var sending = false;

  /// أُرسلت التبريكة فعلاً؟ الحوار بعد إغلاق الورقة لا فوقها.
  var sent = false;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
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
      child: StatefulBuilder(
        builder: (sbContext, setSheetState) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'أضف $label',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: sbContext.c.ink,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: messageController,
                maxLines: 3,
                decoration: InputDecoration(labelText: label),
              ),
              const SizedBox(height: 18),
              ElevatedButton(
                onPressed: sending
                    ? null
                    : () async {
                        final message = messageController.text.trim();
                        if (message.isEmpty) {
                          showMessage(sbContext, '$label مطلوبة', isError: true);
                          return;
                        }

                        setSheetState(() => sending = true);
                        try {
                          // نجاح التبريكة وحده لحظة إيجابية (تذكرة #163):
                          // الفشل يرمي قبل العدّ.
                          await runPositiveMoment(
                            () => AppServices.of(sbContext)
                                .api
                                .congratulate(eventId, message: message),
                          );
                          if (sheetContext.mounted) {
                            Navigator.of(sheetContext).pop();
                          }
                          onSuccess();
                          sent = true;
                        } catch (error) {
                          if (sbContext.mounted) {
                            showMessage(sbContext, '$error', isError: true);
                          }
                        } finally {
                          setSheetState(() => sending = false);
                        }
                      },
                child: Text(sending ? 'جارٍ الإرسال…' : 'إرسال $label'),
              ),
            ],
          );
        },
      ),
    ),
  );

  messageController.dispose();

  // الورقة أُغلقت الآن، فالحوار لا يفتح فوق حقلٍ اختفى — ولا يفتح أصلاً
  // إن لم تُرسل التبريكة.
  if (sent && context.mounted) await maybeShowRateUsPrompt(context);
}

/// ورقة «اختر رسالة» (تذكرة #170، والقصة ٥٧): «بارك»/«عزّي» في الكرت يفتحها،
/// وتعرض رسائل نوع المناسبة الجاهزة كما يرسلها الخادم — **النشِطة وحدها**،
/// فلا نصّ تهنئة مكتوب في التطبيق. اختيار رسالة يفتح ورقة التبريك القائمة
/// (`openCongratulateSheet`) بنصّها في الحقل، فيبقى للمستخدم أن يعدّله أو يكتب
/// غيره من الحقل نفسه.
Future<void> openMessageSheet(
  BuildContext context, {
  required int eventId,
  required String label,
  required List<OccasionMessage> messages,
  required VoidCallback onSuccess,
}) async {
  final auth = AppServices.of(context).auth;
  if (!auth.isSignedIn) {
    await openSignInGate(context, 'سجّل الدخول لإرسال $label');
    return;
  }

  final picked = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'اختر رسالة',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: sheetContext.c.ink,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 14),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: messages.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (itemContext, index) {
                  final message = messages[index];
                  return Material(
                    color: itemContext.c.surface,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () => Navigator.of(sheetContext).pop(message.body),
                      child: Container(
                        padding: const EdgeInsets.all(13),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: itemContext.c.line),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.chat_bubble_outline,
                              size: 16,
                              color: itemContext.c.sky,
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Text(
                                message.body,
                                style: TextStyle(
                                  fontSize: 14,
                                  height: 1.6,
                                  color: itemContext.c.ink,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 14),
            // «حرية الكتابة» باقية باباً صريحاً — الورقة لا تحبس المستخدم في
            // قائمة الرسائل.
            OutlinedButton(
              onPressed: () => Navigator.of(sheetContext).pop(''),
              child: const Text('اكتب رسالتك بنفسك'),
            ),
          ],
        ),
      ),
    ),
  );

  if (picked == null || !context.mounted) return;
  await openCongratulateSheet(
    context,
    eventId: eventId,
    label: label,
    onSuccess: onSuccess,
    presetMessage: picked.isEmpty ? null : picked,
  );
}

/// بطاقة رسالة واحدة — مشتركة بين شاشة التفاصيل وورقة عرض الرسائل السريعة.
/// `onReport == null` يخفي زرّ الإبلاغ (يُستعمل في طابور المراجعة مثلاً).
class CongratulationTile extends StatelessWidget {
  const CongratulationTile({super.key, required this.comment, this.onReport});

  final Congratulation comment;
  final VoidCallback? onReport;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.person, size: 15, color: context.c.sky),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  comment.senderName,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                    fontSize: 14,
                  ),
                ),
              ),
              if (comment.badgeTitle != null && comment.badgeTitle!.isNotEmpty) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: context.c.skyWash,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    comment.badgeTitle!,
                    style: TextStyle(fontSize: 10.5, color: context.c.skyDeep),
                  ),
                ),
              ],
              if (comment.isPending) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: context.c.inkFaint.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'قيد المراجعة',
                    style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
                  ),
                ),
              ],
              if (onReport != null)
                IconButton(
                  icon: Icon(Icons.flag_outlined, size: 16, color: context.c.inkFaint),
                  tooltip: 'إبلاغ',
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: onReport,
                ),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            comment.message,
            style: TextStyle(color: context.c.inkSoft, fontSize: 14, height: 1.5),
          ),
        ],
      ),
    );
  }
}

/// ورقة سفلية تعرض رسائل مناسبة وتتيح كتابة واحدة جديدة — هذا ما يفتحه
/// الضغط على عدّاد التبريكات في الكرت مباشرةً (لا شاشة التفاصيل).
Future<void> showCongratulationsListSheet(
  BuildContext context, {
  required int eventId,
  required VoidCallback onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _CongratulationsListSheetBody(eventId: eventId, onChanged: onChanged),
  );
}

class _CongratulationsListSheetBody extends StatefulWidget {
  const _CongratulationsListSheetBody({required this.eventId, required this.onChanged});

  final int eventId;
  final VoidCallback onChanged;

  @override
  State<_CongratulationsListSheetBody> createState() =>
      _CongratulationsListSheetBodyState();
}

class _CongratulationsListSheetBodyState extends State<_CongratulationsListSheetBody> {
  Future<Event>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= AppServices.of(context).api.eventDetails(widget.eventId);
  }

  void _refresh() {
    if (!mounted) return;
    setState(() => _future = AppServices.of(context).api.eventDetails(widget.eventId));
    widget.onChanged();
  }

  Future<void> _report(int commentId) async {
    try {
      await AppServices.of(context).api.reportCongratulation(widget.eventId, commentId);
      if (mounted) showMessage(context, 'تم إرسال البلاغ، شكراً لك');
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: FutureBuilder<Event>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 160,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError || snapshot.data == null) {
            return SizedBox(
              height: 160,
              child: ErrorView(message: '${snapshot.error}', onRetry: _refresh),
            );
          }

          final event = snapshot.data!;
          final label = event.occasionType?.congratulationsLabel ?? 'تبريكات';

          return ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                if (event.congratulations.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Text(
                      'كن أول من يضيف $label',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.c.inkFaint),
                    ),
                  )
                else
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: event.congratulations
                          .map((comment) => CongratulationTile(
                                comment: comment,
                                onReport: () => _report(comment.id),
                              ))
                          .toList(),
                    ),
                  ),
                const SizedBox(height: 10),
                ElevatedButton.icon(
                  onPressed: () => openCongratulateSheet(
                    context,
                    eventId: widget.eventId,
                    label: label,
                    onSuccess: _refresh,
                  ),
                  icon: const Icon(Icons.add_comment_outlined),
                  label: Text('أضف $label'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// طابور مراجعة رسائل مناسبة — للمالك أو الإدارة فقط. الخادم يعيد 403 لغيرهما،
/// والمُستدعي (شاشة التفاصيل) هو من يقرّر إظهار مدخل هذه الورقة أصلاً.
Future<void> showModerationQueueSheet(
  BuildContext context, {
  required int eventId,
  required VoidCallback onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _ModerationQueueSheetBody(eventId: eventId, onChanged: onChanged),
  );
}

class _ModerationQueueSheetBody extends StatefulWidget {
  const _ModerationQueueSheetBody({required this.eventId, required this.onChanged});

  final int eventId;
  final VoidCallback onChanged;

  @override
  State<_ModerationQueueSheetBody> createState() => _ModerationQueueSheetBodyState();
}

class _ModerationQueueSheetBodyState extends State<_ModerationQueueSheetBody> {
  Future<List<Congratulation>>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??=
        AppServices.of(context).api.moderationQueue(widget.eventId, status: 'pending');
  }

  void _refresh() {
    if (!mounted) return;
    setState(() {
      _future =
          AppServices.of(context).api.moderationQueue(widget.eventId, status: 'pending');
    });
    widget.onChanged();
  }

  Future<void> _moderate(int congratulationId, bool approve) async {
    try {
      await AppServices.of(context)
          .api
          .moderateCongratulation(widget.eventId, congratulationId, approve: approve);
      _refresh();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  Future<void> _delete(int congratulationId) async {
    try {
      await AppServices.of(context).api.deleteCongratulation(widget.eventId, congratulationId);
      _refresh();
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: FutureBuilder<List<Congratulation>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 160,
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final queue = snapshot.data ?? const <Congratulation>[];

          return ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'طابور المراجعة',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                if (queue.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Text(
                      'لا توجد رسائل قيد المراجعة',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.c.inkFaint),
                    ),
                  )
                else
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: queue.length,
                      itemBuilder: (context, index) {
                        final comment = queue[index];
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                            color: context.c.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: context.c.line),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                comment.senderName,
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: context.c.ink,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                comment.message,
                                style: TextStyle(color: context.c.inkSoft),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: () => _moderate(comment.id, true),
                                      child: const Text('قبول'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: () => _moderate(comment.id, false),
                                      child: const Text('رفض'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline),
                                    tooltip: 'حذف',
                                    onPressed: () => _delete(comment.id),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
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
