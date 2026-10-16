import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../main.dart';
import '../models/event.dart';
import '../models/my_list.dart';
import '../state/auth_store.dart';
import '../theme.dart';
import '../widgets/async_view.dart' show ErrorView, showMessage;
import '../widgets/auth_action_button.dart';
import '../widgets/congratulations.dart' show openSignInGate;
import '../widgets/event_card.dart' show arabicEventDate, occasionTypeColor;
import 'event_details_screen.dart';
import 'nokoot_screen.dart' show showAddNokootSheet;

/// ترتيب أقسام «قائمتي» — الدلاء الستّ التي يعيدها `myListBucket` على الخادم
/// حصراً، مرتّبة كما يرتّبها هو: القادم أولاً ثم المنتهي حديثاً.
const List<String> _bucketOrder = [
  'now',
  'tomorrow',
  'this_week',
  'later',
  'ended_recent',
  'ended',
];

const Map<String, String> _bucketLabels = {
  'now': 'اليوم',
  'tomorrow': 'غداً',
  'this_week': 'هذا الأسبوع',
  'later': 'لاحقاً',
  'ended_recent': 'انتهت خلال الأسبوع الأخير',
  'ended': 'انتهت سابقاً',
};

/// القسم المنطوي افتراضياً — وحده: المنتهي القديم تاريخ يُطوى، والجارِي يُفتَح.
const String _collapsedBucket = 'ended';

/// الرقاقات الثلاث — تصفية على مجموعة دلاء، لا على حقل.
enum _MyListFilter { all, upcoming, ended }

/// «قائمتي» — الوجه الظاهر لـ«ذكّرني»: كل مناسبة معتمدة يحفظها المستخدم،
/// القادم منها أوّلاً ثمّ ما انتهى حديثاً، بترتيب الخادم كما وصل.
///
/// الشاشة لا تعيد ترتيباً ولا اشتقاق تاريخ: `bucket` و`span_*` من الخادم،
/// والفلترة هنا **على مجموعة الدلاء وحدها**.
class MyListScreen extends StatefulWidget {
  const MyListScreen({super.key, this.isActive = true});

  /// هل تبويب «قائمتي» هو المختار الآن؟ `IndexedStack` في `HomeShell` يُبقي
  /// الشاشة حيّة خلف التبويبات الأخرى، فلا بدّ أن تُخبَر صراحةً كي تجلب
  /// الجديد عند عودتها.
  final bool isActive;

  @override
  State<MyListScreen> createState() => _MyListScreenState();
}

class _MyListScreenState extends State<MyListScreen> {
  /// آخر استجابة ناجحة — لا تُمسَح عند إعادة الجلب، فيبقى الصفّ والموضع
  /// (لا قفز إلى أعلى القائمة) أثناء التحديث.
  MyList? _data;
  Object? _error;
  bool _loading = true;

  _MyListFilter _filter = _MyListFilter.all;

  /// «انتهت سابقاً» مطويّ افتراضياً — يُفتح بالضغط على عنوانه.
  bool _endedExpanded = false;

