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

/// بنود منتقي بلدة المناسبة (النشر والتعديل): بلدات الخادم، ثم بند لكل
/// محافظة باسمها («النقب — بلا بلدة محدّدة»). [keep] قيمة حالية يجب أن تبقى
/// بنداً حتى لو لم يعد الخادم يعرضها (بلدة عُطّلت بعد نشر المناسبة) — وإلا
/// سقط `DropdownButton` بتأكيد «لا بند بهذه القيمة».
List<PlaceOption> eventTownOptions(PlacesCatalog catalog, {String? keep}) {
  final options = <PlaceOption>[
    ...catalog.towns.map((town) => PlaceOption(town, town)),
    ...catalog.regions.map((region) => PlaceOption(region.name, '${region.name} — بلا بلدة محدّدة')),
  ];
  if (keep != null && keep.isNotEmpty && !options.any((o) => o.value == keep)) {
    options.add(PlaceOption(keep, keep));
  }
  return options;
}
