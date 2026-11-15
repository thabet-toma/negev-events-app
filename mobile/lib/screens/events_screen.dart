import 'dart:async';

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../api/negev_api.dart' show NegevApi, Village;
import '../main.dart';
import '../models/event.dart';
import '../models/live.dart';
import '../models/notification.dart' as notif;
import '../models/stats_ticker.dart';
import '../state/audio_coordinator.dart';
import '../state/home_ticker.dart';
import '../state/rate_us.dart';
import '../theme.dart';
import '../widgets/async_view.dart'
    show openSupportWhatsApp, showMessage;
import '../widgets/auth_action_button.dart';
import '../widgets/congratulations.dart';
import '../widgets/event_card.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/motion.dart';
import '../widgets/rate_us_prompt.dart';
import '../widgets/region_banner.dart';
import 'add_event_screen.dart';
import 'agenda_screen.dart';
import 'albums_screen.dart';
import 'edit_event_screen.dart';
import 'event_details_screen.dart';
import 'live_screen.dart';
import 'story_viewer_screen.dart';

/// أقصى ارتفاع لشريط الإعلانات في الكروم الثابت: كرت إعلان واحد كاملاً — شريط
/// الخبر، والملصق، والعنوان، وأسطر التاريخ والمكان والعائلة، وسطر التغيير —
/// وطرفُ الذي يليه، فيُقرأ أنّ تحته المزيد. وما زاد يُمرَّر داخل الشريط. سقفٌ
/// لازم لأنّ الكروم غير قابل للتمرير وتحته `Expanded`.
const double _announcementsMaxHeight = 320;

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
  const EventsScreen({super.key, this.isActive = true, this.topRequest});

  /// هل تبويب المناسبات هو المختار الآن؟ `IndexedStack` في `HomeShell` يُبقي
  /// الشاشة حيّة خلف التبويبات الأخرى، فلا بدّ أن تُخبَر صراحةً.
  final bool isActive;

  /// إشارة الشعار في ترويسة الهيكل: كل زيادة تقفز بالقائمة إلى قمّة التغذية (#157).
  ///
  /// إشارة لا استدعاء — الهيكل لا يعرف `_feedScroll` ولا كيف تُبنى القائمة،
  /// والكبسة لا تغيّر فلتراً ولا تجلب صفحة أولى: قفزٌ إلى `0` وحده، فما
  /// اختاره المستخدم من فلتر ونتائج يبقى كما هو، ويُظهر الرأس مع الكرت الأول.
  final ValueNotifier<int>? topRequest;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> with RouteAware {
  final _searchController = TextEditingController();
  final _feedScroll = ScrollController();
  final _headerKey = GlobalKey();
  final _feedHeaderKey = GlobalKey();
  double _headerExtent = 0;
  double _feedHeaderExtent = 0;
  double _cardExtent = 0;
  bool _headerMeasureScheduled = false;

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

  /// «كل المحافظات» (#161): علَم `all_regions=1` يُرسَل مع جلب هذه التغذية
  /// وطلبات الترقيم التابعة لها، بعد «وسّع إلى كل المحافظات» في الحالة الفارغة.
  /// في الشاشة لا في `api.client.regionId`: تلك ترويسة مشتركة لكل النداءات،
  /// والعلَم يتجاوز تقييد المحافظة **لهذه التغذية وحدها**. واختيار محافظة
  /// صريح يبدّل مفتاح `HomeShell` فيُعاد بناء الشاشة، فيبدأ العلَم مغلقاً.
  bool _allRegions = false;

  /// `null` = كل التواريخ.
  FeedDateFilter? _dateFilter;
  /// إظهار/إخفاء لوح الفلاتر والبحث — مخفي افتراضياً لتبقى الكروت أكبر
  /// مساحة، ويُفتح بكبسة «الفلاتر والبحث» في صفّ الرأس فوق التغذية.
  bool _showTopChrome = false;
  Timer? _debounce;

  StreamSubscription<Map<String, dynamic>>? _newEventSub;
  StreamSubscription<void>? _liveStatusSub;

  /// هل طُلبت الستوريات مرّة؟ مِزلاج `didChangeDependencies` وحده — القائمة
  /// نفسها تصل في [_storiesList]، فلا `Future` محفوظ لا يقرأه أحد (تذكرة #173).
  bool _storiesRequested = false;

  /// الستوريات بعد وصولها — تحمل المواضع الثلاثة (تذكرة #173)، وكل موضع
  /// يرشّح نسخته: الشريط `bar` والكاروسيل `carousel` والإعلان بين الكروت
  /// `feed`. نسخة محلّية لا `FutureBuilder` حول كل موضع، لأن إعلان التغذية
  /// يُبنى داخل `_buildList` نفسها — نفس نمط `_types`/`_typesList` أدناه.
  List<Story> _storiesList = const [];

  /// فاصل إعلان التغذية — من `feed_ad_interval` في ردّ الستوريات (تذكرة #173).
  /// القيمة الفعلية تصل مع الردّ في [_loadStories]، والاحتياط ٨
  /// (`NegevApi.defaultFeedAdInterval`) حين يغيب المفتاح أو يكون غير صالح —
  /// لا رقم ثانياً في هذه الشاشة.
  int _feedAdInterval = NegevApi.defaultFeedAdInterval;

  /// بطاقة الدخول التسويقية (T-14): قصة واحدة تظهر مرّة عند فتح التغذية،
  /// تشير إلى الستوري، وتختفي بمؤقّت أو بزرّ إغلاق. [Story] وحدها تُرسَم؛
  /// [_entryCardVisible] وحدها تحكم الظهور كي يبقى الإخفاء بلا فقدان القصة.
  Story? _entryStory;
  bool _entryCardVisible = false;

  /// بطاقة واحدة لكل شاشة/تشغيل: تُرفع قبل النداء نفسه، فلا يُعاد الطلب مع
  /// كل `didChangeDependencies` ولا بعد سحبٍ للتحديث.
  bool _entryCardShown = false;
  Timer? _entryCardTimer;

  /// حالة البث لكبسة الشريط وشارتها — `null` قبل أول ردّ أو عند فشله،
  /// والكبسة ظاهرة وقابلة للكبس في الحالتين.
  LiveChannel? _liveChannel;

  /// التعميم الحيّ وشريط الإحصاءات (#172) يعيشان في `AppServices.homeTicker`
  /// وحده — مشتركين بين الهيكل وهذه الشاشة، ومصدر العرض والإغلاق واحد. لا
  /// لقطة محلية هنا: لقطة محلية كانت تسمح بشريطين لتعميم واحد.
  Future<List<OccasionType>>? _types;
  Future<List<Village>>? _villages;

  /// نُسختان محلّيتان من نتيجة `_types`/`_villages` — تُستعملان لتسمية رقاقة
  /// الفلتر المغلقة («رهط +٢») بلا `FutureBuilder` حول كل رقاقة (#85 خطوة 44).
  List<OccasionType> _typesList = const [];
  List<Village> _villagesList = const [];

  List<Event> _events = const [];
  List<Announcement> _announcements = const [];
  Pagination? _pagination;

  /// «الأكثر تفاعلاً هذا الأسبوع» (تذكرة #177) كما وصلت من الخادم — بلا
  /// ترشيح ولا ترتيب هنا: النافذة والبوابة والعزاء والحدّ والترتيب كلها في
  /// `listTrendingEvents`. فارغة = لا شريط في الشجرة أصلاً (لا مساحة محجوزة).
  List<Event> _trending = const [];

  /// تسلسل نداءات الشريط: ردٌّ متأخر لمحافظة أو وضع سابق يُهمَل، ولا يرسم
  /// بطاقاتٍ فوق ما يخصّ الشاشة الآن.
  int _trendingSeq = 0;
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
  /// زرّ الرجوع في الرسالة يعيدها كاملة بـ`setState` والقفز للموضع بلا طلب
  /// شبكة. `null` = لا شيء يُعاد إليه، فلا تُعرض الرسالة.
  _ResultsSnapshot? _snapshot;

  /// هل تنتظر اللقطة وصول نتائج التغيير كي تُعرض رسالة الرجوع؟ تُطفأ بعد العرض.
  bool _snapshotPending = false;

  /// `_onFeedScroll` الناتج عن القفز في `_restoreSnapshot` لا يجوز أن
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
  void initState() {
    super.initState();
    _feedScroll.addListener(_onFeedScroll);
    widget.topRequest?.addListener(_jumpToFirstCard);
  }

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
    if (!_storiesRequested) {
      _storiesRequested = true;
      _loadStories();
    }
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
      // «الأكثر تفاعلاً» (تذكرة #177) مع أول تحميل — قسمٌ واحد لا ينتظر أي
      // سطح آخر، ولا مستمع `RegionStore` جديد: التغذية لا تسمعه اليوم،
      // وسماعُ القسم وحده يجعله يخالفها.
      _loadTrending();
      _loadLiveChannel();
      // شريط الإحصاءات والتعميم (#172): المخزن المشترك يحمّل مرّة واحدة، وإن
      // سبقه الهيكل (وهو الأصل) لا يتضاعف النداء.
      AppServices.of(context).homeTicker.ensureLoaded();
      // بعد أول إطار: بطاقة الدخول نداء ثانٍ لا يشترك في بناء التغذية، فلا
      // يؤخّر أول كرت ولا يمنع ظهوره إن تأخّر.
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowEntryCard());
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

  /// GET /api/stories — تحمل كل المواضع وفاصل إعلان التغذية، وكل موضع يرشّح
  /// نسخته من [_storiesList]. النسخة المحلّية لازمة لأن إعلان «بين الكروت»
  /// يُبنى داخل `_buildList` بلا `FutureBuilder` (تذكرة #173)، على نمط
  /// `_types`/`_typesList` نفسه. الفشل صامت: التغذية لا تنتظر الستوريات.
  void _loadStories() {
    AppServices.of(context).api.stories().then(
      (result) {
        if (mounted) {
          setState(() {
            _storiesList = result.stories;
            _feedAdInterval = result.feedAdInterval;
          });
        }
      },
      // فشل جلب الستوريات يُسكَت ولا يمنع التغذية — الشريط والكاروسيل يبقيان
      // كما هما، والسحب للتحديث يعيد المحاولة. (بلا هذا كان الخطأ يخرج غير
      // مُلتقَط إلى منطقة الجذر.)
      onError: (_) {},
    );
  }

  /// ستوريات موضع واحد (تذكرة #173). غياب `placement` في ردّ قديم يُقرأ `bar`
  /// في `Story.fromJson`، فلا تختفي ستوري من الشريط بسبب مفتاح غائب.
  List<Story> _storiesFor(String placement) =>
      _storiesList.where((story) => story.placement == placement).toList(growable: false);

  /// صفحات التغذية: كروت المناسبات، وبينها إعلانات ستوريات `feed` بالتناوب
  /// بعد كل [_feedAdInterval] كرت (ثم ضعفه …). الفاصل من ردّ الخادم لا رقم
  /// ثابت هنا (تذكرة #173). بلا ستوريات `feed` — أو بقائمة أقصر من الفاصل —
  /// النتيجة هي `_events` نفسها بلا أي إدراج، فلا يتغيّر سلوك التغذية القائمة.
  List<_FeedEntry> _composeFeedPages([List<Event>? events]) {
    final list = events ?? _events;
    final ads = _storiesFor('feed');
    final pages = <_FeedEntry>[];
    var adsShown = 0;
    for (var index = 0; index < list.length; index += 1) {
      pages.add(_FeedEntry.event(list[index], index));
      final position = index + 1;
      if (ads.isEmpty || position % _feedAdInterval != 0) continue;
      final adIndex = adsShown % ads.length;
      pages.add(_FeedEntry.ad(ads[adIndex], position, adIndex));
      adsShown += 1;
    }
    return pages;
  }

  /// المناسبة المعروضة في الصفحة `page` — `null` حين تكون الصفحة إعلاناً.
  Event? _eventAtPage(int page) {
    final pages = _composeFeedPages();
    if (page < 0 || page >= pages.length) return null;
    return pages[page].event;
  }

  /// آخر مناسبة عند الصفحة `page` أو قبلها: اللقطة والتحديث في المكان لا
  /// يقفزان إلى أول التغذية حين يكون المعروض إعلاناً بين كروت.
  Event? _eventAtOrBeforePage(int page) {
    final pages = _composeFeedPages();
    if (pages.isEmpty) return null;
    for (var index = page >= pages.length ? pages.length - 1 : page; index >= 0; index -= 1) {
      final event = pages[index].event;
      if (event != null) return event;
    }
    return null;
  }

  /// صفحة أول ظهور لمناسبة `eventId` في قائمة معيّنة — ‎-1 حين لا تكون فيها
  /// (فتُتجاهل النتيجة بدل القفز إلى الأول سهواً). المؤشّر بعدد الإعلانات
  /// قبلها، فترتيب المناسبة في `events` ليس رقم صفحتها.
  int _pageForEventIdIn(List<Event> events, int? eventId) {
    if (eventId == null) return 0;
    return _composeFeedPages(events).indexWhere((entry) => entry.event?.id == eventId);
  }

  /// بطاقة الدخول التسويقية — تُطلب مرّة واحدة لكل شاشة/تشغيل، بعد أول إطار.
  ///
  /// [_entryCardShown] تُرفع **قبل** النداء لا بعده: فشل الشبكة أو ردّ بلا
  /// قصة لا يجوز أن يُعيد المحاولة مع كل `didChangeDependencies` فيصير نداءً
  /// متكرّراً على بطاقة تسويقية. و`NegevApi.entryCard` لا يرمي أصلاً، فالبطاقة
  /// لا تُفشل التغذية بأي حال.
  Future<void> _maybeShowEntryCard() async {
    if (_entryCardShown || !mounted) return;
    _entryCardShown = true;

    final card = await AppServices.of(context).api.entryCard();
    if (!mounted) return;
    final story = card.story;
    if (!card.enabled || story == null) return;

    setState(() {
      _entryStory = story;
      _entryCardVisible = true;
    });
    _entryCardTimer?.cancel();
    _entryCardTimer = Timer(const Duration(seconds: 3), _hideEntryCard);
  }

  /// إخفاء البطاقة — من مؤقّتها أو من زرّ إغلاقها أو بعد فتح الستوري منها.
  /// القصة تبقى في [_entryStory] كي لا يضيع المرجع أثناء تحريك الإخفاء.
  void _hideEntryCard() {
    _entryCardTimer?.cancel();
    _entryCardTimer = null;
    if (!mounted) return;
    setState(() => _entryCardVisible = false);
  }

  /// يفتح العارض على قائمة موضع واحد ويبدأ من الحلقة المنقورة (تذكرة #173):
  /// العارض نفسه هو من يسجّل المشاهدة بعد ثانيتين، فالمشاهدة تُقاس من كل موضع
  /// بالمسار نفسه لا بنسخة ثانية لكل موضع.
  void _openStoryList(List<Story> stories, int index) {
    if (stories.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryViewerScreen(stories: stories, initialIndex: index),
      ),
    );
  }

  /// يفتح عارض الستوري على قصة البطاقة وحدها من حلقتها الأولى، ثم يخفي البطاقة:
  /// البطاقة مدخل لا شريط — العارض هو ما يُقرأ بعده.
  void _openEntryStory(Story story) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryViewerScreen(stories: [story], initialIndex: 0),
      ),
    );
    _hideEntryCard();
  }

  @override
  void didUpdateWidget(covariant EventsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // إشارة الشعار تُلتقط بالإشارة لا بالإرسال: لو جاءت مختلفة عن السابقة
    // فالقديمة تُفكّ أوّلاً، فلا مستمعَ باقٍ على `ValueNotifier` هُجر.
    if (oldWidget.topRequest != widget.topRequest) {
      oldWidget.topRequest?.removeListener(_jumpToFirstCard);
      widget.topRequest?.addListener(_jumpToFirstCard);
    }
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
    _entryCardTimer?.cancel();
    _newEventSub?.cancel();
    _liveStatusSub?.cancel();
    _savedChange?.removeListener(_handleSavedChange);
    widget.topRequest?.removeListener(_jumpToFirstCard);
    _feedScroll.removeListener(_onFeedScroll);
    _searchController.dispose();
    _feedScroll.dispose();
    super.dispose();
  }

  void _scheduleMeasureHeader() {
    if (_headerMeasureScheduled) return;
    _headerMeasureScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _headerMeasureScheduled = false;
      _measureHeader();
    });
  }

  void _measureHeader() {
    if (!mounted || _showTopChrome) return;
    final fhCtx = _feedHeaderKey.currentContext;
    if (fhCtx != null) {
      final fhBox = fhCtx.findRenderObject() as RenderBox?;
      if (fhBox != null && fhBox.hasSize) {
        _feedHeaderExtent = fhBox.size.height;
      }
    }
    final ctx = _headerKey.currentContext;
    if (ctx == null) return;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final next = box.size.height;
    if ((next - _headerExtent).abs() <= 0.5) return;
    final prev = _headerExtent;
    _headerExtent = next;
    if (!_restoringSnapshot &&
        prev > 0 &&
        _feedScroll.hasClients &&
        _feedScroll.offset >= prev - 1.0 &&
        !_feedScroll.position.isScrollingNotifier.value) {
      final max = _feedScroll.position.maxScrollExtent;
      final adjusted = (_feedScroll.offset + (next - prev)).clamp(0.0, max);
      if ((adjusted - _feedScroll.offset).abs() > 0.5) {
        _feedScroll.jumpTo(adjusted);
      }
    }
  }

  void _jumpToCard(int pageIndex) {
    if (!_feedScroll.hasClients) return;
    _measureHeader();
    final target = pageIndex <= 0
        ? 0.0
        : _headerExtent + pageIndex * _cardExtent;
    final max = _feedScroll.position.maxScrollExtent;
    _feedScroll.jumpTo(target.clamp(0.0, max));
  }

  void _onFeedScroll() {
    if (!_feedScroll.hasClients || _cardExtent <= 0 || _events.isEmpty) return;
    final pages = _composeFeedPages();
    if (pages.isEmpty) return;
    final raw = ((_feedScroll.offset - _headerExtent) / _cardExtent).round();
    final index = raw.clamp(0, pages.length - 1);
    if (index == _currentPage) return;
    _currentPage = index;
    _autoplayCurrent();
    // قفزة الرجوع للقطة ليست تمريراً من المستخدم، فلا تجلب «المزيد».
    if (_restoringSnapshot) return;
    final hasMore = _pagination?.hasMore ?? false;
    if (index >= pages.length - 2 && hasMore && !_loadingMore) {
      _loadMore();
    }
  }

  /// كبسة شعار الهيكل على وجهة «المناسبات» نفسها: صعود إلى قمّة التغذية.
  ///
  /// تمريرٌ وحده — لا `_loadFirstPage` ولا `force`: الفلتر المختار والنتائج
  /// المعروضة تبقى كما هي، ويعود إلى `0` ليظهر الرأس مع الكرت الأول.
  ///
  /// وقبل الصعود يُغلق لوح الفلاتر (`_showTopChrome`): طبقةٌ داخل هذه الشاشة
  /// لا مسارٌ في `Navigator`، فلا يغطّي ترويسة الهيكل ولا يغلقه شيء فوقها —
  /// الشعار يبقى مرئياً وقابلاً للنقر وهي مفتوحة، فيجب أن تُغلق هي أيضاً كي
  /// يعني «الرئيسية» ما يقوله (#157). والإغلاق قبل حارس `hasClients` كي لا
  /// يبقى اللوح معلَّقاً حين لا تكون القائمة مبنية (تحميل أوّلي، خطأ، فراغ).
  void _jumpToFirstCard() {
    if (!mounted) return;
    if (_showTopChrome) setState(() => _showTopChrome = false);
    if (!_feedScroll.hasClients) return;
    _feedScroll.jumpTo(0);
  }

  /// يشغّل صوت الكرت الظاهر الآن — أو يُسكت ما شغّلته التغذية إن لم يكن له
  /// صوت. لا شيء والتبويب غير مختار أو شاشة أخرى فوقه. وصفحة إعلانٍ بين
  /// الكروت (تذكرة #173) لا مناسبة لها، فتُسكت بدل أن تكرّر صوت جارتها.
  void _autoplayCurrent() {
    final audio = _audio;
    if (audio == null || !widget.isActive || _covered) return;
    final event = _events.isEmpty ? null : _eventAtPage(_currentPage);
    if (event == null) {
      audio.release(this);
      return;
    }
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
            allRegions: _allRegions,
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
      if (_feedScroll.hasClients) {
        _feedScroll.jumpTo(0);
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

  /// «الأكثر تفاعلاً هذا الأسبوع» (تذكرة #177) — نداء واحد يرسم الشريط أو
  /// يُخفيه. **تُفرَّغ القائمة قبل الطلب** لا بعده (درس #175): لا تبقى بطاقات
  /// محافظة سابقة معروضة تحت تغذية محافظة جديدة أثناء انتظار الردّ. وردٌّ
  /// متأخر (`seq` مختلف) يُهمَل، وفشلُ الشبكة يتركها فارغة فيختفي الشريط بلا
  /// رسالة — القسم لا يعرض خطأً، و«لا نتيجة» حالته الطبيعية.
  Future<void> _loadTrending() async {
    final seq = ++_trendingSeq;
    if (_trending.isNotEmpty) setState(() => _trending = const []);

    List<Event> events;
    try {
      events = await AppServices.of(context).api.trendingEvents(allRegions: _allRegions);
    } catch (_) {
      events = const [];
    }

    if (!mounted || seq != _trendingSeq) return;
    setState(() => _trending = events);
  }

  /// يلتقط ما هو معروض الآن قبل أي تغيير فلتر فعلي — القائمة وموضعها والفلتر
  /// كاملاً — كي يُعاد المستخدم إلى نتائجه بضغطة واحدة.
  ///
  /// والموضع **معرّف المناسبة** لا رقم صفحتها (تذكرة #173): رقم الصفحة يتغيّر
  /// بعدد إعلانات «بين الكروت» قبلها، والمعرّف لا يتغيّر. وإعلانٌ معروض الآن
  /// لا مناسبة له، فاللقطة تقف على الكرت الذي يسبقه.
  void _captureSnapshot() {
    _snapshot = _ResultsSnapshot(
      events: _events,
      pagination: _pagination,
      eventId: _eventAtOrBeforePage(_currentPage)?.id,
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
    // صفحة المناسبة داخل التركيب الجديد (كروت + إعلانات) تُحسب من القائمة
    // المستعادة قبل `setState`، فالقفزة بعد إعادة البناء تطابق معرّفاً لا رقماً.
    final targetPage = _pageForEventIdIn(snapshot.events, snapshot.eventId);
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
      _currentPage = targetPage < 0 ? 0 : targetPage;
      _snapshot = null;
      _snapshotPending = false;
    });
    // القفزة بعد إعادة البناء: الشريحة ما زالت على عدد كروت الفلتر الجديد
    // داخل هذه اللحظة، فالقفز قبله يُقصّ إلى آخر كرت متاح.
    _restoringSnapshot = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _jumpToCard(_currentPage);
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
    final shownId = _eventAtOrBeforePage(_currentPage)?.id;
    final oldPage = _currentPage;
    final generation = _requestGeneration;
    try {
      final result = await AppServices.of(context).api.listEvents(
            towns: _selectedTowns,
            villageIds: _selectedVillageIds,
            search: _search,
            occasionTypeIds: _selectedOccasionTypeIds,
            archive: _archive,
            allRegions: _allRegions,
            dateFrom: _dateFilter?.fromParam,
            dateTo: _dateFilter?.toParam,
            page: 1,
          );
      if (!mounted || generation != _requestGeneration) return;
      // الموضع الجديد بالمعرّف لا بترتيب المناسبة: الإعلانات قبلها تُزحزح
      // رقم الصفحة وحدها (تذكرة #173).
      final index = _pageForEventIdIn(result.events, shownId);
      if (index < 0) return;
      setState(() {
        _events = result.events;
        _pagination = result.pagination;
        _announcements = result.announcements;
        _currentPage = index;
      });
      if (index != oldPage || index > 0) {
        _jumpToCard(index);
      }
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
            allRegions: _allRegions,
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
      _search.isNotEmpty;

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
    return 'الفلاتر والبحث';
  }

  /// وصف مكان الفراغ («لا توجد مناسبات في…») — يذكر الأسماء إن أمكن حلّها،
  /// وإلا العدّة، ولا يعود أبداً لاسم محافظة ثابتة طالما هناك اختيار فعلي.
  /// وبلا اختيار يقول «منطقتك» لا «النقب»: التطبيق صار يغطّي أكثر من منطقة،
  /// واسم محافظة في نصّ عام يخاطب جمهوراً ليس فيها (#127).
  String get _placeDescriptionForEmptyState {
    final total = _selectedTowns.length + _selectedVillageIds.length;
    if (total == 0) return 'منطقتك';
    final names = <String>[
      ..._selectedTowns,
      ..._selectedVillageIds.map(_villageName).where((n) => n.isNotEmpty),
    ];
    if (names.isNotEmpty) return names.join('، ');
    return total == 1 ? 'مكان واحد محدَّد' : '$total أماكن محدَّدة';
  }

  Future<void> _openPlaceFilter() async {
    // المحافظة بند مكان كالبلدة: قيمتها اسمها، وتمسك المناسبات التي لم تُعرف
    // بلدتها بالضبط. **النشطة وحدها** (تذكرة #127): الموقوفة في `regions_soon`
    // ولا صفوف لها في التغذية، فإدراجها في الفلتر يعِد بنتائج لا وجود لها.
    final places = AppServices.of(context).places.catalog;
    final options = <FilterOption>[
      ...places.towns.map((t) => FilterOption(kind: 'town', id: t, label: t)),
      ...places.activeRegions.map(
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

  /// «وسّع إلى كل المحافظات» (#161): وضعُ عرضٍ لهذه التغذية وحدها — كل جلب
  /// بعدها (الصفحة الأولى، الترقيم، السحب للتحديث) يحمل `all_regions=1` فيتجاوز
  /// الخادم تقييد المحافظة عليه.
  ///
  /// ولا يُمسّ `api.client.regionId`: تلك ترويسة مشتركة لكل النداءات، ومسحُها
  /// كان التوسيع المزعوم الذي لا يوسّع شيئاً (الخادم يحسم محافظةً دائماً:
  /// محافظة الحساب أو الافتراضية). واختيارُ محافظة صريحٍ — من «حسابي» أو من
  /// ورقة أول تشغيل — يغيّر `headerRegionId` فيُعيد `HomeShell` بناء الشاشة
  /// بمفتاح جديد، فيبدأ هذا العلَم مغلقاً ولا يبقى معلَّقاً بعد التبديل.
  void _expandToAllRegions() {
    setState(() => _allRegions = true);
    _loadFirstPage();
    // الشريط فوق الكروت يقرأ المحافظة نفسها: توسيعٌ بلا إعادة جلبه يتركه
    // يعرض محافظةً واحدة فوق تغذيةٍ فيها كل المحافظات.
    _loadTrending();
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

  /// رسائل نوع المناسبة الجاهزة (تذكرة #170) — من `GET /api/occasion-types`
  /// المحمّلة أصلاً في هذه الشاشة (`_typesList`)، لا نصّ تهنئة في الكود.
  List<OccasionMessage> _typeMessages(Event event) {
    final typeId = event.occasionType?.id;
    if (typeId == null) return const [];
    for (final type in _typesList) {
      if (type.id == typeId) return type.messages;
    }
    return const [];
  }

  /// «بارك»/«عزّي» من الكرت: ورقة «اختر رسالة» إن كان للنوع رسائل، وإلا ورقة
  /// التبريكات القائمة كما كانت — زرّ لا يفتح ورقة فارغة.
  Future<void> _openMessages(Event event) async {
    final messages = _typeMessages(event);
    if (messages.isEmpty) {
      await _openCongratulations(event);
      return;
    }
    await openMessageSheet(
      context,
      eventId: event.id,
      label: event.occasionType?.congratulationsLabel ?? 'تبريكات',
      messages: messages,
      onSuccess: _refreshInPlace,
    );
  }

  /// «جاي ✓» من الكرت (تذكرة #170): `PUT /api/events/:id/rsvp` بعدد 1 — والعدد
  /// يُعدَّل من صفحة المناسبة. و`yes` يُنشئ «ذكّرني» على الخادم (تذكرة #168)،
  /// فمنبّه الجهاز يُجدول هنا ويُقرأ الكرت «محفوظة» بنجاح الفعل نفسه.
  Future<void> _rsvpGoingFromCard(Event event) async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لتأكيد حضورك');
      return;
    }

    bool willAlarm = true;
    try {
      // العدد 1 للجواب الأول. ومن أجاب سابقاً من صفحة المناسبة بعددٍ أكبر
      // يُحفظ عدده كما هو — ضغطةٌ على الكرت ليست أمراً بمحو مرافقيه من العدّاد.
      final knownPartySize = event.myRsvp?.isGoing == true ? event.myRsvp!.partySize : 1;
      late EventRsvpState rsvpState;
      await runPositiveMoment(() async {
        rsvpState = await services.api.setRsvp(
          event.id, going: true, partySize: knownPartySize,
        );
      });
      if (!event.isReminded && rsvpState.isReminded) {
        willAlarm = await services.reminders.onReminderAdded();
      }
      services.myListRevision.value++;
      if (mounted) {
        setState(() {
          _events = _events
              .map((e) => e.id == event.id
                  ? e.copyWithReminder(
                      isReminded: rsvpState.isReminded,
                      followersCount: rsvpState.followersCount,
                      rsvpState: rsvpState,
                    )
                  : e)
              .toList();
        });
      }
      // بعد تطبيق حالة الخادم: مستمع التغذية يرى الحفظ نفسه فلا يزيد العدّاد ثانيةً.
      services.savedChange.value = (eventId: event.id, saved: rsvpState.isReminded);
      if (!mounted) return;
      if (!willAlarm) {
        showMessage(
          context,
          'سجّلنا حضورك، لكن هذا الجهاز لن ينبّهك لأنّك رفضت إذن الإشعارات — فعّله من إعدادات النظام',
          isError: true,
        );
      } else {
        showMessage(context, 'تم تسجيل حضورك — وأُضيفت إلى قائمتك');
      }
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
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
        // نجاح «ذكّرني» وحده لحظة إيجابية — الفشل يرمي قبل العدّ (تذكرة #163).
        await runPositiveMoment(() => services.api.remind(event.id));
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
      // الحوار بعد إتمام الرسالة وتبديل الكرت، لا فوقهما.
      if (!event.isReminded) await maybeShowRateUsPrompt(context);
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    }
  }

  /// مدخل «ألبومات الأعراس» — كبسة واحدة في صفّها تحت شريط الرأس، تُرى في أول
  /// إطار بلا فتح اللوح (تذكرة #101، القرار D11). نقرة واحدة تفتح البحث، لا
  /// نقرة على كبسة الفلاتر ثم أيقونة داخل لوح منسدل.
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

  /// «المناسبات المنتهية» — وضع عرض لا فلتر، فمكانه في الرأس لا في لوح
  /// الفلاتر: يراه المستخدم بلا فتح اللوح، وهو في التدفّق الطبيعي فوق الكروت
  /// فلا يطفو على أول كرت ولا يغطّي صورته.
  Widget _archiveToggleChip() {
    return Material(
      key: const Key('archive_toggle_chip'),
      color: _archive ? context.c.sky : Colors.black.withValues(alpha: 0.60),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => _onArchiveToggled(!_archive),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: _archive
                  ? context.c.onSky.withValues(alpha: 0.55)
                  : Colors.white.withValues(alpha: 0.25),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _archive ? Icons.check : Icons.archive_outlined,
                color: _archive ? context.c.onSky : Colors.white,
                size: 18,
              ),
              const SizedBox(width: 6),
              Text(
                'المناسبات المنتهية',
                style: TextStyle(
                  color: _archive ? context.c.onSky : Colors.white,
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
    // ستوريات موضع `carousel` (تذكرة #173): كاروسيل بانرات أعلى التغذية
    // مباشرة. بلا ستوريات كاروسيل لا عنصر ولا مساحة — التخطيط كما كان.
    final carouselStories = _storiesFor('carousel');
    _scheduleMeasureHeader();
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. مُمرِّر واحد يجمع الرأس والكروت معاً: يطوي الرأس متّصلاً مع
          // الإصبع بالسحب على الكرت نفسه، ثم يأخذ كل كرت مساحة التغذية كاملة.
          LayoutBuilder(
            builder: (context, constraints) {
              final viewportHeight = constraints.maxHeight;
              _cardExtent = viewportHeight;
              return Stack(
                alignment: Alignment.bottomCenter,
                children: [
                  RefreshIndicator(
                    onRefresh: () async {
                      final services = AppServices.of(context);
                      _loadStories();
                      _loadLiveChannel();
                      // «الأكثر تفاعلاً» (تذكرة #177) مع السحب كبقية أسطح
                      // الاكتشاف: نافذته سبعة أيام تتحرّك مع الساعة، فسحبٌ لا
                      // يجددها يُبقي الشريط على أرقام الأمس.
                      _loadTrending();
                      // السحب للتحديث يقرأ الشريط والتعميم من جديد كذلك — رقمُ
                      // الشريط يُبطل كل خمس دقائق على الخادم، لا عند كل سحب.
                      services.homeTicker.refresh();
                      // السحب للتحديث يلتقط أيضاً مقطعاً افتراضياً رفعه الأدمن للتوّ.
                      services.audio
                          .defaultTrack(services.api, refresh: true)
                          .then((url) {
                        if (mounted) _defaultAudioUrl = url;
                      });
                      await _loadFirstPage();
                    },
                    child: CustomScrollView(
                      key: const Key('feed_pager'),
                      controller: _feedScroll,
                      scrollCacheExtent: const ScrollCacheExtent.pixels(0.0),
                      physics: _FeedSnapPhysics(
                        parent: const AlwaysScrollableScrollPhysics(),
                        headerExtent: () => _headerExtent,
                        cardExtent: () => _cardExtent,
                        hasCards: () =>
                            !_initialLoading &&
                            _error == null &&
                            _events.isNotEmpty,
                      ),
                      slivers: [
                        SliverToBoxAdapter(
                          child: NotificationListener<
                              SizeChangedLayoutNotification>(
                            onNotification: (_) {
                              _scheduleMeasureHeader();
                              return false;
                            },
                            child: SizeChangedLayoutNotifier(
                              child: Column(
                                key: _headerKey,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  // حين يُفتح لوح الفلاتر يحلّ محلّ الرأس بدل أن يجلس فوقه: اللوح
                                  // يرسم أدواته بنفسه، فلا تبقى وراءه نسخة ثانية من شريط
                                  // الستوريات ولا من كبسة الفلاتر، مع حفظ الارتفاع كي لا يقفز
                                  // المحتوى خلف الغطاء.
                                  if (!_showTopChrome)
                                    KeyedSubtree(
                                      key: _feedHeaderKey,
                                      child: _feedHeader(),
                                    )
                                  else
                                    SizedBox(height: _feedHeaderExtent),
                                  // شريط التوسّع (#127): خبر المحافظة في سطرين داخل التغذية، فوق
                                  // الكروت مباشرةً كبطاقة الدخول — يدفعها قليلاً ثم يختفي بـ×،
                                  // ولا طبقة تحجبها ولا ورقة حواريّة. يتبع تبديل المحافظة بنفسه.
                                  const RegionBanner(),
                                  // بطاقة الدخول التسويقية: عنصر عادي في عمود التغذية — **تحت**
                                  // شريط الستوريات لا فوقه — فتدفع الكروت قليلاً ثم تختفي ويعود
                                  // التخطيط. بطاقةٌ تشير إلى أوّل ستوري لا يجوز أن تحجبه.
                                  if (_entryCardVisible && _entryStory != null)
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(
                                          12, 6, 12, 0),
                                      child: _EntryCard(
                                        story: _entryStory!,
                                        onClose: _hideEntryCard,
                                        onTap: () =>
                                            _openEntryStory(_entryStory!),
                                      ),
                                    ),
                                  // كاروسيل البانرات أعلى التغذية (تذكرة #173)، تحت بطاقة الدخول
                                  // التي تختفي وحدها — ثم تبدأ الكروت.
                                  if (carouselStories.isNotEmpty)
                                    _StoryCarousel(
                                      stories: carouselStories,
                                      onOpen: (index) =>
                                          _openStoryList(carouselStories, index),
                                      onCta: (story) =>
                                          openStoryTarget(context, story),
                                    ),
                                  // «الأكثر تفاعلاً هذا الأسبوع» (تذكرة #177): تحت الكاروسيل وفوق
                                  // الكروت. بلا نتيجة لا عنصر في الشجرة إطلاقاً — لا عنوان بلا
                                  // بطاقات ولا مساحة محجوزة تُزيح الكرت الأول.
                                  if (_trending.isNotEmpty)
                                    _TrendingStrip(
                                      events: _trending,
                                      onOpen: (eventId) => _openEvent(eventId),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        ..._buildFeedSlivers(viewportHeight),
                      ],
                    ),
                  ),
                  if (_loadingMore) _loadingMorePill(),
                  // لا زرّ «عرض المزيد» عائم: كان يغطّي صفّ أزرار الكرت نفسه،
                  // والصفحة التالية تُجلب تلقائياً من `_onFeedScroll` قبل آخر
                  // كرتين أصلاً.
                ],
              );
            },
          ),

          // 2. لوحة الفلاتر والبحث المنسدلة (تظهر عند الضغط على الكبسة)
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
                              'مناسبات منطقتك',
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

  /// رأس التغذية: صفّ كروم واحد في أعلاه، ثم رقاقتا «ألبومات الأعراس» و
  /// «المناسبات المنتهية» في صفّهما، ثم شريط الستوريات — وكلُّه يدفع التغذية
  /// تحته. **ليس عائماً**: لا تسمية ستوري ولا أيقونة تغطّي صورة الكرت الأول،
  /// وهي عِلّة الشكوى (الشكل «أ» في `docs/prototype/home-2026-10.html`).
  Widget _feedHeader() {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _chromeRow(),
            const SizedBox(height: 6),
            // «ألبومات الأعراس» (تذكرة #101، القرار D11) و«المناسبات المنتهية»
            // صفّهما الخاص تحت الشريط، وهما العنصران الوحيدان خارجه بقرار
            // المالك. `Wrap` لا `Row`: على هاتف ٣٢٠dp ينكسر الصفّ إلى سطرين
            // بدل أن يفيض النصّ خارج الشاشة.
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _albumsEntryChip(),
                  _archiveToggleChip(),
                ],
              ),
            ),
            // شريط الإحصائيات (#172): عدد القادم في كل محافظة والمجموع، أو
            // التعميم الحيّ الذي يحلّ محلّه — من المخزن المشترك نفسه الذي يقرأه
            // الهيكل ويغلقه. عنصر عادي في العمود — لا عائم — فوق شريط الستوريات
            // كما في الويب (بعد شريط التعاميم هناك).
            _HomeTicker(store: AppServices.of(context).homeTicker),
            // شريط الستوريات ظاهر هنا دائماً لا داخل لوح الفلاتر: كبسة البث
            // أوّله ثم ستوريات التسويق، ثم تبدأ الكروت تحته. وموضع الشريط
            // `bar` وحده (تذكرة #173): الكاروسيل والإعلان لهما موضعاهما.
            _StoriesStrip(
              stories: _storiesFor('bar'),
              channel: _liveChannel,
              onLiveTap: () => openLiveScreen(context),
            ),
          ],
        ),
      ),
    );
  }

  /// صفّ الكروم الوحيد: «الفلاتر والبحث» يميناً، ومجموعة الأيقونات (وفيها زرّ
  /// النشر) يساراً. لا شيء يطفو في وسطه، ولا يقع فيه زرّ آخر: هو صفٌّ واحد
  /// متّصل، وزرّ الهيكل العائم لم يعد يمرّ على التغذية أصلاً.
  Widget _chromeRow() {
    return Row(
      // لا `Spacer` هنا: مع `Flexible` بجانبه كان سيقاسمه المساحة نصفين
      // فيُختصر نصّ الكبسة بلا حاجة.
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        // زر الكبسة لفتح الفلاتر وعرض المناسبات — يتقلّص (ونصّه يُختصَر) قبل
        // أن تفيض مجموعة الأيقونات على هاتف ضيّق.
        Flexible(
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => setState(() => _showTopChrome = true),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                // حشو `.filter-btn` في النموذج نفسه (7px 9px، وفاصل 4px بين
                // الأيقونة والنصّ): ١٤/٦ كانت تملأ الصفّ تماماً على ٣٦٠dp
                // فيُختصر النصّ بلا داع.
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
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
                      color: _hasActiveFilters ? context.c.sky : Colors.white,
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        _filterButtonLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: _hasActiveFilters ? context.c.sky : Colors.white,
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
        _chromeControlsGroup(),
      ],
    );
  }

  /// مجموعة أيقونات الشريط، بترتيب المالك: النشر (بلون التمييز، أوّلها)،
  /// الأجندة، التحديث، الجرس (لمسجَّل وحده)، كتم الصوت، و«حسابي»
  /// **آخرها برمز لا بكلمة**. كلٌّ منها ٣٠×٣٠ (مقاييس `.icon-btn` في
  /// `docs/prototype/home-2026-10.html`)، فتمرّ ستّاً في صفّ واحد على هاتف
  /// ٣٦٠dp بلا فيض. وأيقونة الدعم عبر واتساب ليست هنا: لها مكانها في لوح
  /// الفلاتر — «خيار واحد» في الشريط، والرقاقتان (الألبومات والمناسبات
  /// المنتهية) وحدهما خارجه.
  Widget _chromeControlsGroup() {
    final auth = AppServices.of(context).auth;

    return Container(
      key: const Key('feed_controls_bar'),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.60),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
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
          _chromePublishButton(),
          _chromeIcon(
            icon: Icons.calendar_month_rounded,
            tooltip: 'أجندة المناسبات',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AgendaScreen()),
              );
            },
          ),
          _chromeIcon(
            icon: Icons.refresh,
            tooltip: 'تحديث',
            onPressed: () async {
              _loadStories();
              _loadLiveChannel();
              // تحديث في المكان: الصفحة الأولى تُستبدل والكرت المعروض يبقى
              // أمام المستخدم بدل أن يقفز إلى أوّله.
              await _refreshInPlace();
            },
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
          // زوج الصوت والدخول: مفتاحه باقٍ لأنّ `live_test` يحرس به أنّ كبسة
          // البث في شريط الستوريات ليست داخله.
          Row(
            key: const Key('feed_audio_auth_container'),
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedBuilder(
                animation: _audio!,
                builder: (context, _) => _chromeIcon(
                  key: const Key('feed_mute_toggle'),
                  icon: _audio!.isMuted
                      ? Icons.volume_off_rounded
                      : Icons.volume_up_rounded,
                  tooltip: _audio!.isMuted ? 'تشغيل الصوت' : 'كتم الصوت',
                  onPressed: _toggleMute,
                ),
              ),
              // «حسابي» أيقونةً وحدها بتلميحها: الكلمة لم تعد ظاهرة في الشريط
              // (طلب المالك)، والنقر يدفع شاشة «حسابي» من داخل
              // `AuthActionButton` — لا حوار تأكيد ولا خروج من هنا.
              // `IconButtonTheme` هنا يقصّ زرّه (‏٤٨dp افتراضياً) إلى ٣٠×٣٠ بلا
              // لمس الزرّ نفسه.
              IconButtonTheme(
                data: IconButtonThemeData(
                  style: IconButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(30, 30),
                    maximumSize: const Size(30, 30),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                child: const AuthActionButton(compact: true, color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// زرّ النشر — العنصر الملوّن الوحيد في الشريط، وأوّل المجموعة (أقربها إلى
  /// وسط الصفّ في RTL). كان زرّاً عائماً فوق الكرت يحجب أول أيقونة؛ انتقل إلى
  /// الشريط نفسه لأنّ المالك طلب خياراً واحداً فيه، والرقاقتان وحدهما خارجه. النقر
  /// يفعل ما فعله الزرّ العائم في `HomeShell` حرفياً: يدفع شاشة النشر.
  Widget _chromePublishButton() {
    return IconButton(
      key: const Key('feed_publish_button'),
      constraints: const BoxConstraints.tightFor(width: 30, height: 30),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(
        // `onSky` لا أبيض صريح: هو لون النص/الأيقونة فوق `sky` في الوضعين
        // (أبيض نهاراً، حبر داكن فوق السماوى الساطع ليلاً).
        backgroundColor: context.c.sky,
        foregroundColor: context.c.onSky,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(9)),
        ),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      tooltip: 'إعلان مناسبة',
      onPressed: () {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AddEventScreen()),
        );
      },
      icon: const Icon(Icons.add, size: 20),
    );
  }

  /// أيقونة واحدة في صفّ الكروم: ٣٠×٣٠ بلا حشو داخلي. `shrinkWrap` لازم:
  /// `IconButton` يحجز ٤٨dp للهدف اللمسي بدونه، فتفيض ستّ أيقونات على هاتف
  /// ٣٦٠dp.
  Widget _chromeIcon({
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    Color color = Colors.white,
    Key? key,
  }) {
    return IconButton(
      key: key,
      constraints: const BoxConstraints.tightFor(width: 30, height: 30),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(tapTargetSize: MaterialTapTargetSize.shrinkWrap),
      tooltip: tooltip,
      onPressed: onPressed,
      icon: Icon(icon, color: color, size: 20),
    );
  }

  /// الحالة الفارغة بابٌ لا جدار (#161، البند 2): زرّ «أضف مناسبتك»، وبطاقتا
  /// «خدمات الأعراس في منطقتك» و«ألبومات منطقتك»، و«وسّع إلى كل المحافظات».
  ///
  /// الوجهات كلها آليات قائمة: شاشة النشر وشاشة الألبومات تُدفعان كما في
  /// رأس التغذية، و«خدمات الأعراس» تبويبٌ يُطلب بـ`tabRequest` فيُنفّذه
  /// `HomeShell`، والتوسيع علَمُ طلبٍ في هذه الشاشة (`_expandToAllRegions`)
  /// لا مسحٌ للمحافظة المشتركة.
  List<Widget> _emptyStateActions() {
    final services = AppServices.of(context);
    return [
      SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          key: const Key('feed_empty_add_event'),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const AddEventScreen()),
          ),
          icon: const Icon(Icons.add, size: 20),
          label: const Text('أضف مناسبتك'),
        ),
      ),
      const SizedBox(height: 10),
      _emptyDestinationCard(
        key: const Key('feed_empty_services'),
        icon: Icons.handyman_outlined,
        label: 'خدمات الأعراس في منطقتك',
        onTap: () =>
            services.tabRequest.value = AppServices.servicesTabIndex,
      ),
      const SizedBox(height: 10),
      _emptyDestinationCard(
        key: const Key('feed_empty_albums'),
        icon: Icons.photo_library_outlined,
        label: 'ألبومات منطقتك',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AlbumsScreen()),
        ),
      ),
      const SizedBox(height: 6),
      TextButton.icon(
        key: const Key('feed_empty_expand'),
        onPressed: _expandToAllRegions,
        icon: const Icon(Icons.public, size: 18),
        label: const Text('وسّع إلى كل المحافظات'),
      ),
    ];
  }

  /// بطاقة وجهة واحدة في الحالة الفارغة: أيقونة ثم التسمية ثم سهم — عنصر
  /// لمس بارتفاع ≥44px، بنفس ألوان السطح والحدود القائمة في التغذية.
  Widget _emptyDestinationCard({
    required Key key,
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Material(
      key: key,
      color: context.c.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.c.line),
          ),
          child: Row(
            children: [
              Icon(icon, size: 20, color: context.c.sky),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: context.c.ink,
                    fontSize: 14.5,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Icon(Icons.chevron_left, size: 20, color: context.c.inkFaint),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildFeedSlivers(double cardExtent) {
    if (_initialLoading) {
      // هياكل تحميل بدل دوّارة (٥٣)
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: SizedBox(
            height: cardExtent,
            child: const EventFeedSkeletonList(),
          ),
        ),
      ];
    }

    if (_error != null) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
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
        ),
      ];
    }

    if (_events.isEmpty) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
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
                      : _dateFilter != null
                          ? 'لا توجد مناسبات في $_placeDescriptionForEmptyState — ${_dateFilter!.label}'
                          : _archive
                              ? 'لا توجد مناسبات منتهية في $_placeDescriptionForEmptyState'
                              : 'لا توجد مناسبات معتمدة في $_placeDescriptionForEmptyState حالياً',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.c.inkFaint, fontSize: 15),
                ),
                const SizedBox(height: 22),
                ..._emptyStateActions(),
              ],
            ),
          ),
        ),
      ];
    }

    // صفحات التغذية: الكروت، وبعد كل [_feedAdInterval] إعلانُ ستوري موضع
    // `feed` (تذكرة #173). بلا إعلانات تطابق `_events` صفحةً بصفحة.
    final pages = _composeFeedPages();
    final feedAds = _storiesFor('feed');

    return [
      SliverFixedExtentList(
        key: const Key('feed_cards_sliver'),
        itemExtent: cardExtent,
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final entry = pages[index];
            final ad = entry.ad;
            // إعلان بين الكروت: صفحة كاملة كالكرت. الصورة تفتح العارض
            // (المشاهدة) والزرّ يسجّل النقرة ثم يفتح الرابط — الموضعان
            // يُقاسان من هنا كما من الشريط والكاروسيل.
            if (ad != null) {
              return _FeedAdCard(
                story: ad,
                position: entry.adPosition,
                onOpen: () => _openStoryList(feedAds, entry.adIndex),
                onCta: () => openStoryTarget(context, ad),
              );
            }
            final event = entry.event!;
            final card = EventCard(
              event: event,
              onTap: () => _openEvent(event.id),
              onCongratulationsTap: () => _openCongratulations(event),
              onRemindTap: () => _toggleRemind(event),
              onRsvpTap: () => _rsvpGoingFromCard(event),
              onMessagesTap: () => _openMessages(event),
            );
            // الظهور المتدرّج للشاشة الأولى وحدها — مناسبة من صفحة تالية أو
            // فلتر جديد لا تحمل معرّفها في هذه المجموعة فتُرسَم فوراً (٥٣).
            // ورقم التدرّج ترتيب المناسبة لا رقم صفحتها، فلا يؤخّرها إعلان.
            return _entranceEventIds.contains(event.id)
                ? FirstScreenFadeIn(index: entry.eventIndex, child: card)
                : card;
          },
          childCount: pages.length,
        ),
      ),
    ];
  }

  Widget _loadingMorePill() {
    return Positioned(
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
    );
  }
}

