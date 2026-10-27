import 'event.dart' show Pagination;

/// ألبوم عرس من `/api/albums` — صفّ مستقل، لا «أرشيف» واحد.
class EventAlbum {
  final int id;
  final int eventId;
  final String title;
  final String? description;
  final bool isPublished;
  final int photoCount;
  /// عدّ الفيديوهات المعتمدة في الألبوم (`video_count`) كما يحسبه الخادم:
  /// صفرٌ لألبوم صورٍ فقط، وصفرٌ أيضاً للخادم الذي يسبق الحقل — فتعود البطاقة
  /// إلى عدّ الصور بدل أن تنقص عدداً لا تعرفه.
  final int videoCount;
  final String? coverUrl;
  final String? coverThumbUrl;
  /// صفحة المشاركة على الخادم (`/a/:id`) — يأتي جاهزاً من الحمولة، فلا يركّبه
  /// أي عميل بنفسه ويخطئ حين يتغيّر النطاق (تذكرة #100). والسقوط إلى بناءٍ من
  /// المعرّف يبقى للخادم الذي يسبق الحقل، لا للعميل الذي يجهل النطاق.
  final String? shareUrl;
  final String? eventTitle;
  final String? town;
  final String? eventDate;
  /// اسم صاحب الألبوم حين يكون الألبوم بلا مناسبة (`honoree_name`): الحقل يأتي
  /// من الخادم لألبوم `event_id = NULL` وحده، ويبقى null في ألبوم المناسبة.
  final String? honoreeName;
  /// الشخص المربوط بالألبوم (`person.name`) — يحمل الاسم نفسه في الغالب، ويُقرأ
  /// احتياطاً حين يغيب `honoree_name` كي لا يبقى سطر البطاقة بلا اسم.
  final String? personName;

  const EventAlbum({
    required this.id,
    required this.eventId,
    required this.title,
    this.description,
    this.isPublished = true,
    this.photoCount = 0,
    this.videoCount = 0,
    this.coverUrl,
    this.coverThumbUrl,
    this.shareUrl,
    this.eventTitle,
    this.town,
    this.eventDate,
    this.honoreeName,
    this.personName,
  });

  /// ألبومٌ له مناسبة (`event_id` موجب — يُقرأ من `event.id` حين يغيب الحقل
  /// صراحةً) أم ألبومٌ بلا مناسبة (`event_id: null` + `event: null`).
  /// `eventId` يبقى `int` كما هو — صفراً حين لا مناسبة، فلا يصير `int?` ويكسر
  /// كل قارئ له.
  bool get hasEvent => eventId > 0;

  /// السطر الثاني في بطاقة الألبوم: عنوان المناسبة وبلدتها، واسم العريس وبلدته
  /// حين لا مناسبة — لا سطرٌ فارغ ولا «null» ولا صفر. فارغُ المحتوى يبقى فارغاً
  /// هنا، وعلى الشاشة أن تخفيه بدل أن ترسم سطراً أبيض.
  String get contextLine => _joinLine(
        hasEvent ? [eventTitle, town] : [honoreeName ?? personName, town],
      );

  /// سطر رأس تفاصيل الألبوم: أعلاه، وتاريخ المناسبة يُضاف في ألبومها وحده.
  String get detailLine => _joinLine(
        hasEvent
            ? [eventTitle, town, eventDate]
            : [honoreeName ?? personName, town],
      );

  factory EventAlbum.fromJson(Map<String, dynamic> json) {
    final event = json['event'] is Map ? json['event'] as Map : const {};
    final person = json['person'] is Map ? json['person'] as Map : const {};
    return EventAlbum(
      id: _toInt(json['id']),
      eventId: _toInt(json['event_id'] ?? event['id']),
      title: '${json['title'] ?? ''}',
      description: _nullableString(json['description']),
      isPublished: json['is_published'] != false,
      photoCount: _toInt(json['photo_count']),
      videoCount: _toInt(json['video_count']),
      coverUrl: _nullableString(json['cover_url']),
      coverThumbUrl: _nullableString(json['cover_thumb_url']),
      shareUrl: _nullableString(json['share_url']),
      eventTitle: _nullableString(event['title'] ?? json['event_title']),
      // بلدة الألبوم أولاً: ألبومٌ بلا مناسبة لا `event` له، وبلدة المناسبة
      // سقوطٌ للخادم الذي يسبق الحقل (وقيمته هي نفسها في ألبوم المناسبة).
      town: _nullableString(json['town'] ?? event['town']),
      eventDate: _nullableString(event['event_date'] ?? json['event_date']),
      honoreeName: _nullableString(json['honoree_name']),
      personName: _nullableString(person['name']),
    );
  }
}

