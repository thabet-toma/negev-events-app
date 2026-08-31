import 'dart:async';

import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/event_card.dart';
import 'event_details_screen.dart';

/// الشاشة الرئيسية: القصص + بحث + فلترة بلدة + قائمة المناسبات.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  final _searchController = TextEditingController();

  String _town = 'الكل';
  String _search = '';
  Timer? _debounce;
  StreamSubscription<Map<String, dynamic>>? _newEventSub;

  Future<List<Event>>? _events;
  Future<List<Story>>? _stories;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _events ??= _load();
    _stories ??= AppServices.of(context).api.stories();

    // مناسبة جديدة نُشرت لحظياً — نُحدّث القائمة.
    _newEventSub ??=
        AppServices.of(context).realtime.onNewEvent.listen((_) => _refresh());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _newEventSub?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<List<Event>> _load() =>
      AppServices.of(context).api.listEvents(town: _town, search: _search);

  void _refresh() {
    if (!mounted) return;
    setState(() => _events = _load());
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _search = value;
      _refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('مناسبات النقب'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
            onPressed: _refresh,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() {
            _events = _load();
            _stories = AppServices.of(context).api.stories();
          });
          await _events;
        },
        child: Column(
          children: [
            _StoriesStrip(future: _stories),
            _SearchBar(
              controller: _searchController,
              onChanged: _onSearchChanged,
            ),
            _TownFilter(
              selected: _town,
              onSelected: (town) {
                _town = town;
                _refresh();
              },
            ),
            const Divider(height: 1),
            Expanded(
              child: FutureBuilder<List<Event>>(
                future: _events,
                builder: (context, snapshot) {
                  return AsyncView<List<Event>>(
                    snapshot: snapshot,
                    onRetry: _refresh,
                    isEmpty: (data) => data.isEmpty,
                    emptyMessage: _search.isNotEmpty
                        ? 'لا توجد مناسبات تطابق بحثك'
                        : 'لا توجد مناسبات معتمدة في $_town حالياً',
                    builder: (events) => ListView.builder(
                      padding: const EdgeInsets.only(top: 6, bottom: 20),
                      itemCount: events.length,
                      itemBuilder: (context, index) {
                        final event = events[index];
                        return EventCard(
                          event: event,
                          onTap: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    EventDetailsScreen(eventId: event.id),
                              ),
                            );
                            _refresh();
                          },
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
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
          prefixIcon: const Icon(Icons.search, color: AppTheme.gold),
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
            backgroundColor: AppTheme.bgSurface,
            selectedColor: AppTheme.gold,
            labelStyle: TextStyle(
              fontSize: 13,
              color: isSelected ? AppTheme.bgPrimary : AppTheme.textSecondary,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
            side: const BorderSide(color: AppTheme.borderSubtle),
          );
        },
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
              return SizedBox(
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
                              ? AppTheme.emerald
                              : AppTheme.borderSubtle,
                          width: 2,
                        ),
                      ),
                      child: ClipOval(
                        child: story.image == null
                            ? const ColoredBox(
                                color: AppTheme.bgSurface,
                                child: Icon(
                                  Icons.celebration,
                                  size: 22,
                                  color: AppTheme.gold,
                                ),
                              )
                            : Image.network(
                                story.image!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => const ColoredBox(
                                  color: AppTheme.bgSurface,
                                  child: Icon(
                                    Icons.celebration,
                                    size: 22,
                                    color: AppTheme.gold,
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
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}
