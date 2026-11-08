import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/auth_action_button.dart';
import '../widgets/event_card.dart' show arabicEventDate;
import 'event_details_screen.dart';

const List<String> _arMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const List<String> _arWeekdaysShort = [
  'أحد',
  'اثنين',
  'ثلاثاء',
  'أربعاء',
  'خميس',
  'جمعة',
  'سبت',
];

/// أجندة وتقويم المناسبات — عرض شهري للأيام التي تحوي مناسبات، بفلتر المحافظة
/// (تذكرة #175).
///
/// **العدّ من الخادم وحده:** `GET /api/events/calendar` هو من يحسب أي يوم تقع
/// فيه المناسبة — على امتدادها كاملاً (`event_end_date` وأيام `event_days`)
/// وبوابة الظهور العام. الحساب هنا في العميل على `eventDate` وحده كان يعدّ
/// المناسبة متعددة الأيام يوماً واحداً، ويعدّ `link_only` وهي غائبة عن كل قائمة.
///
/// **ومناسبات اليوم المختار** من `GET /api/events` القائم بـ`date_from`/
/// `date_to` متساويين — نفس تقاطع الامتداد الذي يعدّ به التقويم، فما يعدّه
/// التقويم هو ما يعرضه اليوم تحته، وليس مصفوفة محلية ثانية.
class AgendaScreen extends StatefulWidget {
  const AgendaScreen({super.key});

  @override
  State<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends State<AgendaScreen> {
  DateTime _currentMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime _selectedDate = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);

  /// فلتر المحافظة **داخل التقويم وحده** — `null` = كل المحافظات. لا يغيّر
  /// محافظة الاكتشاف المحفوظة (`RegionStore`)، فذاك اختيار الأسطح العامة.
  int? _regionId;

  /// `YYYY-MM-DD` → عدد المناسبات في ذلك اليوم، كما يعيده مسار التقويم.
  Map<String, int> _dayCounts = const {};
  /// هوية الشهر/المحافظة التي تملك `_dayCounts` الحالي؛ بلا هوية لا تُرسم نقاطه.
  String? _countsIdentity;
  List<Event> _dayEvents = const [];
  /// عدّ الخادم ليوم القائمة (`pagination.total`) — لا طول ما وصل: الحمل قد
  /// يتوقف عند سقف الصفحات، فيبقى العدّ المعلن صحيحاً ولو كانت القائمة ناقصة.
  int _dayTotal = 0;
  bool _dayTruncated = false;
  bool _dayLoading = true;
  /// فشل عدّ الشهر — مستقلّ عن فشل اليوم عمداً: لا يمسح أحدهما الآخر، وفشل
  /// التقويم لا يحجب قائمة يومٍ حُمِّلت بنجاح.
  Object? _monthError;
  /// فشل جلب مناسبات اليوم المختار وحده.
  Object? _dayError;
  bool _bootstrapped = false;

