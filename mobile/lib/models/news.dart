/// نماذج أخبار منصة كترا الإخبارية — شكل `GET /api/news` و `GET /api/news/:id`.
///
/// المحافظة لا تُرسَل في أيّ حقل هنا: الخادم يشتقّها من ترويسة `X-Region` التي
/// يرفقها `ApiClient` مع كل نداء، ويعيدها في [NewsFeed.regionName] كما قرأها.
///
/// لا صياغة عرض في هذا الملف — الوقت النسبي والتاريخ في الشاشة وحدها.
class NewsCategory {
  final int? id;
  final String name;

  const NewsCategory({this.id, required this.name});

  factory NewsCategory.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    return NewsCategory(
      id: rawId is int ? rawId : int.tryParse('$rawId'),
      name: '${json['name'] ?? ''}',
    );
  }
}

bool _flag(dynamic value) =>
    value == true || value == 1 || value == '1' || value == 'true';

String? _optionalText(dynamic value) {
  if (value is! String || value.trim().isEmpty) return null;
  return value;
}

/// خبر واحد. [authorName] و[bodyText] لا يصلان إلا من `GET /api/news/:id`،
/// و[excerpt] من القائمة يُستعمل بديلاً صريحاً إن غاب النصّ الكامل.
class NewsItem {
  final int id;
  final String title;
  final String excerpt;
  final String? image;
  final String? url;
  final DateTime? publishedAt;
  final bool isBreaking;
  final NewsCategory? category;
  final String? authorName;
  final String? bodyText;

  const NewsItem({
    required this.id,
    required this.title,
    required this.excerpt,
    this.image,
    this.url,
    this.publishedAt,
    this.isBreaking = false,
    this.category,
    this.authorName,
    this.bodyText,
  });

  factory NewsItem.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    final rawPublished = json['published_at'];
    final rawCategory = json['category'];
    return NewsItem(
      id: rawId is int ? rawId : int.tryParse('$rawId') ?? 0,
      title: '${json['title'] ?? ''}',
      excerpt: '${json['excerpt'] ?? ''}',
      image: _optionalText(json['image']),
      url: _optionalText(json['url']),
      publishedAt:
          rawPublished is String ? DateTime.tryParse(rawPublished) : null,
      isBreaking: _flag(json['is_breaking']),
      category: rawCategory is Map
          ? NewsCategory.fromJson(Map<String, dynamic>.from(rawCategory))
          : null,
      authorName: _optionalText(json['author_name']),
      bodyText: _optionalText(json['body_text']),
    );
  }
}

/// صفحة أخبار المحافظة — `{ success, region_id, region_name, area, general,
/// items, has_more }`. [general] يعني «أخبار محلية عامة» لا أخبار المحافظة.
class NewsFeed {
  final int? regionId;
  final String regionName;
  final String area;
  final bool general;
  final List<NewsItem> items;
  final bool hasMore;

  const NewsFeed({
    this.regionId,
    this.regionName = '',
    this.area = '',
    this.general = false,
    this.items = const [],
    this.hasMore = false,
  });

  factory NewsFeed.fromJson(Map<String, dynamic> json) {
    final rawId = json['region_id'];
    final rawItems = json['items'];
    return NewsFeed(
      regionId: rawId is int ? rawId : int.tryParse('$rawId'),
      regionName: '${json['region_name'] ?? ''}',
      area: '${json['area'] ?? ''}',
      general: _flag(json['general']),
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map((item) => NewsItem.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      hasMore: _flag(json['has_more']),
    );
  }
}
