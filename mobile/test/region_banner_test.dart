import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/places_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/state/region_onboarding.dart';
import 'package:negev_events/state/region_store.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/region_banner.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// شريط التوسّع (#127) ومنتقي المناطق — نظير الويب حرفياً.
///
/// **لا اسم محافظة ولا رقم مكتوب في التطبيق:** كل ما يُعرض هنا (اسم المحافظة،
/// وعدد مناسباتها، وعدد بلداتها، وحالتها) يأتي من ردّ `GET /api/towns` الوهمي
/// في هذا الملف — وهو المصدر الوحيد لما يعرفه العميل عن المحافظات.
const _originName = 'النقب';
const _destinationName = 'طولكرم';
const _lodName = 'اللد والرملة ويافا';
const _stoppedName = 'محافظة قادمة';

const _originRegion = <String, dynamic>{
  'id': 1,
  'name': _originName,
  'is_active': true,
  'latitude': 31.25,
  'longitude': 34.79,
  'map_zoom': 9,
  'position': 1,
  'towns': ['رهط', 'حورة'],
  'towns_count': 2,
  'events_count': 12,
};

const _destinationRegion = <String, dynamic>{
  'id': 2,
  'name': _destinationName,
  'is_active': true,
  'latitude': 32.31,
  'longitude': 35.03,
  'map_zoom': 10,
  'position': 2,
  'towns': [_destinationName],
  'towns_count': 1,
  'events_count': 7,
};

/// محافظة ثالثة كما في الخادم الحقيقي: صفر مناسبة معتمدة، وثلاث بلدات نشطة.
/// الشريط يعرض بلداتها لا «0 مناسبة».
const _lodRegion = <String, dynamic>{
  'id': 5,
  'name': _lodName,
  'is_active': true,
  'latitude': 31.95,
  'longitude': 34.89,
  'map_zoom': 10,
  'position': 3,
  'towns': ['اللد', 'الرملة', 'يافا'],
  'towns_count': 3,
  'events_count': 0,
};

const _soonRegion = <String, dynamic>{
  'id': 3,
  'name': _stoppedName,
};

/// خادم `GET /api/towns` الوهمي — بقيّة المسارات ردود عامة كافية لهيكل الشاشة.
class _DiscoveryServer {
  _DiscoveryServer({
    this.townsFail = false,
    List<Map<String, dynamic>>? regions,
  }) : regions = regions ?? const [_originRegion, _destinationRegion];

  /// فشل `GET /api/towns` — الكتالوج يعود احتياطياً (`fromServer: false`).
  final bool townsFail;

  /// محافظات مفتاح `regions` — الافتراضية محافظتا الملف، ويبدّلها اختبارٌ
  /// يحتاج حالةً أخرى (صفر مناسبات، بلدات…) بدل نسخة ثانية من الخادم.
  final List<Map<String, dynamic>> regions;

  http.Response _json(Map<String, dynamic> body, [int status = 200]) =>
      http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  Future<http.Response> handle(http.Request request) async {
    if (request.url.path.endsWith('/api/towns')) {
      if (townsFail) return _json({'success': false}, 500);
      return _json({
        'success': true,
        'towns': ['الكل', 'رهط', 'حورة', _destinationName],
        'regions': regions,
        'regions_soon': const [_soonRegion],
        'villages': const <Map<String, dynamic>>[],
        'town_coordinates': {
          'رهط': {'lat': 31.39, 'lng': 34.75},
        },
      });
    }
    return _json({
      'success': true,
      'events': const <Map<String, dynamic>>[],
      'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
      'announcements': const <Map<String, dynamic>>[],
      'stories': const <Map<String, dynamic>>[],
      'types': const <Map<String, dynamic>>[],
    });
  }
}

({NegevApi api, AuthStore auth, PlacesStore places, RegionStore regions})
    _services(_DiscoveryServer server) {
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  final places = PlacesStore(api);
  final regions = RegionStore(api, places, auth);
  return (api: api, auth: auth, places: places, regions: regions);
}

