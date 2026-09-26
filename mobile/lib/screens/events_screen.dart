import 'dart:async';

import 'package:flutter/material.dart';

import '../api/negev_api.dart' show NegevApi, Village;
import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../models/live.dart';
import '../models/notification.dart' as notif;
import '../state/audio_coordinator.dart';
import '../theme.dart';
import '../widgets/async_view.dart'
    show openSupportWhatsApp, showMessage;
import '../widgets/auth_action_button.dart';
import '../widgets/congratulations.dart';
import '../widgets/event_card.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/motion.dart';
import 'agenda_screen.dart';
import 'edit_event_screen.dart';
import 'event_details_screen.dart';
import 'live_screen.dart';
import 'story_viewer_screen.dart';

/// أقصى ارتفاع لشريط الإعلانات في الكروم الثابت: كرت إعلان واحد (‏‎~٩٦px‎)
/// وطرفُ الذي يليه، فيُقرأ أنّ تحته المزيد. وما زاد يُمرَّر داخل الشريط. سقفٌ
/// لازم لأنّ الكروم غير قابل للتمرير وتحته `Expanded`.
const double _announcementsMaxHeight = 132;

/// الشاشة الرئيسية: القصص + بحث + فلترة بلدة ونوع + إعلانات + قائمة المناسبات
/// المرقّمة.
///
/// الكرت الظاهر يشغّل صوته الفعلي تلقائياً (`effectiveEventAudioUrl`)، ويسكت
/// حين يغادر الكرت، أو يُختار تبويب آخر (`isActive`)، أو تُدفع شاشة فوقه.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, this.isActive = true});

  /// هل تبويب المناسبات هو المختار الآن؟ `IndexedStack` في `HomeShell` يُبقي
  /// الشاشة حيّة خلف التبويبات الأخرى، فلا بدّ أن تُخبَر صراحةً.
  final bool isActive;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> with RouteAware {
  final _searchController = TextEditingController();
  final _pageController = PageController();

  /// اختيار متعدّد — بلدة أو أكثر، قرية أو أكثر، نوع مناسبة أو أكثر معاً
  /// (#85 خطوة 40-43). قائمة فارغة تعني «كل الأماكن»/«كل الأنواع»، لا فلترة.
  List<String> _selectedTowns = const [];
  List<int> _selectedVillageIds = const [];
  List<int> _selectedOccasionTypeIds = const [];
  String _search = '';
  bool _archive = false;
  /// إظهار/إخفاء الكروم العلوي (الفلاتر وشريط القصص والبحث) — مخفي افتراضياً
  /// لعرض الكروت ملء الشاشة بتمرير عمودي، ويظهر بكبسة زر طافٍ.
  bool _showTopChrome = false;
  Timer? _debounce;

  StreamSubscription<Map<String, dynamic>>? _newEventSub;
  StreamSubscription<void>? _liveStatusSub;

  Future<List<Story>>? _stories;

  /// حالة البث للكبسة الرابعة وشارتها — `null` قبل أول ردّ أو عند فشله،
  /// والكبسة ظاهرة وتنكبس في الحالتين.
  LiveChannel? _liveChannel;
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

  /// المشغّل المشترك — يُلتقط هنا لأنّ `dispose` لا يجوز له قراءة الشجرة.
  AudioCoordinator? _audio;
  String? _defaultAudioUrl;
  int _currentPage = 0;

  /// شاشة (أو ورقة) مدفوعة فوق التغذية الآن.
  bool _covered = false;
  bool _routeSubscribed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_audio == null) {
      final services = AppServices.of(context);
      _audio = services.audio;
      services.audio.defaultTrack(services.api).then((url) {
        if (!mounted) return;
        _defaultAudioUrl = url;
        _autoplayCurrent();
      });
    }
    final route = ModalRoute.of(context);
    if (!_routeSubscribed && route != null) {
      _routeSubscribed = true;
      routeObserver.subscribe(this, route);
    }
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
      _loadLiveChannel();
    }

    // مناسبة جديدة نُشرت لحظياً — تحديث صامت يُبقي المستخدم على الكرت الذي أمامه.
    _newEventSub ??=
        AppServices.of(context).realtime.onNewEvent.listen((_) => _refreshInPlace());
    // إعدادات البث تغيّرت من اللوحة — الشارة تتبعها بلا سحب للتحديث.
    _liveStatusSub ??=
        AppServices.of(context).realtime.onLiveStatus.listen((_) => _loadLiveChannel());
  }

  /// GET /api/live للكبسة الرابعة. الفشل صامت: الكبسة تبقى بلا شارة.
  Future<void> _loadLiveChannel() async {
    try {
      final channel = await AppServices.of(context).api.liveChannel();
      if (mounted) setState(() => _liveChannel = channel);
    } catch (_) {}
  }

  @override
  void didUpdateWidget(covariant EventsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive == oldWidget.isActive) return;
    if (widget.isActive) {
      _autoplayCurrent();
    } else {
      _audio?.pause(this);
    }
  }

  @override
  void didPushNext() {
    _covered = true;
    _audio?.pause(this);
  }

  @override
  void didPopNext() {
    _covered = false;
    _autoplayCurrent();
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    _audio?.release(this);
    _debounce?.cancel();
    _newEventSub?.cancel();
    _liveStatusSub?.cancel();
    _searchController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  /// يشغّل صوت الكرت الظاهر الآن — أو يُسكت ما شغّلته التغذية إن لم يكن له
  /// صوت. لا شيء والتبويب غير مختار أو شاشة أخرى فوقه.
  void _autoplayCurrent() {
    final audio = _audio;
    if (audio == null || !widget.isActive || _covered) return;
    if (_events.isEmpty || _currentPage >= _events.length) {
      audio.release(this);
      return;
    }
    final event = _events[_currentPage];
    audio.autoplay(
      effectiveEventAudioUrl(event, defaultAudioUrl: _defaultAudioUrl),
      owner: this,
      key: event.id,
    );
  }

  /// الكتم يُسكت فوراً ويوقف التشغيل التلقائي؛ فكّه يشغّل الكرت الظاهر.
  Future<void> _toggleMute() async {
    final audio = _audio;
    if (audio == null) return;
    final muting = !audio.isMuted;
    await audio.setMuted(muting);
    if (!muting) _autoplayCurrent();
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
      if (_pageController.hasClients) {
        _pageController.jumpToPage(0);
      }
      _currentPage = 0;
      _autoplayCurrent();
    } catch (error) {
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _error = error;
        _initialLoading = false;
      });
    }
  }

  /// تحديث الصفحة الأولى بلا مؤشّر تحميل ولا قفز إلى أوّل القائمة: الكرت
  /// المعروض يبقى أمام المستخدم (بموضعه الجديد إن أزاحته مناسبة جديدة) وصوته
  /// لا ينقطع. من تجاوز الصفحة الأولى لا تُستبدل قائمته أصلاً — يرى الجديد
  /// عند التحديث التالي بدل أن يُنتزع من مكانه.
  Future<void> _refreshInPlace() async {
    if (_initialLoading) return;
    final shownId = _currentPage < _events.length ? _events[_currentPage].id : null;
    final generation = _requestGeneration;
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
      final index = shownId == null ? 0 : result.events.indexWhere((e) => e.id == shownId);
      if (index < 0) return;
      setState(() {
        _events = result.events;
        _pagination = result.pagination;
        _announcements = result.announcements;
        _currentPage = index;
      });
      if (_pageController.hasClients) _pageController.jumpToPage(index);
      _autoplayCurrent();
    } catch (_) {
      // تحديث خلفي — فشله لا يستحق رسالة؛ القائمة الحالية تبقى كما هي.
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

  bool get _hasActiveFilters =>
      _selectedTowns.isNotEmpty ||
      _selectedVillageIds.isNotEmpty ||
      _selectedOccasionTypeIds.isNotEmpty ||
      _search.isNotEmpty ||
      _archive;

  String get _filterButtonLabel {
    if (_search.isNotEmpty) return 'بحث: $_search';
    final totalPlaces = _selectedTowns.length + _selectedVillageIds.length;
    final totalTypes = _selectedOccasionTypeIds.length;
    if (totalPlaces > 0 && totalTypes > 0) {
      return '$_placeChipLabel • $_kindChipLabel';
    }
    if (totalPlaces > 0) return _placeChipLabel;
    if (totalTypes > 0) return _kindChipLabel;
    if (_archive) return 'المناسبات المنتهية';
    return 'الفلاتر والبحث';
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
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. التغذية الرأسية ملء الشاشة
          Positioned.fill(
            child: RefreshIndicator(
              onRefresh: () async {
                final services = AppServices.of(context);
                setState(() {
                  _stories = services.api.stories();
                });
                _loadLiveChannel();
                // السحب للتحديث يلتقط أيضاً مقطعاً افتراضياً رفعه الأدمن للتوّ.
                services.audio.defaultTrack(services.api, refresh: true).then((url) {
                  if (mounted) _defaultAudioUrl = url;
                });
                await _loadFirstPage();
              },
              child: _buildList(),
            ),
          ),

          // 2. الكروم العلوي العائم (يظهر عندما تكون اللوحة مغلقة)
          if (!_showTopChrome)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    // الصفّ الثاني تحت مجموعة الأيقونات، لا بجانبها: الصفّ
                    // الأوّل ممتلئ أصلاً على هاتف ضيّق، وزرّ النشر العائم في وسطه.
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Row(
                        // لا `Spacer` هنا: مع `Flexible` بجانبه كان سيقاسمه
                        // المساحة نصفين فيُختصر نصّ الكبسة بلا حاجة.
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // زر الكبسة لفتح الفلاتر وعرض المناسبات — يتقلّص (ونصّه
                          // يُختصَر) قبل أن تفيض مجموعة الأيقونات على هاتف ضيّق.
                          Flexible(
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () => setState(() => _showTopChrome = true),
                                borderRadius: BorderRadius.circular(999),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 8,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.60),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(
                                      color: _hasActiveFilters
                                          ? context.c.sky
                                          : Colors.white.withValues(alpha: 0.25),
                                    ),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x40000000),
                                        blurRadius: 10,
                                        offset: Offset(0, 3),
                                      ),
                                    ],
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.tune_rounded,
                                        size: 16,
                                        color: _hasActiveFilters
                                            ? context.c.sky
                                            : Colors.white,
                                      ),
                                      const SizedBox(width: 6),
                                      Flexible(
                                        child: Text(
                                          _filterButtonLabel,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.bold,
                                            color: _hasActiveFilters
                                                ? context.c.sky
                                                : Colors.white,
                                          ),
                                        ),
                                      ),
                                      if (_hasActiveFilters) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          width: 7,
                                          height: 7,
                                          decoration: BoxDecoration(
                                            color: context.c.sky,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          // الأجندة · التحديث · الدعم · البث المباشر (+ الجرس للمسجَّل)
                          Container(
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.60),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.25),
                              ),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x40000000),
                                  blurRadius: 10,
                                  offset: Offset(0, 3),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(
                                    Icons.calendar_month_rounded,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                  tooltip: 'أجندة المناسبات',
                                  onPressed: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(builder: (_) => const AgendaScreen()),
                                    );
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(
                                    Icons.refresh,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                  tooltip: 'تحديث',
                                  onPressed: () async {
                                    final services = AppServices.of(context);
                                    setState(() {
                                      _stories = services.api.stories();
                                    });
                                    _loadLiveChannel();
                                    await _loadFirstPage();
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(
                                    Icons.support_agent_rounded,
                                    color: Color(0xFF25D366),
                                    size: 20,
                                  ),
                                  tooltip: 'الدعم الفني عبر واتساب',
                                  onPressed: () => openSupportWhatsApp(context),
                                ),
                                LiveButton(
                                  channel: _liveChannel,
                                  color: Colors.white,
                                  onPressed: () => openLiveScreen(context),
                                ),
                                AnimatedBuilder(
                                  animation: auth,
                                  builder: (context, _) {
                                    if (!auth.isSignedIn) {
                                      return const SizedBox.shrink();
                                    }
                                    return _NotificationBell(userId: auth.user!.id);
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.60),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.25),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedBuilder(
                              animation: _audio!,
                              builder: (context, _) => IconButton(
                                key: const Key('feed_mute_toggle'),
                                icon: Icon(
                                  _audio!.isMuted
                                      ? Icons.volume_off_rounded
                                      : Icons.volume_up_rounded,
                                  color: Colors.white,
                                  size: 20,
                                ),
                                tooltip: _audio!.isMuted ? 'تشغيل الصوت' : 'كتم الصوت',
                                onPressed: _toggleMute,
                              ),
                            ),
                            const AuthActionButton(color: Colors.white),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // 3. لوحة الفلاتر والقصص المنسدلة (تظهر عند الضغط على الكبسة)
          if (_showTopChrome) ...[
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => setState(() => _showTopChrome = false),
                child: Container(
                  color: Colors.black.withValues(alpha: 0.45),
                ),
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Material(
                color: context.c.surface,
                elevation: 12,
                borderRadius:
                    const BorderRadius.vertical(bottom: Radius.circular(24)),
                clipBehavior: Clip.antiAlias,
                child: SafeArea(
                  bottom: false,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
                        child: Row(
                          children: [
                            const Text(
                              'مناسبات النقب',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const Spacer(),
                            IconButton(
                              icon: const Icon(Icons.calendar_month_rounded),
                              tooltip: 'أجندة المناسبات',
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(builder: (_) => const AgendaScreen()),
                                );
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.support_agent_rounded, color: Color(0xFF25D366)),
                              tooltip: 'الدعم الفني عبر واتساب',
                              onPressed: () => openSupportWhatsApp(context),
                            ),
                            LiveButton(
                              channel: _liveChannel,
                              onPressed: () => openLiveScreen(context),
                            ),
                            const AuthActionButton(compact: true),
                            IconButton(
                              icon: const Icon(Icons.close),
                              tooltip: 'إغلاق',
                              onPressed: () =>
                                  setState(() => _showTopChrome = false),
                            ),
                          ],
                        ),
                      ),
                      _StoriesStrip(future: _stories),
                      _SearchBar(
                        controller: _searchController,
                        onChanged: _onSearchChanged,
                      ),
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
                              style: TextStyle(
                                fontSize: 13,
                                color: context.c.inkSoft,
                              ),
                            ),
                            const Spacer(),
                            Switch(value: _archive, onChanged: _onArchiveToggled),
                          ],
                        ),
                      ),
                      if (_announcements.isNotEmpty)
                        ConstrainedBox(
                          constraints: const BoxConstraints(
                            maxHeight: _announcementsMaxHeight,
                          ),
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
                            child: Column(
                              children: _announcements
                                  .map((announcement) => _AnnouncementCard(
                                        announcement: announcement,
                                        onTap: () =>
                                            _openEvent(announcement.eventId),
                                      ))
                                  .toList(),
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildList() {
    if (_initialLoading) {
      // هياكل تحميل بدل دوّارة (٥٣)
      return const EventFeedSkeletonList();
    }

    if (_error != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
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
        ],
      );
    }

    if (_events.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
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
        ],
      );
    }

    final hasMore = _pagination?.hasMore ?? false;

    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        PageView.builder(
          controller: _pageController,
          scrollDirection: Axis.vertical,
          physics: const AlwaysScrollableScrollPhysics(
            parent: PageScrollPhysics(),
          ),
          itemCount: _events.length,
          onPageChanged: (index) {
            _currentPage = index;
            _autoplayCurrent();
            if (index >= _events.length - 2 && hasMore && !_loadingMore) {
              _loadMore();
            }
          },
          itemBuilder: (context, index) {
            final event = _events[index];
            final card = EventCard(
              event: event,
              onTap: () => _openEvent(event.id),
              onCongratulationsTap: () => _openCongratulations(event),
              onRemindTap: () => _toggleRemind(event),
            );
            // الظهور المتدرّج للشاشة الأولى وحدها — مناسبة من صفحة تالية أو
            // فلتر جديد لا تحمل معرّفها في هذه المجموعة فتُرسَم فوراً (٥٣).
            return _entranceEventIds.contains(event.id)
                ? FirstScreenFadeIn(index: index, child: card)
                : card;
          },
        ),
        if (_loadingMore)
          Positioned(
            bottom: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              decoration: BoxDecoration(
                color: context.c.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: context.c.line),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x40000000),
                    blurRadius: 16,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: context.c.sky,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'جاري تحميل المزيد...',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: context.c.ink,
                    ),
                  ),
                ],
              ),
            ),
          )
        else if (hasMore)
          Positioned(
            bottom: 16,
            child: ElevatedButton(
              onPressed: _loadMore,
              style: ElevatedButton.styleFrom(
                backgroundColor: context.c.surface,
                foregroundColor: context.c.ink,
                elevation: 4,
                shape: const StadiumBorder(),
                side: BorderSide(color: context.c.line),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              ),
              child: const Text(
                'عرض المزيد',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
          ),
      ],
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
        final stories = snapshot.data ?? const <Story>[];
        if (stories.isEmpty) return const SizedBox.shrink();

        return SizedBox(
          height: 96,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            itemCount: stories.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final story = stories[index];
              return _StripItem(
                highlighted: story.isLive,
                label: story.title,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => StoryViewerScreen(
                      stories: stories,
                      initialIndex: index,
                    ),
                  ),
                ),
                avatar: story.image == null
                    ? _storyFallbackAvatar(context)
                    : Image.network(
                        story.image!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            _storyFallbackAvatar(context),
                      ),
              );
            },
          ),
        );
      },
    );
  }
}

