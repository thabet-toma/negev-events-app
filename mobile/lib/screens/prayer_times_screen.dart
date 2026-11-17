import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../api/negev_api.dart';
import '../main.dart';
import '../models/prayer_times.dart';
import '../theme.dart';
import 'services_calculators_screen.dart' show formatGregorianDate;

/// مفتاح البلدة المحفوظة في `SharedPreferences` — القيمة الفارغة تعني
/// «حسب محافظتي» (بلا `town` في الطلب)، ونفس المفتاح في الويب حرفياً.
const String prayerTownStorageKey = 'negev_prayer_town';

/// رسالة الحالة الوحيدة عند تعذّر المواقيت — عربية وبلا تفاصيل داخلية.
/// ردّ 400 من الخادم يعرض رسالته العربية هو بدلاً منها.
const String prayerTimesErrorMessage =
    'تعذّر تحميل مواقيت الصلاة — حاول مرة أخرى';

/// يقرأ البلدة المحفوظة، أو '' لـ«حسب محافظتي» — تخزين معطَّل لا يُسقط الشاشة.
Future<String> readPrayerTown() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getString(prayerTownStorageKey) ?? '').trim();
  } catch (_) {
    return '';
  }
}

/// يحفظ اختيار البلدة؛ الفارغ يبقى قيمة صريحة تعني «حسب محافظتي».
Future<void> savePrayerTown(String town) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(prayerTownStorageKey, town.trim());
  } catch (_) {
    // التخزين معطَّل أو ممتلئ — الاختيار يبقى صالحاً لهذه الجلسة.
  }
}

/// «مواقيت الصلاة» (M3-C) — شاشة تقرأ `GET /api/prayer-times` وتعرض ما وصل.
///
/// لا يحسب هذا الملف وقت صلاة ولا يكتب وقتاً افتراضياً: الصفوف والطريقة
/// والبلدة من الخادم، والمهلة النسبية من `minutes_until` وحده. والجلب يقع عند
/// فتح الشاشة (كل فتح) وعند تبديل البلدة وعند «إعادة المحاولة» — بلا مؤقّت.
class PrayerTimesScreen extends StatefulWidget {
  const PrayerTimesScreen({super.key});

  @override
  State<PrayerTimesScreen> createState() => _PrayerTimesScreenState();
}

class _PrayerTimesScreenState extends State<PrayerTimesScreen> {
  bool _started = false;
  bool _loading = true;
  String? _error;
  PrayerTimesSnapshot? _snapshot;
  String _town = '';
  List<String> _towns = const [];

