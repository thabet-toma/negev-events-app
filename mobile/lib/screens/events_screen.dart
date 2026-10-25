import 'dart:async';

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';

import '../api/negev_api.dart' show NegevApi, Village;
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
import 'albums_screen.dart';
import 'edit_event_screen.dart';
import 'event_details_screen.dart';
import 'live_screen.dart';
import 'story_viewer_screen.dart';

/// أقصى ارتفاع لشريط الإعلانات في الكروم الثابت: كرت إعلان واحد (‏‎~٩٦px‎)
/// وطرفُ الذي يليه، فيُقرأ أنّ تحته المزيد. وما زاد يُمرَّر داخل الشريط. سقفٌ
/// لازم لأنّ الكروم غير قابل للتمرير وتحته `Expanded`.
const double _announcementsMaxHeight = 132;

/// فلتر التاريخ في التغذية: يوم أو أيام متتالية تُرسَل `date_from`/`date_to`.
/// الأسبوع هنا من الأحد إلى السبت، و«الخميس – السبت» ليالي الأعراس القادمة —
/// من اليوم نفسه إن كنّا فيها. نفس الحساب في `feedDateRange` بـ`web/app.js`.
class FeedDateFilter {
  const FeedDateFilter._(this.key, this.label, this.from, this.to);

  /// `today` · `tomorrow` · `week` · `weekend` · `day` (يوم مختار).
  final String key;
  final String label;
  final DateTime from;
  final DateTime to;

  static const presets = ['today', 'tomorrow', 'week', 'weekend'];

  static const _labels = {
    'today': 'اليوم',
    'tomorrow': 'غداً',
    'week': 'هذا الأسبوع',
    'weekend': 'الخميس – السبت',
  };

  static String presetLabel(String key) => _labels[key]!;

  /// [now] يُمرَّر لا يُقرأ هنا، كي يُختبر الحساب على أي يوم من الأسبوع.
  factory FeedDateFilter.preset(String key, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    // الأحد ٠ … السبت ٦ (‏`DateTime.weekday`: الإثنين ١ … الأحد ٧).
    final dayOfWeek = today.weekday % 7;
    DateTime plus(int days) => DateTime(today.year, today.month, today.day + days);
    switch (key) {
      case 'tomorrow':
        return FeedDateFilter._(key, _labels[key]!, plus(1), plus(1));
      case 'week':
        return FeedDateFilter._(key, _labels[key]!, today, plus(6 - dayOfWeek));
      case 'weekend':
        final from = dayOfWeek >= 4 ? today : plus(4 - dayOfWeek);
        return FeedDateFilter._(key, _labels[key]!, from, plus(6 - dayOfWeek));
      default:
        return FeedDateFilter._('today', _labels['today']!, today, today);
    }
  }

  factory FeedDateFilter.day(DateTime day) {
    final only = DateTime(day.year, day.month, day.day);
    return FeedDateFilter._('day', arabicEventDate(_iso(only)), only, only);
  }

  String get fromParam => _iso(from);
  String get toParam => _iso(to);

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// الشاشة الرئيسية: القصص + بحث + فلترة بلدة ونوع وتاريخ + إعلانات + قائمة
/// المناسبات المرقّمة.
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
  /// النصّ الذي طُلبت به آخر صفحة أولى فعلاً. الكتابة ثم العودة إلى النصّ نفسه
  /// (مسافة زائدة أُضيفت أو حُذفت) ليست بحثاً جديداً، فلا تُعيد الجلب ولا تقفز
  /// بالكرت المعروض إلى أوّل القائمة.
  String _appliedSearch = '';
  bool _archive = false;

  /// `null` = كل التواريخ.
  FeedDateFilter? _dateFilter;
  /// إظهار/إخفاء لوح الفلاتر والبحث — مخفي افتراضياً
  /// لعرض الكروت ملء الشاشة بتمرير عمودي، ويظهر بكبسة زر طافٍ.
  bool _showTopChrome = false;
  Timer? _debounce;

