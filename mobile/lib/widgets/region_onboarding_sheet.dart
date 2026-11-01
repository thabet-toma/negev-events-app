import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/negev_api.dart';
import '../main.dart';
import '../state/region_onboarding.dart';
import '../theme.dart';
import 'async_view.dart';

/// نتيجة الورقة: المحافظة التي اختارها المستخدم (أو استنبطها من موقعه).
///
/// [warning] رسالة قصيرة بديلة عن «منطقتك: …» حين ينجح الحفظ على الجهاز ويفشل
/// على الحساب — المخزن يحفظ محلياً أولاً (`RegionStore.select`)، فلا يصحّ
/// إخفاء النجاح ولا إعلانه كاملاً.
typedef RegionOnboardingChoice = ({
  int regionId,
  String name,
  String? warning,
});

/// ورقة أول تشغيل — «من أي منطقة أنت؟» (تذكرة #126).
///
/// تُعرض مرّة واحدة لكل تثبيت، **ولا تحجب أي شاشة**: ورقةٌ سفلية والتغذية
/// ظاهرة تحتها، وتُغلق بالنقر خارجها أو بسحبها أو بزرّ رجوع الجهاز كما تُغلق
/// كل ورقة — والإغلاق العابر **بمثابة تخطٍّ**: يُسجَّل الإنجاز ولا يتغيّر
/// الاختيار. و«تخطّي» ظاهر دائماً من يريد الخروج صراحةً أو يبقى في مكانه.
///
/// لا إذن موقع عند الإقلاع: `Geolocator` لا يُسأل شيئاً حتى يُضغط «استخدم
/// موقعي»، وكل رفضٍ أو تعطّلٍ أو فشلٍ تحديد ينقل إلى الاختيار اليدوي داخل
/// الورقة نفسها برسالة قصيرة — لا شاشة خطأ ولا إغلاق.
///
/// الإنجاز يُسجَّل هنا بعد أي خروج (اختيار، تخطٍّ، إغلاق عابر)، لا في كل زرّ
/// على حدة — فلا مسار خروج ينساه أحد.
Future<RegionOnboardingChoice?> showRegionOnboardingSheet(
  BuildContext context, {
  LocationLookup? location,
}) async {
  final choice = await showModalBottomSheet<RegionOnboardingChoice>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => _RegionOnboardingSheet(
      location: location ?? const GeolocatorLocationLookup(),
    ),
  );

  await markRegionOnboarded();

  if (choice != null && context.mounted) {
    showMessage(
      context,
      choice.warning ?? 'منطقتك: ${choice.name}',
      isError: choice.warning != null,
    );
  }
  return choice;
}

/// خطوة واحدة في الورقة — كلها في ورقة واحدة كي لا تُغلق وتُفتح في منتصف
/// الطريق حين يفشل الموقع.
enum _Step { intro, regions, towns }

class _RegionOnboardingSheet extends StatefulWidget {
  const _RegionOnboardingSheet({required this.location});

  final LocationLookup location;

  @override
  State<_RegionOnboardingSheet> createState() => _RegionOnboardingSheetState();
}

class _RegionOnboardingSheetState extends State<_RegionOnboardingSheet> {
  _Step _step = _Step.intro;

  /// المحافظة المختارة يدوياً — خطوة البلدات بعدها تأكيدٌ لها لا بديل عنها.
  Region? _region;

  /// سطر قصير يشرح لماذا انتهى «استخدم موقعي» إلى الاختيار اليدوي.
  String? _notice;

  /// نداء الموقع جارٍ — الأزرار معطّلة كي لا يتضاعف الطلب.
  bool _busy = false;

  /// حفظٌ جارٍ — حارسٌ واحد يغطّي **كل** طرق `_commit` (الموقع، والبلدة، وزرّ
  /// الحفظ، والمحافظة بلا بلدات). يُضبط **قبل** أول `await`، لأن تعطيل الأزرار
  /// في الشجرة لا يلحق نقرتين متلاصقتين: الودجة القديمة تحمل `onPressed` غير
  /// معدوم حتى يُعاد البناء، فتصل النقرة الثانية إلى `Navigator.pop` ثانيةٍ
  /// تُسقط الشاشة تحتها.
  bool _committing = false;

  /// لا نقرة تُقبل ما دام هناك عملٌ جارٍ — للعرض وحده؛ الحقيقة في الحارسَين.
  bool get _locked => _busy || _committing;

