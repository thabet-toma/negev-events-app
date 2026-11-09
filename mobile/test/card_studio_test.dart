import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/models/user.dart';
import 'package:negev_events/screens/add_event_screen.dart';
import 'package:negev_events/screens/card_studio_screen.dart';
import 'package:negev_events/screens/edit_event_screen.dart';
import 'package:negev_events/screens/event_details_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// PNG صالح ١×١ (٦٩ بايتاً) — نفس البايتات التي «يرسمها الخادم» في هذه
/// الاختبارات، فيُقارَن ما وصل الشاشة بما أرسله العميل حرفياً.
final Uint8List previewPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4UaEBAAN0AWnL+tDXAAAAAElFTkSuQmCC',
);

/// كتالوج كما يعيده `GET /api/card-templates` — **قالبان من كل نبرة**:
/// فمناسبة العزاء ترى الهادئين وحدهما، ومناسبة الفرح ترى الآخرين وحدهما،
/// وترشيحٌ لا يفعل شيئاً يسقط في الحالتين معاً.
const Map<String, dynamic> kCardStudioCatalog = {
  'templates': [
    {
      'key': 'wedding_night',
      'name': 'ليل الفرح',
      'tone': 'festive',
      'tagline': 'ليلٌ كحلي وإطار ذهبي هادئ',
      'default_font': 'cairo',
      'fonts': ['cairo', 'tajawal'],
      'colors': [
        {'value': '#d9b25f', 'name': 'ذهبي'},
        {'value': '#e8d9b0', 'name': 'عاجي'},
      ],
    },
    {
      'key': 'gold_frame',
      'name': 'إطار ذهبي',
      'tone': 'festive',
      'tagline': 'دعوة كلاسيكية على أرضية عاجية',
      'default_font': 'amiri',
      'fonts': ['amiri', 'cairo'],
      'colors': [
        {'value': '#a87c2b', 'name': 'ذهب داكن'},
        {'value': '#0f5b6b', 'name': 'فيروزي'},
      ],
    },
    {
      'key': 'condolence_quiet',
      'name': 'عزاء هادئ',
      'tone': 'solemn',
      'tagline': 'وقار رمادي بلا زخرفة',
      'default_font': 'noto_naskh',
      'fonts': ['noto_naskh', 'amiri'],
      'colors': [
        {'value': '#3f5548', 'name': 'أخضر داكن'},
      ],
    },
    {
      'key': 'condolence_ash',
      'name': 'عزاء رمادي',
      'tone': 'solemn',
      'tagline': 'خطوط رقيقة ومساحة صامتة',
      'default_font': 'amiri',
      'fonts': ['amiri', 'noto_naskh'],
      'colors': [
        {'value': '#33414d', 'name': 'رمادي أزرق'},
      ],
    },
  ],
  'sizes': [
    {
      'key': 'story',
      'name': 'ستوري',
      'width': 1080,
      'height': 1920,
      'preview': {'width': 480, 'height': 853},
    },
    {
      'key': 'portrait',
      'name': 'عمودي',
      'width': 1080,
      'height': 1350,
      'preview': {'width': 480, 'height': 600},
    },
    {
      'key': 'square',
      'name': 'مربّع',
      'width': 1080,
      'height': 1080,
      'preview': {'width': 480, 'height': 480},
    },
    {
      'key': 'a4',
      'name': 'A4 للطباعة',
      'width': 2480,
      'height': 3508,
      'preview': {'width': 480, 'height': 679},
    },
  ],
  'fonts': [
    {'key': 'cairo', 'name': 'القاهرة'},
    {'key': 'tajawal', 'name': 'تجوال'},
    {'key': 'amiri', 'name': 'أميري'},
    {'key': 'noto_naskh', 'name': 'نسخ'},
  ],
  'preview_max_width': 480,
};

http.Response jsonResponse(Object body, {int status = 200}) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

