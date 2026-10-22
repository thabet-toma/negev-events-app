import 'package:flutter_test/flutter_test.dart';
import 'package:negev_events/models/album.dart';
import 'package:negev_events/models/event.dart';

void main() {
  group('نماذج ألبومات الأعراس (ADR-0009)', () {
    test('EventAlbum.fromJson يقرأ الغلاف والحدث والعدد', () {
      final album = EventAlbum.fromJson({
        'id': 11,
        'event_id': 5,
        'title': 'عرس أحمد — رهط',
        'description': null,
        'is_published': true,
        'photo_count': 42,
        'cover_url': 'https://cdn.test/cover.jpg',
        'cover_thumb_url': 'https://cdn.test/cover-thumb.jpg',
        'event': {
          'id': 5,
          'title': 'عرس أحمد',
          'town': 'رهط',
          'event_date': '2025-05-01',
          'occasion_type_name': 'عرس'
        }
      });

      expect(album.id, 11);
      expect(album.eventId, 5);
      expect(album.title, 'عرس أحمد — رهط');
      expect(album.photoCount, 42);
      expect(album.coverThumbUrl, 'https://cdn.test/cover-thumb.jpg');
      expect(album.eventTitle, 'عرس أحمد');
      expect(album.town, 'رهط');
    });

    test('EventPhoto.fromJson يحمل الوسوم والعنوان ومصغّرة مستقلة', () {
      final photo = EventPhoto.fromJson({
        'id': 7,
        'album_id': 11,
        'image_url': 'https://cdn.test/full.jpg',
        'thumb_url': 'https://cdn.test/thumb.jpg',
        'caption': 'صورة القاعة',
        'is_cover': true,
        'position': 0,
        'tags': [
          {'name': 'فاطمة'},
          {'name': 'محمد'}
        ],
        'album': {'id': 11, 'title': 'عرس أحمد'},
        'event': {'id': 5, 'title': 'عرس أحمد', 'town': 'رهط'}
      });

      expect(photo.id, 7);
      expect(photo.caption, 'صورة القاعة');
      expect(photo.displayImage, 'https://cdn.test/thumb.jpg');
      expect(photo.tags.map((tag) => tag.name), ['فاطمة', 'محمد']);
      expect(photo.albumTitle, 'عرس أحمد');
      expect(photo.isCover, isTrue);
    });

    test('Event.fromJson يقرأ albums من تفاصيل المناسبة', () {
      final event = Event.fromJson({
        'id': 127,
        'title': 'عرس راني',
        'groom_name': 'راني',
        'family_clan': 'الجرابعة',
        'town': 'شقيب السلام',
        'event_date': '2026-09-26',
        'albums': [
          {
            'id': 2,
            'event_id': 127,
            'title': 'عرس راني — شقيب السلام',
            'photo_count': 1,
            'cover_thumb_url': 'https://cdn.test/cover.jpg',
            'event': {'id': 127, 'title': 'عرس راني', 'town': 'شقيب السلام'}
          }
        ]
      });
      expect(event.albums, hasLength(1));
      expect(event.albums.single.id, 2);
      expect(event.albums.single.photoCount, 1);
    });

    test('AlbumSearchResults.fromJson يفصل المجموعات الثلاث', () {
      final results = AlbumSearchResults.fromJson({
        'albums': [
          {'id': 1, 'event_id': 5, 'title': 'ألبوم', 'photo_count': 2}
        ],
        'photos': [
          {'id': 7, 'album_id': 1, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
        ],
        'people': [
          {'name': 'فاطمة', 'name_key': 'فاطمه', 'photos_count': 1}
        ]
      });

      expect(results.albums, hasLength(1));
      expect(results.photos, hasLength(1));
      expect(results.people.single.name, 'فاطمة');
      expect(results.people.single.nameKey, 'فاطمه');
    });
  });
}