  StreamSubscription<Map<String, dynamic>>? _newEventSub;
  StreamSubscription<void>? _liveStatusSub;

  Future<List<Story>>? _stories;

  /// حالة البث لكبسة الشريط وشارتها — `null` قبل أول ردّ أو عند فشله،
  /// والكبسة ظاهرة وقابلة للكبس في الحالتين.
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

  /// لقطة ما كان معروضاً قبل آخر تغيير فلتر فعلي (مكان/نوع/تاريخ/أرشفة/مسح):
  /// زرّ الرجوع في الرسالة يعيدها كاملة بـ`setState` و`jumpToPage` بلا طلب
  /// شبكة. `null` = لا شيء يُعاد إليه، فلا تُعرض الرسالة.
  _ResultsSnapshot? _snapshot;

  /// هل تنتظر اللقطة وصول نتائج التغيير كي تُعرض رسالة الرجوع؟ تُطفأ بعد العرض.
  bool _snapshotPending = false;

  /// `onPageChanged` الناتج عن `jumpToPage` في `_restoreSnapshot` لا يجوز أن
  /// يُطلق جلب «المزيد» — الرجوع للقطة بلا أي طلب شبكة.
  bool _restoringSnapshot = false;

  /// المشغّل المشترك — يُلتقط هنا لأنّ `dispose` لا يجوز له قراءة الشجرة.
  AudioCoordinator? _audio;
  String? _defaultAudioUrl;
  int _currentPage = 0;

  /// شاشة (أو ورقة) مدفوعة فوق التغذية الآن.
  bool _covered = false;
  bool _routeSubscribed = false;

  /// إشارة «قائمتي» بتغيير حالة حفظ وقع خارج التغذية (إزالة أو تراجع) —
  /// تُلتقط هنا كي تُفكّ عند `dispose`، كما يفعل `HomeShell` بـ`tabRequest`.
  ValueNotifier<({int eventId, bool saved})?>? _savedChange;

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
    // القرى من الخادم حصراً — لا تُكرَّر في أي عميل (`GET /api/towns`)، وتصل
    // مع البلدات والمحافظات في نفس الكتالوج المشترك.
    if (_villages == null) {
      _villages = AppServices.of(context).places.load().then((c) => c.villages);
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
    // إزالة من «قائمتي» (أو تراجع عنها) — التغذية حيّة فلا ترى جلباً جديداً،
    // فتُصحَّح كرتها في مكانها بدل أن يُكبَس زرّها بحالة قديمة.
    if (_savedChange == null) {
      _savedChange = AppServices.of(context).savedChange;
      _savedChange!.addListener(_handleSavedChange);
    }
  }

  /// يطبّق تغيير حالة الحفظ على الكرت المقابل إن كان في القائمة المحمّلة —
  /// نفس `copyWithReminder` وعدّاد المتابعين المستعملين في `_toggleRemind`.
  void _handleSavedChange() {
    final change = _savedChange!.value;
    if (change == null || !mounted) return;

    final index = _events.indexWhere((event) => event.id == change.eventId);
    if (index == -1) return;
    final event = _events[index];
    if (event.isReminded == change.saved) return;

    setState(() {
      _events = _events
          .map(
            (e) => e.id == change.eventId
                ? e.copyWithReminder(
                    isReminded: change.saved,
                    followersCount: e.followersCount == null
                        ? null
                        : e.followersCount! + (change.saved ? 1 : -1),
                  )
                : e,
          )
          .toList();
    });
  }

