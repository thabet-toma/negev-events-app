import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/news_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/async_view.dart' show ErrorView;

/// عميل وهمي يوجّه حسب المسار — لا شبكة إطلاقاً، وكل طلب يُسجَّل في [requests]
/// عند تمريره كي يُفحص استعلامه (‏offset وgeneral خاصة).
NegevApi newsApi(
  Future<http.Response> Function(http.Request request) handler, {
  List<Uri>? requests,
}) {
  final client = MockClient((request) async {
    requests?.add(request.url);
    return handler(request);
  });
  return NegevApi(ApiClient(client: client));
}

http.Response jsonResponse(Object body, {int status = 200}) {
  return http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}

/// جسم `GET /api/news` كما يبنيه مسار الخادم.
Map<String, dynamic> newsFeedJson({
  List<Map<String, dynamic>> items = const [],
  bool hasMore = false,
  bool general = false,
  String regionName = 'النقب',
}) {
  return {
    'success': true,
    'region_id': 1,
    'region_name': regionName,
    'area': general ? 'عام' : 'النقب',
    'general': general,
    'items': items,
    'has_more': hasMore,
  };
}

/// خبر واحد — كل الحقول اختيارية عدا المعرّف والعنوان، فتُبنى منه قائمة بلا
/// صورة (لا `CachedNetworkImage` يلمس الشبكة) وتفاصيل بنصّ كامل.
Map<String, dynamic> newsItemJson({
  required int id,
  required String title,
  String excerpt = '',
  String? url,
  String? publishedAt,
  bool isBreaking = false,
  Map<String, dynamic>? category,
  String? bodyText,
}) {
  return {
    'id': id,
    'title': title,
    'excerpt': excerpt,
    'url': url,
    'published_at': publishedAt,
    'is_breaking': isBreaking,
    'category': category,
    'body_text': bodyText,
  };
}

/// نافذة أطول من الافتراضية كي تظهر الكروت وزرّ «المزيد» معاً بلا تمرير.
Future<void> pumpNews(WidgetTester tester, NegevApi api, {Widget? home}) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  // `AppServices` فوق `MaterialApp` كي تجده الشاشات المدفوعة أيضاً (كلاهما
  // شقيق في شجرة الملاحة لا ابن لـ`home`).
  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: home ?? const NewsScreen(),
        ),
      ),
    ),
  );
}

