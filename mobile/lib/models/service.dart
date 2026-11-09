/// دليل الخدمات — فئات ومزوّدون، من `server/src/routes/services.routes.js`.
///
/// المزوّد في القائمة العامة **بلا هاتف عمداً** (الخادم لا يرسله في هذه النقطة
/// إطلاقاً — قرار خادم، لا حذف عرضي)؛ الهاتف يصل فقط ضمن [ServiceProviderDetail]
/// من `GET /api/services/providers/:id`.
library;

int _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}

String? _nullableString(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}

/// متوسط تقييم قد يصل نصّاً من DECIMAL في MySQL — والغياب `null` لا صفراً،
/// كي يفرّق العميل بين «لا تقييمات» و«تقييم صفري» (وهذا لا وجود له).
double? _nullableDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('${value ?? ''}');
}

/// توزيع النجوم `{1: n, …, 5: n}` — مفاتيح JSON نصّية، والعميل يقرؤها أرقاماً
/// وبكل النجوم الخمسة حاضرة ولو بصفر.
Map<int, int> _parseRatingDistribution(dynamic raw) {
  final distribution = <int, int>{for (var star = 1; star <= 5; star += 1) star: 0};
  if (raw is Map) {
    for (var star = 1; star <= 5; star += 1) {
      distribution[star] = _toInt(raw['$star']);
    }
  }
  return distribution;
}

/// فئة خدمة — من GET /api/services/categories، بيانات وقت تشغيل لا قائمة ثابتة.
class ServiceCategory {
  final int id;
  final String name;
  final String icon;
  final String color;
  final int position;
  final List<dynamic> attributes;

  const ServiceCategory({
    required this.id,
    required this.name,
    required this.icon,
    required this.color,
    required this.position,
    this.attributes = const [],
  });

  factory ServiceCategory.fromJson(Map<String, dynamic> json) => ServiceCategory(
        id: _toInt(json['id']),
        name: '${json['name'] ?? ''}',
        icon: '${json['icon'] ?? ''}',
        color: '${json['color'] ?? ''}',
        position: _toInt(json['position']),
        attributes: json['attributes'] is List ? (json['attributes'] as List) : const [],
      );
}

/// بند مواصفة محددة ضمن حزمة الخدمة
class ServiceAttributeItem {
  final String key;
  final String label;
  final String value;
  final String unit;

  String get name => label.isNotEmpty ? label : key;

  const ServiceAttributeItem({
    required this.key,
    required this.label,
    required this.value,
    this.unit = '',
  });

  factory ServiceAttributeItem.fromDynamic(dynamic item) {
    if (item is Map) {
      return ServiceAttributeItem(
        key: '${item['attr_key'] ?? item['key'] ?? ''}',
        label: '${item['label'] ?? item['name'] ?? ''}',
        value: '${item['value'] ?? ''}',
        unit: '${item['unit'] ?? ''}',
      );
    }
    return ServiceAttributeItem(key: '', label: '', value: '$item');
  }
}

List<ServiceAttributeItem> _parseAttributes(dynamic raw) {
  if (raw == null) return const [];
  if (raw is List) {
    return raw
        .where((item) => item != null)
        .map((item) => ServiceAttributeItem.fromDynamic(item))
        .where((item) => item.value.trim().isNotEmpty)
        .toList();
  }
  if (raw is Map) {
    final list = <ServiceAttributeItem>[];
    raw.forEach((k, v) {
      if (v != null && '$v'.trim().isNotEmpty) {
        list.add(ServiceAttributeItem(key: '$k', label: '$k', value: '$v'));
      }
    });
    return list;
  }
  return const [];
}

/// سطر مزوّد في القائمة العامة — من GET /api/services/providers. لا يحمل
/// `phone` مفتاحاً أصلاً في استجابة الخادم؛ التحليل يجب ألّا يفترض وجوده.
/// الرقم اختياري، فيحمل الصف `has_phone` ليعرف العميل إن كان يعرض زر التواصل
/// دون كشف الرقم؛ غيابه (خادم أقدم) يعني «نعم» كما كان السلوك قبله.
class ServiceProvider {
  final int id;
  final String name;
  final int categoryId;
  final String categoryName;
  final String categoryIcon;
  final String categoryColor;
  final String? imageUrl;
  final num? price;
  final String priceType;
  final String? priceEstimateDesc;
  final List<ServiceAttributeItem> attributes;
  final String status;
  final List<String> towns;
  final bool hasPhone;
  final int viewsCount;
  final int favoritesCount;