/// عميل وهمي للستوديو: كل طلب يُسجَّل في [log] ليتحقّق الاختبار من الحقول
/// المُرسَلة فعلاً، ولكل مسار ردّه.
NegevApi studioApi({
  required List<http.Request> log,
  Map<String, dynamic> catalog = kCardStudioCatalog,
  List<Map<String, dynamic>> cards = const [],
  http.Response Function(http.Request request)? onPreview,
  Map<String, dynamic>? saveBody,
  Map<String, dynamic>? primaryBody,
  String deleteMessage = 'حُذفت البطاقة',
}) {
  final client = MockClient((request) async {
    log.add(request);
    final path = request.url.path;

    if (path.endsWith('/api/card-templates')) {
      return jsonResponse({'success': true, ...catalog});
    }
    if (path.endsWith('/cards/preview')) {
      return onPreview?.call(request) ??
          http.Response.bytes(
            previewPng,
            200,
            headers: {'content-type': 'image/png'},
          );
    }
    if (path.endsWith('/cards')) {
      // نفس المسار لقراءة القائمة (GET) وللحفظ (POST) — الطريقة هي الفارق.
      if (request.method == 'GET') {
        return jsonResponse({'success': true, 'cards': cards});
      }
      return jsonResponse(
        saveBody ??
            {
              'success': true,
              'message': 'حُفظت البطاقة وجُعلت البطاقة الأساسية للمناسبة',
              'card': {
                'id': 31,
                'template_key': 'wedding_night',
                'size': 'story',
                'is_primary': true,
                'image_url': 'https://api.example.com/uploads/card31.png',
              },
            },
        status: 201,
      );
    }
    if (RegExp(r'/cards/\d+$').hasMatch(path)) {
      if (request.method == 'DELETE') {
        return jsonResponse({'success': true, 'message': deleteMessage});
      }
      return jsonResponse(
        primaryBody ??
            {
              'success': true,
              'message': 'صارت هذه البطاقة الأساسية للمناسبة',
              'card': {'id': 12, 'is_primary': true},
            },
      );
    }
    return jsonResponse({'success': true, 'cards': cards});
  });
  return NegevApi(ApiClient(client: client));
}

Future<void> pumpStudio(
  WidgetTester tester,
  NegevApi api, {
  String tone = 'festive',
}) async {
  tester.view.physicalSize = const Size(800, 3200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: AppServices(
          api: api,
          auth: AuthStore(api),
          realtime: RealtimeService(),
          child: CardStudioScreen(
            eventId: 7,
            tone: tone,
            eventTitle: 'زفاف محمد',
          ),
        ),
      ),
    ),
  );  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

/// نوع مناسبة بعيد عن الاختبار — الحقول التي تهمّ هنا وحدها: أصحاب المناسبة،
/// البلدة، التاريخ، والملصق (به يظهر رفع الملصق القائم).
Map<String, dynamic> occasionTypeJson({String tone = 'festive'}) => {
      'id': tone == 'solemn' ? 2 : 1,
      'name': tone == 'solemn' ? 'عزا' : 'عرس',
      'icon': tone == 'solemn' ? '🕯️' : '💍',
      'color': '#0369a1',
      'position': 1,
      'is_active': true,
      'creates_collision': false,
      'warns_others': false,
      'premoderate_messages': false,
      'show_congratulations_count': true,
      'show_followers_count': true,
      'show_views_count': true,
      'congratulations_label': tone == 'solemn' ? 'تعازي' : 'تبريكات',
      'default_badge_title': null,
      'default_poster_url': null,
      'legacy_client_supported': true,
      'tone': tone,
      'fields': [
        {
          'field_key': 'honorees',
          'label': 'أصحاب المناسبة',
          'is_visible': true,
          'is_required': true,
          'position': 1,
        },
        {
          'field_key': 'town',
          'label': 'البلدة',
          'is_visible': true,
          'is_required': true,
          'position': 2,
        },
        {
          'field_key': 'event_date',
          'label': 'التاريخ',
          'is_visible': true,
          'is_required': true,
          'position': 3,
        },
        {
          'field_key': 'poster_url',
          'label': 'بوستر الدعوة',
          'is_visible': true,
          'is_required': false,
          'position': 4,
        },
      ],
      'reactions': <String>[],
    };