/// فيزياء التمرير للتغذية: حرّة داخل منطقة الرأس (0..headerExtent)، ومثبّتة
/// على حدود الكروت (`headerExtent + k * cardExtent`) بكرت واحد على الأكثر
/// لكل سحبة كما يفعل `PageScrollPhysics`، مع السماح بالعودة للرأس عند السحب
/// للأسفل من الكرت الأول.
class _FeedSnapPhysics extends ScrollPhysics {
  const _FeedSnapPhysics({
    super.parent,
    required this.headerExtent,
    required this.cardExtent,
    required this.hasCards,
  });

  final double Function() headerExtent;
  final double Function() cardExtent;
  final bool Function() hasCards;

  @override
  _FeedSnapPhysics applyTo(ScrollPhysics? ancestor) {
    return _FeedSnapPhysics(
      parent: buildParent(ancestor),
      headerExtent: headerExtent,
      cardExtent: cardExtent,
      hasCards: hasCards,
    );
  }

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if (!hasCards()) {
      return super.createBallisticSimulation(position, velocity);
    }
    final h = headerExtent();
    final c = cardExtent();
    if (c <= 0 || position.maxScrollExtent <= h) {
      return super.createBallisticSimulation(position, velocity);
    }

    final p = position.pixels;
    if (p < position.minScrollExtent ||
        p > position.maxScrollExtent ||
        (velocity <= 0.0 && p <= position.minScrollExtent) ||
        (velocity >= 0.0 && p >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }

    final tolerance = toleranceFor(position);

    // 1) داخل منطقة الرأس (0 <= p < h):
    if (p < h) {
      if (velocity < -tolerance.velocity) {
        return super.createBallisticSimulation(position, velocity);
      }
      if (velocity.abs() <= tolerance.velocity) {
        // تثبيت على h عند الاقتراب منها (مثل خسارة touchSlop بعد سحبٍ بقدر الرأس).
        if (h - p <= 24.0) {
          return ScrollSpringSimulation(
            spring,
            p,
            h.clamp(position.minScrollExtent, position.maxScrollExtent),
            velocity,
            tolerance: tolerance,
          );
        }
        return null;
      }
      final freeSim = super.createBallisticSimulation(position, velocity);
      if (freeSim != null && freeSim.x(double.infinity) < h - 24.0) {
        return freeSim;
      }
      return ScrollSpringSimulation(
        spring,
        p,
        h.clamp(position.minScrollExtent, position.maxScrollExtent),
        velocity,
        tolerance: tolerance,
      );
    }

    // 2) منطقة الكروت (p >= h): تثبيت على h + k * c.
    double page = (p - h) / c;
    if (velocity < -tolerance.velocity) {
      page -= 0.5001;
    } else if (velocity > tolerance.velocity) {
      page += 0.5001;
    }
    final targetIndex = page.round();
    if (targetIndex < 0) {
      return super.createBallisticSimulation(position, velocity);
    }

    final targetPixels = (h + targetIndex * c)
        .clamp(position.minScrollExtent, position.maxScrollExtent);
    if ((targetPixels - p).abs() < tolerance.distance &&
        velocity.abs() < tolerance.velocity) {
      return null;
    }
    if (targetPixels != p) {
      return ScrollSpringSimulation(
        spring,
        p,
        targetPixels,
        velocity,
        tolerance: tolerance,
      );
    }
    return null;
  }
}

