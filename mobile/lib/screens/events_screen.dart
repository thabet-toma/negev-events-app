import 'dart:async';

import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../models/notification.dart' as notif;
import '../theme.dart';
import '../widgets/async_view.dart' show showMessage;
import '../widgets/congratulations.dart';
import '../widgets/event_card.dart';
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

  String _town = 'الكل';
  String _search = '';
  int? _occasionTypeId;
  bool _archive = false;
  Timer? _debounce;

  StreamSubscription<Map<String, dynamic>>? _newEventSub;

  Future<List<Story>>? _stories;
  Future<List<OccasionType>>? _types;

  List<Event> _events = const [];
  List<Announcement> _announcements = const [];
  Pagination? _pagination;
  bool _initialLoading = true;
  bool _loadingMore = false;
  Object? _error;
  bool _didInit = false;

  /// يُصعَّد مع كل طلب صفحة أولى جديد — طلب `_loadMore` بدأ قبل تغيير فلتر
  /// يتجاهل نتيجته إن وصلت بعد أن بدأ طلب أحدث (فلتر آخر تغيّر أثناء
  /// انتظاره)، بدل أن يُلحِق صفحة من فلتر قديم بقائمة الفلتر الجديد.
  int _requestGeneration = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _stories ??= AppServices.of(context).api.stories();
    _types ??= AppServices.of(context).api.listOccasionTypes();

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
            town: _town,
            search: _search,
            occasionTypeId: _occasionTypeId,
            archive: _archive,
            page: 1,
          );
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _events = result.events;
        _pagination = result.pagination;
        _announcements = result.announcements;
        _initialLoading = false;
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
            town: _town,
            search: _search,
            occasionTypeId: _occasionTypeId,
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

  void _onTownSelected(String town) {
    _town = town;
    _loadFirstPage();
  }

  void _onOccasionTypeSelected(int? id) {
    _occasionTypeId = id;
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

    try {
      if (event.isReminded) {
        await services.api.unremind(event.id);
      } else {
        await services.api.remind(event.id);
      }
      if (!mounted) return;
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
            _TownFilter(selected: _town, onSelected: _onTownSelected),
            FutureBuilder<List<OccasionType>>(
              future: _types,
              builder: (context, snapshot) {
                final types = snapshot.data ?? const <OccasionType>[];
                return _OccasionTypeTabs(
                  types: types,
                  selectedId: _occasionTypeId,
                  onSelected: _onOccasionTypeSelected,
                );
              },
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
      return const Center(child: CircularProgressIndicator());
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
                        ? 'لا توجد مناسبات منتهية في $_town'
                        : 'لا توجد مناسبات معتمدة في $_town حالياً',
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
          return EventCard(
            event: event,
            onTap: () => _openEvent(event.id),
            onCongratulationsTap: () => _openCongratulations(event),
            onRemindTap: () => _toggleRemind(event),
          );
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

class _TownFilter extends StatelessWidget {
  const _TownFilter({required this.selected, required this.onSelected});

  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    const towns = ['الكل', ...AppConfig.towns];

    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        itemCount: towns.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final town = towns[index];
          final isSelected = town == selected;
          return ChoiceChip(
            label: Text(town),
            selected: isSelected,
            onSelected: (_) => onSelected(town),
            showCheckmark: false,
            backgroundColor: context.c.surface,
            selectedColor: context.c.sky,
            labelStyle: TextStyle(
              fontSize: 13,
              color: isSelected ? context.c.onSky : context.c.inkSoft,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
            side: BorderSide(color: context.c.line),
          );
        },
      ),
    );
  }
}

/// تبويبات نوع المناسبة — «الكل» أولاً ثم كل نوع نشِط بترتيب الخادم
/// (`position`). لا قائمة ثابتة: نوع يضيفه الأدمن يظهر تبويبه بلا نشر APK.
class _OccasionTypeTabs extends StatelessWidget {
  const _OccasionTypeTabs({
    required this.types,
    required this.selectedId,
    required this.onSelected,
  });

  final List<OccasionType> types;
  final int? selectedId;
  final ValueChanged<int?> onSelected;

  @override
  Widget build(BuildContext context) {
    if (types.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        itemCount: types.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          if (index == 0) {
            final isSelected = selectedId == null;
            return ChoiceChip(
              label: const Text('الكل'),
              selected: isSelected,
              onSelected: (_) => onSelected(null),
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

          final type = types[index - 1];
          final isSelected = selectedId == type.id;
          final color = occasionTypeColor(type.color, context.c.sky);
          return ChoiceChip(
            label: Text(type.icon.isEmpty ? type.name : '${type.icon} ${type.name}'),
            selected: isSelected,
            onSelected: (_) => onSelected(type.id),
            showCheckmark: false,
            backgroundColor: context.c.surface,
            selectedColor: color,
            labelStyle: TextStyle(
              fontSize: 12.5,
              color: isSelected ? context.c.onSky : color,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
            side: BorderSide(color: color.withValues(alpha: 0.6)),
          );
        },
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
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          n.isRead ? Icons.notifications_none : Icons.notifications_active,
                          color: n.isRead ? context.c.inkFaint : context.c.sky,
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
                              await api.markNotificationRead(n.id);
                              _load();
                            } catch (_) {
                              // لا يعطّل فتح المناسبة إن فشل تعليم القراءة.
                            }
                          }
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
