import 'dart:async';

import 'package:flutter/material.dart';

import '../api/negev_api.dart' show Village;
import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../models/notification.dart' as notif;
import '../theme.dart';
import '../widgets/async_view.dart' show showMessage;
import '../widgets/congratulations.dart';
import '../widgets/event_card.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/motion.dart';
import 'event_details_screen.dart';
import 'story_viewer_screen.dart';

/// الشاشة الرئيسية: القصص + بحث + فلترة بلدة ونوع + إعلانات + قائمة المناسبات
/// المرقّمة.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  final _searchController = TextEditingController();

  /// اختيار متعدّد — بلدة أو أكثر، قرية أو أكثر، نوع مناسبة أو أكثر معاً
  /// (#85 خطوة 40-43). قائمة فارغة تعني «كل الأماكن»/«كل الأنواع»، لا فلترة.
  List<String> _selectedTowns = const [];
  List<int> _selectedVillageIds = const [];
  List<int> _selectedOccasionTypeIds = const [];
  String _search = '';
  bool _archive = false;
  Timer? _debounce;

  StreamSubscription<Map<String, dynamic>>? _newEventSub;

  Future<List<Story>>? _stories;
  Future<List<OccasionType>>? _types;
  Future<List<Village>>? _villages;

  /// نُسختان محلّيتان من نتيجة `_types`/`_villages` — تُستعملان لتسمية رقاقة
  /// الفلتر المغلقة («رهط +٢») بلا `FutureBuilder` حول كل رقاقة (#85 خطوة 44).
  List<OccasionType> _typesList = const [];
  List<Village> _villagesList = const [];

  List<Event> _events = const [];
  List<Announcement> _announcements = const [];
  Pagination? _pagination;
  bool _initialLoading = true;
  bool _loadingMore = false;
  Object? _error;
  bool _didInit = false;

  /// معرّفات مناسبات الدفعة الأولى فقط — الظهور المتدرّج للشاشة الأولى وحدها
  /// (٥٣، ٥٤)؛ صفحة تالية أو فلتر جديد أو تحديث لا يعيدان تشغيله.
  Set<int> _entranceEventIds = const {};
  bool _entranceCaptured = false;

  /// يُصعَّد مع كل طلب صفحة أولى جديد — طلب `_loadMore` بدأ قبل تغيير فلتر
  /// يتجاهل نتيجته إن وصلت بعد أن بدأ طلب أحدث (فلتر آخر تغيّر أثناء
  /// انتظاره)، بدل أن يُلحِق صفحة من فلتر قديم بقائمة الفلتر الجديد.
  int _requestGeneration = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _stories ??= AppServices.of(context).api.stories();
    if (_types == null) {
      _types = AppServices.of(context).api.listOccasionTypes();
      _types!.then((list) {
        if (mounted) setState(() => _typesList = list);
      });
    }
    // القرى من الخادم حصراً — لا تُكرَّر في أي عميل (`GET /api/towns`).
    if (_villages == null) {
      _villages = AppServices.of(context).api.listVillages();
      _villages!.then((list) {
        if (mounted) setState(() => _villagesList = list);
      });
    }

    if (!_didInit) {
      _didInit = true;
      _loadFirstPage();
    }

    // مناسبة جديدة نُشرت لحظياً — نُحدّث القائمة من الصفحة الأولى.
    _newEventSub ??=
        AppServices.of(context).realtime.onNewEvent.listen((_) => _loadFirstPage());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _newEventSub?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadFirstPage() async {
    final generation = ++_requestGeneration;
    setState(() {
      _initialLoading = true;
      _error = null;
      // طلب صفحة أولى جديد يُلغي أثر أيّ "عرض المزيد" كان قيد الانتظار لفلتر
      // سابق — نتيجته ستُتجاهَل أصلاً بفحص الجيل أعلاه، فلا يبقى الزرّ معطَّلاً.
      _loadingMore = false;
    });
    try {
      final result = await AppServices.of(context).api.listEvents(
            towns: _selectedTowns,
            villageIds: _selectedVillageIds,
            search: _search,
            occasionTypeIds: _selectedOccasionTypeIds,
            archive: _archive,
            page: 1,
          );
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _events = result.events;
        _pagination = result.pagination;
        _announcements = result.announcements;
        _initialLoading = false;
        // الظهور المتدرّج مرّة واحدة فقط لعمر الشاشة — أوّل تحميل ناجح وحده
        // يملأ هذه المجموعة؛ أي تحديث لاحق (فلتر، سحب للتحديث) يتركها فارغة.
        if (!_entranceCaptured) {
          _entranceCaptured = true;
          _entranceEventIds = result.events.map((e) => e.id).toSet();
        }
      });
    } catch (error) {
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _error = error;
        _initialLoading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final pagination = _pagination;
    if (pagination == null || !pagination.hasMore || _loadingMore) return;

    final generation = _requestGeneration;
    setState(() => _loadingMore = true);
    try {
      final result = await AppServices.of(context).api.listEvents(
            towns: _selectedTowns,
            villageIds: _selectedVillageIds,
            search: _search,
            occasionTypeIds: _selectedOccasionTypeIds,
            archive: _archive,
            page: pagination.page + 1,
          );
      // فلتر تغيّر أثناء الانتظار (فبدأ _loadFirstPage جيلاً جديداً) ⇒ هذه
      // صفحة تابعة لفلتر لم يعد معروضاً، فلا تُلحَق بالقائمة الحالية.
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _events = [..._events, ...result.events];
        _pagination = result.pagination;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted || generation != _requestGeneration) return;
      setState(() => _loadingMore = false);
      showMessage(context, '$error', isError: true);
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _search = value;
      _loadFirstPage();
    });
  }

  /// اسم قرية من مخزَّنها المحلّي — سلسلة فارغة إن لم تُحلّ بعد (تحميل لم يكتمل)
  /// أو حُذفت من الخادم؛ الاستدعاء لا يبني رقاقة على قيمة فارغة بل يتجاهلها.
  String _villageName(int id) {
    for (final village in _villagesList) {
      if (village.id == id) return village.name;
    }
    return '';
  }

  String _occasionTypeName(int id) {
    for (final type in _typesList) {
      if (type.id == id) return type.name;
    }
    return '';
  }

  /// نص رقاقة المكان المغلقة — لا يعود أبداً لـ«كل الأماكن» طالما هناك اختيار
  /// فعلي (#85 FIX 1، story 44).
  String get _placeChipLabel {
    final total = _selectedTowns.length + _selectedVillageIds.length;
    if (total == 0) return 'كل الأماكن';
    final names = <String>[
      ..._selectedTowns,
      ..._selectedVillageIds.map(_villageName).where((n) => n.isNotEmpty),
    ];
    if (names.isEmpty) return total == 1 ? 'مكان واحد محدَّد' : '$total أماكن محدَّدة';
    if (total == 1) return names.first;
    return '${names.first} +${total - 1}';
  }

  String get _kindChipLabel {
    final total = _selectedOccasionTypeIds.length;
    if (total == 0) return 'كل الأنواع';
    final names =
        _selectedOccasionTypeIds.map(_occasionTypeName).where((n) => n.isNotEmpty).toList();
    if (names.isEmpty) return total == 1 ? 'نوع واحد محدَّد' : '$total أنواع محدَّدة';
    if (total == 1) return names.first;
    return '${names.first} +${total - 1}';
  }

  /// وصف مكان الفراغ («لا توجد مناسبات في…») — يذكر الأسماء إن أمكن حلّها،
  /// وإلا العدّة، ولا يعود أبداً لـ«النقب» طالما هناك اختيار فعلي.
  String get _placeDescriptionForEmptyState {
    final total = _selectedTowns.length + _selectedVillageIds.length;
    if (total == 0) return 'منطقة النقب';
    final names = <String>[
      ..._selectedTowns,
      ..._selectedVillageIds.map(_villageName).where((n) => n.isNotEmpty),
    ];
    if (names.isNotEmpty) return names.join('، ');
    return total == 1 ? 'مكان واحد محدَّد' : '$total أماكن محدَّدة';
  }

  Future<void> _openPlaceFilter() async {
    final options = <FilterOption>[
      ...AppConfig.towns.map((t) => FilterOption(kind: 'town', id: t, label: t)),
      ..._villagesList.map((v) => FilterOption(kind: 'village', id: v.id, label: v.name)),
    ];
    final selected = <FilterToken>[
      ..._selectedTowns.map((t) => FilterToken('town', t)),
      ..._selectedVillageIds.map((id) => FilterToken('village', id)),
    ];
    final result = await showMultiSelectFilterSheet(
      context,
      title: 'اختر الأماكن',
      searchHint: 'ابحث عن بلدة أو قرية…',
      options: options,
      selected: selected,
    );
    if (result == null || !mounted) return;
    setState(() {
      _selectedTowns = result.where((t) => t.kind == 'town').map((t) => t.id as String).toList();
      _selectedVillageIds =
          result.where((t) => t.kind == 'village').map((t) => t.id as int).toList();
    });
    _loadFirstPage();
  }

  Future<void> _openKindFilter() async {
    final options = _typesList
        .map((t) => FilterOption(kind: 'type', id: t.id, label: t.name, icon: t.icon))
        .toList();
    final selected = _selectedOccasionTypeIds.map((id) => FilterToken('type', id)).toList();
    final result = await showMultiSelectFilterSheet(
      context,
      title: 'اختر أنواع المناسبات',
      searchHint: 'ابحث عن نوع مناسبة…',
      options: options,
      selected: selected,
    );
    if (result == null || !mounted) return;
    setState(() {
      _selectedOccasionTypeIds = result.map((t) => t.id as int).toList();
    });
    _loadFirstPage();
  }

  void _clearFilters() {
    setState(() {
      _selectedTowns = const [];
      _selectedVillageIds = const [];
      _selectedOccasionTypeIds = const [];
    });
    _loadFirstPage();
  }

  void _onArchiveToggled(bool value) {
    _archive = value;
    _loadFirstPage();
  }

  Future<void> _openEvent(int eventId) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: eventId)),
    );
    // إعادة تحميل الصفحة الأولى تمحو كل ما جمعه المستخدم بـ«عرض المزيد»؛ لا
    // نفعلها إلا وهو ما يزال على الصفحة الأولى أصلاً، فلا شيء يُفقَد. غير ذلك
    // تبقى القائمة كما هي — العدّادات قد تتأخّر، والسحب للتحديث متاح.
    if ((_pagination?.page ?? 1) <= 1) _loadFirstPage();
  }

  Future<void> _openCongratulations(Event event) async {
    await showCongratulationsListSheet(
      context,
      eventId: event.id,
      onChanged: _loadFirstPage,
    );
  }

  Future<void> _toggleRemind(Event event) async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لتفعيل التذكير');
      return;
    }

    bool willAlarm = true;
    try {
      if (event.isReminded) {
        await services.api.unremind(event.id);
        await services.reminders.onReminderRemoved(event.id);
      } else {
        await services.api.remind(event.id);
        willAlarm = await services.reminders.onReminderAdded();
      }
      if (!mounted) return;
      if (!willAlarm) {
        showMessage(
          context,
          'تم حفظ التذكير، لكن هذا الجهاز لن ينبّهك لأنّك رفضت إذن الإشعارات — '
          'فعّله من إعدادات النظام كي يصلك المنبّه',
          isError: true,
        );
      }
      setState(() {
        _events = _events
            .map(
              (e) => e.id == event.id
                  ? e.copyWithReminder(
                      isReminded: !event.isReminded,
                      followersCount: e.followersCount == null
                          ? null
                          : e.followersCount! + (event.isReminded ? -1 : 1),
                    )
                  : e,
            )
            .toList();
      });
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppServices.of(context).auth;

    return Scaffold(
      appBar: AppBar(
        title: const Text('مناسبات النقب'),
        actions: [
          AnimatedBuilder(
            animation: auth,
            builder: (context, _) {
              if (!auth.isSignedIn) return const SizedBox.shrink();
              return _NotificationBell(userId: auth.user!.id);
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: _loadFirstPage,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() => _stories = AppServices.of(context).api.stories());
          await _loadFirstPage();
        },
        child: Column(
          children: [
            _StoriesStrip(future: _stories),
            _SearchBar(
              controller: _searchController,
              onChanged: _onSearchChanged,
            ),
            // رقاقتان تفتحان ورقة بحث بدل شريطين زاحفين كانا يأكلان أعلى
            // الشاشة (#85 خطوة 40-46) — «مسح الفلاتر» ظاهرة دائماً (قصة 45).
            _FilterChipsRow(
              placeLabel: _placeChipLabel,
              kindLabel: _kindChipLabel,
              onPlaceTap: _openPlaceFilter,
              onKindTap: _openKindFilter,
              onClearTap: _clearFilters,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 6),
              child: Row(
                children: [
                  Icon(
                    Icons.archive_outlined,
                    size: 17,
                    color: _archive ? context.c.sky : context.c.inkFaint,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'عرض المناسبات المنتهية',
                    style: TextStyle(fontSize: 13, color: context.c.inkSoft),
                  ),
                  const Spacer(),
                  Switch(value: _archive, onChanged: _onArchiveToggled),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(child: _buildList()),
          ],
        ),
      ),
    );
  }

  Widget _buildList() {
    if (_initialLoading) {
      // هياكل تحميل بدل دوّارة (٥٣) — النغمة الوقورة لا تُميَّز هنا أصلاً:
      // الهيكل نفسه بلا أي حركة، فلا فرق ليُلغى على نوع بعينه.
      return const EventFeedSkeletonList();
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off, size: 46, color: context.c.inkFaint),
              const SizedBox(height: 14),
              Text(
                '$_error',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.c.inkSoft, height: 1.6),
              ),
              const SizedBox(height: 18),
              ElevatedButton.icon(
                onPressed: _loadFirstPage,
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      );
    }

    if (_events.isEmpty && _announcements.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.celebration_outlined,
                size: 46,
                color: context.c.inkFaint,
              ),
              const SizedBox(height: 14),
              Text(
                _search.isNotEmpty
                    ? 'لا توجد مناسبات تطابق بحثك'
                    : _archive
                        ? 'لا توجد مناسبات منتهية في $_placeDescriptionForEmptyState'
                        : 'لا توجد مناسبات معتمدة في $_placeDescriptionForEmptyState حالياً',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.c.inkFaint, fontSize: 15),
              ),
            ],
          ),
        ),
      );
    }

    final hasMore = _pagination?.hasMore ?? false;
    final showFooter = hasMore || _loadingMore;
    final itemCount = _announcements.length + _events.length + (showFooter ? 1 : 0);

    return ListView.builder(
      padding: const EdgeInsets.only(top: 6, bottom: 20),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index < _announcements.length) {
          final announcement = _announcements[index];
          return _AnnouncementCard(
            announcement: announcement,
            onTap: () => _openEvent(announcement.eventId),
          );
        }

        final eventIndex = index - _announcements.length;
        if (eventIndex < _events.length) {
          final event = _events[eventIndex];
          final card = EventCard(
            event: event,
            onTap: () => _openEvent(event.id),
            onCongratulationsTap: () => _openCongratulations(event),
            onRemindTap: () => _toggleRemind(event),
          );
          // الظهور المتدرّج للشاشة الأولى وحدها — مناسبة من صفحة تالية أو
          // فلتر جديد لا تحمل معرّفها في هذه المجموعة فتُرسَم فوراً (٥٣).
          return _entranceEventIds.contains(event.id)
              ? FirstScreenFadeIn(index: eventIndex, child: card)
              : card;
        }

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Center(
            child: _loadingMore
                ? const CircularProgressIndicator()
                : OutlinedButton(onPressed: _loadMore, child: const Text('عرض المزيد')),
          ),
        );
      },
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: 'ابحث بالاسم أو العائلة أو البلدة…',
          prefixIcon: Icon(Icons.search, color: context.c.sky),
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
          isDense: true,
        ),
      ),
    );
  }
}

