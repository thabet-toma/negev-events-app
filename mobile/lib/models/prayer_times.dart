/// نماذج مواقيت الصلاة (M3-C) — شكل `GET /api/prayer-times`:
/// `{ success, place: { name, kind }, date, timezone, method: { key, name },
/// times: [{ key, name, time }], next: { key, name, time, date,
/// minutes_until } | null }`.
///
/// الخادم وحده يحسب المواقيت؛ هذا الملف يقرأها كما وصلت ولا يشتقّ وقتاً ولا
/// يخترع بلدة. وكل حقل غائب أو غير متوقَّع يعود افتراضياً بدل أن يرمي، والردّ
/// الذي لا يكتمل يوماً صالحاً يُرفض عند الحدّ (`isUsable`) فتعرض الشاشة حالة
/// الخطأ وزرّ المحاولة بدل بطاقة جزئية.
library;

/// مكان المواقيت كما يسمّيه الخادم: بلدة اختارها الزائر أو محافظة الطلب.
class PrayerPlace {
  const PrayerPlace({this.name = '', this.kind = ''});

  final String name;
  final String kind;

  factory PrayerPlace.fromJson(Map<String, dynamic> json) => PrayerPlace(
    name: _text(json['name']),
    kind: _text(json['kind']),
  );
}

/// طريقة الحساب (الهيئة المصرية العامة للمساحة…) — تُعرض في الحاشية وحدها.
class PrayerMethod {
  const PrayerMethod({this.key = '', this.name = ''});

  final String key;
  final String name;

  factory PrayerMethod.fromJson(Map<String, dynamic> json) => PrayerMethod(
    key: _text(json['key']),
    name: _text(json['name']),
  );
}

/// مفاتيح مداخل المواقيت الستة التي يعيدها الخادم بهذا الترتيب — لا أقل ولا أكثر، والشروق مدخل وقت لا صلاة.
const List<String> _prayerTimeKeys = [
  'fajr',
  'sunrise',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
];

final RegExp _prayerTimePattern = RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$');

/// مدخل وقت واحد — صلاة أو شروق — بمفتاحه واسمه ووقته كما أرسلها الخادم، بلا حساب في العميل.
class PrayerTimeEntry {
  const PrayerTimeEntry({this.key = '', this.name = '', this.time = ''});

  final String key;
  final String name;
  final String time;

  factory PrayerTimeEntry.fromJson(Map<String, dynamic> json) => PrayerTimeEntry(
    key: _text(json['key']),
    name: _text(json['name']),
    time: _text(json['time']),
  );
}

/// الصلاة القادمة كما حسبها الخادم. [minutesUntil] قد يغيب في خادم أقدم،
/// فتبقى العبارة «الصلاة القادمة: …» بلا «بعد …» بدل اختراع مهلة.
class NextPrayer {
  const NextPrayer({
    this.key = '',
    this.name = '',
    this.time = '',
    this.date,
    this.minutesUntil,
  });

  final String key;
  final String name;
  final String time;

  /// `YYYY-MM-DD` ليوم الصلاة القادمة — غداً يعني «فجر الغد» في العرض.
  final String? date;

  final int? minutesUntil;

  factory NextPrayer.fromJson(Map<String, dynamic> json) {
    final date = _text(json['date']);
    return NextPrayer(
      key: _text(json['key']),
      name: _text(json['name']),
      time: _text(json['time']),
      date: date.isEmpty ? null : date,
      minutesUntil: _toInt(json['minutes_until']),
    );
  }
}

/// ردّ `/api/prayer-times` كاملاً. الشاشة لا تعرض شيئاً حين لا يكون الردّ
/// صالحاً: [isUsable] يشترط يوماً كاملاً — ستة صفوف وأسماء وأوقات وطريقة
/// ومكان وتاريخاً ومنطقة زمنية.
class PrayerTimesSnapshot {
  const PrayerTimesSnapshot({
    this.place = const PrayerPlace(),
    this.date = '',
    this.timezone = '',
    this.method = const PrayerMethod(),
    this.times = const [],
    this.next,
  });

  final PrayerPlace place;

  /// `YYYY-MM-DD` كما أرسله الخادم — تاريخ الأوقات المعروضة.
  final String date;

  final String timezone;
  final PrayerMethod method;

  /// الأوقات بترتيب الخادم نفسه — لا يُرتَّب في العميل.
  final List<PrayerTimeEntry> times;

  final NextPrayer? next;