/// لقطة ما قبل تغيير الفلتر — القائمة وموضع الكرت والفلتر كاملاً. تُعاد
/// بـ`setState` والقفز للموضع بلا طلب شبكة، فلا يضيع تقدّم القائمة.
class _ResultsSnapshot {
  const _ResultsSnapshot({
    required this.events,
    required this.pagination,
    required this.eventId,
    required this.search,
    required this.towns,
    required this.villages,
    required this.kinds,
    required this.archive,
    required this.dateFilter,
  });

  final List<Event> events;
  final Pagination? pagination;

  /// معرّف المناسبة المعروضة لحظة اللقطة — لا رقم صفحتها: الإعلانات بين
  /// الكروت تُزحزح أرقام الصفحات ولا تُزحزح المعرّف (تذكرة #173).
  final int? eventId;
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

/// كرت إعلان تعديل موعد — خبر عن مناسبة قائمة لا مناسبة نفسها، لكنه يحمل
/// بياناتها كاملة كما يحملها كرت التغذية: الملصق، وشارة النوع، والعنوان (النوع
/// واسم صاحب المناسبة)، والتاريخ، والمكان، والعائلة، ثم سطر التغيير «من … إلى …».
/// اسم البلدة وحده كان يجعل مناسبتين في البلدة نفسها كرتين متطابقتين.
class _AnnouncementCard extends StatelessWidget {
  const _AnnouncementCard({required this.announcement, required this.onTap});