/// صفّ رقاقتَي المكان والنوع + «مسح الفلاتر» — بدل شريطين زاحفين كانا يأكلان
/// أعلى الشاشة (#85 خطوة 40-46). ارتفاع ثابت ٥٢ بكسل (٨ حشو + ٣٦ رقاقة + ٨
/// حشو) — نفس الرقم الذي تنصّ عليه المواصفة لِما تستردّه هذه الدفعة من أعلى
/// كل شاشة. «مسح الفلاتر» ظاهرة دائماً لا فقط عند وجود اختيار (قصة 45): تغذية
/// فارغة بلا زرّ ظاهر لغزٌ لا تفسير له.
class _FilterChipsRow extends StatelessWidget {
  const _FilterChipsRow({
    required this.placeLabel,
    required this.kindLabel,
    required this.onPlaceTap,
    required this.onKindTap,
    required this.onClearTap,
  });

  final String placeLabel;
  final String kindLabel;
  final VoidCallback onPlaceTap;
  final VoidCallback onKindTap;
  final VoidCallback onClearTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _FilterChip(icon: Icons.location_on_outlined, label: placeLabel, onTap: onPlaceTap),
              const SizedBox(width: 8),
              _FilterChip(icon: Icons.category_outlined, label: kindLabel, onTap: onKindTap),
              const SizedBox(width: 8),
              _FilterChip(
                icon: Icons.filter_alt_off_outlined,
                label: 'مسح الفلاتر',
                onTap: onClearTap,
                isClear: true,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isClear = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isClear;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: isClear ? Colors.transparent : context.c.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isClear ? context.c.inkFaint.withValues(alpha: 0.5) : context.c.line,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: isClear ? context.c.inkFaint : context.c.sky),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: isClear ? context.c.inkFaint : context.c.inkSoft,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// كرت إعلان تعديل تاريخ/مكان — خبر عن مناسبة، لا مناسبة نفسها. بلا شارة نوع
/// (الإعلان لا يحمل نوعاً كاملاً، `occasion_type_id` وحده) ويعرض الحقيقة
/// الحالية للمناسبة، لا تاريخ التعديل نفسه.
class _AnnouncementCard extends StatelessWidget {
  const _AnnouncementCard({required this.announcement, required this.onTap});

