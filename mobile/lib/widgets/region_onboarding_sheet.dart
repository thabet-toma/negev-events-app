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
/// تُعرض مرّة واحدة لكل تثبيت، **بلا حجب الشاشة**: الورقة سفلية والمستخدم يرى
/// التغذية تحتها، و«تخطّي» ظاهر دائماً فلا يُحتجَز في ورقة. ولا تُغلق بنقرة
/// خارجها ولا بسحبها (النقر على الخارج يُلغي ورداً في منتصفه)؛ مخرجها زرّ.
///
/// لا إذن موقع عند الإقلاع: `Geolocator` لا يُسأل شيئاً حتى يُضغط «استخدم
/// موقعي»، وكل رفضٍ أو تعطّلٍ أو فشلٍ تحديد ينقل إلى الاختيار اليدوي داخل
/// الورقة نفسها برسالة قصيرة — لا شاشة خطأ ولا إغلاق.
///
/// الإنجاز يُسجَّل هنا بعد أي خروج (اختيار أو تخطٍّ)، لا في كل زرّ على حدة.
Future<RegionOnboardingChoice?> showRegionOnboardingSheet(
  BuildContext context, {
  LocationLookup? location,
}) async {
  final choice = await showModalBottomSheet<RegionOnboardingChoice>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
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
      final region = nearestRegionFor(
        fix.latitude,
        fix.longitude,
        AppServices.of(context).places.catalog,
      );
      if (region == null) {
        _fallback('تعذّر جلب المناطق — اختر منطقتك يدوياً.');
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
  Future<void> _commit(Region region) async {
    final regions = AppServices.of(context).regions;
    try {
      await regions.select(region.id);
      if (!mounted) return;
      Navigator.of(context).pop((
        regionId: region.id,
        name: region.name,
        warning: null,
      ));
    } on ApiException {
      if (!mounted) return;
      Navigator.of(context).pop((
        regionId: region.id,
        name: region.name,
        warning: 'حُفظت منطقتك على جهازك، لكن تعذّر حفظها على حسابك',
      ));
    }
  }

  void _openRegions() {
    setState(() {
      _step = _Step.regions;
      _region = null;
    });
  }

  void _openTowns(Region region) {
    // محافظة بلا بلدات في الكتالوج تُحفظ مباشرة — لا خطوة تأكيد فارغة.
    if (region.towns.isEmpty) {
      _commit(region);
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
    return PopScope(
      // زرّ رجوع الجهاز لا يُغلقها: المخرج زرّ «تخطّي» الظاهر، فالإنجاز
      // يُسجَّل فعلاً حين يخرج المستخدم.
      canPop: false,
      child: SafeArea(
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
        'بدأ التطبيق بأهل النقب، ووصل إلى مناطق أخرى. اختر منطقتك لترى '
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
        onPressed: _busy ? null : _useLocation,
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
        onPressed: _busy ? null : _openRegions,
        icon: const Icon(Icons.list_alt, size: 18),
        label: const Text('اختيار يدوي'),
      ),
      TextButton(
        key: const Key('region_onboarding_skip'),
        onPressed: _busy ? null : () => Navigator.of(context).pop(),
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
            onPressed: _busy ? null : _back,
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
            if (townsStep) {
              final region = services.regions.regions.firstWhere(
                (r) => r.id == _region!.id,
                orElse: () => _region!,
              );
              return _townList(context, region);
            }
            return _regionList(context, services.regions.regions);
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
          onTap: _busy ? null : () => _openTowns(region),
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
            onTap: _busy ? null : () => _commit(region),
          ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: FilledButton(
            key: const Key('region_onboarding_save'),
            onPressed: _busy ? null : () => _commit(region),
            child: Text('حفظ «${region.name}»'),
          ),
        ),
      ],
    );
  }
}