  final Announcement announcement;
  final VoidCallback onTap;

  /// سطر التغيير — التاريخ بالصيغة العربية الطويلة لا ISO خام، وما ليس تاريخاً
  /// (نصّ حرّ كتبه الأدمن) يصل كما هو: `arabicEventDate` تعيد الخام حين يتعذّر
  /// التحليل.
  String get _changeText {
    final from = arabicEventDate(announcement.oldValue.trim());
    final to = arabicEventDate(announcement.newValue.trim());
    if (from.isEmpty && to.isEmpty) return 'تغيّر موعد المناسبة';
    if (from.isEmpty) return 'تغيّر موعد المناسبة إلى $to';
    if (to.isEmpty) return 'تغيّر موعد المناسبة من $from';
    return 'تغيّر موعد المناسبة من $from إلى $to';
  }

  @override
  Widget build(BuildContext context) {
    final event = announcement.event;
    final type = event.occasionType;
    final toneColor = occasionTypeColor(type?.color, cardGold);
    final hasPoster = (event.posterUrl ?? '').trim().isNotEmpty;

    return Card(
      color: context.c.surface,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            // شريط الخبر أعلى الكرت — فعلٌ مستقل عن بيانات المناسبة تحته.
            Container(
              color: context.c.successWash,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.campaign_outlined,
                    size: 16,
                    color: context.c.success,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'إعلان تعديل موعد',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                      color: context.c.success,
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (hasPoster) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: SizedBox(
                        width: 62,
                        height: 84,
                        child: EventPoster(
                          url: event.posterUrl,
                          height: 84,
                          isSolemn: type?.isSolemn ?? false,
                          toneColor: toneColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (type != null) ...[
                          _AnnouncementTypeBadge(type: type, color: toneColor),
                          const SizedBox(height: 4),
                        ],
                        // العنوان: النوع واسم صاحب المناسبة («عرس محمد فارس …»)
                        // بلا `maxLines` — اسمٌ ناقص أسوأ من كرت أطول، والقائمة
                        // كلها قابلة للتمرير.
                        Text(
                          event.cardHeadline,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                            height: 1.35,
                            color: context.c.ink,
                          ),
                        ),
                        const SizedBox(height: 6),
                        _AnnouncementInfoLine(
                          icon: Icons.event_outlined,
                          color: toneColor,
                          text: arabicEventDate(event.eventDate),
                        ),
                        // المكان: اسم القرية حين تكون المناسبة تحت البند الجامع
                        // «القرى والتجمعات»، وإلا البلدة.
                        _AnnouncementInfoLine(
                          icon: Icons.location_on_outlined,
                          color: toneColor,
                          text: event.villageDisplayName ?? event.town,
                        ),
                        _AnnouncementInfoLine(
                          icon: Icons.groups_outlined,
                          color: toneColor,
                          text: event.familyClan,
                        ),
                        const SizedBox(height: 6),
                        // ما تغيّر هو كل قيمة هذا الكرت: من رتّب وقته على الموعد
                        // القديم يحتاج القديم والجديد معاً، لا الجديد وحده.
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.swap_horiz,
                              size: 15,
                              color: context.c.success,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                _changeText,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  height: 1.5,
                                  color: context.c.success,
                                ),
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
          ],
        ),
      ),
    );
  }
}

