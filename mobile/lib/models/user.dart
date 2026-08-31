/// مستخدم — مطابق لـ auth.service.publicUser. رمز PIN لا يصل العميل أبداً.
class AppUser {
  final int id;
  final String phoneNumber;
  final String fullName;
  final String? clanTown;
  final String role;

  const AppUser({
    required this.id,
    required this.phoneNumber,
    required this.fullName,
    required this.role,
    this.clanTown,
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
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone_number': phoneNumber,
        'full_name': fullName,
        'clan_town': clanTown,
        'role': role,
      };
}