Widget _app(
  ({NegevApi api, AuthStore auth, PlacesStore places, RegionStore regions})
      services,
  Widget home,
) {
  return AppServices(
    api: services.api,
    auth: services.auth,
    realtime: RealtimeService(),
    places: services.places,
    regions: services.regions,
    child: MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(textDirection: TextDirection.rtl, child: home),
    ),
  );
}

/// محافظة واحدة كما يفكّها العميل من ردّ الخادم — الاختبارات الوحدوية تبنيها
/// من نفس الخرائط أعلاه، فلا نسخة ثانية من الأرقام في مكان آخر.
Region _region(Map<String, dynamic> json) => Region.fromJson(json);

/// إقلاع هيكل التطبيق وانتظار الشريط — بلا `pumpAndSettle` (تبويبات
/// `IndexedStack` فيها مؤشّر تحميل لا ينتهي)، كما في اختبار ورقة #126.
Future<void> _boot(WidgetTester tester, Widget home) async {
  await tester.pumpWidget(home);
  await tester.pump();
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 300));
  }
}

/// نصّ كل `Text` داخل الشريط — لا عنصراً واحداً: «لا صفر» حكمٌ على الشريط
/// كلّه لا على سطر الأرقام وحده.
List<String> _bannerTexts(WidgetTester tester) {
  final texts = tester.widgetList<Text>(
    find.descendant(
      of: find.byKey(const Key('region_banner')),
      matching: find.byType(Text),
    ),
  );
  return [for (final text in texts) text.data ?? ''];
}

/// صفرٌ وحده في نصّ — لا الصفر الذي داخل «10»: العدّ نفسه يجوز أن يحمل الصفر
/// رقماً داخلياً، والممنوع أن يُعرض العدّ صفراً.
final RegExp _standaloneZero = RegExp(r'(^|[^0-9٠-٩])[0٠]([^0-9٠-٩]|$)');