/// شارة نوع المناسبة في كرت الإعلان — نسخة مصغّرة من شارة كرت التغذية، لأن
/// تلك خاصّة بملف `widgets/event_card.dart` ولا تُستعمل من هنا.
class _AnnouncementTypeBadge extends StatelessWidget {
  const _AnnouncementTypeBadge({required this.type, required this.color});

  final OccasionType type;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2.5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (type.icon.isNotEmpty) ...[
            Text(type.icon, style: const TextStyle(fontSize: 11)),
            const SizedBox(width: 4),
          ],
          Text(
            type.name,
            style: TextStyle(
              fontSize: 11.5,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

/// سطر معلومة في كرت الإعلان: أيقونة بلون النوع ثم النصّ. سطر فارغ لا يُرسم.
class _AnnouncementInfoLine extends StatelessWidget {
  const _AnnouncementInfoLine({
    required this.icon,
    required this.color,
    required this.text,
  });

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                height: 1.4,
                color: context.c.inkSoft,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ارتفاع شريط الستوريات. الشريط في رأس التغذية يدفعها تحته، فكل زيادة فيه
/// تُقتطع من ارتفاع الكرت لا أن تغطّيه: يبقى ٨٢ كما في النموذج
/// (`docs/prototype/home-2026-10.html`، العرض «أ») ولا يكبر.
const double _storiesStripHeight = 82;

/// خلفية تعميم ثابتة مستقلة عن الوضع الفاتح/الداكن — **نفس**
/// `_broadcastBannerColor` في `home_shell.dart` حرفياً (قرار #20 خطوة 15:
/// تدرّج أغمق من `--warn` كي لا يهتزّ تباين النص الأبيض بين الوضعين). تعميمٌ
/// هنا وآخر هناك يجب أن يُقرآ الشيء نفسه لا شكلين لمعنى واحد.
const Color _homeBroadcastColor = Color(0xFF78350F);

/// «حُدّث HH:MM» من لحظة حساب الخادم، بالساعة **المحلية للجهاز** وبخانتين
/// دائماً (‎09:07‎ لا ‎9:7‎). `null` (حقل غائب أو غير مقروء تاريخاً) يعطي
/// نصاً فارغاً، فلا يُكتب وقتٌ مخترع.
String _statsUpdatedLabel(DateTime? updatedAt) {
  if (updatedAt == null) return '';
  final local = updatedAt.toLocal();
  final hours = local.hour.toString().padLeft(2, '0');
  final minutes = local.minute.toString().padLeft(2, '0');
  return 'حُدّث $hours:$minutes';
}

/// شريط الإحصاءات في الرئيسية (تذكرة #172) — أو **التعميم الحيّ مكانه**.
///
/// الأولوية للتعميم: وجود تعميم حيّ يُخفي الشريط كاملاً، فلا يُعرض الاثنان
/// معاً في موضع واحد (وهو ما يفعله الويب أيضاً: `renderStatsTicker` تقرأ قائمة
/// التعاميم نفسها). و**لا رقم قبل حسم حالة التعاميم** (`broadcastsKnown`): رقمٌ
/// يظهر ثم يختفي حين يصل تعميم ومضةٌ يحكم بها ترتيب الشبكة وحده.
///
/// الحالة من [HomeTickerStore] لا من لقطة محلية: الهيكل يستمع لإشارة Socket
/// ويغلق الشريط من شريطه، وكلاهما يقرأ الحالة نفسها — فلا شريطان لتعميم واحد،
/// وإغلاق أيّهما يعيد شريط الإحصاءات.
///
/// والغياب الكامل — لا تعميم ولا شريط، أو شريط بلا محافظات — يعطي
/// `SizedBox.shrink()`: لا إطار فارغ ولا حشوة في التخطيط.
///
/// ولا حساب في هذا الصنف: الأعداد والمجموع ولحظة الحساب كما وصلت من الخادم
/// (`StatsTicker` شرحُ العقد هناك)، والشرط «قادم» و«ظاهر» في الخدمة وحدها.
class _HomeTicker extends StatelessWidget {
  const _HomeTicker({required this.store});

  final HomeTickerStore store;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final live = store.broadcast;
        if (live != null) return _broadcastBar(live);
        if (!store.broadcastsKnown) return const SizedBox.shrink();
        final ticker = store.stats;
        if (ticker == null || ticker.regions.isEmpty) {
          return const SizedBox.shrink();
        }
        return _statsBar(context, ticker);
      },
    );
  }

  /// التعميم الحيّ — سطرٌ ورسالة، وزرّ إغلاق واحد يشاركه معه شريط الهيكل:
  /// الإغلاق من أيّهما يمرّ بـ`HomeTickerStore.dismissActive`، فتعود الإحصاءات
  /// في الموضع نفسه (تذكرة #172، الجولة ٢). ومركز الإشعارات لا يُمَسّ.
  Widget _broadcastBar(({int id, String title, String message}) live) {
    return Container(
      key: const Key('home_broadcast_ticker'),
      width: double.infinity,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
      decoration: BoxDecoration(
        color: _homeBroadcastColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.campaign, color: Colors.white, size: 17),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (live.title.isNotEmpty)
                  Text(
                    live.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
                    ),
                  ),
                if (live.message.isNotEmpty)
                  Text(
                    live.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            key: const Key('home_broadcast_ticker_dismiss'),
            onPressed: store.dismissActive,
            tooltip: 'إغلاق التعميم',
            icon: const Icon(Icons.close, color: Colors.white, size: 16),
            padding: EdgeInsets.zero,
            visualDensity: VisualDensity.compact,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
        ],
      ),
    );
  }

  /// صفّ المحافظات يُمرَّر أفقياً عند الحاجة (شريط لا كتلة): محافظة تُضاف من
  /// اللوحة غداً لا تفيض على هاتف ضيّق، والمجموع و«حُدّث» ثابتان تحته.
  Widget _statsBar(BuildContext context, StatsTicker ticker) {
    return Container(
      key: const Key('home_stats_ticker'),
      width: double.infinity,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(10, 7, 10, 7),
      decoration: BoxDecoration(
        color: context.c.surface,
        border: Border.all(color: context.c.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.calendar_month_rounded, size: 15, color: context.c.sky),
              const SizedBox(width: 6),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final region in ticker.regions)
                        Padding(
                          // مسافة بين الرقاقات في اتجاه القراءة (RTL) — لا
                          // اتجاه فيزيائي ثابت.
                          padding: const EdgeInsetsDirectional.only(end: 6),
                          child: _regionChip(context, region),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Text(
                'المجموع ${ticker.total}',
                key: const Key('home_stats_ticker_total'),
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const Spacer(),
              Text(
                _statsUpdatedLabel(ticker.updatedAt),
                key: const Key('home_stats_ticker_updated'),
                style: TextStyle(fontSize: 11.5, color: context.c.inkSoft),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _regionChip(BuildContext context, StatsRegion region) {
    return Container(
      key: Key('home_stats_region_${region.regionId}'),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
      decoration: BoxDecoration(
        color: context.c.skyWash,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            region.name,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: context.c.skyDeep,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            '${region.upcomingCount}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: context.c.skyDeep,
            ),
          ),
        ],
      ),
    );
  }
}

/// ارتفاع كاروسيل البانرات (تذكرة #173): بانر أفقي واحد لكل ستوري موضع
/// `carousel`. يُقتطع من ارتفاع الكرت كما يُقتطع الشريط، فلا يغطّي شيئاً.
const double _storyCarouselHeight = 96;

/// شريط الستوريات الظاهر دائماً في رأس التغذية: كبسة البث أولاً — فعل مستقل يبقى
/// وحده إن لم تصل ستوريات — ثم ستوريات التسويق أفقياً.
/// ستوريات موضع `bar` وحدها: كل موضع يعرض ما يخصّه — الكاروسيل أعلى التغذية
/// له موضعه، وإعلان «بين الكروت» موضعه بين الكروت. `stories` تصل مرشَّحة من
/// `_storiesFor('bar')`، فلا ترشيح ثانياً هنا.
class _StoriesStrip extends StatelessWidget {
  const _StoriesStrip({
    required this.stories,
    required this.channel,
    required this.onLiveTap,
  });

  final List<Story> stories;
  final LiveChannel? channel;
  final VoidCallback onLiveTap;

  @override
  Widget build(BuildContext context) {
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
                // رأسي ٢ لا ٤: كرة ٥٤ + فاصل ٥ + تسمية ١١px تبلغ ٧٥٫٥،
                // والـ٤ كانت تترك ٧٤ فيفيض العمود بكسلٌ واحد على الجهاز
                // الحقيقي (ظهر شريط الفيضان فوق الأسماء في لقطة 2026-10-25).
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
  }
}

/// كاروسيل البانرات أعلى التغذية (تذكرة #173): ستوريات موضع `carousel` وحدها،
/// بانر أفقي لكل واحدة. الصورة تفتح العارض (فمشاهدة الثانيتين تُسجَّل كما في
/// الشريط)، والزرّ يسجّل النقرة ثم يفتح الرابط — القياس من هذا الموضع لا يضيع.
class _StoryCarousel extends StatelessWidget {
  const _StoryCarousel({
    required this.stories,
    required this.onOpen,
    required this.onCta,
  });

  final List<Story> stories;

  /// فتح العارض على حلقة الكاروسيل المنقورة.
  final void Function(int index) onOpen;

  /// نقرة الزرّ: تسجيل ثم فتح الرابط (`openStoryTarget`).
  final void Function(Story story) onCta;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return SizedBox(
      key: const Key('story_carousel'),
      height: _storyCarouselHeight,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        itemCount: stories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final story = stories[index];
          final hasTarget = story.targetUrl != null && story.targetUrl!.isNotEmpty;
          return Container(
            width: 248,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: c.line),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 92,
                  height: double.infinity,
                  child: GestureDetector(
                    key: Key('story_carousel_media_${story.id}'),
                    onTap: () => onOpen(index),
                    behavior: HitTestBehavior.opaque,
                    child: story.image == null
                        ? _storyPlaceholder(context)
                        : Image.network(
                            story.image!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) =>
                                _storyPlaceholder(context),
                          ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsetsDirectional.fromSTEB(0, 8, 0, 8),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          story.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.3,
                            fontWeight: FontWeight.w800,
                            color: c.ink,
                          ),
                        ),
                        if (hasTarget) ...[
                          const SizedBox(height: 5),
                          FilledButton(
                            key: Key('story_carousel_cta_${story.id}'),
                            onPressed: () => onCta(story),
                            style: FilledButton.styleFrom(
                              backgroundColor: c.sky,
                              foregroundColor: c.onSky,
                              minimumSize: const Size(0, 26),
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              textStyle: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                              shape: const StadiumBorder(),
                            ),
                            child: Text(storyCtaLabel(story)),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// «الأكثر تفاعلاً هذا الأسبوع» (تذكرة #177) — شريط أفقي مضغوط بين كاروسيل
/// البانرات والتغذية: عنوان، ثم بطاقة صغيرة لكل مناسبة (صورة، سطر عنوان، سطر
/// تاريخ/بلدة). خام وكثيف عمداً — هو مدخلٌ سريع إلى المناسبة لا كرت تغذية
/// ثانٍ، والبيانات نفسها تأتي بشكل كرت التغذية (`Event.fromJson`).
///
/// **ولا يظهر حين لا نتيجة**: الشرط `_trending.isNotEmpty` في `build` الشاشة،
/// فلا عنوان بلا بطاقات ولا مساحة محجوزة تُزيح الكرت الأول.
class _TrendingStrip extends StatelessWidget {
  const _TrendingStrip({required this.events, required this.onOpen});

  final List<Event> events;

  /// فتح صفحة المناسبة — الفعل نفسه الذي يفعله كرت التغذية (`_openEvent`).
  final void Function(int eventId) onOpen;

  /// ارتفاع محدود للشريط: صورة ٦٤ + سطران + حشو صغير. و`ListView` أفقي يمرّ
  /// ببطاقاته على الشاشات الضيّقة بدل أن يضغطها.
  static const double _stripHeight = 126;
  static const double _cardWidth = 132;
  static const double _imageHeight = 64;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      key: const Key('trending_strip'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 6),
          child: Text(
            'الأكثر تفاعلاً هذا الأسبوع',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: c.ink,
            ),
          ),
        ),
        SizedBox(
          height: _stripHeight,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: events.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final event = events[index];
              // سطر التاريخ/البلدة بنفس مُهيّئات الكرت (`arabicEventDate`،
              // واسم القرية تحت البند الجامع) — نصّ واحد لكل مناسبة في الشاشة.
              final meta = [
                arabicEventDate(event.eventDate),
                event.villageDisplayName ?? event.town,
              ].where((part) => part.isNotEmpty).join(' — ');

              return SizedBox(
                width: _cardWidth,
                child: Material(
                  color: c.surface,
                  clipBehavior: Clip.antiAlias,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: c.line),
                  ),
                  child: InkWell(
                    key: Key('trending_card_${event.id}'),
                    onTap: () => onOpen(event.id),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          height: _imageHeight,
                          width: double.infinity,
                          child: event.posterUrl == null
                              ? _placeholder(c)
                              : Image.network(
                                  event.posterUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => _placeholder(c),
                                ),
                        ),
                        Padding(
                          padding: const EdgeInsetsDirectional.fromSTEB(8, 6, 8, 0),
                          child: Text(
                            event.cardHeadline,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11.5,
                              height: 1.35,
                              fontWeight: FontWeight.w800,
                              color: c.ink,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsetsDirectional.fromSTEB(8, 2, 8, 0),
                          child: Text(
                            meta,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 10.5,
                              height: 1.35,
                              fontWeight: FontWeight.w600,
                              color: c.inkSoft,
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
      ],
    );
  }

  /// بديل الصورة الغائبة أو الفاشلة — نفس رمز الفرح الذي يستعمله الكرت بلا ملصق.
  Widget _placeholder(NegevPalette c) => Container(
        color: c.surfaceSunk,
        alignment: Alignment.center,
        child: Icon(Icons.celebration_outlined, size: 22, color: c.inkFaint),
      );
}

/// صفحة إعلانٍ بين الكروت (تذكرة #173): ستوري موضع `feed` في صفحة كاملة من
/// تغذية الالتقاط، بعد كل فاصل إعلان التغذية الذي يرسله الخادم. الصورة تفتح العارض
/// (فالمشاهدة تُسجَّل بحدّ الثانيتين) والزرّ يسجّل النقرة ثم يفتح الرابط.
class _FeedAdCard extends StatelessWidget {
  const _FeedAdCard({
    required this.story,
    required this.position,
    required this.onOpen,
    required this.onCta,
  });

  final Story story;

  /// رقم الكرت الذي يلي هذا الإعلان (٨، ١٦، …) — في مفتاح الصفحة، فتعرف
  /// الأدوات والتشخيص أي إعلان تعرضه الشاشة بالضبط.
  final int position;
  final VoidCallback onOpen;
  final VoidCallback onCta;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final hasTarget = story.targetUrl != null && story.targetUrl!.isNotEmpty;
    return Container(
      key: Key('feed_ad_after_$position'),
      padding: const EdgeInsets.all(16),
      alignment: Alignment.center,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: c.line),
          boxShadow: const [
            BoxShadow(color: Color(0x33000000), blurRadius: 16, offset: Offset(0, 6)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: c.goldWash,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: c.gold),
                    ),
                    child: Text(
                      story.isAd ? 'إعلان' : 'مميّز',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: c.gold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if ((story.advertiserName ?? '').isNotEmpty)
                    Expanded(
                      child: Text(
                        story.advertiserName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11.5, color: c.inkSoft),
                      ),
                    ),
                ],
              ),
            ),
            // `Flexible` حول الصورة لا ارتفاعاً صامتاً: صفحة التغذية محدودة
            // الارتفاع بالشريط والكاروسيل، فصورةٌ ٢٢٠ ثابتة تفيض على الشاشات
            // القصيرة. هنا تنقص الصورة وحدها عند الحاجة، ويبقى النصّ والزرّ.
            Flexible(
              child: GestureDetector(
                key: Key('feed_ad_media_${story.id}'),
                onTap: onOpen,
                behavior: HitTestBehavior.opaque,
                child: SizedBox(
                  height: 220,
                  child: story.image == null
                      ? _storyPlaceholder(context)
                      : Image.network(
                          story.image!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _storyPlaceholder(context),
                        ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(14, 10, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    story.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.35,
                      fontWeight: FontWeight.w800,
                      color: c.ink,
                    ),
                  ),
                  if (hasTarget) ...[
                    const SizedBox(height: 8),
                    FilledButton(
                      key: Key('feed_ad_cta_${story.id}'),
                      onPressed: onCta,
                      style: FilledButton.styleFrom(
                        backgroundColor: c.sky,
                        foregroundColor: c.onSky,
                        minimumSize: const Size(0, 34),
                        padding: const EdgeInsets.symmetric(horizontal: 18),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        textStyle: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.bold,
                        ),
                        shape: const StadiumBorder(),
                      ),
                      child: Text(storyCtaLabel(story)),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// صفحة واحدة في تغذية الموبايل (تذكرة #173): كرت مناسبة، أو إعلانُ ستوري
/// موضع `feed` بينها. تُبنى في `_composeFeedPages` ولا تُخزَّن، فرقم الصفحة
/// يتغيّر مع وصول الستوريات ولا حالة ثانية تُدار.
class _FeedEntry {
  const _FeedEntry._({
    this.event,
    this.eventIndex = -1,
    this.ad,
    this.adPosition = 0,
    this.adIndex = 0,
  });

  factory _FeedEntry.event(Event event, int index) =>
      _FeedEntry._(event: event, eventIndex: index);

  factory _FeedEntry.ad(Story story, int position, int index) =>
      _FeedEntry._(ad: story, adPosition: position, adIndex: index);

  final Event? event;

  /// ترتيب المناسبة في `_events` — للتدرّج لا لرقم الصفحة.
  final int eventIndex;
  final Story? ad;

  /// رقم الكرت الذي يلي هذا الإعلان (٨، ١٦، …) — يُعرض في المفتاح للتشخيص.
  final int adPosition;

  /// ترتيب الإعلان في قائمة ستوريات `feed`، ليفتح العارض على الحلقة الصحيحة.
  final int adIndex;
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

/// بطاقة الدخول التسويقية (T-14): قصة واحدة في عمود التغذية عند فتحها، **تحت**
/// شريط الستوريات مباشرة، تشير إلى أوّل ستوري فيه.
///
/// دفعٌ لا تغطية: عنصر عادي في `Column` التغذية، فيزيح الكروت تحته قليلاً ثم
/// يعود التخطيط كما كان بعد إخفائها — رأس التغذية وشريط الستوريات ورقاقة
/// الألبومات تبقى مرئية وقابلة للكبس وهي المقصودة بالبطاقة. الظهور والإخفاء
/// والمؤقّت في `_EventsScreenState` وحدها — هذا الكلاس يرسم ويرسل حدثَي
/// فتح/إغلاق.
class _EntryCard extends StatelessWidget {
  const _EntryCard({
    required this.story,
    required this.onClose,
    required this.onTap,
  });

  final Story story;

  /// زرّ X: يخفي البطاقة وحدها، ولا يفتح العارض ولا يغلقه.
  final VoidCallback onClose;

  /// فتح الستوري من حلقتها الأولى — الشاشة تخفي البطاقة بعدها.
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final image = story.image;
    final title = story.title.trim();

    return Container(
      key: const Key('home_entry_card'),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c.line),
        // ظلّ خفيف يفصل البطاقة عن الكروت التي تدفعها تحتها.
        boxShadow: const [
          BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 6)),
        ],
      ),
      // بلا `clipBehavior`: الزوايا ١٨ ترسم الحدّ والظلّ، والمحتوى لا يبلغها
      // أصلاً (الصورة داخل قصّها الخاص ١٢)، فالقصّ هنا كان يقصّ الظلّ وحده.
      child: Row(
        children: [
          // الصورة والنصّ وحدهما منطقة النقر — زرّ الإغلاق شقيقها لا ابنها،
          // فلا يبتلع النقر الخارجي ضغطته.
          Expanded(
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(18),
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(10, 10, 8, 10),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          width: 96,
                          height: 96,
                          child: image == null
                              ? _storyFallbackAvatar(context)
                              : Image.network(
                                  image,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) =>
                                      _storyFallbackAvatar(context),
                                ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // سطر داخل `maxLines: 2` — لا عنوان يطرد الصورة
                            // ولا سطر فارغ حين يغيب العنوان.
                            if (title.isNotEmpty)
                              Text(
                                title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 14,
                                  height: 1.35,
                                  fontWeight: FontWeight.w800,
                                  color: c.ink,
                                ),
                              ),
                            const SizedBox(height: 3),
                            Text(
                              'من أول ستوري فوق — اضغط لتفتحها',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11, color: c.inkSoft),
                            ),
                            const SizedBox(height: 6),
                            FilledButton(
                              key: const Key('home_entry_card_cta'),
                              onPressed: onTap,
                              style: FilledButton.styleFrom(
                                backgroundColor: c.sky,
                                foregroundColor: c.onSky,
                                minimumSize: const Size(0, 30),
                                padding: const EdgeInsets.symmetric(horizontal: 14),
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                textStyle: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                                shape: const StadiumBorder(),
                              ),
                              child: const Text('شاهد الآن'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 2),
            child: IconButton(
              key: const Key('home_entry_card_close'),
              onPressed: onClose,
              tooltip: 'إغلاق',
              iconSize: 18,
              visualDensity: VisualDensity.compact,
              color: c.inkSoft,
              icon: const Icon(Icons.close_rounded),
            ),
          ),
        ],
      ),
    );
  }
}