  /// حجم الصفحة في `GET /api/events` — سقف الخادم نفسه.
  static const int _dayPageSize = 100;
  /// سقف احتياطي للصفحات: عشرون صفحة = ألفا مناسبة في يوم واحد، ولا يوم
  /// بلغه، ووجوده يمنع حلقةً لا تنقضي لو أعاد الخادم صفحاتٍ لا تنتهي.
  static const int _dayMaxPages = 20;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    // كتالوج الأماكن مشترك في الجلسة، ووصوله هو ما يملأ حبات المحافظات —
    // لا اسم محافظة مكتوب في هذا الملف.
    AppServices.of(context).places.load();
    _loadMonth();
    _loadDay();
  }

  static String _monthKey(DateTime month) =>
      '${month.year}-${month.month.toString().padLeft(2, '0')}';

  static String _dayKey(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  static String _calendarIdentity(DateTime month, int? regionId) =>
      '${_monthKey(month)}|${regionId ?? 'null'}';

  Future<void> _loadMonth() async {
    final api = AppServices.of(context).api;
    final monthKey = _monthKey(_currentMonth);
    // هوية الطلب — الشهر **والمحافظة** — تُلتقط قبل النداء وتُقارَن بعد وصول
    // الجواب وقبل أي كتابة حالة: تبديل المحافظة أ ثم ب قد يستقبل جواب أ أخيراً
    // فتناقض أعدادُه الاختيار. الحارس بالقيمة، لا بترتيب الطلبات.
    final regionId = _regionId;
    final countsIdentity = _calendarIdentity(_currentMonth, regionId);
    setState(() {
      _monthError = null;
      // عدّ هوية سابقة لا يصلح بديلاً أثناء جلب هذه الهوية أو بعد فشلها.
      if (_countsIdentity != countsIdentity) {
        _dayCounts = const {};
        _countsIdentity = null;
      }
    });

    try {
      final days = await api.calendarDays(month: monthKey, regionId: regionId);
      if (!mounted) return;
      if (_calendarIdentity(_currentMonth, _regionId) != countsIdentity) return;
      setState(() {
        _dayCounts = {for (final day in days) day.date: day.count};
        _countsIdentity = countsIdentity;
      });
    } catch (err) {
      // مسار الفشل محروس كذلك: خطأ طلبٍ قديم لا يكتب خطأ الشهر لجلبةٍ أحدث.
      if (!mounted) return;
      if (_calendarIdentity(_currentMonth, _regionId) != countsIdentity) return;
      setState(() => _monthError = err);
    }
  }

  Future<void> _loadDay() async {
    final api = AppServices.of(context).api;
    final dateKey = _dayKey(_selectedDate);
    // هوية الطلب هنا اليوم **والمحافظة** معاً: تبديل المحافظة يعيد طلب اليوم
    // نفسه، فحارس اليوم وحده يُبقي قائمة المحافظة السابقة تحته.
    final regionId = _regionId;
    setState(() {
      _dayLoading = true;
      _dayError = null;
      // القائمة تُمحى في **بداية** كل طلب: بقاء عناصر يومٍ سابق تحت عنوان
      // اليوم الجديد يعرض مناسبات يوم آخر كأنها له، وفشل الطلب يجب أن يعرض
      // خطأه وحده لا قائمةً قديمة ولا «لا توجد مناسبات».
      _dayEvents = const [];
      // يُصفَّر مع كل طلب: القيمة القديمة تعدّ يوماً آخر، ولا تصلح بديلاً عن
      // عدّ الشهر حتى يصل.
      _dayTotal = 0;
      _dayTruncated = false;
    });

    try {
      // نفس شرط التقويم من المسار القائم: `date_from`/`date_to` على يوم واحد.
      // و«كل المحافظات» علَم المسار، والمحافظة المختارة ترويسةً لهذا النداء
      // وحده — لا للمحافظة المحفوظة في `RegionStore`.
      //
      // **والصفحات كلها**، لا الأولى: صفحة واحدة سقفها مئة، ويوم فيه ١٠١
      // مناسبة كان يعرض ١٠٠ ويعلن عدّاً لا يمكن الوصول إلى ما بعده.
      final events = <Event>[];
      var total = 0;
      var page = 1;
      var lastPage = 1;
      while (true) {
        final result = await api.listEvents(
          dateFrom: dateKey,
          dateTo: dateKey,
          limit: _dayPageSize,
          page: page,
          allRegions: regionId == null,
          regionHeader: regionId == null ? null : '$regionId',
        );
        events.addAll(result.events);
        total = result.pagination.total;
        lastPage = result.pagination.totalPages < 1 ? 1 : result.pagination.totalPages;
        if (page >= lastPage) break; // آخر صفحة: الحمل تمّ
        if (result.events.isEmpty) break; // صفحة فارغة قبل النهاية
        if (page >= _dayMaxPages) break; // سقف احتياطي
        page += 1;
      }

      if (!mounted) return;
      if (_dayKey(_selectedDate) != dateKey || _regionId != regionId) return;
      setState(() {
        _dayEvents = events;
        _dayTotal = total;
        _dayTruncated = events.length < total;
        _dayLoading = false;
      });
    } catch (err) {
      // خطأ طلبٍ قديم لا يكتب خطأ اليوم ولا يطفئ مؤشّر طلبٍ أحدث.
      if (!mounted) return;
      if (_dayKey(_selectedDate) != dateKey || _regionId != regionId) return;
      setState(() {
        _dayError = err;
        _dayLoading = false;
      });
    }
  }

  void _onRegionSelected(int? regionId) {
    if (_regionId == regionId) return;
    setState(() => _regionId = regionId);
    _loadMonth();
    _loadDay();
  }

  void _onDaySelected(DateTime dayDate) {
    if (_dayKey(_selectedDate) == _dayKey(dayDate)) return;
    setState(() => _selectedDate = dayDate);
    _loadDay();
  }

  void _prevMonth() {
    setState(() => _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1));
    _loadMonth();
  }

  void _nextMonth() {
    setState(() => _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 1));
    _loadMonth();
  }

  void _goToToday() {
    final now = DateTime.now();
    setState(() {
      _currentMonth = DateTime(now.year, now.month, 1);
      _selectedDate = DateTime(now.year, now.month, now.day);
    });
    _loadMonth();
    _loadDay();
  }

  @override
  Widget build(BuildContext context) {
    final services = AppServices.of(context);
    // العدّ من عدّ الشهر الذي حسبه الخادم، لا من طول القائمة: القائمة قد
    // تتوقف عند سقف الصفحات، وطولُها حينها لا يساوي عدّ اليوم.
    final countsMatchCurrentIdentity =
        _countsIdentity == _calendarIdentity(_currentMonth, _regionId);
    final selectedDayCount = countsMatchCurrentIdentity
        ? (_dayCounts[_dayKey(_selectedDate)] ?? _dayTotal)
        : _dayTotal;
    // الشارة لا تكذب: يومٌ فشل جلبُه لا يُنسب إليه عدّ — لا عدّ شهر ولا عدّ
    // صفحة سابقة — فيُعرض «—» بدل رقم.
    final hasDayError = _dayError != null;
    final selectedDateStr = _dayKey(_selectedDate);

    return Scaffold(
      appBar: AppBar(
        title: const Text('أجندة المناسبات'),
        actions: [
          TextButton(
            onPressed: _goToToday,
            child: const Text('اليوم', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          const AuthActionButton(),
        ],
      ),
      body: Column(
        children: [
          // 1. فلتر المحافظة (من كتالوج الخادم المشترك)
          AnimatedBuilder(
            // كتالوج البلدات يُخطر `places` عند وصوله، واختيار المحافظة يُخطر
            // `regions` — فالحبات تُرسم عند وصول أيهما.
            animation: Listenable.merge([services.regions, services.places]),
            builder: (context, _) => _buildRegionFilter(),
          ),
          const Divider(height: 1),

          // 2. محتوى التقويم ومناسبات اليوم المختار
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await _loadMonth();
                await _loadDay();
              },
              child: ListView(
                children: [
                  // شريط التنقل بين الأشهر
                  _buildMonthHeader(),

                  // شبكة التقويم
                  _buildCalendarGrid(),

                  // فشل عدّ الشهر لا يحجب اليوم: سقطت النقاط وحدها، وهذا سطر
                  // صغير يعلن أن العدّ لم يُحدَّث بدل إخفاء قائمة اليوم تحته.
                  if (_monthError != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.cloud_off_outlined, size: 14, color: context.c.inkSoft),
                          const SizedBox(width: 6),
                          Text(
                            'تعذّر تحديث عدّ الشهر',
                            style: TextStyle(fontSize: 12, color: context.c.inkSoft),
                          ),
                        ],
                      ),
                    ),

                  const Divider(height: 24),

                  // عنوان اليوم المحدد
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Icon(Icons.event_note, color: context.c.gold, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            arabicEventDate(selectedDateStr),
                            style: TextStyle(
                              fontSize: 15.5,
                              fontWeight: FontWeight.bold,
                              color: context.c.ink,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                          decoration: BoxDecoration(
                            color: hasDayError || selectedDayCount == 0
                                ? context.c.surfaceSunk
                                : context.c.skyWash,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            hasDayError ? '—' : '$selectedDayCount مناسبة',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: hasDayError || selectedDayCount == 0
                                  ? context.c.inkSoft
                                  : context.c.sky,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 12),

                  // قائمة مناسبات اليوم المحدد — من المسار القائم
                  if (_dayLoading)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_dayError != null)
                    Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Text('تعذّر تحميل مناسبات هذا اليوم: $_dayError'),
                      ),
                    )
                  else if (_dayEvents.isEmpty)
                    _buildEmptyDayState()
                  else
                    ..._dayEvents.map(_buildEventItem),

                  // سطر واحد حين تُعرض قائمة ناقصة: الشارة تعدّ اليوم كله
                  // والقائمة أقلّ، فبلا هذا السطر يبدو الفرق عطلاً لا حدّاً.
                  if (!_dayLoading && _dayError == null && _dayTruncated)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                      child: Center(
                        child: Text(
                          'تُعرض أول ${_dayEvents.length} من $_dayTotal مناسبة',
                          style: TextStyle(fontSize: 12, color: context.c.inkSoft),
                        ),
                      ),
                    ),

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRegionFilter() {
    final regions = AppServices.of(context).regions.activeRegions;
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          _buildRegionChip(null, 'كل المحافظات'),
          ...regions.map((region) {
            return Padding(
              padding: const EdgeInsetsDirectional.only(start: 6),
              child: _buildRegionChip(region.id, region.name),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildRegionChip(int? regionId, String label) {
    final isSelected = _regionId == regionId;
    return ChoiceChip(
      key: ValueKey<String>('agenda_region_${regionId ?? 'all'}'),
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => _onRegionSelected(regionId),
      showCheckmark: false,
      backgroundColor: context.c.surface,
      selectedColor: context.c.sky,
      labelStyle: TextStyle(
        fontSize: 12.5,
        color: isSelected ? context.c.onSky : context.c.inkSoft,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
      side: BorderSide(color: context.c.line),
    );
  }

  Widget _buildMonthHeader() {
    final monthName = _arMonths[_currentMonth.month - 1];
    final year = _currentMonth.year;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_right),
            tooltip: 'الشهر السابق',
            onPressed: _prevMonth,
          ),
          Text(
            '$monthName $year',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: context.c.ink,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_left),
            tooltip: 'الشهر التالي',
            onPressed: _nextMonth,
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarGrid() {
    final daysInMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 0).day;
    final firstDayWeekday = DateTime(_currentMonth.year, _currentMonth.month, 1).weekday;
    // في Dart: 7 هو الأحد. نريد الأحد أن يكون العمود 0
    final offset = firstDayWeekday % 7;
    final totalCells = offset + daysInMonth;
    final todayKey = _dayKey(DateTime.now());

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        children: [
          // أيام الأسبوع
          Row(
            children: _arWeekdaysShort
                .map(
                  (d) => Expanded(
                    child: Center(
                      child: Text(
                        d,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: context.c.inkSoft,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 8),

          // شبكة الأيام
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: totalCells,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              childAspectRatio: 1.0,
            ),
            itemBuilder: (context, index) {
              if (index < offset) {
                return const SizedBox.shrink();
              }

              final dayNum = index - offset + 1;
              final dayDate = DateTime(_currentMonth.year, _currentMonth.month, dayNum);
              final dayKey = _dayKey(dayDate);
              final isToday = dayKey == todayKey;
              final isSelected = _dayKey(_selectedDate) == dayKey;
              final count = _dayCounts[dayKey] ?? 0;

              return InkWell(
                onTap: () => _onDaySelected(dayDate),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  key: ValueKey<String>('agenda_day_$dayKey'),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? context.c.sky
                        : (isToday ? context.c.surfaceSunk : Colors.transparent),
                    borderRadius: BorderRadius.circular(10),
                    // اليوم الحالي مبروز بإطار سمكي وإن لم يكن مختاراً.
                    border: Border.all(
                      color: isSelected || isToday ? context.c.sky : Colors.transparent,
                      width: isToday && !isSelected ? 2 : 1,
                    ),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Text(
                        '$dayNum',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isSelected || isToday ? FontWeight.bold : FontWeight.normal,
                          color: isSelected
                              ? context.c.onSky
                              : (isToday ? context.c.gold : context.c.ink),
                        ),
                      ),
                      if (count > 0)
                        Positioned(
                          bottom: 5,
                          child: Container(
                            key: ValueKey<String>('agenda_dot_$dayKey'),
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              // نقطة ذهبية لمناسبة واحدة، وحمراء لاثنتين فأكثر.
                              color: count >= 2 ? context.c.danger : context.c.gold,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyDayState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.event_busy_outlined, size: 44, color: context.c.inkFaint),
            const SizedBox(height: 10),
            Text(
              'لا توجد مناسبات مسجلة في هذا اليوم',
              style: TextStyle(fontSize: 14.5, color: context.c.inkSoft),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEventItem(Event event) {
    final village = event.villageDisplayName;
    final locationText = village != null ? '${event.town} · $village' : event.town;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => EventDetailsScreen(eventId: event.id)),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // صورة البوستر أو أيقونة بديلة
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: event.posterUrl != null && event.posterUrl!.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: event.posterUrl!,
                        width: 54,
                        height: 54,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => Container(width: 54, height: 54, color: context.c.surfaceSunk),
                        errorWidget: (_, _, _) => Container(
                          width: 54,
                          height: 54,
                          color: context.c.surfaceSunk,
                          child: Icon(Icons.celebration_outlined, color: context.c.inkFaint),
                        ),
                      )
                    : Container(
                        width: 54,
                        height: 54,
                        color: context.c.surfaceSunk,
                        child: Icon(Icons.celebration_outlined, color: context.c.inkFaint),
                      ),
              ),
              const SizedBox(width: 12),

              // التفاصيل
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title.isNotEmpty ? event.title : event.groomName,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: context.c.ink,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined, size: 14, color: context.c.sky),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            locationText,
                            style: TextStyle(fontSize: 12.5, color: context.c.inkSoft),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (event.dinnerTime.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Icon(Icons.access_time, size: 13, color: context.c.inkFaint),
                          const SizedBox(width: 4),
                          Text(
                            event.dinnerTime,
                            style: TextStyle(fontSize: 12, color: context.c.inkSoft),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(width: 8),
              Icon(Icons.chevron_left, color: context.c.inkFaint),
            ],
          ),
        ),
      ),
    );
  }
}
