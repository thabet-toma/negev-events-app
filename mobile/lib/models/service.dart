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

/// فئة خدمة — من GET /api/services/categories، بيانات وقت تشغيل لا قائمة ثابتة.
class ServiceCategory {
  final int id;
  final String name;
  final String icon;
  final String color;
  final int position;

  const ServiceCategory({
    required this.id,
    required this.name,
    required this.icon,
    required this.color,
    required this.position,
  });

  factory ServiceCategory.fromJson(Map<String, dynamic> json) => ServiceCategory(
        id: _toInt(json['id']),
        name: '${json['name'] ?? ''}',
        icon: '${json['icon'] ?? ''}',
        color: '${json['color'] ?? ''}',
        position: _toInt(json['position']),
      );
}

/// سطر مزوّد في القائمة العامة — من GET /api/services/providers. لا يحمل
/// `phone` مفتاحاً أصلاً في استجابة الخادم؛ التحليل يجب ألّا يفترض وجوده.
class ServiceProvider {
  final int id;
  final String name;
  final int categoryId;
  final String categoryName;
  final String? imageUrl;
  final List<String> towns;

  const ServiceProvider({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    this.imageUrl,
    this.towns = const [],
  });

  factory ServiceProvider.fromJson(Map<String, dynamic> json) {
    final rawTowns = json['towns'];
    return ServiceProvider(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      categoryId: _toInt(json['category_id']),
      categoryName: '${json['category_name'] ?? ''}',
      imageUrl: _nullableString(json['image_url']),
      towns: rawTowns is List ? rawTowns.map((t) => '$t').toList() : const [],
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

/// مزوّد خدمة كامل — من GET /api/services/providers/:id، الموضع الوحيد الذي
/// يحمل `phone`. لا يُعرض الرقم في الواجهة إلا خلف فعل تواصل صريح — القرار
/// هنا في العميل يحترم قرار الخادم بعدم إرساله في القائمة، لا يكرّره فقط.
class ServiceProviderDetail {
  final int id;
  final String name;
  final int categoryId;
  final String categoryName;
  final String phone;
  final String? description;
  final String? imageUrl;
  final List<String> towns;

  const ServiceProviderDetail({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    required this.phone,
    this.description,
    this.imageUrl,
    this.towns = const [],
  });

  factory ServiceProviderDetail.fromJson(Map<String, dynamic> json) {
    final rawTowns = json['towns'];
    return ServiceProviderDetail(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      categoryId: _toInt(json['category_id']),
      categoryName: '${json['category_name'] ?? ''}',
      phone: '${json['phone'] ?? ''}',
      description: _nullableString(json['description']),
      imageUrl: _nullableString(json['image_url']),
      towns: rawTowns is List ? rawTowns.map((t) => '$t').toList() : const [],
    );
  }
}