  /// GET /api/live لكبسة البث في شريط الستوريات. الفشل صامت: الكبسة تبقى بلا
  /// شارة.
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
    _savedChange?.removeListener(_handleSavedChange);
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
            dateFrom: _dateFilter?.fromParam,
            dateTo: _dateFilter?.toParam,
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
      // بعد وصول نتائج التغيير لا قبله — رسالة على شاشة قد تُلغى بخطأ الطلب
      // لا معنى لها.
      _showSnapshotReturn();
    } catch (error) {
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _error = error;
        _initialLoading = false;
      });
    }
  }

  /// يلتقط ما هو معروض الآن قبل أي تغيير فلتر فعلي — القائمة وموضعها والفلتر
  /// كاملاً — كي يُعاد المستخدم إلى نتائجه بضغطة واحدة.
  void _captureSnapshot() {
    _snapshot = _ResultsSnapshot(
      events: _events,
      pagination: _pagination,
      index: _currentPage < _events.length ? _currentPage : 0,
      search: _search,
      towns: _selectedTowns,
      villages: _selectedVillageIds,
      kinds: _selectedOccasionTypeIds,
      archive: _archive,
      dateFilter: _dateFilter,
    );
    _snapshotPending = true;
  }

  /// رسالة «رجوع لنتائجك السابقة» تُعرض **بعد** وصول نتائج التغيير. تُستبدل
  /// اللقطة بأحدثها في كل تغيير، ولا رسالة حين لا لقطة ذات نتائج (تغيير فلتر
  /// على تغذية فارغة لا شيء يُعاد إليه).
  void _showSnapshotReturn() {
    if (!_snapshotPending) return;
    _snapshotPending = false;
    final snapshot = _snapshot;
    if (snapshot == null || snapshot.events.isEmpty || !mounted) return;
    showMessage(
      context,
      'حُدِّثت نتائج الفلتر',
      action: SnackBarAction(
        label: '↩ رجوع لنتائجك السابقة',
        textColor: context.c.sky,
        onPressed: _restoreSnapshot,
      ),
    );
  }

  /// إعادة اللقطة كاملةً — القائمة والموضع والفلتر ونصّ البحث — بلا أي طلب
  /// شبكة. تُلغى مهلة البحث المعلّقة كي لا يصل طلب بعد الرجوع فيغيّر ما عاد.
  void _restoreSnapshot() {
    final snapshot = _snapshot;
    if (snapshot == null || !mounted) return;
    _debounce?.cancel();
    setState(() {
      _events = snapshot.events;
      _pagination = snapshot.pagination;
      _search = snapshot.search;
      _appliedSearch = snapshot.search;
      _searchController.text = snapshot.search;
      _selectedTowns = snapshot.towns;
      _selectedVillageIds = snapshot.villages;
      _selectedOccasionTypeIds = snapshot.kinds;
      _archive = snapshot.archive;
      _dateFilter = snapshot.dateFilter;
      _currentPage = snapshot.index;
      _snapshot = null;
      _snapshotPending = false;
    });
    // القفزة بعد إعادة البناء: `PageView` ما زال على عدد كروت الفلتر الجديد
    // داخل هذه اللحظة، فالقفز قبله يُقصّ إلى آخر كرت متاح.
    _restoringSnapshot = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_pageController.hasClients) _pageController.jumpToPage(snapshot.index);
      _restoringSnapshot = false;
      _autoplayCurrent();
    });
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
            dateFrom: _dateFilter?.fromParam,
            dateTo: _dateFilter?.toParam,
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
            dateFrom: _dateFilter?.fromParam,
            dateTo: _dateFilter?.toParam,
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
      // النصّ نفسه بعد trim ليس بحثاً جديداً: النتائج المعروضة هي نتائجه أصلاً،
      // فلا جلب ولا قفز إلى أول القائمة.
      final next = value.trim();
      if (next == _appliedSearch) return;
      _search = next;
      _appliedSearch = next;
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

  String get _dateChipLabel => _dateFilter?.label ?? 'كل التواريخ';

  bool get _hasActiveFilters =>
      _selectedTowns.isNotEmpty ||
      _selectedVillageIds.isNotEmpty ||
      _selectedOccasionTypeIds.isNotEmpty ||
      _dateFilter != null ||
      _search.isNotEmpty ||
      _archive;

  String get _filterButtonLabel {
    if (_search.isNotEmpty) return 'بحث: $_search';
    final totalPlaces = _selectedTowns.length + _selectedVillageIds.length;
    final totalTypes = _selectedOccasionTypeIds.length;
    final parts = [
      if (totalPlaces > 0) _placeChipLabel,
      if (totalTypes > 0) _kindChipLabel,
      if (_dateFilter != null) _dateFilter!.label,
    ];
    if (parts.isNotEmpty) return parts.join(' • ');
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
    // المحافظة («النقب») بند مكان كالبلدة: قيمتها اسمها، وتمسك المناسبات
    // التي لم تُعرف بلدتها بالضبط.
    final places = AppServices.of(context).places.catalog;
    final options = <FilterOption>[
      ...places.towns.map((t) => FilterOption(kind: 'town', id: t, label: t)),
      ...places.regions.map(
        (r) => FilterOption(kind: 'town', id: r.name, label: '${r.name} (بلا بلدة محدّدة)'),
      ),
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
    final towns = result.where((t) => t.kind == 'town').map((t) => t.id as String).toList();
    final villages = result.where((t) => t.kind == 'village').map((t) => t.id as int).toList();
    // «تطبيق» بلا تغيير فعلي ليس تغيير فلتر — لا لقطة ولا جلب ولا قفز.
    if (listEquals(towns, _selectedTowns) && listEquals(villages, _selectedVillageIds)) {
      return;
    }
    _captureSnapshot();
    setState(() {
      _selectedTowns = towns;
      _selectedVillageIds = villages;
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
    final kinds = result.map((t) => t.id as int).toList();
    if (listEquals(kinds, _selectedOccasionTypeIds)) return;
    _captureSnapshot();
    setState(() {
      _selectedOccasionTypeIds = kinds;
    });
    _loadFirstPage();
  }

  /// ورقة التاريخ: كل التواريخ، الأيام الجاهزة، أو يوم من منتقي التاريخ.
  Future<void> _openDateFilter() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      // ستّة بنود وعنوان تتجاوز سقف ٩/١٦ الافتراضي على هاتف قصير؛ الورقة
      // بارتفاع محتواها، وتُمرَّر إن لم تتّسع الشاشة.
      isScrollControlled: true,
      backgroundColor: context.c.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) {
        Widget option(String key, String label, IconData icon) {
          final selected = key == 'all'
              ? _dateFilter == null
              : _dateFilter?.key == key;
          return ListTile(
            leading: Icon(icon, color: selected ? sheetContext.c.sky : sheetContext.c.inkFaint),
            title: Text(
              label,
              style: TextStyle(
                fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                color: sheetContext.c.ink,
              ),
            ),
            trailing: selected ? Icon(Icons.check, color: sheetContext.c.sky) : null,
            onTap: () => Navigator.of(sheetContext).pop(key),
          );
        }

        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 6),
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Text(
                      'تاريخ المناسبة',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: sheetContext.c.ink,
                      ),
                    ),
                  ),
                ),
                option('all', 'كل التواريخ', Icons.all_inclusive),
                for (final key in FeedDateFilter.presets)
                  option(key, FeedDateFilter.presetLabel(key), Icons.event_outlined),
                option(
                  'day',
                  _dateFilter?.key == 'day' ? _dateFilter!.label : 'اختر يوماً…',
                  Icons.calendar_month_outlined,
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
    if (choice == null || !mounted) return;

    FeedDateFilter? next;
    if (choice == 'day') {
      final now = DateTime.now();
      final picked = await showDatePicker(
        context: context,
        initialDate: _dateFilter?.key == 'day' ? _dateFilter!.from : now,
        firstDate: DateTime(2020),
        lastDate: DateTime(now.year + 2, 12, 31),
        helpText: 'اختر يوم المناسبة',
      );
      if (picked == null || !mounted) return;
      next = FeedDateFilter.day(picked);
    } else if (choice != 'all') {
      next = FeedDateFilter.preset(choice, DateTime.now());
    }
    // إعادة اختيار التاريخ نفسه (أو «كل التواريخ» وهي كذلك) ليست تغييراً.
    if (next?.key == _dateFilter?.key && next?.fromParam == _dateFilter?.fromParam) {
      return;
    }
    _captureSnapshot();
    setState(() => _dateFilter = next);
    _loadFirstPage();
  }

  void _clearFilters() {
    // «مسح» بلا فلتر نشِط لا يغيّر ما هو معروض: لا لقطة ولا جلب.
    final hadFilters = _selectedTowns.isNotEmpty ||
        _selectedVillageIds.isNotEmpty ||
        _selectedOccasionTypeIds.isNotEmpty ||
        _dateFilter != null;
    if (!hadFilters) return;
    _captureSnapshot();
    setState(() {
      _selectedTowns = const [];
      _selectedVillageIds = const [];
      _selectedOccasionTypeIds = const [];
      _dateFilter = null;
    });
    _loadFirstPage();
  }

  void _onArchiveToggled(bool value) {
    if (value == _archive) return;
    _captureSnapshot();
    _archive = value;
    _loadFirstPage();
  }

  Future<void> _openEvent(int eventId) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: eventId)),
    );
    // تحديث في المكان لا `_loadFirstPage`: تلك تقفز إلى أوّل كرت، فمن نزل في
    // التغذية وفتح مناسبة كان يعود إلى رأس القائمة لا إلى حيث وصل.
    _refreshInPlace();
  }

  Future<void> _openCongratulations(Event event) async {
    await showCongratulationsListSheet(
      context,
      eventId: event.id,
      onChanged: _refreshInPlace,
    );
  }

  Future<void> _toggleRemind(Event event) async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لحفظ المناسبة في قائمتك');
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
      // التغيير وقع على الخادم فعلاً — «قائمتي» تجلب نفسها عند ظهورها،
      // والإشارة تُكتب من كل شاشة تبدّل الحفظ كي لا يفوت تغييرٌ متكرّر
      // القيمة (سجلّ واحد لآخر تغيير، لا سجلّ لكل شاشة).
      services.myListRevision.value++;
      services.savedChange.value = (eventId: event.id, saved: !event.isReminded);
      if (!mounted) return;
      if (event.isReminded) {
        showMessage(context, 'أُزيلت من قائمتي');
      } else {
        final viewMyList = SnackBarAction(
          label: 'عرض',
          textColor: context.c.sky,
          onPressed: services.openMyList,
        );
        if (!willAlarm) {
          // الحفظ وقع؛ رفض الإذن يمنع المنبّه لا الحفظ — رسالة واحدة تقول
          // الاثنين، ومعها «عرض» كالرسالة العادية.
          showMessage(
            context,
            'أُضيفت إلى قائمتي، لكن هذا الجهاز لن ينبّهك لأنّك رفضت إذن '
            'الإشعارات — فعّله من إعدادات النظام كي يصلك المنبّه',
            isError: true,
            action: viewMyList,
          );
        } else {
          showMessage(context, 'أُضيفت إلى قائمتي', action: viewMyList);
        }
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

  /// مدخل «ألبومات الأعراس» — كبسة واحدة في الشريط العائم فوق التغذية، تُرى في
  /// أول إطار بلا فتح الكروم (تذكرة #101، القرار D11). نقرة واحدة تفتح البحث،
  /// لا نقرة على كبسة الفلاتر ثم أيقونة داخل كروم منسدل.
  Widget _albumsEntryChip() {
    return Material(
      key: const Key('albums_entry_chip'),
      color: Colors.black.withValues(alpha: 0.60),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AlbumsScreen()),
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.photo_library_outlined, color: Colors.white, size: 18),
              SizedBox(width: 6),
              Text(
                'ألبومات الأعراس',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.bold,
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
                          // الأجندة · التحديث · الدعم · الجرس للمسجَّل
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
                                    // تحديث في المكان: الصفحة الأولى تُستبدل
                                    // والكرت المعروض يبقى أمام المستخدم بدل
                                    // أن يقفز إلى أوّله.
                                    await _refreshInPlace();
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
                      SizedBox(
                        width: double.infinity,
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final narrow = constraints.maxWidth < 390;
                            final audioAuth = Container(
                              key: const Key('feed_audio_auth_container'),
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
                                      constraints: BoxConstraints.tightFor(
                                        width: narrow ? 36 : 48,
                                        height: narrow ? 36 : 48,
                                      ),
                                      padding: EdgeInsets.zero,
                                      visualDensity: VisualDensity.compact,
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
                                  AuthActionButton(
                                    stacked: narrow,
                                    color: Colors.white,
                                  ),
                                ],
                              ),
                            );
                            // كبسة البث انتقلت إلى شريط الستوريات أدناه (مدخل
                            // واحد لها)، والتحكّم بالصوت يبقى في طرفه كما كان.
                            return Align(
                              alignment: AlignmentDirectional.centerEnd,
                              child: audioAuth,
                            );
                          },
                        ),
                      ),
                      // «ألبومات الأعراس» (تذكرة #101، القرار D11): صفّه الخاص
                      // تحت صفّ الصوت والدخول، لأن صفَّي الشريط ممتلئان على
                      // هاتف ٣٦٠ — إقحامُ كبسة ثالثة فيهما أسقط live_test بفيض
                      // ٦٨ بكسل. والشريط عائم فلا يدفع التغذية، لكنه يغطّي
                      // شريطاً من أعلى الكرت الأول — ثمنٌ مقبول مقابل مدخل
                      // يُرى بلا نقرة.
                      const SizedBox(height: 6),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: _albumsEntryChip(),
                      ),
                      // شريط الستوريات ظاهر هنا دائماً لا داخل لوح الفلاتر:
                      // كبسة البث أوله ثم ستوريات التسويق. ارتفاعه محدود
                      // (`_storiesStripHeight`) لأنه عائم لا يدفع التغذية.
                      _StoriesStrip(
                        future: _stories,
                        channel: _liveChannel,
                        onLiveTap: () => openLiveScreen(context),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // 3. لوحة الفلاتر والبحث المنسدلة (تظهر عند الضغط على الكبسة)
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
                              icon: const Icon(Icons.photo_library_outlined),
                              tooltip: 'ألبومات الأعراس',
                              onPressed: () {
                                setState(() => _showTopChrome = false);
                                Navigator.of(context).push(
                                  MaterialPageRoute(builder: (_) => const AlbumsScreen()),
                                );
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.support_agent_rounded, color: Color(0xFF25D366)),
                              tooltip: 'الدعم الفني عبر واتساب',
                              onPressed: () => openSupportWhatsApp(context),
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
                      // كبسة البث والستوريات في الشريط الظاهر على التغذية
                      // وحدها؛ لا نسخة ثانية لهما داخل اللوح.
                      _SearchBar(
                        controller: _searchController,
                        onChanged: _onSearchChanged,
                      ),
                      _FilterChipsRow(
                        placeLabel: _placeChipLabel,
                        kindLabel: _kindChipLabel,
                        dateLabel: _dateChipLabel,
                        onPlaceTap: _openPlaceFilter,
                        onKindTap: _openKindFilter,
                        onDateTap: _openDateFilter,
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
                      : _dateFilter != null
                          ? 'لا توجد مناسبات في $_placeDescriptionForEmptyState — ${_dateFilter!.label}'
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
            // قفزة الرجوع للقطة ليست تمريراً من المستخدم، فلا تجلب «المزيد».
            if (_restoringSnapshot) return;
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
          ),
        // لا زرّ «عرض المزيد» عائم: كان يغطّي صفّ أزرار الكرت نفسه، والصفحة
        // التالية تُجلب تلقائياً من `onPageChanged` قبل آخر كرتين أصلاً.
      ],
    );
  }
}

