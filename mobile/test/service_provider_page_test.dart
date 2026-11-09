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
NegevApi providerApi(Map<String, dynamic> provider, List<String> calls) {
  final client = MockClient((request) async {
    calls.add(request.url.path);
    if (request.url.path.endsWith('/whatsapp')) {
      return http.Response(
        jsonEncode({'success': true, 'url': 'https://wa.me/972501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7'}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (request.url.path.startsWith('/api/services/providers/')) {
      return http.Response(
        jsonEncode({'success': true, 'provider': provider}),
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

Future<void> pumpProviderPage(WidgetTester tester, NegevApi api) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: AuthStore(api),
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
  });
}
