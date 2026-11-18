import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/stats_ticker.dart';
import 'package:negev_events/screens/add_event_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/home_welcome.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/event_card.dart';
import 'package:negev_events/widgets/home_sections.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// الرئيسية الجديدة — أقسامها ومنطقها (M1-M).
///
/// الشكل نفسه يُختبر هنا بالوحدات حيث أمكن: باني سطور الشريط الإخباري دالة
/// محضة، وبصمة إغلاق الترحيب دالة محضة، وشارة العدّ دالة محضة. وما لا يُختبر
/// إلا بالرسم (غياب الأقسام الفارغة، والأفعال السريعة، وحرية التمرير في الرأس)
/// يُختبر بودجت حقيقي على شاشة التغذية.

const String _statsUpdatedAt = '2026-11-02T07:07:00.000Z';

Map<String, dynamic> _statsBody({
  List<Map<String, dynamic>> regions = const [
    {'region_id': 1, 'name': 'النقب', 'upcoming_count': 12},
    {'region_id': 2, 'name': 'محافظة طولكرم', 'upcoming_count': 0},
  ],
  int total = 16,
  Map<String, dynamic>? prices,
  Map<String, dynamic>? latestNews,
}) =>
    {
      'success': true,
      'regions': regions,
      'total': total,
      'updated_at': _statsUpdatedAt,
      'prices': ?prices,
      'latest_news': ?latestNews,
    };

Map<String, dynamic> _pricesBody() => {
      'gold': {'k24': 250.5, 'k21': 219.19, 'k18': 187.88, 'currency': 'ILS'},
      'currencies': [
        {'code': 'USD', 'name_ar': 'دولار أمريكي', 'ils_per_unit': 3.65},
        {'code': 'JOD', 'name_ar': 'دينار أردني', 'ils_per_unit': 5.2},
        {'code': 'EUR', 'name_ar': 'يورو', 'ils_per_unit': 4.05},
        {'code': 'GBP', 'name_ar': 'جنيه', 'ils_per_unit': 4.6},
      ],
      'stale': false,
    };