  AuthStore? _auth;
  ValueNotifier<int>? _revision;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppServices.of(context);
    if (_auth == null) {
      _auth = services.auth;
      _auth!.addListener(_handleAuthChange);
      _revision = services.myListRevision;
      _revision!.addListener(_handleRevision);
    }
    if (_data == null && _loading && _auth!.isSignedIn) _load();
  }

  @override
  void didUpdateWidget(covariant MyListScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // صارت مرئيّة بعد أن كانت خلف تبويب آخر — الجديد يصل الآن.
    if (widget.isActive && !oldWidget.isActive) _load();
  }

  @override
  void dispose() {
    _auth?.removeListener(_handleAuthChange);
    _revision?.removeListener(_handleRevision);
    super.dispose();
  }

  /// تسجيل دخول أو خروج — الشاشة كانت قد رسمت حالة أخرى.
  void _handleAuthChange() {
    if (!mounted) return;
    final services = AppServices.of(context);
    if (services.auth.isSignedIn) {
      _load();
    } else {
      services.myListNowCount.value = 0;
      setState(() {
        _data = null;
        _error = null;
        _loading = true;
        _filter = _MyListFilter.all;
        _endedExpanded = false;
      });
    }
  }

  /// تبديل تذكير وقع في شاشة أخرى («المناسبات» أو صفحة المناسبة).
  void _handleRevision() {
    if (mounted && widget.isActive) _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await services.api.myList();
      if (!mounted) return;
      services.myListNowCount.value = data.nowCount;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
      // قائمة معروضة أصلاً تفشل في التحديث: تبقى أمام المستخدم، والخبر يُقال
      // برسالة. أمّا الفشل الأول فله حالته الخاصة أسفل.
      if (_data != null) {
        showMessage(context, 'تعذّر تحميل قائمتك — تحقّق من الاتصال', isError: true);
      }
    }
  }

  Future<void> _toggleNotify(MyListEntry entry) async {
    final services = AppServices.of(context);
    final next = !entry.notify;
    try {
      await services.api.setReminderNotify(entry.event.id, next);
      try {
        // الكتم يغيّر خطّة الخادم، فالمنبّهات المحلية تتبعها. فشل المزامنة
        // صامت: الكتم وقع فعلاً على الخادم ويُصحَّح عند أول فتح تالٍ.
        await services.reminders.syncAll();
      } catch (_) {}
      if (!mounted) return;
      setState(() => _data = _data?.withNotify(entry.event.id, next));
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  /// سحب الصفّ — إزالة من القائمة بلا حذف للمناسبة نفسها. لا إعادة جلب بعد
  /// النجاح: الإزالة المحلية تكفي، والقائمة تصل من الخادم عند أول عودة إليها
  /// أو سحبٍ للتحديث — وهذا أيضاً ما يمنع عودة صفّ أُزيل للتوّ إلى الشجرة.
  Future<void> _remove(MyListEntry entry) async {
    final services = AppServices.of(context);
    final eventId = entry.event.id;

    // إزالة متفائلة فوراً: `Dismissible` لا يجوز أن يبقى في الشجرة بعد طيّه.
    setState(() => _data = _data?.withoutEvent(eventId));

    try {
      await services.api.unremind(eventId);
    } catch (error) {
      if (!mounted) return;
      showMessage(context, '$error', isError: true);
      // الإزالة لم تقع على الخادم — الصفّ يعود من مصدر الحقيقة لا من نسخة
      // محلية، فلا تبقى القائمة تكذب على صاحبها.
      await _load();
      return;
    }

    try {
      // إلغاء المنبّه المحلي فشله لا يعني فشل الإزالة: الصفّ خرج من الخادم
      // فعلاً، والمنبّه المعلَّق يُصحَّح عند أول مزامنة تالية (syncAll).
      await services.reminders.onReminderRemoved(eventId);
    } catch (_) {}

    // التغذية حيّة خلف التبويب ولا ترى جلباً جديداً — تُخبَر بالإزالة فتصحّح
    // كرتها بدل أن تُرسل نداءً معاكساً لمن كبسها لاحقاً.
    services.savedChange.value = (eventId: eventId, saved: false);

    if (!mounted) return;
    showMessage(
      context,
      'أُزيلت من قائمتي',
      action: SnackBarAction(
        label: 'تراجع',
        textColor: context.c.sky,
        onPressed: () => _undoRemove(eventId),
      ),
    );
  }

  /// «تراجع» في رسالة الإزالة — إعادة الصفّ كما كان على الخادم.
  Future<void> _undoRemove(int eventId) async {
    final services = AppServices.of(context);
    try {
      await services.api.remind(eventId);
      try {
        // المنبّه المعلَّق أُلغي بالسحب — يعود فوراً بلا طلب إذن جديد
        // (syncAll لا يسأل، بخلاف onReminderAdded). وفشله صامت: التذكير
        // قائم على الخادم ويُصحَّح عند أول فتح تالٍ.
        await services.reminders.syncAll();
      } catch (_) {}
      services.savedChange.value = (eventId: eventId, saved: true);
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
    if (mounted) await _load();
  }

  Future<void> _addNokoot(MyListEntry entry) async {
    final event = entry.event;
    // اسم المستلم: أوّل أصحاب المناسبة، وإلا `groom_name` للصفوف القديمة.
    final honoree =
        event.honorees.isNotEmpty ? event.honorees.first.name.trim() : '';
    final recipient = honoree.isNotEmpty ? honoree : event.groomName.trim();
    final spanEnd = entry.spanEnd.isEmpty ? event.eventDate : entry.spanEnd;

    final saved = await showAddNokootSheet(
      context,
      recipient: recipient.isEmpty ? null : recipient,
      date: DateTime.tryParse(spanEnd),
      town: event.town,
    );
    if (saved && mounted) showMessage(context, 'تم حفظ القيد في دفتر النقوط');
  }

  Future<void> _openEvent(int eventId) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: eventId)),
    );
    // تحديث في المكان لا إعادة بناء: موضع التمرير يبقى حيث كان.
    if (mounted) await _load();
  }

  Future<void> _confirmClearEnded() async {
    final services = AppServices.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: dialogContext.c.surfaceSunk,
        title: const Text('نظّف المنتهية'),
        content: const Text('حذف كل المناسبات المنتهية من قائمتك؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text('حذف', style: TextStyle(color: dialogContext.c.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      final result = await services.api.clearEndedReminders();
      if (!mounted) return;
      showMessage(context, result.message);
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppServices.of(context).auth;

    return AnimatedBuilder(
      animation: auth,
      builder: (context, _) {
        if (!auth.isSignedIn) return _buildSignInPrompt();
        return Scaffold(
          appBar: AppBar(
            title: const Text('قائمتي'),
            actions: [
              if ((_data?.ended ?? 0) > 0)
                TextButton(
                  onPressed: _confirmClearEnded,
                  child: const Text('نظّف المنتهية'),
                ),
              const AuthActionButton(),
            ],
          ),
          body: _buildBody(),
        );
      },
    );
  }

  Widget _buildBody() {
    final data = _data;
    if (data == null) {
      if (_error != null) {
        return ErrorView(
          message: 'تعذّر تحميل قائمتك — تحقّق من الاتصال',
          onRetry: _load,
        );
      }
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 96),
        children: [
          if (data.underReviewCount > 0)
            _UnderReviewNotice(count: data.underReviewCount),
          _buildChips(data),
          const SizedBox(height: 2),
          ..._buildSections(data),
        ],
      ),
    );
  }

  Widget _buildChips(MyList data) {
    Widget chip(_MyListFilter filter, String label) {
      final selected = _filter == filter;
      return Padding(
        padding: const EdgeInsetsDirectional.only(end: 6),
        child: ChoiceChip(
          label: Text(label),
          selected: selected,
          showCheckmark: false,
          onSelected: (_) => setState(() => _filter = filter),
          backgroundColor: context.c.surface,
          selectedColor: context.c.sky,
          labelStyle: TextStyle(
            fontSize: 12.5,
            color: selected ? context.c.onSky : context.c.inkSoft,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
          ),
          side: BorderSide(color: context.c.line),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
      child: Row(
        children: [
          chip(_MyListFilter.all, 'الكل (${data.all})'),
          chip(_MyListFilter.upcoming, 'القادمة (${data.upcoming})'),
          chip(_MyListFilter.ended, 'انتهت (${data.ended})'),
        ],
      ),
    );
  }

  List<MyListEntry> _visibleEntries(MyList data) {
    return switch (_filter) {
      _MyListFilter.all => data.entries,
      _MyListFilter.upcoming =>
        data.entries.where((entry) => entry.isUpcoming).toList(),
      _MyListFilter.ended =>
        data.entries.where((entry) => entry.isEnded).toList(),
    };
  }

  List<Widget> _buildSections(MyList data) {
    final entries = _visibleEntries(data);
    if (entries.isEmpty) return [_buildEmpty()];

    final grouped = <String, List<MyListEntry>>{};
    for (final entry in entries) {
      grouped.putIfAbsent(entry.bucket, () => []).add(entry);
    }

    final widgets = <Widget>[];
    for (final bucket in _bucketOrder) {
      final rows = grouped[bucket];
      if (rows == null || rows.isEmpty) continue;

      final collapsible = bucket == _collapsedBucket;
      final expanded = !collapsible || _endedExpanded;
      widgets.add(_sectionHeader(
        bucket,
        rows.length,
        collapsible: collapsible,
        expanded: expanded,
      ));
      if (expanded) widgets.addAll(rows.map(_buildRow));
    }

    // شبكة أمان: دلو لا تعرفه هذه القائمة يُعرَض بعنوانه الخام بدل أن يُبتلع
    // صامتاً — «قائمتي» لا تُخفي صفّاً من صاحبها مهما أضاف الخادم من دلاء.
    grouped.forEach((bucket, rows) {
      if (_bucketOrder.contains(bucket)) return;
      widgets.add(_sectionHeader(
        bucket,
        rows.length,
        label: bucket,
        collapsible: false,
        expanded: true,
      ));
      widgets.addAll(rows.map(_buildRow));
    });

    return widgets;
  }

  Widget _sectionHeader(
    String bucket,
    int count, {
    required bool collapsible,
    required bool expanded,
    String? label,
  }) {
    final header = Padding(
      key: Key('my_list_section_$bucket'),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Row(
        children: [
          Flexible(
            child: Text(
              label ?? _bucketLabels[bucket]!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '($count)',
            style: TextStyle(fontSize: 13, color: context.c.inkFaint),
          ),
          const Spacer(),
          if (collapsible)
            Icon(
              expanded ? Icons.expand_less : Icons.expand_more,
              size: 20,
              color: context.c.inkFaint,
            ),
        ],
      ),
    );

    if (!collapsible) return header;
    return InkWell(
      onTap: () => setState(() => _endedExpanded = !_endedExpanded),
      child: header,
    );
  }

  Widget _buildEmpty() {
    final (String message, bool browse) = switch (_filter) {
      _MyListFilter.all => (
          'قائمتك فارغة. اضغط «أضف لقائمتي» على أي مناسبة لتجدها هنا.',
          true,
        ),
      _MyListFilter.upcoming => ('لا مناسبات قادمة في قائمتك', false),
      _MyListFilter.ended => ('لا مناسبات منتهية في قائمتك', false),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 46, horizontal: 26),
      child: Column(
        children: [
          Icon(Icons.bookmark_border, size: 44, color: context.c.inkFaint),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: context.c.inkSoft, height: 1.7),
          ),
          if (browse) ...[
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: AppServices.of(context).openFeed,
              icon: const Icon(Icons.celebration_outlined),
              label: const Text('تصفّح المناسبات'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildRow(MyListEntry entry) {
    final event = entry.event;
    final type = event.occasionType;
    final toneColor = occasionTypeColor(type?.color, cardGold);
    final spanDate = entry.isEnded ? entry.spanEnd : entry.spanStart;
    final dateText =
        arabicEventDate(spanDate.isEmpty ? event.eventDate : spanDate);

    return Dismissible(
      key: Key('my_list_row_${event.id}'),
      // في RTL «من النهاية إلى البداية» سحبٌ يبدأ من الحافة اليسرى — وهو
      // الاتجاه المتوقَّع لإزالة صفّ في واجهة عربية.
      direction: DismissDirection.endToStart,
      background: Container(
        color: context.c.danger,
        alignment: AlignmentDirectional.centerEnd,
        padding: const EdgeInsetsDirectional.only(end: 22),
        child: const Icon(Icons.delete_outline, color: Colors.white),
      ),
      onDismissed: (_) => _remove(entry),
      child: InkWell(
        onTap: () => _openEvent(event.id),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _thumbnail(event),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.cardHeadline,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: context.c.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (type != null)
                          _pill(
                            text: type.name,
                            emoji: type.icon.isEmpty ? null : type.icon,
                            color: toneColor,
                            wash: toneColor.withValues(alpha: 0.15),
                            border: toneColor,
                          ),
                        if (entry.dateChange != null)
                          _dateChangePill(entry.dateChange!),
                        _statusPill(entry),
                      ],
                    ),
                    const SizedBox(height: 6),
                    _metaLine(Icons.event_outlined, dateText, toneColor),
                    _metaLine(
                      Icons.location_on_outlined,
                      event.townDisplay,
                      toneColor,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              _rowAction(entry),
            ],
          ),
        ),
      ),
    );
  }

  Widget _thumbnail(Event event) {
    const double size = 56;
    final url = event.posterUrl?.trim() ?? '';

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: url.isEmpty
          ? _thumbnailFallback(size)
          : CachedNetworkImage(
              imageUrl: url,
              width: size,
              height: size,
              fit: BoxFit.cover,
              memCacheWidth: 240,
              alignment: Alignment.topCenter,
              placeholder: (_, _) => _thumbnailFallback(size),
              errorWidget: (_, _, _) => _thumbnailFallback(size),
            ),
    );
  }

  Widget _thumbnailFallback(double size) {
    return Container(
      width: size,
      height: size,
      color: context.c.surfaceSunk,
      child: Icon(Icons.bookmark_border, color: context.c.inkFaint),
    );
  }

  Widget _metaLine(IconData icon, String text, Color toneColor) {
    if (text.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        children: [
          Icon(icon, size: 14, color: toneColor),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, color: context.c.inkSoft),
            ),
          ),
        ],
      ),
    );
  }

  /// شارة الحالة — الآن أو غداً أو عدد الأيام أو انتهت.
  ///
  /// النوع الحدادي (`solemn`) لا يحملها إطلاقاً: عدّاد الفرح على نعي خطأ،
  /// وهو نفس ما يفعله كرت التغذية (`!isSolemn && countdownText.isNotEmpty`).
  Widget _statusPill(MyListEntry entry) {
    if (entry.event.occasionType?.isSolemn ?? false) {
      return const SizedBox.shrink();
    }

    final (String text, bool upcoming) = switch (entry.bucket) {
      'now' => ('جارية اليوم', true),
      'tomorrow' => ('غداً', true),
      'this_week' || 'later' => ('بعد ${entry.daysUntilStart} أيام', true),
      _ => ('انتهت', false),
    };

    return _pill(
      text: text,
      color: upcoming ? context.c.success : context.c.inkSoft,
      wash: upcoming ? context.c.successWash : context.c.surfaceSunk,
      border: upcoming ? context.c.success : context.c.line,
    );
  }

  /// إعلان تغيّر الموعد بعد الحفظ — الضغط عليه يذكر من ماذا إلى ماذا.
  Widget _dateChangePill(DateChange change) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => showMessage(
        context,
        'تغيّر الموعد من ${arabicEventDate(change.oldValue)} إلى '
        '${arabicEventDate(change.newValue)}',
      ),
      child: _pill(
        text: 'تغيّر الموعد',
        color: context.c.warn,
        wash: context.c.warnWash,
        border: context.c.warn,
      ),
    );
  }

  Widget _pill({
    required String text,
    required Color color,
    required Color wash,
    required Color border,
    String? emoji,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
      decoration: BoxDecoration(
        color: wash,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (emoji != null) ...[
            Text(emoji, style: const TextStyle(fontSize: 11)),
            const SizedBox(width: 3),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  /// إجراء الصفّ: جرس للقادم وحده، و«سجّل نقوطك» للمنتهي وحده.
  Widget _rowAction(MyListEntry entry) {
    if (entry.isEnded) {
      return TextButton(
        onPressed: () => _addNokoot(entry),
        style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
        child: const Text('سجّل نقوطك'),
      );
    }

    return IconButton(
      tooltip: entry.notify ? 'كتم التنبيه' : 'تفعيل التنبيه',
      visualDensity: VisualDensity.compact,
      icon: Icon(
        entry.notify ? Icons.notifications_active : Icons.notifications_off,
      ),
      color: entry.notify ? context.c.sky : context.c.inkFaint,
      onPressed: () => _toggleNotify(entry),
    );
  }

  Widget _buildSignInPrompt() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('قائمتي'),
        actions: const [AuthActionButton()],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(30),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.bookmark_border, size: 48, color: context.c.inkFaint),
              const SizedBox(height: 16),
              Text(
                'قائمتي',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'احفظ المناسبات التي تهمّك أثناء التصفّح، وتابع القادم منها وما انتهى في مكان واحد.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.c.inkSoft, height: 1.6),
              ),
              const SizedBox(height: 22),
              ElevatedButton.icon(
                onPressed: () =>
                    openSignInGate(context, 'سجّل الدخول لعرض قائمتك'),
                icon: const Icon(Icons.login),
                label: const Text('تسجيل الدخول'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// تنبيه المناسبة العائدة إلى المراجعة بعد تعديل — لا تظهر في القائمة
/// (المعتمد وحده يظهر) لكنّها لم تخرج من متابعة صاحبها.
class _UnderReviewNotice extends StatelessWidget {
  const _UnderReviewNotice({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final message = count == 1
        ? 'مناسبة واحدة من قائمتك قيد المراجعة بعد تعديل، وستعود عند اعتمادها'
        : '$count مناسبات من قائمتك قيد المراجعة بعد تعديل، وستعود عند اعتمادها';

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 12, 14, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.c.warnWash,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.c.warn),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.hourglass_top, size: 17, color: context.c.warn),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13,
                color: context.c.warn,
                height: 1.55,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
