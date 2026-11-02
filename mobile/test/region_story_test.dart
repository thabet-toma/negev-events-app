import 'dart:convert';

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
import 'package:negev_events/widgets/region_story_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// قصة التوسّع ومنتقي المناطق (تذكرة #127).
///
/// **لا اسم محافظة ولا رقم مكتوب في التطبيق:** كل ما يُعرض هنا (اسم المحافظة،
/// وعدد مناسباتها، وحالتها) يأتي من ردّ `GET /api/towns` الوهمي في هذا الملف —
/// وهو المصدر الوحيد لما يعرفه العميل عن المحافظات.
const _originName = 'النقب';
const _destinationName = 'طولكرم';
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

/// إقلاع هيكل التطبيق وانتظار الأوراق — بلا `pumpAndSettle` (تبويبات
/// `IndexedStack` فيها مؤشّر تحميل لا ينتهي)، كما في اختبار ورقة #126.
Future<void> _boot(WidgetTester tester, Widget home) async {
  await tester.pumpWidget(home);
  await tester.pump();
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 300));
  }
}

/// المفتاح المخزَّن — `null` حين لم يُكتب بعد، وهو ما تتحقّق منه الاختبارات
/// («لا عرض = لا مفتاح»)، فالنوع قابل للعدم عمداً.
Future<bool?> _storySeenFlag() async =>
    (await SharedPreferences.getInstance()).getBool(regionStorySeenKey);

/// نصّ كل `Text` داخل ورقة القصة — لا عنصراً واحداً: «لا صفر» حكمٌ على الورقة
/// كلها لا على سطر البلدات وحده.
List<String> _sheetTexts(WidgetTester tester) {
  final texts = tester.widgetList<Text>(
    find.descendant(
      of: find.byKey(const Key('region_story_sheet')),
      matching: find.byType(Text),
    ),
  );
  return [for (final text in texts) text.data ?? ''];
}

/// نصّ بطاقة محافظة واحدة مجموعاً — العدد ثم الصيغة سطران في الواجهة،
/// فالاختبار يقرأهما كما يقرأهما المستخدم: «10 بلدات في طولكرم».
String _statText(WidgetTester tester, String key) => tester
    .widgetList<Text>(
      find.descendant(
        of: find.byKey(Key(key)),
        matching: find.byType(Text),
      ),
    )
    .map((text) => text.data ?? '')
    .join(' ');

/// صفرٌ وحده في نصّ — لا الصفر الذي داخل «10»: العدّ نفسه يجوز أن يحمل الصفر
/// رقماً داخلياً، والممنوع أن يُعرض العدّ صفراً.
final RegExp _standaloneZero = RegExp(r'(^|[^0-9٠-٩])[0٠]([^0-9٠-٩]|$)');