  /// هل الردّ يوماً كاملاً قابلاً للعرض؟ ستة مفاتيح فريدة من مفاتيح الخادم،
  /// لكلٍّ اسم عربي ووقت `HH:mm`، ومكان وتاريخ ومنطقة زمنية وطريقة حساب —
  /// فلا تُرسم بطاقة فيها صفّ فارغ أو حاشية بلا طريقة. هذا تحقّق حدّي واحد،
  /// لا إطار تحقّق عام: الردّ غير الصالح يعود إلى رسالة الخطأ وزرّ المحاولة.
  bool get isUsable {
    if (place.name.isEmpty) return false;
    if (place.kind != 'town' && place.kind != 'region') return false;
    if (!_isValidDay(date)) return false;
    if (timezone.isEmpty) return false;
    if (method.key.isEmpty || method.name.isEmpty) return false;
    if (times.length != _prayerTimeKeys.length) return false;

    final seen = <String>{};
    for (final entry in times) {
      if (!_prayerTimeKeys.contains(entry.key) || !seen.add(entry.key)) {
        return false;
      }
      if (entry.name.isEmpty || !_prayerTimePattern.hasMatch(entry.time)) {
        return false;
      }
    }
    return seen.length == _prayerTimeKeys.length;
  }

  factory PrayerTimesSnapshot.fromJson(Map<String, dynamic> json) {
    final rawPlace = json['place'];
    final rawMethod = json['method'];

    final times = <PrayerTimeEntry>[];
    final rawTimes = json['times'];
    if (rawTimes is List) {
      for (final raw in rawTimes) {
        if (raw is! Map) continue;
        final entry = PrayerTimeEntry.fromJson(Map<String, dynamic>.from(raw));
        if (entry.key.isEmpty && entry.name.isEmpty && entry.time.isEmpty) continue;
        times.add(entry);
      }
    }

    NextPrayer? next;
    final rawNext = json['next'];
    if (rawNext is Map) {
      final parsed = NextPrayer.fromJson(Map<String, dynamic>.from(rawNext));
      if (parsed.key.isNotEmpty || parsed.name.isNotEmpty) next = parsed;
    }

    return PrayerTimesSnapshot(
      place: rawPlace is Map
          ? PrayerPlace.fromJson(Map<String, dynamic>.from(rawPlace))
          : const PrayerPlace(),
      date: _text(json['date']),
      timezone: _text(json['timezone']),
      method: rawMethod is Map
          ? PrayerMethod.fromJson(Map<String, dynamic>.from(rawMethod))
          : const PrayerMethod(),
      times: times,
      next: next,
    );
  }
}

/// المهلة النسبية من `minutes_until` كما بناها الخادم: «٤٧ دقيقة»،
/// «ساعة و١٢ دقيقة»، «أقل من دقيقة» — بأرقام عربية هندية كما في بقية التطبيق.
String prayerRelativeText(int? minutesUntil) {
  final total = minutesUntil ?? 0;
  if (total < 1) return 'أقل من دقيقة';
  if (total < 60) return _minutesText(total);

  final hours = total ~/ 60;
  final minutes = total % 60;
  final hourText = _hoursText(hours);
  return minutes == 0 ? hourText : '$hourText و${_minutesText(minutes)}';
}

String _minutesText(int count) {
  if (count == 1) return 'دقيقة';
  if (count == 2) return 'دقيقتان';
  if (count >= 3 && count <= 10) return '${_arabicNumber(count)} دقائق';
  return '${_arabicNumber(count)} دقيقة';
}

String _hoursText(int count) {
  if (count == 1) return 'ساعة';
  if (count == 2) return 'ساعتان';
  if (count >= 3 && count <= 10) return '${_arabicNumber(count)} ساعات';
  return '${_arabicNumber(count)} ساعة';
}

const String _arabicDigits = '٠١٢٣٤٥٦٧٨٩';

String _arabicNumber(int value) {
  final buffer = StringBuffer();
  for (final char in '$value'.split('')) {
    final digit = int.tryParse(char);
    buffer.write(digit == null ? char : _arabicDigits[digit]);
  }
  return buffer.toString();
}

String _text(Object? value) => value == null ? '' : '$value'.trim();

/// `YYYY-MM-DD` صالح فعلاً — لا ٣٠ فبراير ولا شهراً ١٣.
bool _isValidDay(String day) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(day);
  if (match == null) return false;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final date = int.parse(match.group(3)!);
  final parsed = DateTime.utc(year, month, date);
  return parsed.year == year && parsed.month == month && parsed.day == date;
}

int? _toInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  final text = value == null ? '' : '$value'.trim();
  if (text.isEmpty) return null;
  return int.tryParse(text) ?? double.tryParse(text)?.round();
}
