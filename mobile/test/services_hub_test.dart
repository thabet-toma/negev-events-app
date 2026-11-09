import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/news_screen.dart';
import 'package:negev_events/screens/services_calculators_screen.dart';
import 'package:negev_events/screens/services_hub_screen.dart';
import 'package:negev_events/screens/services_prices_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';

/// ردّ `/api/prices` كما يعيده الخادم (تذكرة #189): أسعار مزيّفة صحيحة الأرقام،
/// والغرام ٢٤ = ٥٠٠ شيكل فتصير ٢١ = ٤٣٧٫٥ و١٨ = ٣٧٥ (والخادم هو من يقرّب).
/// `source_time` و`fx_date` فيه كي يُختبر عرض التاريخ لا مجرّد الحساب — ووقت
/// المصدر ٢٢:٣٠Z عمداً: تاريخه **المحلي** في القدس «١٠ نوفمبر»، فلو عُرض بتوقيت
/// الجهاز لسقط تأكيد «٩ نوفمبر»؛ المعروض تقويم المصدر (UTC).
const Map<String, dynamic> pricesFixture = {
  'success': true,
  'gold': {
    'k24': 500.0,
    'k21': 437.5,
    'k18': 375.0,
    'currency': 'ILS',
    'source_time': '2026-11-09T22:30:00Z',
  },
  'currencies': [
    {'code': 'USD', 'name_ar': 'دولار أمريكي', 'ils_per_unit': 4.0},
    {'code': 'EUR', 'name_ar': 'يورو', 'ils_per_unit': 5.0},
    {'code': 'GBP', 'name_ar': 'جنيه إسترليني', 'ils_per_unit': 8.0},
    {'code': 'JOD', 'name_ar': 'دينار أردني', 'ils_per_unit': 2.0},
    {'code': 'EGP', 'name_ar': 'جنيه مصري', 'ils_per_unit': 0.04},
    {'code': 'TRY', 'name_ar': 'ليرة تركية', 'ils_per_unit': 0.0625},
  ],
  'fx_date': '2026-11-09',
  'stale': false,
};

