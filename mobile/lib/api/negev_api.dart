import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/album.dart';
import '../models/event.dart';
import '../models/live.dart';
import '../models/my_list.dart';
import '../models/news.dart';
import '../models/nokoot.dart';
import '../models/notification.dart';
import '../models/prices.dart';
import '../models/reminder_schedule.dart';
import '../models/service.dart';
import '../models/stats_ticker.dart';
import '../models/user.dart';
import 'api_client.dart';

/// مفتاح معرّف الزائر العشوائي في `shared_preferences` (تذكرة #185) — يُولَّد
/// مرة واحدة ويبقى. و`X-Visitor-Id` وحدها تحمله إلى الخادم: لا عنوان IP في أي
/// مفتاح ولا في أي عمود.
const String negevVisitorIdKey = 'negev_visitor_id';

final RegExp _visitorIdPattern = RegExp(r'^[A-Za-z0-9_-]{16,64}$');

/// المعرّف المحفوظ، أو معرّف عشوائي جديد يُحفظ مرة واحدة (32 حرفاً hex).
Future<String> providerVisitorId() async {
  final prefs = await SharedPreferences.getInstance();
  final saved = prefs.getString(negevVisitorIdKey);
  if (saved != null && _visitorIdPattern.hasMatch(saved)) return saved;

  final random = Random.secure();
  final generated = List<String>.generate(
    16,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  await prefs.setString(negevVisitorIdKey, generated);
  return generated;
}

/// كل نقاط الخادم في مكان واحد — نفس العقد الموثّق في README.
class NegevApi {
  NegevApi(this._client);

  final ApiClient _client;

  ApiClient get client => _client;

  // --- عام ---------------------------------------------------------

  /// صفحة من المناسبات العامة — القادمة افتراضياً، `archive: true` للمنتهية.
  /// الترشيح كله على الخادم؛ لا تُرشَّح النتيجة ثانيةً في العميل.
  /// [dateFrom]/[dateTo] (‏`YYYY-MM-DD`) فلتر التاريخ: الخادم يطابق بالتقاطع،
  /// والنطاق يحلّ محلّ شرط «القادم» فيوم ماضٍ مختار يعيد مناسباته.
  ///
  /// [allRegions] «كل المحافظات» (#161): يضيف `all_regions=1` إلى هذا النداء
  /// وحده، فيتجاوز الخادم تقييد المحافظة عليه ويعيد صفوف المحافظات كلها.
  /// **`api.client.regionId` لا يُمسّ**: تلك ترويسة مشتركة لكل النداءات،
  /// والعلَم للطلبات التي تطلبه صراحةً لا لكل العميل.
  ///
  /// [regionHeader] محافظة **هذا النداء** وحدها (قائمة مناسبات اليوم في
  /// «الأجندة»، تذكرة #175) — تُرسَل `X-Region` بدل المحافظة العامة، ويغلبها
  /// [allRegions] لأن العلَم نفسه توسيعٌ صريح.
  Future<EventsPage> listEvents({
    Object? town,
    Iterable<String>? towns,
    String? search,
    Object? occasionTypeId,
    Iterable<int>? occasionTypeIds,
    Object? villageId,
    Iterable<int>? villageIds,
    bool archive = false,
    bool allRegions = false,
    String? dateFrom,
    String? dateTo,
    String? regionHeader,
    int page = 1,
    int limit = 30,
  }) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};

    final List<String> townList = [];
    if (towns != null) {
      townList.addAll(towns.where((t) => t.isNotEmpty && t != 'الكل'));
    } else if (town is Iterable) {
      townList.addAll(town.map((e) => '$e').where((t) => t.isNotEmpty && t != 'الكل'));
    } else if (town is String && town.isNotEmpty && town != 'الكل') {
      townList.addAll(town.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty && s != 'الكل'));
    }
    if (townList.isNotEmpty) {
      query['town'] = townList.join(',');
    }

    final List<int> typeList = [];
    if (occasionTypeIds != null) {
      typeList.addAll(occasionTypeIds);
    } else if (occasionTypeId is Iterable) {
      typeList.addAll(occasionTypeId.map((e) => int.tryParse('$e')).whereType<int>());
    } else if (occasionTypeId is int) {
      typeList.add(occasionTypeId);
    } else if (occasionTypeId is String && occasionTypeId.isNotEmpty) {
      typeList.addAll(occasionTypeId.split(',').map((s) => int.tryParse(s.trim())).whereType<int>());
    }
    if (typeList.isNotEmpty) {
      query['occasion_type_id'] = typeList.join(',');
    }

    final List<int> villageList = [];
    if (villageIds != null) {
      villageList.addAll(villageIds);
    } else if (villageId is Iterable) {
      villageList.addAll(villageId.map((e) => int.tryParse('$e')).whereType<int>());
    } else if (villageId is int) {
      villageList.add(villageId);
    } else if (villageId is String && villageId.isNotEmpty) {
      villageList.addAll(villageId.split(',').map((s) => int.tryParse(s.trim())).whereType<int>());
    }
    if (villageList.isNotEmpty) {
      query['village_id'] = villageList.join(',');
    }

    if (search != null && search.trim().isNotEmpty) {
      query['search'] = search.trim();
    }
    if (archive) query['archive'] = '1';
    if (allRegions) query['all_regions'] = '1';
    if (dateFrom != null) query['date_from'] = dateFrom;
    if (dateTo != null) query['date_to'] = dateTo;

    final data = await _client.get(
      '/api/events',
      query: query,
      regionHeader: allRegions ? null : regionHeader,
    );
    final list = data['events'];
    final events = list is List
        ? list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList()
        : <Event>[];

    final rawPagination = data['pagination'];
    final pagination = rawPagination is Map<String, dynamic>
        ? Pagination.fromJson(rawPagination)
        : Pagination(page: page, limit: limit, total: events.length, totalPages: 1);

    final rawAnnouncements = data['announcements'];
    final announcements = rawAnnouncements is List
        ? rawAnnouncements
            .whereType<Map<String, dynamic>>()
            .map(Announcement.fromJson)
            .toList()
        : <Announcement>[];

    return EventsPage(events: events, pagination: pagination, announcements: announcements);
  }

  /// أيام الشهر التي فيها مناسبات — `GET /api/events/calendar` (تذكرة #175)،
  /// عام بلا رمز.
  ///
  /// [month] صيغة `YYYY-MM`، و[regionId] فلتر المحافظة في التقويم وحده
  /// (`null` = كل المحافظات). والخادم هو من يحسب الأيام: امتداد المناسبة كاملاً
  /// (`EVENT_SPAN_*` — event_end_date وأيام event_days) وبوابة الظهور العام، فلا
  /// تكرار لهذا الحساب في العميل — حسبانُه هنا على `eventDate` وحده كان يعدّ
  /// المناسبةَ متعددة الأيام يوماً واحداً ويعدّ `link_only` وهي غائبة.
  ///
  /// يعيد الأيام التي فيها مناسبة وحدها مرتّبةً تصاعدياً (الخادم لا يرسل
  /// صفوفاً صفرية)، فلا حاجة إلى تصفية أو ترتيب هنا.
  Future<List<CalendarDay>> calendarDays({
    required String month,
    int? regionId,
  }) async {
    final query = <String, String>{'month': month};
    if (regionId != null) query['region_id'] = '$regionId';
    final data = await _client.get('/api/events/calendar', query: query);
    final raw = data['days'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(CalendarDay.fromJson)
        .where((day) => day.date.isNotEmpty && day.count > 0)
        .toList();
  }

  /// «الأكثر تفاعلاً هذا الأسبوع» — `GET /api/events/trending` (تذكرة #177)،
  /// عام بلا رمز.
  ///
  /// الخادم وحده يحسب كل شيء: مجموع الإشارات الأربع داخل نافذة
  /// `TRENDING_WINDOW_DAYS`، وبوابة الظهور العام، واستبعاد العزاء، والحدّ
  /// (ستّة)، والترتيب الحتمي. والصفوف تعود بشكل كرت التغذية نفسه
  /// (`Event.fromJson` واحد لا نموذج ثانٍ)، فالترشيح أو الترتيب هنا تكرار.
  ///
  /// [allRegions] «كل المحافظات» (`all_regions=1`) لهذا النداء وحده — بلا
  /// العلَم يُقيَّد الطلب بمحافظة الاكتشاف التي يرفقها `ApiClient` من نفسه في
  /// ترويسة `X-Region`. و`events` غير مصفوفة تعني «لا نتيجة» لا خطأ، فتعود
  /// قائمة فارغة فيختفي القسم.
  Future<List<Event>> trendingEvents({bool allRegions = false}) async {
    final data = await _client.get(
      '/api/events/trending',
      query: allRegions ? {'all_regions': '1'} : null,
    );
    final raw = data['events'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(Event.fromJson)
        .toList();
  }

  /// كتالوج الأماكن كاملاً بطلب واحد إلى GET /api/towns: البلدات النشِطة
  /// (بلا «الكل»)، ومراكزها، والقرى، والمحافظات النشطة، والموقوفة («قريباً»).
  /// البلدات صارت بيانات وقت تشغيل يديرها السوبر أدمن، فلا تُقرأ من
  /// `lib/config.dart` إلا احتياطاً: أي فشل (انقطاع، ردّ غير متوقَّع) يعيد
  /// [PlacesCatalog.fallback] لا خطأً، كي لا يبقى منتقٍ بلا بلدات أبداً.
  Future<PlacesCatalog> placesCatalog() async {
    try {
      final data = await _client.get('/api/towns');
      final rawTowns = data['towns'];
      final towns = rawTowns is List
          ? rawTowns.map((t) => '$t').where((t) => t.isNotEmpty && t != 'الكل').toList()
          : <String>[];
      if (towns.isEmpty) return PlacesCatalog.fallback();

      final rawVillages = data['villages'];
      final rawRegions = data['regions'];
      final rawSoon = data['regions_soon'];
      return PlacesCatalog(
        towns: towns,
        townCoordinates: _parseTownCoordinates(data['town_coordinates']),
        villages: rawVillages is List
            ? rawVillages.whereType<Map<String, dynamic>>().map(Village.fromJson).toList()
            : const [],
        regions: rawRegions is List
            ? rawRegions
                .whereType<Map<String, dynamic>>()
                .map(Region.fromJson)
                .where((r) => r.name.isNotEmpty)
                .toList()
            : const [],
        soonRegions: rawSoon is List
            ? rawSoon
                .whereType<Map<String, dynamic>>()
                .map(Region.soonFromJson)
                .where((r) => r.name.isNotEmpty)
                .toList()
            : const [],
        fromServer: true,
      );
    } catch (_) {
      return PlacesCatalog.fallback();
    }
  }

  /// مراكز البلدات — من GET /api/towns. `lib/config.dart` يحمل أسماء البلدات
  /// فقط؛ الإحداثيات من الخادم حصراً (كانت مغلوطة حتى ٨.٤ كم حين عاشت في
  /// العميل — نسخة ثانية تعني عطلاً يُصحَّح مرّتين). 'القرى والتجمعات' سلّة
  /// تجميع لا مكان، فلا مدخل لها هنا عمداً.
  Future<Map<String, TownCoordinate>> townCoordinates() async {
    final data = await _client.get('/api/towns');
    return _parseTownCoordinates(data['town_coordinates']);
  }

  static Map<String, TownCoordinate> _parseTownCoordinates(Object? raw) {
    final result = <String, TownCoordinate>{};
    if (raw is Map) {
      raw.forEach((key, value) {
        if (value is! Map) return;
        final lat = value['lat'];
        final lng = value['lng'];
        final latD = lat is num ? lat.toDouble() : double.tryParse('$lat');
        final lngD = lng is num ? lng.toDouble() : double.tryParse('$lng');
        if (latD != null && lngD != null) {
          result['$key'] = TownCoordinate(lat: latD, lng: lngD);
        }
      });
    }
    return result;
  }

  /// القرى النشِطة — من مفتاح `villages` في GET /api/towns. بيانات وقت تشغيل
  /// حصراً: لا تُكرَّر في `lib/config.dart` مهما كثرت.
  Future<List<Village>> listVillages() async {
    final data = await _client.get('/api/towns');
    final raw = data['villages'];
    if (raw is! List) return const [];
    return raw.whereType<Map<String, dynamic>>().map(Village.fromJson).toList();
  }

  // --- آخر الأخبار (منصة كترا الإخبارية، عام) -------------------------

  /// صفحة أخبار المحافظة — `GET /api/news`، عام بلا رمز.
  ///
  /// المحافظة **لا تُرسَل في الاستعلام**: الخادم يشتقّها من ترويسة `X-Region`
  /// التي يضيفها [ApiClient] مع كل نداء (هنا كبقية النداءات)، فيكفي أن يكون
  /// `RegionStore` قد ضبطها. [general] يطلب الأخبار المحلية العامة بدل أخبار
  /// المحافظة (زرّ «أخبار محلية عامة» في الحالة الفارغة)، ويُرسَل دائماً `1`
  /// أو `0` كما في العقد.
  Future<NewsFeed> newsFeed({
    int limit = 50,
    int offset = 0,
    bool general = false,
  }) async {
    final data = await _client.get(
      '/api/news',
      query: {
        'limit': '$limit',
        'offset': '$offset',
        'general': general ? '1' : '0',
      },
    );
    return NewsFeed.fromJson(data);
  }

  /// خبر واحد كاملاً بنصّه (`body_text`) وكاتبه — `GET /api/news/:id`.
  Future<NewsItem> newsItem(int id) async {
    final data = await _client.get('/api/news/$id');
    final raw = data['item'];
    if (raw is! Map) {
      throw const ApiException('تعذّر قراءة الخبر');
    }
    return NewsItem.fromJson(Map<String, dynamic>.from(raw));
  }

  // --- دليل الخدمات (عام، بلا حساب) ----------------------------------

  Future<List<ServiceCategory>> serviceCategories() async {
    final data = await _client.get('/api/services/categories');
    final list = data['categories'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(ServiceCategory.fromJson).toList();
  }

  /// صفحة مزوّدين — بلا `phone` أبداً (قرار خادم، رسمياً في enforcement rule 6
  /// من مواصفة الدليل). الرقم لا يصل إلا عبر [serviceProviderDetails].
  Future<ServiceProvidersPage> serviceProviders({
    int? categoryId,
    String? town,
    String? search,
    int page = 1,
    int limit = 30,
  }) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};
    if (categoryId != null) query['category_id'] = '$categoryId';
    if (town != null && town.isNotEmpty && town != 'الكل') query['town'] = town;
    if (search != null && search.trim().isNotEmpty) query['search'] = search.trim();

    final data = await _client.get('/api/services/providers', query: query);
    final list = data['providers'];
    final providers = list is List
        ? list.whereType<Map<String, dynamic>>().map(ServiceProvider.fromJson).toList()
        : <ServiceProvider>[];

    final rawPagination = data['pagination'];
    final pagination = rawPagination is Map<String, dynamic>
        ? ServiceProvidersPagination.fromJson(rawPagination)
        : ServiceProvidersPagination(
            page: page, limit: limit, total: providers.length, totalPages: 1);

    return ServiceProvidersPage(providers: providers, pagination: pagination);
  }

  /// مزوّد واحد كاملاً — الموضع الوحيد الذي يحمل `phone` والوصف.
  ///
  /// **وبالرمز حين يوجد حساب** (`auth: true` يرفقه وحده)، كي يعيد الخادم
  /// `my_review` — تقييم صاحب الطلب وحده — فتعرف الشاشة أتعرض «حذف تقييمي»
  /// أم «اكتب تقييمك» (تذكرة #186). المسار `optionalAuthenticate`، والزائر
  /// يستلم `my_review: null` ويكمل بلا حساب. نفس نمط [eventDetails] مع
  /// `my_rsvp`: قراءةٌ عامة تُثريها الجلسة إن وُجدت ولا تتطلّبها.
  Future<ServiceProviderDetail> serviceProviderDetails(int id) async {
    final data = await _client.get('/api/services/providers/$id', auth: true);
    final provider = data['provider'];
    if (provider is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات مزوّد الخدمة');
    }
    return ServiceProviderDetail.fromJson(provider);
  }

  /// تسجيل مشاهدة صفحة المزوّد (تذكرة #185) — تُستدعى مرة عند فتح الصفحة لا
  /// عند كل بناء. الرمز يُرفق إن كان المستخدم مسجَّلاً (فمفتاحه `u:<id>` في
  /// الخادم)، و`X-Visitor-Id` يرافق الطلب دائماً. الخادم يحسم التكرار في
  /// اليوم نفسه ويعيد `counted` والعدّاد، فلا حساب للعدّاد هنا.
  Future<ProviderViewResult> recordProviderView(int providerId) async {
    final visitorId = await providerVisitorId();
    final data = await _client.post(
      '/api/services/providers/$providerId/view',
      auth: true,
      headers: {'X-Visitor-Id': visitorId},
    );
    return ProviderViewResult.fromJson(data);
  }

  /// حفظ المزوّد أو إلغاء حفظه — PUT/DELETE متكرّران بلا خطأ (idempotent)،
  /// والعدّاد من ردّ الخادم لا من زيادة محلية. يتطلّب تسجيل دخول.
  Future<ProviderFavoriteResult> setProviderFavorite(
    int providerId,
    bool favorite,
  ) async {
    final path = '/api/services/providers/$providerId/favorite';
    final data = favorite
        ? await _client.put(path, auth: true)
        : await _client.delete(path, auth: true);
    return ProviderFavoriteResult.fromJson(data);
  }

  /// «مزوّدون محفوظون» لصاحب الحساب وحده — بشكل بطاقة القائمة نفسه وبلا رقم،
  /// ومرتّبة من الخادم (أحدث حفظ أولاً). قائمة فارغة لا خطأ.
  Future<List<ServiceProvider>> favoriteProviders() async {
    final data = await _client.get('/api/services/favorites', auth: true);
    final list = data['providers'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(ServiceProvider.fromJson)
        .toList();
  }

  // --- تقييمات المزوّد (تذكرة #186) -----------------------------------

  /// صفحة تقييمات مزوّد — **عامة بلا `auth: true`**: القراءة لا تتطلّب حساباً،
  /// و`my_review` يأتي من [serviceProviderDetails] بالرمز كي تبقى القائمة
  /// واحدة للجميع بلا هوية كاتبة.
  Future<ProviderReviewsPage> providerReviews(
    int providerId, {
    int page = 1,
    int limit = 5,
  }) async {
    final data = await _client.get(
      '/api/services/providers/$providerId/reviews',
      query: {'page': '$page', 'limit': '$limit'},
    );
    final list = data['reviews'];
    final reviews = list is List
        ? list.whereType<Map<String, dynamic>>().map(ProviderReview.fromJson).toList()
        : <ProviderReview>[];
    final rawPagination = data['pagination'];
    final pagination = rawPagination is Map<String, dynamic>
        ? ServiceProvidersPagination.fromJson(rawPagination)
        : ServiceProvidersPagination(
            page: page, limit: limit, total: reviews.length, totalPages: 1);
    return ProviderReviewsPage(reviews: reviews, pagination: pagination);
  }

  /// نشر تقييم أو تعديله — upsert على الخادم، والرمز مطلوب. `confirmPhone`
  /// إقرار صاحب الحساب أن رقمه شخصي، ويُرسل منطقياً في `confirm_phone`.
  /// يعيد التقييم المحفوظ وملخّص المتوسط/العدد/التوزيع معاً.
  Future<({ProviderReview review, ProviderReviewSummary summary})>
      submitProviderReview(
    int providerId, {
    required int rating,
    String? body,
    required bool confirmPhone,
  }) async {
    final data = await _client.put(
      '/api/services/providers/$providerId/review',
      auth: true,
      body: {
        'rating': rating,
        if (body != null && body.trim().isNotEmpty) 'body': body.trim(),
        'confirm_phone': confirmPhone,
      },
    );
    final raw = data['review'];
    if (raw is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة تقييمك بعد الحفظ');
    }
    return (
      review: ProviderReview.fromJson(raw),
      summary: ProviderReviewSummary.fromJson(data),
    );
  }

  /// حذف تقييم صاحبه — idempotent في الخادم. يعيد `null` حين لا صفّ حُذف
  /// (`deleted: false`): الخادم لا يحسب ملخّصاً لمزوّد لم يُحذف منه شيء، فلا
  /// تُبنى أرقام على ردٍّ لا يخصّ تقييماً قائماً.
  Future<ProviderReviewSummary?> deleteProviderReview(int providerId) async {
    final data = await _client.delete(
      '/api/services/providers/$providerId/review',
      auth: true,
    );
    if (data['deleted'] != true) return null;
    return ProviderReviewSummary.fromJson(data);
  }

  /// بلاغ عن تقييم غيره — صفّ واحد لكل مستخدم، والثالث يُخفيه في الخادم.
  Future<({int reportsCount, String status})> reportProviderReview(
    int providerId,
    int reviewId,
  ) async {
    final data = await _client.post(
      '/api/services/providers/$providerId/reviews/$reviewId/report',
      auth: true,
    );
    return (
      reportsCount: int.tryParse('${data['reports_count'] ?? ''}') ?? 0,
      status: '${data['status'] ?? 'visible'}',
    );
  }

  /// رابط واتساب المزوّد — يبنيه الخادم وحده برسالته العربية، **ولا يعيد
  /// الرقم**؛ الشاشة تفتح `url` كما وصل ولا تركّب `wa.me` بنفسها (تذكرة #184).
  /// مزوّد بلا رقم يردّ 404 فيصل هنا استثناء برسالته العربية.
  Future<String> providerWhatsapp(int id) async {
    final data = await _client.get('/api/services/providers/$id/whatsapp');
    final url = data['url'];
    if (url is! String || url.isEmpty) {
      throw const ApiException('لا يوجد رقم واتساب مسجَّل لهذا المزوّد');
    }
    return url;
  }

  /// تقديم عرض مزوّد خدمة جديد (قيد المراجعة) — يتطلّب تسجيل دخول.
  Future<int> submitProviderOffer({
    required int categoryId,
    required String name,
    required String phone,
    String? description,
    String? imageUrl,
    num? price,
    String? priceType,
    String? priceEstimateDesc,
    List<Map<String, dynamic>>? attributes,
    required List<String> towns,
    http.MultipartFile? image,
  }) async {
    if (image != null) {
      final fields = <String, String>{
        'category_id': '$categoryId',
        'name': name,
        'phone': phone,
        'towns': jsonEncode(towns),
        if (description != null && description.isNotEmpty) 'description': description,
        if (price != null) 'price': '$price',
        if (priceType != null && priceType.isNotEmpty) 'price_type': priceType,
        if (priceEstimateDesc != null && priceEstimateDesc.isNotEmpty) 'price_estimate_desc': priceEstimateDesc,
        if (attributes != null && attributes.isNotEmpty) 'attributes': jsonEncode(attributes),
      };
      final data = await _client.postMultipart(
        '/api/services/providers',
        fields: fields,
        files: [image],
        auth: true,
      );
      return int.tryParse('${data['providerId']}') ?? 0;
    }

    final payload = <String, dynamic>{
      'category_id': categoryId,
      'name': name,
      'phone': phone,
      'towns': towns,
      if (description != null && description.isNotEmpty) 'description': description,
      if (imageUrl != null && imageUrl.isNotEmpty) 'image_url': imageUrl,
      'price': ?price,
      if (priceType != null && priceType.isNotEmpty) 'price_type': priceType,
      if (priceEstimateDesc != null && priceEstimateDesc.isNotEmpty) 'price_estimate_desc': priceEstimateDesc,
      if (attributes != null && attributes.isNotEmpty) 'attributes': attributes,
    };
    final data = await _client.post('/api/services/providers', body: payload, auth: true);
    return int.tryParse('${data['providerId']}') ?? 0;
  }

  /// قائمة عروض وخدمات المستخدم المُسجّل.
  Future<List<ServiceProviderDetail>> myServices() async {
    final data = await _client.get('/api/services/my-services', auth: true);
    final list = data['services'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(ServiceProviderDetail.fromJson).toList();
  }

  /// أنواع المناسبات النشِطة، مرتّبة، وبحقول كل نوع وتفاعلاته — لا قائمة ثابتة.
  Future<List<OccasionType>> listOccasionTypes() async {
    final data = await _client.get('/api/occasion-types');
    final list = data['types'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(OccasionType.fromJson)
        .toList();
  }

  /// تفاصيل المناسبة. **بالرمز حين يوجد حساب** (`auth: true` يرفقه وحده):
  /// الخادم يقرأ الجلسة اختيارياً على هذا المسار ويعيد `my_rsvp` لصاحبها،
  /// ومجهولاً لا يعيده إطلاقاً. بلا هذا الإرفاق تعود «لم تُجب بعد» لكل
  /// مسجَّل بعد الحفظ ولا يظهر زرّ السحب (تذكرة #168).
  Future<Event> eventDetails(int id) async {
    final data = await _client.get('/api/events/$id', auth: true);
    final event = data['event'];
    if (event is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات المناسبة');
    }
    return Event.fromJson(event);
  }

  /// «أضف إلى تقويم الهاتف» (تذكرة #176) — `GET /api/events/:id/calendar.ics`
  /// من عنوان الخادم الوحيد هنا (`ApiClient.buildUrl`، أي `config.dart`)، لا
  /// عنواناً مكرَّراً في الشاشة: الصفحة تفتحه بـ`url_launcher` فيلزمه عنوان
  /// مطلق. بناء عنوان فقط — لا نداء شبكة ولا JSON.
  Uri eventCalendarUrl(int eventId) => _client.buildUrl('/api/events/$eventId/calendar.ics');

  /// «نزّل الصورة» (تذكرة #182) — بايتات الصورة التي يرسمها الخادم على المسار
  /// العام `GET /e/:id/download.png`: صورة المناسبة نفسها وفوق أسفلها شريط
  /// «أعراسنا» (العلامة، «امسح الرمز وافتح المناسبة»، وQR لصفحة المناسبة).
  ///
  /// **بلا رمز دخول** (خلافاً لكل ما فوق): المسار عام، والرمز ليس له عمل فيه.
  /// والقراءة بايتات لا JSON — المسار ناجحُه صورة PNG وفاشلُه JSON عربي.
  Future<Uint8List> downloadEventImage(int eventId) =>
      _client.getBytes('/e/$eventId/download.png');

  Future<List<MapPoint>> mapPoints() async {
    final data = await _client.get('/api/map/events');
    final list = data['points'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(MapPoint.fromJson)
        .toList();
  }

  /// الفاصل الافتراضي لإعلان «بين الكروت» — احتياطٌ **فقط**: يُستعمل حين
  /// يغيب `feed_ad_interval` من الردّ أو يكون غير صالح (غير رقم أو ≤ 0).
  /// القيمة الفعلية تأتي من الخادم في الردّ نفسه (تذكرة #173).
  static const int defaultFeedAdInterval = 8;

  /// ستوريات المواضع الثلاثة، **وفاصل إعلان التغذية معها** (تذكرة #173):
  /// الفاصل يُقرأ من `feed_ad_interval` في الردّ لا من رقم مكتوب في العميل،
  /// فتغيير `FEED_AD_INTERVAL` في الخادم يحرّك موضع الإعلان بلا APK جديد.
  /// و`8` احتياطٌ وحده حين يغيب المفتاح أو يكون غير صالح (غير رقم أو ≤ 0).
  Future<({List<Story> stories, int feedAdInterval})> stories() async {
    final data = await _client.get('/api/stories');
    final list = data['stories'];
    final stories = list is List
        ? list.whereType<Map<String, dynamic>>().map(Story.fromJson).toList()
        : const <Story>[];
    final raw = data['feed_ad_interval'];
    final parsed = raw is num ? raw.floor() : int.tryParse('${raw ?? ''}'.trim());
    return (
      stories: stories,
      feedAdInterval: parsed != null && parsed > 0 ? parsed : defaultFeedAdInterval,
    );
  }

  /// بطاقة الدخول التسويقية — `GET /api/stories/entry-card`، مسار عام بلا
  /// مصادقة: القصة تختارها الإدارة لكل الزوّار، لا لحساب بعينه.
  ///
  /// `enabled` وحدها تعني «اعرض البطاقة»: الخادم يرسلها `false` (و`story`
  /// `null`) حين لا قصة نشِطة، فيصمت العميل بلا إطار فارغ.
  ///
  /// **لا ترمي أبداً** — بخلاف كل دالة أخرى هنا. بطاقة تسويقية لا تُفشل
  /// التغذية: انقطاع الشبكة أو ردّ غير متوقَّع يعيد
  /// `(enabled: false, source: null, story: null)` كأن الخادم قال «لا بطاقة».
  Future<({bool enabled, String? source, Story? story})> entryCard() async {
    try {
      final data = await _client.get('/api/stories/entry-card');
      final rawStory = data['story'];
      final story = rawStory is Map
          ? Story.fromJson(Map<String, dynamic>.from(rawStory))
          : null;
      final rawSource = data['source'];
      return (
        enabled: data['enabled'] == true && rawStory is Map,
        source: rawSource is String && rawSource.isNotEmpty ? rawSource : null,
        story: story,
      );
    } catch (_) {
      return (enabled: false, source: null, story: null);
    }
  }

  /// حالة البث المباشر — GET /api/live عام بلا مصادقة، فلا `auth: true`:
  /// زر التغذية وشارة النشاط لا علاقة لهما بالجلسة.
  Future<LiveChannel> liveChannel() async {
    final data = await _client.get('/api/live');
    return LiveChannel.fromJson(data);
  }

  /// شريط الإحصائيات في الرئيسية (#172) — `GET /api/stats/ticker`، مسار عام
  /// بلا مصادقة: الشريط أول ما يراه زائر لم يسجّل دخوله.
  Future<StatsTicker> statsTicker() async {
    final data = await _client.get('/api/stats/ticker');
    return StatsTicker.fromJson(data);
  }

  /// أسعار الذهب والعملات (#189) — `GET /api/prices`، مسار عام بلا مصادقة
  /// ولا محافظة: سعر السوق واحد لكل زائر. الخادم يقرأ المصدرين ويحسب، ويكاش
  /// ساعة؛ هذا العميل يقرأ ما وصل كما هو (انظر `models/prices.dart`).
  Future<PricesSnapshot> prices() async {
    final data = await _client.get('/api/prices');
    return PricesSnapshot.fromJson(data);
  }

  /// التعاميم الحيّة التي يحلّ أحدها محلّ شريط الإحصاءات (#172) — القائمة من
  /// `GET /api/broadcasts/live` بترتيب الخادم (الأحدث أولاً)، ومعرّف كل صفّ.
  ///
  /// `auth: true` كما يفعل الويب حرفياً (`fetchLiveBroadcasts` في app.js):
  /// المسار `optionalAuthenticate` على الخادم، فالزائر يرى العام، والمسجَّل
  /// دخوله يرى معه تعميم بلدته — وهو تعميم حيّ له أيضاً، فلا يمرّ خلف الشريط.
  ///
  /// صفّ بلا معرّف رقمي أو بلا نصّ يُتجاهل: بلا معرّف لا إغلاق ولا استبعاد
  /// لاحق، والشريط سطرُ نصّ لا نموذج إشعار كامل (التفاصيل في مركز الإشعارات).
  Future<List<({int id, String title, String message})>> liveBroadcasts() async {
    final data = await _client.get('/api/broadcasts/live', auth: true);
    final list = data['broadcasts'];
    if (list is! List) return const [];
    final result = <({int id, String title, String message})>[];
    for (final rawBroadcast in list) {
      if (rawBroadcast is! Map) continue;
      final broadcast = Map<String, dynamic>.from(rawBroadcast);
      final rawId = broadcast['id'];
      final id = rawId is int ? rawId : int.tryParse('$rawId');
      if (id == null) continue;
      final title = '${broadcast['title'] ?? ''}'.trim();
      final message = '${broadcast['message'] ?? ''}'.trim();
      if (title.isEmpty && message.isEmpty) continue;
      result.add((id: id, title: title, message: message));
    }
    return result;
  }

  /// صفحة البث كاملة — GET /api/live/hub. `auth: true` للمسجَّل وحده كي يصل
  /// `my_vote` (ونتائج اليوم بعد تصويته)؛ الزائر يرى الخيارات بلا نتائج.
  Future<LiveHub> liveHub({bool auth = false}) async {
    final data = await _client.get('/api/live/hub', auth: auth);
    return LiveHub.fromJson(data);
  }

  /// صوت واحد لكل حساب في نقاش اليوم — يتطلّب حساباً. يعيد الاستفتاء بنتائجه.
  Future<LivePoll> voteLive(int episodeId, int optionIndex) async {
    final data = await _client.post(
      '/api/live/episodes/$episodeId/vote',
      auth: true,
      body: {'option_index': optionIndex},
    );
    final poll = data['poll'];
    if (poll is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة نتيجة التصويت');
    }
    return LivePoll.fromJson(poll);
  }

  /// صفحة المشغّل من خادمنا — `GET /live/embed` لا `embed_url` نفسه: WebView
  /// التطبيق لا يرسل ترويسة Referer، ويوتيوب يرفض التضمين بدونها. الصفحة تلفّ
  /// المشغّل بسياسة الإحالة الصحيحة فيرى يوتيوب نطاقنا. بناء عنوان فقط.
  Uri get liveEmbedUrl => _client.buildUrl('/live/embed');

  /// وجهة «ادخل البث» خارج التطبيق — `GET /live/go` لا `/live` نفسها: `/live`
  /// صفحة الغلاف لغريب يلصق الرابط في واتساب، ومن داخل التطبيق هي نقرة زائدة.
  /// `/live/go` عبور من خادمنا يسجّل النقرة ثم يحوّل إلى البث. بناء عنوان فقط.
  Uri get liveGoUrl => _client.buildUrl('/live/go');

  /// مشغّل حلقة سابقة — `/live/e/<id>/embed` من خادمنا، لنفس سبب
  /// [liveEmbedUrl]: يوتيوب يرفض التضمين بلا Referer. بناء عنوان فقط.
  Uri pastEpisodeEmbedUrl(int episodeId) => _client.buildUrl('/live/e/$episodeId/embed');

  /// تسجيل مشاهدة شريحة ستوري — عتبة "شوهدت" (ثانيتان) يقيسها العارض على
  /// الجهاز، لا هذا النداء نفسه؛ يُستدعى فقط بعدما بقيت الشريحة ظاهرة فعلاً.
  /// `auth: true` لتُنسَب لحساب المستخدم إن كان مسجَّلاً (الخادم يفضّله على
  /// device_id)، و`deviceId` يُرسَل دائماً لتغطية الزائر أيضاً.
  Future<void> viewStory(int storyId, {required String deviceId}) async {
    await _client.post(
      '/api/stories/$storyId/view',
      auth: true,
      body: {'device_id': deviceId},
    );
  }

  /// تسجيل نقرة على قصة — بلا حدّ تكرار على الخادم، كل نقرة حقيقية.
  Future<void> clickStory(int storyId, {required String deviceId}) async {
    await _client.post(
      '/api/stories/$storyId/click',
      auth: true,
      body: {'device_id': deviceId},
    );
  }

  /// إبلاغ عن قصة — مرّة واحدة لكل مستخدم، يتطلّب حساباً.
  Future<void> reportStory(int storyId) async {
    await _client.post('/api/stories/$storyId/report', auth: true);
  }

  // --- ألبومات الأعراس (ADR-0009) ------------------------------------

  Future<({List<EventAlbum> albums, Pagination pagination})> albums({
    String? search,
    int page = 1,
    int limit = 12,
  }) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};
    if (search != null && search.trim().isNotEmpty) query['search'] = search.trim();
    final data = await _client.get('/api/albums', query: query);
    final list = data['albums'];
    return (
      albums: list is List
          ? list
              .whereType<Map>()
              .map((item) => EventAlbum.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const <EventAlbum>[],
      pagination: Pagination.fromJson(
        data['pagination'] is Map
            ? Map<String, dynamic>.from(data['pagination'] as Map)
            : const {},
      ),
    );
  }

  /// تفاصيل الألبوم: صوره المرقَّمة، وفيديوهاته (`videos`) — صفحةٌ كاملة لا
  /// مرقَّمة، فلا هي تُكرَّر مع `page` التالي ولا تختفي في «عرض المزيد».
  Future<({
    EventAlbum album,
    List<EventPhoto> photos,
    List<EventVideo> videos,
    Pagination pagination
  })> albumDetails(int id, {int page = 1, int limit = 24, String? search}) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};
    if (search != null && search.trim().isNotEmpty) query['search'] = search.trim();
    final data = await _client.get('/api/albums/$id', query: query);
    final photos = data['photos'];
    final videos = data['videos'];
    return (
      album: EventAlbum.fromJson(
        data['album'] is Map ? Map<String, dynamic>.from(data['album'] as Map) : const {},
      ),
      photos: photos is List
          ? photos
              .whereType<Map>()
              .map((item) => EventPhoto.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const <EventPhoto>[],
      // خادمٌ لم يُحدَّث بعد: المفتاح غائب ⇒ ألبومٌ بلا فيديوهات، لا انهيار.
      videos: videos is List
          ? videos
              .whereType<Map>()
              .map((item) => EventVideo.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const <EventVideo>[],
      pagination: Pagination.fromJson(
        data['pagination'] is Map
            ? Map<String, dynamic>.from(data['pagination'] as Map)
            : const {},
      ),
    );
  }

  /// صورة واحدة بمعرّفها — للرابط العميق `/p/<id>` (تذكرة #104). مسار عام،
  /// فلا رمز يُرسل. يرمي إن لم تكن الصورة ظاهرة، فيُقال للمستخدم بالعربية.
  Future<EventPhoto> photo(int id) async {
    final data = await _client.get('/api/photos/$id');
    final raw = data['photo'];
    if (raw is! Map) {
      throw Exception('الصورة غير موجودة');
    }
    return EventPhoto.fromJson(Map<String, dynamic>.from(raw));
  }

  /// شخصٌ واحد بصفحته (ADR-0011، تذكرة #106) — صوره ومناسباته معاً.
  Future<Person> person(int id, {int page = 1, int limit = 48}) async {
    final data = await _client.get(
      '/api/people/$id',
      query: {'page': '$page', 'limit': '$limit'},
    );
    final raw = data['person'];
    if (raw is! Map) {
      throw Exception('الشخص غير موجود');
    }
    return Person.fromJson(Map<String, dynamic>.from(raw));
  }

  Future<({List<EventPhoto> photos, Pagination pagination})> photos({
    String? search,
    int? albumId,
    String? person,
    int page = 1,
    int limit = 24,
  }) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};
    if (search != null && search.trim().isNotEmpty) query['search'] = search.trim();
    if (albumId != null) query['album_id'] = '$albumId';
    if (person != null && person.trim().isNotEmpty) query['person'] = person.trim();
    final data = await _client.get('/api/photos', query: query);
    final list = data['photos'];
    return (
      photos: list is List
          ? list
              .whereType<Map>()
              .map((item) => EventPhoto.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const <EventPhoto>[],
      pagination: Pagination.fromJson(
        data['pagination'] is Map
            ? Map<String, dynamic>.from(data['pagination'] as Map)
            : const {},
      ),
    );
  }

  Future<AlbumSearchResults> searchAlbums(String query) async {
    final data = await _client.get('/api/search', query: {'q': query.trim()});
    return AlbumSearchResults.fromJson(data);
  }

  Future<({List<EventPhoto> photos, Pagination pagination})> myPhotos({
    int page = 1,
    int limit = 24,
  }) async {
    final data = await _client.get(
      '/api/my-photos',
      query: {'page': '$page', 'limit': '$limit'},
      auth: true,
    );
    final list = data['photos'];
    return (
      photos: list is List
          ? list
              .whereType<Map>()
              .map((item) => EventPhoto.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const <EventPhoto>[],
      pagination: Pagination.fromJson(
        data['pagination'] is Map
            ? Map<String, dynamic>.from(data['pagination'] as Map)
            : const {},
      ),
    );
  }

  /// طلب وسم النفس في صورة. الخادم يفرض شرطين قبل قبوله: صورة شخصية مرفوعة
  /// على الحساب، و`confirm_phone` صريحاً — ولذلك الافتراضي `false` هنا، فلا
  /// يُرسَل تأكيد لم يفعله المستخدم.
  /// النصّان اختياريان ويُرسَلان دائماً (فارغين ⇒ يخزّنهما الخادم NULL).
  Future<void> tagPhoto(
    int photoId, {
    String? selfDescription,
    String? captionSuggestion,
    bool confirmPhone = false,
  }) async {
    await _client.post(
      '/api/photos/$photoId/tags',
      auth: true,
      body: {
        'self_description': selfDescription ?? '',
        'caption_suggestion': captionSuggestion ?? '',
        'confirm_phone': confirmPhone,
      },
    );
  }

  Future<void> withdrawPhotoTag(int photoId) async {
    await _client.delete('/api/photos/$photoId/tags/me', auth: true);
  }

  Future<void> reportPhoto(int photoId, {String reason = 'privacy', String? note}) async {
    await _client.post(
      '/api/photos/$photoId/reports',
      auth: true,
      body: {'reason': reason, if (note != null && note.trim().isNotEmpty) 'note': note.trim()},
    );
  }

  Future<void> react(int eventId, String type, String identifier) async {
    await _client.post(
      '/api/events/$eventId/react',
      body: {'reaction_type': type, 'user_identifier': identifier},
    );
  }

  /// الهوية تُبنى من الحساب على الخادم — لا اسم ولا شارة يُرسَلان من العميل.
  Future<Congratulation> congratulate(int eventId, {required String message}) async {
    final data = await _client.post(
      '/api/events/$eventId/congratulate',
      auth: true,
      body: {'message': message},
    );
    final comment = data['comment'];
    if (comment is! Map<String, dynamic>) {
      throw const ApiException('تعذّر حفظ التبريكة');
    }
    return Congratulation.fromJson(comment);
  }

  /// «ذكّرني» بصيغته الظاهرة في التطبيق: «قائمتي». متابعة، لا حضور ولا
  /// «لن أحضر» — زرّ واحد، لا زرّان. يتطلب حساباً.
  Future<void> remind(int eventId) async {
    await _client.post('/api/events/$eventId/remind', auth: true);
  }

  Future<void> unremind(int eventId) async {
    await _client.delete('/api/events/$eventId/remind', auth: true);
  }

  /// «جاي / مش جاي» بحساب (تذكرة #168): جواب واحد لكل حساب على المناسبة —
  /// الثاني يُحدّث الأول على الخادم لا يُضيف ثانياً. و`yes` يُنشئ «ذكّرني» إن
  /// غاب، و`no` لا يمسّه. النوع المطفأ والمناسبة غير المعتمدة 404.
  /// يعيد حالة الحضور والتذكير من ردّ PUT نفسه، والعدّادات إن سمح بها النوع.
  Future<EventRsvpState> setRsvp(
    int eventId, {
    required bool going,
    int partySize = 1,
  }) async {
    final data = await _client.put(
      '/api/events/$eventId/rsvp',
      auth: true,
      body: {
        'response': going ? 'yes' : 'no',
        'party_size': partySize,
      },
    );
    final rsvp = data['my_rsvp'];
    return (
      myRsvp: rsvp is Map<String, dynamic> ? EventRsvp.fromJson(rsvp) : null,
      goingCount: int.tryParse('${data['rsvp_going_count']}'),
      isReminded: data['is_reminded'] == true,
      followersCount: int.tryParse('${data['followers_count']}'),
    );
  }

  /// سحب الجواب — لا يمسّ «ذكّرني». 404 لنوع مطفأ، كالإجابة نفسها.
  Future<void> withdrawRsvp(int eventId) async {
    await _client.delete('/api/events/$eventId/rsvp', auth: true);
  }

  /// «مين جاي» — لصاحب المناسبة أو أدمن في نطاقه وحدهما؛ 404 لغيرهما.
  /// الأسماء والعدد والجواب والمصدر والمجاميع، **بلا هاتف** (الخادم لا يرسله).
  Future<EventRsvpList> eventRsvps(int eventId) async {
    final data = await _client.get('/api/events/$eventId/rsvps', auth: true);
    return EventRsvpList.fromJson(data);
  }

  /// دعوات المناسبة الشخصية (تذكرة #183) — الاسم والتوكِن والرابط المطلق
  /// وحالة الفتح والجواب، لصاحب المناسبة أو أدمن في نطاقه؛ 404 لغيرهما.
  /// والهاتف لا يصل هنا أصلاً.
  Future<EventInviteList> eventInvites(int eventId) async {
    final data = await _client.get('/api/events/$eventId/invites', auth: true);
    return EventInviteList.fromJson(data);
  }

  /// إنشاء دعوة لكل اسم في [names] — الخادم يعيد صفوفها مع روابطها الجاهزة.
  /// والسقف والتحقّق من كل اسم على الخادم وحده (رسالته عربية)، فلا رقم مكرَّر
  /// هنا يفترق عنه يوماً.
  Future<List<EventInvite>> createEventInvites(
    int eventId,
    List<String> names,
  ) async {
    final data = await _client.post(
      '/api/events/$eventId/invites',
      auth: true,
      body: {'names': names},
    );
    final raw = data['invites'];
    if (raw is! List) return const <EventInvite>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(EventInvite.fromJson)
        .toList();
  }

  /// حذف دعوة — والجواب الذي جمعته يبقى على الخادم (`ON DELETE SET NULL`).
  Future<void> deleteEventInvite(int eventId, int inviteId) async {
    await _client.delete(
      '/api/events/$eventId/invites/$inviteId',
      auth: true,
    );
  }

  /// «قائمتي» — كل مناسبة معتمدة يتابعها المستخدم: القادم أولاً ثم المنتهي
  /// حديثاً، بترتيب الخادم النهائي. `bucket` و`span_*` و`days_until_start`
  /// تُقرأ كما وصلت — لا إعادة ترتيب ولا إعادة اشتقاق على الجهاز.
  Future<MyList> myList() async {
    final data = await _client.get('/api/my-reminders', auth: true);
    return MyList.fromJson(data);
  }

  /// كتم/تفعيل جرس مناسبة في «قائمتي» — الصفّ يبقى في القائمة. الكتم يغيّر
  /// مخرجات `/api/reminders/schedule` على الخادم، فالمستدعي يعيد مزامنة
  /// المنبّهات المحلية بعده: `services.reminders.syncAll()`.
  Future<void> setReminderNotify(int eventId, bool notify) async {
    await _client.patch(
      '/api/events/$eventId/remind',
      auth: true,
      body: {'notify': notify},
    );
  }

  /// «نظّف المنتهية» — يحذف المناسبات المنتهية وحدها من قائمة المستخدم؛
  /// `scope=ended` إلزامي على الخادم. يعيد عدد الصفوف المحذوفة ورسالة الخادم
  /// كما وصلت (تُعرض بلا إعادة صياغة في العميل).
  Future<({int removed, String message})> clearEndedReminders() async {
    final data = await _client.delete(
      '/api/my-reminders',
      query: {'scope': 'ended'},
      auth: true,
    );
    return (
      removed: int.tryParse('${data['removed'] ?? ''}') ?? 0,
      message: '${data['message'] ?? 'تم حذف المناسبات المنتهية من قائمتك'}',
    );
  }

  /// طابور مراجعة رسائل مناسبة — للمالك أو الإدارة فقط (403 لغيرهم).
  Future<List<Congratulation>> moderationQueue(int eventId, {String? status}) async {
    final query = status == null ? null : {'status': status};
    final data = await _client.get(
      '/api/events/$eventId/congratulations',
      query: query,
      auth: true,
    );
    final list = data['comments'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(Congratulation.fromJson).toList();
  }

  Future<Congratulation> moderateCongratulation(
    int eventId,
    int congratulationId, {
    required bool approve,
  }) async {
    final data = await _client.patch(
      '/api/events/$eventId/congratulations/$congratulationId',
      auth: true,
      body: {'action': approve ? 'approve' : 'reject'},
    );
    final comment = data['comment'];
    if (comment is! Map<String, dynamic>) {
      throw const ApiException('تعذّر تحديث حالة التبريكة');
    }
    return Congratulation.fromJson(comment);
  }

  Future<void> deleteCongratulation(int eventId, int congratulationId) async {
    await _client.delete(
      '/api/events/$eventId/congratulations/$congratulationId',
      auth: true,
    );
  }

  /// إبلاغ عن رسالة — صف واحد لكل مستخدم؛ التكرار يعيد 409 برسالة عربية من الخادم.
  Future<void> reportCongratulation(int eventId, int congratulationId) async {
    await _client.post(
      '/api/events/$eventId/congratulations/$congratulationId/report',
      auth: true,
    );
  }

  // --- الإشعارات (يتطلب تسجيل دخول) ---------------------------------

  Future<List<AppNotification>> notifications() async {
    final data = await _client.get('/api/notifications', auth: true);
    final list = data['notifications'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<void> markNotificationRead(int id) async {
    await _client.patch('/api/notifications/$id/read', auth: true);
  }

  Future<void> deleteNotification(int id) async {
    await _client.delete('/api/notifications/$id', auth: true);
  }

  /// «جعل الكل مقروء» — الشخصية والتعاميم معاً، بلا حذف أي سطر.
  Future<void> markAllNotificationsRead() async {
    await _client.post('/api/notifications/read-all', auth: true);
  }

  Future<void> clearAllNotifications() async {
    await _client.post('/api/notifications/clear-all', auth: true);
  }

  /// إغلاق تعميم من مركز الإشعارات — مسار مختلف عن تعليم إشعار شخصي مقروءاً؛
  /// لا `id` لتعميم في القائمة المدموجة، بل `broadcast_id` وحده.
  Future<void> dismissBroadcast(int broadcastId) async {
    await _client.patch('/api/broadcasts/$broadcastId/dismiss', auth: true);
  }

  /// تفضيل «إشعارات المناسبات الجديدة» وحده — التذكيرات وما يخصّ مناسبات
  /// المستخدم تصله دائماً ولا تفضيل لها.
  Future<bool> getNotifyNewEvents() async {
    final data = await _client.get('/api/notifications/preferences', auth: true);
    final prefs = data['preferences'];
    return prefs is Map && prefs['notify_new_events'] == true;
  }

  /// يعيد القيمة المحفوظة فعلاً على الخادم، لا القيمة المُرسَلة.
  Future<bool> setNotifyNewEvents(bool value) async {
    final data = await _client.patch(
      '/api/notifications/preferences',
      auth: true,
      body: {'notify_new_events': value},
    );
    final prefs = data['preferences'];
    return prefs is Map ? prefs['notify_new_events'] == true : value;
  }

  /// مواعيد إطلاق المنبّه المحلي المتبقّية لكل مناسبة يتابعها المستخدم —
  /// الخادم يحسبها كاملة (jerusalemTime.js)، والعميل لا يعيد اشتقاقها.
  Future<List<ReminderScheduleEntry>> remindersSchedule() async {
    final data = await _client.get('/api/reminders/schedule', auth: true);
    final list = data['schedule'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(ReminderScheduleEntry.fromJson)
        .toList();
  }

  /// فحص تعارض التاريخ قبل تقديم المناسبة.
  Future<List<Event>> checkCollision({
    required String date,
    String? town,
  }) async {
    final data = await _client.post(
      '/api/check-collision',
      body: {'date': date, 'town': ?town},
    );
    final list = data['conflicts'];
    if (list is! List) return const [];
    return list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList();
  }

  /// تقديم مناسبة. تدخل قائمة المراجعة ما لم يكن المُرسِل مديراً. تتطلب حساباً
  /// (`events.created_by`) — `honorees` تُرسَل بصيغة الأقواس (`honorees[i][name]`)
  /// التي يفهمها الخادم حصراً، وكذلك `extraDays` (`extra_days[i][name]`)؛ صفّ
  /// أيامٍ فرغت حقوله الأربعة يُتخطّى كما يُتخطّى صاحب مناسبة بلا اسم، والقيم
  /// الاختيارية (المكان/الوقت) لا تُرسَل فراغها. مدير يوشك أن ينشر فوراً مناسبة
  /// تشبه قائمة يتلقّى [PossibleDuplicateException] (409، بلا صف)؛
  /// [confirmDuplicate] يعيد الإرسال ليُنشر رغم ذلك.
  Future<EventSubmissionResult> submitEvent({
    required int occasionTypeId,
    required List<Map<String, String>> honorees,
    required Map<String, String> fields,
    List<Map<String, String>> extraDays = const [],
    http.MultipartFile? poster,
    http.MultipartFile? audio,
    http.MultipartFile? artistImage,
    bool confirmDuplicate = false,
  }) async {
    final allFields = <String, String>{
      'occasion_type_id': '$occasionTypeId',
      ...fields,
      if (confirmDuplicate) 'confirm_duplicate': '1',
    };

    var index = 0;
    for (final honoree in honorees) {
      final name = honoree['name']?.trim() ?? '';
      if (name.isEmpty) continue;
      allFields['honorees[$index][name]'] = name;
      final role = honoree['role']?.trim();
      if (role != null && role.isNotEmpty) {
        allFields['honorees[$index][role]'] = role;
      }
      index++;
    }

    var dayIndex = 0;
    for (final day in extraDays) {
      final name = day['name']?.trim() ?? '';
      final date = day['date']?.trim() ?? '';
      final place = day['place']?.trim() ?? '';
      final time = day['time']?.trim() ?? '';
      // صفّ فارغ تماماً «خانة اختيارية لم تُملأ» — لا يُرسَل إطلاقاً.
      if (name.isEmpty && date.isEmpty && place.isEmpty && time.isEmpty) continue;
      allFields['extra_days[$dayIndex][name]'] = name;
      allFields['extra_days[$dayIndex][date]'] = date;
      if (place.isNotEmpty) allFields['extra_days[$dayIndex][place]'] = place;
      if (time.isNotEmpty) allFields['extra_days[$dayIndex][time]'] = time;
      dayIndex++;
    }

    final data = await _client.postMultipart(
      '/api/events',
      fields: allFields,
      files: [?poster, ?audio, ?artistImage],
      auth: true,
    );
    final message = data['message'];
    final rawWarning = data['location_warning'];
    String? locationWarning;
    if (rawWarning is Map<String, dynamic>) {
      final text = rawWarning['message'];
      if (text is String && text.isNotEmpty) locationWarning = text;
    }
    final rawEventId = data['eventId'];
    final int? eventId = rawEventId is int
        ? rawEventId
        : int.tryParse('${rawEventId ?? ''}');
    return EventSubmissionResult(
      message: message is String ? message : 'تم استلام طلب المناسبة بنجاح',
      locationWarning: locationWarning,
      eventId: eventId,
      status: '${data['status'] ?? ''}',
    );
  }

  // --- مناسباتي ------------------------------------------------------

  /// كل ما نشره المستخدم الحالي، بكل حالاته وبلا حدّ «القادم فقط» — شاشة
  /// المالك تعرض تاريخه كاملاً، لا شهره القادم.
  Future<List<Event>> myEvents() async {
    final data = await _client.get('/api/my-events', auth: true);
    final list = data['events'];
    return list is List
        ? list.whereType<Map<String, dynamic>>().map(Event.fromJson).toList()
        : <Event>[];
  }

  /// تعديل مناسبة يملكها المستخدم (أو أي مناسبة للإدارة). `fields` يحمل فقط
  /// المفاتيح التي تغيّرت فعلاً — مفتاح غائب يعني «بلا تعديل عليه» عند الخادم،
  /// لا قيمة فارغة. التصنيف (`amendment`) والحالة الجديدة (`status`) من الردّ
  /// وحده؛ لا يُعاد بناؤهما هنا.
  ///
  /// `confirmDuplicate` يعيد الإرسال بعد 409 «تكرار محتمل» — نفس ما يفعله
  /// `submitEvent` عند النشر (تذكرة #159): الأدمن وحده يُوقَف بهذا الـ409،
  /// والخادم يسجّل التجاوز.
  Future<EventUpdateResult> updateEvent(
    int eventId, {
    required Map<String, dynamic> fields,
    bool confirmDuplicate = false,
  }) async {
    final data = await _client.patch(
      '/api/events/$eventId',
      auth: true,
      body: confirmDuplicate ? {...fields, 'confirm_duplicate': true} : fields,
    );
    return _eventUpdateResult(data);
  }

  /// رفع ملصق «البطاقة الجاهزة» **وحده** — `PATCH /api/events/:id` متعدد
  /// الأجزاء، بحقل `poster` الذي يتوقّعه `eventMedia` في الخادم
  /// (`events.routes.js`). لا تُرسل معه حقول JSON: `honorees`/`extra_days`
  /// مصفوفات في جسم JSON، وتحويلها إلى حقول نصّية يفقدها؛ ورفع الملصق تعديل
  /// مستقلّ عن حفظ النموذج، فلا يمسّ `updateEvent` العادي ولا سلوكه.
  ///
  /// الصورة تُقصّ ٤:٥ في العميل قبل النداء (نفس `cropPosterImage`)، وتُرسل
  /// `application/octet-stream` كبقية ملفات التطبيق؛ الخادم يفحص بايتاتها
  /// (`verifyMedia`) قبل أن يخزّنها.
  Future<EventUpdateResult> updateEventPoster(
    int eventId, {
    required http.MultipartFile poster,
  }) async {
    final data = await _client.patchMultipart(
      '/api/events/$eventId',
      fields: const {},
      files: [poster],
      auth: true,
    );
    return _eventUpdateResult(data);
  }

  /// بناء [EventUpdateResult] من ردّ PATCH واحد — تعديل الحقول ورفع الملصق
  /// يقرآن الرسالة العربية نفسها، ولا يعيد العميل تصنيف `amendment`.
  static EventUpdateResult _eventUpdateResult(Map<String, dynamic> data) {
    final message = data['message'];
    final rawWarning = data['location_warning'];
    String? locationWarning;
    if (rawWarning is Map<String, dynamic>) {
      final text = rawWarning['message'];
      if (text is String && text.isNotEmpty) locationWarning = text;
    }
    return EventUpdateResult(
      message: message is String ? message : 'تم حفظ التعديل',
      amendment: '${data['amendment'] ?? 'cosmetic'}',
      status: '${data['status'] ?? ''}',
      locationWarning: locationWarning,
    );
  }

  /// سجلّ تعديلات مناسبة، الأحدث أولاً — للمالك أو الإدارة.
  Future<List<Amendment>> eventAmendments(int eventId) async {
    final data = await _client.get('/api/events/$eventId/amendments', auth: true);
    final list = data['amendments'];
    return list is List
        ? list.whereType<Map<String, dynamic>>().map(Amendment.fromJson).toList()
        : <Amendment>[];
  }

  // --- ستوديو بطاقة الدعوة (#181، فوق مسارات #180) ---------------------

  /// كتالوج الستوديو: القوالب والمقاسات والخطوط — `GET /api/card-templates`،
  /// **عام بلا رمز**: يُعرض قبل تسجيل الدخول، ولا شيء فيه يخصّ مناسبة.
  ///
  /// [tone] (`solemn`/`festive`) يمرَّر استعلاماً فيقصّ الخادم النصف الآخر
  /// قبل إرساله — نفس `templatesForTone` التي يفرضها في كل كتابة. والشاشة
  /// تُرشّح بـ[CardStudioCatalog.templatesForTone] مرة ثانية بعد الوصول: النبرة
  /// بوابة عرض لا اختصار شبكة، فطلبٌ بلا `?tone=` (أو خادم يتجاهله) لا يجوز
  /// أن يُظهر قالب عزاء لمناسبة فرح ولا العكس.
  Future<CardStudioCatalog> cardStudioCatalog({String? tone}) async {
    final data = await _client.get(
      '/api/card-templates',
      query: tone == null ? null : {'tone': tone},
    );
    return CardStudioCatalog.fromJson(data);
  }

  /// بطاقات هذه المناسبة كما هي محفوظة، الأساسية أولاً — لصاحبها أو للإدارة
  /// وحدهم: غير المالك يردّ الخادم عليه 404 (لا 403)، فالمسار `auth: true`.
  /// والقائمة فارغة تعني «لم تُصمَّم بطاقة بعد» لا خطأً.
  Future<List<EventCardItem>> eventCards(int eventId) async {
    final data = await _client.get('/api/events/$eventId/cards', auth: true);
    final list = data['cards'];
    if (list is! List) return const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(EventCardItem.fromJson)
        .toList();
  }

  /// معاينة البطاقة — `POST /api/events/:id/cards/preview`، **بايتات PNG**
  /// مصغّرة بلا تخزين على الخادم (لا صفّ ولا ملف)، فتصير `Image.memory`.
  ///
  /// [photoSource] واحد من `event` (ملصق المناسبة) أو `upload` (ملف [photo]
  /// نفسه) أو `none`. ملفٌ مرفوع يجعل المصدر `upload` بقرار هذه الدالة لا
  /// بقرار الشاشة: إرسال `event` مع صورة اختارها المستخدم الآن رسمٌ خاطئ.
  ///
  /// الأخطاء العربية (400 قالب/مقاس/لون، 429 «حاول بعد قليل») تصل كما هي في
  /// `ApiException` من `ApiClient.postMultipartBytes` — لا تُستبدل هنا.
  Future<Uint8List> previewEventCard(
    int eventId, {
    required String templateKey,
    required String size,
    required String fontKey,
    required String color,
    String photoSource = 'event',
    http.MultipartFile? photo,
  }) {
    return _client.postMultipartBytes(
      '/api/events/$eventId/cards/preview',
      fields: _cardDesignFields(
        templateKey: templateKey,
        size: size,
        fontKey: fontKey,
        color: color,
        photoSource: photoSource,
        hasPhoto: photo != null,
      ),
      files: [?photo],
      auth: true,
      fallbackMessage: 'تعذّرت معاينة البطاقة — حاول مرة أخرى',
    );
  }

  /// حفظ البطاقة — `POST /api/events/:id/cards`: يرسم الخادم بالمقاس الكامل
  /// ويخزّن الصورة ويجعلها **الأساسية** للمناسبة (فتصير `og:image` لرابطها).
  /// الرسالة العربية من الخادم تُعرض كما وصلت.
  Future<CardSaveResult> saveEventCard(
    int eventId, {
    required String templateKey,
    required String size,
    required String fontKey,
    required String color,
    String photoSource = 'event',
    http.MultipartFile? photo,
  }) async {
    final data = await _client.postMultipart(
      '/api/events/$eventId/cards',
      fields: _cardDesignFields(
        templateKey: templateKey,
        size: size,
        fontKey: fontKey,
        color: color,
        photoSource: photoSource,
        hasPhoto: photo != null,
      ),
      files: [?photo],
      auth: true,
    );
    return CardSaveResult.fromJson(data);
  }

  /// تعيين بطاقة محفوظة أساسيةً — `PATCH /api/events/:id/cards/:cardId`.
  /// بطاقة أساسية واحدة على الأكثر: الخادم يُصفّر البقية في المعاملة نفسها.
  Future<CardSaveResult> setPrimaryEventCard(int eventId, int cardId) async {
    final data = await _client.patch(
      '/api/events/$eventId/cards/$cardId',
      auth: true,
    );
    return CardSaveResult.fromJson(data);
  }

  /// حذف بطاقة محفوظة — `DELETE /api/events/:id/cards/:cardId`. حذف الأساسية
  /// لا يُرقّي غيرها: تعود `og:image` إلى بطاقة الخادم المولَّدة، والرسالة
  /// العربية من الخادم هي ما يُعرض.
  Future<String> deleteEventCard(int eventId, int cardId) async {
    final data = await _client.delete(
      '/api/events/$eventId/cards/$cardId',
      auth: true,
    );
    final message = data['message'];
    return message is String && message.isNotEmpty ? message : 'حُذفت البطاقة';
  }

  /// حقول التصميم المشتركة بين المعاينة والحفظ — عقد واحد لا نسختان.
  static Map<String, String> _cardDesignFields({
    required String templateKey,
    required String size,
    required String fontKey,
    required String color,
    required String photoSource,
    required bool hasPhoto,
  }) {
    return {
      'template_key': templateKey,
      'size': size,
      'font_key': fontKey,
      'color': color,
      // الويب يفعل هذا حرفياً: ملفٌ مرفوع يعني `upload` مهما اختار المستخدم
      // قبله، وإلا وصل الخادمَ مصدرٌ لا يطابق الملف المرفق.
      'photo_source': hasPhoto ? 'upload' : photoSource,
    };
  }

  // --- الحساب ------------------------------------------------------

  Future<({String token, AppUser user})> login(
    String phone,
    String pin,
  ) async {
    final data = await _client.post(
      '/api/auth/login',
      body: {'phone_number': phone, 'pin_code': pin},
    );
    return _authResult(data);
  }

  Future<({String token, AppUser user})> register({
    required String phone,
    required String fullName,
    required String pin,
    String? clanTown,
  }) async {
    final data = await _client.post(
      '/api/auth/register',
      body: {
        'phone_number': phone,
        'full_name': fullName,
        'pin_code': pin,
        if (clanTown != null && clanTown.isNotEmpty) 'clan_town': clanTown,
      },
    );
    return _authResult(data);
  }

  /// `token` يصل فقط لمستخدم عادي (رمز مجدَّد) — غيابه يعني «أبقِ رمزك الحالي».
  Future<({AppUser user, String? token})> me() async {
    final data = await _client.get('/api/auth/me', auth: true);
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات الحساب');
    }
    final token = data['token'];
    return (
      user: AppUser.fromJson(user),
      token: token is String && token.isNotEmpty ? token : null,
    );
  }

  /// الصورة الشخصية للحساب — multipart بالحقل `image`، كما في كل رفع صورة هنا.
  /// الخادم هو من يخزّن الملف ويبني `avatar_url` المطلق، فالردّ يحمل المستخدم
  /// المحدَّث كاملاً لا الرابط وحده.
  Future<AppUser> uploadAvatar(File image) async {
    final data = await _client.postMultipart(
      '/api/auth/me/avatar',
      fields: const {},
      files: [await http.MultipartFile.fromPath('image', image.path)],
      auth: true,
    );
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات الحساب');
    }
    return AppUser.fromJson(user);
  }

  /// تعديل الاسم والبلدة — `PATCH /api/auth/me`. الحقل الغائب يعني «بلا تعديل
  /// عليه» عند الخادم، والحقل الفارغ يرفضه صراحةً، فلا يُرسَل إلا ما له قيمة.
  /// عدد الهاتف ليس هنا عمداً: هو اسم الدخول، وله [changePhone] برمز تأكيد.
  Future<AppUser> updateProfile({String? fullName, String? clanTown}) async {
    final body = <String, dynamic>{
      if (fullName != null && fullName.isNotEmpty) 'full_name': fullName,
      if (clanTown != null && clanTown.isNotEmpty) 'clan_town': clanTown,
    };
    final data = await _client.patch('/api/auth/me', body: body, auth: true);
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات الحساب');
    }
    return AppUser.fromJson(user);
  }

  /// محافظة الحساب — `PATCH /api/auth/me` بحقل `region_id` وحده (تذكرة #125).
  /// الويب لا يكتبها على الحساب (اختياره محلي في `localStorage` وحده)، أما
  /// التطبيق فيحفظها في المكانين: الجهاز أولاً، ثم الحساب.
  ///
  /// الحقل منفصل عن [updateProfile] عمداً: إرسال الاسم والبلدة معه كان
  /// يُعيد كتابة ما لم يغيّره المستخدم. الخادم يرفض (400 برسالة عربية)
  /// معرّفاً غير نشط، والردّ يحمل المستخدم المحدَّث كاملاً لا المعرّف وحده.
  Future<AppUser> setRegion(int regionId) async {
    final data = await _client.patch(
      '/api/auth/me',
      body: {'region_id': regionId},
      auth: true,
    );
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات الحساب');
    }
    return AppUser.fromJson(user);
  }

  /// تغيير رقم الدخول نفسه — يتطلّب رمز الدخول الحالي، ويردّ رمزاً جديداً موقَّعاً
  /// بالرقم الجديد كي لا يُخرِج المستخدمَ تغييرُه هو. رمز خاطئ يردّ 400 لا 401،
  /// فالجلسة تبقى قائمة والرسالة تظهر للحوار المفتوح.
  Future<({AppUser user, String token})> changePhone({
    required String phoneNumber,
    required String pinCode,
  }) async {
    final data = await _client.patch(
      '/api/auth/me/phone',
      body: {'phone_number': phoneNumber, 'pin_code': pinCode},
      auth: true,
    );
    final user = data['user'];
    final token = data['token'];
    if (user is! Map<String, dynamic> || token is! String || token.isEmpty) {
      throw const ApiException('تعذّر تحديث رقمك — حاول مرة أخرى');
    }
    return (user: AppUser.fromJson(user), token: token);
  }

  /// حذف الحساب نهائياً — `DELETE /api/account` (سياسة Google Play: الحذف من
  /// داخل التطبيق لا بريد إلى الدعم).
  ///
  /// رمز الدخول يُعاد إرساله كتأكيد هوية، فجلسة مفتوحة على جهاز غير صاحبه لا
  /// تكفي لحذف الحساب؛ رمز خاطئ يردّ 401 برسالة عربية يراها المستخدم كما هي.
  ///
  /// `reportUnauthorized: false` لأن 401 هنا معناه «رمز خاطئ» لا «جلسة منتهية»:
  /// إبلاغ `AuthStore` به كان يُخرج المستخدم ويستبدل رسالة الخادم برسالة
  /// انتهاء الجلسة، فيخرج من الشاشة بدل أن يقرأ خطأه ويصحّحه.
  ///
  /// **لا شيء يُمسح من التخزين المحلي هنا** — الرمز والمستخدم المحفوظان مسؤولية
  /// الشاشة بعد نجاح النداء (`auth.signOut()`)، فهذه الطبقة لا تعرف مخزن الجلسة.
  Future<void> deleteAccount({required String pinCode}) async {
    final data = await _client.delete(
      '/api/account',
      auth: true,
      body: {'pin_code': pinCode},
      reportUnauthorized: false,
    );
    // الرمز والرسالة يأتيان من الخادم؛ البديل هنا لردّ ناقص لا لخطأ معلَن —
    // `ApiClient` يرمي أصلاً بأي حالة 4xx/5xx أو `success: false`.
    if (data['success'] != true) {
      final message = data['message'];
      throw ApiException(
        message is String && message.isNotEmpty
            ? message
            : 'تعذّر حذف الحساب، حاول مرة أخرى',
      );
    }
  }

  ({String token, AppUser user}) _authResult(Map<String, dynamic> data) {
    final token = data['token'];
    final user = data['user'];
    if (token is! String || user is! Map<String, dynamic>) {
      throw const ApiException('استجابة تسجيل دخول غير مكتملة');
    }
    return (token: token, user: AppUser.fromJson(user));
  }

  // --- الخصوصية: إحصاءات الاستخدام ----------------------------------

  /// رفض إحصاءات الاستخدام أو التراجع عنه — `PATCH /api/auth/me` بالحقل
  /// `analytics_opt_out` وحده، فالاسم والبلدة لهما [updateProfile] ولا يُعاد
  /// إرسالهما هنا كي لا يُكتب ما لم يغيّره المستخدم. ردّ الخادم يحمل المستخدم
  /// كاملاً، فالشاشة تبدّل المحفوظ منه بلا قراءة أخرى.
  Future<AppUser> setAnalyticsOptOut(bool value) async {
    final data = await _client.patch(
      '/api/auth/me',
      body: {'analytics_opt_out': value},
      auth: true,
    );
    final user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw const ApiException('تعذّر قراءة بيانات الحساب');
    }
    return AppUser.fromJson(user);
  }

  /// حذف فوري لبيانات الإحصاءات الخاصة بصاحب الجلسة — `POST
  /// /api/privacy/analytics-erasure`. لا جسم: الهوية في الرمز وحده، ولا شيء في
  /// الطلب يستطيع تسمية مستخدم آخر على الخادم.
  ///
  /// يعيد رسالة الخادم العربية كما هي لتعرضها الشاشة — نصّ الحذف في الخادم
  /// وحده (نفس نصّ الويب)، فلا نسخة ثانية منه هنا. وأخطاء 4xx/5xx ترميها
  /// `ApiClient` كـ[ApiException] قبل أن تصل، كما في كل دوال الملف.
  Future<String> eraseAnalytics() async {
    final data = await _client.post('/api/privacy/analytics-erasure', auth: true);
    final message = data['message'];
    return message is String && message.isNotEmpty
        ? message
        : 'تم حذف بيانات التحليلات السلوكية الخاصة بك';
  }

  // --- دفتر النقوط (يتطلب تسجيل دخول) -------------------------------

  Future<NokootLedger> nokoot() async {
    final data = await _client.get('/api/nokoot', auth: true);
    return NokootLedger.fromJson(data);
  }

  Future<void> addNokoot({
    required String recipientName,
    required double amount,
    required String eventDate,
    String? clanTown,
    String? occasionType,
    String? notes,
  }) async {
    await _client.post(
      '/api/nokoot',
      auth: true,
      body: {
        'recipient_name': recipientName,
        'amount': amount,
        'event_date': eventDate,
        if (clanTown != null && clanTown.isNotEmpty) 'clan_town': clanTown,
        if (occasionType != null && occasionType.isNotEmpty)
          'occasion_type': occasionType,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
    );
  }

  Future<void> deleteNokoot(int id) async {
    await _client.delete('/api/nokoot/$id', auth: true);
  }

  // --- تحديثات التطبيق ----------------------------------------------

  /// النسخة المنشورة كما يعلنها الخادم. المقارنة تجري في العميل.
  Future<AppRelease> appRelease() async {
    final data = await _client.get('/api/app/version');
    return AppRelease.fromJson(data);
  }

  /// رقم واتساب الدعم الفني من GET /api/settings/public.
  Future<String?> getSupportWhatsappNumber() async {
    try {
      final data = await _client.get('/api/settings/public');
      final settings = data['settings'];
      if (settings is Map<String, dynamic>) {
        final number = settings['support_whatsapp_number'];
        if (number is String && number.trim().isNotEmpty) {
          return number.trim();
        }
      }
    } catch (_) {}
    return null;
  }

  /// المقطع الصوتي الافتراضي للمناسبات من GET /api/settings/public — رابط
  /// مطلق أو null. صامت عند الفشل كرقم الدعم: التطبيق يعمل بدونه.
  Future<String?> getDefaultEventAudioUrl() async {
    try {
      final data = await _client.get('/api/settings/public');
      final settings = data['settings'];
      if (settings is Map<String, dynamic>) {
        final url = settings['default_event_audio_url'];
        if (url is String && url.trim().isNotEmpty) return url.trim();
      }
    } catch (_) {}
    return null;
  }

  /// شكل عرض مزوّدي «خدمات الأعراس» من GET /api/settings/public (تذكرة #158):
  /// `compact` صفوف مختصرة أو `cards` كروت كبيرة.
  ///
  /// الخادم وحده يحسم الغياب والقيمة غير المعروفة إلى `compact`
  /// (`RESOLVED_KEYS` في settings.service.js)، وهذا العميل لا يكرّر ذلك
  /// الافتراض: ما لم يصل شيء — انقطاع أو خادم أقدم — يعود `null`، فيترك
  /// الشكل كما هو (الصفوف المختصرة أول مرة) بلا قيمة ثانية تُكتب هنا.
  Future<String?> providersDisplayMode() async {
    try {
      final data = await _client.get('/api/settings/public');
      final settings = data['settings'];
      if (settings is Map<String, dynamic>) {
        final mode = settings['providers_display'];
        if (mode is String && mode.trim().isNotEmpty) return mode.trim();
      }
    } catch (_) {}
    return null;
  }

  // --- التحليل السلوكي (issue #44) -----------------------------------

  /// `POST /api/analytics/events` — النقطة الوحيدة. القائمة المغلقة لأسماء
  /// الأحداث يملكها الخادم (`ANALYTICS_EVENTS` في server/src/constants.js)؛
  /// هذا العميل لا يخترع اسماً جديداً ولا يتحقّق منه محلياً. `auth: true`
  /// كي تُنسَب لحساب المستخدم إن كان مسجَّلاً بلا إجبار تسجيل الدخول —
  /// `ApiClient` لا يرفق الترويسة أصلاً إن كان الرمز غائباً، فالزائر يُسجَّل
  /// بلا حساب تماماً كما يقبل الخادم (`optionalAuthenticate`).
  ///
  /// هذه الدالة وحدها ترمي `ApiException` كأي نقطة أخرى — الابتلاع الكامل
  /// للخطأ ("fire-and-forget") مسؤولية `recordAnalyticsEvent` في
  /// `state/analytics.dart`، لا هنا، حتى تبقى `NegevApi` متّسقة: كل دالة
  /// فيها تُبلّغ عن فشلها لموقع الاستدعاء.
  Future<void> recordAnalyticsEvent({
    required String eventName,
    required String platform,
    required String appVersion,
    required String deviceId,
    String? contentTown,
  }) async {
    await _client.post(
      '/api/analytics/events',
      auth: true,
      body: {
        'event_name': eventName,
        'platform': platform,
        'app_version': appVersion,
        'device_id': deviceId,
        if (contentTown != null && contentTown.isNotEmpty) 'content_town': contentTown,
      },
    );
  }
}

/// صفحة مناسبات — من GET /api/events. الترقيم والإعلانات تصلان مع نفس الاستدعاء.
class EventsPage {
  final List<Event> events;
  final Pagination pagination;
  final List<Announcement> announcements;

  const EventsPage({
    required this.events,
    required this.pagination,
    required this.announcements,
  });
}

/// يوم واحد في تقويم الشهر — `{ date: 'YYYY-MM-DD', count }` من
/// `GET /api/events/calendar` (تذكرة #175). `count` هو عدد المناسبات التي
/// يقع هذا اليوم داخل امتدادها، محسوباً على الخادم لا في العميل.
class CalendarDay {
  final String date;
  final int count;

  const CalendarDay({required this.date, required this.count});

  factory CalendarDay.fromJson(Map<String, dynamic> json) {
    final rawCount = json['count'];
    return CalendarDay(
      date: json['date'] is String ? json['date'] as String : '',
      count: rawCount is num ? rawCount.toInt() : (int.tryParse('$rawCount') ?? 0),
    );
  }
}

/// مركز بلدة واحد — من `town_coordinates` في GET /api/towns.
class TownCoordinate {
  final double lat;
  final double lng;

  const TownCoordinate({required this.lat, required this.lng});
}

/// قرية نشِطة — من مفتاح `villages` في GET /api/towns. مكان حقيقي بإحداثياته
/// الخاصة، بخلاف بند «القرى والتجمعات» الجامع الذي لا مركز واحداً له.
class Village {
  final int id;
  final String name;
  final double latitude;
  final double longitude;
  final int position;

  /// محافظة القرية (`region_id`) — يرسلها `GET /api/towns` مع كل قرية، ومنتقي
  /// القرية في شاشة النشر يُصفّي بها. و`null` حين يغيب الحقل (ردّ قديم أو
  /// خادم لا يعرفه)، فتبقى التصفية معطَّلة بدل منتقٍ فارغ.
  final int? regionId;

  const Village({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.position,
    this.regionId,
  });

  factory Village.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final lat = json['latitude'];
    final lng = json['longitude'];
    final position = json['position'];
    final regionId = json['region_id'];
    return Village(
      id: id is int ? id : int.tryParse('${id ?? ''}') ?? 0,
      name: '${json['name'] ?? ''}',
      latitude: lat is num ? lat.toDouble() : double.tryParse('$lat') ?? 0,
      longitude: lng is num ? lng.toDouble() : double.tryParse('$lng') ?? 0,
      position: position is int ? position : int.tryParse('${position ?? ''}') ?? 0,
      regionId: regionId is int
          ? regionId
          : int.tryParse('${regionId ?? ''}'),
    );
  }
}

/// محافظة (منطقة) — من مفتاح `regions` في GET /api/towns. اسمها نفسه مكانٌ
/// صالح لمناسبة لم تُعرف بلدتها بالضبط («النقب»): مركزها يفتح الخريطة فقط،
/// ولا يُكتب دبّوساً أبداً.
///
/// **`regions` لا تحمل إلا النشطة (تذكرة #127):** الموقوفة تصل في مفتاح
/// `regions_soon` باسمها ومعرّفها فقط، وتُبنى بـ[Region.soonFromJson]، فلا
/// تُختار ولا تُنشر فيها ولا تُوسَّط عليها خريطة.
class Region {
  final int id;
  final String name;

  /// هل المحافظة نشطة؟ `is_active` من الخادم، وصحيحٌ عند غيابه: خادم لم يعرف
  /// الحقل بعد لا يعيد في `regions` إلا النشطة أصلاً.
  final bool isActive;

  final double latitude;
  final double longitude;
  final double mapZoom;
  final List<String> towns;

  /// عدد البلدات **النشطة** في المحافظة — رقم من الخادم (تذكرة #127).
  /// `null` حين لا يرسله الخادم، فلا يُعرض رقم مخترع.
  final int? townsCount;

  /// عدد المناسبات **المعتمدة** على `events.region_id` — نفس الرقم الذي يراه
  /// الجمهور في التغذية. `null` حين لا يرسله الخادم.
  final int? eventsCount;

  const Region({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.mapZoom,
    this.isActive = true,
    this.towns = const [],
    this.townsCount,
    this.eventsCount,
  });

  /// محافظة موقوفة كما تصل في `regions_soon`: `{ id, name }` وحدهما. لا اسمٌ
  /// آخر ولا مركز ولا عدّاد — فبلا إحداثيات وبلا أرقام عمداً، ومن يعرضها
  /// «قريباً» لا غير.
  factory Region.soonFromJson(Map<String, dynamic> json) {
    final id = json['id'];
    return Region(
      id: id is int ? id : int.tryParse('${id ?? ''}') ?? 0,
      name: '${json['name'] ?? ''}',
      latitude: 0,
      longitude: 0,
      mapZoom: 9,
      isActive: false,
    );
  }

  factory Region.fromJson(Map<String, dynamic> json) {
    double toDouble(Object? value, double fallback) =>
        value is num ? value.toDouble() : double.tryParse('${value ?? ''}') ?? fallback;
    int? toCount(Object? value) {
      if (value is int) return value;
      if (value is num) return value.toInt();
      return int.tryParse('${value ?? ''}');
    }

    // غياب الحقل = خادم لم يعرفه بعد، وكل ما يعيده نشط.
    bool toActive(Object? value) {
      if (value == null) return true;
      if (value is bool) return value;
      final text = '$value'.trim().toLowerCase();
      return text != '0' && text != 'false';
    }

    final id = json['id'];
    final towns = json['towns'];
    return Region(
      id: id is int ? id : int.tryParse('${id ?? ''}') ?? 0,
      name: '${json['name'] ?? ''}',
      isActive: toActive(json['is_active']),
      latitude: toDouble(json['latitude'], 0),
      longitude: toDouble(json['longitude'], 0),
      mapZoom: toDouble(json['map_zoom'], 9),
      towns: towns is List ? towns.map((t) => '$t').toList() : const [],
      townsCount: toCount(json['towns_count']),
      eventsCount: toCount(json['events_count']),
    );
  }
}

/// ردّ GET /api/towns مقروءاً مرّة واحدة — انظر [NegevApi.placesCatalog].
class PlacesCatalog {
  /// البلدات النشِطة بترتيب الخادم، بلا «الكل» وبلا أسماء المحافظات.
  final List<String> towns;
  final Map<String, TownCoordinate> townCoordinates;
  final List<Village> villages;

  /// المحافظات **النشطة** وحدها — `regions`. كل ما يُختار ويُرسَل ترويسةً
  /// ويُنشر فيه يأتي من هنا أو من [activeRegions].
  final List<Region> regions;

  /// المحافظات **الموقوفة** — `regions_soon`، بلا اسمٍ آخر ولا مركز ولا رقم.
  /// تُعرض «قريباً» في منتقي الاكتشاف فقط، ولا تدخل [regions] أبداً.
  final List<Region> soonRegions;

  /// `false` للنسخة الاحتياطية من `lib/config.dart` — المخزن يعيد المحاولة.
  final bool fromServer;

  const PlacesCatalog({
    required this.towns,
    this.townCoordinates = const {},
    this.villages = const [],
    this.regions = const [],
    this.soonRegions = const [],
    this.fromServer = false,
  });

  /// المحافظات النشطة — ما يجوز اختياره للاكتشاف أو النشر فيه.
  ///
  /// `regions` نفسها لا تحمل موقوفة منذ #127 (تلك في [soonRegions])، فالمرشِّح
  /// هنا للدفاع لا للفصل: خادم قديم أو مخزَّن بلا `is_active` يعني نشطة.
  List<Region> get activeRegions =>
      regions.where((region) => region.isActive).toList();

  /// بلا اتصال: بلدات `AppConfig.towns`، بلا محافظات ولا قرى ولا مراكز.
  factory PlacesCatalog.fallback() => const PlacesCatalog(towns: AppConfig.towns);
}

/// ردّ POST /api/events — الرسالة إلزامية، والتحذير اللين اختياري.
class EventSubmissionResult {
  final String message;
  final String? locationWarning;

  /// معرّف الصفّ الذي أنشأه الخادم (يرجعه `POST /api/events` في 201) — يفتح
  /// به ستوديو البطاقة **بعد** النشر فقط؛ `null` من خادم أقدم لا يزرع باباً.
  final int? eventId;

  /// حالة الصفّ بعد الإنشاء (`approved` أو `pending`) كما قال الخادم.
  final String status;

  const EventSubmissionResult({
    required this.message,
    this.locationWarning,
    this.eventId,
    this.status = '',
  });
}

/// ردّ PATCH /api/events/:id — `amendment` و`status` من الخادم وحده، وتظهران
/// على الشاشة كما وصلتا بلا إعادة تصنيف في العميل.
class EventUpdateResult {
  final String message;
  final String amendment;
  final String status;
  final String? locationWarning;

  const EventUpdateResult({
    required this.message,
    required this.amendment,
    required this.status,
    this.locationWarning,
  });

  bool get isCritical => amendment == 'critical';
}

/// إعلان الإصدار من GET /api/app/version.
class AppRelease {
  final String? latestVersion;
  final String? minVersion;
  final String? apkUrl;
  final String releaseNotes;

  const AppRelease({
    this.latestVersion,
    this.minVersion,
    this.apkUrl,
    this.releaseNotes = '',
  });

  factory AppRelease.fromJson(Map<String, dynamic> json) {
    String? text(dynamic value) {
      if (value == null) return null;
      final trimmed = '$value'.trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    return AppRelease(
      latestVersion: text(json['latest_version']),
      minVersion: text(json['min_version']),
      apkUrl: text(json['apk_url']),
      releaseNotes: text(json['release_notes']) ?? '',
    );
  }
}

/// قالب بطاقة واحد كما يعيده `GET /api/card-templates` — مفتاحه واسمه العربي
/// ونبرته، وألوانه وعائلاته التي يسمح بها الخادم (المتاحة فعلاً وحدها).
class CardTemplate {
  final String key;
  final String name;

  /// `solemn` لقالبي العزاء الهادئين، و`festive` لبقية العشرة.
  final String tone;
  final String tagline;
  final String defaultFont;

  /// مفاتيح الخطوط التي يسمح بها هذا القالب — لا كل الخطوط.
  final List<String> fonts;
  final List<CardTemplateColor> colors;

  const CardTemplate({
    required this.key,
    required this.name,
    required this.tone,
    this.tagline = '',
    this.defaultFont = '',
    this.fonts = const [],
    this.colors = const [],
  });

  factory CardTemplate.fromJson(Map<String, dynamic> json) {
    final fonts = json['fonts'];
    final colors = json['colors'];
    return CardTemplate(
      key: '${json['key'] ?? ''}',
      name: '${json['name'] ?? ''}',
      tone: '${json['tone'] ?? 'festive'}',
      tagline: '${json['tagline'] ?? ''}',
      defaultFont: '${json['default_font'] ?? ''}',
      fonts: fonts is List ? fonts.map((font) => '$font').toList() : const [],
      colors: colors is List
          ? colors
              .whereType<Map>()
              .map((color) => CardTemplateColor.fromJson(Map<String, dynamic>.from(color)))
              .toList()
          : const [],
    );
  }

  bool get isSolemn => tone == 'solemn';
}

/// لون من لوحة القالب. الخادم يرسله `{value, name}` — والقيمة هي ما يُعاد
/// في `color` عند الرسم، فالاسم للعرض وحده.
class CardTemplateColor {
  final String value;
  final String name;

  const CardTemplateColor({required this.value, this.name = ''});

  factory CardTemplateColor.fromJson(Map<String, dynamic> json) {
    // `label` احتياطاً: العقد الموثَّق يسمّي الحقل label وبعض الردود name.
    final name = json['name'] ?? json['label'] ?? '';
    return CardTemplateColor(value: '${json['value'] ?? ''}', name: '$name');
  }
}

/// مقاس بطاقة من الأربعة (ستوري/عمودي/مربّع/A4) بأبعاد الرسم وأبعاد المعاينة
/// — الأخيرة من الخادم لا محسوبة في العميل.
class CardSize {
  final String key;
  final String name;
  final int width;
  final int height;
  final int previewWidth;
  final int previewHeight;

  const CardSize({
    required this.key,
    required this.name,
    required this.width,
    required this.height,
    this.previewWidth = 0,
    this.previewHeight = 0,
  });

  factory CardSize.fromJson(Map<String, dynamic> json) {
    int toInt(Object? value) {
      if (value is num) return value.toInt();
      return int.tryParse('${value ?? ''}') ?? 0;
    }

    final preview = json['preview'];
    final previewMap = preview is Map ? Map<String, dynamic>.from(preview) : const <String, dynamic>{};
    return CardSize(
      key: '${json['key'] ?? ''}',
      name: '${json['name'] ?? ''}',
      width: toInt(json['width']),
      height: toInt(json['height']),
      previewWidth: toInt(previewMap['width']),
      previewHeight: toInt(previewMap['height']),
    );
  }

  /// نسبة المعاينة للعرض على الشاشة — من أبعاد المعاينة، وأبعاد الرسم حين
  /// يغيب `preview` (خادم أقدم)، و`null` إن كانت الأبعاد ناقصة فلا نسبة.
  double? get aspectRatio {
    if (previewWidth > 0 && previewHeight > 0) {
      return previewWidth / previewHeight;
    }
    if (width > 0 && height > 0) return width / height;
    return null;
  }
}

/// عائلة خط مسجَّلة على الخادم — المتاحة فعلاً وحدها تصل هنا.
class CardFont {
  final String key;
  final String name;
  final String note;

  const CardFont({required this.key, required this.name, this.note = ''});

  factory CardFont.fromJson(Map<String, dynamic> json) => CardFont(
        key: '${json['key'] ?? ''}',
        name: '${json['name'] ?? ''}',
        note: '${json['note'] ?? ''}',
      );
}

/// كتالوج الستوديو كاملاً — انظر [NegevApi.cardStudioCatalog].
class CardStudioCatalog {
  final List<CardTemplate> templates;
  final List<CardSize> sizes;
  final List<CardFont> fonts;
  final int previewMaxWidth;

  const CardStudioCatalog({
    this.templates = const [],
    this.sizes = const [],
    this.fonts = const [],
    this.previewMaxWidth = 0,
  });

  factory CardStudioCatalog.fromJson(Map<String, dynamic> json) {
    final templates = json['templates'];
    final sizes = json['sizes'];
    final fonts = json['fonts'];
    final maxWidth = json['preview_max_width'];
    return CardStudioCatalog(
      templates: templates is List
          ? templates
              .whereType<Map>()
              .map((item) => CardTemplate.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      sizes: sizes is List
          ? sizes
              .whereType<Map>()
              .map((item) => CardSize.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      fonts: fonts is List
          ? fonts
              .whereType<Map>()
              .map((item) => CardFont.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      previewMaxWidth: maxWidth is num ? maxWidth.toInt() : int.tryParse('${maxWidth ?? ''}') ?? 0,
    );
  }

  /// قوالب نبرة واحدة — **هذا هو ترشيح العزاء** في العميل، ومطابقه على الخادم
  /// `templatesForTone`: مناسبة `solemn` لا ترى إلا `solemn`، وغيرها لا تراها
  /// إطلاقاً. القيمة غير المعروفة تُقرأ `festive` كافتراض الخادم نفسه.
  List<CardTemplate> templatesForTone(String tone) {
    final wanted = tone == 'solemn' ? 'solemn' : 'festive';
    return templates.where((template) => template.tone == wanted).toList();
  }

  CardTemplate? templateByKey(String key) {
    for (final template in templates) {
      if (template.key == key) return template;
    }
    return null;
  }

  CardSize? sizeByKey(String key) {
    for (final size in sizes) {
      if (size.key == key) return size;
    }
    return null;
  }

  CardFont? fontByKey(String key) {
    for (final font in fonts) {
      if (font.key == key) return font;
    }
    return null;
  }
}

/// بطاقة محفوظة لمناسبة — صفّ `event_cards` كما يعيده الخادم، و`image_url`
/// مطلقة دائماً (`image_url` بالمقاس الكامل في قائمة البطاقات).
class EventCardItem {
  final int id;
  final String templateKey;
  final String fontKey;
  final String color;
  final String size;
  final String imageUrl;
  final bool isPrimary;

  const EventCardItem({
    required this.id,
    this.templateKey = '',
    this.fontKey = '',
    this.color = '',
    this.size = '',
    this.imageUrl = '',
    this.isPrimary = false,
  });

  factory EventCardItem.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    return EventCardItem(
      id: id is int ? id : int.tryParse('${id ?? ''}') ?? 0,
      templateKey: '${json['template_key'] ?? ''}',
      fontKey: '${json['font_key'] ?? ''}',
      color: '${json['color'] ?? ''}',
      size: '${json['size'] ?? ''}',
      imageUrl: '${json['image_url'] ?? ''}',
      isPrimary: json['is_primary'] == true || json['is_primary'] == 1,
    );
  }
}

/// ردّ حفظ البطاقة وتعيينها أساسيةً — الرسالة العربية من الخادم والصفّ بعده.
class CardSaveResult {
  final String message;
  final EventCardItem? card;

  const CardSaveResult({required this.message, this.card});

  factory CardSaveResult.fromJson(Map<String, dynamic> json) {
    final message = json['message'];
    final card = json['card'];
    return CardSaveResult(
      message: message is String && message.isNotEmpty
          ? message
          : 'حُفظت البطاقة وجُعلت البطاقة الأساسية للمناسبة',
      card: card is Map ? EventCardItem.fromJson(Map<String, dynamic>.from(card)) : null,
    );
  }
}
