import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/story_viewer_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// بطاقة الدخول التسويقية (T-14): قصة واحدة تظهر **مرّة** عند فتح التغذية،
/// تشير إلى الستوري، وتختفي بمؤقّت ٣ ثوانٍ أو بزرّ إغلاقها.
///
/// الخادم جاهز (`GET /api/stories/entry-card`) ولا يُلمس هنا: الردّ يُصنَّع
/// بالعقد الموثَّق نفسه — `{ success, enabled, source, story }`، و`story` بشكل
/// `GET /api/stories`.

const String _title = 'دحة الليلة في رهط';

Map<String, dynamic> _story({String title = _title, String? image}) => {
      'id': 7,
      'title': title,
      'clan': 'آل فلان',
      'town': 'رهط',
      'image': image ?? 'https://cdn.test/story7.jpg',
      'isLive': false,
      'is_ad': false,
      'target_url': null,
      'link_platform': null,
    };

/// خادم وهمي: `entry-card` بالجسم المُمرَّر، وتغذية فارغة بترقيمها، وستوريات
/// وأنواع مناسبات فارغة، وأي مسار آخر `{ success: true }` — لا شيء خارج نطاق
/// البطاقة يُختبر هنا. [requests] يلتقط كل طلب.
NegevApi _api(Map<String, dynamic> entryCard, {List<Uri>? requests}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    final path = request.url.path;
    Object body = {'success': true};
    if (path.endsWith('/api/stories/entry-card')) {
      body = entryCard;
    } else if (path.endsWith('/api/events')) {
      body = {
        'success': true,
        'events': <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
        'announcements': <Map<String, dynamic>>[],
      };
    } else if (path.endsWith('/api/stories')) {
      body = {'success': true, 'stories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/occasion-types')) {
      body = {'success': true, 'types': <Map<String, dynamic>>[]};
    }
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

/// `AppServices` فوق `MaterialApp` — موضعه في `main.dart` — لأنّ عارض الستوري
/// شاشة مدفوعة تحتاجه من خارج مسار التغذية.
Future<void> _pumpFeed(WidgetTester tester, NegevApi api) async {
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: EventsScreen(),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pumpAndSettle();
}

Map<String, dynamic> _enabledCard() => {
      'success': true,
      'enabled': true,
      'source': 'auto',
      'story': _story(),
    };

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'قصة البطاقة تظهر بعنوانها وزرّ «شاهد الآن»، وتختفي بعد ثلاث ثوانٍ',
    (tester) async {
      await _pumpFeed(tester, _api(_enabledCard()));

      expect(find.byKey(const Key('home_entry_card')), findsOneWidget);
      expect(find.text(_title), findsOneWidget, reason: 'عنوان القصة على البطاقة');
      expect(find.byKey(const Key('home_entry_card_cta')), findsOneWidget);
      expect(find.text('شاهد الآن'), findsOneWidget);
      expect(
        find.textContaining('من أول ستوري فوق'),
        findsOneWidget,
        reason: 'السطر الصغير يقول أين الستوري الذي تشير إليه البطاقة',
      );

      // حارس الموضع: البطاقة **تحت** شريط الستوريات لا عائمة فوقه. حين كانت
      // `Positioned` في الـStack كانت تغطّي لثلاث ثوانٍ رأسَ التغذية وشريط
      // الستوريات ورقاقة الألبومات — وهي تشير إلى أوّل حلقة في ذلك الشريط.
      // العودة إلى الطفو تُسقط هذا التأكيد (`cardTop < stripBottom`).
      final stripBottom =
          tester.getBottomLeft(find.byKey(const Key('stories_strip'))).dy;
      final cardTop =
          tester.getTopLeft(find.byKey(const Key('home_entry_card'))).dy;
      expect(
        cardTop,
        greaterThanOrEqualTo(stripBottom),
        reason: 'أعلى البطاقة تحت أسفل شريط الستوريات',
      );

      // المؤقّت ثلاث ثوانٍ؛ أربعٌ تكفيه، والبطاقة تغيب بلا نقر.
      await tester.pump(const Duration(seconds: 4));
      expect(find.byKey(const Key('home_entry_card')), findsNothing);
    },
  );

  testWidgets(
    'enabled:false لا يرسم بطاقة إطلاقاً، لكن النداء وقعه مرّة واحدة',
    (tester) async {
      final requests = <Uri>[];
      await _pumpFeed(
        tester,
        _api(
          {'success': true, 'enabled': false, 'source': null, 'story': null},
          requests: requests,
        ),
      );

      expect(find.byKey(const Key('home_entry_card')), findsNothing);
      // مرساة موجِبة: الغياب يعني «سألنا فأجاب الخادم لا» لا «لم نسأل».
      expect(
        requests.where((u) => u.path.endsWith('/api/stories/entry-card')),
        hasLength(1),
      );

      await tester.pump(const Duration(seconds: 4));
      expect(
        find.byKey(const Key('home_entry_card')),
        findsNothing,
        reason: 'لا بطاقة تتسلّل بعد مهلة المؤقّت',
      );
    },
  );

  testWidgets('زرّ الإغلاق يخفي البطاقة فوراً', (tester) async {
    await _pumpFeed(tester, _api(_enabledCard()));
    expect(find.byKey(const Key('home_entry_card')), findsOneWidget);

    await tester.tap(find.byKey(const Key('home_entry_card_close')));
    await tester.pump();

    expect(find.byKey(const Key('home_entry_card')), findsNothing);
  });

  testWidgets('زرّ «شاهد الآن» يفتح العارض على قصة البطاقة وحدها ويخفيها',
      (tester) async {
    await _pumpFeed(tester, _api(_enabledCard()));
    expect(find.byKey(const Key('home_entry_card')), findsOneWidget);

    await tester.tap(find.byKey(const Key('home_entry_card_cta')));
    await tester.pump();
    // حركة الانتقال وحدها — لا `pumpAndSettle`: العارض يقدّم شرائحه بمؤقّت
    // خاص به فيُغلق نفسه في نهايته.
    await tester.pump(const Duration(milliseconds: 400));

    final viewer = tester.widget<StoryViewerScreen>(
      find.byType(StoryViewerScreen),
    );
    expect(viewer.stories, hasLength(1));
    expect(viewer.stories.single.title, _title);
    expect(viewer.initialIndex, 0);
    expect(
      find.byKey(const Key('home_entry_card')),
      findsNothing,
      reason: 'البطاقة مدخل لا شريط — تُخفى بعد فتح العارض',
    );
  });
}
