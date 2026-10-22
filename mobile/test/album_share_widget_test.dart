import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/album.dart';
import 'package:negev_events/screens/albums_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// زرّا المشاركة (تذكرة #103): وجودُهما في الشاشتين هو ما يُختبر هنا — أمّا
/// ورقة النظام نفسها فلا تُختبر، ولهذا بُنيت الرابط والرسالة في دالّتين نقيّتين
/// يغطّيهما `albums_test.dart`.
NegevApi _api() {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/albums/11')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'album': {
            'id': 11,
            'event_id': 5,
            'title': 'عرس أحمد',
            'photo_count': 1,
            'share_url': 'https://munasbat.test/a/11'
          },
          'photos': [
            {'id': 7, 'album_id': 11, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
          ],
          'pagination': {'page': 1, 'limit': 24, 'total': 1, 'totalPages': 1}
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response(
      jsonEncode({'success': true}),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

Widget _wrap(Widget child, NegevApi api) => AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        home: Directionality(textDirection: TextDirection.rtl, child: child),
      ),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('تفاصيل الألبوم تعرض زرّ مشاركة', (tester) async {
    final api = _api();
    await tester.pumpWidget(
      _wrap(
        const AlbumDetailScreen(
          album: EventAlbum(id: 11, eventId: 5, title: 'عرس أحمد'),
        ),
        api,
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('album_share_btn')), findsOneWidget);
  });

  testWidgets('العارض يعرض زرّ مشاركة', (tester) async {
    final api = _api();
    final photos = [
      const EventPhoto(id: 7, albumId: 11, imageUrl: 'https://cdn.test/p.jpg')
    ];
    await tester.pumpWidget(
      _wrap(PhotoViewerScreen(photos: photos, initialIndex: 0), api),
    );
    await tester.pump();

    expect(find.byKey(const Key('photo_share_btn')), findsOneWidget);
    expect(find.text('مشاركة'), findsOneWidget);
  });
}