  /// ★ «المتوسط (العدد)» (تذكرة #186) — `ratingAvg` غيابها يعني «لا تقييمات»،
  /// فالواجهة تُخفي النجمة بدل عرض صفر مضلّل. وكلاهما محسوب في الخادم على
  /// `visible` وحدها.
  final double? ratingAvg;
  final int ratingCount;
  final bool isFavorite;

  const ServiceProvider({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    this.categoryIcon = '',
    this.categoryColor = '',
    this.imageUrl,
    this.price,
    this.priceType = 'estimated',
    this.priceEstimateDesc,
    this.attributes = const [],
    this.status = 'approved',
    this.towns = const [],
    this.hasPhone = true,
    this.viewsCount = 0,
    this.favoritesCount = 0,
    this.ratingAvg,
    this.ratingCount = 0,
    this.isFavorite = false,
  });

  String? get displayPriceBadge {
    switch (priceType) {
      case 'contact':
      case 'contact_only':
        return 'تواصل للسعر';
      case 'starting_at':
      case 'starting_from':
        return 'ابتداءً من';
      case 'fixed':
        return 'سعر ثابت';
      case 'estimated':
      case 'estimate':
        return 'سعر تقديري';
      default:
        return priceType.isEmpty ? null : 'سعر تقديري';
    }
  }

  factory ServiceProvider.fromJson(Map<String, dynamic> json) {
    final rawTowns = json['towns'];
    final rawPrice = json['price'];
    return ServiceProvider(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      categoryId: _toInt(json['category_id']),
      categoryName: '${json['category_name'] ?? ''}',
      categoryIcon: '${json['category_icon'] ?? ''}',
      categoryColor: '${json['category_color'] ?? ''}',
      imageUrl: _nullableString(json['image_url']),
      price: rawPrice is num ? rawPrice : (num.tryParse('$rawPrice')),
      priceType: json['price_type'] != null ? '${json['price_type']}' : '',
      priceEstimateDesc: _nullableString(json['price_estimate_desc']),
      attributes: _parseAttributes(json['attributes']),
      status: '${json['status'] ?? 'approved'}',
      towns: rawTowns is List ? rawTowns.map((t) => '$t').toList() : const [],
      hasPhone: json['has_phone'] != false,
      viewsCount: _toInt(json['views_count']),
      favoritesCount: _toInt(json['favorites_count']),
      ratingAvg: _nullableDouble(json['rating_avg']),
      ratingCount: _toInt(json['rating_count']),
      isFavorite: json['is_favorite'] == true,
    );
  }
}

/// صفحة مزوّدين — من `providers`/`pagination` في GET /api/services/providers.
class ServiceProvidersPage {
  final List<ServiceProvider> providers;
  final ServiceProvidersPagination pagination;

  const ServiceProvidersPage({required this.providers, required this.pagination});
}

