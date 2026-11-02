import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/negev_api.dart';
import '../theme.dart';

/// مفتاح «رأى قصة التوسّع» — مستقل عن مفتاح ورقة أول تشغيل (#126) عمداً:
/// كل ورقة لها حياتها، فإغلاق إحداهما لا يمنع الأخرى ولا يُظهرها مرّتين.
const String regionStorySeenKey = 'negev_region_story_seen';

/// هل عُرضت القصة سابقاً؟ تعذّر قراءة التخزين = «لم تُعرَض» كي تظهر،
/// وكتابتها محصَّنة كما في `region_onboarding.dart` فتفشل بهدوء.
Future<bool> isRegionStorySeen() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(regionStorySeenKey) ?? false;
  } catch (_) {
    return false;
  }
}

/// يسجّل العرض — فشل التخزين لا يكسر شيئاً في هذه الجلسة، والقصة قد تعود في
/// إقلاع لاحق لا أكثر.
Future<void> markRegionStorySeen() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(regionStorySeenKey, true);
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}

/// صيغة عربية صحيحة للوحدة المَعدودة — الجمع لا يُشتقّ بزيادة حرف، فالصيغ
/// الثلاث تُمرَّر: المفرد («بلدة»)، والمثنى («بلدتان»)، وجمع ٣–١٠ («بلدات»).
/// وما بعد العشرة يعود مفرداً («١١ بلدة»).
///
/// **تعريف واحد للتطبيق كلّه:** يستدعيه `_StatTile` هنا، ويستدعيه
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

/// ما يعنيه رقم محافظة في القصة: مناسباتها المعتمدة، أو بلداتها إن لم تكن
/// فيها مناسبة معتمدة بعد.
///
/// الوحدة تحمل صيغها الثلاث، فلا تُكتب الصيغ مرّة هنا ومرّة حيث تُعرض.
enum RegionStoryUnit {
  events(singular: 'مناسبة', dual: 'مناسبتان', plural: 'مناسبات'),
  towns(singular: 'بلدة', dual: 'بلدتان', plural: 'بلدات');

  const RegionStoryUnit({
    required this.singular,
    required this.dual,
    required this.plural,
  });

  final String singular;
  final String dual;
  final String plural;

  /// الصيغة التي تُعرض بعد الرقم — «مناسبات» لسبع، و«مناسبة» لواحدة أو لأحد
  /// عشر فأكثر، و«بلدتان» لاثنتين.
  String label(int count) =>
      arabicCountUnit(count, singular: singular, dual: dual, plural: plural);
}

/// قصة التوسّع كما تُعرض: عنوانٌ يبدأ من أول محافظة وصلت إلى المحافظة
/// الأخرى، ورقمان حقيقيان من الخادم — مناسبات المحافظة المعتمدة، أو بلداتها
/// إن لم تكن فيها مناسبة معتمدة بعد.
class RegionStory {
  /// المحافظة التي بدأ بها التطبيق — أول محافظة نشطة بترتيب الخادم.
  final Region origin;

  /// المحافظة التي وصل إليها — المختارة إن كانت هي الوجهة، وإلا أول محافظة
  /// تصلح وجهةً. اسمها يأتي من الخادم، **لا من نصّ مكتوب هنا**.
  final Region destination;

  /// العدد المعروض لكل محافظة ووحدته. الحقلان معاً لا رقم واحد: محافظة بصفر
  /// مناسبات تُعرض بعدد بلداتها، والعدد الخام وحده لا يقول أيّ الرقمين هو.
  final int originCount;
  final RegionStoryUnit originUnit;
  final int destinationCount;
  final RegionStoryUnit destinationUnit;

  const RegionStory({
    required this.origin,
    required this.destination,
    required this.originCount,
    required this.originUnit,
    required this.destinationCount,
    required this.destinationUnit,
  });

  /// هل للوجهة مناسبة معتمدة؟ هو ما يخفي سطر «كون أول من يعلن مناسبة فيها»
  /// عن وجهةٍ فيها ما يُعلن. مشتقّ من الوحدة لا حقلٌ ثالث يتناقض معها.
  bool get destinationHasEvents => destinationUnit == RegionStoryUnit.events;

