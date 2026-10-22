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

      await api.reportPhoto(7, reason: 'privacy');
      expect(requests.last.url.path, '/api/photos/7/reports');
      expect(jsonDecode(requests.last.body)['reason'], 'privacy');
    });
  });
}