/// ترقيم صفحات دليل الخدمات — نفس شكل `pagination` في GET /api/events، لكن
/// نوع مستقل كي لا يربط نموذج الدليل بنموذج المناسبات.
class ServiceProvidersPagination {
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const ServiceProvidersPagination({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  bool get hasMore => page < totalPages;

  factory ServiceProvidersPagination.fromJson(Map<String, dynamic> json) =>
      ServiceProvidersPagination(
        page: _toInt(json['page']),
        limit: _toInt(json['limit']),
        total: _toInt(json['total']),
        totalPages: _toInt(json['totalPages']),
      );
}

/// ساعات يوم واحد من `hours` — `{ day, closed?, from?, to? }` كما يخزّنها
/// الأدمن. `day` من 0 (الأحد) إلى 6 (السبت)، والوقت نصّ `HH:MM`. لا تفسير ولا
/// تحويل هنا: الشاشة تعرض ما وصل، والشكل نفسه محقَّق على الخادم.
class ServiceProviderHours {
  final int day;
  final bool closed;
  final String from;
  final String to;

  const ServiceProviderHours({
    required this.day,
    this.closed = false,
    this.from = '',
    this.to = '',
  });

  factory ServiceProviderHours.fromJson(Map<String, dynamic> json) =>
      ServiceProviderHours(
        day: _toInt(json['day']),
        closed: json['closed'] == true,
        from: '${json['from'] ?? ''}',
        to: '${json['to'] ?? ''}',
      );
}

/// صورة من معرض المزوّد — `caption` اختياري، والترتيب يصل من الخادم.
class ServiceProviderPhoto {
  final int id;
  final String imageUrl;
  final String? caption;

  const ServiceProviderPhoto({
    required this.id,
    required this.imageUrl,
    this.caption,
  });

  factory ServiceProviderPhoto.fromJson(Map<String, dynamic> json) =>
      ServiceProviderPhoto(
        id: _toInt(json['id']),
        imageUrl: '${json['image_url'] ?? ''}',
        caption: _nullableString(json['caption']),
      );
}

/// عرض ساري — الخادم لا يرسل للعامة إلا النشِط غير المنتهي (تذكرة #184).
class ServiceProviderOffer {
  final int id;
  final String title;
  final String? description;
  final num? price;
  final String? endsAt;

  const ServiceProviderOffer({
    required this.id,
    required this.title,
    this.description,
    this.price,
    this.endsAt,
  });

  factory ServiceProviderOffer.fromJson(Map<String, dynamic> json) {
    final rawPrice = json['price'];
    return ServiceProviderOffer(
      id: _toInt(json['id']),
      title: '${json['title'] ?? ''}',
      description: _nullableString(json['description']),
      price: rawPrice is num ? rawPrice : num.tryParse('$rawPrice'),
      endsAt: _nullableString(json['ends_at']),
    );
  }
}

/// منتج بسعر «تبدأ من».
class ServiceProviderProduct {
  final int id;
  final String name;
  final String? description;
  final num? price;
  final String? imageUrl;

  const ServiceProviderProduct({
    required this.id,
    required this.name,
    this.description,
    this.price,
    this.imageUrl,
  });

  factory ServiceProviderProduct.fromJson(Map<String, dynamic> json) {
    final rawPrice = json['price'];
    return ServiceProviderProduct(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      description: _nullableString(json['description']),
      price: rawPrice is num ? rawPrice : num.tryParse('$rawPrice'),
      imageUrl: _nullableString(json['image_url']),
    );
  }
}

/// مزوّد خدمة كامل — من GET /api/services/providers/:id، الموضع الوحيد الذي
/// يحمل `phone`. لا يُعرض الرقم في الواجهة إلا خلف فعل تواصل صريح — القرار
/// هنا في العميل يحترم قرار الخادم بعدم إرساله في القائمة، لا يكرّره فقط.
///
/// **وصفحته غنية منذ #184:** الشعار والغلاف، وشارتا «موثّق»/«مميّز»، وساعات
/// العمل، والمعرض، والعروض السارية، والمنتجات، ومزوّدون مشابهون. كل حقل يصل
/// بشكله من الخادم ولا يُخمَّن في الشاشة، وكل قسم فارغ يُخفى.
class ServiceProviderDetail {
  final int id;
  final String name;
  final int categoryId;
  final String categoryName;
  final String categoryIcon;
  final String categoryColor;
  final String phone;
  final String? description;
  final String? imageUrl;
  final String? logoUrl;
  final String? coverUrl;
  final bool isVerified;
  final bool isFeatured;
  final List<ServiceProviderHours> hours;
  final List<ServiceProviderPhoto> gallery;
  final List<ServiceProviderOffer> offers;
  final List<ServiceProviderProduct> products;
  final List<ServiceProvider> similar;
  final num? price;
  final String priceType;
  final String? priceEstimateDesc;
  final List<ServiceAttributeItem> attributes;
  final String status;
  final String? rejectionReason;
  final List<String> towns;
  final int viewsCount;
  final int favoritesCount;
  final bool isFavorite;

  /// تقييمات المزوّد (تذكرة #186): المتوسط والعدد والتوزيع، وتقييم صاحب
  /// الطلب وحده في [myReview] — منه تعرف الشاشة أتعرض «حذف تقييمي» أم
  /// «اكتب تقييمك»، والقائمة العامة لا تحمل هوية كاتب أي تقييم.
  final double? ratingAvg;
  final int ratingCount;
  final Map<int, int> ratingDistribution;
  final ProviderReview? myReview;

  /// هل هذا الحساب هو المزوّد المربوط لهذا الصفّ؟ (تذكرة #187) — منه تعرف
  /// الشاشة أتعرض زرّ «ردّ على التقييم» أسفل التعليقات. **و`linked_user_id`
  /// لا يصل العميل أبداً**؛ منطقيّ واحد يكفي.
  final bool isLinkedProvider;

  const ServiceProviderDetail({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    this.categoryIcon = '',
    this.categoryColor = '',
    required this.phone,
    this.description,
    this.imageUrl,
    this.logoUrl,
    this.coverUrl,
    this.isVerified = false,
    this.isFeatured = false,
    this.hours = const [],
    this.gallery = const [],
    this.offers = const [],
    this.products = const [],
    this.similar = const [],
    this.price,
    this.priceType = 'estimated',
    this.priceEstimateDesc,
    this.attributes = const [],
    this.status = 'approved',
    this.rejectionReason,
    this.towns = const [],
    this.viewsCount = 0,
    this.favoritesCount = 0,
    this.isFavorite = false,
    this.ratingAvg,
    this.ratingCount = 0,
    this.ratingDistribution = const {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
    this.myReview,
    this.isLinkedProvider = false,
  });

  /// الرقم اختياري: مزوّد بلا رقم يعيد الخادم `phone: null` فيصير هنا ''.
  bool get hasPhone => phone.isNotEmpty;

  factory ServiceProviderDetail.fromJson(Map<String, dynamic> json) {
    final rawTowns = json['towns'];
    final rawPrice = json['price'];
    final rawHours = json['hours'];
    final rawGallery = json['gallery'];
    final rawOffers = json['offers'];
    final rawProducts = json['products'];
    final rawSimilar = json['similar'];
    final rawMyReview = json['my_review'];
    return ServiceProviderDetail(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      categoryId: _toInt(json['category_id']),
      categoryName: '${json['category_name'] ?? ''}',
      categoryIcon: '${json['category_icon'] ?? ''}',
      categoryColor: '${json['category_color'] ?? ''}',
      phone: '${json['phone'] ?? ''}',
      description: _nullableString(json['description']),
      imageUrl: _nullableString(json['image_url']),
      logoUrl: _nullableString(json['logo_url']),
      coverUrl: _nullableString(json['cover_url']),
      isVerified: json['is_verified'] == true,
      isFeatured: json['is_featured'] == true,
      hours: rawHours is List
          ? rawHours
              .whereType<Map<String, dynamic>>()
              .map(ServiceProviderHours.fromJson)
              .toList()
          : const [],
      gallery: rawGallery is List
          ? rawGallery
              .whereType<Map<String, dynamic>>()
              .map(ServiceProviderPhoto.fromJson)
              .toList()
          : const [],
      offers: rawOffers is List
          ? rawOffers
              .whereType<Map<String, dynamic>>()
              .map(ServiceProviderOffer.fromJson)
              .toList()
          : const [],
      products: rawProducts is List
          ? rawProducts
              .whereType<Map<String, dynamic>>()
              .map(ServiceProviderProduct.fromJson)
              .toList()
          : const [],
      similar: rawSimilar is List
          ? rawSimilar
              .whereType<Map<String, dynamic>>()
              .map(ServiceProvider.fromJson)
              .toList()
          : const [],
      price: rawPrice is num ? rawPrice : (num.tryParse('$rawPrice')),
      priceType: '${json['price_type'] ?? 'estimated'}',
      priceEstimateDesc: _nullableString(json['price_estimate_desc']),
      attributes: _parseAttributes(json['attributes']),
      status: '${json['status'] ?? 'approved'}',
      rejectionReason: _nullableString(json['rejection_reason']),
      towns: rawTowns is List ? rawTowns.map((t) => '$t').toList() : const [],
      viewsCount: _toInt(json['views_count']),
      favoritesCount: _toInt(json['favorites_count']),
      isFavorite: json['is_favorite'] == true,
      ratingAvg: _nullableDouble(json['rating_avg']),
      ratingCount: _toInt(json['rating_count']),
      ratingDistribution: _parseRatingDistribution(json['rating_distribution']),
      myReview: rawMyReview is Map<String, dynamic>
          ? ProviderReview.fromJson(rawMyReview)
          : null,
      isLinkedProvider: json['is_linked_provider'] == true,
    );
  }
}

/// تقييم مزوّد واحد (تذكرة #186) — من `reviews` في المسار المرقّم أو من
/// `my_review` في صفحة المزوّد. الاسم من `users.full_name` في الخادم، **ولا
/// رقم هاتف ولا `user_id`** في أي شكل: التمييز «تقييمي» في `isMine`.
///
/// **وردّ المزوّد المربوط (تذكرة #187):** [replyBody] و[replyAt] لكل قارئ —
/// الردّ جزء من التقييم العام — و[canReply] تعني «هذا الحساب هو المزوّد
/// المربوط لهذا التقييم»، فيظهر زرّ الردّ له وحده. والخادم يحكم ثانيةً داخل
/// الاستعلام، فالزرّ تجربة لا صلاحية.
class ProviderReview {
  final int id;
  final int rating;
  final String? body;
  final String userName;
  final String? createdAt;
  final bool isMine;
  final bool canDelete;

  /// `visible` أو `hidden` — الثانية تصل في `my_review` وحده: صاحبه يعرف أن
  /// تقييمه أُخفي بعد بلاغات ولم يُحذف.
  final String status;

  final String? replyBody;
  final String? replyAt;
  final bool canReply;

  const ProviderReview({
    required this.id,
    required this.rating,
    this.body,
    this.userName = '',
    this.createdAt,
    this.isMine = false,
    this.canDelete = false,
    this.status = 'visible',
    this.replyBody,
    this.replyAt,
    this.canReply = false,
  });

  factory ProviderReview.fromJson(Map<String, dynamic> json) => ProviderReview(
        id: _toInt(json['id']),
        rating: _toInt(json['rating']),
        body: _nullableString(json['body']),
        userName: '${json['user_name'] ?? ''}',
        createdAt: _nullableString(json['created_at']),
        isMine: json['is_mine'] == true,
        canDelete: json['can_delete'] == true,
        status: '${json['status'] ?? 'visible'}',
        replyBody: _nullableString(json['reply_body']),
        replyAt: _nullableString(json['reply_at']),
        canReply: json['can_reply'] == true,
      );
}

/// صفحة تقييمات مرقّمة — من `GET /api/services/providers/:id/reviews`.
class ProviderReviewsPage {
  final List<ProviderReview> reviews;
  final ServiceProvidersPagination pagination;

  const ProviderReviewsPage({required this.reviews, required this.pagination});
}

/// ملخّص التقييم الذي يعود مع كل كتابة أو حذف — المتوسط والعدد والتوزيع من
/// الخادم وحده، فلا يعدّها العميل بنفسه.
class ProviderReviewSummary {
  final double? ratingAvg;
  final int ratingCount;
  final Map<int, int> ratingDistribution;

  const ProviderReviewSummary({
    this.ratingAvg,
    this.ratingCount = 0,
    this.ratingDistribution = const {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
  });

  factory ProviderReviewSummary.fromJson(Map<String, dynamic> json) =>
      ProviderReviewSummary(
        ratingAvg: _nullableDouble(json['rating_avg']),
        ratingCount: _toInt(json['rating_count']),
        ratingDistribution: _parseRatingDistribution(json['rating_distribution']),
      );
}

/// ردّ PUT/DELETE `/api/services/providers/:id/favorite` — الحالة والعدّاد من
/// الخادم وحده، فلا يخمّن العميل عدداً ولا يقلّد زيادة محلية.
class ProviderFavoriteResult {
  final bool isFavorite;
  final int favoritesCount;

  const ProviderFavoriteResult({
    required this.isFavorite,
    required this.favoritesCount,
  });

  factory ProviderFavoriteResult.fromJson(Map<String, dynamic> json) =>
      ProviderFavoriteResult(
        isFavorite: json['is_favorite'] == true,
        favoritesCount: _toInt(json['favorites_count']),
      );
}

/// ردّ POST `/api/services/providers/:id/view` — `counted` تقول أكان هذا أول
/// مشاهدة للمفتاح في اليوم، و`viewsCount` العدّاد بعد الطلب.
class ProviderViewResult {
  final bool counted;
  final int viewsCount;

  const ProviderViewResult({required this.counted, required this.viewsCount});

  factory ProviderViewResult.fromJson(Map<String, dynamic> json) =>
      ProviderViewResult(
        counted: json['counted'] == true,
        viewsCount: _toInt(json['views_count']),
      );
}

/// طلب عرض سعر واحد (تذكرة #188، ADR-0016) — الشكل نفسه في «الطلبات الواردة»
/// و«العروض المستلمة» (`shapeQuoteRow` في `services.service.js`)، فلا شكلا
/// قراءة لصفّ واحد.
///
/// **ولا `user_id` ولا رقم هاتف:** [userName] اسم الطالب ويصل للحساب المربوط
/// وحده، و[offerPrice]/[note] نصّان كما كتبهما صاحبهما (السعر لا يُحوَّل إلى رقم).
/// و[status] إحدى الخمس: `awaiting_offer` | `offered` | `accepted` | `declined`
/// | `cancelled`، و[canCancel] تعني أن «إلغاء الطلب» ما زال متاحاً.
class ProviderQuote {
  final int id;
  final String status;
  final int providerId;
  final String providerName;
  final String? providerCategoryName;

  /// اسم الزبون — في «الطلبات الواردة» وحدها، ولا في «العروض المستلمة».
  final String? userName;

  final int? eventId;
  final String? eventTitle;
  final String? eventDate;
  final String? wantedDate;
  final int? guestsCount;
  final String? note;
  final String? offerPrice;
  final String? offerNote;
  final String? offeredAt;
  final String? decidedAt;
  final String? createdAt;

  const ProviderQuote({
    required this.id,
    this.status = 'awaiting_offer',
    this.providerId = 0,
    this.providerName = '',
    this.providerCategoryName,
    this.userName,
    this.eventId,
    this.eventTitle,
    this.eventDate,
    this.wantedDate,
    this.guestsCount,
    this.note,
    this.offerPrice,
    this.offerNote,
    this.offeredAt,
    this.decidedAt,
    this.createdAt,
  });

  factory ProviderQuote.fromJson(Map<String, dynamic> json) => ProviderQuote(
        id: _toInt(json['id']),
        status: '${json['status'] ?? 'awaiting_offer'}',
        providerId: _toInt(json['provider_id']),
        providerName: '${json['provider_name'] ?? ''}',
        providerCategoryName: _nullableString(json['provider_category_name']),
        userName: _nullableString(json['user_name']),
        eventId: json['event_id'] == null ? null : _toInt(json['event_id']),
        eventTitle: _nullableString(json['event_title']),
        eventDate: _nullableString(json['event_date']),
        wantedDate: _nullableString(json['wanted_date']),
        guestsCount: json['guests_count'] == null ? null : _toInt(json['guests_count']),
        note: _nullableString(json['note']),
        offerPrice: _nullableString(json['offer_price']),
        offerNote: _nullableString(json['offer_note']),
        offeredAt: _nullableString(json['offered_at']),
        decidedAt: _nullableString(json['decided_at']),
        createdAt: _nullableString(json['created_at']),
      );

  /// «بانتظار عرض المزوّد» — المزوّد لم يردّ بعد، ولا قرار على الزبون.
  bool get isAwaitingOffer => status == 'awaiting_offer';

  /// «وصل عرض» — القرار على الزبون، ويُعرض في قسم «بانتظار ردك».
  bool get isOffered => status == 'offered';

  bool get isAccepted => status == 'accepted';

  /// الإلغاء متاح من `awaiting_offer` و`offered` وحدهما (`cancel` قبل القرار).
  bool get canCancel => isAwaitingOffer || isOffered;
}

/// ردّ `POST /api/services/providers/:id/quote-requests` — [channel] يقول أين
/// ذهب الطلب: `app` صفٌّ كُتب لمزوّد مربوط ([quote] حاضرة ولا [url])،
/// و`whatsapp` رابطٌ بناه الخادم بلا صفّ ([url] حاضر ولا [quote]).
class QuoteRequestResult {
  final String channel;
  final ProviderQuote? quote;
  final String? url;
  final String? message;

  const QuoteRequestResult({
    required this.channel,
    this.quote,
    this.url,
    this.message,
  });

  factory QuoteRequestResult.fromJson(Map<String, dynamic> json) {
    final raw = json['quote'];
    return QuoteRequestResult(
      channel: '${json['channel'] ?? 'app'}',
      quote: raw is Map<String, dynamic> ? ProviderQuote.fromJson(raw) : null,
      url: _nullableString(json['url']),
      message: _nullableString(json['message']),
    );
  }

  bool get isWhatsApp => channel == 'whatsapp';
}
