import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/service_provider_details_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// مزوّد كامل كما يعيده `GET /api/services/providers/:id` بعد #184 — كل حقل
/// هنا له قسم في الشاشة، وحذفه من جسم الاستجابة يجب أن يُخفي قسمه.
Map<String, dynamic> richProvider() => {
      'id': 701,
      'name': 'مزوّد الصفحة الغنية',
      'category_id': 9,
      'category_name': 'صالات أفراح',
      'category_icon': '🏛️',
      'category_color': '#8a6109',
      'phone': '0501234567',
      'has_phone': true,
      'description': 'قاعة واسعة تتّسع لألف ضيف',
      'image_url': null,
      'logo_url': null,
      'cover_url': null,
      'hours': [
        {'day': 0, 'closed': false, 'from': '09:00', 'to': '18:00'},
        {'day': 1, 'closed': true},
      ],
      'is_verified': true,
      'is_featured': true,
      'views_count': 12,
      'favorites_count': 4,
      'is_favorite': false,
      'price': 4500,
      'price_type': 'starting_at',
      'price_estimate_desc': null,
      'attributes': <Map<String, dynamic>>[],
      'towns': ['رهط'],
      'gallery': [
        {'id': 11, 'image_url': 'https://cdn.example.test/g1.jpg', 'caption': 'قاعة النساء', 'position': 0}
      ],
      'offers': [
        {'id': 21, 'title': 'خصم الصيف', 'description': '١٠٪ على الحجز المبكر', 'price': 1200, 'ends_at': '2027-06-30 20:00', 'is_active': true}
      ],
      'products': [
        {'id': 31, 'name': 'كرسي ملكي', 'description': 'كرسي مزخرف', 'price': 25, 'image_url': null, 'position': 0}
      ],
      'similar': [
        {
          'id': 702,
          'name': 'مزوّد مشابه',
          'category_id': 9,
          'category_name': 'صالات أفراح',
          'category_icon': '🏛️',
          'category_color': '#8a6109',
          'image_url': null,
          'price': null,
          'price_type': 'contact',
          'price_estimate_desc': null,
          'attributes': <Map<String, dynamic>>[],
          'is_verified': false,
          'is_featured': false,
          'towns': ['حورة'],
        }
      ],
    };