String _joinLine(Iterable<String?> parts) => parts
    .whereType<String>()
    .where((part) => part.isNotEmpty)
    .join(' · ');

class PhotoTag {
  final String name;

  const PhotoTag({required this.name});

  factory PhotoTag.fromJson(Map<String, dynamic> json) =>
      PhotoTag(name: '${json['name'] ?? ''}');
}

/// صورة واحدة — كائن مستقل داخل ألبوم، بوسومه وعنوانه.
class EventPhoto {
  final int id;
  final int albumId;
  final String imageUrl;
  final String? thumbUrl;
  final int? width;
  final int? height;
  final String? caption;
  final int position;
  final bool isCover;
  final List<PhotoTag> tags;
  final String? albumTitle;
  final String? eventTitle;
  final String? town;
  final String? eventDate;
  /// صفحة الصورة على الخادم (`/p/:id`) — تُقرأ جاهزة كي لا يركّبها العميل.
  final String? shareUrl;

  const EventPhoto({
    required this.id,
    required this.albumId,
    required this.imageUrl,
    this.thumbUrl,
    this.width,
    this.height,
    this.caption,
    this.position = 0,
    this.isCover = false,
    this.tags = const [],
    this.albumTitle,
    this.eventTitle,
    this.town,
    this.eventDate,
    this.shareUrl,
  });

  String get displayImage => thumbUrl?.isNotEmpty == true ? thumbUrl! : imageUrl;

  factory EventPhoto.fromJson(Map<String, dynamic> json) {
    final album = json['album'] is Map ? json['album'] as Map : const {};
    final event = json['event'] is Map ? json['event'] as Map : const {};
    final rawTags = json['tags'];
    return EventPhoto(
      id: _toInt(json['id']),
      albumId: _toInt(json['album_id'] ?? album['id']),
      imageUrl: '${json['image_url'] ?? ''}',
      thumbUrl: _nullableString(json['thumb_url']),
      width: _nullableInt(json['width']),
      height: _nullableInt(json['height']),
      caption: _nullableString(json['caption']),
      position: _toInt(json['position']),
      isCover: json['is_cover'] == true,
      tags: rawTags is List
          ? rawTags
              .whereType<Map>()
              .map((tag) => PhotoTag.fromJson(Map<String, dynamic>.from(tag)))
              .where((tag) => tag.name.isNotEmpty)
              .toList()
          : const [],
      albumTitle: _nullableString(album['title'] ?? json['album_title']),
      eventTitle: _nullableString(event['title'] ?? json['event_title']),
      town: _nullableString(event['town'] ?? json['town']),
      eventDate: _nullableString(event['event_date'] ?? json['event_date']),
      shareUrl: _nullableString(json['share_url']),
    );
  }
}

/// فيديو داخل ألبوم (`videos` في `GET /api/albums/:id`) — رابطٌ خارجي إلى
/// يوتيوب/تيك توك/فيسبوك، لا ملفٌ على خادمنا ولا مشغّلٌ في التطبيق. صفحة
/// المشاركة `/v/:id` على الخادم هي التي تغلّفه ببطاقة «اعراسنا» (ADR-0006).
class EventVideo {
  final int id;
  final String? provider;
  final String? title;
  final String? externalUrl;
  final String? thumbUrl;

  const EventVideo({
    required this.id,
    this.provider,
    this.title,
    this.externalUrl,
    this.thumbUrl,
  });

  /// اسم المنصّة بالعربية. الغائب أو المجهول ⇒ «فيديو»: وسمٌ عامّ أصدق من
  /// `null` معروض، وأصدق من اسم منصّة لم يقلها الخادم.
  String get providerLabel {
    switch (provider) {
      case 'youtube':
        return 'يوتيوب';
      case 'tiktok':
        return 'تيك توك';
      case 'facebook':
        return 'فيسبوك';
      case 'instagram':
        return 'إنستغرام';
      case 'website':
        return 'الموقع';
      default:
        return 'فيديو';
    }
  }

  factory EventVideo.fromJson(Map<String, dynamic> json) => EventVideo(
        id: _toInt(json['id']),
        provider: _nullableString(json['provider']),
        title: _nullableString(json['title']),
        externalUrl: _nullableString(json['external_url']),
        thumbUrl: _nullableString(json['thumb_url']),
      );
}

class AlbumPhotoPage {
  final EventAlbum album;
  final List<EventPhoto> photos;
  final Pagination pagination;

  const AlbumPhotoPage({
    required this.album,
    required this.photos,
    required this.pagination,
  });
}

class PhotosPage {
  final List<EventPhoto> photos;
  final Pagination pagination;

  const PhotosPage({required this.photos, required this.pagination});
}