  /// يمنع ردّ طلب قديم من الكتابة فوق طلب أحدث بعد تبديل البلدة.
  int _generation = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    unawaited(_start());
  }

  Future<void> _start() async {
    final services = AppServices.of(context);
    final saved = await readPrayerTown();
    if (!mounted) return;

    // البذرة الاحتياطية تُعرض فوراً، لكن لا تُستعمل للحكم على البلدة المحفوظة:
    // غيابها عن البذرة لا يعني أنها عُطّلت. الحكم للكتالوج المؤكَّد وحده.
    setState(() {
      _towns = services.places.catalog.towns;
      _town = saved;
    });

    await _reloadCatalog();
    if (!mounted) return;
    await _fetch();
  }

  /// يعيد محاولة الكتالوج إن لم يكن قد وصل من الخادم. الفشل يعيد البذرة
  /// الاحتياطية ولا يمسّ البلدة المحفوظة؛ والنجاح وحده يتحقق من بقائها نشطة.
  Future<void> _reloadCatalog() async {
    final places = AppServices.of(context).places;
    if (places.catalog.fromServer) {
      await _applyCatalog(places.catalog);
      return;
    }
    final catalog = await places.load();
    if (!mounted) return;
    await _applyCatalog(catalog);
  }

  /// الكتالوج المؤكَّد وحده يمسح بلدة محفوظة لم يعد يذكرها — لا فشل الشبكة.
  Future<void> _applyCatalog(PlacesCatalog catalog) async {
    if (!mounted || !catalog.fromServer) return;
    var town = _town;
    if (town.isNotEmpty && !catalog.towns.contains(town)) {
      town = '';
      await savePrayerTown('');
      if (!mounted) return;
    }
    setState(() {
      _towns = catalog.towns;
      _town = town;
    });
  }

  /// «إعادة المحاولة» تعيد الكتالوج إن كان فشل، ثم تجلب المواقيت — فلا تبقى
  /// المنتقيات ناقصة بعد أن تعود الشبكة.
  Future<void> _retry() async {
    await _reloadCatalog();
    if (!mounted) return;
    await _fetch();
  }

  Future<void> _fetch() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _snapshot = null;
    });

    try {
      final snapshot = await AppServices.of(context).api.prayerTimes(
        town: _town.isEmpty ? null : _town,
      );
      if (!mounted || generation != _generation) return;
      if (!snapshot.isUsable) {
        setState(() {
          _loading = false;
          _error = prayerTimesErrorMessage;
        });
        return;
      }
      setState(() {
        _snapshot = snapshot;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _snapshot = null;
        _error = error.statusCode == 400 && error.message.isNotEmpty
            ? error.message
            : prayerTimesErrorMessage;
      });
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _snapshot = null;
        _error = prayerTimesErrorMessage;
      });
    }
  }

  void _onTownChanged(String? value) {
    final town = value ?? '';
    if (town == _town) return;
    setState(() => _town = town);
    unawaited(savePrayerTown(town));
    unawaited(_fetch());
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final snapshot = _snapshot;

    // قبل وصول الكتالوج تبقى بلدة المستخدم المحفوظة قابلةً للعرض والطلب.
    final towns = _town.isNotEmpty && !_towns.contains(_town)
        ? <String>[..._towns, _town]
        : _towns;

    return Scaffold(
      appBar: AppBar(title: const Text('مواقيت الصلاة')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 30),
        children: [
          Text(
            'البلدة',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: c.inkSoft,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: c.surfaceSunk,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: c.line),
            ),
            child: DropdownButton<String>(
              key: const Key('prayer_town_picker'),
              value: _town,
              isExpanded: true,
              underline: const SizedBox.shrink(),
              borderRadius: BorderRadius.circular(14),
              dropdownColor: c.surface,
              items: [
                const DropdownMenuItem<String>(
                  value: '',
                  child: Text('حسب محافظتي'),
                ),
                for (final town in towns)
                  DropdownMenuItem<String>(
                    value: town,
                    child: Text(town),
                  ),
              ],
              onChanged: _onTownChanged,
            ),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const _PrayerLoadingView()
          else if (_error != null)
            _PrayerErrorView(message: _error!, onRetry: _retry)
          else if (snapshot != null)
            _PrayerTimesCard(snapshot: snapshot),
        ],
      ),
    );
  }
}

/// انتظار المواقيت: نصّ عربي صريح مع مؤشّر — لا شاشة فارغة.
class _PrayerLoadingView extends StatelessWidget {
  const _PrayerLoadingView();

  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('prayer_loading'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(strokeWidth: 2.4),
            ),
            const SizedBox(height: 12),
            Text(
              'جارٍ تحميل مواقيت الصلاة…',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.c.inkSoft,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// حالة التعذّر: الرسالة العربية (أو رسالة الخادم في 400) وزرّ المحاولة.
/// لا صفوف ولا أوقات تحتها إطلاقاً — لا نسخة قديمة تُقرأ كمواقيت اليوم.
class _PrayerErrorView extends StatelessWidget {
  const _PrayerErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Center(
      key: const Key('prayer_error'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, size: 34, color: c.inkFaint),
            const SizedBox(height: 12),
            Text(
              message,
              key: const Key('prayer_error_message'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                height: 1.8,
                fontWeight: FontWeight.w700,
                color: c.danger,
              ),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              key: const Key('prayer_retry'),
              onPressed: onRetry,
              child: const Text('إعادة المحاولة'),
            ),
          ],
        ),
      ),
    );
  }
}

