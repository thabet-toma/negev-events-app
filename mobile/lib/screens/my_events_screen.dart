import 'package:flutter/material.dart';

import '../main.dart';
import '../models/event.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/event_card.dart';
import 'edit_event_screen.dart';

/// التسمية العربية لحالة مناسبة — نفس القيم الثلاث في `events.status`
/// (`pending`/`approved`/`rejected`) على الخادم، بلا افتراض رابع.
String eventStatusLabel(String? status) {
  switch (status) {
    case 'approved':
      return 'منشورة';
    case 'rejected':
      return 'مرفوضة';
    case 'pending':
      return 'قيد المراجعة';
    default:
      return status ?? '';
  }
}

Color eventStatusColor(BuildContext context, String? status) {
  switch (status) {
    case 'approved':
      return context.c.success;
    case 'rejected':
      return context.c.danger;
    default:
      return context.c.warn;
  }
}

Color eventStatusWash(BuildContext context, String? status) {
  switch (status) {
    case 'approved':
      return context.c.successWash;
    case 'rejected':
      return context.c.dangerWash;
    default:
      return context.c.warnWash;
  }
}

/// كل ما نشره المستخدم الحالي — بكل الحالات وبلا حدّ «القادم فقط»: مناسبة
/// قيد المراجعة يجب أن تبقى ظاهرة هنا بوضوح، ومناسبة منتهية تبقى في تاريخه.
class MyEventsScreen extends StatefulWidget {
  const MyEventsScreen({super.key});

  @override
  State<MyEventsScreen> createState() => _MyEventsScreenState();
}

class _MyEventsScreenState extends State<MyEventsScreen> {
  Future<List<Event>>? _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= AppServices.of(context).api.myEvents();
  }

  void _reload() {
    setState(() => _future = AppServices.of(context).api.myEvents());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('مناسباتي')),
      body: FutureBuilder<List<Event>>(
        future: _future,
        builder: (context, snapshot) {
          return AsyncView<List<Event>>(
            snapshot: snapshot,
            onRetry: _reload,
            isEmpty: (data) => data.isEmpty,
            emptyMessage: 'لم تنشر أي مناسبة بعد',
            builder: (events) => ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: events.length,
              itemBuilder: (context, index) {
                final event = events[index];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 4),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: eventStatusWash(context, event.status),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            eventStatusLabel(event.status),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: eventStatusColor(context, event.status),
                            ),
                          ),
                        ),
                      ),
                    ),
                    EventCard(
                      event: event,
                      onTap: () async {
                        // نعيد التحميل دائماً بعد العودة — شاشة التعديل لا
                        // تُغلَق تلقائياً بعد الحفظ (قد يعدّل المستخدم أكثر
                        // من مرة قبل الرجوع)، فالحالة الجديدة تصل هنا فقط
                        // بجلب جديد، لا بقيمة إرجاع من الشاشة.
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => EditEventScreen(event: event),
                          ),
                        );
                        _reload();
                      },
                    ),
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }
}
