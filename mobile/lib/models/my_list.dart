import 'event.dart';

/// إعلان تعديل تاريخ نُشِر على مناسبة **بعد** حفظها في «قائمتي» — من
/// `date_change` في GET /api/my-reminders. الخادم لا يرفقه إلا إن كان الإعلان
/// أحدث من لحظة الحفظ (`published_at > r.created_at`)، فلا تنبيه على خبر سبق
/// المتابعة. القيم تصل كما خزّنها الإعلان، ولا تُعاد صياغتها هنا.
class DateChange {
  final String oldValue;
  final String newValue;
  final String? publishedAt;

  const DateChange({
    required this.oldValue,
    required this.newValue,
    this.publishedAt,
  });

  factory DateChange.fromJson(Map<String, dynamic> json) => DateChange(
        oldValue: '${json['old_value'] ?? ''}',
        newValue: '${json['new_value'] ?? ''}',
        publishedAt: _nullableString(json['published_at']),
      );
}

/// صفّ واحد في «قائمتي» — المناسبة كاملة (`Event.fromJson` نفسه، فالصفّ يصلها
/// بالحقول المسطّحة نفسها) مضافاً إليها ما يخصّ كونها في القائمة.
///
/// `bucket` و`spanStart`/`spanEnd` و`daysUntilStart` **تُقرأ كما وصلت**: الخادم
/// هو من يحسبها (`myListBucket`) وهو أيضاً من يرتّب الصفوف، فلا إعادة ترتيب ولا
/// اشتقاق تواريخ على الجهاز.
class MyListEntry {
  final Event event;
  final bool notify;
  final String bucket;
  final String spanStart;
  final String spanEnd;
  final int daysUntilStart;
  final DateChange? dateChange;

  const MyListEntry({
    required this.event,
    required this.notify,
    required this.bucket,
    required this.spanStart,
    required this.spanEnd,
    required this.daysUntilStart,
    this.dateChange,
  });

  /// دلاء «قائمتي» الستّ — القائمة المغلقة الوحيدة التي يعيدها `myListBucket`
  /// في `events.service.js`، لا اجتهاد من العميل.
  static const Set<String> upcomingBuckets = {
    'now',
    'tomorrow',
    'this_week',
    'later',
  };
  static const Set<String> endedBuckets = {'ended_recent', 'ended'};

  bool get isUpcoming => upcomingBuckets.contains(bucket);
  bool get isEnded => endedBuckets.contains(bucket);

  factory MyListEntry.fromJson(Map<String, dynamic> json) {
    final rawDateChange = json['date_change'];
    return MyListEntry(
      event: Event.fromJson(json),
      notify: json['notify'] == true,
      bucket: '${json['bucket'] ?? ''}',
      spanStart: _toDate(json['span_start']),
      spanEnd: _toDate(json['span_end']),
      daysUntilStart: _toInt(json['days_until_start']),
      dateChange: rawDateChange is Map<String, dynamic>
          ? DateChange.fromJson(rawDateChange)
          : null,
    );
  }
}

/// ردّ GET /api/my-reminders — الصفوف مرتّبة من الخادم، والعدّادات الثلاثة
/// (`counts`) تأتي معها محسوبة هناك، فلا تُعاد في العميل.
class MyList {
  final List<MyListEntry> entries;
  final int all;
  final int upcoming;
  final int ended;

  /// مناسبات يتابعها المستخدم عادت إلى المراجعة بعد تعديل حرِج — لا تظهر في
  /// القائمة (المعتمد فقط يظهر) لكنها لم تختفِ من متابعته، فتُعلَن بعددها.
  final int underReviewCount;

  const MyList({
    required this.entries,
    required this.all,
    required this.upcoming,
    required this.ended,
    this.underReviewCount = 0,
  });

  /// عدد الصفوف الجارية اليوم — شارة تبويب «قائمتي» في الشريط السفلي.
  int get nowCount => entries.where((entry) => entry.bucket == 'now').length;

  factory MyList.fromJson(Map<String, dynamic> json) {
    final rawEvents = json['events'];
    final entries = rawEvents is List
        ? rawEvents
            .whereType<Map<String, dynamic>>()
            .map(MyListEntry.fromJson)
            .toList()
        : <MyListEntry>[];

    final rawCounts = json['counts'];
    final counts = rawCounts is Map ? rawCounts : const <String, dynamic>{};

    return MyList(
      entries: entries,
      all: _toInt(counts['all']),
      upcoming: _toInt(counts['upcoming']),
      ended: _toInt(counts['ended']),
      underReviewCount: _toInt(json['under_review_count']),
    );
  }

  /// نسخة بحالة جرس محدَّثة على صفّ واحد — بعد نجاح PATCH بلا إعادة جلب.
  MyList withNotify(int eventId, bool notify) {
    return MyList(
      entries: entries
          .map(
            (entry) => entry.event.id == eventId
                ? MyListEntry(
                    event: entry.event,
                    notify: notify,
                    bucket: entry.bucket,
                    spanStart: entry.spanStart,
                    spanEnd: entry.spanEnd,
                    daysUntilStart: entry.daysUntilStart,
                    dateChange: entry.dateChange,
                  )
                : entry,
          )
          .toList(),
      all: all,
      upcoming: upcoming,
      ended: ended,
      underReviewCount: underReviewCount,
    );
  }

  /// نسخة أُزيل منها صفّ — عرض متفائل لحظة سحب الصفّ فقط (`Dismissible` لا
  /// يجوز أن يبقى في الشجرة بعد طيّه)، ويستبدله ردّ الخادم عند إعادة الجلب
  /// التالية. العدّادات هنا محسوبة من مجموعات الدلاء الباقية، لا من تواريخ.
  MyList withoutEvent(int eventId) {
    final remaining =
        entries.where((entry) => entry.event.id != eventId).toList();
    return MyList(
      entries: remaining,
      all: remaining.length,
      upcoming: remaining.where((entry) => entry.isUpcoming).length,
      ended: remaining.where((entry) => entry.isEnded).length,
      underReviewCount: underReviewCount,
    );
  }
}

int _toInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}

String? _nullableString(Object? value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}

/// تاريخ `YYYY-MM-DD` — الخادم يرسله بهذه الصيغة أصلاً (`DATE_FORMAT`)،
/// والتحويل هنا حماية من صيغة ISO كاملة لا أكثر.
String _toDate(Object? value) {
  final text = '${value ?? ''}';
  if (text.isEmpty) return '';
  final parsed = DateTime.tryParse(text);
  if (parsed == null) return text;
  final month = parsed.month.toString().padLeft(2, '0');
  final day = parsed.day.toString().padLeft(2, '0');
  return '${parsed.year}-$month-$day';
}