/// عميل وهمي لشاشة «خدماتنا»: `/api/news` يعيد تغذية فارغة (الشاشة المدفوعة
/// تجلبها عند فتحها)، و`/api/prices` ردّ الأسعار المزيّف أعلاه، وما عداها ردّ
/// ناجح بلا جسم. لا يُفتح أي رابط خارجي هنا.
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
    if (request.url.path.endsWith('/api/prices')) {
      return http.Response(
        jsonEncode(pricesFixture),
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

/// عميل وهمي يفشل في `/api/prices` وحده (503 عربية كما يفعل الخادم) — لحالة
/// «لا تصل الأسعار»: الأداتان وتاريخهما يختفيان، والسطر العربي يبقى.
NegevApi failingPricesApi() {
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/api/prices')) {
      return http.Response(
        jsonEncode({
          'success': false,
          'message': 'تعذّر جلب أسعار الذهب والعملات الآن',
        }),
        503,
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
    testWidgets('تُبني بالعنوان والوصف والكبسات الثلاث بتخطيطها', (
      tester,
    ) async {
      await pumpHub(tester, hubApi());

      expect(find.byType(ServicesHubScreen), findsOneWidget);
      expect(find.text('خدماتنا'), findsOneWidget);
      // شريط علوي واحد (#157): الترويسة في الهيكل وحدها، لا `AppBar` هنا.
      expect(
        find.byType(AppBar),
        findsNothing,
        reason: 'الوجهة بلا شريط علوي خاص بها — الترويسة في الهيكل',
      );
      expect(
        find.text('منصاتنا الأخرى من شركة كترا للحلول الذكية'),
        findsOneWidget,
      );

      // الكبسات الثلاث موجودة بمفاتيحها.
      expect(find.byKey(const Key('hub_card_news')), findsOneWidget);
      expect(find.byKey(const Key('hub_card_stores')), findsOneWidget);
      expect(find.byKey(const Key('hub_card_erp')), findsOneWidget);

      // الترتيب المرئي: عمود من ثلاث كبسات متراصة رأسياً وبعرض واحد — لا صفّ
      // صورتين وعريضة تحتهما.
      final newsRect = tester.getRect(find.byKey(const Key('hub_card_news')));
      final storesRect = tester.getRect(
        find.byKey(const Key('hub_card_stores')),
      );
      final erpRect = tester.getRect(find.byKey(const Key('hub_card_erp')));
      expect(
        storesRect.top,
        greaterThan(newsRect.top),
        reason: 'متاجرنا تحت آخر خبر',
      );
      expect(
        erpRect.top,
        greaterThan(storesRect.top),
        reason: 'ERP تحت متاجرنا',
      );
      expect(
        (storesRect.width - newsRect.width).abs(),
        lessThanOrEqualTo(1),
        reason: 'عرض واحد للكبسات الثلاث',
      );
      expect(
        (erpRect.width - storesRect.width).abs(),
        lessThanOrEqualTo(1),
        reason: 'عرض واحد للكبسات الثلاث',
      );
      for (final rect in [newsRect, storesRect, erpRect]) {
        expect(rect.height, lessThan(130), reason: 'كبسة لا بطاقة صورة');
      }

      // كل كبسة تحمل صورتها وكبسولة «افتح» الواحدة.
      for (final key in const [
        'hub_card_news',
        'hub_card_stores',
        'hub_card_erp',
      ]) {
        expect(
          find.descendant(
            of: find.byKey(Key(key)),
            matching: find.byType(Image),
          ),
          findsWidgets,
          reason: 'صورة الكبسة $key',
        );
        expect(
          find.descendant(
            of: find.byKey(Key(key)),
            matching: find.text('افتح'),
          ),
          findsOneWidget,
          reason: 'كبسولة «افتح» في $key',
        );
      }

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
          matching: find.text('أخبار منطقتك أولاً بأول'),
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
          matching: find.text('مطاعم ومتاجر بلدتك'),
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
          matching: find.text('مخزون وفواتير ومحاسبة'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('بطاقة «آخر خبر» تدفع NewsScreen داخل الشجرة', (tester) async {
      await pumpHub(tester, hubApi());

      expect(find.byType(NewsScreen), findsNothing);

      await tester.tap(find.byKey(const Key('hub_card_news')));
      await tester.pumpAndSettle();

      // الشاشة المدفوعة نفسها، لا رابط خارجي. و«خدماتنا» باقية خلفها في مكدّس
      // الملاحة (خارج العرض الآن، فالمفتاح الافتراضي يتخطّاها).
      expect(find.byType(NewsScreen), findsOneWidget);
      expect(
        find.byType(ServicesHubScreen, skipOffstage: false),
        findsOneWidget,
      );
    });

    testWidgets('بطاقات الحاسبات الخمس تحت المنصّات تفتح الشاشة على لوحتها', (
      tester,
    ) async {
      await pumpHub(tester, hubApi());

      expect(find.text('حاسبات تهمّك'), findsOneWidget);
      for (final key in const [
        'hub_calc_budget',
        'hub_calc_split',
        'hub_calc_guests',
        'hub_calc_countdown',
        'hub_calc_hijri',
      ]) {
        expect(find.byKey(Key(key)), findsOneWidget, reason: 'بطاقة $key');
      }
      expect(
        find.textContaining('خمس حاسبات تعمل على جهازك بلا إنترنت'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('hub_calc_hijri')));
      await tester.pumpAndSettle();

      // شاشة الحاسبات نفسها على اللوحة المطلوبة، و«خدماتنا» باقية خلفها.
      expect(find.byType(ServicesCalculatorsScreen), findsOneWidget);
      expect(find.byKey(const Key('calc_hijri_date')), findsOneWidget);
      expect(
        find.byType(ServicesHubScreen, skipOffstage: false),
        findsOneWidget,
      );
    });
  });

  group('أداتا الأسعار — حاسبة الذهب ومحوّل العملات (#189)', () {
    testWidgets('بطاقتاهما تحت الحاسبات وتفتحان شاشة الأسعار على أداتها', (
      tester,
    ) async {
      await pumpHub(tester, hubApi());

      expect(find.text('أسعار الذهب والعملات'), findsOneWidget);
      expect(
        find.textContaining('وحاسبتان تعملان بالسعر الواصل وتُظهران تاريخه'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('hub_prices_gold')), findsOneWidget);
      expect(find.byKey(const Key('hub_prices_fx')), findsOneWidget);

      // البطاقتان بعد الحاسبات المحلية في الترتيب نفسه (الذهب ثم العملات).
      final lastCalcRect = tester.getRect(
        find.byKey(const Key('hub_calc_hijri')),
      );
      final goldRect = tester.getRect(find.byKey(const Key('hub_prices_gold')));
      final fxRect = tester.getRect(find.byKey(const Key('hub_prices_fx')));
      expect(goldRect.top, greaterThan(lastCalcRect.top));
      expect(fxRect.top, greaterThan(goldRect.top));

      await tester.tap(find.byKey(const Key('hub_prices_gold')));
      await tester.pumpAndSettle();

      expect(find.byType(ServicesPricesScreen), findsOneWidget);
      expect(
        find.byType(ServicesHubScreen, skipOffstage: false),
        findsOneWidget,
      );
    });

    testWidgets('حاسبة الذهب تضرب الوزن في سعر العيار وتُظهر تاريخ المصدر', (
      tester,
    ) async {
      await pumpHub(tester, hubApi());

      await tester.tap(find.byKey(const Key('hub_prices_gold')));
      await tester.pumpAndSettle();

      // تاريخ المصدر ظاهر قبل أي حساب — تاريخ gold-api لا لحظة الجلب.
      expect(
        find.text('تاريخ سعر الذهب: ٩ نوفمبر ٢٠٢٦ — المصدر: gold-api.'),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('prices_gold_weight')),
        '10',
      );
      await tester.tap(find.byKey(const Key('prices_gold_karat_21')));
      await tester.tap(find.byKey(const Key('prices_gold_run')));
      await tester.pump();

      // ١٠ غرام × ٤٣٧٫٥٠ = ٤٬٣٧٥٫٠٠ — بلا مصنعية، والعبارة نفسها في النتيجة.
      expect(
        find.text(
          'قيمة المعدن بلا مصنعية: ٤٬٣٧٥ ₪ — '
          'سعر غرام عيار ٢١ نحو ٤٣٧٫٥٠ ₪.',
        ),
        findsOneWidget,
      );

      // عيار آخر يعيد الحساب من سعره هو (٥٠٠ للغرام): ١٠ × ٥٠٠ = ٥٬٠٠٠.
      await tester.tap(find.byKey(const Key('prices_gold_karat_24')));
      await tester.tap(find.byKey(const Key('prices_gold_run')));
      await tester.pump();
      expect(
        find.textContaining('قيمة المعدن بلا مصنعية: ٥٬٠٠٠ ₪'),
        findsOneWidget,
      );
    });

    testWidgets('محوّل العملات يحوّل في الاتجاهين بسعر ils_per_unit ويعرض التاريخ', (
      tester,
    ) async {
      await pumpHub(tester, hubApi());

      await tester.tap(find.byKey(const Key('hub_prices_fx')));
      await tester.pumpAndSettle();

      expect(
        find.text('تاريخ سعر الصرف: ٩ نوفمبر ٢٠٢٦ — المصدر: Frankfurter.'),
        findsOneWidget,
      );

      await tester.enterText(find.byKey(const Key('prices_fx_amount')), '400');
      await tester.tap(find.byKey(const Key('prices_fx_currency_USD')));
      await tester.tap(find.byKey(const Key('prices_fx_run')));
      await tester.pump();
      expect(
        find.text(
          '٤٠٠ ₪ = ١٠٠٫٠٠ دولار أمريكي بسعر ٤٫٠٠٠٠ ₪ للوحدة الواحدة.',
        ),
        findsOneWidget,
      );

      // الاتجاه المعاكس: ٤٠٠ دولار × ٤ = ١٬٦٠٠ شيكل.
      await tester.tap(find.byKey(const Key('prices_fx_to_ils')));
      await tester.tap(find.byKey(const Key('prices_fx_run')));
      await tester.pump();
      expect(
        find.text(
          '٤٠٠٫٠٠ دولار أمريكي = ١٬٦٠٠ ₪ بسعر ٤٫٠٠٠٠ ₪ للوحدة الواحدة.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('حين لا تصل الأسعار تُخفى الأداة وتاريخها ويبقى سطر عربي واحد', (
      tester,
    ) async {
      await pumpHub(tester, failingPricesApi());

      await tester.tap(find.byKey(const Key('hub_prices_gold')));
      await tester.pumpAndSettle();

      expect(find.text(pricesUnavailableMessage), findsOneWidget);
      expect(
        find.byKey(const Key('prices_gold_weight')),
        findsNothing,
        reason: 'لا حاسبة بسعر مخترع',
      );
      expect(
        find.byKey(const Key('prices_gold_source')),
        findsNothing,
        reason: 'ولا تاريخ وهمي',
      );
      expect(find.byKey(const Key('prices_retry')), findsOneWidget);
    });
  });
}
