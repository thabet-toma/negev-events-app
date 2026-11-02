import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/news_screen.dart';
import 'package:negev_events/screens/services_hub_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';

/// عميل وهمي لشاشة «خدماتنا»: `/api/news` يعيد تغذية فارغة (الشاشة المدفوعة
/// تجلبها عند فتحها)، وما عداها ردّ ناجح بلا جسم. لا يُفتح أي رابط خارجي هنا.
NegevApi hubApi() {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/news')) {
      return http.Response(
        jsonEncode({
          'success': true,
          'region_id': 1,
          'region_name': 'النقب',
          'area': 'النقب',
          'general': false,
          'items': <Map<String, dynamic>>[],
          'has_more': false,
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

/// نافذة أعلى من الافتراضية كي تُبنى البطاقات الثلاث كلها في `ListView` واحد
/// (الافتراضية تقصّ الثالثة خارج منطقة البناء).
Future<void> pumpHub(WidgetTester tester, NegevApi api) async {
  tester.view.physicalSize = const Size(800, 2000);
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
          child: ServicesHubScreen(),
        ),
      ),
    ),
  );
}

void main() {
  group('شاشة «خدماتنا» — بطاقات منصات كترا الثلاث', () {
    testWidgets('تُبني بالعنوان والوصف والبطاقات الثلاث بترتيبها', (tester) async {
      await pumpHub(tester, hubApi());

      expect(find.byType(ServicesHubScreen), findsOneWidget);
      expect(find.text('خدماتنا'), findsOneWidget);
      expect(
        find.text('منصاتنا الأخرى من شركة كترا للحلول الذكية'),
        findsOneWidget,
      );

      // البطاقات الثلاث موجودة بمفاتيحها.
      expect(find.byKey(const Key('hub_card_news')), findsOneWidget);
      expect(find.byKey(const Key('hub_card_stores')), findsOneWidget);
      expect(find.byKey(const Key('hub_card_erp')), findsOneWidget);

      // الترتيب المرئي: آخر خبر، ثم متاجرنا، ثم K.T.R.A ERP — لا ترتيباً آخر.
      final newsTop = tester.getTopLeft(find.byKey(const Key('hub_card_news'))).dy;
      final storesTop =
          tester.getTopLeft(find.byKey(const Key('hub_card_stores'))).dy;
      final erpTop = tester.getTopLeft(find.byKey(const Key('hub_card_erp'))).dy;
      expect(newsTop, lessThan(storesTop));
      expect(storesTop, lessThan(erpTop));

      // النصوص العربية كما في الشاشة، كلٌّ داخل بطاقته.
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_news')),
          matching: find.text('آخر خبر'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_news')),
          matching: find.text('أخبار منطقتك لحظة بلحظة، من منصة كترا الإخبارية'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_stores')),
          matching: find.text('متاجرنا'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_stores')),
          matching: find.text(
            'مطاعم ومتاجر بلدتك، هواتف وإلكترونيات، بقالة ومستلزمات، '
            'مع توصيل ودفع عند الاستلام',
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_erp')),
          matching: find.text('K.T.R.A ERP'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_erp')),
          matching: find.text(
            'إدارة الاستيراد والمخزون والفواتير والمحاسبة، مع بوابة خاصة '
            'للمحاسب القانوني',
          ),
        ),
        findsOneWidget,
      );

      // زرّ «افتح» في الأولى وحدها، و«زيارة المنصة» في الخارجيتين.
      expect(
        find.descendant(
          of: find.byKey(const Key('hub_card_news')),
          matching: find.text('افتح'),
        ),
        findsOneWidget,
      );
      expect(find.text('افتح'), findsOneWidget);
      expect(find.text('زيارة المنصة'), findsNWidgets(2));
    });

    testWidgets('زرّ «افتح» يدفع NewsScreen داخل الشجرة', (tester) async {
      await pumpHub(tester, hubApi());

      expect(find.byType(NewsScreen), findsNothing);

      await tester.tap(
        find.descendant(
          of: find.byKey(const Key('hub_card_news')),
          matching: find.text('افتح'),
        ),
      );
      await tester.pumpAndSettle();

      // الشاشة المدفوعة نفسها، لا رابط خارجي. و«خدماتنا» باقية خلفها في مكدّس
      // الملاحة (خارج العرض الآن، فالمفتاح الافتراضي يتخطّاها).
      expect(find.byType(NewsScreen), findsOneWidget);
      expect(
        find.byType(ServicesHubScreen, skipOffstage: false),
        findsOneWidget,
      );
    });
  });
}
