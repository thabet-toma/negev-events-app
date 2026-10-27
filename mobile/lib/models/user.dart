/// مستخدم — مطابق لـ auth.service.publicUser. رمز PIN لا يصل العميل أبداً.
class AppUser {
  final int id;
  final String phoneNumber;
  final String fullName;
  final String? clanTown;
  final String role;

  /// رابط الصورة الشخصية — مطلق أو null (بلا صورة). الخادم وحده يبنيه.
  final String? avatarUrl;

  /// هل رفض صاحبه إحصاءات الاستخدام؟ `true` = لا تُسجَّل تصرّفاته في التطبيق.
  /// مفتاح لا شرط استخدام: لا يُعطّل أي ميزة، ولا يُخفي شيئاً عن صاحبه.
  final bool analyticsOptOut;

  const AppUser({
    required this.id,
    required this.phoneNumber,
    required this.fullName,
    required this.role,
    this.clanTown,
    this.avatarUrl,
    this.analyticsOptOut = false,
  });

  bool get isAdmin => role == 'admin' || role == 'super_admin';

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    return AppUser(
      id: rawId is int ? rawId : int.tryParse('$rawId') ?? 0,
      phoneNumber: '${json['phone_number'] ?? ''}',
      fullName: '${json['full_name'] ?? ''}',
      clanTown: json['clan_town'] == null ? null : '${json['clan_town']}',
      role: '${json['role'] ?? 'user'}',
      avatarUrl: json['avatar_url'] == null ? null : '${json['avatar_url']}',
      analyticsOptOut: json['analytics_opt_out'] == true,
    );
  }

  /// الجلسة تُحفظ من هذا الملفّ وتُقرأ بـ[AppUser.fromJson] عند الإقلاع،
  /// فغياب `analytics_opt_out` هنا يجعل المفتاح يعود مفعَّلاً بعد إعادة
  /// التشغيل — أي أن الرفض يضيع بصمت.
  Map<String, dynamic> toJson() => {
        'id': id,
        'phone_number': phoneNumber,
        'full_name': fullName,
        'clan_town': clanTown,
        'role': role,
        'avatar_url': avatarUrl,
        'analytics_opt_out': analyticsOptOut,
      };
}