/// لقطة ما قبل تغيير الفلتر — القائمة وموضع الكرت والفلتر كاملاً. تُعاد
/// بـ`setState` و`jumpToPage` بلا طلب شبكة، فلا يضيع تقدّم القائمة.
class _ResultsSnapshot {
  const _ResultsSnapshot({
    required this.events,
    required this.pagination,
    required this.index,
    required this.search,
    required this.towns,
    required this.villages,
    required this.kinds,
    required this.archive,
    required this.dateFilter,
  });

  final List<Event> events;
  final Pagination? pagination;
  final int index;
  final String search;
  final List<String> towns;
  final List<int> villages;
  final List<int> kinds;
  final bool archive;
  final FeedDateFilter? dateFilter;
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

/// صفّ رقاقات المكان والنوع والتاريخ + «مسح الفلاتر» — بدل شريطين زاحفين كانا يأكلان
/// أعلى الشاشة (#85 خطوة 40-46). ارتفاع ثابت ٥٢ بكسل (٨ حشو + ٣٦ رقاقة + ٨
/// حشو) — نفس الرقم الذي تنصّ عليه المواصفة لِما تستردّه هذه الدفعة من أعلى
/// كل شاشة. «مسح الفلاتر» ظاهرة دائماً لا فقط عند وجود اختيار (قصة 45): تغذية
/// فارغة بلا زرّ ظاهر لغزٌ لا تفسير له.
class _FilterChipsRow extends StatelessWidget {
  const _FilterChipsRow({
    required this.placeLabel,
    required this.kindLabel,
    required this.dateLabel,
    required this.onPlaceTap,
    required this.onKindTap,
    required this.onDateTap,
    required this.onClearTap,
  });

