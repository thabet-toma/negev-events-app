import 'prices.dart';

/// نماذج شريط الإحصائيات في الرئيسية (تذكرة #172) — شكل `GET /api/stats/ticker`:
/// `{ success, regions: [{ region_id, name, upcoming_count }], total, updated_at,
/// prices, latest_news }`.
///
/// الخادم وحده يحسب: عدد المناسبات القادمة **الظاهرة للعامة** في كل محافظة،
/// ومجموعها، ولحظة الحساب. لا جمع ولا تصفية في هذا الملف ولا في الشاشة، ولا
/// شرط «قادم» يُكرَّر هنا — الشريط يعرض ما وصل حرفاً.
///
/// و[StatsTicker.updatedAt] هو لحظة **تعبئة الكاش على الخادم** لا لحظة الردّ:
/// طلب داخل مدّة الكاش يعيد اللحظة نفسها، وهو ما يجعل «حُدّث HH:MM» صادقاً.
///
/// و[prices] هو **نفس شكل `GET /api/prices`** (`models/prices.dart`) — لا نموذج
/// أسعار ثانٍ في العميل؛ الخادم يحقنه في الشريط ويسقطه `null` وحده حين تفشل
/// خدمة الأسعار، فلا يسقط الشريط معه.
///
/// و[latestNews] و[prices] كلاهما **اختياري**: خادم أقدم لا يرسل المفتاح،
/// فيبقى `null` ويُحذف سطره من الشريط بدل أن يُخترع له نصّ.
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

/// آخر خبر في الشريط الإخباري — `latest_news: { id, title, published_at }`.
/// صفّ بلا عنوان أو بلا معرّف رقمي لا سطر له: الشريط نصّ لا نموذج خبر كامل
/// (التفاصيل في شاشة الأخبار).
class TickerNews {
  final int id;
  final String title;

  /// لحظة النشر كما وصلت (`published_at`) — لا تُعرض في الشريط، تُحفظ للاختبار
  /// ولبقية الأسطح التي تحتاج ترتيباً لاحقاً. `null` إن غابت أو لم تُقرأ.
  final DateTime? publishedAt;

  const TickerNews({
    required this.id,
    required this.title,
    this.publishedAt,
  });

  /// `null` حين يكون الصفّ غير صالح للعرض — لا سطر خبر فارغ في الشريط.
  static TickerNews? tryFromJson(Object? raw) {
    if (raw is! Map) return null;
    final json = Map<String, dynamic>.from(raw);
    final rawId = json['id'];
    final id = rawId is int ? rawId : int.tryParse('$rawId');
    final title = '${json['title'] ?? ''}'.trim();
    if (id == null || title.isEmpty) return null;
    return TickerNews(
      id: id,
      title: title,
      publishedAt: json['published_at'] is String
          ? DateTime.tryParse('${json['published_at']}')
          : null,
    );
  }
}

/// الشريط كاملاً. [updatedAt] `null` حين يغيب الحقل أو لا يُقرأ تاريخاً —
/// السطر يبقى بلا «حُدّث» بدل أن يُظهر وقتاً مخترعاً.
class StatsTicker {
  final List<StatsRegion> regions;
  final int total;
  final DateTime? updatedAt;

  /// أسعار الذهب والعملات بنموذج `/api/prices` نفسه — `null` حين لا تصل.
  final PricesSnapshot? prices;

  /// آخر خبر — `null` حين لا يصل.
  final TickerNews? latestNews;

  const StatsTicker({
    this.regions = const [],
    this.total = 0,
    this.updatedAt,
    this.prices,
    this.latestNews,
  });

  factory StatsTicker.fromJson(Map<String, dynamic> json) {
    final rawRegions = json['regions'];
    final rawTotal = json['total'];
    final rawUpdated = json['updated_at'];
    final rawPrices = json['prices'];
    return StatsTicker(
      regions: rawRegions is List
          ? rawRegions
              .whereType<Map>()
              .map((region) => StatsRegion.fromJson(Map<String, dynamic>.from(region)))
              .toList()
          : const [],
      total: rawTotal is int ? rawTotal : int.tryParse('$rawTotal') ?? 0,
      updatedAt: rawUpdated is String ? DateTime.tryParse(rawUpdated) : null,
      prices: rawPrices is Map
          ? PricesSnapshot.fromJson(Map<String, dynamic>.from(rawPrices))
          : null,
      latestNews: TickerNews.tryFromJson(json['latest_news']),
    );
  }
}