/// نائب صورة القصة — حين لا صورة أصلاً، وحين تفشل الصورة الموجودة في التحميل.
Widget _storyFallbackAvatar(BuildContext context) => ColoredBox(
      color: context.c.surface,
      child: Icon(Icons.celebration, size: 22, color: context.c.sky),
    );

/// الشكل الواحد لعنصر شريط القصص: حلقة دائرية ٥٤ ثم تسمية سطر واحد تحتها.
class _StripItem extends StatelessWidget {
  const _StripItem({
    required this.avatar,
    required this.label,
    required this.highlighted,
    required this.onTap,
  });

  /// ما يملأ داخل الحلقة — صورة القصة أو نائبها؛ القصّ الدائري هنا.
  final Widget avatar;
  final String label;

  /// لون القصة الحيّة (`context.c.success`) بدل لون الحدّ العادي.
  final bool highlighted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
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
                  color: highlighted ? context.c.success : context.c.line,
                  width: 2,
                ),
              ),
              child: ClipOval(child: avatar),
            ),
            const SizedBox(height: 5),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: context.c.inkSoft),
            ),
          ],
        ),
      ),
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
  StreamSubscription<Map<String, dynamic>>? _broadcastSub;
  StreamSubscription<Map<String, dynamic>>? _systemSub;
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
    _broadcastSub = AppServices.of(context).realtime.onBroadcast.listen((_) => _load());
    _systemSub = AppServices.of(context).realtime.onSystemNotification.listen((_) => _load());
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
    _broadcastSub?.cancel();
    _systemSub?.cancel();
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
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'الإشعارات',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: sheetContext.c.ink,
                      ),
                    ),
                    if (_notifications.isNotEmpty)
                      TextButton.icon(
                        onPressed: () async {
                          try {
                            await api.clearAllNotifications();
                            if (mounted) {
                              setState(() => _notifications = const []);
                            }
                            setSheetState(() {});
                            if (sheetContext.mounted) Navigator.of(sheetContext).pop();
                          } catch (_) {}
                        },
                        icon: Icon(Icons.clear_all, size: 18, color: sheetContext.c.danger),
                        label: Text(
                          'مسح الكل',
                          style: TextStyle(fontSize: 13, color: sheetContext.c.danger),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                _NewEventsToggle(api: api),
                const SizedBox(height: 8),
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
                          trailing: IconButton(
                            icon: Icon(Icons.close, size: 18, color: sheetContext.c.inkFaint),
                            tooltip: 'إزالة الإشعار',
                            onPressed: () async {
                              try {
                                if (n.isBroadcast) {
                                  await api.dismissBroadcast(n.broadcastId!);
                                } else {
                                  await api.deleteNotification(n.id!);
                                }
                                if (mounted) {
                                  setState(() {
                                    _notifications = _notifications.where((item) =>
                                      n.isBroadcast ? item.broadcastId != n.broadcastId : item.id != n.id
                                    ).toList();
                                  });
                                }
                                setSheetState(() {});
                                _load();
                              } catch (_) {}
                            },
                          ),
                          onTap: () async {
                            Navigator.of(sheetContext).pop();
                            try {
                              if (n.isBroadcast) {
                                await api.dismissBroadcast(n.broadcastId!);
                              } else {
                                await api.deleteNotification(n.id!);
                              }
                              if (mounted) {
                                setState(() {
                                  _notifications = _notifications.where((item) =>
                                    n.isBroadcast ? item.broadcastId != n.broadcastId : item.id != n.id
                                  ).toList();
                                });
                              }
                              _load();
                            } catch (_) {
                              // لا يعطّل فتح المناسبة إن فشل تعليم القراءة.
                            }
                            _openTarget(n);
                          },
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// وجهة النقر على إشعار — بسياق الجرس نفسه لا سياق الورقة، فالورقة أُغلقت
  /// قبل انتهاء نداءات الشبكة. تعميم أو ملخّص «مناسبات جديدة اليوم» بلا
  /// event_id إطلاقاً — التغذية خلف الورقة، فلا مكان ينقل إليه النقر.
  Future<void> _openTarget(notif.AppNotification n) async {
    // «بدأ البث المباشر» بلا event_id — وجهته صفحة البث.
    if (n.type == 'live_started') {
      if (mounted) openLiveScreen(context);
      return;
    }

    final eventId = n.eventId;
    if (eventId == null || !mounted) return;

    if (n.type == 'event_nudge') {
      // «قوّي مناسبتك» موجّه لمالك المناسبة — يفتح التعديل مباشرة. الجلب من
      // «مناسباتي» كشاشتها، فمناسبة قيد المراجعة تصل أيضاً.
      try {
        final mine = await AppServices.of(context).api.myEvents();
        final event = mine.where((e) => e.id == eventId).firstOrNull;
        if (!mounted) return;
        if (event == null) {
          showMessage(context, 'تعذّر فتح المناسبة للتعديل', isError: true);
          return;
        }
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => EditEventScreen(event: event)),
        );
      } catch (error) {
        if (mounted) showMessage(context, '$error', isError: true);
      }
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: eventId)),
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