/// استقرار بعد اكتمال الـFuture — لا `pumpAndSettle` مع دوّارة تحميل متحرّكة.
Future<void> settleNews(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  group('آخر الأخبار — تحميل القائمة والكروت', () {
    testWidgets(
      'حالة التحميل أولاً، ثم كروت فيها العنوان والشارة والقسم والوقت النسبي',
      (tester) async {
        final requests = <Uri>[];
        final api = newsApi((request) async {
          return jsonResponse(newsFeedJson(items: [
            newsItemJson(
              id: 1,
              title: 'خبر محلي عادي',
              excerpt: 'ملخّص الخبر المحلي',
              publishedAt: DateTime.now()
                  .subtract(const Duration(minutes: 5))
                  .toUtc()
                  .toIso8601String(),
              category: {'id': 1, 'name': 'محليات'},
            ),
            newsItemJson(
              id: 2,
              title: 'خبر عاجل الآن',
              isBreaking: true,
              publishedAt: DateTime.now()
                  .subtract(const Duration(hours: 2))
                  .toUtc()
                  .toIso8601String(),
              category: {'id': 2, 'name': 'أمن'},
            ),
          ]));
        }, requests: requests);

        await pumpNews(tester, api);

        // أثناء انتظار الاستجابة: دوّارة التحميل وحدها.
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('خبر محلي عادي'), findsNothing);

        await settleNews(tester);

        // أول طلب يبدأ من أول الصفحة وبلا الوجه العام.
        expect(requests, hasLength(1));
        expect(requests.single.path, endsWith('/api/news'));
        expect(requests.single.queryParameters['limit'], '$newsPageSize');
        expect(requests.single.queryParameters['offset'], '0');
        expect(requests.single.queryParameters['general'], '0');

        expect(find.byKey(const Key('news_card_1')), findsOneWidget);
        expect(find.byKey(const Key('news_card_2')), findsOneWidget);
        expect(find.text('خبر محلي عادي'), findsOneWidget);
        expect(find.text('خبر عاجل الآن'), findsOneWidget);
        expect(find.text('محليات'), findsOneWidget);
        expect(find.text('أمن'), findsOneWidget);

        // الوقت النسبي محسوب من published_at.
        expect(find.text('منذ 5 دقائق'), findsOneWidget);
        expect(find.text('منذ ساعتين'), findsOneWidget);

        // شارة «عاجل» على الخبر الموسوم وحده.
        expect(find.text('عاجل'), findsOneWidget);
        expect(
          find.descendant(
            of: find.byKey(const Key('news_card_2')),
            matching: find.text('عاجل'),
          ),
          findsOneWidget,
        );
        expect(
          find.descendant(
            of: find.byKey(const Key('news_card_1')),
            matching: find.text('عاجل'),
          ),
          findsNothing,
        );
      },
    );
  });

  group('آخر الأخبار — زرّ «المزيد»', () {
    testWidgets(
      'الطلب الثاني يحمل offset الصحيح، والكروت تُضاف لا تُستبدل',
      (tester) async {
        final requests = <Uri>[];
        final api = newsApi((request) async {
          final offset = request.url.queryParameters['offset'];
          if (offset == '0') {
            return jsonResponse(newsFeedJson(
              items: [
                newsItemJson(id: 11, title: 'الخبر الأول'),
                newsItemJson(id: 12, title: 'الخبر الثاني'),
              ],
              hasMore: true,
            ));
          }
          return jsonResponse(newsFeedJson(
            items: [newsItemJson(id: 13, title: 'الخبر الثالث')],
          ));
        }, requests: requests);

        await pumpNews(tester, api);
        await settleNews(tester);

        expect(find.text('المزيد'), findsOneWidget);
        expect(requests.first.queryParameters['offset'], '0');

        await tester.tap(find.text('المزيد'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        final newsRequests =
            requests.where((uri) => uri.path.endsWith('/api/news')).toList();
        expect(newsRequests, hasLength(2));
        expect(newsRequests.first.queryParameters['offset'], '0');
        expect(newsRequests.last.queryParameters['offset'], '2');
        expect(newsRequests.last.queryParameters['limit'], '$newsPageSize');
        expect(newsRequests.last.queryParameters['general'], '0');

        // الصفحة الثانية أُضيفت: الثلاثة معاً، لا آخر صفحة وحدها.
        expect(find.byKey(const Key('news_card_11')), findsOneWidget);
        expect(find.byKey(const Key('news_card_12')), findsOneWidget);
        expect(find.byKey(const Key('news_card_13')), findsOneWidget);
        expect(find.text('المزيد'), findsNothing);
      },
    );
  });

  group('آخر الأخبار — الحالة الفارغة والوجه العام', () {
    testWidgets(
      'رسالة «لا أخبار لمحافظتك بعد» ثم «أخبار محلية عامة» يعيد الجلب بـgeneral=1 ويُظهر وسم «عامة»',
      (tester) async {
        final requests = <Uri>[];
        final api = newsApi((request) async {
          final general = request.url.queryParameters['general'] == '1';
          if (!general) {
            return jsonResponse(newsFeedJson(items: []));
          }
          return jsonResponse(newsFeedJson(
            general: true,
            items: [
              newsItemJson(
                id: 21,
                title: 'خبر محلي عام',
                publishedAt: DateTime.now()
                    .subtract(const Duration(minutes: 10))
                    .toUtc()
                    .toIso8601String(),
                category: {'id': 1, 'name': 'محليات'},
              ),
            ],
          ));
        }, requests: requests);

        await pumpNews(tester, api);
        await settleNews(tester);

        expect(find.text('لا أخبار لمحافظتك بعد'), findsOneWidget);
        expect(find.text('أخبار محلية عامة'), findsOneWidget);
        expect(find.byKey(const Key('news_general_button')), findsOneWidget);
        // بلا وجه عام بعد: لا وسم «عامة» في الهيدر.
        expect(find.byKey(const Key('news_general_tag')), findsNothing);
        expect(requests.single.queryParameters['general'], '0');

        await tester.tap(find.byKey(const Key('news_general_button')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        // الطلب الثاني على الوجه العام من أول الصفحة، والوسم ظهر مع النتائج.
        expect(requests, hasLength(2));
        expect(requests.last.path, endsWith('/api/news'));
        expect(requests.last.queryParameters['general'], '1');
        expect(requests.last.queryParameters['offset'], '0');

        expect(find.text('خبر محلي عام'), findsOneWidget);
        expect(find.byKey(const Key('news_general_tag')), findsOneWidget);
        expect(find.text('عامة'), findsOneWidget);
      },
    );
  });

  group('آخر الأخبار — الخطأ وإعادة المحاولة', () {
    testWidgets('خطأ الشبكة يعرض ErrorView وزرّ إعادة المحاولة يعيد الجلب', (tester) async {
      final requests = <Uri>[];
      var attempts = 0;
      final api = newsApi((request) async {
        attempts++;
        if (attempts == 1) {
          return jsonResponse(
            {'success': false, 'message': 'تعذّر جلب الأخبار'},
            status: 503,
          );
        }
        return jsonResponse(newsFeedJson(
          items: [newsItemJson(id: 31, title: 'خبر بعد إعادة المحاولة')],
        ));
      }, requests: requests);

      await pumpNews(tester, api);
      await settleNews(tester);

      expect(find.byType(ErrorView), findsOneWidget);
      expect(find.text('تعذّر جلب الأخبار'), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsOneWidget);

      await tester.tap(find.text('إعادة المحاولة'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(requests, hasLength(2));
      expect(find.byType(ErrorView), findsNothing);
      expect(find.byKey(const Key('news_card_31')), findsOneWidget);
      expect(find.text('خبر بعد إعادة المحاولة'), findsOneWidget);
    });
  });

  group('تفاصيل الخبر — من الكرت إلى الشاشة', () {
    testWidgets(
      'فتح الكرت يدفع NewsDetailsScreen، ويظهر النصّ فقرات والمصدر وزرّ كترا',
      (tester) async {
        final requests = <Uri>[];
        final api = newsApi((request) async {
          if (request.url.path.endsWith('/api/news')) {
            return jsonResponse(newsFeedJson(items: [
              newsItemJson(
                id: 7,
                title: 'خبر التفاصيل',
                publishedAt: DateTime.now()
                    .subtract(const Duration(days: 1))
                    .toUtc()
                    .toIso8601String(),
                category: {'id': 1, 'name': 'محليات'},
              ),
            ]));
          }
          expect(request.url.path, endsWith('/api/news/7'));
          return jsonResponse({
            'success': true,
            'item': newsItemJson(
              id: 7,
              title: 'خبر التفاصيل',
              publishedAt: DateTime.now()
                  .subtract(const Duration(days: 1))
                  .toUtc()
                  .toIso8601String(),
              category: {'id': 1, 'name': 'محليات'},
              url: 'https://ktra.example/news/7',
              bodyText: 'الفقرة الأولى من الخبر.\n\nالفقرة الثانية من الخبر.',
            ),
          });
        }, requests: requests);

        await pumpNews(tester, api);
        await settleNews(tester);

        await tester.tap(find.byKey(const Key('news_card_7')));
        await tester.pumpAndSettle();

        expect(find.byType(NewsDetailsScreen), findsOneWidget);
        expect(
          requests.where((uri) => uri.path.endsWith('/api/news/7')),
          hasLength(1),
        );

        // body_text قُسّم فقرات كما وصل من الخادم.
        expect(find.text('الفقرة الأولى من الخبر.'), findsOneWidget);
        expect(find.text('الفقرة الثانية من الخبر.'), findsOneWidget);

        // مصدر الخبر وزرّ فتحه على كترا — لا يُكبس هنا (لا شبكة في الاختبار).
        expect(find.text('من منصة كترا الإخبارية'), findsOneWidget);
        expect(find.byKey(const Key('news_open_on_ktra')), findsOneWidget);
        expect(find.text('افتح على كترا'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('خبر غير موجود (404) يُظهر خطأً لا انهياراً', (tester) async {
      final api = newsApi((request) async {
        expect(request.url.path, endsWith('/api/news/404'));
        return jsonResponse(
          {'success': false, 'message': 'الخبر غير موجود'},
          status: 404,
        );
      });

      await pumpNews(tester, api, home: const NewsDetailsScreen(newsId: 404));
      await settleNews(tester);

      expect(find.byType(ErrorView), findsOneWidget);
      expect(find.text('الخبر غير موجود'), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
      // الخطأ عولج في الشاشة: لا استثناء يفلت من الإطار.
      expect(tester.takeException(), isNull);
    });
  });
}
