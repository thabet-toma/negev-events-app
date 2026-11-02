import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/negev_api.dart';
import '../main.dart';
import '../theme.dart';

/// صيغة عربية صحيحة للوحدة المَعدودة — الجمع لا يُشتقّ بزيادة حرف، فالصيغ
/// الثلاث تُمرَّر: المفرد («بلدة»)، والمثنى («بلدتان»)، وجمع ٣–١٠ («بلدات»).
/// وما بعد العشرة يعود مفرداً («١١ بلدة»).
///
/// **تعريف واحد للتطبيق كلّه:** يستدعيه [regionBannerLine] هنا، ويستدعيه
/// `_townsCountLabel` في منتقي محافظات «حسابي» بدل نسخة ثانية.
String arabicCountUnit(
  int count, {
  required String singular,
  required String dual,
  required String plural,
}) {
  if (count == 2) return dual;
  if (count >= 3 && count <= 10) return plural;
  return singular;
}

/// بادئة مفتاح إخفاء الشريط — مفتاحٌ لكل محافظة وحدها.
const String regionBannerKeyPrefix = 'negev_region_banner_';

/// مفتاح إخفاء الشريط لمحافظة بعينها — إخفاء طولكرم لا يخفي شريط اللد.
String regionBannerKey(int regionId) => '$regionBannerKeyPrefix$regionId';

/// معرّفات المحافظات التي أخفى الزائر شريطها — تُقرأ مرّة عند أول بناء.
///
/// تعذّر قراءة التخزين = مجموعة فارغة، أي «لا شيء مخفي» كي يظهر الشريط ولا
/// يكسر الشاشة؛ وكتابته محصَّنة مثلها ([markRegionBannerDismissed]).
Future<Set<int>> readDismissedRegionBanners() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final ids = <int>{};
    for (final key in prefs.getKeys()) {
      if (!key.startsWith(regionBannerKeyPrefix)) continue;
      final id = int.tryParse(key.substring(regionBannerKeyPrefix.length));
      if (id != null && prefs.getBool(key) == true) ids.add(id);
    }
    return ids;
  } catch (_) {
    return <int>{};
  }
}

/// يسجّل إخفاء شريط هذه المحافظة وحدها — فشل التخزين لا يُرجع الشريط في هذه
/// الجلسة (الإخفاء وقع في الشاشة)، ويعود في إقلاع لاحق لا أكثر.
Future<void> markRegionBannerDismissed(int regionId) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(regionBannerKey(regionId), true);
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}

/// سطر المعلومات تحت العنوان — نظير `regionBannerLineHtml` في الويب:
/// المناسبات المعتمدة إن وُجدت، وإلا عدد البلدات مع دعوة من لا مناسبة فيها
/// بعد. محافظة بلا مناسبات **لا تكتب «0 مناسبة»** — عدد البلدات هو الخبر،
/// وصفر البلدات يُقال «بلا بلدات» لا «0 بلدة».
String regionBannerLine(Region region, {required int events, required int towns}) {
  if (events > 0) {
    final unit = arabicCountUnit(
      events,
      singular: 'مناسبة',
      dual: 'مناسبتان',
      plural: 'مناسبات',
    );
    return '$events $unit في ${region.name}';
  }
  if (towns > 0) {
    final unit = arabicCountUnit(
      towns,
      singular: 'بلدة',
      dual: 'بلدتان',
      plural: 'بلدات',
    );
    return '$towns $unit في ${region.name} — كن أول من يعلن مناسبة فيها';
  }
  return 'بلا بلدات في ${region.name} — كن أول من يعلن مناسبة فيها';
}

/// الشريط كما يُعرض: الأصل الذي بدأ منه التطبيق، والمحافظة الفعّالة التي وصل
/// إليها، وعدّاداها الحقيقيان من الخادم.
class RegionBannerData {
  /// المحافظة التي بدأ بها التطبيق — أول محافظة نشطة بترتيب الخادم.
  final Region origin;

  /// المحافظة الفعّالة الآن — المختارة (أو محافظة الحساب) إن كانت نشطة، وإلا
  /// الأولى. اسمها يأتي من الخادم، **لا من نصّ مكتوب هنا**.
  final Region region;

  /// عدّادا المحافظة الفعّالة من `GET /api/towns`: المناسبات المعتمدة والبلدات
  /// النشطة. كلاهما مطلوب — بلا رقم لا يُخترع رقم.
  final int events;
  final int towns;

  const RegionBannerData({
    required this.origin,
    required this.region,
    required this.events,
    required this.towns,
  });

  /// «بعد النجاح في {الأصل}… توسّعنا إلى {الفعّالة}» — نصّ الويب نفسه.
  String get title => 'بعد النجاح في ${origin.name}… توسّعنا إلى ${region.name}';

  /// سطر الأرقام: المناسبات إن وُجدت، وإلا البلدات ودعوة أول مناسبة.
  String get line => regionBannerLine(region, events: events, towns: towns);
}

