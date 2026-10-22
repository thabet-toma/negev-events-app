import 'package:flutter_test/flutter_test.dart';
import 'package:negev_events/models/album.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/state/share_album.dart';

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

  group('مشاركة الألبوم والصورة (تذكرة #103)', () {
    EventAlbum album({String? shareUrl}) => EventAlbum(
          id: 11,
          eventId: 5,
          title: 'عرس أحمد — رهط',
          town: 'رهط',
          shareUrl: shareUrl,
        );

    test('EventAlbum.fromJson يقرأ share_url، ويبقى null مع خادم قديم', () {
      final withShare = EventAlbum.fromJson({
        'id': 11,
        'event_id': 5,
        'title': 'عرس',
        'share_url': 'https://munasbat.test/a/11',
      });
      expect(withShare.shareUrl, 'https://munasbat.test/a/11');

      final without = EventAlbum.fromJson({'id': 11, 'event_id': 5, 'title': 'عرس'});
      expect(without.shareUrl, isNull);
    });

    test('albumShareUrl يفضّل رابط الخادم، ويسقط إلى /a/<id> حين يغيب', () {
      expect(albumShareUrl(album(shareUrl: 'https://munasbat.test/a/11')),
          'https://munasbat.test/a/11');

      final fallback = albumShareUrl(album());
      expect(fallback, endsWith('/a/11'));
      expect(fallback, startsWith('http'), reason: 'رابط مطلق لا نسبيّ');
      expect(fallback.contains('#'), isFalse,
          reason: 'ما بعد # لا يفتح التطبيق ولا ينتج معاينة');
    });

    test('albumShareMessage يحمل العنوان والبلدة والرابط', () {
      final message = albumShareMessage(album(shareUrl: 'https://munasbat.test/a/11'));
      expect(message, contains('عرس أحمد — رهط'));
      expect(message, contains('رهط'));
      expect(message, contains('https://munasbat.test/a/11'));
    });

    test('photoShareUrl صفحة الصورة، ورسالتها عنوانها التعليق أو بديله', () {
      final photo = EventPhoto(
        id: 7,
        albumId: 11,
        imageUrl: 'https://cdn.test/full.jpg',
        caption: 'صورة القاعة',
      );
      expect(photoShareUrl(photo), endsWith('/p/7'));
      expect(photoShareMessage(photo), contains('صورة القاعة'));

      final untitled = EventPhoto(id: 8, albumId: 11, imageUrl: 'https://cdn.test/x.jpg');
      expect(photoShareMessage(untitled), contains('صورة من ألبوم العرس'));
    });
  });
}
