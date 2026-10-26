import 'package:flutter_test/flutter_test.dart';
import 'package:negev_events/config.dart';
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

  group('ألبوم بلا مناسبة (event_id: null، ADR-0009)', () {
    // الشكل الجديد من الخادم: ألبوم باسم العريس، `event` صار null بدل كائن،
    // والبلدة واسم العريس أعلى الكائن. لا يجب أن يسقط أيٌّ منهما على الأرض.
    Map<String, dynamic> payload({String? town = 'رهط'}) => {
          'id': 21,
          'event_id': null,
          'title': 'عرس أحمد أبو سليمان',
          'description': 'صور الحنّة',
          'is_published': true,
          'photo_count': 3,
          'cover_url': 'https://cdn.test/cover.jpg',
          'cover_thumb_url': 'https://cdn.test/cover-thumb.jpg',
          'share_url': 'https://munasbat.test/a/21',
          'created_at': '2026-10-01T10:00:00.000Z',
          'town': town,
          'honoree_name': 'أحمد أبو سليمان',
          'person': {'id': 9, 'name': 'أحمد أبو سليمان'},
          'event': null,
        };

    test('fromJson يقرأ البلدة واسم العريس، وeventId يبقى int صفراً', () {
      final album = EventAlbum.fromJson(payload());

      expect(album.hasEvent, isFalse);
      expect(album.eventId, 0, reason: 'int لا null — صفراً حين لا مناسبة');
      expect(album.town, 'رهط', reason: 'البلدة أعلى الكائن، لا في event الغائب');
      expect(album.honoreeName, 'أحمد أبو سليمان');
      expect(album.personName, 'أحمد أبو سليمان');
      expect(album.eventTitle, isNull);
      expect(album.eventDate, isNull);
      expect(album.contextLine, 'أحمد أبو سليمان · رهط');
      expect(album.detailLine, 'أحمد أبو سليمان · رهط');
    });

    test('رسالة المشاركة: العنوان — البلدة، بلا فاصل معلّق ولا سطر فارغ', () {
      final message = albumShareMessage(EventAlbum.fromJson(payload()));
      final lines = message.split('\n');

      expect(lines, hasLength(2));
      expect(lines.first, 'عرس أحمد أبو سليمان — رهط',
          reason: 'المناسبة غابت فبقي العنوان والبلدة — لا « · » معلّقة');
      expect(lines.last, 'https://munasbat.test/a/21');
      expect(lines.first.contains(' · '), isFalse);
      expect(message.contains('— \n'), isFalse);
      expect(message.contains('null'), isFalse);
    });

    test('بلا بلدة أيضاً: البلدة تسقط ولا يبقى فاصل', () {
      final album = EventAlbum.fromJson(payload(town: null));

      expect(album.town, isNull);
      expect(album.contextLine, 'أحمد أبو سليمان',
          reason: 'السطر الثاني يبقى اسماً لا فراغاً');
      expect(albumShareMessage(album).split('\n').first, 'عرس أحمد أبو سليمان',
          reason: 'عنوان لا بلدة — بلا «—» في آخره');
    });

    test('سقوط person.name حين يغيب honoree_name', () {
      final album = EventAlbum.fromJson({
        'id': 22,
        'event_id': null,
        'title': 'عرس سالم',
        'town': 'تل السبع',
        'honoree_name': null,
        'person': {'id': 10, 'name': 'سالم أبو كف'},
        'event': null,
      });

      expect(album.hasEvent, isFalse);
      expect(album.honoreeName, isNull);
      expect(album.personName, 'سالم أبو كف');
      expect(album.contextLine, 'سالم أبو كف · تل السبع');
    });

    test('ألبوم المناسبة كما هو: event كامل، وشكل السطر لا يتغيّر', () {
      final album = EventAlbum.fromJson({
        'id': 11,
        'event_id': 5,
        'title': 'ألبوم الحنّة',
        'town': 'رهط',
        'honoree_name': null,
        'person': null,
        'event': {
          'id': 5,
          'title': 'عرس أحمد',
          'town': 'رهط',
          'event_date': '2025-05-01',
        },
      });

      expect(album.hasEvent, isTrue);
      expect(album.eventId, 5);
      expect(album.eventTitle, 'عرس أحمد');
      expect(album.eventDate, '2025-05-01');
      expect(album.honoreeName, isNull);
      expect(album.personName, isNull);
      expect(album.contextLine, 'عرس أحمد · رهط',
          reason: 'بلدة المناسبة نفسها من أعلى الكائن — لا تكرار');
      expect(album.detailLine, 'عرس أحمد · رهط · 2025-05-01',
          reason: 'التاريخ في رأس التفاصيل وحده');
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

    test('albumShareMessage: العنوان — المناسبة · البلدة، ثم الرابط', () {
      // عنوانٌ لا يحتوي بلدةً ولا مناسبة: وإلّا لمرّ التأكيد من العنوان وحده
      // ولم يكشف حذف سطر المناسبة (Q10/D8).
      final message = albumShareMessage(const EventAlbum(
        id: 11,
        eventId: 5,
        title: 'ألبوم الحنّة',
        town: 'رهط',
        eventTitle: 'عرس أحمد',
        shareUrl: 'https://munasbat.test/a/11',
      ));
      expect(message, startsWith('ألبوم الحنّة — عرس أحمد · رهط'));
      expect(message, contains('\nhttps://munasbat.test/a/11'));

      final noPlace = albumShareMessage(const EventAlbum(
        id: 11,
        eventId: 5,
        title: 'ألبوم الحنّة',
        shareUrl: 'https://munasbat.test/a/11',
      ));
      expect(noPlace, startsWith('ألبوم الحنّة\n'),
          reason: 'بلا مناسبة ولا بلدة لا فاصل معلّق');
    });

    test('photoShareUrl صفحة الصورة، ورسالتها عنوانها التعليق أو بديله', () {
      final photo = EventPhoto(
        id: 7,
        albumId: 11,
        imageUrl: 'https://cdn.test/full.jpg',
        caption: 'صورة القاعة',
      );
      final url = photoShareUrl(photo);
      expect(Uri.parse(url).path, '/p/7');
      expect(url.contains('#'), isFalse, reason: 'ما بعد # لا ينتج معاينة');
      expect(photoShareMessage(photo), contains('صورة القاعة'));

      // رابط الخادم يُفضّل حين يصل، كالألبوم تماماً.
      const withShare = EventPhoto(
        id: 8,
        albumId: 11,
        imageUrl: 'https://cdn.test/x.jpg',
        shareUrl: 'https://munasbat.test/p/8',
      );
      expect(photoShareUrl(withShare), 'https://munasbat.test/p/8');

      final untitled = EventPhoto(
        id: 9,
        albumId: 11,
        imageUrl: 'https://cdn.test/y.jpg',
        albumTitle: 'ألبوم الحنّة',
        eventTitle: 'عرس أحمد',
      );
      expect(photoShareMessage(untitled), startsWith('ألبوم الحنّة — عرس أحمد'),
          reason: 'بلا تعليق: عنوان الألبوم والمناسبة، لا «ألبوم عرس»');
    });
  });

  group('فيديوهات الألبوم (T-12)', () {
    test('videoShareUrl: صفحة /v/<id> على نطاق الخادم لا رابط المنصّة الخام', () {
      final url = videoShareUrl(const EventVideo(
        id: 12,
        provider: 'youtube',
        title: 'زفّة أحمد',
        externalUrl: 'https://www.youtube.com/watch?v=abc',
      ));

      expect(url, endsWith('/v/12'));
      expect(url, startsWith(AppConfig.apiBase));
      expect(Uri.parse(url).path, '/v/12');
      expect(url.contains('youtube'), isFalse,
          reason: 'رابط يوتيوب الخام لا ينتج معاينة «اعراسنا»');
    });

    test('videoShareMessage: عنوان الفيديو ثم الرابط، أو «فيديو من الألبوم»', () {
      const video = EventVideo(id: 12, provider: 'youtube', title: 'زفّة أحمد');
      final message = videoShareMessage(video, albumTitle: 'ألبوم الحنّة');
      final lines = message.split('\n');

      expect(lines, hasLength(2));
      expect(lines.first, 'زفّة أحمد', reason: 'العنوان يبدأ الرسالة');
      expect(lines.last, endsWith('/v/12'));
      expect(message.contains('null'), isFalse);

      // بلا عنوان: «فيديو من <عنوان الألبوم>» — لا سطر فارغ ولا «null».
      const untitled = EventVideo(id: 13, provider: 'tiktok');
      expect(
        videoShareMessage(untitled, albumTitle: 'ألبوم الحنّة').split('\n').first,
        'فيديو من ألبوم الحنّة',
      );
      expect(
        videoShareMessage(untitled).split('\n').first,
        'فيديو من ألبوم العرس',
        reason: 'بلا عنوان ألبوم أيضاً: البديل العام لا فراغ',
      );
      expect(videoShareMessage(const EventVideo(id: 14, title: '')).split('\n').first,
          'فيديو من ألبوم العرس', reason: 'عنوان فارغ كالغائب');
    });

    test('EventVideo.fromJson يقرأ الحقول، والغائب null', () {
      final video = EventVideo.fromJson({
        'id': 7,
        'provider': 'tiktok',
        'title': 'مقطع العرس',
        'external_url': 'https://www.tiktok.com/@x/video/1',
        'thumb_url': 'https://cdn.test/v7.jpg',
        'position': 0,
        'created_at': '2026-10-01T10:00:00.000Z',
      });

      expect(video.id, 7);
      expect(video.provider, 'tiktok');
      expect(video.title, 'مقطع العرس');
      expect(video.externalUrl, 'https://www.tiktok.com/@x/video/1');
      expect(video.thumbUrl, 'https://cdn.test/v7.jpg');

      final bare = EventVideo.fromJson({'id': 8, 'thumb_url': null});
      expect(bare.id, 8);
      expect(bare.provider, isNull);
      expect(bare.title, isNull);
      expect(bare.externalUrl, isNull);
      expect(bare.thumbUrl, isNull);
      expect(bare.providerLabel, 'فيديو');
    });

    test('providerLabel: اسم كل منصّة بالعربية، والمجهول «فيديو»', () {
      String label(String? provider) =>
          EventVideo(id: 1, provider: provider).providerLabel;

      expect(label('youtube'), 'يوتيوب');
      expect(label('tiktok'), 'تيك توك');
      expect(label('facebook'), 'فيسبوك');
      expect(label('instagram'), 'إنستغرام');
      expect(label('website'), 'الموقع');
      expect(label('vimeo'), 'فيديو', reason: 'منصّة لم تُعرَف: وسمٌ عام لا null');
      expect(label(null), 'فيديو');
    });
  });
}
