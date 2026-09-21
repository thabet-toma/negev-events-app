/// حالة قناة/بثّ تيك توك — من GET /api/live العام (LIVE-04). `null` لكلا
/// الحقلين معاً يعني أنّ المالك لم يضبط شيئاً بعد؛ [isConfigured] هو الشرط
/// الوحيد الذي يقرأه العميل ليقرر إظهار أي مدخل، نظير `isTikTokLiveConfigured`
/// في web/app.js.
class TikTokLive {
  final String? profileUrl;
  final TikTokLiveBroadcast? live;

  const TikTokLive({this.profileUrl, this.live});

  bool get isConfigured => profileUrl != null || live != null;

  factory TikTokLive.fromJson(Map<String, dynamic> json) {
    final rawLive = json['live'];
    return TikTokLive(
      profileUrl: _nullableString(json['profile_url']),
      live: rawLive is Map<String, dynamic>
          ? TikTokLiveBroadcast.fromJson(rawLive)
          : null,
    );
  }
}

/// بثّ مضبوط (عنوان + موعد انتهاء). `active` تصل محسوبة من الخادم مقارنةً
/// بالوقت الحالي هناك — لا تُشتقّ هنا مجدداً من `until` (خلافاً للوحة الإدارة
/// نفسها، وهي من تحرّر القيمة أصلاً).
class TikTokLiveBroadcast {
  final String title;
  final String until;
  final String url;
  final bool active;

  const TikTokLiveBroadcast({
    required this.title,
    required this.until,
    required this.url,
    required this.active,
  });

  factory TikTokLiveBroadcast.fromJson(Map<String, dynamic> json) =>
      TikTokLiveBroadcast(
        title: '${json['title'] ?? ''}',
        until: '${json['until'] ?? ''}',
        url: '${json['url'] ?? ''}',
        active: json['active'] == true,
      );
}

String? _nullableString(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}