/// نائب صورة القصة — حين لا صورة أصلاً، وحين تفشل الصورة الموجودة في التحميل.
Widget _storyFallbackAvatar(BuildContext context) => ColoredBox(
      color: context.c.surface,
      child: Icon(Icons.celebration, size: 22, color: context.c.sky),
    );

/// بديل صورة الستوري في البانر وبطاقة الإعلان (تذكرة #173): يملأ الإطار
/// الضيّق كاملاً بلا صورة، بخلاف [_storyFallbackAvatar] الذي يسكن كرةً صغيرة.
Widget _storyPlaceholder(BuildContext context) => SizedBox.expand(
      child: ColoredBox(
        color: context.c.surfaceSunk,
        child: Center(
          child: Icon(Icons.image_outlined, size: 26, color: context.c.inkFaint),
        ),
      ),
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
    // مقاس شريط الكروم: ٣٠×٣٠ كأخواتها. بدونه يحجز `IconButton` ٤٨dp للهدف
    // اللمسي فتفيض ستّ أيقونات على هاتف ٣٦٠dp.
    return IconButton(
      constraints: const BoxConstraints.tightFor(width: 30, height: 30),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(tapTargetSize: MaterialTapTargetSize.shrinkWrap),
      tooltip: 'الإشعارات',
      icon: Badge(
        label: Text('$unread'),
        isLabelVisible: unread > 0,
        child: const Icon(Icons.notifications_outlined, size: 20),
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