/// مفتاح «إشعارات المناسبات الجديدة» أعلى ورقة الإشعارات — يُجلب عند فتحها،
/// ويُحفظ فوراً عند التبديل مع التراجع إن فشل الحفظ. لا يظهر قبل وصول القيمة
/// كي لا يُعرض وضع غير صحيح. `api` ممرَّر من الجرس كالورقة نفسها.
class _NewEventsToggle extends StatefulWidget {
  const _NewEventsToggle({required this.api});

  final NegevApi api;

  @override
  State<_NewEventsToggle> createState() => _NewEventsToggleState();
}

class _NewEventsToggleState extends State<_NewEventsToggle> {
  bool? _value;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final value = await widget.api.getNotifyNewEvents();
      if (mounted) setState(() => _value = value);
    } catch (_) {
      // تحسين لا شرط — يبقى المفتاح مخفياً إن تعذّر الجلب.
    }
  }

  Future<void> _toggle(bool next) async {
    final previous = _value;
    setState(() {
      _value = next;
      _saving = true;
    });
    try {
      final saved = await widget.api.setNotifyNewEvents(next);
      if (mounted) setState(() => _value = saved);
    } catch (error) {
      if (!mounted) return;
      setState(() => _value = previous);
      showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = _value;
    if (value == null) return const SizedBox.shrink();
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: value,
      onChanged: _saving ? null : _toggle,
      title: Text(
        'إشعارات المناسبات الجديدة',
        style: TextStyle(fontSize: 14, color: context.c.ink),
      ),
      subtitle: Text(
        'التذكيرات وما يخصّ مناسباتك تصلك دائماً',
        style: TextStyle(fontSize: 12, color: context.c.inkFaint),
      ),
    );
  }
}
