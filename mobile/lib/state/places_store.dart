import 'package:flutter/foundation.dart';

import '../api/negev_api.dart';

/// البلدات والمحافظات والقرى — مصدر واحد تشترك فيه كل الشاشات.
///
/// يبدأ بالنسخة الاحتياطية من `lib/config.dart` كي لا يبقى منتقٍ فارغاً،
/// ويستبدلها بردّ GET /api/towns عند وصوله. ردّ ناجح يُحفظ لبقية الجلسة؛
/// الفشل لا يُحفظ، فالشاشة التالية التي تطلب [load] تعيد المحاولة.
class PlacesStore extends ChangeNotifier {
  PlacesStore(this.api);

  final NegevApi api;

  PlacesCatalog _catalog = PlacesCatalog.fallback();
  Future<PlacesCatalog>? _pending;

  PlacesCatalog get catalog => _catalog;

  Future<PlacesCatalog> load() {
    if (_catalog.fromServer) return Future.value(_catalog);
    return _pending ??= api.placesCatalog().then((catalog) {
      _pending = null;
      _catalog = catalog;
      notifyListeners();
      return catalog;
    });
  }
}

/// بند واحد في منتقي بلدة المناسبة — القيمة تُرسَل كما هي، والتسمية تُعرض.
class PlaceOption {
  final String value;
  final String label;

  const PlaceOption(this.value, this.label);
}

/// بند «القرى والتجمعات» الجامع — نفس النصّ الحرفي في `VILLAGES_TOWN` على
/// الخادم وفي `kVillagesTown` في شاشتَي النشر والتعديل.
///
/// مكرَّر هنا عمداً: طبقة الحالة لا تستورد شاشة (`lib/screens/`) ولو لثابت
/// واحد، والقراءات العامة لا تعلّم البند بعلَم — `locked` في قراءة اللوحة وحدها.
const _villagesTown = 'القرى والتجمعات';

/// بنود منتقي بلدة المناسبة (النشر والتعديل).
///
/// **العزل بالمحافظة:** حين تكون [regionId] محافظةً **نشطة** في
/// [PlacesCatalog.activeRegions] تُعرض بلداتها وحدها بترتيب الخادم، ثم اسمها
/// نفسه («النقب — بلا بلدة محدّدة») مكاناً لمن لم تُعرف بلدتها بالضبط. فلا
/// يرى ابن النقب بلدات المثلث، ولا ابن المثلث بلدات النقب — وهو معنى المحافظة
/// أصلاً. والمحافظة الموقوفة ليست مكان نشر (تذكرة #127)، وهي في
/// `regions_soon` لا في `regions`، فلا تُطابق هنا أصلاً.
///
/// **والبند الجامع (`_villagesTown`) يبقى في كل محافظة:** قرى المنصّة كلها
/// — النقب وطولكرم وغيرهما — مسجَّلة تحت هذا البند الواحد، فإخفاؤه عن محافظة
/// لا يعطّل قُراها وحدها بل يمنع نشرها إطلاقاً. وهو ليس مكاناً: صفّه في
/// `towns` يحمل محافظةً **للعرض فقط** (`resolveRegionForEventPlace`)، والنشر
/// يرسل `region_id` من منتقي المحافظة في النموذج. لذلك يُلحق آخر بلدة، قبل
/// بند اسم المحافظة مباشرة، لمن لا يسرده في `towns` أصلاً — والنقب يسرده
/// اليوم، فلا يُكرَّر فيها أبداً.
///
/// **ولماذا الاحتياط؟** حين لا تُطابق [regionId] محافظةً نشطة — `null`، أو
/// معرّف محافظة عُطّلت بعد حفظها، أو كتالوج `lib/config.dart` الاحتياطي
/// بانقطاع الشبكة (بلا محافظات إطلاقاً) — تعود القائمة الشاملة: كل بلدات
/// الخادم ثم بند لكل محافظة نشطة. به يبقى النشر ممكناً بلا اتصال، ولا يُترك
/// المستخدم بمنتقٍ فارغ ولا نموذج لا يُرسَل.
///
/// [keep] قيمة حالية يجب أن تبقى بنداً حتى لو لم يعد الخادم يعرضها (بلدة
/// عُطّلت بعد نشر المناسبة، أو مناسبة من محافظة أخرى تُعدَّل) — وإلا سقط
/// `DropdownButton` بتأكيد «لا بند بهذه القيمة».
List<PlaceOption> eventTownOptions(
  PlacesCatalog catalog, {
  int? regionId,
  String? keep,
}) {
  final regions = catalog.activeRegions;
  final region = _activeRegionById(regions, regionId);
  // بلا محافظة مطابقة: بلدات الخادم كلها وبند لكل محافظة نشطة (السلوك القديم
  // تماماً) — وهو ما يُبقي المنتقي صالحاً بلا اتصال.
  final towns = region == null ? catalog.towns : region.towns;
  final options = <PlaceOption>[
    ...towns.map((town) => PlaceOption(town, town)),
    // البند الجامع: آخر بلدة، وقبل بند اسم المحافظة مباشرة — ولا يُكرَّر حين
    // تسرده المحافظة نفسها (النقب اليوم). كتالوج لا يعرفه أصلاً (احتياطي أو
    // خادم بلا الصفّ) لا يُخترع فيه بند من العدم.
    if (region != null &&
        catalog.towns.contains(_villagesTown) &&
        !towns.contains(_villagesTown))
      const PlaceOption(_villagesTown, _villagesTown),
    if (region == null)
      ...regions.map((item) => PlaceOption(item.name, '${item.name} — بلا بلدة محدّدة'))
    else
      PlaceOption(region.name, '${region.name} — بلا بلدة محدّدة'),
  ];
  if (keep != null && keep.isNotEmpty && !options.any((o) => o.value == keep)) {
    options.add(PlaceOption(keep, keep));
  }
  return options;
}

/// المحافظة النشطة ذات المعرّف [id] — `null` لكل ما ليس معرّفاً، أو معرّف
/// لمحافظة لم تعد نشطة في الكتالوج الحالي.
Region? _activeRegionById(List<Region> regions, int? id) {
  if (id == null) return null;
  for (final region in regions) {
    if (region.id == id) return region;
  }
  return null;
}