Map<String, dynamic> townsBody() => {
      'success': true,
      'towns': ['الكل', 'رهط', 'حورة'],
      'town_coordinates': <String, dynamic>{
        'رهط': {'lat': 31.39, 'lng': 34.75},
        'حورة': {'lat': 31.29, 'lng': 34.94},
      },
      'regions': [
        {
          'id': 1,
          'name': 'النقب',
          'latitude': 31.25,
          'longitude': 34.79,
          'map_zoom': 10,
          'position': 1,
          'towns': ['رهط', 'حورة'],
        },
      ],
      'stats': <Map<String, dynamic>>[],
    };

void main() {
  group('ستوديو بطاقة الدعوة (#181)', () {
    testWidgets('يعرض القوالب ثم اختيار قالب ومقاس ومعاينته بصورة الخادم نفسها',
        (tester) async {
      final log = <http.Request>[];
      await pumpStudio(tester, studioApi(log: log));

      // القوالب تصل وتُرسم بأسمائها، والمقاسات بأبعادها من الكتالوج.
      expect(find.text('ليل الفرح'), findsOneWidget);
      expect(find.text('إطار ذهبي'), findsOneWidget);
      expect(find.text('ستوري 1080×1920'), findsOneWidget);
      expect(find.text('A4 للطباعة 2480×3508'), findsOneWidget);

      await tester.tap(find.byKey(const Key('card_studio_template_gold_frame')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('card_studio_size_portrait')));
      await tester.pump();

      await tester.tap(find.byKey(const Key('card_studio_preview_button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // الصورة المعروضة هي بايتات الخادم نفسها، لا رابطاً ولا صورة محلية.
      final image = tester.widget<Image>(
        find.byKey(const Key('card_studio_preview_image')),
      );
      expect((image.image as MemoryImage).bytes, previewPng);

      // والطلب حمل اختيارات الشاشة فعلاً (قالب/مقاس/خطّ القالب/لونه).
      final preview = log.lastWhere((r) => r.url.path.endsWith('/cards/preview'));
      final body = utf8.decode(preview.bodyBytes);
      expect(body, contains('name="template_key"'));
      expect(body, contains('gold_frame'));
      expect(body, contains('name="size"'));
      expect(body, contains('portrait'));
      expect(body, contains('name="font_key"'));
      expect(body, contains('amiri'));
      expect(body, contains('name="color"'));
      expect(body, contains('a87c2b'));
      expect(body, contains('name="photo_source"'));
      expect(body, contains('event'));
    });

    testWidgets('مناسبة العزاء ترى قالبي العزاء الهادئين وحدهما', (tester) async {
      final log = <http.Request>[];
      await pumpStudio(tester, studioApi(log: log), tone: 'solemn');

      expect(find.text('عزاء هادئ'), findsOneWidget);
      expect(find.text('عزاء رمادي'), findsOneWidget);
      expect(find.text('ليل الفرح'), findsNothing);
      expect(find.text('إطار ذهبي'), findsNothing);

      // والنبرة وصلت الخادم في الكتالوج أيضاً: الترشيح في الطرفين معاً.
      final catalog = log.lastWhere((r) => r.url.path.endsWith('/api/card-templates'));
      expect(catalog.url.queryParameters['tone'], 'solemn');
    });

    testWidgets('مناسبة الفرح لا ترى قوالب العزاء إطلاقاً', (tester) async {
      final log = <http.Request>[];
      await pumpStudio(tester, studioApi(log: log));

      expect(find.text('ليل الفرح'), findsOneWidget);
      expect(find.text('إطار ذهبي'), findsOneWidget);
      // الضرر الذي يحرسه الاختبار: دعوة فرح بإطار عزاء.
      expect(find.text('عزاء هادئ'), findsNothing);
      expect(find.text('عزاء رمادي'), findsNothing);
    });

    testWidgets('«حفظ البطاقة» ينادي الحفظ ويعرض رسالة النجاح العربية',
        (tester) async {
      final log = <http.Request>[];
      await pumpStudio(tester, studioApi(log: log));

      await tester.tap(find.byKey(const Key('card_studio_save_button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byKey(const Key('card_studio_result')), findsOneWidget);
      expect(
        find.text('حُفظت البطاقة وجُعلت البطاقة الأساسية للمناسبة'),
        findsOneWidget,
      );

      final save = log.lastWhere(
        (r) => r.method == 'POST' && r.url.path.endsWith('/api/events/7/cards'),
      );
      final body = utf8.decode(save.bodyBytes);
      expect(body, contains('wedding_night'));
      expect(body, contains('story'));
      expect(body, contains('cairo'));
    });

    testWidgets('فشل المعاينة ٤٢٩ يعرض رسالة الخادم العربية بلا انهيار',
        (tester) async {
      final log = <http.Request>[];
      await pumpStudio(
        tester,
        studioApi(
          log: log,
          onPreview: (_) => jsonResponse(
            {
              'success': false,
              'message': 'عدد طلبات المعاينة تجاوز الحد المسموح — حاول بعد قليل',
            },
            status: 429,
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('card_studio_preview_button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // رسالة الخادم نفسها «حاول بعد قليل»، داخل الشاشة، وبلا صورة ولا رمي.
      expect(find.byKey(const Key('card_studio_preview_error')), findsOneWidget);
      expect(
        find.text('عدد طلبات المعاينة تجاوز الحد المسموح — حاول بعد قليل'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('card_studio_preview_image')), findsNothing);
      expect(
        log.where((r) => r.url.path.endsWith('/cards/preview')),
        isNotEmpty,
      );
    });

    testWidgets('رفض ٤٠٠ (قالب غير مناسب للنبرة) يعرض رسالة الخادم العربية',
        (tester) async {
      await pumpStudio(
        tester,
        studioApi(
          log: <http.Request>[],
          onPreview: (_) => jsonResponse(
            {
              'success': false,
              'message': 'هذا القالب مخصّص لمناسبات العزاء ولا يصلح لهذه المناسبة',
            },
            status: 400,
          ),
        ),
      );

      await tester.tap(find.byKey(const Key('card_studio_preview_button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(
        find.text('هذا القالب مخصّص لمناسبات العزاء ولا يصلح لهذه المناسبة'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('card_studio_preview_image')), findsNothing);
    });

    testWidgets('البطاقات المحفوظة: «اجعلها أساسية» و«حذف» يعرضان ردّ الخادم',
        (tester) async {
      final log = <http.Request>[];
      await pumpStudio(
        tester,
        studioApi(
          log: log,
          cards: [
            {
              'id': 11,
              'template_key': 'gold_frame',
              'size': 'story',
              'is_primary': true,
              'image_url': 'https://api.example.com/uploads/card11.png',
            },
            {
              'id': 12,
              'template_key': 'wedding_night',
              'size': 'portrait',
              'is_primary': false,
              'image_url': 'https://api.example.com/uploads/card12.png',
            },
          ],
        ),
      );

      expect(find.byKey(const Key('card_studio_cards_list')), findsOneWidget);
      // الأساسية لا زرّ «اجعلها أساسية» لها، وغيرها له.
      expect(find.byKey(const Key('card_studio_make_primary_11')), findsNothing);
      expect(find.byKey(const Key('card_studio_make_primary_12')), findsOneWidget);

      await tester.tap(find.byKey(const Key('card_studio_make_primary_12')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('صارت هذه البطاقة الأساسية للمناسبة'), findsOneWidget);
      final patch = log.lastWhere(
        (r) => r.method == 'PATCH' && r.url.path.endsWith('/cards/12'),
      );
      expect(patch.method, 'PATCH');

      await tester.tap(find.byKey(const Key('card_studio_delete_11')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('حُذفت البطاقة'), findsOneWidget);
      expect(
        log.where((r) => r.method == 'DELETE' && r.url.path.endsWith('/cards/11')),
        isNotEmpty,
      );
    });
  });

  group('مداخل الستوديو (#181)', () {
    testWidgets('شاشة التعديل: «صمّم بطاقة» يفتح الستوديو بنبرة المناسبة',
        (tester) async {
      final log = <http.Request>[];
      final client = MockClient((request) async {
        log.add(request);
        final path = request.url.path;
        if (path.endsWith('/api/occasion-types')) {
          return jsonResponse({
            'success': true,
            'types': [occasionTypeJson(tone: 'solemn')],
          });
        }
        if (path.endsWith('/api/towns')) return jsonResponse(townsBody());
        if (path.contains('/amendments')) {
          return jsonResponse({'success': true, 'amendments': <Map<String, dynamic>>[]});
        }
        if (path.endsWith('/api/card-templates')) {
          return jsonResponse({'success': true, ...kCardStudioCatalog});
        }
        if (path.endsWith('/cards')) {
          return jsonResponse({'success': true, 'cards': <Map<String, dynamic>>[]});
        }
        return jsonResponse({'success': true});
      });
      final api = NegevApi(ApiClient(client: client));

      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final event = Event.fromJson({
        'id': 7,
        'groom_name': 'سالم أبو فلان',
        'family_clan': 'آل فلان',
        'town': 'رهط',
        'location_name': 'بيت العزاء',
        'event_date': '2026-10-01',
        'status': 'approved',
        'occasion_type': occasionTypeJson(tone: 'solemn'),
        'honorees': [
          {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
        ],
      });

      await tester.pumpWidget(
        // AppServices يلفّ MaterialApp نفسه لا العكس: المسار المدفوع
        // (الستوديو) يُدرج تحت الـNavigator مباشرة، فيبقى حفيداً لـAppServices.
        AppServices(
          api: api,
          auth: AuthStore(api),
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: EditEventScreen(event: event),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      await tester.scrollUntilVisible(
        find.byKey(const Key('edit_event_card_studio_button')),
        260,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const Key('edit_event_card_studio_button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byType(CardStudioScreen), findsOneWidget);
      final catalog = log.lastWhere((r) => r.url.path.endsWith('/api/card-templates'));
      expect(catalog.url.queryParameters['tone'], 'solemn');
      expect(find.text('عزاء هادئ'), findsOneWidget);
      expect(find.text('ليل الفرح'), findsNothing);
    });

    testWidgets('شاشة النشر: «ارفع بطاقتك الجاهزة» يفتح رفع الملصق القائم',
        (tester) async {
      final pickerCalls = <MethodCall>[];
      const pickerChannel = MethodChannel('plugins.flutter.io/image_picker');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(pickerChannel, (call) async {
        pickerCalls.add(call);
        // المستخدم أغلق المنتقي بلا اختيار — يكفي أن النداء وقع.
        return null;
      });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(pickerChannel, null);
      });

      final client = MockClient((request) async {
        final path = request.url.path;
        if (path.endsWith('/api/occasion-types')) {
          return jsonResponse({
            'success': true,
            'types': [occasionTypeJson()],
          });
        }
        if (path.endsWith('/api/towns')) return jsonResponse(townsBody());
        return jsonResponse({'success': true});
      });
      final api = NegevApi(ApiClient(client: client));

      tester.view.physicalSize = const Size(800, 3200);
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
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: const AddEventScreen(),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // `_FilePickTile` صار `ListTile` داخل `Material` شفاف (إصلاح تحذير
      // `DecoratedBox` الذي كان يُبتلع هنا)، فلا استثناء معلّق قبل فحص الباب.
      expect(tester.takeException(), isNull);

      await tester.scrollUntilVisible(
        find.byKey(const Key('add_event_ready_card_button')),
        260,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const Key('add_event_ready_card_button')));
      await tester.pump();

      // الباب لم يفتح مساراً جديداً: نادَى منتقي الصور نفسه الذي يناديه
      // زرّ الملصق القائم (`_pickPoster`) — لا رفع ولا حقل جديد.
      expect(
        pickerCalls.where((call) => call.method == 'pickImage'),
        isNotEmpty,
      );
    });

    testWidgets('شاشة التعديل: «ارفع بطاقتك الجاهزة» يرفع الملصق فعلاً ويحدّث المعروض',
        (tester) async {
      final dir = Directory.systemTemp.createTempSync('ready_card_test');
      addTearDown(() => dir.deleteSync(recursive: true));
      final source = File('${dir.path}${Platform.pathSeparator}ready.png')
        ..writeAsBytesSync(const [1, 2, 3, 4, 5]);

      const pickerChannel = MethodChannel('plugins.flutter.io/image_picker');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(pickerChannel, (call) async {
        return call.method == 'pickImage' ? source.path : null;
      });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(pickerChannel, null);
      });
      // القصّ: المستخدم رجع من الشاشة ⇒ يُرفع الاختيار الأصلي (resolveCroppedPoster).
      const cropChannel = MethodChannel('plugins.hunghd.vn/image_cropper');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(cropChannel, (call) async => null);
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(cropChannel, null);
      });
      // `flutter_map` يطلب مجلد كاش في `runAsync`؛ بلا هذا الوهم يرمي
      // path_provider استثناء قناة أثناء تحميل خريطة شاشة التعديل.
      const pathProviderChannel = MethodChannel('plugins.flutter.io/path_provider');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(pathProviderChannel, (call) async => dir.path);
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(pathProviderChannel, null);
      });

      final log = <http.Request>[];
      final client = MockClient((request) async {
        log.add(request);
        final path = request.url.path;
        if (request.method == 'PATCH' && path.endsWith('/api/events/7')) {
          return jsonResponse({
            'success': true,
            'message': 'تم حفظ التعديل',
            'amendment': 'cosmetic',
            'status': 'approved',
          });
        }
        if (request.method == 'GET' && path.endsWith('/api/events/7')) {
          return jsonResponse({
            'success': true,
            'event': {
              'id': 7,
              'groom_name': 'سالم أبو فلان',
              'town': 'رهط',
              'event_date': '2026-10-01',
              'status': 'approved',
              'poster_url': 'https://api.example.com/uploads/ready.png',
              'occasion_type': occasionTypeJson(tone: 'solemn'),
              'honorees': [
                {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
              ],
            },
          });
        }
        if (path.endsWith('/api/towns')) return jsonResponse(townsBody());
        if (path.contains('/amendments')) {
          return jsonResponse({'success': true, 'amendments': <Map<String, dynamic>>[]});
        }
        return jsonResponse({'success': true});
      });
      final api = NegevApi(ApiClient(client: client));
      final event = Event.fromJson({
        'id': 7,
        'groom_name': 'سالم أبو فلان',
        'family_clan': 'آل فلان',
        'town': 'رهط',
        'location_name': 'بيت العزاء',
        'event_date': '2026-10-01',
        'status': 'approved',
        'occasion_type': occasionTypeJson(tone: 'solemn'),
        'honorees': [
          {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
        ],
      });

      tester.view.physicalSize = const Size(800, 3000);
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
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: EditEventScreen(event: event),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // لا ملصق في الصفّ بعد — حالة القراءة/العرض قبل الرفع.
      expect(find.text('لا يوجد — ارفع بطاقتك الجاهزة من الزرّ أدناه'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.byKey(const Key('edit_event_ready_card_button')),
        260,
        scrollable: find.byType(Scrollable).first,
      );
      // الالتقاط والقصّ وقراءة الملف و PATCH سلسلة real async؛ نطلقها كلها من
      // داخل runAsync كي تعيش في زمن حقيقي (fake clock يجعل قراءة الملف تعلق
      // ويبقى الملف مقفلاً حتى teardown).
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('edit_event_ready_card_button')));
        await Future<void>.delayed(const Duration(milliseconds: 1000));
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final patch = log.lastWhere(
        (r) => r.method == 'PATCH' && r.url.path.endsWith('/api/events/7'),
      );
      final body = latin1.decode(patch.bodyBytes);
      expect(body, contains('name="poster"'));
      expect(body, contains('filename="ready.png"'));
      expect(body, contains('\u0001\u0002\u0003\u0004\u0005'));

      // المعروض تغيّر فعلاً بعد نجاح الرفع.
      await tester.scrollUntilVisible(
        find.text('بطاقة مرفوعة — يمكنك استبدالها من «ارفع بطاقتك الجاهزة»'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.text('بطاقة مرفوعة — يمكنك استبدالها من «ارفع بطاقتك الجاهزة»'),
        findsOneWidget,
      );
    });

    testWidgets('شاشة النشر: «صمّم بطاقة» يظهر بعد النجاح بجانب «ارفع بطاقتك الجاهزة»',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final log = <http.Request>[];
      final client = MockClient((request) async {
        log.add(request);
        final path = request.url.path;
        if (path.endsWith('/api/occasion-types')) {
          return jsonResponse({
            'success': true,
            'types': [occasionTypeJson()],
          });
        }
        if (path.endsWith('/api/towns')) return jsonResponse(townsBody());
        if (request.method == 'POST' && path.endsWith('/api/events')) {
          return jsonResponse({
            'success': true,
            'message': 'تم استلام طلب المناسبة بنجاح!',
            'eventId': 42,
            'status': 'pending',
          }, status: 201);
        }
        if (path.endsWith('/api/card-templates')) {
          return jsonResponse({'success': true, ...kCardStudioCatalog});
        }
        if (path.endsWith('/api/events/42/cards')) {
          return jsonResponse({'success': true, 'cards': <Map<String, dynamic>>[]});
        }
        return jsonResponse({'success': true});
      });
      final api = NegevApi(ApiClient(client: client));
      final auth = AuthStore(api);
      await auth.applySession(
        'test-token',
        const AppUser(
          id: 7,
          phoneNumber: '0500000000',
          fullName: 'مستخدم',
          role: 'user',
        ),
      );

      tester.view.physicalSize = const Size(800, 3200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        AppServices(
          api: api,
          auth: auth,
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: const AddEventScreen(),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // قبل الإنشاء لا معرّف ⇒ لا باب ستوديو ميت.
      expect(find.byKey(const Key('add_event_card_studio_button')), findsNothing);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'أصحاب المناسبة'),
        'محمد',
      );
      await tester.tap(find.text('اختر التاريخ'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.text('OK'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.text('إرسال المناسبة'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // بعد النجاح: اللوحة تحمل البابين، والباب قبلها غير موجود.
      expect(find.byKey(const Key('add_event_published_panel')), findsOneWidget);
      expect(find.byKey(const Key('add_event_card_studio_button')), findsOneWidget);
      expect(
        find.byKey(const Key('add_event_published_ready_card_button')),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('add_event_card_studio_button')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byType(CardStudioScreen), findsOneWidget);
      final catalog = log.lastWhere(
        (r) => r.url.path.endsWith('/api/card-templates'),
      );
      expect(catalog.url.queryParameters['tone'], 'festive');
    });
  });

  group('مدخل صفحة المناسبة (#181)', () {
    Map<String, dynamic> detailsEventJson() => {
          'id': 7,
          'groom_name': 'سالم أبو فلان',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'event_date': '2026-10-01',
          'status': 'approved',
          'occasion_type': occasionTypeJson(tone: 'festive'),
          'honorees': [
            {'name': 'سالم أبو فلان', 'role': null, 'position': 1},
          ],
        };

    Future<void> pumpDetails(WidgetTester tester, {required bool canManage}) async {
      SharedPreferences.setMockInitialValues({});
      final client = MockClient((request) async {
        final path = request.url.path;
        if (path.endsWith('/api/events/7/congratulations')) {
          if (!canManage) {
            return jsonResponse(
              {'success': false, 'message': 'لا تملك صلاحية الوصول إلى هذه المناسبة'},
              status: 403,
            );
          }
          return jsonResponse({'success': true, 'comments': <Map<String, dynamic>>[]});
        }
        if (path.endsWith('/api/events/7')) {
          return jsonResponse({'success': true, 'event': detailsEventJson()});
        }
        return jsonResponse({'success': true});
      });
      final api = NegevApi(ApiClient(client: client));
      final auth = AuthStore(api);
      await auth.applySession(
        'test-token',
        const AppUser(
          id: 7,
          phoneNumber: '0500000000',
          fullName: 'مستخدم',
          role: 'user',
        ),
      );

      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: AppServices(
              api: api,
              auth: auth,
              realtime: RealtimeService(),
              child: const EventDetailsScreen(eventId: 7),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    testWidgets('باب البطاقة يظهر لمن يقبل الخادم طابور مراجعته', (tester) async {
      await pumpDetails(tester, canManage: true);
      expect(find.byKey(const Key('event_card_studio_button')), findsOneWidget);
    });

    testWidgets('باب البطاقة يغيب لمن يردّ عليه الخادم 403', (tester) async {
      await pumpDetails(tester, canManage: false);
      expect(find.byKey(const Key('event_card_studio_button')), findsNothing);
    });
  });

  group('نموذج الكتالوج (#181)', () {
    test('templatesForTone هي بوابة العزاء نفسها في العميل', () {
      final catalog = CardStudioCatalog.fromJson(kCardStudioCatalog);

      expect(catalog.templatesForTone('solemn').map((t) => t.key).toList(),
          ['condolence_quiet', 'condolence_ash']);
      expect(catalog.templatesForTone('festive').map((t) => t.key).toList(),
          ['wedding_night', 'gold_frame']);
      // قيمة غير معروفة تُقرأ فرحاً — كافتراض الخادم نفسه.
      expect(catalog.templatesForTone('anything'), hasLength(2));

      final portrait = catalog.sizeByKey('portrait');
      expect(portrait?.width, 1080);
      expect(portrait?.height, 1350);
      // نسبة المعاينة من الخادم لا محسوبة هنا.
      expect(portrait?.aspectRatio, closeTo(480 / 600, 0.0001));

      final gold = catalog.templateByKey('gold_frame');
      expect(gold?.defaultFont, 'amiri');
      expect(gold?.colors.first.value, '#a87c2b');
      expect(gold?.colors.first.name, 'ذهب داكن');
      expect(catalog.fontByKey('noto_naskh')?.name, 'نسخ');
    });

    test('EventCardItem يقرأ is_primary من ١ و«true»، وغيابها يعني «ليست أساسية»', () {
      expect(
        EventCardItem.fromJson({'id': 3, 'is_primary': 1}).isPrimary,
        isTrue,
      );
      expect(
        EventCardItem.fromJson({'id': 4, 'is_primary': true}).isPrimary,
        isTrue,
      );
      expect(EventCardItem.fromJson({'id': 5, 'is_primary': 0}).isPrimary, isFalse);
      expect(EventCardItem.fromJson({'id': '6'}).isPrimary, isFalse);
    });
  });
}
