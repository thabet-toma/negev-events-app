import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/negev_api.dart';

/// مفتاح «سُئل عن منطقته» — معرّف الورقة مرة واحدة لكل تثبيت (تذكرة #126).
///
/// يُكتب عند **أي** خروج من الورقة: اختيار محافظة، أو تخطٍّ. فحين يغلقها
/// المستخدم للتخطّي لا تعود في الإقلاع التالي، ولا يبقى لها مدخل في التطبيق
/// إلا من «حسابي» (زرّ إعادة الفتح في قسم «المنطقة»).
const String regionOnboardedKey = 'negev_region_onboarded';

/// هل سُئل المستخدم عن منطقته سابقاً؟ تعذّر قراءة التخزين = «لم يُسأل» كي
/// تظهر الورقة، لكن كتابتها محصَّنة كما في [RegionStore] فتفشل بهدوء.
Future<bool> isRegionOnboarded() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(regionOnboardedKey) ?? false;
  } catch (_) {
    return false;
  }
}

/// يسجّل الإنجاز عند أي خروج من الورقة — فشل التخزين لا يكسر شيئاً في هذه
/// الجلسة، والورقة قد تعود في إقلاع لاحق لا أكثر.
Future<void> markRegionOnboarded() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(regionOnboardedKey, true);
  } catch (_) {
    // تخزين معطّل — لا شيء لفعله هنا.
  }
}

/// مسافة دائرة عظمى بالكيلومترات — تُستعمل لمقارنة قربٍ لا لقياس دقيق، فالأرض
/// كرة في هذه الحسبة (خطأ أقل من نسبة في المدى المحلّي).
///
/// `latlong2` لا يوفّرها في الكتالوج، والمشروع لا يحمل دالة مسافة سابقة —
/// فنسخة واحدة صغيرة موثّقة هنا خير من تكرار الحساب في كل من يطلبه.
double haversineDistanceKm(
  double latitude1,
  double longitude1,
  double latitude2,
  double longitude2,
) {
  const earthKm = 6371.0;
  double radians(double degrees) => degrees * math.pi / 180;

  final dLat = radians(latitude2 - latitude1);
  final dLng = radians(longitude2 - longitude1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(radians(latitude1)) *
          math.cos(radians(latitude2)) *
          math.sin(dLng / 2) *
          math.sin(dLng / 2);
  return 2 * earthKm * math.asin(math.min(1, math.sqrt(a)));
}

/// المحافظة التي يقع فيها أقرب مكانٍ معروف إلى [latitude]/[longitude].
///
/// **أقرب بلدة أولاً:** المحافظة تُشتقّ من بلدةٍ لها مركز في الكتالوج
/// (`town_coordinates` في `GET /api/towns`) — لا من مركز المحافظة، فمركز
/// «النقب» ليس موقع أحد. ولا تُخترع إحداثيات لبلدةٍ بلا مركز: البلدات التي
/// لا مدخل لها في [PlacesCatalog.townCoordinates] تُتجاهَل.
///
/// وإن لم يحمل الكتالوج أي مركز بلدة (قائمة احتياطية، أو خادم قديم، أو
/// محافظات بلا بلدات) رجعنا إلى مركز المحافظة نفسها — أقرب منطقة معروفة، وهو
/// أدقّ ما يبقى بلا اختراع نقطة.
///
/// `null` حين لا محافظات إطلاقاً — قبل وصول `GET /api/towns` أي.
Region? nearestRegionFor(
  double latitude,
  double longitude,
  PlacesCatalog catalog,
) {
  final regions = catalog.regions;
  if (regions.isEmpty) return null;

  Region? nearest;
  var nearestKm = double.infinity;

  for (final region in regions) {
    for (final town in region.towns) {
      final center = catalog.townCoordinates[town];
      if (center == null) continue;
      final km = haversineDistanceKm(latitude, longitude, center.lat, center.lng);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = region;
      }
    }
  }
  if (nearest != null) return nearest;

  for (final region in regions) {
    // محافظة بلا مركز (صفر/صفر = «لا إحداثيات» كما يقرؤها `Region.fromJson`)
    // لا تصلح مرشَّحاً، وإلا فازت كل نقطةٍ في العالم بخليج غينيا.
    if (region.latitude == 0 && region.longitude == 0) continue;
    final km = haversineDistanceKm(
      latitude,
      longitude,
      region.latitude,
      region.longitude,
    );
    if (km < nearestKm) {
      nearestKm = km;
      nearest = region;
    }
  }
  return nearest;
}

