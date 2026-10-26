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

/// شريط فيديوهات الألبوم (T-12): بطاقةٌ لكل فيديو بغلافها ووسم منصّتها، وزرّ
/// مشاركة — ونقرُ البطاقة لا يُضغط هنا: يفتح تطبيقاً خارجياً عبر قناة منصّة.
///
/// `/api/albums/11` يخدم ألبوماً بفيديوهين، و`/api/albums/12` ألبوماً بلا مفتاح
/// `videos` أصلاً (خادمٌ لم يُحدَّث بعد).
NegevApi _api() {
  http.Response json(Object body) => http.Response(
        jsonEncode(body),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/albums/12')) {
      return json({
        'success': true,
        'album': {'id': 12, 'event_id': 5, 'title': 'ألبوم الحنّة', 'photo_count': 1},
        'photos': [
          {'id': 9, 'album_id': 12, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
        ],
        'pagination': {'page': 1, 'limit': 24, 'total': 1, 'totalPages': 1}
      });
    }
    return json({
      'success': true,
      'album': {
        'id': 11,
        'event_id': 5,
        'title': 'ألبوم الحنّة',
        'photo_count': 1,
        'video_count': 2,
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
    });
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

/// كل مفاتيح بطاقات الفيديو (`album_video_<id>` و`album_video_share_<id>`) —
/// للتحقّق من الغياب الكامل لا من معرّف واحد.
Finder _videoKeys() => find.byWidgetPredicate(
      (widget) {
        final key = widget.key;
        return key is ValueKey<String> && key.value.startsWith('album_video_');
      },
      description: 'مفتاح بطاقة فيديو',
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('ألبوم بفيديوهين: شريط البطاقات بعنوانها ووسمها وزرّ مشاركتها',
      (tester) async {
    final api = _api();
    await tester.pumpWidget(
      _wrap(
        const AlbumDetailScreen(
          album: EventAlbum(id: 11, eventId: 5, title: 'ألبوم الحنّة'),
        ),
        api,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    final card = find.byKey(const Key('album_video_7'));
    expect(card, findsOneWidget);
    expect(
      find.descendant(of: card, matching: find.text('زفّة أحمد')),
      findsOneWidget,
      reason: 'عنوان الفيديو سطرٌ في بطاقته',
    );
    expect(
      find.descendant(of: card, matching: find.text('يوتيوب')),
      findsOneWidget,
      reason: 'وسم المنصّة بالعربية من providerLabel',
    );
    expect(find.byKey(const Key('album_video_8')), findsOneWidget);

    // الوجود وحده لا يكفي: زرٌّ معطّل يمرّ منه — والنداء نفسه لا يُضغط لأن
    // ورقة مشاركة النظام لا تُختبر هنا.
    final share = find.byKey(const Key('album_video_share_7'));
    expect(share, findsOneWidget);
    expect(tester.widget<IconButton>(share).onPressed, isNotNull);

    // شبكة الصور باقية كما هي تحت الشريط.
    expect(find.text('1 صورة'), findsOneWidget);
  });

  testWidgets('ألبوم بلا فيديوهات: لا بطاقة ولا مفتاح فيديو', (tester) async {
    final api = _api();
    await tester.pumpWidget(
      _wrap(
        const AlbumDetailScreen(
          album: EventAlbum(id: 12, eventId: 5, title: 'ألبوم الحنّة'),
        ),
        api,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(_videoKeys(), findsNothing,
        reason: 'غياب videos يعني شريطاً غائباً لا شريطاً فارغاً');
    expect(find.text('يوتيوب'), findsNothing);
    expect(find.text('1 صورة'), findsOneWidget, reason: 'رأس الألبوم لم يتغيّر');
  });
}