/// تبني الشريط من محافظات `GET /api/towns`، أو `null` حين لا شريط يُعرض.
///
/// الشروط كلها لازمة، وهي شروط `renderRegionBanner` في الويب:
/// - محافظة نشطة واحدة على الأقل — الأصل هو أولها بترتيب الخادم.
/// - الفعّالة **غير** الأصل: الشريط خبر توسّع، ولا خبر على المحافظة الأولى.
/// - `events_count` و`towns_count` كلاهما وصل من الخادم: غياب أحدهما يعني
///   خادماً لا يرسل الرقم، فلا يُعرض رقم مخترع.
RegionBannerData? buildRegionBanner({
  required List<Region> regions,
  int? effectiveRegionId,
}) {
  final active = regions.where((region) => region.isActive).toList();
  if (active.isEmpty) return null;

  final origin = active.first;
  // الفعّالة: المختارة إن كانت نشطة، وإلا الأولى — نفس `activeRegion()` في
  // الويب، فمعرّف محافظة عُطّلت بعد حفظها لا يُخفي الشريط بلا سبب.
  final region = active.firstWhere(
    (candidate) => candidate.id == effectiveRegionId,
    orElse: () => active.first,
  );
  if (region.id == origin.id) return null;

  final events = region.eventsCount;
  final towns = region.townsCount;
  if (events == null || towns == null || events < 0 || towns < 0) return null;

  return RegionBannerData(
    origin: origin,
    region: region,
    events: events,
    towns: towns,
  );
}

/// شريط التوسّع (#127) — نظير `renderRegionBanner` في `web/app.js` حرفياً:
/// سطران داخل التغذية يتبعان المحافظة الفعّالة، لا ورقة حواريّة ولا طبقة تحجب
/// الكروت. العنوان «بعد النجاح في {الأصل}… توسّعنا إلى {المحافظة}»، والأصل أول
/// محافظة نشطة بترتيب الخادم، والاسم والعدّادان من `GET /api/towns` وحده
/// (`PlacesCatalog`) — فلا اسم مكتوب هنا ولا طلب إضافي. و× يُخفيه لهذه
/// المحافظة وحدها، وتبديل المحافظة يعرض شريط المحافظة الجديدة.
///
/// **الشريط ليس عنصرًا عائمًا:** عنصرٌ عادي في `Column` التغذية فوق الكروت
/// (`events_screen.dart`)، فيدفعها قليلاً ثم يختفي عند الإخفاء.
///
/// يسمع [RegionStore] و[PlacesStore] معاً (`AnimatedBuilder`) فيتبع تبديل
/// المحافظة ووصول العدّادين فوراً، بلا `setState` دوريّ ولا جلبٍ خاصّ به.
/// ومفتاح الإخفاء يُقرأ من التخزين عند أول بناء، و× يكتبه ويُخفيه فوراً.
class RegionBanner extends StatefulWidget {
  const RegionBanner({super.key});

  @override
  State<RegionBanner> createState() => _RegionBannerState();
}

class _RegionBannerState extends State<RegionBanner> {
  /// ما أخفاه الزائر بـ× — من التخزين في أول بناء، ومن النقر فوراً بعده.
  Set<int> _dismissed = const <int>{};

  /// هل قُرئ التخزين؟ لا يُرسم شريط قبله كي لا يظهر ثم يختفي في أول إطار.
  bool _dismissedLoaded = false;

  /// مصادر إعادة الرسم: تبديل المحافظة، ووصول كتالوج `GET /api/towns`.
  Listenable? _source;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_source != null) return;

    final services = AppServices.of(context);
    _source = Listenable.merge([services.regions, services.places]);
    // الكتالوج مطلوب من التغذية أصلاً، والطلب المكرَّر آمن (`PlacesStore`
    // يعيد مستقبلاً واحداً) ويضمن وصول العدّادين لشريطٍ مستقلّ عنها.
    unawaited(services.places.load());
    unawaited(_readDismissed());
  }

  Future<void> _readDismissed() async {
    final ids = await readDismissedRegionBanners();
    if (!mounted) return;
    setState(() {
      // الدمج لا الاستبدال: نقرة × وقعت قبل وصول القراءة تبقى مخفية.
      _dismissed = {..._dismissed, ...ids};
      _dismissedLoaded = true;
    });
  }

  /// × يُخفي الشريط فوراً ويسجّله لهذه المحافظة وحدها.
  void _dismiss(int regionId) {
    setState(() => _dismissed = {..._dismissed, regionId});
    unawaited(markRegionBannerDismissed(regionId));
  }

  @override
  Widget build(BuildContext context) {
    if (!_dismissedLoaded) return const SizedBox.shrink();

    final services = AppServices.of(context);
    return AnimatedBuilder(
      animation: _source!,
      builder: (context, _) {
        final data = buildRegionBanner(
          regions: services.regions.regions,
          effectiveRegionId: services.regions.effectiveRegionId,
        );
        if (data == null || _dismissed.contains(data.region.id)) {
          return const SizedBox.shrink();
        }
        return _bar(context, data);
      },
    );
  }

  /// السطران بنغمة ذهبية من لوحة الثيم — لا لون مكتوب بيد هنا.
  Widget _bar(BuildContext context, RegionBannerData data) {
    final c = context.c;
    return Padding(
      key: const Key('region_banner'),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 9, 4, 9),
        decoration: BoxDecoration(
          color: c.goldWash,
          border: Border.all(color: c.gold),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Icon(Icons.auto_awesome, size: 16, color: c.gold),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data.title,
                    key: const Key('region_banner_title'),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      height: 1.5,
                      color: c.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    data.line,
                    key: const Key('region_banner_line'),
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      height: 1.5,
                      color: c.gold,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              key: const Key('region_banner_close'),
              tooltip: 'إخفاء شريط التوسّع',
              onPressed: () => _dismiss(data.region.id),
              icon: const Icon(Icons.close, size: 16),
              color: c.gold,
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints.tightFor(width: 28, height: 28),
            ),
          ],
        ),
      ),
    );
  }
}