/// عميل وهمي: تفصيل المزوّد ومسار واتسابه، ويسجّل كل مسار طُلب — فالتأكيد على
/// «الشاشة تسأل الخادم عن الرابط» يُبنى على الطلب نفسه لا على وجود زرّ.
NegevApi providerApi(
  Map<String, dynamic> provider,
  List<String> calls, {
  bool initialFavorite = false,
}) {
  var favorite = initialFavorite;
  var favoritesCount = (provider['favorites_count'] as num?)?.toInt() ?? 0;
  final client = MockClient((request) async {
    calls.add(request.url.path);
    final path = request.url.path;
    if (path.endsWith('/api/auth/login')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'token': 'test-token',
          'user': {
            'id': 1,
            'phone_number': '0500000000',
            'full_name': 'مستخدم اختبار',
            'role': 'user',
          },
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/view')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'counted': true,
          'views_count': ((provider['views_count'] as num?)?.toInt() ?? 0) + 1,
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/favorite')) {
      favorite = request.method == 'PUT';
      favoritesCount += favorite ? 1 : -1;
      return http.Response(
        jsonEncode({
          'success': true,
          'is_favorite': favorite,
          'favorites_count': favoritesCount,
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.endsWith('/whatsapp')) {
      return http.Response(
        jsonEncode({'success': true, 'url': 'https://wa.me/972501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7'}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (path.startsWith('/api/services/providers/')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'provider': {
            ...provider,
            'is_favorite': favorite,
            'favorites_count': favoritesCount,
          },
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

/// إطارات محدّدة بدل `pumpAndSettle`: صور المعرض والغلاف تُحمَّل بـ
/// `CachedNetworkImage` ولا شبكة في الاختبار، فدائرة انتظارها قد تُبقي الرسم
/// حيّاً بلا استقرار — نفس سبب `_frames` في `tag_sheet_test.dart`.
Future<void> settleFrames(WidgetTester tester, [int count = 6]) async {
  for (var index = 0; index < count; index += 1) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> pumpProviderPage(
  WidgetTester tester,
  NegevApi api, {
  bool signedIn = false,
}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  final auth = AuthStore(api);
  if (signedIn) await auth.signIn('0500000000', '1234');

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth,
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: ServiceProviderDetailsScreen(providerId: 701),
        ),
      ),
    ),
  );
  await settleFrames(tester);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('صفحة المزوّد الغنية (#184)', () {
    testWidgets('تعرض كل الأقسام حين تحمل بياناتها: الشارتين والساعات والمعرض والعروض والمنتجات والمشابهين', (
      tester,
    ) async {
      await pumpProviderPage(tester, providerApi(richProvider(), []));

      expect(find.byKey(const Key('provider_badges')), findsOneWidget);
      expect(find.byKey(const Key('provider_badge_verified')), findsOneWidget);
      expect(find.byKey(const Key('provider_badge_featured')), findsOneWidget);

      expect(find.byKey(const Key('provider_hours_section')), findsOneWidget);
      expect(find.byKey(const Key('provider_hours_row_0')), findsOneWidget);
      expect(find.text('الأحد'), findsOneWidget);
      expect(find.text('09:00 — 18:00'), findsOneWidget);
      expect(find.text('مغلق'), findsOneWidget, reason: 'اليوم المغلق بكلمة واحدة');

      expect(find.byKey(const Key('provider_gallery_section')), findsOneWidget);
      expect(find.byKey(const Key('provider_gallery_photo_11')), findsOneWidget);
      expect(find.text('قاعة النساء'), findsOneWidget, reason: 'تعليق الصورة');

      expect(find.byKey(const Key('provider_offers_section')), findsOneWidget);
      expect(find.byKey(const Key('provider_offer_21')), findsOneWidget);
      expect(find.text('خصم الصيف'), findsOneWidget);
      expect(find.textContaining('ينتهي 2027-06-30 20:00'), findsOneWidget);

      expect(find.byKey(const Key('provider_products_section')), findsOneWidget);
      expect(find.byKey(const Key('provider_product_31')), findsOneWidget);
      expect(find.text('كرسي ملكي'), findsOneWidget);
      expect(find.textContaining('تبدأ من'), findsOneWidget);

      expect(find.byKey(const Key('provider_similar_section')), findsOneWidget);
      expect(find.byKey(const Key('provider_similar_702')), findsOneWidget);

      expect(find.byKey(const Key('provider_whatsapp_btn')), findsOneWidget);
      expect(find.text('اتصال هاتفي'), findsOneWidget);
    });

    testWidgets('تُخفي كل قسم فارغ: لا شارات ولا ساعات ولا معرض ولا عروض ولا منتجات ولا مشابهين', (
      tester,
    ) async {
      final empty = richProvider()
        ..['hours'] = <Map<String, dynamic>>[]
        ..['gallery'] = <Map<String, dynamic>>[]
        ..['offers'] = <Map<String, dynamic>>[]
        ..['products'] = <Map<String, dynamic>>[]
        ..['similar'] = <Map<String, dynamic>>[]
        ..['is_verified'] = false
        ..['is_featured'] = false;

      await pumpProviderPage(tester, providerApi(empty, []));

      for (final key in const [
        'provider_badges',
        'provider_hours_section',
        'provider_gallery_section',
        'provider_offers_section',
        'provider_products_section',
        'provider_similar_section',
      ]) {
        expect(find.byKey(Key(key)), findsNothing, reason: 'القسم الفارغ $key مخفي');
      }

      // ما ليس قسماً في هذه التذكرة يبقى كما كان: الاسم والوصف وزرّا التواصل.
      expect(find.text('مزوّد الصفحة الغنية'), findsWidgets);
      expect(find.text('قاعة واسعة تتّسع لألف ضيف'), findsOneWidget);
    });

    testWidgets('زرّ واتساب يسأل الخادم عن الرابط ولا يبنيه في الشاشة', (
      tester,
    ) async {
      final calls = <String>[];
      await pumpProviderPage(tester, providerApi(richProvider(), calls));

      expect(calls.any((path) => path.endsWith('/whatsapp')), isFalse, reason: 'لا نداء قبل الضغط');

      await tester.tap(find.byKey(const Key('provider_whatsapp_btn')));
      await settleFrames(tester);

      expect(
        calls.where((path) => path.endsWith('/api/services/providers/701/whatsapp')).length,
        1,
        reason: 'الشاشة تقرأ الرابط من مسار الواتساب في الخادم',
      );
      // لا رقم يُطبع نصّاً في أي مكان من الصفحة.
      expect(find.textContaining('0501234567'), findsNothing);
    });

    testWidgets('مزوّدون مشابهون يفتحون صفحة المزوّد الآخر فوق الحالية', (
      tester,
    ) async {
      final calls = <String>[];
      await pumpProviderPage(tester, providerApi(richProvider(), calls));

      await tester.tap(find.byKey(const Key('provider_similar_702')));
      await settleFrames(tester);

      expect(
        calls.where((path) => path == '/api/services/providers/702').length,
        1,
        reason: 'النقر على المشابه يجلب المزوّد الآخر',
      );
      expect(find.byType(ServiceProviderDetailsScreen), findsWidgets);
    });

    testWidgets('فتح الصفحة يسجّل مشاهدة واحدة بـX-Visitor-Id محفوظ على الجهاز (#185)', (
      tester,
    ) async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        final path = request.url.path;
        if (path.endsWith('/view')) {
          return http.Response(
            jsonEncode({'success': true, 'counted': true, 'views_count': 13}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        if (path.endsWith('/api/services/providers/701')) {
          return http.Response(
            jsonEncode({'success': true, 'provider': richProvider()}),
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

      await pumpProviderPage(tester, NegevApi(ApiClient(client: client)));

      final views = requests
          .where((request) => request.method == 'POST' && request.url.path.endsWith('/view'))
          .toList();
      expect(views, hasLength(1), reason: 'المشاهدة تُسجَّل مرة واحدة عند فتح الصفحة');
      final visitorId = views.single.headers['X-Visitor-Id'];
      expect(
        visitorId,
        matches(RegExp(r'^[A-Za-z0-9_-]{16,64}$')),
        reason: 'معرّف الزائر بالشكل الذي يقبله الخادم',
      );
      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getString(negevVisitorIdKey),
        visitorId,
        reason: 'المعرّف نفسه محفوظ في الجهاز ولا يُولَّد كل فتح',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_views_count'))).data,
        '13',
        reason: 'العدّاد المعروض يتبع ردّ مسار المشاهدة لا قراءة أقدم منه',
      );
    });

    testWidgets('زرّ الحفظ يبدّل «محفوظ»/«احفظ المزوّد» والعدّاد من ردّ الخادم (#185)', (
      tester,
    ) async {
      final calls = <String>[];
      final provider = richProvider()
        ..['is_favorite'] = true
        ..['favorites_count'] = 4;

      await pumpProviderPage(
        tester,
        providerApi(provider, calls, initialFavorite: true),
        signedIn: true,
      );

      final button = find.byKey(const Key('provider_favorite_btn'));
      expect(button, findsOneWidget, reason: 'الصفحة رُسمت فعلاً');
      expect(
        find.descendant(of: button, matching: find.text('محفوظ')),
        findsOneWidget,
        reason: 'الحالة الأولية من is_favorite التي أعادها الخادم',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_favorites_count'))).data,
        '4',
      );

      await tester.tap(button);
      await settleFrames(tester);

      expect(
        find.descendant(of: button, matching: find.text('احفظ المزوّد')),
        findsOneWidget,
        reason: 'الإلغاء يقلب الزرّ إلى الدعوة للحفظ',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_favorites_count'))).data,
        '3',
        reason: 'والعدّاد ينقص بقيمة ردّ الخادم لا بزيادة محلية',
      );

      await tester.tap(button);
      await settleFrames(tester);

      expect(
        find.descendant(of: button, matching: find.text('محفوظ')),
        findsOneWidget,
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_favorites_count'))).data,
        '4',
      );
    });
  });

  group('تقييمات المزوّد (#186)', () {
    /// مزوّد مقيَّم كما يعيده `GET /api/services/providers/:id` بعد #186، ومعه
    /// تقييم صاحبه في `my_review` — منه تعرف الشاشة أتعرض حذفاً أم كتابة.
    Map<String, dynamic> ratedProvider() => richProvider()
      ..['rating_avg'] = 4.5
      ..['rating_count'] = 2
      ..['rating_distribution'] = <String, dynamic>{'1': 0, '2': 0, '3': 1, '4': 0, '5': 1}
      ..['my_review'] = <String, dynamic>{
        'id': 501,
        'rating': 4,
        'body': 'تجربتي',
        'status': 'visible',
        'created_at': '2026-11-01T10:00:00.000Z',
      };

    List<Map<String, dynamic>> reviewFixtures() => [
          {
            'id': 501,
            'rating': 4,
            'body': 'تجربتي',
            'user_name': 'أنا',
            'created_at': '2026-11-01T10:00:00.000Z',
            'is_mine': false,
            'can_delete': false,
          },
          {
            'id': 502,
            'rating': 5,
            'body': 'خدمة ممتازة',
            'user_name': 'مريم',
            'created_at': '2026-11-02T10:00:00.000Z',
            'is_mine': false,
            'can_delete': false,
          },
        ];

    /// عميل وهمي للتقييمات: `/reviews` مرقّمة، وPUT/DELETE يعيدان ملخّصاً
    /// محدَّثاً كما يفعل الخادم — فلا حساب محلي في الاختبار ولا في الشاشة.
    NegevApi reviewApi(
      Map<String, dynamic> provider,
      List<http.Request> requests, {
      List<Map<String, dynamic>>? reviews,
    }) {
      var ratingAvg = (provider['rating_avg'] as num?)?.toDouble() ?? 4.5;
      var ratingCount = (provider['rating_count'] as num?)?.toInt() ?? 2;
      final distribution =
          Map<String, dynamic>.from(provider['rating_distribution'] as Map? ?? const {});
      final list = [...(reviews ?? reviewFixtures())];

      http.Response jsonResponse(Map<String, dynamic> body) => http.Response(
            jsonEncode(body),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );

      final client = MockClient((request) async {
        requests.add(request);
        final path = request.url.path;
        final method = request.method;

        if (path.endsWith('/api/auth/login')) {
          return jsonResponse({
            'success': true,
            'token': 'test-token',
            'user': {
              'id': 1,
              'phone_number': '0500000000',
              'full_name': 'مستخدم اختبار',
              'role': 'user',
            },
          });
        }
        if (path.endsWith('/view')) {
          return jsonResponse({'success': true, 'counted': true, 'views_count': 13});
        }
        if (path.endsWith('/reviews') && method == 'GET') {
          final page = int.tryParse(request.url.queryParameters['page'] ?? '1') ?? 1;
          final limit = int.tryParse(request.url.queryParameters['limit'] ?? '5') ?? 5;
          return jsonResponse({
            'success': true,
            'reviews': list.skip((page - 1) * limit).take(limit).toList(),
            'pagination': {
              'page': page,
              'limit': limit,
              'total': list.length,
              'totalPages': (list.length / limit).ceil(),
            },
          });
        }
        if (path.endsWith('/review') && method == 'PUT') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          ratingAvg = 4.3;
          ratingCount = 3;
          return jsonResponse({
            'success': true,
            'review': {
              'id': 501,
              'rating': body['rating'],
              'body': body['body'],
              'user_name': 'أنا',
              'created_at': '2026-11-01T10:00:00.000Z',
              'is_mine': true,
              'can_delete': true,
            },
            'rating_avg': ratingAvg,
            'rating_count': ratingCount,
            'rating_distribution': distribution,
          });
        }
        if (path.endsWith('/review') && method == 'DELETE') {
          list.removeWhere((review) => review['id'] == 501);
          ratingAvg = 4.0;
          ratingCount = 1;
          return jsonResponse({
            'success': true,
            'deleted': true,
            'rating_avg': ratingAvg,
            'rating_count': ratingCount,
            'rating_distribution': distribution,
          });
        }
        if (path.endsWith('/report') && method == 'POST') {
          return jsonResponse({'success': true, 'reports_count': 1, 'status': 'visible'});
        }
        if (path.endsWith('/whatsapp')) {
          return jsonResponse({
            'success': true,
            'url': 'https://wa.me/972501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7',
          });
        }
        if (path == '/api/services/providers/701') {
          return jsonResponse({
            'success': true,
            'provider': {
              ...provider,
              'rating_avg': ratingAvg,
              'rating_count': ratingCount,
              'rating_distribution': distribution,
            },
          });
        }
        return jsonResponse({'success': true});
      });
      return NegevApi(ApiClient(client: client));
    }

    testWidgets('تعرض ★ المتوسط والعدد وتوزيع النجوم الخمسة والتعليقات', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, reviewApi(ratedProvider(), requests));

      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_stat_value'))).data,
        '4.5',
        reason: 'المتوسط من الخادم في سطر الإحصاءات',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_avg'))).data,
        '4.5',
      );
      expect(find.text('(2 تقييماً)'), findsOneWidget);

      for (var stars = 1; stars <= 5; stars += 1) {
        expect(
          find.byKey(Key('provider_rating_dist_count_$stars')),
          findsOneWidget,
          reason: 'عمود لكل نجمة من 1 إلى 5',
        );
      }
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_dist_count_5'))).data,
        '1',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_dist_count_3'))).data,
        '1',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_dist_count_1'))).data,
        '0',
        reason: 'النجمة غير الموجودة صفر لا فراغ',
      );

      expect(find.byKey(const Key('provider_review_501')), findsOneWidget);
      expect(find.byKey(const Key('provider_review_502')), findsOneWidget);
      expect(find.text('خدمة ممتازة'), findsOneWidget);
      // «تقييمي» يُعرف من my_review حتى والقائمة عامة بلا هوية كاتبة.
      expect(find.byKey(const Key('provider_review_delete_501')), findsOneWidget);
      expect(find.byKey(const Key('provider_review_report_501')), findsNothing);
      expect(find.byKey(const Key('provider_review_report_502')), findsOneWidget);
    });

    testWidgets('مزوّد بلا تقييمات: لا نجمة ولا توزيع، ودعوة أول مقيِّم', (tester) async {
      final provider = richProvider()
        ..['rating_avg'] = null
        ..['rating_count'] = 0
        ..['rating_distribution'] = <String, dynamic>{'1': 0, '2': 0, '3': 0, '4': 0, '5': 0}
        ..['my_review'] = null;
      final requests = <http.Request>[];

      await pumpProviderPage(tester, reviewApi(provider, requests, reviews: []));

      expect(find.byKey(const Key('provider_rating_stat_value')), findsNothing);
      expect(find.byKey(const Key('provider_rating_distribution')), findsNothing);
      expect(find.byKey(const Key('provider_reviews_empty')), findsOneWidget);
      expect(find.byKey(const Key('provider_write_review_btn')), findsOneWidget);
    });

    testWidgets('ورقة التقييم ترسل النجوم وconfirm_phone: true ثم تحدّث المتوسط', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, reviewApi(ratedProvider(), requests), signedIn: true);

      final detailsRequest = requests.firstWhere(
        (request) =>
            request.method == 'GET' &&
            request.url.path == '/api/services/providers/701',
      );
      expect(
        detailsRequest.headers['Authorization'],
        'Bearer test-token',
        reason: 'التفصيل يُقرأ بالرمز كي يعود my_review لصاحبه',
      );

      await tester.tap(find.byKey(const Key('provider_write_review_btn')));
      await settleFrames(tester);
      expect(find.byKey(const Key('provider_review_stars')), findsOneWidget, reason: 'الورقة فُتحت');

      await tester.tap(find.byKey(const Key('provider_review_star_4')));
      await tester.enterText(find.byKey(const Key('provider_review_body')), 'تجربة ممتازة');
      await tester.tap(find.byKey(const Key('provider_review_confirm_phone')));
      await settleFrames(tester);
      await tester.tap(find.byKey(const Key('provider_review_submit')));
      await settleFrames(tester);

      final puts = requests
          .where((request) =>
              request.method == 'PUT' &&
              request.url.path.endsWith('/api/services/providers/701/review'))
          .toList();
      expect(puts, hasLength(1), reason: 'نداء كتابة واحد');
      final body = jsonDecode(puts.single.body) as Map<String, dynamic>;
      expect(body['rating'], 4, reason: 'النجمة المختارة');
      expect(body['body'], 'تجربة ممتازة');
      expect(body['confirm_phone'], true, reason: 'المربّع يُرسل الإقرار منطقياً');
      expect(find.byKey(const Key('provider_review_stars')), findsNothing, reason: 'الورقة أُغلقت');
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_avg'))).data,
        '4.3',
        reason: 'المتوسط من ردّ الخادم',
      );
    });

    testWidgets('حذف تقييمي من الورقة يرسل DELETE ويحدّث المتوسط والتعليقات', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, reviewApi(ratedProvider(), requests), signedIn: true);

      await tester.tap(find.byKey(const Key('provider_write_review_btn')));
      await settleFrames(tester);
      expect(find.byKey(const Key('provider_review_delete')), findsOneWidget);

      await tester.tap(find.byKey(const Key('provider_review_delete')));
      await settleFrames(tester);
      await tester.tap(find.widgetWithText(TextButton, 'احذف'));
      await settleFrames(tester);

      expect(
        requests.where((request) =>
            request.method == 'DELETE' &&
            request.url.path.endsWith('/api/services/providers/701/review')),
        hasLength(1),
        reason: 'الحذف عبر مسار التقييم نفسه',
      );
      expect(
        tester.widget<Text>(find.byKey(const Key('provider_rating_avg'))).data,
        '4.0',
      );
      expect(find.byKey(const Key('provider_review_501')), findsNothing);
      expect(find.byKey(const Key('provider_review_502')), findsOneWidget);
    });

    testWidgets('قائمة التعليقات مرقّمة و«المزيد» يضيف الصفحة التالية', (tester) async {
      final requests = <http.Request>[];
      final many = [
        for (var index = 0; index < 6; index += 1)
          {
            'id': 600 + index,
            'rating': 5,
            'body': 'تعليق ${600 + index}',
            'user_name': 'مستخدم ${600 + index}',
            'created_at': '2026-11-01T10:00:00.000Z',
            'is_mine': false,
            'can_delete': false,
          }
      ];

      await pumpProviderPage(
        tester,
        reviewApi(ratedProvider(), requests, reviews: many),
      );

      expect(find.byKey(const Key('provider_review_600')), findsOneWidget);
      expect(find.byKey(const Key('provider_review_604')), findsOneWidget);
      expect(
        find.byKey(const Key('provider_review_605')),
        findsNothing,
        reason: 'الصفحة الثانية لم تُطلب بعد',
      );
      expect(find.byKey(const Key('provider_reviews_more')), findsOneWidget);

      await tester.tap(find.byKey(const Key('provider_reviews_more')));
      await settleFrames(tester);

      expect(find.byKey(const Key('provider_review_605')), findsOneWidget);
      expect(
        find.byKey(const Key('provider_reviews_more')),
        findsNothing,
        reason: 'لا مزيد بعد آخر صفحة',
      );
    });

    testWidgets('تقييم مخفي: الملاحظة ظاهرة والحذف يبقى متاحاً لصاحبه', (tester) async {
      final provider = ratedProvider()
        ..['my_review'] = <String, dynamic>{
          'id': 501,
          'rating': 3,
          'body': 'رأي قديم',
          'status': 'hidden',
          'created_at': '2026-11-01T10:00:00.000Z',
        };
      final requests = <http.Request>[];

      await pumpProviderPage(
        tester,
        reviewApi(
          provider,
          requests,
          reviews: reviewFixtures().where((review) => review['id'] != 501).toList(),
        ),
        signedIn: true,
      );

      expect(find.byKey(const Key('provider_review_hidden_note')), findsOneWidget);

      await tester.tap(find.byKey(const Key('provider_write_review_btn')));
      await settleFrames(tester);
      expect(find.byKey(const Key('provider_review_delete')), findsOneWidget);
      expect(find.textContaining('مخفي بعد البلاغات'), findsWidgets);
    });

    testWidgets('«بلّغ» يرسل POST لبلاغ واحد على التقييم', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, reviewApi(ratedProvider(), requests));

      await tester.tap(find.byKey(const Key('provider_review_report_502')));
      await settleFrames(tester);
      expect(find.byType(AlertDialog), findsOneWidget);

      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.widgetWithText(TextButton, 'بلّغ'),
        ),
      );
      await settleFrames(tester);

      expect(
        requests.where((request) =>
            request.method == 'POST' &&
            request.url.path.endsWith('/reviews/502/report')),
        hasLength(1),
        reason: 'بلاغ واحد على التقييم نفسه',
      );
    });
  });

  group('ردّ المزوّد المربوط (#187)', () {
    /// مزوّد مربوط بحساب — `is_linked_provider` تعني «هذا الحساب صاحبه».
    Map<String, dynamic> linkedProvider() => {
          'id': 701,
          'name': 'مزوّد الردّ',
          'category_id': 9,
          'category_name': 'صالات أفراح',
          'category_icon': '🏛️',
          'category_color': '#8a6109',
          'phone': '0501234567',
          'has_phone': true,
          'description': 'قاعة واسعة',
          'image_url': null,
          'logo_url': null,
          'cover_url': null,
          'hours': <dynamic>[],
          'gallery': <dynamic>[],
          'offers': <dynamic>[],
          'products': <dynamic>[],
          'similar': <dynamic>[],
          'price': 100,
          'price_type': 'fixed',
          'price_estimate_desc': null,
          'attributes': <String, dynamic>{},
          'status': 'approved',
          'towns': <dynamic>['رهط'],
          'views_count': 3,
          'favorites_count': 0,
          'is_favorite': false,
          'rating_avg': 4.5,
          'rating_count': 2,
          'rating_distribution': {'1': 0, '2': 0, '3': 1, '4': 0, '5': 1},
          'my_review': null,
          'is_linked_provider': true,
        };

    /// ثلاثة تعليقات: بردّ قائم، وبلا ردّ (`can_reply`)، ولغير المربوط.
    List<Map<String, dynamic>> replyReviews() => [
          {
            'id': 601,
            'rating': 5,
            'body': 'خدمة ممتازة',
            'user_name': 'مريم',
            'created_at': '2026-11-01T10:00:00.000Z',
            'is_mine': false,
            'can_delete': false,
            'can_reply': true,
            'reply_body': 'شكراً لك على ثقتك',
            'reply_at': '2026-11-02T09:00:00.000Z',
          },
          {
            'id': 602,
            'rating': 4,
            'body': 'تجربة جميلة',
            'user_name': 'سالم',
            'created_at': '2026-11-01T11:00:00.000Z',
            'is_mine': false,
            'can_delete': false,
            'can_reply': true,
          },
          {
            'id': 603,
            'rating': 3,
            'body': 'جيد',
            'user_name': 'هند',
            'created_at': '2026-11-01T12:00:00.000Z',
            'is_mine': false,
            'can_delete': false,
            'can_reply': false,
          },
        ];

    /// عميل وهمي: `/reviews` مرقّمة، و`PUT /api/services/reviews/:rid/reply`
    /// يكتب الردّ في المجموعة نفسها ويعيد الصفّ كما يفعل الخادم — فلا حساب
    /// محلي في الشاشة ولا في الاختبار.
    NegevApi replyApi(Map<String, dynamic> provider, List<http.Request> requests) {
      final list = replyReviews();

      http.Response jsonResponse(Map<String, dynamic> body) => http.Response(
            jsonEncode(body),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );

      final client = MockClient((request) async {
        requests.add(request);
        final path = request.url.path;
        final method = request.method;

        if (path.endsWith('/api/auth/login')) {
          return jsonResponse({
            'success': true,
            'token': 'test-token',
            'user': {
              'id': 1,
              'phone_number': '0500000000',
              'full_name': 'مستخدم اختبار',
              'role': 'user',
            },
          });
        }
        if (path.endsWith('/view')) {
          return jsonResponse({'success': true, 'counted': true, 'views_count': 4});
        }
        if (path.endsWith('/reviews') && method == 'GET') {
          final page = int.tryParse(request.url.queryParameters['page'] ?? '1') ?? 1;
          final limit = int.tryParse(request.url.queryParameters['limit'] ?? '5') ?? 5;
          return jsonResponse({
            'success': true,
            'reviews': list.skip((page - 1) * limit).take(limit).toList(),
            'pagination': {
              'page': page,
              'limit': limit,
              'total': list.length,
              'totalPages': (list.length / limit).ceil(),
            },
          });
        }

        final replyMatch = RegExp(r'/api/services/reviews/(\d+)/reply$').firstMatch(path);
        if (replyMatch != null && method == 'PUT') {
          final id = int.parse(replyMatch.group(1)!);
          final row = list.firstWhere((review) => review['id'] == id);
          if (row['can_reply'] != true) {
            return http.Response(
              jsonEncode({'success': false, 'message': 'التقييم غير موجود'}),
              404,
              headers: {'content-type': 'application/json; charset=utf-8'},
            );
          }
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          row['reply_body'] = body['reply_body'];
          row['reply_at'] = '2026-11-03T11:30:00.000Z';
          return jsonResponse({'success': true, 'review': {...row}});
        }

        if (path == '/api/services/providers/701') {
          return jsonResponse({'success': true, 'provider': provider});
        }
        return jsonResponse({'success': true});
      });

      return NegevApi(ApiClient(client: client));
    }

    testWidgets('الردّ اقتباس تحت التقييم، وزرّه للحساب المربوط وحده', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, replyApi(linkedProvider(), requests), signedIn: true);

      expect(
        find.byKey(const Key('provider_review_reply_601')),
        findsOneWidget,
        reason: 'الردّ يظهر تحت التقييم',
      );
      expect(find.text('ردّ المزوّد'), findsOneWidget, reason: 'وبتسمية صريحة أنه ردّ المزوّد');
      expect(find.text('شكراً لك على ثقتك'), findsOneWidget, reason: 'وبنصّه');
      expect(
        find.byKey(const Key('provider_review_reply_btn_601')),
        findsOneWidget,
        reason: 'وللحساب المربوط زرّه',
      );
      expect(find.text('عدّل الردّ'), findsWidgets, reason: 'ونصّه تعديل لأن هناك ردّاً');

      expect(
        find.byKey(const Key('provider_review_reply_602')),
        findsNothing,
        reason: 'لا اقتباس تحت تقييم بلا ردّ',
      );
      expect(
        find.byKey(const Key('provider_review_reply_btn_602')),
        findsOneWidget,
        reason: 'لكن زرّ الردّ متاح للحساب المربوط',
      );
      expect(
        find.byKey(const Key('provider_review_reply_btn_603')),
        findsNothing,
        reason: 'وتقييم مزوّد آخر لا زرّ ردّ لهذا الحساب',
      );
    });

    testWidgets('ورقة الردّ تُعبَّأ من الردّ القائم وتُرسل بـPUT إلى مسار التقييم', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, replyApi(linkedProvider(), requests), signedIn: true);

      await tester.tap(find.byKey(const Key('provider_review_reply_btn_601')));
      await settleFrames(tester);

      expect(find.byKey(const Key('provider_reply_body')), findsOneWidget, reason: 'الورقة فُتحت');
      final field = tester.widget<TextField>(find.byKey(const Key('provider_reply_body')));
      expect(
        field.controller?.text,
        'شكراً لك على ثقتك',
        reason: 'التعديل يبدأ من النصّ القائم لا من فراغ',
      );

      const updated = 'شكراً لك، ونعتذر عن أي تأخير';
      await tester.enterText(find.byKey(const Key('provider_reply_body')), updated);
      await tester.tap(find.byKey(const Key('provider_reply_submit')));
      await settleFrames(tester);

      final sent = requests.where((request) =>
          request.method == 'PUT' &&
          request.url.path.endsWith('/api/services/reviews/601/reply'));
      expect(sent, hasLength(1), reason: 'ردّ واحد على التقييم نفسه');
      expect(
        (jsonDecode(sent.first.body) as Map<String, dynamic>)['reply_body'],
        updated,
        reason: 'والنصّ كما كُتب',
      );
      expect(find.byKey(const Key('provider_reply_body')), findsNothing, reason: 'الورقة أُغلقت');
      // النصّ وحده لا يفرّق بين صفٍّ جاء من ردّ الخادم وصفٍّ عُدِّل محلياً؛
      // وتاريخ الردّ لا يوجد إلا في الصفّ العائد من `PUT`، فحضوره يثبت المصدر.
      final replyDate = find.byKey(const Key('provider_review_reply_date_601'));
      expect(replyDate, findsOneWidget, reason: 'التاريخ من ردّ الخادم لا من حساب محلي');
      expect(
        tester.widget<Text>(replyDate).data,
        isNotEmpty,
        reason: 'وللردّ تاريخ منسوب إليه',
      );
      expect(find.text(updated), findsOneWidget, reason: 'والاقتباس يُرسم من ردّ الخادم');
    });

    testWidgets('الورقة لا تُرسل ردّاً فارغاً', (tester) async {
      final requests = <http.Request>[];
      await pumpProviderPage(tester, replyApi(linkedProvider(), requests), signedIn: true);

      await tester.tap(find.byKey(const Key('provider_review_reply_btn_602')));
      await settleFrames(tester);
      await tester.tap(find.byKey(const Key('provider_reply_submit')));
      await settleFrames(tester);

      expect(
        requests.where((request) =>
            request.method == 'PUT' && request.url.path.contains('/reply')),
        isEmpty,
        reason: 'النصّ الفارغ لا يصل الخادم',
      );
      expect(
        find.byKey(const Key('provider_reply_body')),
        findsOneWidget,
        reason: 'والورقة تبقى مفتوحة ليكتب',
      );
    });
  });
}