/// خادم وهمي: كل مسار يُعيد جسمه أو «لا شيء»، و[requests] يلتقط الطلبات.
///
/// [welcome] رسالة الترحيب في **جذر** ردّ `/api/settings/public` كما في العقد،
/// ودالةٌ لا قيمة كي يغيّر الاختبار الرسالة بين نداء وآخر (الإفراغ من اللوحة)؛
/// وما تُعيده `null` يُرسَل مفتاحاً صريحاً بالقيمة `null` («لا رسالة الآن»).
/// و[welcomeNested] نسختها القديمة تحت `settings` — احتياط خادم أقدم وحده.
NegevApi _api({
  Object? eventsBody,
  Object? featuredBody,
  Object? trendingBody,
  Object? statsBody,
  Object? settingsBody,
  Object? categoriesBody,
  List<Uri>? requests,
  Map<String, dynamic>? Function()? welcome,
  Map<String, dynamic>? welcomeNested,
}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    final path = request.url.path;
    Object body = {'success': true};
    if (path.endsWith('/api/stats/ticker') && statsBody != null) {
      body = statsBody;
    } else if (path.endsWith('/api/settings/public')) {
      body = settingsBody ??
          {
            'success': true,
            'settings': {
              'home_welcome': ?welcomeNested,
            },
            if (welcome != null) 'home_welcome': welcome(),
          };
    } else if (path.endsWith('/api/services/categories')) {
      body = categoriesBody ?? {'success': true, 'categories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/events/featured')) {
      body = featuredBody ?? {'success': true, 'events': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/events/trending')) {
      body = trendingBody ?? {'success': true, 'events': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/stories')) {
      body = {'success': true, 'stories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/stories/entry-card')) {
      body = {'success': true, 'enabled': false, 'source': null, 'story': null};
    } else if (path.endsWith('/api/events')) {
      body = eventsBody ??
          {
            'success': true,
            'events': <Map<String, dynamic>>[],
            'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
            'announcements': <Map<String, dynamic>>[],
          };
    }
    return http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

/// صفّ مناسبة كما يعيده الخادم.
///
/// **بلا `poster_url` عمداً:** بوستر كرت التغذية يُرسم عبر `EventPoster`
/// بدوّارة تحميل، وطلب الصورة لا يُحسم في بيئة الاختبار — فدوّارة دائمة تمنع
/// `pumpAndSettle` من الاستقرار. الأقسام نفسها لا تُختبر بصورتها هنا.
Map<String, dynamic> _eventRow(int id, {String date = '2026-12-01'}) => {
      'id': id,
      'title': 'مناسبة $id',
      'groom_name': 'سالم $id',
      'family_clan': 'آل سالم',
      'town': 'رهط',
      'event_date': date,
      'occasion_type': {
        'id': 1,
        'name': 'عرس',
        'icon': '💍',
        'color': '#0369a1',
        'tone': 'festive',
        'fields': <Map<String, dynamic>>[],
        'reactions': <String>[],
      },
    };

Map<String, dynamic> _eventsBody({int count = 3}) => {
      'success': true,
      'events': [for (var i = 0; i < count; i += 1) _eventRow(101 + i)],
      'pagination': {'page': 1, 'limit': 30, 'total': count, 'totalPages': 1},
      'announcements': <Map<String, dynamic>>[],
    };

Future<void> _pumpFeed(
  WidgetTester tester,
  NegevApi api, {
  bool disableAnimations = true,
}) async {
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: MediaQuery(
            data: MediaQueryData(disableAnimations: disableAnimations),
            child: const EventsScreen(),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('نماذج الشريط — prices وlatest_news اختياريان', () {
    test('الردّ الكامل: الأسعار بنموذج /api/prices نفسه والخبر معه', () {
      final ticker = StatsTicker.fromJson(_statsBody(
        prices: _pricesBody(),
        latestNews: {
          'id': 5,
          'title': 'خبر النقب',
          'published_at': '2026-11-01T08:00:00.000Z',
        },
      ));
      expect(ticker.regions, hasLength(2));
      expect(ticker.total, 16);
      expect(ticker.prices, isNotNull);
      expect(ticker.prices!.gold!.k24, 250.5);
      expect(ticker.prices!.gold!.perGram(21), 219.19);
      expect(ticker.prices!.currencies, hasLength(4));
      expect(ticker.latestNews?.id, 5);
      expect(ticker.latestNews?.title, 'خبر النقب');
      expect(ticker.latestNews?.publishedAt, isNotNull);
    });

    test('خادم أقدم بلا المفتاحين: prices وlatest_news يبقيان null بلا استثناء', () {
      final ticker = StatsTicker.fromJson({
        'success': true,
        'regions': <Map<String, dynamic>>[],
        'total': 0,
      });
      expect(ticker.prices, isNull);
      expect(ticker.latestNews, isNull);
      expect(ticker.updatedAt, isNull);
    });

    test('صفّ خبر بلا عنوان أو بلا معرّف رقمي يُقرأ null — لا سطر خبر فارغ', () {
      expect(
        TickerNews.tryFromJson({'id': 5, 'title': '  '}),
        isNull,
        reason: 'عنوان فارغ لا سطر له',
      );
      expect(TickerNews.tryFromJson({'id': 'x', 'title': 'خبر'}), isNull);
      expect(TickerNews.tryFromJson({'title': 'خبر'}), isNull);
      expect(TickerNews.tryFromJson(null), isNull);
      expect(TickerNews.tryFromJson('خبر'), isNull);
      expect(TickerNews.tryFromJson({'id': 7, 'title': ' خبر '})?.title, 'خبر');
    });
  });

  group('بطاقة الترحيب — موضع المفتاح في الردّ', () {
    /// يقرأ `homeWelcome()` من جسم ردّ `/api/settings/public` كما هو.
    Future<({String title, String message})?> parse(Object body) async {
      final client = MockClient((_) async => http.Response(
            jsonEncode(body),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ));
      return NegevApi(ApiClient(client: client)).homeWelcome();
    }

    test('العقد: المفتاح في جذر الردّ بجانب settings', () async {
      expect(
        await parse({
          'success': true,
          'settings': {'providers_display': 'cards'},
          'home_welcome': {'title': 'أهلاً', 'message': 'رسالة'},
        }),
        (title: 'أهلاً', message: 'رسالة'),
      );
    });

    test('احتياط خادم أقدم: تحت settings وحدها', () async {
      expect(
        await parse({
          'success': true,
          'settings': {
            'home_welcome': {'title': 'قديم', 'message': 'رسالة قديمة'},
          },
        }),
        (title: 'قديم', message: 'رسالة قديمة'),
      );
    });

    test('الجذر يغلب settings، وnull الصريح لا يستأنف نصاً قديماً', () async {
      // مفتاحان في الردّ: يُقرأ الجذر.
      expect(
        await parse({
          'success': true,
          'settings': {
            'home_welcome': {'title': 'قديم'},
          },
          'home_welcome': {'title': 'جديد', 'message': ''},
        }),
        (title: 'جديد', message: ''),
      );
      // `null` صريح في الجذر = «لا رسالة الآن»، ولا احتياط.
      expect(
        await parse({
          'success': true,
          'settings': {
            'home_welcome': {'title': 'قديم'},
          },
          'home_welcome': null,
        }),
        isNull,
      );
    });

    test('غياب المفتاح أو صفّ فارغ: null', () async {
      expect(await parse({'success': true, 'settings': <String, dynamic>{}}), isNull);
      expect(await parse({'success': true}), isNull);
      expect(
        await parse({
          'success': true,
          'home_welcome': {'title': '  ', 'message': ''},
        }),
        isNull,
      );
    });
  });

  group('باني سطور الشريط الإخباري', () {
    test('الردّ الكامل: كل سطر بترتيبه، والعملات الثلاث وحدها', () {      final items = buildHomeTickerItems(
        stats: StatsTicker.fromJson(_statsBody(
          prices: _pricesBody(),
          latestNews: {'id': 5, 'title': 'خبر النقب'},
        )),
        now: DateTime.utc(2026, 11, 5, 22, 30),
        onNewsTap: () {},
      );
      final texts = items.map((item) => item.text).toList();

      expect(texts, [
        '📍 12 مناسبة في النقب',
        '🎉 16 مناسبة قادمة',
        'الذهب عيار 24: ₪250.50 للغرام',
        'الذهب عيار 21: ₪219.19 للغرام',
        'الذهب عيار 18: ₪187.88 للغرام',
        'الدولار ₪3.65',
        'الدينار الأردني ₪5.20',
        'اليورو ₪4.05',
        '📰 خبر النقب',
        '🕒 حُدّث 09:07',
        // 2026-11-05 22:30 UTC = 00:30 من ٦ نوفمبر في القدس (‏UTC+2 شتاءً).
        '📅 الجمعة ٦ نوفمبر',
      ]);
      // محافظة بلا مناسبات قادمة لا سطر لها.
      expect(texts.where((text) => text.contains('طولكرم')), isEmpty);
      // و«الجنيه» عملة ليست في الشريط.
      expect(texts.where((text) => text.contains('جنيه')), isEmpty);
      // أسعار الذهب بالعيارات الثلاثة وحدها بلون الذهب
      // (`.home-ticker-item.is-gold` في الويب)، وما عداها بحبر السطح.
      expect(
        items.where((item) => item.gold).map((item) => item.text).toList(),
        [
          'الذهب عيار 24: ₪250.50 للغرام',
          'الذهب عيار 21: ₪219.19 للغرام',
          'الذهب عيار 18: ₪187.88 للغرام',
        ],
      );
      // سطر الخبر وحده قابل للكبس.
      expect(items.where((item) => item.onTap != null), hasLength(1));
      expect(items.firstWhere((item) => item.onTap != null).text, '📰 خبر النقب');
    });

    test('بلا أسعار وبلا خبر: تُحذف سطورهما ولا يبقى سوى الإحصاء والتاريخ', () {
      final items = buildHomeTickerItems(
        stats: StatsTicker.fromJson({
          'success': true,
          'regions': [
            {'region_id': 1, 'name': 'النقب', 'upcoming_count': 3},
          ],
          'total': 3,
        }),
        now: DateTime.utc(2026, 11, 5, 22, 30),
      );
      expect(items.map((item) => item.text), [
        '📍 3 مناسبة في النقب',
        '🎉 3 مناسبة قادمة',
        '📅 الجمعة ٦ نوفمبر',
      ]);
      expect(items.any((item) => item.text.contains('الذهب')), isFalse);
      expect(items.any((item) => item.text.contains('🕒')), isFalse);
      expect(items.any((item) => item.text.contains('📰')), isFalse);
      expect(items.where((item) => item.gold), isEmpty,
          reason: 'بلا أسعار لا سطر ذهبي');
    });

    test('بلا إحصاء إطلاقاً: سطر اليوم وحده يبقى — الشريط لا يظهر فارغاً', () {
      final items = buildHomeTickerItems(now: DateTime.utc(2026, 11, 5, 22, 30));
      expect(items.map((item) => item.text), ['📅 الجمعة ٦ نوفمبر']);
    });

    test('ذهب بصفر أو غائب لا سطر له — لا سعر وهمي', () {
      final items = buildHomeTickerItems(
        stats: StatsTicker.fromJson(_statsBody(
          prices: {
            'gold': {'k24': 250.5, 'k21': 0},
            'currencies': [
              {'code': 'USD', 'ils_per_unit': 0},
            ],
          },
        )),
        now: DateTime.utc(2026, 11, 5, 22, 30),
      );
      final texts = items.map((item) => item.text).toList();
      expect(texts.where((text) => text.contains('عيار')), ['الذهب عيار 24: ₪250.50 للغرام']);
      expect(texts.where((text) => text.contains('الدولار')), isEmpty);
      expect(items.where((item) => item.gold).map((item) => item.text),
          ['الذهب عيار 24: ₪250.50 للغرام'],
          reason: 'العيار الوحيد الذي وصل سعره هو الذهبي وحده');
    });
  });

  group('شارة العدّ التنازلي — دالة محضة واحدة', () {
    final now = DateTime.utc(2026, 11, 5, 22, 30); // ٦ نوفمبر في القدس

    test('اليوم وغداً وبعد n أيام، وحمراء حتى ثلاثة أيام', () {
      expect(eventCountdownChip('2026-11-06', now: now), (label: 'اليوم', urgent: true));
      expect(eventCountdownChip('2026-11-07', now: now), (label: 'غداً', urgent: true));
      expect(eventCountdownChip('2026-11-08', now: now), (label: 'بعد 2 أيام', urgent: true));
      expect(eventCountdownChip('2026-11-09', now: now), (label: 'بعد 3 أيام', urgent: true));
      expect(eventCountdownChip('2026-11-10', now: now), (label: 'بعد 4 أيام', urgent: false));
    });

    test('مناسبة مضت أو تاريخ لا يُقرأ: لا شارة إطلاقاً', () {
      expect(eventCountdownChip('2026-11-05', now: now), isNull);
      expect(eventCountdownChip('ليس تاريخاً', now: now), isNull);
      expect(eventCountdownChip('', now: now), isNull);
    });
  });

  group('بطاقة الترحيب — الإغلاق ببصمة النصّ', () {
    test('البصمة حتمية، وتتغيّر بتغيّر العنوان أو الرسالة', () {
      expect(homeWelcomeHash('أهلاً', 'رسالة'), homeWelcomeHash('أهلاً', 'رسالة'));
      expect(
        homeWelcomeHash('أهلاً', 'رسالة'),
        isNot(homeWelcomeHash('أهلاً', 'رسالة جديدة')),
        reason: 'رسالة جديدة = بصمة جديدة = البطاقة تعود',
      );
      expect(
        homeWelcomeHash('أهلاً', 'رسالة'),
        isNot(homeWelcomeHash('مرحباً', 'رسالة')),
      );
      // الفاصل يمنع تصادم تقاسم النصّ بين العنوان والرسالة.
      expect(homeWelcomeHash('أب', 'ج'), isNot(homeWelcomeHash('أ', 'بج')));
    });

    test('الإغلاق يُحفظ ببصمة نصّه وحده: النصّ الجديد يعود', () async {
      final oldHash = homeWelcomeHash('أهلاً', 'رسالة أولى');
      expect(await isHomeWelcomeDismissed(oldHash), isFalse);

      await markHomeWelcomeDismissed(oldHash);
      expect(await isHomeWelcomeDismissed(oldHash), isTrue);
      expect(
        await isHomeWelcomeDismissed(homeWelcomeHash('أهلاً', 'رسالة ثانية')),
        isFalse,
        reason: 'بصمة أخرى = لم تُغلق',
      );
    });
  });

  group('أقسام الرئيسية — الظهور والاختفاء', () {
    testWidgets('كل قسم بلا بيانات يغيب وحده: لا عنوان ولا مساحة', (tester) async {
      await _pumpFeed(tester, _api());

      expect(find.byKey(const Key('featured_carousel')), findsNothing);
      expect(find.byKey(const Key('home_week_section')), findsNothing);
      expect(find.byKey(const Key('home_newest_section')), findsNothing);
      expect(find.byKey(const Key('home_trending_section')), findsNothing);
      expect(find.byKey(const Key('home_service_categories')), findsNothing);
      expect(find.byKey(const Key('home_welcome_card')), findsNothing);
      expect(find.text('هذا الأسبوع قربك'), findsNothing);
      expect(find.text('جديد عنا'), findsNothing);
      expect(find.text('الأكثر تفاعلاً'), findsNothing);

      // وما ليس قسم بيانات يبقى: الشريط الإخباري (سطر اليوم) والأفعال السريعة
      // وبانر المزوّد.
      expect(find.byKey(const Key('home_ticker_bar')), findsOneWidget);
      expect(find.byKey(const Key('home_quick_actions')), findsOneWidget);
      expect(find.byKey(const Key('home_provider_cta')), findsOneWidget);
    });

    testWidgets('الردود الممتلئة تُظهر الأقسام الخمسة بترتيبها تحت البطاقة الكبيرة',
        (tester) async {
      final api = _api(
        eventsBody: _eventsBody(),
        featuredBody: {'success': true, 'events': [_eventRow(201)]},
        trendingBody: {'success': true, 'events': [_eventRow(301), _eventRow(302)]},
        categoriesBody: {
          'success': true,
          'categories': [
            {'id': 4, 'name': 'قاعات', 'icon': '🏛️', 'position': 1},
            {'id': 5, 'name': 'تصوير', 'icon': '', 'position': 2},
          ],
        },
        statsBody: _statsBody(prices: _pricesBody()),
      );
      await _pumpFeed(tester, api);

      expect(find.byKey(const Key('home_ticker_bar')), findsOneWidget);
      // نسختان من السطور: الشريط يرسم محتواه مرّتين ليلتفّ بلا فراغ.
      expect(find.text('📍 12 مناسبة في النقب'), findsNWidgets(2));
      // سطر الذهب بلون الذهب، وسطر الإحصاء بحبر السطح — كما في الويب.
      expect(
        tester.widget<Text>(find.text('الذهب عيار 24: ₪250.50 للغرام').first)
            .style
            ?.color,
        NegevPalette.light.gold,
      );
      expect(
        tester.widget<Text>(find.text('🎉 16 مناسبة قادمة').first).style?.color,
        NegevPalette.light.ink,
      );
      expect(find.byKey(const Key('featured_carousel')), findsOneWidget);
      expect(find.byKey(const Key('home_week_section')), findsOneWidget);
      expect(find.byKey(const Key('home_newest_section')), findsOneWidget);
      expect(find.text('أحدث المناسبات'), findsOneWidget);
      expect(find.byKey(const Key('home_trending_section')), findsOneWidget);
      expect(find.byKey(const Key('home_service_categories')), findsOneWidget);
      // فئة بأيقونة تُرسم إيموجيها، وأخرى بلا أيقونة تأخذ أيقونة مادّية.
      expect(find.text('🏛️'), findsOneWidget);
      expect(find.byIcon(Icons.handyman_outlined), findsWidgets);

      // الترتيب: الشريط، ثم المميزة، ثم «هذا الأسبوع»، ثم الأفعال السريعة، ثم
      // «جديد عنا»، ثم «الأكثر تفاعلاً»، ثم الفئات، ثم بانر المزوّد.
      final order = [
        const Key('home_ticker_bar'),
        const Key('featured_carousel'),
        const Key('home_week_section'),
        const Key('home_quick_actions'),
        const Key('home_newest_section'),
        const Key('home_trending_section'),
        const Key('home_service_categories'),
        const Key('home_provider_cta'),
      ];
      final tops = <double>[];
      for (final key in order) {
        final finder = find.byKey(key);
        expect(finder, findsOneWidget, reason: 'القسم $key موجود');
        final rect = tester.getRect(finder);
        // الأقسام الطويلة قد تبدأ أعلى الشاشة؛ يكفي ترتيب أعلاها.
        tops.add(rect.top);
      }
      for (var i = 1; i < tops.length; i += 1) {
        expect(tops[i], greaterThanOrEqualTo(tops[i - 1]),
            reason: 'ترتيب الأقسام كما في التصميم');
      }
    });

    testWidgets('بطاقة الترحيب: تظهر من جذر الردّ، وتُغلق فتُحفظ ببصمتها، وتعود برسالة جديدة',
        (tester) async {
      // العقد: `home_welcome` في جذر ردّ `/api/settings/public`.
      Map<String, dynamic> welcome(String message) =>
          {'title': 'أهلاً بكم', 'message': message};

      await _pumpFeed(tester, _api(welcome: () => welcome('رسالة أولى')));
      expect(find.byKey(const Key('home_welcome_card')), findsOneWidget,
          reason: 'المفتاح في الجذر لا تحت settings');
      expect(find.text('أهلاً بكم'), findsOneWidget);
      expect(find.text('رسالة أولى'), findsOneWidget);

      await tester.tap(find.byKey(const Key('home_welcome_dismiss')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('home_welcome_card')), findsNothing);

      // إعادة الفتح بالنصّ نفسه: البطاقة لا تعود.
      await tester.pumpWidget(const SizedBox.shrink());
      await _pumpFeed(tester, _api(welcome: () => welcome('رسالة أولى')));
      expect(find.byKey(const Key('home_welcome_card')), findsNothing,
          reason: 'الإغلاق محفوظ ببصمة النصّ');

      // ورسالة جديدة تكتبها الإدارة: بصمة أخرى فتعود البطاقة.
      await tester.pumpWidget(const SizedBox.shrink());
      await _pumpFeed(tester, _api(welcome: () => welcome('رسالة جديدة')));
      expect(find.byKey(const Key('home_welcome_card')), findsOneWidget);
      expect(find.text('رسالة جديدة'), findsOneWidget);
    });

    testWidgets('خادم أقدم يرسل الترحيب تحت settings: البطاقة تُقرأ احتياطاً',
        (tester) async {
      await _pumpFeed(
        tester,
        _api(welcomeNested: {'title': 'أهلاً بكم', 'message': 'رسالة قديمة'}),
      );
      expect(find.byKey(const Key('home_welcome_card')), findsOneWidget);
      expect(find.text('رسالة قديمة'), findsOneWidget);
    });

    testWidgets('رسالة أُفرغت بعد التحديث ترفع البطاقة ولا تُبقيها من لقطة سابقة',
        (tester) async {
      Map<String, dynamic>? current = {'title': 'أهلاً بكم', 'message': 'رسالة'};
      await _pumpFeed(tester, _api(welcome: () => current));
      expect(find.byKey(const Key('home_welcome_card')), findsOneWidget);

      // أُفرغت من اللوحة: الجذر يعود `null`، وزرّ التحديث يعيد القراءة.
      current = null;
      await tester.tap(find.byTooltip('تحديث'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('home_welcome_card')), findsNothing,
          reason: 'ردٌّ بلا رسالة يرفع البطاقة');
    });

    testWidgets('«أنشئ مناسبة» يمرّ بمعالج النشر نفسه', (tester) async {
      await _pumpFeed(tester, _api());
      await tester.tap(find.byKey(const Key('home_quick_create')));
      await tester.pumpAndSettle();
      expect(find.byType(AddEventScreen), findsOneWidget,
          reason: 'نفس شاشة النشر التي يفتحها زرّ النشر في الترويسة');
    });

    testWidgets('«المزوّدون» و«دعواتي» يطلبان تبديل الوجهة نفسها', (tester) async {
      final tabRequest = ValueNotifier<int>(-1);
      await tester.pumpWidget(
        AppServices(
          api: _api(),
          auth: AuthStore(_api()),
          realtime: RealtimeService(),
          tabRequest: tabRequest,
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: MediaQuery(
                data: MediaQueryData(disableAnimations: true),
                child: EventsScreen(),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('home_quick_providers')));
      await tester.pump();
      expect(tabRequest.value, AppServices.servicesTabIndex);

      tabRequest.value = -1;
      await tester.tap(find.byKey(const Key('home_quick_invites')));
      await tester.pump();
      expect(tabRequest.value, AppServices.myHubTabIndex);

      tabRequest.value = -1;
      await tester.tap(find.byKey(const Key('home_quick_studio')));
      await tester.pump();
      expect(tabRequest.value, AppServices.myHubTabIndex,
          reason: 'الاستوديو لكل مناسبة، فمدخله «مناسباتي»');
    });
  });

  group('التمرير في الرأس الأطول من الشاشة', () {
    testWidgets('سحبة داخل الرأس لا تقفز إلى أوّل كرت', (tester) async {
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await _pumpFeed(tester, _api(eventsBody: _eventsBody()));

      final feed = find.byKey(const Key('feed_pager'));
      final scroll = tester.widget<CustomScrollView>(feed).controller!;
      final viewport = tester.getSize(feed).height;
      // الرأس = أقصى تمرير − كروت ما بعده. الكروت ثلاثة بارتفاع التغذية،
      // فما بعد الكرت الأول كرتان.
      final headerExtent = scroll.position.maxScrollExtent - 2 * viewport;
      expect(headerExtent, greaterThan(viewport),
          reason: 'الرأس أطول من الشاشة أصلاً');
      expect(find.byType(EventCard), findsNothing,
          reason: 'لا كرت مبنيّ عند الموضع صفر');

      await tester.fling(feed, const Offset(0, -260), 900);
      await tester.pumpAndSettle();

      expect(scroll.offset, greaterThan(0), reason: 'السحبة حرّكت الرأس');
      expect(
        scroll.offset,
        lessThan(headerExtent - 24),
        reason: 'السحبة داخل الرأس حرّة: لا تسوية إلى أوّل كرت',
      );
      // «لا تقفز إلى أوّل كرت»: أعلى الكرت الأول ما زال تحت أعلى الشاشة.
      expect(headerExtent - scroll.offset, greaterThan(24));

      // وسحبة ثانية من الموضع نفسه تُكمل في الرأس بلا قفزة كذلك.
      final firstStop = scroll.offset;
      await tester.fling(feed, const Offset(0, -260), 900);
      await tester.pumpAndSettle();
      expect(scroll.offset, greaterThan(firstStop));
      expect(scroll.offset, lessThan(headerExtent));
    });
  });

  group('رموز فئات الخدمات — رفض النصوص العربية وتنقية التكدّس', () {
    test('usableCategoryEmoji يرفض النص العربي واللاتيني ويستخلص أول إيموجي صالح', () {
      expect(usableCategoryEmoji('طباخ الافراح'), '');
      expect(usableCategoryEmoji('تصوير افراح'), '');
      expect(usableCategoryEmoji('ب'), '');
      expect(usableCategoryEmoji('tent'), '');
      expect(usableCategoryEmoji(''), '');
      expect(usableCategoryEmoji('🍬🍰🧁'), '🍬');
      expect(usableCategoryEmoji('🧧🖼'), '🧧');
      expect(usableCategoryEmoji('👨‍🍳'), '👨‍🍳');
      expect(usableCategoryEmoji('🏛️'), '🏛️');
      expect(usableCategoryEmoji('⛺'), '⛺');
    });

    testWidgets('ServiceCategoriesStrip يعرض أيقونة افتراضية بدل النص العربي المقصوص',
        (tester) async {
      final api = _api(
        categoriesBody: {
          'success': true,
          'categories': [
            {'id': 1, 'name': 'الطباخ', 'icon': 'طباخ الافراح', 'position': 1},
            {'id': 2, 'name': 'حلويات', 'icon': '🍬🍰🧁', 'position': 2},
          ],
        },
      );
      await _pumpFeed(tester, api);
      expect(find.byKey(const Key('home_service_categories')), findsOneWidget);
      expect(find.text('طباخ الافراح'), findsNothing);
      expect(find.text('🍬🍰🧁'), findsNothing);
      expect(find.text('🍬'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('home_service_category_1')),
          matching: find.byIcon(Icons.handyman_outlined),
        ),
        findsOneWidget,
      );
    });
  });

  group('البحث المباشر — إخفاء أقسام الاكتشاف وإغلاق اللوح', () {
    testWidgets('البحث بالاسم يُخفي أقسام الرئيسية ويُظهر الكرت المطابق مباشرةً في أعلى الشاشة',
        (tester) async {
      tester.view.physicalSize = const Size(1800, 2340);
      tester.view.devicePixelRatio = 3.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await _pumpFeed(tester, _api(eventsBody: _eventsBody(count: 2)));

      // قبل البحث: أقسام الرئيسية ظاهرة والكروم يدفع أول كرت بعيداً عن الأعلى.
      expect(find.byKey(const Key('home_ticker_bar')), findsOneWidget);
      expect(find.byKey(const Key('home_quick_actions')), findsOneWidget);
      expect(find.byKey(const Key('home_provider_cta')), findsOneWidget);
      expect(find.byType(EventCard), findsNothing);

      // فتح لوح البحث والكتابة ثم إرسال البحث: يُغلق اللوح وتختفي الأقسام وتظهر النتيجة فوراً.
      await tester.tap(find.byIcon(Icons.tune_rounded));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'سالم');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('home_ticker_bar')), findsNothing);
      expect(find.byKey(const Key('home_quick_actions')), findsNothing);
      expect(find.byKey(const Key('home_provider_cta')), findsNothing);
      expect(find.byType(EventCard), findsOneWidget);
    });
  });
}
