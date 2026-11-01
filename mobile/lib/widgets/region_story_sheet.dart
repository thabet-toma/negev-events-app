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

/// قصة التوسّع كما تُعرض: عنوانٌ يبدأ من أول محافظة وصلت إلى المحافظة
/// الأخرى، ورقمان حقيقيان من `events_count` نفسهما.
class RegionStory {
  /// المحافظة التي بدأ بها التطبيق — أول محافظة نشطة بترتيب الخادم.
  final Region origin;

  /// المحافظة التي وصل إليها — المحافظة المختارة إن كانت غير الأولى، وإلا
  /// الثانية. اسمها يأتي من الخادم، **لا من نصّ مكتوب هنا**.
  final Region destination;

  /// عدد المناسبات في كل منهما كما أعاده `GET /api/towns` — لا حساب ولا رقم
  /// ثابت في العميل.
  final int originEvents;
  final int destinationEvents;

  const RegionStory({
    required this.origin,
    required this.destination,
    required this.originEvents,
    required this.destinationEvents,
  });

  /// «بلّشنا بـ{الأولى}، وهلق {الثانية} معنا» — الصياغة المعتمدة في التذكرة،
  /// والأسماء مُدرَجة من الخادم.
  String get title => 'بلّشنا بـ${origin.name}، وهلق ${destination.name} معنا';
}

/// تبني القصة من محافظات `GET /api/towns`، أو `null` حين لا قصة تُروى.
///
/// الشروط كلها لازمة:
/// - محافظتان نشطتان **على الأقل** — بلا ثانية لا توسّع، والقصة كذبٌ لطيف.
/// - `events_count` وصل فعلاً لكلتيهما — بلا رقم لا يُخترع رقم.
/// - **والوجهة فيها مناسبة معتمدة واحدة على الأقل:** `events_count` صار يعدّ
///   المعتمد وحده، ومحافظة الوصول يوم الإطلاق جديدةٌ بلا مناسبات. «0 مناسبة
///   في …» في ورقة تحيّة ليست خبراً بل نفيٌ للخبر، فلا تُروى قصةٌ بصفر: تُختار
///   المختارة إن كانت غير البداية وفيها مناسبات، وإلا فأول محافظة أخرى فيها
///   مناسبات، وإلا فلا قصة.
/// - والوجهة هي المختارة إن كانت غير الأولى (فابن طولكرم يقرأ بلده في القصة،
///   لا محافظةً لا تخصّه)، وإلا التالية بالترتيب التي فيها مناسبات.
///
/// الموقوفة لا تدخل: هي «قريباً» في منتقي الاكتشاف، وليست الوجهة التي وصل
/// إليها التطبيق — وهي في `regions_soon` أصلاً، فلا تصل هذه الدالة.
RegionStory? buildRegionStory({
  required List<Region> regions,
  int? selectedRegionId,
}) {
  final ready = regions
      .where((region) => region.isActive && region.eventsCount != null)
      .toList();
  if (ready.length < 2) return null;

  final origin = ready.first;
  final candidates = ready.where(
    (region) => region.id != origin.id && region.eventsCount! > 0,
  );

  Region? destination;
  if (selectedRegionId != null) {
    for (final region in candidates) {
      if (region.id == selectedRegionId) {
        destination = region;
        break;
      }
    }
  }
  destination ??= candidates.isEmpty ? null : candidates.first;
  if (destination == null) return null;

  return RegionStory(
    origin: origin,
    destination: destination,
    originEvents: origin.eventsCount!,
    destinationEvents: destination.eventsCount!,
  );
}

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
                    count: story.originEvents,
                    name: story.origin.name,
                    highlighted: false,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatTile(
                    key: const Key('region_story_destination_stat'),
                    count: story.destinationEvents,
                    name: story.destination.name,
                    highlighted: true,
                  ),
                ),
              ],
            ),
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

/// رقم محافظة واحدة: العدّ الكبير، ثم اسمها، ثم ما يعنيه الرقم.
class _StatTile extends StatelessWidget {
  const _StatTile({
    super.key,
    required this.count,
    required this.name,
    required this.highlighted,
  });

  final int count;
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
            'مناسبة في $name',
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
