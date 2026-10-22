import 'event.dart' show Pagination;

/// ألبوم عرس من `/api/albums` — صفّ مستقل، لا «أرشيف» واحد.
class EventAlbum {
  final int id;
  final int eventId;
  final String title;
  final String? description;
  final bool isPublished;
  final int photoCount;
  final String? coverUrl;
  final String? coverThumbUrl;
  /// صفحة المشاركة على الخادم (`/a/:id`) — يأتي جاهزاً من الحمولة، فلا يركّبه
  /// أي عميل بنفسه ويخطئ حين يتغيّر النطاق (تذكرة #100). والسقوط إلى بناءٍ من
  /// المعرّف يبقى للخادم الذي يسبق الحقل، لا للعميل الذي يجهل النطاق.
  final String? shareUrl;
  final String? eventTitle;
  final String? town;
  final String? eventDate;

  const EventAlbum({
    required this.id,
    required this.eventId,
    required this.title,
    this.description,
    this.isPublished = true,
    this.photoCount = 0,
    this.coverUrl,
    this.coverThumbUrl,
    this.shareUrl,
    this.eventTitle,
    this.town,
    this.eventDate,
  });

  factory EventAlbum.fromJson(Map<String, dynamic> json) {
    final event = json['event'] is Map ? json['event'] as Map : const {};
    return EventAlbum(
      id: _toInt(json['id']),
      eventId: _toInt(json['event_id'] ?? event['id']),
      title: '${json['title'] ?? ''}',
      description: _nullableString(json['description']),
      isPublished: json['is_published'] != false,
      photoCount: _toInt(json['photo_count']),
      coverUrl: _nullableString(json['cover_url']),
      coverThumbUrl: _nullableString(json['cover_thumb_url']),
      shareUrl: _nullableString(json['share_url']),
      eventTitle: _nullableString(event['title'] ?? json['event_title']),
      town: _nullableString(event['town'] ?? json['town']),
      eventDate: _nullableString(event['event_date'] ?? json['event_date']),
    );
  }
}

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

/// شخصٌ واحد بصفحته (ADR-0011): اسمه، صوره، ومواسمه — من `/api/people/:id`.
class Person {
  final int id;
  final String name;
  final String nameKey;
  final int photosCount;
  final int albumsCount;
  final List<EventPhoto> photos;
  final List<EventAlbum> albums;
  final Pagination pagination;

  const Person({
    required this.id,
    required this.name,
    required this.nameKey,
    required this.photosCount,
    required this.albumsCount,
    this.photos = const [],
    this.albums = const [],
    this.pagination = const Pagination(page: 1, limit: 48, total: 0, totalPages: 0),
  });

  bool get hasMore => pagination.hasMore;

  factory Person.fromJson(Map<String, dynamic> json) {
    final rawPhotos = json['photos'];
    final rawAlbums = json['albums'];
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