  bool _placesRequested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_placesRequested) return;
    _placesRequested = true;
    // الفشل لا يرمي: المخزن يعيد كتالوجاً احتياطياً، والخطوة اليدوية تعرض
    // «تعذّر جلب المحافظات» مع إعادة محاولة.
    AppServices.of(context).places.load();
  }

  /// الانتقال إلى الاختيار اليدوي بسبب — لا شاشة خطأ، ولا خروج من الورقة.
  void _fallback(String notice) {
    if (!mounted) return;
    setState(() {
      _notice = notice;
      _step = _Step.regions;
    });
  }

  /// إذن الموقع يُطلب **من هنا وحدها** — بضغطة صريحة على «استخدم موقعي».
  Future<void> _useLocation() async {
    if (_locked) return;
    setState(() {
      _busy = true;
      _notice = null;
    });
    try {
      if (!await widget.location.isServiceEnabled()) {
        _fallback('خدمة الموقع مطفأة على جهازك — اختر منطقتك يدوياً.');
        return;
      }

      var access = await widget.location.checkPermission();
      if (access == LocationAccess.denied) {
        access = await widget.location.requestPermission();
      }
      if (access != LocationAccess.granted) {
        _fallback(
          access == LocationAccess.deniedForever
              ? 'إذن الموقع مرفوض نهائياً — اختر منطقتك يدوياً.'
              : 'لم يُسمح بالموقع — اختر منطقتك يدوياً.',
        );
        return;
      }

      final fix = await widget.location.currentPosition();
      if (fix == null) {
        _fallback('تعذّر تحديد موقعك — اختر منطقتك يدوياً.');
        return;
      }

      if (!mounted) return;
      final catalog = AppServices.of(context).places.catalog;
      final region = nearestRegionFor(fix.latitude, fix.longitude, catalog);
      if (region == null) {
        // فرقٌ بين عطلِ جلبٍ وموقعٍ بعيد: كلاهما ينتهي إلى الاختيار اليدوي،
        // والرسالة تقول السبب بدل تعليقٍ عام.
        _fallback(
          catalog.activeRegions.isEmpty
              ? 'تعذّر جلب المناطق — اختر منطقتك يدوياً.'
              : 'موقعك بعيد عن المناطق المعروفة — اختر منطقتك يدوياً.',
        );
        return;
      }
      await _commit(region);
    } catch (_) {
      // أي فشلٍ غير متوقّع من مزوّد الموقع ينتهي إلى البديل نفسه.
      _fallback('تعذّر تحديد موقعك — اختر منطقتك يدوياً.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// حفظ المحافظة ثم إغلاق الورقة بنتيجتها — الجهاز أولاً في `RegionStore`،
  /// وفشل الحساب لا يتراجع عن الحفظ المحلي.
  ///
  /// الحارس [_committing] هنا لا في الأزرار وحدها: البلدة وزرّ الحفظ متلاصقان،
  /// ونقرتان قبل انتهاء `await` تصلان إلى `Navigator.pop` مرتين فتُسقط
  /// `HomeShell` تحت الورقة. ومن هنا يمرّ كل مسار حفظ، ومنه [_openTowns] حين
  /// تكون المحافظة بلا بلدات.
  Future<void> _commit(Region region) async {
    if (_committing) return;
    setState(() => _committing = true);

    final regions = AppServices.of(context).regions;
    try {
      await regions.select(region.id);
      _close(region);
    } on ApiException {
      // الجهاز حُفظ والترويسة سارية — الرسالة عن الحساب وحده.
      _close(
        region,
        warning: 'حُفظت منطقتك على جهازك، لكن تعذّر حفظها على حسابك',
      );
    } catch (_) {
      // فشلٌ غير متوقّع بعد الحفظ المحلي: لا وعد بنجاح ولا ابتلاع للورقة —
      // تعود الأزرار ورسالة قصيرة، والاختيار اليدوي ما زال أمام المستخدم.
      if (!mounted) return;
      setState(() {
        _committing = false;
        _notice = 'تعذّر حفظ منطقتك — حاول مرة أخرى.';
      });
    }
  }

  /// إغلاق الورقة بنتيجتها — من موضع واحد كي لا يختلف مسار عن آخر.
  ///
  /// ولا يُغلق إلا إن كانت الورقة لا تزال على الشاشة: من أغلقها بالنقر خارجها
  /// أثناء الحفظ يبقى إغلاقه هو الإغلاق الوحيد، ولا `pop` ثانٍ يسقط الشاشة
  /// تحتها بعد انتهاء `await`.
  void _close(Region region, {String? warning}) {
    if (!mounted) return;
    // حزامٌ ثانٍ: لو أغلقها المستخدم بنفسه بينما الحفظ جارٍ، فلا `pop` باسم
    // الحفظ بعد إغلاقه.
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) return;
    Navigator.of(context).pop((
      regionId: region.id,
      name: region.name,
      warning: warning,
    ));
  }

  void _openRegions() {
    if (_locked) return;
    setState(() {
      _step = _Step.regions;
      _region = null;
    });
  }

  Future<void> _openTowns(Region region) async {
    if (_locked) return;
    // محافظة بلا بلدات في الكتالوج تُحفظ مباشرة — لا خطوة تأكيد فارغة.
    if (region.towns.isEmpty) {
      await _commit(region);
      return;
    }
    setState(() {
      _region = region;
      _step = _Step.towns;
    });
  }

  void _back() {
    setState(() {
      if (_step == _Step.towns) {
        _region = null;
        _step = _Step.regions;
      } else {
        _step = _Step.intro;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // بلا `PopScope`: زرّ رجوع الجهاز يُغلقها كما يُغلق أي ورقة، والإغلاق
    // العابر تخطٍّ يُسجَّل في `showRegionOnboardingSheet` بعد عودتها.
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.78,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_step == _Step.intro) ..._intro(context) else ..._picker(context),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _intro(BuildContext context) {
    return [
      Row(
        children: [
          Icon(Icons.travel_explore, color: context.c.sky),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'من أي منطقة أنت؟',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 10),
      Text(
        'بدأ التطبيق بمنطقة واحدة، ووصل إلى مناطق أخرى. اختر منطقتك لترى '
        'مناسباتها وخدماتها.',
        style: TextStyle(color: context.c.inkSoft, fontSize: 13.5, height: 1.6),
      ),
      if (_notice != null) ...[
        const SizedBox(height: 10),
        _noticeLine(context, _notice!),
      ],
      const SizedBox(height: 18),
      FilledButton.icon(
        key: const Key('region_onboarding_use_location'),
        onPressed: _locked ? null : _useLocation,
        icon: _busy
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.my_location, size: 18),
        label: const Text('استخدم موقعي'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        key: const Key('region_onboarding_manual'),
        onPressed: _locked ? null : _openRegions,
        icon: const Icon(Icons.list_alt, size: 18),
        label: const Text('اختيار يدوي'),
      ),
      TextButton(
        key: const Key('region_onboarding_skip'),
        onPressed: _locked ? null : () => Navigator.of(context).pop(),
        child: const Text('تخطّي'),
      ),
    ];
  }

  List<Widget> _picker(BuildContext context) {
    final services = AppServices.of(context);
    final townsStep = _step == _Step.towns && _region != null;

    return [
      Row(
        children: [
          IconButton(
            key: const Key('region_onboarding_back'),
            onPressed: _locked ? null : _back,
            icon: const Icon(Icons.arrow_back),
            tooltip: 'رجوع',
          ),
          Expanded(
            child: Text(
              townsStep
                  ? 'بلدتك في «${_region!.name}» (اختياري)'
                  : 'اختر محافظتك',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
          ),
        ],
      ),
      if (_notice != null) ...[
        const SizedBox(height: 6),
        _noticeLine(context, _notice!),
      ],
      const SizedBox(height: 10),
      Flexible(
        child: ListenableBuilder(
          listenable: Listenable.merge([services.places, services.regions]),
          builder: (context, _) {
            // محافظات هذه الورقة **النشطة** وحدها (#127): ورقة الاختيار ليست
            // منتقي الاكتشاف، واختيار محافظة موقوفة يُردّ إلى الافتراضية.
            final active = services.regions.activeRegions;
            if (townsStep) {
              final region = active.firstWhere(
                (r) => r.id == _region!.id,
                orElse: () => _region!,
              );
              return _townList(context, region);
            }
            return _regionList(context, active);
          },
        ),
      ),
    ];
  }

  Widget _noticeLine(BuildContext context, String notice) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: context.c.warnWash,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        notice,
        style: TextStyle(color: context.c.ink, fontSize: 12.5, height: 1.5),
      ),
    );
  }

  Widget _regionList(BuildContext context, List<Region> regions) {
    if (regions.isEmpty) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'تعذّر جلب المحافظات — تحقّق من اتصالك ثم أعد المحاولة.',
            style: TextStyle(color: context.c.inkSoft, fontSize: 12.5, height: 1.5),
          ),
          const SizedBox(height: 6),
          TextButton.icon(
            key: const Key('region_onboarding_retry'),
            onPressed: () => AppServices.of(context).places.load(),
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('إعادة المحاولة'),
          ),
        ],
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      itemCount: regions.length,
      itemBuilder: (context, index) {
        final region = regions[index];
        return ListTile(
          key: Key('region_onboarding_region_${region.id}'),
          contentPadding: EdgeInsets.zero,
          title: Text(region.name, style: TextStyle(color: context.c.ink)),
          trailing: const Icon(Icons.chevron_left, size: 20),
          onTap: _locked ? null : () => _openTowns(region),
        );
      },
    );
  }

  Widget _townList(BuildContext context, Region region) {
    return ListView(
      shrinkWrap: true,
      children: [
        for (var index = 0; index < region.towns.length; index++)
          ListTile(
            key: Key('region_onboarding_town_$index'),
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(
              region.towns[index],
              style: TextStyle(color: context.c.ink),
            ),
            onTap: _locked ? null : () => _commit(region),
          ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: FilledButton(
            key: const Key('region_onboarding_save'),
            onPressed: _locked ? null : () => _commit(region),
            child: Text('حفظ «${region.name}»'),
          ),
        ),
      ],
    );
  }
}