void main() {
  group('قصة التوسّع — من استجابة الخادم وحدها', () {
    test('الأسماء والأرقام تُقرأ من المحافظات الواصلة، لا من ثوابت', () {
      final catalog = PlacesCatalog(
        towns: const ['رهط'],
        regions: [_region(_originRegion), _region(_destinationRegion)],
        fromServer: true,
      );

      final story = buildRegionStory(regions: catalog.regions);

      expect(story, isNotNull);
      expect(story!.title, 'بلّشنا بـ$_originName، وهلق $_destinationName معنا');
      // العدد ووحدته معاً: رقمٌ بلا وحدته لا يقول أيّ الرقمين يُعرض.
      expect(story.originCount, _originRegion['events_count']);
      expect(story.originUnit, RegionStoryUnit.events);
      expect(story.destinationCount, _destinationRegion['events_count']);
      expect(story.destinationUnit, RegionStoryUnit.events);
      expect(story.destinationHasEvents, isTrue);
    });

    test('المحافظة المختارة هي الوجهة، والأولى هي البداية', () {
      final regions = [
        _region(_originRegion),
        _region(_destinationRegion),
      ];

      final story = buildRegionStory(regions: regions, selectedRegionId: 2);
      expect(story!.origin.id, _originRegion['id']);
      expect(story.destination.id, _destinationRegion['id']);

      // اختيار المحافظة الأولى نفسها لا يجعلها وجهةً لنفسها — تُعرض الثانية.
      final sameOrigin = buildRegionStory(regions: regions, selectedRegionId: 1);
      expect(sameOrigin!.destination.id, _destinationRegion['id']);

      // ومختارةٌ فيها مناسبات تسبق محافظةً أخرى فيها مناسبات أيضاً: القصة
      // تحيّةٌ لمن وصل إليها قبل أن تكون قائمةً بالترتيب.
      final earlierEvents = <String, dynamic>{
        ..._originRegion,
        'id': 4,
        'name': 'محافظة رابعة',
        'events_count': 9,
      };
      final preferred = buildRegionStory(
        regions: [
          _region(_originRegion),
          _region(earlierEvents),
          _region(_destinationRegion),
        ],
        selectedRegionId: 2,
      );
      expect(preferred!.destination.id, _destinationRegion['id']);
    });

    test('بلا محافظتين، أو بلا رقم مناسبات: لا قصة — ولا رقم مخترع', () {
      expect(
        buildRegionStory(regions: [_region(_originRegion)]),
        isNull,
        reason: 'محافظة واحدة ليست توسّعاً',
      );

      final withoutCount = Map<String, dynamic>.from(_destinationRegion)
        ..remove('events_count');
      expect(
        buildRegionStory(
          regions: [_region(_originRegion), _region(withoutCount)],
        ),
        isNull,
        reason: 'خادم قديم بلا events_count لا يُعرض له رقم',
      );

      // ولا تُقرأ بلدات بديلاً عن عدّ غائب: صفرُ مناسباتٍ لا يُستنتج من غياب
      // الحقل، فلا يُروى عن المحافظة الأولى رقمٌ لا نعرفه.
      final originWithoutCount = Map<String, dynamic>.from(_originRegion)
        ..remove('events_count');
      expect(
        buildRegionStory(
          regions: [_region(originWithoutCount), _region(_destinationRegion)],
        ),
        isNull,
        reason: 'الأصل بلا events_count لا يُروى عنه رقم',
      );
    });

    test('وجهة بصفر مناسبات ولها بلدات: تُروى ببلداتها لا بصفر', () {
      final newRegion = Map<String, dynamic>.from(_destinationRegion)
        ..['events_count'] = 0
        ..['towns_count'] = 10;

      final story = buildRegionStory(
        regions: [_region(_originRegion), _region(newRegion)],
      );

      expect(story, isNotNull, reason: 'صفر المناسبات ليس صفر محتوى');
      expect(story!.destinationUnit, RegionStoryUnit.towns);
      expect(story.destinationCount, 10);
      expect(story.destinationHasEvents, isFalse);
      // وأصلُ القصة يبقى بصيغته: 12 مناسبة.
      expect(story.originUnit, RegionStoryUnit.events);
      expect(story.originCount, _originRegion['events_count']);
    });

    test('محافظة بلا مناسبات وبلا بلدات: لا قصة', () {
      final empty = Map<String, dynamic>.from(_destinationRegion)
        ..['events_count'] = 0
        ..['towns_count'] = 0;
      expect(
        buildRegionStory(regions: [_region(_originRegion), _region(empty)]),
        isNull,
        reason: 'لا رقم يُعرض: لا مناسبات ولا بلدات',
      );

      // وغياب `towns_count` عند صفر المناسبات مانع كذلك — لا رقم مخترع.
      final withoutTowns = Map<String, dynamic>.from(_destinationRegion)
        ..['events_count'] = 0
        ..remove('towns_count');
      expect(
        buildRegionStory(
          regions: [_region(_originRegion), _region(withoutTowns)],
        ),
        isNull,
        reason: 'صفر مناسبات بلا towns_count ليس بلداتٍ نعرف عددها',
      );
    });

    test('وجهة بمناسبة معتمدة واحدة: عدد المناسبات لا عدد البلدات', () {
      final oneEvent = Map<String, dynamic>.from(_destinationRegion)
        ..['events_count'] = 1
        ..['towns_count'] = 10;

      final story = buildRegionStory(
        regions: [_region(_originRegion), _region(oneEvent)],
      );

      expect(story!.destinationUnit, RegionStoryUnit.events);
      expect(story.destinationCount, 1);
      expect(story.destinationHasEvents, isTrue);
    });

    test('المختارة الصفرية لا تحجب مناسبات غيرها، وتعود وجهةً ببلداتها وحدها', () {
      final emptySelected = Map<String, dynamic>.from(_destinationRegion)
        ..['events_count'] = 0
        ..['towns_count'] = 5;
      final withEvents = <String, dynamic>{
        ..._destinationRegion,
        'id': 4,
        'name': 'محافظة ثالثة',
        'events_count': 3,
      };

      // الأسبقية للمناسبات: مختارةٌ بصفر مناسبات لا تحجب محافظة فيها مناسبات.
      final third = buildRegionStory(
        regions: [
          _region(_originRegion),
          _region(emptySelected),
          _region(withEvents),
        ],
        selectedRegionId: 2,
      );
      expect(third!.destination.id, 4);
      expect(third.destinationUnit, RegionStoryUnit.events);
      expect(third.destinationCount, 3);

      // ولا ثالثة فيها شيء: المختارة الصفرية وجهةٌ ببلداتها لا بصفرها.
      final only = buildRegionStory(
        regions: [_region(_originRegion), _region(emptySelected)],
        selectedRegionId: 2,
      );
      expect(only!.destination.id, 2);
      expect(only.destinationUnit, RegionStoryUnit.towns);
      expect(only.destinationCount, 5);
    });

    test('الموقوفة تصل في regions_soon وحدها — لا في regions ولا وجهةً', () {
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
      // ولا تُمرَّر إلى القصة أصلاً: وجهتها من النشطة وحدها.
      expect(
        buildRegionStory(regions: catalog.activeRegions)!.destination.name,
        _destinationName,
      );
    });
  });

  group('ورقة القصة — مرة واحدة بعد الإقلاع', () {
    testWidgets('تُعرض بالاسمين والرقمين، يُكتب مفتاحها، ثم لا تعود',
        (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(_DiscoveryServer());

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.byKey(const Key('region_story_sheet')), findsOneWidget);
      expect(find.text('بلّشنا بـ$_originName، وهلق $_destinationName معنا'),
          findsOneWidget);
      // الرقمان كما وصلا، لا رقمان مكتوبان في الواجهة.
      expect(find.text('${_originRegion['events_count']}'), findsOneWidget);
      expect(find.text('${_destinationRegion['events_count']}'), findsOneWidget);
      // والوحدة بصيغة عددها: ١٢ مناسبة (١١ فأكثر)، و٧ مناسبات (٣–١٠).
      expect(find.text('مناسبة في $_originName'), findsOneWidget);
      expect(find.text('مناسبات في $_destinationName'), findsOneWidget);
      // ووجهةٌ فيها مناسبات لا تُدعى إلى «أول مناسبة».
      expect(find.text('كون أول من يعلن مناسبة فيها'), findsNothing);
      // **المفتاح لا يُكتب قبل العرض** (تعديل مراجعة): كتابته قبل الورقة
      // تسجّل «عُرضت» ولو سقطت قبل أن تُرسم، فتفوت القصة أبداً.
      expect(await _storySeenFlag(), isNull,
          reason: 'لم تُغلق بعد، فلا شيء يُسجَّل');

      await tester.tap(find.byKey(const Key('region_story_dismiss')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const Key('region_story_sheet')), findsNothing);
      expect(await _storySeenFlag(), isTrue, reason: 'المفتاح يُكتب بعد العرض');

      // إقلاع تالٍ: المفتاح يمنعها، والهيكل يعمل.
      await tester.pumpWidget(const SizedBox());
      await _boot(tester, _app(services, const HomeShell()));
      expect(find.byKey(const Key('region_story_sheet')), findsNothing);
      expect(find.byType(NavigationBar), findsOneWidget);
    });

    testWidgets('وجهة بصفر مناسبات تُعرض ببلداتها، ولا صفر في أي نصّ',
        (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(
        _DiscoveryServer(
          regions: [
            _originRegion,
            <String, dynamic>{
              ..._destinationRegion,
              'events_count': 0,
              'towns_count': 10,
            },
          ],
        ),
      );

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.byKey(const Key('region_story_sheet')), findsOneWidget);
      // العدد بلدات المحافظة، لا مناسباتها الصفرية، والجمع صحيح.
      expect(
        _statText(tester, 'region_story_destination_stat'),
        contains('10 بلدات في $_destinationName'),
      );
      // ودعوةٌ صريحة بدل نفي الخبر.
      expect(find.text('كون أول من يعلن مناسبة فيها'), findsOneWidget);
      // ولا يُعرض «0» في أي نصّ من الورقة — كل `Text` لا سطر البلدات وحده.
      final texts = _sheetTexts(tester);
      expect(
        texts.where(_standaloneZero.hasMatch),
        isEmpty,
        reason: 'صفرٌ ظاهر في الورقة: ${texts.join(' | ')}',
      );
    });

    testWidgets('وجهة بمناسبة معتمدة واحدة تُعرض بمناسباتها لا ببلداتها',
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

      await _boot(tester, _app(services, const HomeShell()));

      expect(
        _statText(tester, 'region_story_destination_stat'),
        contains('1 مناسبة في $_destinationName'),
      );
      // المناسبات أولى من البلدات حين توجد، فلا دعوة إلى «أول مناسبة».
      expect(
        _sheetTexts(tester).where((text) => text.contains('بلدات')),
        isEmpty,
      );
      expect(find.text('كون أول من يعلن مناسبة فيها'), findsNothing);
    });

    testWidgets('قبل وصول المحافظات لا تُعرض ولا يُكتب مفتاحها', (tester) async {
      SharedPreferences.setMockInitialValues({regionOnboardedKey: true});
      final services = _services(_DiscoveryServer(townsFail: true));

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.byKey(const Key('region_story_sheet')), findsNothing);
      expect(await _storySeenFlag(), isNull,
          reason: 'لا عرض = لا مفتاح، فتعود القصة حين تصل المحافظات');
    });

    testWidgets('ورقة #126 أولاً، والقصة في تشغيل لاحق', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final services = _services(_DiscoveryServer());

      await _boot(tester, _app(services, const HomeShell()));

      expect(find.text('من أي منطقة أنت؟'), findsOneWidget,
          reason: 'لم يُسأل المستخدم عن منطقته بعد');
      expect(find.byKey(const Key('region_story_sheet')), findsNothing,
          reason: 'لا تتراكم ورقتان في إقلاع واحد');

      await tester.tap(find.byKey(const Key('region_onboarding_skip')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const Key('region_story_sheet')), findsNothing,
          reason: 'القصة لا تتبع ورقة الاختيار في الجلسة نفسها');
      expect(await _storySeenFlag(), isNull);

      // تشغيل لاحق: صار «سُئل عن منطقته»، فالقصة تظهر.
      await tester.pumpWidget(const SizedBox());
      await _boot(tester, _app(services, const HomeShell()));
      expect(find.byKey(const Key('region_story_sheet')), findsOneWidget);
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