void main() {
  group('بناء الشريط — من استجابة الخادم وحدها', () {
    test('العنوان والسطر: الأسماء والأرقام من المحافظات الواصلة، لا من ثوابت', () {
      final data = buildRegionBanner(
        regions: [_region(_originRegion), _region(_destinationRegion)],
        effectiveRegionId: 2,
      );

      expect(data, isNotNull);
      // النصّ نفسه في الويب: «بعد النجاح في {الأصل}… توسّعنا إلى {الفعّالة}».
      expect(
        data!.title,
        'بعد النجاح في $_originName… توسّعنا إلى $_destinationName',
      );
      // العدد ووحدته معاً: المناسبات المعتمدة حين توجد، بصيغة عددها.
      expect(data.events, _destinationRegion['events_count']);
      expect(data.line, '7 مناسبات في $_destinationName');
    });

    test('لا شريط على الأصل، ولا بلا عدّادين من الخادم', () {
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), _region(_destinationRegion)],
          effectiveRegionId: 1,
        ),
        isNull,
        reason: 'الشريط خبر توسّع، ولا خبر على المحافظة الأولى',
      );

      // بلا اختيار: الفعّالة هي الأصل نفسها — لا شريط.
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), _region(_destinationRegion)],
        ),
        isNull,
      );

      // غياب أحد العدّادين يعني خادماً لا يرسل الرقم — لا رقم مخترع.
      final withoutEvents = Map<String, dynamic>.from(_destinationRegion)
        ..remove('events_count');
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), _region(withoutEvents)],
          effectiveRegionId: 2,
        ),
        isNull,
      );
      final withoutTowns = Map<String, dynamic>.from(_destinationRegion)
        ..remove('towns_count');
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), _region(withoutTowns)],
          effectiveRegionId: 2,
        ),
        isNull,
      );

      // معرّف لمحافظة غير نشطة (أو عُطّلت بعد حفظها): الفعّالة تعود الأولى.
      expect(
        buildRegionBanner(
          regions: [
            _region(_originRegion),
            _region(_destinationRegion),
            Region.soonFromJson(_soonRegion),
          ],
          effectiveRegionId: 3,
        ),
        isNull,
        reason: 'الموقوفة لا تدخل regions، والفعّالة تعود الأصل',
      );
    });

    test('صفر مناسبات: بلداتها ودعوة أول مناسبة، ولا صفر في السطر', () {
      final data = buildRegionBanner(
        regions: [
          _region(_originRegion),
          _region(_destinationRegion),
          _region(_lodRegion),
        ],
        effectiveRegionId: 5,
      )!;

      expect(
        data.line,
        '3 بلدات في $_lodName — كن أول من يعلن مناسبة فيها',
      );
      expect(_standaloneZero.hasMatch(data.line), isFalse);
    });

    test('صيغ العدد: مفرد ومثنّى وجمع، وما فوق العشرة يعود مفرداً', () {
      final singular = _region(
        Map<String, dynamic>.from(_destinationRegion)
          ..['events_count'] = 1
          ..['towns_count'] = 10,
      );
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), singular],
          effectiveRegionId: 2,
        )!
            .line,
        '1 مناسبة في $_destinationName',
        reason: 'مناسبة واحدة تُقرأ بالمفرد لا بالجمع',
      );

      final dual = _region(
        Map<String, dynamic>.from(_destinationRegion)
          ..['events_count'] = 0
          ..['towns_count'] = 2,
      );
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), dual],
          effectiveRegionId: 2,
        )!
            .line,
        '2 بلدتان في $_destinationName — كن أول من يعلن مناسبة فيها',
      );

      final eleven = _region(
        Map<String, dynamic>.from(_destinationRegion)
          ..['events_count'] = 11
          ..['towns_count'] = 3,
      );
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), eleven],
          effectiveRegionId: 2,
        )!
            .line,
        '11 مناسبة في $_destinationName',
        reason: 'ما فوق العشرة يعود إلى المفرد',
      );

      // صفر في الاثنين معاً: «بلا بلدات» لا «0 بلدة».
      final empty = _region(
        Map<String, dynamic>.from(_destinationRegion)
          ..['events_count'] = 0
          ..['towns_count'] = 0,
      );
      expect(
        buildRegionBanner(
          regions: [_region(_originRegion), empty],
          effectiveRegionId: 2,
        )!
            .line,
        'بلا بلدات في $_destinationName — كن أول من يعلن مناسبة فيها',
      );
    });

    test('الموقوفة تصل في regions_soon وحدها — لا في regions ولا شريطاً', () {
      final catalog = PlacesCatalog(
        towns: const ['رهط'],
        regions: [_region(_originRegion), _region(_destinationRegion)],
        soonRegions: [Region.soonFromJson(_soonRegion)],
        fromServer: true,
      );

      expect(catalog.regions.map((r) => r.name), isNot(contains(_stoppedName)),
          reason: 'regions قائمة أماكن نشر — لا تدخلها موقوفة');
      expect(catalog.soonRegions.single.name, _stoppedName);
      expect(catalog.soonRegions.single.isActive, isFalse);
    });

    test('لا ذكر للورقة القديمة في كود التطبيق — الشريط وحده', () {
      // حارس غياب: بقايا الورقة السفلية (مفتاحها ونصّها) كانت ستُعيد الشاشة
      // إلى ما رفضه صاحب المنتج. الشريط وحده يعرض الخبر اليوم.
      final offenders = <String>[];
      for (final entity in Directory('lib').listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        final source = entity.readAsStringSync();
        for (final needle in const [
          'region_story',
          'regionStorySeenKey',
          'بلّشنا',
        ]) {
          if (source.contains(needle)) {
            offenders.add('${entity.path} — $needle');
          }
        }
      }
      expect(offenders, isEmpty, reason: offenders.join(' | '));
    });
  });

  group('شريط التوسّع في التغذية — يتبع المحافظة', () {
    testWidgets('النقب الأصلية: لا شريط ولا شيء يحجب التغذية', (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(_DiscoveryServer());

      await _boot(tester, _app(services, const HomeShell()));

      // المحافظة الفعّالة هي الأصل — الشريط خبر توسّع لا تحيّة.
      expect(find.byKey(const Key('region_banner')), findsNothing);
      // ولا ورقة سفلية في أي حال: الخبر داخل الصفحة لا في طبقة حواريّة.
      expect(find.byType(BottomSheet), findsNothing);
    });

    testWidgets('اختيار طولكرم: عنوان الشريط وسطر أرقامه', (tester) async {
      SharedPreferences.setMockInitialValues({
        regionOnboardedKey: true,
        RegionStore.storageKey: '2',
      });
      final services = _services(_DiscoveryServer());
      // كما في `main.dart`: المحافظة المحفوظة تُقرأ قبل أول طلب.
      await services.regions.restore();

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.byKey(const Key('region_banner')), findsOneWidget);
      expect(
        find.text('بعد النجاح في $_originName… توسّعنا إلى $_destinationName'),
        findsOneWidget,
      );
      // الرقم كما وصل من الخادم، لا رقم مكتوب في الواجهة.
      expect(find.text('7 مناسبات في $_destinationName'), findsOneWidget);
      // وجهة فيها مناسبات لا تُدعى إلى «أول مناسبة».
      expect(
        _bannerTexts(tester).where((text) => text.contains('كن أول')),
        isEmpty,
      );
      expect(find.byTooltip('إخفاء شريط التوسّع'), findsOneWidget);
      expect(find.byType(BottomSheet), findsNothing);
    });

    testWidgets('اللد والرملة ويافا: ٣ بلدات ودعوة أول مناسبة، بلا صفر',
        (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(
        _DiscoveryServer(
          regions: const [_originRegion, _destinationRegion, _lodRegion],
        ),
      );
      await services.regions.select(5, signedIn: false);

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.byKey(const Key('region_banner')), findsOneWidget);
      expect(
        find.text('بعد النجاح في $_originName… توسّعنا إلى $_lodName'),
        findsOneWidget,
      );
      expect(
        find.text('3 بلدات في $_lodName — كن أول من يعلن مناسبة فيها'),
        findsOneWidget,
      );
      // صفر المناسبات لا يُعرض في أي نصّ من الشريط.
      final texts = _bannerTexts(tester);
      expect(
        texts.where(_standaloneZero.hasMatch),
        isEmpty,
        reason: 'صفرٌ ظاهر في الشريط: ${texts.join(' | ')}',
      );
    });

    testWidgets('× يُخفي ويسجّل لتلك المحافظة وحدها، ويبقى بعد إعادة البناء',
        (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(
        _DiscoveryServer(
          regions: const [_originRegion, _destinationRegion, _lodRegion],
        ),
      );
      await services.regions.select(2, signedIn: false);

      await _boot(tester, _app(services, const HomeShell()));
      expect(find.byKey(const Key('region_banner')), findsOneWidget);

      await tester.tap(find.byKey(const Key('region_banner_close')));
      await tester.pump();
      expect(find.byKey(const Key('region_banner')), findsNothing,
          reason: 'الإخفاء فوري لا ينتظر التخزين');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool(regionBannerKey(2)), isTrue,
          reason: 'المفتاح يُكتب لهذه المحافظة وحدها');
      expect(prefs.getBool(regionBannerKey(5)), isNull,
          reason: 'إخفاء طولكرم لا يخفي شريط اللد');

      // إقلاع تالٍ: المفتاح يمنع شريط طولكرم، والهيكل يعمل.
      await tester.pumpWidget(const SizedBox());
      await _boot(tester, _app(services, const HomeShell()));
      expect(find.byKey(const Key('region_banner')), findsNothing,
          reason: 'المفتاح يُقرأ عند أول بناء فيبقى مخفياً');
      expect(find.byType(NavigationBar), findsOneWidget);

      // وتبديل المحافظة يعرض شريط المحافظة الجديدة رغم إخفاء الأولى.
      await services.regions.select(5, signedIn: false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const Key('region_banner')), findsOneWidget);
      expect(
        find.text('3 بلدات في $_lodName — كن أول من يعلن مناسبة فيها'),
        findsOneWidget,
      );
    });

    testWidgets('صفر مناسبات: سطر البلدات بلا صفر وبلا دعوة مكرّرة', (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(
        _DiscoveryServer(
          regions: [
            _originRegion,
            <String, dynamic>{
              ..._destinationRegion,
              'events_count': 0,
              'towns_count': 2,
            },
          ],
        ),
      );
      await services.regions.select(2, signedIn: false);

      await _boot(tester, _app(services, const HomeShell()));

      expect(
        find.text('2 بلدتان في $_destinationName — كن أول من يعلن مناسبة فيها'),
        findsOneWidget,
        reason: 'صفر المناسبات ليس صفر محتوى',
      );
      final texts = _bannerTexts(tester);
      expect(
        texts.where(_standaloneZero.hasMatch),
        isEmpty,
        reason: 'صفرٌ ظاهر في الشريط: ${texts.join(' | ')}',
      );
    });

    testWidgets('مناسبة معتمدة واحدة: رقم المناسبات لا عدد البلدات',
        (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(
        _DiscoveryServer(
          regions: [
            _originRegion,
            <String, dynamic>{
              ..._destinationRegion,
              'events_count': 1,
              'towns_count': 10,
            },
          ],
        ),
      );
      await services.regions.select(2, signedIn: false);

      await _boot(tester, _app(services, const HomeShell()));

      expect(
        find.text('1 مناسبة في $_destinationName'),
        findsOneWidget,
      );
      // المناسبات أولى من البلدات حين توجد، فلا دعوة إلى «أول مناسبة».
      final texts = _bannerTexts(tester);
      expect(texts.where((text) => text.contains('بلدات')), isEmpty);
      expect(texts.where((text) => text.contains('كن أول')), isEmpty);
    });

    testWidgets('بلدان الخادم غائبة: لا شريط ولا رقم مخترع', (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(_DiscoveryServer(townsFail: true));
      await services.regions.select(2, signedIn: false);

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.byKey(const Key('region_banner')), findsNothing,
          reason: 'الكتالوج الاحتياطي بلا محافظات — فلا شريط');
    });
  });

  group('منتقي المناطق في «حسابي»', () {
    testWidgets('يعلّم النشطة، ويعرض الموقوفة «قريباً» غير قابلة للاختيار',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final services = _services(_DiscoveryServer());
      await services.auth.load();
      await services.places.load();

      await tester.pumpWidget(_app(services, const AccountScreen()));
      await tester.pumpAndSettle();

      // المحافظات النشطة وصلت في `regions`، والموقوفة في `regions_soon`.
      expect(find.text(_originName), findsOneWidget);
      expect(find.text(_destinationName), findsOneWidget);
      expect(find.text(_stoppedName), findsOneWidget);
      expect(find.text('قريباً'), findsOneWidget);
      // `towns_count` يُستهلك في سطر الحالة، بصيغة عربية لا برقم مجرَّد:
      // المحافظة الأولى بلدتان، والثانية بلدة واحدة.
      expect(find.text('مختارة · بلدتان'), findsOneWidget);
      expect(find.text('متاحة · بلدة واحدة'), findsOneWidget);

      final originChip =
          tester.widget<ChoiceChip>(find.byKey(const Key('region_chip_1')));
      final destinationChip =
          tester.widget<ChoiceChip>(find.byKey(const Key('region_chip_2')));
      expect(originChip.selected, isTrue, reason: 'الأولى هي الفعّالة بلا اختيار');
      expect(destinationChip.selected, isFalse);

      // الموقوفة `Chip` لا `ChoiceChip`: لا اختيار لها إطلاقاً.
      expect(find.byKey(const Key('region_chip_3')), findsOneWidget);
      expect(
        tester.widget<Chip>(find.byKey(const Key('region_chip_3'))),
        isA<Chip>(),
      );
      await tester.ensureVisible(find.byKey(const Key('region_chip_3')));
      await tester.tap(find.byKey(const Key('region_chip_3')));
      await tester.pumpAndSettle();
      expect(services.regions.regionId, isNull,
          reason: 'النقر على الموقوفة لا يختار شيئاً');

      // والنشطة الأخرى تُختار فعلاً.
      await tester.ensureVisible(find.byKey(const Key('region_chip_2')));
      await tester.tap(find.byKey(const Key('region_chip_2')));
      await tester.pumpAndSettle();
      expect(services.regions.regionId, 2);
      expect(
        tester.widget<ChoiceChip>(find.byKey(const Key('region_chip_2'))).selected,
        isTrue,
      );
    });
  });
}
