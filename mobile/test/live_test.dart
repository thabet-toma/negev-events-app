import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/live.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/live_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

const _json = {'content-type': 'application/json; charset=utf-8'};

/// «لا شيء مضبوط» — ما يردّه الخادم فعلاً حين لم يضبط المالك قناة ولا بثّاً.
const Map<String, dynamic> _nothingConfigured = {
  'success': true,
  'profile_url': null,
  'live': null,
  'embed_url': null,
  'live_channel_url': null,
};

Map<String, dynamic> _activeLive({String? embedUrl}) => {
      'success': true,
      'profile_url': 'https://example.com/channel',
      'live': {
        'title': 'سهرة الخميس',
        'until': DateTime.now().toUtc().add(const Duration(hours: 1)).toIso8601String(),
        'url': 'https://example.com/live/123',
        'active': true,
      },
      'embed_url': embedUrl,
      'live_channel_url': 'https://example.com/channel',
    };

/// عميل وهمي يوجّه حسب المسار — نفس نمط feed_test.dart. `liveBody` ردّ
/// GET /api/live، و`hubBody` ردّ GET /api/live/hub، و`requests` يلتقط كل طلب.
NegevApi _api({
  Map<String, dynamic> liveBody = _nothingConfigured,
  Map<String, dynamic>? hubBody,
  Map<String, dynamic>? voteBody,
  List<http.Request>? requests,
}) {
  final client = MockClient((request) async {
    requests?.add(request);
    final path = request.url.path;
    Map<String, dynamic> body = {'success': true};
    if (path.endsWith('/api/live')) {
      body = liveBody;
    } else if (path.endsWith('/api/live/hub')) {
      body = hubBody ?? {...liveBody, 'today': null, 'previous': null, 'share_url': 'https://example.com/live'};
    } else if (path.contains('/api/live/episodes/') && path.endsWith('/vote')) {
      body = voteBody ?? {'success': true};
    } else if (path.endsWith('/api/auth/me')) {
      body = {
        'success': true,
        'user': {'id': 7, 'phone_number': '0500000000', 'full_name': 'مستخدم', 'role': 'user'},
      };
    } else if (path.endsWith('/api/stories')) {
      body = {'success': true, 'stories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/occasion-types')) {
      body = {'success': true, 'types': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/towns')) {
      body = {
        'success': true,
        'towns': ['الكل', 'رهط'],
        'villages': <Map<String, dynamic>>[],
        'town_coordinates': <String, dynamic>{},
        'stats': <Map<String, dynamic>>[],
      };
    } else if (path.endsWith('/api/events')) {
      body = {
        'success': true,
        'events': <Map<String, dynamic>>[],
        'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
        'announcements': <Map<String, dynamic>>[],
      };
    }
    return http.Response(jsonEncode(body), 200, headers: _json);
  });
  return NegevApi(ApiClient(client: client));
}

Future<AuthStore> _auth(NegevApi api, {bool signedIn = false}) async {
  SharedPreferences.setMockInitialValues(
    signedIn
        ? {
            'negev_token': 'test-token',
            'negev_user': jsonEncode({'id': 7, 'phone_number': '0500000000', 'full_name': 'مستخدم', 'role': 'user'}),
          }
        : {},
  );
  final auth = AuthStore(api);
  await auth.load();
  return auth;
}

Future<void> _pump(WidgetTester tester, NegevApi api, AuthStore auth, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServices(
          api: api,
          auth: auth,
          realtime: RealtimeService(),
          child: child,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

Map<String, dynamic> _hub({
  Map<String, dynamic>? live,
  Map<String, dynamic>? today,
  Map<String, dynamic>? previous,
}) =>
    {
      ...(live ?? _nothingConfigured),
      'today': today,
      'previous': previous,
      'share_url': 'https://example.com/live',
    };

const Map<String, dynamic> _todayWithPoll = {
  'id': 5,
  'date': '2026-09-26',
  'topic': 'الأعراس الكبيرة',
  'episode_question': 'هل تكلفة العرس مبالغ فيها؟',
  'poll': {
    'question': 'ما رأيك؟',
    'options': ['نعم', 'لا'],
    'my_vote': null,
  },
};

void main() {
  group('LiveHub.fromJson', () {
    test('embed_url موجود، واستفتاء بعد التصويت بنتائجه، ونتيجة الأمس', () {
      final hub = LiveHub.fromJson({
        ..._activeLive(embedUrl: 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1'),
        'today': {
          ..._todayWithPoll,
          'poll': {
            'question': 'ما رأيك؟',
            'options': ['نعم', 'لا'],
            'my_vote': 1,
            'results': [
              {'index': 0, 'label': 'نعم', 'votes': 1, 'percentage': 25},
              {'index': 1, 'label': 'لا', 'votes': 3, 'percentage': 75},
            ],
            'total_votes': 4,
          },
        },
        'previous': {
          'date': '2026-09-25',
          'poll_question': 'سؤال الأمس',
          'options': ['أ', 'ب'],
          'results': [
            {'index': 0, 'label': 'أ', 'votes': 2, 'percentage': 40},
            {'index': 1, 'label': 'ب', 'votes': 3, 'percentage': 60},
          ],
          'total_votes': 5,
        },
        'share_url': 'https://example.com/live',
      });

      expect(hub.channel.embedUrl, startsWith('https://www.youtube-nocookie.com/embed/'));
      expect(hub.channel.isLive, isTrue);
      expect(hub.channel.channelUrl, 'https://example.com/channel');
      expect(hub.today!.id, 5);
      expect(hub.today!.topic, 'الأعراس الكبيرة');
      expect(hub.today!.poll!.hasVoted, isTrue);
      expect(hub.today!.poll!.myVote, 1);
      expect(hub.today!.poll!.results!.map((r) => r.percentage), [25, 75]);
      expect(hub.today!.poll!.totalVotes, 4);
      expect(hub.previous!.question, 'سؤال الأمس');
      expect(hub.previous!.totalVotes, 5);
      expect(hub.shareUrl, 'https://example.com/live');
    });

    test('embed_url فارغ، وحلقة اليوم بلا استفتاء، ولا نتيجة أمس', () {
      final hub = LiveHub.fromJson({
        ..._activeLive(),
        'today': {'id': 9, 'date': '2026-09-26', 'topic': '', 'episode_question': null, 'poll': null},
        'previous': null,
      });

      expect(hub.channel.embedUrl, isNull);
      expect(hub.channel.live!.title, 'سهرة الخميس');
      expect(hub.today!.poll, isNull);
      // نصّ فارغ = غير موجود، فيُخفى في الصفحة.
      expect(hub.today!.topic, isNull);
      expect(hub.today!.episodeQuestion, isNull);
      expect(hub.previous, isNull);
    });

    test('استفتاء قبل التصويت بلا results ولا total_votes', () {
      final hub = LiveHub.fromJson({..._nothingConfigured, 'today': _todayWithPoll});
      final poll = hub.today!.poll!;
      expect(poll.options, ['نعم', 'لا']);
      expect(poll.hasVoted, isFalse);
      expect(poll.results, isNull);
      expect(poll.totalVotes, isNull);
    });

    test('كل الحقول غائبة أو null — لا رمية', () {
      final hub = LiveHub.fromJson(const {});
      expect(hub.channel.live, isNull);
      expect(hub.channel.embedUrl, isNull);
      expect(hub.channel.channelUrl, isNull);
      expect(hub.channel.isLive, isFalse);
      expect(hub.today, isNull);
      expect(hub.previous, isNull);
      expect(hub.shareUrl, isNull);
    });

    test('profile_url يُقرأ رابطاً للقناة إن غاب live_channel_url', () {
      final channel = LiveChannel.fromJson(const {'profile_url': 'https://example.com/c'});
      expect(channel.channelUrl, 'https://example.com/c');
    });
  });

  group('روابط البث', () {
    test('المشغّل من /live/embed و«ادخل البث» من /live/go — على أصل خادمنا', () {
      final client = ApiClient(client: MockClient((_) async => http.Response('', 404)));
      final api = NegevApi(client);
      final origin = client.buildUrl('/api/live').origin;
      expect(api.liveEmbedUrl.path, '/live/embed');
      expect(api.liveEmbedUrl.origin, origin);
      expect(api.liveGoUrl.path, '/live/go');
      expect(api.liveGoUrl.origin, origin);
    });
  });

  group('الكبسة الرابعة «البث المباشر»', () {
    Future<void> pumpButton(WidgetTester tester, LiveChannel? channel) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Center(child: LiveButton(channel: channel, onPressed: () {})),
          ),
        ),
      );
    }

    testWidgets('بلا بث: الكبسة ظاهرة بلا شارة «مباشر»', (tester) async {
      await pumpButton(tester, null);
      expect(find.byKey(const Key('live_button')), findsOneWidget);
      expect(find.byIcon(Icons.live_tv_rounded), findsOneWidget);
      expect(find.text('مباشر'), findsNothing);

      await pumpButton(tester, LiveChannel.fromJson(_nothingConfigured));
      expect(find.byKey(const Key('live_button')), findsOneWidget);
      expect(find.text('مباشر'), findsNothing);
    });

    testWidgets('بثّ نشِط: شارة «مباشر» ظاهرة', (tester) async {
      await pumpButton(tester, LiveChannel.fromJson(_activeLive()));
      expect(find.byKey(const Key('live_button')), findsOneWidget);
      expect(find.text('مباشر'), findsOneWidget);
    });

    testWidgets('الشارة تنطفئ وحدها عند until بلا ردّ جديد من الخادم', (tester) async {
      final json = _activeLive();
      (json['live'] as Map<String, dynamic>)['until'] =
          DateTime.now().toUtc().add(const Duration(minutes: 1)).toIso8601String();
      await pumpButton(tester, LiveChannel.fromJson(json));
      expect(find.text('مباشر'), findsOneWidget);

      await tester.pump(const Duration(minutes: 2));
      expect(find.byKey(const Key('live_button')), findsOneWidget);
      expect(find.text('مباشر'), findsNothing);
    });

    testWidgets('في التغذية بلا بث: الكبسة في الشريط العائم بلا شارة', (tester) async {
      final quiet = _api();
      await _pump(tester, quiet, await _auth(quiet), const EventsScreen());
      expect(find.byKey(const Key('live_button')), findsOneWidget);
      expect(find.text('مباشر'), findsNothing);
    });

    testWidgets('في التغذية مع بث: الكبسة في الشريط العائم بشارة «مباشر»', (tester) async {
      final live = _api(liveBody: _activeLive());
      await _pump(tester, live, await _auth(live), const EventsScreen());
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byKey(const Key('live_button')), findsOneWidget);
      expect(find.text('مباشر'), findsOneWidget);
    });
  });

  testWidgets('هاتف ضيّق (٣٦٠) ومسجَّل مع بث: الشريط العائم لا يفيض', (tester) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final api = _api(liveBody: _activeLive());
    await _pump(tester, api, await _auth(api, signedIn: true), const EventsScreen());
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byTooltip('الإشعارات'), findsOneWidget);
    expect(find.text('مباشر'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  group('LiveScreen', () {
    testWidgets('بثّ غير قابل للتضمين: «ادخل البث» بلا WebView', (tester) async {
      final api = _api(hubBody: _hub(live: _activeLive()));
      await _pump(tester, api, await _auth(api), const LiveScreen());

      expect(find.text('ادخل البث'), findsOneWidget);
      expect(find.text('سهرة الخميس'), findsWidgets);
      expect(find.byType(WebViewWidget), findsNothing);
      expect(find.text('لا يوجد بث الآن'), findsNothing);
      // لا حلقة اليوم ولا نتيجة أمس — القسمان مخفيّان.
      expect(find.text('نقاش التطبيق'), findsNothing);
      expect(find.text('نتيجة نقاش الأمس'), findsNothing);
    });

    testWidgets('لا بث: «لا يوجد بث الآن» و«قناتنا» حين رابط القناة محفوظ', (tester) async {
      final api = _api(
        hubBody: _hub(live: {..._nothingConfigured, 'live_channel_url': 'https://example.com/channel'}),
      );
      await _pump(tester, api, await _auth(api), const LiveScreen());

      expect(find.text('لا يوجد بث الآن'), findsOneWidget);
      expect(find.text('قناتنا'), findsOneWidget);
      expect(find.text('ادخل البث'), findsNothing);
      expect(find.byType(WebViewWidget), findsNothing);
    });

    testWidgets('زائر يكبس خياراً: حاجز الدخول ولا طلب تصويت', (tester) async {
      final requests = <http.Request>[];
      final api = _api(hubBody: _hub(today: _todayWithPoll), requests: requests);
      await _pump(tester, api, await _auth(api), const LiveScreen());

      expect(find.text('موضوع اليوم'), findsOneWidget);
      expect(find.text('هل تكلفة العرس مبالغ فيها؟'), findsOneWidget);
      expect(find.text('نقاش التطبيق'), findsOneWidget);
      expect(find.text('ما رأيك؟'), findsOneWidget);

      await tester.tap(find.text('نعم'));
      await tester.pumpAndSettle();

      expect(find.text('سجّل الدخول لتشارك في نقاش اليوم'), findsOneWidget);
      expect(requests.where((r) => r.url.path.endsWith('/vote')), isEmpty);
    });

    testWidgets('مسجَّل يصوّت: طلب برمزه ثم أشرطة بالنسب وعدد المشاركين', (tester) async {
      final requests = <http.Request>[];
      final api = _api(
        hubBody: _hub(today: _todayWithPoll),
        voteBody: {
          'success': true,
          'poll': {
            'question': 'ما رأيك؟',
            'options': ['نعم', 'لا'],
            'my_vote': 0,
            'results': [
              {'index': 0, 'label': 'نعم', 'votes': 3, 'percentage': 60},
              {'index': 1, 'label': 'لا', 'votes': 2, 'percentage': 40},
            ],
            'total_votes': 5,
          },
        },
        requests: requests,
      );
      await _pump(tester, api, await _auth(api, signedIn: true), const LiveScreen());

      await tester.tap(find.text('نعم'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final vote = requests.singleWhere((r) => r.url.path.endsWith('/api/live/episodes/5/vote'));
      expect(vote.headers['Authorization'], 'Bearer test-token');
      expect(jsonDecode(vote.body), {'option_index': 0});

      expect(find.text('60%'), findsOneWidget);
      expect(find.text('40%'), findsOneWidget);
      expect(find.text('عدد المشاركين: 5'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNWidgets(2));
    });

    testWidgets('نتيجة نقاش الأمس في الذيل بنسبها', (tester) async {
      final api = _api(
        hubBody: _hub(previous: {
          'date': '2026-09-25',
          'poll_question': 'سؤال الأمس',
          'options': ['أ', 'ب'],
          'results': [
            {'index': 0, 'label': 'أ', 'votes': 1, 'percentage': 33},
            {'index': 1, 'label': 'ب', 'votes': 2, 'percentage': 67},
          ],
          'total_votes': 3,
        }),
      );
      await _pump(tester, api, await _auth(api), const LiveScreen());

      expect(find.text('نتيجة نقاش الأمس'), findsOneWidget);
      expect(find.text('سؤال الأمس'), findsOneWidget);
      expect(find.text('67%'), findsOneWidget);
      expect(find.text('عدد المشاركين: 3'), findsOneWidget);
    });
  });
}
