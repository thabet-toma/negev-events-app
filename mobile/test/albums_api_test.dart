import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';

void main() {
  group('نداءات ألبومات الأعراس (ADR-0009)', () {
    test('albums يبني /api/albums بالترقيم، وalbumDetails يقرأ الصور', () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        if (request.url.path == '/api/albums') {
          return http.Response(jsonEncode({
            'success': true,
            'albums': [
              {'id': 11, 'event_id': 5, 'title': 'ألبوم', 'photo_count': 1}
            ],
            'pagination': {'page': 1, 'limit': 12, 'total': 1, 'totalPages': 1}
          }), 200, headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response(jsonEncode({
          'success': true,
          'album': {'id': 11, 'event_id': 5, 'title': 'ألبوم', 'photo_count': 1},
          'photos': [
            {'id': 7, 'album_id': 11, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
          ],
          'pagination': {'page': 1, 'limit': 24, 'total': 1, 'totalPages': 1}
        }), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final api = NegevApi(ApiClient(client: client));
      final albums = await api.albums(page: 1, limit: 12);
      expect(albums.albums.single.title, 'ألبوم');
      expect(requests.last.url.path, '/api/albums');
      expect(requests.last.url.queryParameters['page'], '1');

      final details = await api.albumDetails(11);
      expect(details.photos.single.id, 7);
      expect(requests.last.url.path, '/api/albums/11');
    });

    test('photo وperson يقرآن حمولتهما بلا رمز (مساران عامّان)', () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        if (request.url.path == '/api/photos/7') {
          return http.Response(
            jsonEncode({
              'success': true,
              'photo': {
                'id': 7,
                'album_id': 11,
                'image_url': 'https://cdn.test/p.jpg',
                'share_url': 'https://munasbat.test/p/7'
              }
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({
            'success': true,
            'person': {
              'id': 21,
              'name': 'فاطمة',
              'name_key': 'فاطمه',
              'photos_count': 1,
              'albums_count': 1,
              'photos': [
                {'id': 7, 'album_id': 11, 'image_url': 'https://cdn.test/p.jpg'}
              ],
              'albums': [
                {'id': 11, 'event_id': 5, 'title': 'ألبوم'}
              ],
              'events': [
                {'id': 5, 'title': 'عرس أحمد', 'town': 'رهط', 'event_date': '2025-05-01'}
              ],
              'pagination': {'page': 1, 'limit': 48, 'total': 49, 'totalPages': 2}
            }
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final raw = ApiClient(client: client)..token = 'site-token';
      final api = NegevApi(raw);

      final photo = await api.photo(7);
      expect(photo.id, 7);
      expect(photo.shareUrl, 'https://munasbat.test/p/7');
      expect(requests.last.url.path, '/api/photos/7');
      expect(requests.last.headers['Authorization'], isNull,
          reason: 'مسار عام: لا رمز يُرسل');

      final person = await api.person(21);
      expect(person.name, 'فاطمة');
      expect(person.photos.single.id, 7);
      expect(person.albums.single.title, 'ألبوم');
      expect(person.events.single.title, 'عرس أحمد');
      expect(person.photosCount, 1);
      expect(person.albumsCount, 1);
      // صفحتان في الحمولة: القيمة تسقط لو لم يُقرأ `pagination` أصلاً (فالبديل
      // `totalPages: 0`)، بخلاف `isFalse` التي كانت تمرّ في الحالتين.
      expect(person.hasMore, isTrue);
      expect(requests.last.url.path, '/api/people/21');
      expect(requests.last.headers['Authorization'], isNull);
    });

    test('myPhotos وtagPhoto وreportPhoto ترسل رمز الدخول الصحيح', () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode({
          'success': true,
          'photos': [],
          'pagination': {'page': 1, 'limit': 24, 'total': 0, 'totalPages': 0}
        }), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });

      final raw = ApiClient(client: client)..token = 'site-token';
      final api = NegevApi(raw);
      await api.myPhotos();
      expect(requests.last.url.path, '/api/my-photos');
      expect(requests.last.headers['Authorization'], 'Bearer site-token');

      await api.tagPhoto(7);
      expect(requests.last.method, 'POST');
      expect(requests.last.url.path, '/api/photos/7/tags');
      expect(requests.last.headers['Authorization'], 'Bearer site-token');
      // الاستدعاء القديم بلا وسائط يبقى صالحاً: النصّان فارغان (NULL على
      // الخادم) ولا تأكيد رقم لم يفعله المستخدم.
      final tagBody = jsonDecode(requests.last.body) as Map<String, dynamic>;
      expect(tagBody['self_description'], '');
      expect(tagBody['caption_suggestion'], '');
      expect(tagBody['confirm_phone'], isFalse);

      await api.reportPhoto(7, reason: 'privacy');
      expect(requests.last.url.path, '/api/photos/7/reports');
      expect(jsonDecode(requests.last.body)['reason'], 'privacy');
    });

    test('albumDetails يقرأ videos بالترتيب، وغيابها قائمة فارغة', () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        if (request.url.path == '/api/albums/12') {
          // خادمٌ لا يعرف الفيديوهات بعد: المفتاح غائب لا null.
          return http.Response(
            jsonEncode({
              'success': true,
              'album': {'id': 12, 'event_id': 5, 'title': 'ألبوم قديم', 'photo_count': 0},
              'photos': [],
              'pagination': {'page': 1, 'limit': 24, 'total': 0, 'totalPages': 0}
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        return http.Response(
          jsonEncode({
            'success': true,
            'album': {
              'id': 11,
              'event_id': 5,
              'title': 'ألبوم الحنّة',
              'photo_count': 1,
              'video_count': 2
            },
            'photos': [
              {'id': 7, 'album_id': 11, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
            ],
            'videos': [
              {
                'id': 7,
                'provider': 'youtube',
                'title': 'زفّة أحمد',
                'external_url': 'https://www.youtube.com/watch?v=abc',
                'thumb_url': 'https://cdn.test/v7.jpg',
                'position': 0,
                'created_at': '2026-10-01T10:00:00.000Z'
              },
              {
                'id': 8,
                'provider': 'tiktok',
                'title': 'رقصة العرس',
                'external_url': 'https://www.tiktok.com/@x/video/2',
                'thumb_url': null,
                'position': 1,
                'created_at': '2026-10-01T11:00:00.000Z'
              }
            ],
            'pagination': {'page': 1, 'limit': 24, 'total': 1, 'totalPages': 1}
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });

      final api = NegevApi(ApiClient(client: client));

      final details = await api.albumDetails(11);
      expect(requests.last.url.path, '/api/albums/11');
      // الترتيب من الخادم (`position`) لا من العميل: معرّفا الفيديو بالترتيب.
      expect(details.videos.map((video) => video.id), [7, 8]);
      expect(details.videos.first.title, 'زفّة أحمد');
      expect(details.videos.first.providerLabel, 'يوتيوب');
      expect(details.videos.first.thumbUrl, 'https://cdn.test/v7.jpg');
      expect(details.videos.last.thumbUrl, isNull,
          reason: 'المصغّرة الغائبة null لا سلسلة فارغة');
      expect(details.photos.single.id, 7, reason: 'الصور لم تُلمس');

      final bare = await api.albumDetails(12);
      expect(bare.videos, isEmpty,
          reason: 'غياب المفتاح يعني ألبوماً بلا فيديوهات لا انهياراً');
    });
  });
}