/// نتيجة قراءة إذن الموقع — أربع حالات لا أكثر، مستقلّة عن `Geolocator` كي
/// تُحقن [LocationLookup] في الاختبارات بلا موقع حقيقي ولا إذن حقيقي.
enum LocationAccess {
  /// مسموح (أثناء الاستعمال أو دائماً — كلاهما يكفي لقراءة واحدة).
  granted,

  /// رُفض الآن؛ قد يُسأل مرة أخرى.
  denied,

  /// رُفض نهائياً أو بحظر من الإعدادات — لا يُسأل مرة أخرى.
  deniedForever,

  /// حالة غير معروفة من النظام.
  unknown,
}

/// موضع الجهاز — بلا أي معرّف آخر ولا حفظ له على الخادم.
typedef UserPosition = ({double latitude, double longitude});

/// واجهة الموقع التي تعتمد عليها الورقة — **الشيء الوحيد** الذي يعرف
/// `Geolocator` مكانه، فيُحقَن بديلٌ في الاختبارات.
///
/// [currentPosition] يعيد `null` عند الفشل أو المهلة بدل أن يرمي: كل مسارات
/// الفشل هنا تنتهي إلى الشيء نفسه — الاختيار اليدوي.
///
/// ولا يُسأل إذنٌ إلا من داخل [checkPermission]/[requestPermission]، واللذين
/// لا يُستدعيان إلا بضغط صريح على «استخدم موقعي» (تذكرة #126).
abstract class LocationLookup {
  Future<bool> isServiceEnabled();

  Future<LocationAccess> checkPermission();

  Future<LocationAccess> requestPermission();

  Future<UserPosition?> currentPosition();
}

/// التنفيذ الحقيقي فوق `geolocator` — نفس ما يفعله منتقي موقع القاعة
/// (`location_picker_map.dart`)، بدقّة أخفّ ومهلة أقصر: المطلوب أقرب بلدة لا
/// موقع قاعة.
class GeolocatorLocationLookup implements LocationLookup {
  const GeolocatorLocationLookup({this.timeout = const Duration(seconds: 8)});

  /// أقصر من مهلة الخريطة (١٥ ثانية): الاختيار اليدوي بديل جاهز، فلا معنى
  /// لانتظار طويل خلف ورقة.
  final Duration timeout;

  @override
  Future<bool> isServiceEnabled() => Geolocator.isLocationServiceEnabled();

  @override
  Future<LocationAccess> checkPermission() async =>
      _access(await Geolocator.checkPermission());

  @override
  Future<LocationAccess> requestPermission() async =>
      _access(await Geolocator.requestPermission());

  @override
  Future<UserPosition?> currentPosition() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: timeout,
        ),
      );
      return (latitude: position.latitude, longitude: position.longitude);
    } catch (_) {
      // مهلة، أو مزوّد موقعٍ سقط، أو خدمة أُطفئت في الأثناء — البديل اليدوي.
      return null;
    }
  }

  static LocationAccess _access(LocationPermission permission) {
    if (permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse) {
      return LocationAccess.granted;
    }
    if (permission == LocationPermission.denied) return LocationAccess.denied;
    if (permission == LocationPermission.deniedForever) {
      return LocationAccess.deniedForever;
    }
    return LocationAccess.unknown;
  }
}
