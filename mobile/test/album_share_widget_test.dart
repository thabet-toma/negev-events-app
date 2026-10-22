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
NegevApi _api({bool personWithoutAlbums = false}) {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/people/21')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'person': {
            'id': 21,
            'name': 'فاطمة الوسم',
            'name_key': 'فاطمه الوسم',
            'photos_count': personWithoutAlbums ? 0 : 1,
            'albums_count': 1,
            'photos': personWithoutAlbums
                ? []
                : [
                    {'id': 7, 'album_id': 11, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
                  ],
            'albums': personWithoutAlbums
                ? []
                : [
                    {'id': 11, 'event_id': 5, 'title': 'ألبوم الحنّة', 'photo_count': 1}
                  ],
            'events': [
              {'id': 5, 'title': 'عرس أحمد', 'town': 'رهط', 'event_date': '2025-05-01'}
            ],
            'pagination': {
              'page': 1,
              'limit': 48,
              'total': personWithoutAlbums ? 0 : 1,
              'totalPages': 1
            }
          }
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
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
    // الوجود وحده لا يكفي: زرٌّ معطّل يمرّ منه. النداء نفسه لا يُختبر لأن
    // `SharePlus.instance` ساكن بلا مِفصل، والمنطق المختبَر في الدالّتين النقيّتين.
    final button = tester.widget<IconButton>(find.byKey(const Key('album_share_btn')));
    expect(button.onPressed, isNotNull);
    expect(button.tooltip, 'مشاركة');
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
    final button = tester.widget<OutlinedButton>(find.byKey(const Key('photo_share_btn')));
    expect(button.onPressed, isNotNull, reason: 'زرٌّ معطّل يمرّ من فحص الوجود');
  });

  testWidgets('شاشة الشخص ترسم الاسم وصوره وألبوماته', (tester) async {
    final api = _api();
    await tester.pumpWidget(_wrap(const PersonScreen(personId: 21), api));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('فاطمة الوسم'), findsWidgets);
    expect(find.text('ألبوم الحنّة'), findsWidgets, reason: 'بطاقة ألبوم مناسبتها');
    expect(find.byType(GridView), findsWidgets, reason: 'شبكة صورها');
  });

  testWidgets('شخص بلا ألبوم منشور: تُذكر مناسبتُه بدل صفحة فارغة', (tester) async {
    final api = _api(personWithoutAlbums: true);
    await tester.pumpWidget(_wrap(const PersonScreen(personId: 21), api));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('عرس أحمد'), findsWidgets,
        reason: 'اسم ورقمان بلا شيء تحتهما ممنوعان — المناسبة تُذكر');
  });
}