  /// «بلّشنا بـ{الأولى}، وهلق {الثانية} معنا» — الصياغة المعتمدة في التذكرة،
  /// والأسماء مُدرَجة من الخادم.
  String get title => 'بلّشنا بـ${origin.name}، وهلق ${destination.name} معنا';
}

/// تبني القصة من محافظات `GET /api/towns`، أو `null` حين لا قصة تُروى.
///
/// الشروط كلها لازمة:
/// - محافظتان نشطتان **على الأقل** — بلا ثانية لا توسّع، والقصة كذبٌ لطيف.
/// - الرقم الذي سيُعرض وصل فعلاً من الخادم: `events_count` لكل طرف،
///   و`towns_count` لمناسباته صفر — بلا رقم لا يُخترع رقم.
/// - **والوجهة فيها مناسبات معتمدة أو بلدات:** المحافظة الجديدة قد تكون صفر
///   مناسبات يوم وصولها، وورقة تحيّةٍ تقول «0 مناسبة» نفيٌ لا خبر. فتُعرض
///   بلداتها بدل الصفر، ومعها سطر «كون أول من يعلن مناسبة فيها»؛ ومحافظةٌ بلا
///   مناسبات وبلا بلدات لا تصلح وجهة، وكذلك ما غاب عدّاده من الخادم.
/// - والوجهة هي المختارة إن كانت غير الأولى (فابن طولكرم يقرأ بلده في القصة،
///   لا محافظةً لا تخصّه)، **والأسبقية للمناسبات**: مختارةٌ بصفر مناسبات لا
///   تحجب محافظة أخرى فيها مناسبات، وتعود هي الوجهة — ببلداتها — إن لم يكن
///   في غيرها مناسبات.
///
/// الموقوفة لا تدخل: هي «قريباً» في منتقي الاكتشاف، وليست الوجهة التي وصل
/// إليها التطبيق — وهي في `regions_soon` أصلاً، فلا تصل هذه الدالة.
RegionStory? buildRegionStory({
  required List<Region> regions,
  int? selectedRegionId,
}) {
  final active = regions.where((region) => region.isActive).toList();
  if (active.length < 2) return null;

  final origin = active.first;
  final originUnit = _storyUnitFor(origin);
  if (originUnit == null) return null;

  final others = active.where((region) => region.id != origin.id);
  Region? destination;
  RegionStoryUnit? destinationUnit;
  // فئتان بترتيبهما: مناسبات ثم بلدات. والمختارة تسبق غيرها **داخل فئتها**
  // وحدها، فلا تختفي محافظة فيها مناسبات وراء مختارةٍ بصفر.
  for (final unit in const [RegionStoryUnit.events, RegionStoryUnit.towns]) {
    final candidates = others.where((region) => _storyUnitFor(region) == unit);
    if (candidates.isEmpty) continue;
    destination = candidates.firstWhere(
      (region) => region.id == selectedRegionId,
      orElse: () => candidates.first,
    );
    destinationUnit = unit;
    break;
  }
  if (destination == null || destinationUnit == null) return null;

  return RegionStory(
    origin: origin,
    destination: destination,
    originCount: _storyCount(origin, originUnit),
    originUnit: originUnit,
    destinationCount: _storyCount(destination, destinationUnit),
    destinationUnit: destinationUnit,
  );
}

/// الوحدة التي تُعرض بها المحافظة، أو `null` حين لا رقم صادق لها: غياب
/// `events_count` (خادم قديم) مانع، وصفرٌ في المناسبات والبلدات معاً لا رقم
/// له يُعرض. صفر المناسبات وحده يعني عرض البلدات.
RegionStoryUnit? _storyUnitFor(Region region) {
  final events = region.eventsCount;
  if (events == null) return null;

  if (events > 0) return RegionStoryUnit.events;
  final towns = region.townsCount;
  return towns != null && towns > 0 ? RegionStoryUnit.towns : null;
}