  final Announcement announcement;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final event = announcement.event;
    return Card(
      color: context.c.surface,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(Icons.campaign_outlined, color: context.c.sky, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'تغيّر موعد المناسبة',
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.bold,
                        color: context.c.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      event.displayTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: context.c.inkSoft),
                    ),
                    const SizedBox(height: 4),
                    // ما تغيّر هو كل قيمة هذا الكرت: من رتّب وقته على الموعد
                    // القديم يحتاج القديم والجديد معاً، لا الجديد وحده.
                    // الاستجابة لا تسمّي الحقل المتغيّر (تاريخ بداية أم انتهاء)
                    // فالصياغة عامة عمداً، ولا تخمّن أيّهما.
                    Text(
                      announcement.oldValue.isEmpty
                          ? '${event.town} — ${event.eventDate}'
                          : '${event.town} — من ${announcement.oldValue}'
                              ' إلى ${announcement.newValue}',
                      style: TextStyle(fontSize: 12, color: context.c.inkFaint),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left, color: context.c.inkFaint),
            ],
          ),
        ),
      ),
    );
  }
}

class _StoriesStrip extends StatelessWidget {
  const _StoriesStrip({required this.future});

  final Future<List<Story>>? future;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Story>>(
      future: future,
      builder: (context, snapshot) {
        final stories = snapshot.data;
        if (stories == null || stories.isEmpty) return const SizedBox.shrink();

        return SizedBox(
          height: 96,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            itemCount: stories.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final story = stories[index];
              return GestureDetector(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        StoryViewerScreen(stories: stories, initialIndex: index),
                  ),
                ),
                child: SizedBox(
                  width: 66,
                  child: Column(
                    children: [
                      Container(
                        width: 54,
                        height: 54,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: story.isLive
                                ? context.c.success
                                : context.c.line,
                            width: 2,
                          ),
                        ),
                        child: ClipOval(
                          child: story.image == null
                              ? ColoredBox(
                                  color: context.c.surface,
                                  child: Icon(
                                    Icons.celebration,
                                    size: 22,
                                    color: context.c.sky,
                                  ),
                                )
                              : Image.network(
                                  story.image!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => ColoredBox(
                                    color: context.c.surface,
                                    child: Icon(
                                      Icons.celebration,
                                      size: 22,
                                      color: context.c.sky,
                                    ),
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        story.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: context.c.inkSoft,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

/// جرس الإشعارات — مركز داخل التطبيق بلا push نظام (#19). يُبنى فقط عند
/// تسجيل الدخول، ويشترك في قناة `new_notification_<userId>` لتحديث العدّاد
/// لحظياً بلا إعادة تحميل.
class _NotificationBell extends StatefulWidget {
  const _NotificationBell({required this.userId});

  final int userId;

  @override
  State<_NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<_NotificationBell> {
  List<notif.AppNotification> _notifications = const [];
  VoidCallback? _unsubscribe;
  bool _loaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loaded) return;
    _loaded = true;
    _load();
    _unsubscribe = AppServices.of(context).realtime.onNewNotification(
          widget.userId,
          (_) => _load(),
        );
  }

  Future<void> _load() async {
    try {
      final list = await AppServices.of(context).api.notifications();
      if (mounted) setState(() => _notifications = list);
    } catch (_) {
      // الإشعارات تحسين وليست شرطاً — صامت عند فشل الجلب.
    }
  }

  @override
  void dispose() {
    _unsubscribe?.call();
    super.dispose();
  }

  Future<void> _open() async {
    final api = AppServices.of(context).api;
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
        child: ConstrainedBox(
          constraints:
              BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.75),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'الإشعارات',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: sheetContext.c.ink,
                ),
              ),
              const SizedBox(height: 14),
              if (_notifications.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  child: Text(
                    'لا توجد إشعارات بعد',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: sheetContext.c.inkFaint),
                  ),
                )
              else
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _notifications.length,
                    itemBuilder: (context, index) {
                      final n = _notifications[index];
                      // تعميم نبرته وقورة لا يُرسم احتفالياً بأي حال — لا لون
                      // ولا أيقونة تبتهج فوق نعي.
                      final iconColor = n.isRead
                          ? context.c.inkFaint
                          : n.tone == notif.BroadcastTone.solemn
                              ? context.c.inkSoft
                              : n.tone == notif.BroadcastTone.urgent
                                  ? context.c.warn
                                  : context.c.sky;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          n.isBroadcast
                              ? Icons.campaign_outlined
                              : (n.isRead ? Icons.notifications_none : Icons.notifications_active),
                          color: iconColor,
                        ),
                        title: Text(
                          n.title,
                          style: TextStyle(
                            fontWeight: n.isRead ? FontWeight.normal : FontWeight.bold,
                            color: context.c.ink,
                          ),
                        ),
                        subtitle: Text(
                          n.body,
                          style: TextStyle(color: context.c.inkSoft),
                        ),
                        onTap: () async {
                          Navigator.of(sheetContext).pop();
                          if (!n.isRead) {
                            try {
                              if (n.isBroadcast) {
                                await api.dismissBroadcast(n.broadcastId!);
                              } else {
                                await api.markNotificationRead(n.id!);
                              }
                              _load();
                            } catch (_) {
                              // لا يعطّل فتح المناسبة إن فشل تعليم القراءة.
                            }
                          }
                          // تعميم بلا event_id إطلاقاً — لا مكان ينقل إليه النقر.
                          if (n.eventId != null && context.mounted) {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => EventDetailsScreen(eventId: n.eventId!),
                              ),
                            );
                          }
                        },
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final unread = _notifications.where((n) => !n.isRead).length;
    return IconButton(
      tooltip: 'الإشعارات',
      icon: Badge(
        label: Text('$unread'),
        isLabelVisible: unread > 0,
        child: const Icon(Icons.notifications_outlined),
      ),
      onPressed: _open,
    );
  }
}