/// بطاقة المواقيت: العنوان بالبلدة، ثم التاريخ، فالصفوف الستة بترتيب الخادم،
/// فسطر الصلاة القادمة، فحاشية طريقة الحساب.
class _PrayerTimesCard extends StatelessWidget {
  const _PrayerTimesCard({required this.snapshot});

  final PrayerTimesSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final dateText = _dateLabel(snapshot.date);
    final nextLine = _nextLine(snapshot);
    final methodName = snapshot.method.name.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'مواقيت الصلاة — ${snapshot.place.name}',
          key: const Key('prayer_title'),
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w900,
            height: 1.5,
            color: c.ink,
          ),
        ),
        if (dateText.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'اليوم $dateText',
            key: const Key('prayer_date'),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              height: 1.7,
              color: c.inkSoft,
            ),
          ),
        ],
        const SizedBox(height: 14),
        for (final entry in snapshot.times) ...[
          _PrayerRow(
            entry: entry,
            isNext: _isNextRow(entry, snapshot),
          ),
          if (entry != snapshot.times.last) const SizedBox(height: 6),
        ],
        if (nextLine != null) ...[
          const SizedBox(height: 12),
          Text(
            nextLine,
            key: const Key('prayer_next_line'),
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w900,
              height: 1.8,
              color: c.gold,
            ),
          ),
        ],
        if (methodName.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            'حسب طريقة $methodName — قد تختلف دقيقة أو دقيقتين عن تقويم مسجدك',
            key: const Key('prayer_footnote'),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              height: 1.7,
              color: c.inkFaint,
            ),
          ),
        ],
      ],
    );
  }
}

/// صفّ صلاة واحد: الاسم ثم الوقت. صفّ الصلاة القادمة وحده بالذهبي.
class _PrayerRow extends StatelessWidget {
  const _PrayerRow({required this.entry, required this.isNext});

  final PrayerTimeEntry entry;
  final bool isNext;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final color = isNext ? c.gold : c.ink;
    return Container(
      key: Key('prayer_row_${entry.key}'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isNext ? c.goldWash : c.surfaceSunk,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isNext ? c.gold : c.line),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              entry.name,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                height: 1.5,
                color: color,
              ),
            ),
          ),
          Text(
            entry.time,
            style: TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w900,
              height: 1.5,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

/// `YYYY-MM-DD` كما يعرضه التطبيق: «١٧ نوفمبر ٢٠٢٦»، أو '' لغير المقروء.
String _dateLabel(String day) {
  final date = _parseIsoDay(day);
  return date == null ? '' : formatGregorianDate(date);
}

DateTime? _parseIsoDay(String? day) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(day ?? '');
  if (match == null) return null;
  return DateTime.utc(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
}

/// «الصلاة القادمة: العصر بعد ٤٧ دقيقة»، و«فجر الغد» حين يكون موعدها غداً.
String? _nextLine(PrayerTimesSnapshot snapshot) {
  final next = snapshot.next;
  if (next == null || next.name.isEmpty) return null;

  final label = _isTomorrow(next.date, snapshot.date) ? 'فجر الغد' : next.name;
  final minutes = next.minutesUntil;
  return minutes == null
      ? 'الصلاة القادمة: $label'
      : 'الصلاة القادمة: $label بعد ${prayerRelativeText(minutes)}';
}

bool _isTomorrow(String? nextDate, String date) {
  final next = _parseIsoDay(nextDate);
  final base = _parseIsoDay(date);
  if (next == null || base == null) return false;
  return next.difference(base).inDays == 1;
}

/// صفّ اليوم هو «القادم» فقط حين تكون الصلاة القادمة في اليوم المعروض نفسه؛
/// فجر الغد ليس صفَّ فجر اليوم، وغياب التاريخ لا يُضيء أي صف.
bool _isNextRow(PrayerTimeEntry entry, PrayerTimesSnapshot snapshot) {
  final next = snapshot.next;
  if (next == null || next.key != entry.key) return false;
  return next.date == snapshot.date;
}
