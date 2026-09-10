import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../api/negev_api.dart' show Village;
import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
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

/// أجندة وتقويم المناسبات — عرض شهري للأيام التي تحوي مناسبات وأعراس
/// مع إمكانية الفلترة حسب القرى والتجمعات.
class AgendaScreen extends StatefulWidget {
  const AgendaScreen({super.key});

  @override
  State<AgendaScreen> createState() => _AgendaScreenState();
}

class _AgendaScreenState extends State<AgendaScreen> {
  DateTime _currentMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
  DateTime _selectedDate = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);

  List<Village> _villages = const [];
  int? _selectedVillageId;

  List<Event> _events = const [];
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _loadVillages();
    _loadEvents();
  }

  Future<void> _loadVillages() async {
    try {
      final list = await AppServices.of(context).api.listVillages();
      if (mounted) setState(() => _villages = list);
    } catch (_) {}
  }

  Future<void> _loadEvents() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final now = DateTime.now();
      final isPastMonth = _currentMonth.year < now.year ||
          (_currentMonth.year == now.year && _currentMonth.month < now.month);

      final result = await AppServices.of(context).api.listEvents(
            villageId: _selectedVillageId,
            limit: 100,
            archive: isPastMonth,
          );

      if (!mounted) return;
      setState(() {
        _events = result.events;
        _loading = false;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err;
        _loading = false;
      });
    }
  }

  void _onVillageSelected(int? villageId) {
    if (_selectedVillageId == villageId) return;
    setState(() => _selectedVillageId = villageId);
    _loadEvents();
  }

  void _prevMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1);
      _selectedDate = DateTime(_currentMonth.year, _currentMonth.month, 1);
    });
    _loadEvents();
  }

  void _nextMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 1);
      _selectedDate = DateTime(_currentMonth.year, _currentMonth.month, 1);
    });
    _loadEvents();
  }

  void _goToToday() {
    final now = DateTime.now();
    setState(() {
      _currentMonth = DateTime(now.year, now.month, 1);
      _selectedDate = DateTime(now.year, now.month, now.day);
    });
    _loadEvents();
  }

  bool _isEventOnDate(Event event, DateTime date) {
    final startDate = DateTime.tryParse(event.eventDate);
    if (startDate == null) return false;

    final start = DateTime(startDate.year, startDate.month, startDate.day);
    final target = DateTime(date.year, date.month, date.day);

    if (event.eventEndDate != null) {
      final endDate = DateTime.tryParse(event.eventEndDate!);
      if (endDate != null) {
        final end = DateTime(endDate.year, endDate.month, endDate.day);
        return (target.isAfter(start) || target.isAtSameMomentAs(start)) &&
            (target.isBefore(end) || target.isAtSameMomentAs(end));
      }
    }

    return start.isAtSameMomentAs(target);
  }

  List<Event> _eventsForDate(DateTime date) {
    return _events.where((e) => _isEventOnDate(e, date)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final selectedDayEvents = _eventsForDate(_selectedDate);
    final selectedDateStr =
        '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

    return Scaffold(
      appBar: AppBar(
        title: const Text('أجندة المناسبات'),
        actions: [
          TextButton(
            onPressed: _goToToday,
            child: const Text('اليوم', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
      body: Column(
        children: [
          // 1. فلتر القرى والتجمعات
          _buildVillagesFilter(),
          const Divider(height: 1),

          // 2. محتوى التقويم والمناسبات
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadEvents,
              child: ListView(
                children: [
                  // شريط التنقل بين الأشهر
                  _buildMonthHeader(),

                  // شبكة التقويم
                  _buildCalendarGrid(),

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
                            color: selectedDayEvents.isEmpty
                                ? context.c.surfaceSunk
                                : context.c.skyWash,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${selectedDayEvents.length} مناسبة',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: selectedDayEvents.isEmpty
                                  ? context.c.inkSoft
                                  : context.c.sky,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 12),

                  // قائمة مناسبات اليوم المحدد
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_error != null)
                    Padding(
                      padding: const EdgeInsets.all(32),
                      child: Center(
                        child: Text('حدث خطأ أثناء تحميل المناسبات: $_error'),
                      ),
                    )
                  else if (selectedDayEvents.isEmpty)
                    _buildEmptyDayState()
                  else
                    ...selectedDayEvents.map(_buildEventItem),

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVillagesFilter() {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          ChoiceChip(
            label: const Text('جميع القرى'),
            selected: _selectedVillageId == null,
            onSelected: (_) => _onVillageSelected(null),
            showCheckmark: false,
            backgroundColor: context.c.surface,
            selectedColor: context.c.sky,
            labelStyle: TextStyle(
              fontSize: 12.5,
              color: _selectedVillageId == null ? context.c.onSky : context.c.inkSoft,
              fontWeight: _selectedVillageId == null ? FontWeight.bold : FontWeight.normal,
            ),
            side: BorderSide(color: context.c.line),
          ),
          ..._villages.map((v) {
            final isSelected = _selectedVillageId == v.id;
            return Padding(
              padding: const EdgeInsetsDirectional.only(start: 6),
              child: ChoiceChip(
                label: Text(v.name),
                selected: isSelected,
                onSelected: (_) => _onVillageSelected(v.id),
                showCheckmark: false,
                backgroundColor: context.c.surface,
                selectedColor: context.c.sky,
                labelStyle: TextStyle(
                  fontSize: 12.5,
                  color: isSelected ? context.c.onSky : context.c.inkSoft,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
                side: BorderSide(color: context.c.line),
              ),
            );
          }),
        ],
      ),
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

    final now = DateTime.now();
    final isCurrentMonth = now.year == _currentMonth.year && now.month == _currentMonth.month;

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
              final isToday = isCurrentMonth && now.day == dayNum;
              final isSelected = _selectedDate.year == dayDate.year &&
                  _selectedDate.month == dayDate.month &&
                  _selectedDate.day == dayDate.day;

              final eventsOnDay = _eventsForDate(dayDate);
              final hasEvents = eventsOnDay.isNotEmpty;

              return InkWell(
                onTap: () => setState(() => _selectedDate = dayDate),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected
                        ? context.c.sky
                        : (isToday ? context.c.surfaceSunk : Colors.transparent),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isSelected
                          ? context.c.sky
                          : (isToday ? context.c.line : Colors.transparent),
                    ),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Text(
                        '$dayNum',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isSelected || isToday
                              ? FontWeight.bold
                              : FontWeight.normal,
                          color: isSelected
                              ? context.c.onSky
                              : (isToday ? context.c.gold : context.c.ink),
                        ),
                      ),
                      if (hasEvents)
                        Positioned(
                          bottom: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                            decoration: BoxDecoration(
                              color: isSelected ? context.c.gold : context.c.gold,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
                            child: Text(
                              '${eventsOnDay.length}',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.bold,
                                color: Colors.black,
                              ),
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
    final locationText = event.villageName != null && event.villageName!.isNotEmpty
        ? '${event.town} · ${event.villageName}'
        : event.town;

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