/// العدد المرافق للوحدة — الحقل الذي أثبتت [_storyUnitFor] وجوده.
int _storyCount(Region region, RegionStoryUnit unit) =>
    unit == RegionStoryUnit.events ? region.eventsCount! : region.townsCount!;

/// تعرض القصة مرّة واحدة في عمر التثبيت (تذكرة #127).
///
/// **المفتاح يُكتب بعد العرض لا قبله:** كتابته قبل `showModalBottomSheet`
/// تسجّل «عُرضت» حتى لو سقطت الورقة قبل أن تُرسم فعلاً، فتفوت القصة أبداً بلا
/// أن يراها أحد. ومن أغلقها بنقرة خارجها أو بزرّ الرجوع قرأها فعلاً، فلا تعود
/// — قاعدة التذكرة «لا تتكرّر بعد أول عرض». ومن حُجبت بحوار آخر لا يصل إلى
/// هنا أصلاً (`_isShellOnTop` في `HomeShell`)، فلا يُسجَّل له شيء.
Future<void> showRegionStorySheet(
  BuildContext context, {
  required RegionStory story,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _RegionStorySheet(story: story),
  );
  // بلا `context.mounted`: تسجيل العرض لا يمسّ الشجرة، ويجب أن يُكتب ولو
  // أُغلق التطبيق بعد الورقة فوراً — وإلا عادت في كل إقلاع.
  await markRegionStorySeen();
}

class _RegionStorySheet extends StatelessWidget {
  const _RegionStorySheet({required this.story});

  final RegionStory story;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
        child: Column(
          key: const Key('region_story_sheet'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.travel_explore, color: context.c.sky),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    story.title,
                    key: const Key('region_story_title'),
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: context.c.ink,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              'المناسبات والخدمات صارت لمنطقتك: من كل محافظة على حدة، في '
              'تطبيق «أعراسنا» نفسه.',
              style: TextStyle(
                color: context.c.inkSoft,
                fontSize: 13.5,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _StatTile(
                    key: const Key('region_story_origin_stat'),
                    count: story.originCount,
                    unit: story.originUnit,
                    name: story.origin.name,
                    highlighted: false,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatTile(
                    key: const Key('region_story_destination_stat'),
                    count: story.destinationCount,
                    unit: story.destinationUnit,
                    name: story.destination.name,
                    highlighted: true,
                  ),
                ),
              ],
            ),
            // وجهةٌ لم تُعلن فيها مناسبة بعد: الرقم بلداتها، والورقة تدعو صاحبها
            // إلى أول مناسبة بدل أن تنفي الخبر بصفر.
            if (!story.destinationHasEvents) ...[
              const SizedBox(height: 12),
              Text(
                'كون أول من يعلن مناسبة فيها',
                key: const Key('region_story_first_invite'),
                style: TextStyle(
                  color: context.c.inkSoft,
                  fontSize: 13.5,
                  height: 1.6,
                ),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('region_story_dismiss'),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('يلا نشوف المناسبات'),
            ),
          ],
        ),
      ),
    );
  }
}

/// رقم محافظة واحدة: العدّ الكبير، ثم ما يعنيه الرقم — «7 مناسبات في طولكرم»،
/// أو «10 بلدات في طولكرم» لوجهةٍ لم تُعلن فيها مناسبة بعد.
class _StatTile extends StatelessWidget {
  const _StatTile({
    super.key,
    required this.count,
    required this.unit,
    required this.name,
    required this.highlighted,
  });

  final int count;

  /// ماذا يعدّ [count] — مناسبات أو بلدات، وهي التي تعرف صيغتها العربية.
  final RegionStoryUnit unit;

  final String name;

  /// محافظة المستخدم تُلوَّن — هي خبر الورقة.
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: highlighted ? context.c.sky : context.c.line,
          width: highlighted ? 1.4 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$count',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: highlighted ? context.c.sky : context.c.ink,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${unit.label(count)} في $name',
            style: TextStyle(
              fontSize: 12.5,
              color: context.c.inkSoft,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