class PersonSearchResult {
  final int id;
  final String name;
  final String nameKey;
  final int photosCount;
  final int albumsCount;
  final String? sampleThumbUrl;

  const PersonSearchResult({
    required this.id,
    required this.name,
    required this.nameKey,
    required this.photosCount,
    this.albumsCount = 0,
    this.sampleThumbUrl,
  });

  factory PersonSearchResult.fromJson(Map<String, dynamic> json) =>
      PersonSearchResult(
        id: _toInt(json['id']),
        name: '${json['name'] ?? ''}',
        nameKey: '${json['name_key'] ?? ''}',
        photosCount: _toInt(json['photos_count']),
        albumsCount: _toInt(json['albums_count']),
        sampleThumbUrl: _nullableString(json['sample_thumb_url'] ?? json['sample_url']),
      );
}

/// مناسبة ظاهر هو صاحبها — تُعرض في صفحة الشخص ولو لم يُنشأ ألبومها بعد، كي لا
/// تكون الصفحة اسماً ورقمين ولا شيء تحتهما.
class PersonOccasion {
  final int id;
  final String? title;
  final String? town;
  final String? eventDate;
  final String? occasionTypeName;

  const PersonOccasion({
    required this.id,
    this.title,
    this.town,
    this.eventDate,
    this.occasionTypeName,
  });

  String get line => [title, town, eventDate]
      .whereType<String>()
      .where((part) => part.isNotEmpty)
      .join(' · ');

  factory PersonOccasion.fromJson(Map<String, dynamic> json) => PersonOccasion(
        id: _toInt(json['id']),
        title: _nullableString(json['title']),
        town: _nullableString(json['town']),
        eventDate: _nullableString(json['event_date']),
        occasionTypeName: _nullableString(json['occasion_type_name']),
      );
}

/// شخصٌ واحد بصفحته (ADR-0011): اسمه، صوره، ومناسباته — من `/api/people/:id`.
class Person {
  final int id;
  final String name;
  final String nameKey;
  final int photosCount;
  final int albumsCount;
  final List<EventPhoto> photos;
  final List<EventAlbum> albums;
  final List<PersonOccasion> events;
  final Pagination pagination;

  const Person({
    required this.id,
    required this.name,
    required this.nameKey,
    required this.photosCount,
    required this.albumsCount,
    this.photos = const [],
    this.albums = const [],
    this.events = const [],
    this.pagination = const Pagination(page: 1, limit: 48, total: 0, totalPages: 0),
  });

  bool get hasMore => pagination.hasMore;

  factory Person.fromJson(Map<String, dynamic> json) {
    final rawPhotos = json['photos'];
    final rawAlbums = json['albums'];
    final rawEvents = json['events'];
    return Person(
      id: _toInt(json['id']),
      name: '${json['name'] ?? ''}',
      nameKey: '${json['name_key'] ?? ''}',
      photosCount: _toInt(json['photos_count']),
      albumsCount: _toInt(json['albums_count']),
      photos: rawPhotos is List
          ? rawPhotos
              .whereType<Map>()
              .map((item) => EventPhoto.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      albums: rawAlbums is List
          ? rawAlbums
              .whereType<Map>()
              .map((item) => EventAlbum.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      events: rawEvents is List
          ? rawEvents
              .whereType<Map>()
              .map((item) => PersonOccasion.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      pagination: Pagination.fromJson(
        json['pagination'] is Map
            ? Map<String, dynamic>.from(json['pagination'] as Map)
            : const {},
      ),
    );
  }
}

class AlbumSearchResults {
  final List<EventAlbum> albums;
  final List<EventPhoto> photos;
  final List<PersonSearchResult> people;

  const AlbumSearchResults({
    required this.albums,
    required this.photos,
    required this.people,
  });

  factory AlbumSearchResults.fromJson(Map<String, dynamic> json) => AlbumSearchResults(
        albums: _list(json['albums'], EventAlbum.fromJson),
        photos: _list(json['photos'], EventPhoto.fromJson),
        people: _list(json['people'], PersonSearchResult.fromJson),
      );
}

List<T> _list<T>(Object? raw, T Function(Map<String, dynamic>) parse) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((item) => parse(Map<String, dynamic>.from(item)))
      .toList();
}

String? _nullableString(Object? raw) {
  if (raw == null) return null;
  final value = '$raw'.trim();
  return value.isEmpty ? null : value;
}

int _toInt(Object? raw) {
  if (raw is int) return raw;
  if (raw is num) return raw.toInt();
  return int.tryParse('${raw ?? ''}') ?? 0;
}

int? _nullableInt(Object? raw) {
  if (raw == null) return null;
  if (raw is int) return raw;
  if (raw is num) return raw.toInt();
  return int.tryParse('$raw');
}
