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
/// `/api/albums/11` ألبوماً بصورةٍ وفيديوهين، و`/api/albums/12` ألبوماً بلا مفتاح
/// `videos` أصلاً (خادمٌ لم يُحدَّث بعد)، و`/api/albums/14` ألبوماً بلا صور وفيه
/// فيديو واحد، و`/api/albums/15` بلا صورةٍ ولا فيديو، و`/api/albums` قائمةً فيها
/// ألبومٌ لا صور معتمدة فيه وفيه فيديوهان (وجه الألبوم الذي صار يظهر).
NegevApi _api() {
  http.Response json(Object body) => http.Response(
        jsonEncode(body),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  const Map<String, Object?> video7 = {
    'id': 7,
    'provider': 'youtube',
    'title': 'زفّة أحمد',
    'external_url': 'https://www.youtube.com/watch?v=abc',
    'thumb_url': 'https://cdn.test/v7.jpg',
    'position': 0,
    'created_at': '2026-10-01T10:00:00.000Z'
  };
  const Map<String, Object?> video8 = {
    'id': 8,
    'provider': 'tiktok',
    'title': 'رقصة العرس',
    'external_url': 'https://www.tiktok.com/@x/video/2',
    'thumb_url': null,
    'position': 1,
    'created_at': '2026-10-01T11:00:00.000Z'
  };

  final client = MockClient((request) async {
    final path = request.url.path;
    if (path.endsWith('/api/albums/12')) {
      return json({
        'success': true,
        'album': {'id': 12, 'event_id': 5, 'title': 'ألبوم الحنّة', 'photo_count': 1},
        'photos': [
          {'id': 9, 'album_id': 12, 'image_url': 'https://cdn.test/p.jpg', 'tags': []}
        ],
        'pagination': {'page': 1, 'limit': 24, 'total': 1, 'totalPages': 1}
      });
    }
    if (path.endsWith('/api/albums/14')) {
      return json({
        'success': true,
        'album': {
          'id': 14,
          'event_id': 5,
          'title': 'ألبوم الزفّة',
          'photo_count': 0,
          'video_count': 1,
        },
        'photos': [],
        'videos': [video7],
        'pagination': {'page': 1, 'limit': 24, 'total': 0, 'totalPages': 0}
      });
    }
    if (path.endsWith('/api/albums/15')) {
      return json({
        'success': true,
        'album': {
          'id': 15,
          'event_id': 5,
          'title': 'ألبوم العرس',
          'photo_count': 0,
          'video_count': 0,
        },
        'photos': [],
        'pagination': {'page': 1, 'limit': 24, 'total': 0, 'totalPages': 0}
      });
    }
    if (path.endsWith('/api/albums')) {
      return json({
        'success': true,
        'albums': [
          {
            'id': 13,
            'event_id': 5,
            'title': 'ألبوم الفيديو',
            'photo_count': 0,
            'video_count': 2,
          }
        ],
        'pagination': {'page': 1, 'limit': 30, 'total': 1, 'totalPages': 1}
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
      'videos': [video7, video8],
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

    // شبكة الصور باقية كما هي تحت الشريط، والعدّ يبقى عدّ الصور: صورةٌ وفيديوهان
    // ليست «3» ولا صيغةً تجمع الاثنين.
    expect(find.text('1 صورة'), findsOneWidget);
    expect(find.text('2 فيديو'), findsNothing,
        reason: 'وجود صورة يحسم العدّ — لا «صورة وفيديو» مجموعين');
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

  // ألبومٌ لا صورة معتمدة فيه وفيه فيديو صار يظهر في `GET /api/albums`،
  // فبطاقته في القائمة تَعُدّ ما فيه فعلاً بدل «0 صورة».
  testWidgets('ألبوم بلا صور وفيه فيديوهان: بطاقة القائمة «2 فيديو» لا «0 صورة»',
      (tester) async {
    final api = _api();
    await tester.pumpWidget(_wrap(const AlbumsScreen(), api));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('ألبوم الفيديو'), findsOneWidget);
    expect(find.text('2 فيديو'), findsOneWidget,
        reason: 'عدّ الفيديوهات المعتمدة حين لا صورة تحسم العدّ');
    expect(find.text('0 صورة'), findsNothing,
        reason: '«0 صورة» لألبومٍ فيه فيديو معتمد كذبٌ صريح');
  });

  testWidgets('رأس تفاصيل ألبوم بلا صور وفيديو واحد: «1 فيديو»',
      (tester) async {
    final api = _api();
    await tester.pumpWidget(
      _wrap(
        const AlbumDetailScreen(
          album: EventAlbum(id: 14, eventId: 5, title: 'ألبوم الزفّة'),
        ),
        api,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('1 فيديو'), findsOneWidget);
    expect(find.text('0 صورة'), findsNothing,
        reason: 'الرأس يعدّ الفيديو لا الصور حين لا صور');
    expect(find.text('لا صور في هذا الألبوم بعد — فيديوهاته في الأعلى.'),
        findsOneWidget,
        reason: 'شبكةٌ بلا صور في ألبومٍ فيه فيديو تحيل إلى الشريط فوقها');
  });

  testWidgets('ألبوم بلا صورة ولا فيديو: نصّ الحالة القديم حرفياً و«0 صورة»',
      (tester) async {
    final api = _api();
    await tester.pumpWidget(
      _wrap(
        const AlbumDetailScreen(
          album: EventAlbum(id: 15, eventId: 5, title: 'ألبوم العرس'),
        ),
        api,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('0 صورة'), findsOneWidget,
        reason: 'لا صورة ولا فيديو: «0 صورة» صحيحة كما كانت');
    expect(find.text('الألبوم موجود لكن لا صور معتمدة فيه بعد.'), findsOneWidget,
        reason: 'بلا فيديو يبقى النصّ كما هو — لا إحالة إلى شريط غائب');
    expect(find.text('لا صور في هذا الألبوم بعد — فيديوهاته في الأعلى.'),
        findsNothing);
  });
}
