/// نماذج شريط الإحصائيات في الرئيسية (تذكرة #172) — شكل `GET /api/stats/ticker`:
/// `{ success, regions: [{ region_id, name, upcoming_count }], total, updated_at }`.
///
/// الخادم وحده يحسب: عدد المناسبات القادمة **الظاهرة للعامة** في كل محافظة،
/// ومجموعها، ولحظة الحساب. لا جمع ولا تصفية في هذا الملف ولا في الشاشة، ولا
/// شرط «قادم» يُكرَّر هنا — الشريط يعرض ما وصل حرفاً.
///
/// و[StatsTicker.updatedAt] هو لحظة **تعبئة الكاش على الخادم** لا لحظة الردّ:
/// طلب داخل مدّة الكاش يعيد اللحظة نفسها، وهو ما يجعل «حُدّث HH:MM» صادقاً.
class StatsRegion {
  final int regionId;
  final String name;
  final int upcomingCount;

  const StatsRegion({
    required this.regionId,
    required this.name,
    required this.upcomingCount,
  });

  factory StatsRegion.fromJson(Map<String, dynamic> json) {
    final rawId = json['region_id'];
    final rawCount = json['upcoming_count'];
    return StatsRegion(
      regionId: rawId is int ? rawId : int.tryParse('$rawId') ?? 0,
      name: '${json['name'] ?? ''}',
      upcomingCount: rawCount is int ? rawCount : int.tryParse('$rawCount') ?? 0,
    );
  }
}

/// الشريط كاملاً. [updatedAt] `null` حين يغيب الحقل أو لا يُقرأ تاريخاً —
/// السطر يبقى بلا «حُدّث» بدل أن يُظهر وقتاً مخترعاً.
class StatsTicker {
  final List<StatsRegion> regions;
  final int total;
  final DateTime? updatedAt;

  const StatsTicker({
    this.regions = const [],
    this.total = 0,
    this.updatedAt,
  });

  factory StatsTicker.fromJson(Map<String, dynamic> json) {
    final rawRegions = json['regions'];
    final rawTotal = json['total'];
    final rawUpdated = json['updated_at'];
    return StatsTicker(
      regions: rawRegions is List
          ? rawRegions
              .whereType<Map>()
              .map((region) => StatsRegion.fromJson(Map<String, dynamic>.from(region)))
              .toList()
          : const [],
      total: rawTotal is int ? rawTotal : int.tryParse('$rawTotal') ?? 0,
      updatedAt: rawUpdated is String ? DateTime.tryParse(rawUpdated) : null,
    );
  }
}