  final String placeLabel;
  final String kindLabel;
  final String dateLabel;
  final VoidCallback onPlaceTap;
  final VoidCallback onKindTap;
  final VoidCallback onDateTap;
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
              _FilterChip(icon: Icons.event_outlined, label: dateLabel, onTap: onDateTap),
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

/// سقف ارتفاع شريط الستوريات: الكروم عائم لا يدفع التغذية، فكل زيادة تغطّي
/// طرفاً من أعلى الكرت الأول. (إقحام كبسة ثالثة في صفّ الأيقونات أسقط
/// `live_test` بفيض ٦٨ بكسل سابقاً — فالسقف هنا ٨٤ والتصميم تحته بهامش.)
const double _storiesStripHeight = 82;

/// شريط الستوريات الظاهر دائماً في الكروم: كبسة البث أولاً — فعل مستقل يبقى
/// وحده إن لم تصل ستوريات — ثم ستوريات التسويق أفقياً.
class _StoriesStrip extends StatelessWidget {
  const _StoriesStrip({
    required this.future,
    required this.channel,
    required this.onLiveTap,
  });

  final Future<List<Story>>? future;
  final LiveChannel? channel;
  final VoidCallback onLiveTap;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Story>>(
      future: future,
      builder: (context, snapshot) {
        final stories = snapshot.data ?? const <Story>[];

        return SizedBox(
          key: const Key('stories_strip'),
          height: _storiesStripHeight,
          child: Row(
            children: [
              // أول عنصر في الجهة اليمنى (RTL) — كبسة البث على محاذاة صفّ
              // «ألبومات الأعراس» فوقها (الحشو في عمود الكروم).
              _LiveStoryTile(channel: channel, onTap: onLiveTap),
              // بلا ستوريات: الكبسة وحدها بلا فاصل ولا شريط فارغ.
              if (stories.isNotEmpty) ...[
                Container(
                  width: 1,
                  height: 54,
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  color: context.c.line,
                ),
                Expanded(
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// كبسة البث في أول الشريط: مربّع متدرّج بزوايا ١٨، ظاهر دائماً حتى بلا بثّ،
/// وشارة «مباشر» وحدها تتبع `channel.isLive` — داخل المربّع كي لا يُقصّ رسمها.
class _LiveStoryTile extends StatelessWidget {
  const _LiveStoryTile({required this.channel, required this.onTap});

  final LiveChannel? channel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final live = channel?.isLive ?? false;
    return GestureDetector(
      key: const Key('stories_live_tile'),
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                // الأحمران الجديدان الوحيدان في هذه المهمة.
                gradient: const LinearGradient(
                  colors: [Color(0xFFEF4444), Color(0xFFF59E0B)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.live_tv_rounded, color: Colors.white, size: 22),
                  if (live) ...[
                    const SizedBox(height: 3),
                    Container(
                      key: const Key('stories_live_badge'),
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: context.c.danger,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white, width: 0.8),
                      ),
                      child: const Text(
                        'مباشر',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 8,
                          height: 1.1,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 5),
            // تصغير لا قصّ: التسمية تُقرأ كاملة حتى على شاشة ضيّقة.
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                'البث المباشر',
                maxLines: 1,
                style: TextStyle(fontSize: 11, color: context.c.inkSoft),
              ),
            ),
          ],
        ),
      ),
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
                  children: [
                    Text(
                      'الإشعارات',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: sheetContext.c.ink,
                      ),
                    ),
                    const Spacer(),
                    // «جعل الكل مقروء» لا يحذف شيئاً — القائمة تبقى باهتة والعدّاد
                    // الأحمر يختفي؛ «مسح الكل» بجانبه لمن يريد التنظيف فعلاً.
                    if (_notifications.any((n) => !n.isRead))
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                        ),
                        onPressed: () async {
                          try {
                            await api.markAllNotificationsRead();
                            if (mounted) {
                              setState(() => _notifications =
                                  _notifications.map((n) => n.asRead()).toList());
                            }
                            setSheetState(() {});
                          } catch (_) {
                            if (sheetContext.mounted) {
                              showMessage(sheetContext, 'تعذّر تعليم الإشعارات كمقروءة', isError: true);
                            }
                          }
                        },
                        icon: Icon(Icons.done_all, size: 18, color: sheetContext.c.sky),
                        label: Text(
                          'جعل الكل مقروء',
                          style: TextStyle(fontSize: 13, color: sheetContext.c.sky),
                        ),
                      ),
                    if (_notifications.isNotEmpty)
                      TextButton.icon(
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                        ),
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
                          // غير المقروء بنقطة حمراء وخطّ عريض؛ المقروء يبقى باهتاً
                          // بلا نقطة (طلب المالك 2026-10-02).
                          title: Row(
                            children: [
                              if (!n.isRead) ...[
                                Container(
                                  key: const ValueKey('notif_unread_dot'),
                                  width: 9,
                                  height: 9,
                                  decoration: BoxDecoration(
                                    color: context.c.danger,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              Expanded(
                                child: Text(
                                  n.title,
                                  style: TextStyle(
                                    fontWeight: n.isRead ? FontWeight.normal : FontWeight.bold,
                                    color: n.isRead ? context.c.inkSoft : context.c.ink,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          subtitle: Text(
                            n.body,
                            style: TextStyle(
                              color: n.isRead ? context.c.inkFaint : context.c.inkSoft,
                            ),
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
                          // النقر يعلّم الإشعار مقروءاً ويفتح وجهته — لا يحذفه؛
                          // الحذف لزرّ ✕ و«مسح الكل» وحدهما.
                          onTap: () async {
                            Navigator.of(sheetContext).pop();
                            if (!n.isRead) {
                              try {
                                if (n.isBroadcast) {
                                  await api.dismissBroadcast(n.broadcastId!);
                                } else {
                                  await api.markNotificationRead(n.id!);
                                }
                                if (mounted) {
                                  setState(() {
                                    _notifications = _notifications
                                        .map((item) => identical(item, n) ? item.asRead() : item)
                                        .toList();
                                  });
                                }
                              } catch (_) {
                                // لا يعطّل فتح المناسبة إن فشل تعليم القراءة.
                              }
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
