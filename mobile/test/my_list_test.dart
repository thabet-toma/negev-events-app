import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/event.dart';
import 'package:negev_events/models/my_list.dart';
import 'package:negev_events/screens/event_details_screen.dart';
import 'package:negev_events/screens/events_screen.dart';
import 'package:negev_events/screens/home_shell.dart';
import 'package:negev_events/screens/my_list_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/event_card.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// خادم وهمي لـ«قائمتي»: يسجّل كل طلب، ويجيب تسجيل الدخول وخطّة المنبّهات
/// أيضاً — الرمز يُرفق عند `auth: true` فقط، فلا بدّ أن يكون الدخول ونداءات
/// القائمة على **نفس** العميل كي يُفحَص فعل الإرفاق.
///
/// و`eventsBody` اختياري: اختبار يجمع «قائمتي» والتغذية في شجرة واحدة يحتاج
/// أن يجيب `/api/events` أيضاً. و`body` غير ثابت كي يبدّل اختبارٌ ما يعيده
/// الخادم بين جلبين (الشارة تُقرأ من جلب تالٍ).
class MyListBackend {
  MyListBackend(this.body, {this.eventsBody});

  /// جسم GET /api/my-reminders — ما عدا DELETE الذي يردّ بحذف ناجح.
  Map<String, dynamic> body;

  /// جسم GET /api/events — التغذية الفارغة افتراضاً.
  final Map<String, dynamic>? eventsBody;

  final List<http.Request> requests = [];

  NegevApi build() {
    final client = MockClient((request) async {
      requests.add(request);
      final path = request.url.path;
      Object response = {'success': true};
      if (path.endsWith('/api/auth/login')) {
        response = {
          'success': true,
          'token': 'test-token',
          'user': {
            'id': 1,
            'phone_number': '0500000000',
            'full_name': 'مستخدم اختبار',
            'role': 'user',
          },
        };
      } else if (path.endsWith('/api/events')) {
        response = eventsBody ??
            {
              'success': true,
              'events': <Map<String, dynamic>>[],
              'pagination': {'page': 1, 'limit': 30, 'total': 0, 'totalPages': 0},
              'announcements': <Map<String, dynamic>>[],
            };
      } else if (path.endsWith('/api/my-reminders')) {
        response = request.method == 'DELETE'
            ? {
                'success': true,
                'removed': 2,
                'message': 'تم حذف المناسبات المنتهية من قائمتك',
              }
            : body;
      } else if (path.endsWith('/api/reminders/schedule')) {
        response = {'success': true, 'schedule': <Map<String, dynamic>>[]};
      }
      return http.Response(
        jsonEncode(response),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    return NegevApi(ApiClient(client: client));
  }

  List<http.Request> requestsTo(String path) =>
      requests.where((request) => request.url.path.endsWith(path)).toList();
}

/// صفّ «قائمتي» كما يصل من الخادم: المناسبة مسطّحة + حقول القائمة.
Map<String, dynamic> entryJson({
  required int id,
  required String bucket,
  String typeName = 'عرس',
  String tone = 'festive',
  String town = 'رهط',
  String eventDate = '2026-10-20',
  String spanStart = '2026-10-20',
  String spanEnd = '2026-10-22',
  int daysUntilStart = 0,
  bool notify = true,
  Map<String, dynamic>? dateChange,
}) {
  return {
    'id': id,
    'title': '',
    'groom_name': 'سالم',
    'family_clan': 'آل فلان',
    'town': town,
    'location_name': 'قاعة السلام',
    'event_date': eventDate,
    'dinner_time': '20:00',
    'poster_url': null,
    'honorees': [
      {'name': 'معاذ النباري', 'position': 0},
    ],
    'occasion_type': {
      'id': tone == 'solemn' ? 2 : 1,
      'name': typeName,
      'icon': tone == 'solemn' ? '🕯️' : '💍',
      'color': tone == 'solemn' ? '#4b5563' : '#0369a1',
      'tone': tone,
      'fields': <Map<String, dynamic>>[],
      'reactions': <String>[],
    },
    'notify': notify,
    'saved_at': '2026-10-01T10:00:00.000Z',
    'span_start': spanStart,
    'span_end': spanEnd,
    'days_until_start': daysUntilStart,
    'bucket': bucket,
    'date_change': dateChange,
  };
}

Map<String, dynamic> listBody(
  List<Map<String, dynamic>> events, {
  int? upcoming,
  int? ended,
  int underReview = 0,
}) {
  final up = upcoming ??
      events.where((e) => MyListEntry.upcomingBuckets.contains(e['bucket'])).length;
  return {
    'success': true,
    'events': events,
    'counts': {
      'all': events.length,
      'upcoming': up,
      'ended': ended ?? events.length - up,
    },
    'under_review_count': underReview,
  };
}

Future<AuthStore> signedIn(NegevApi api) async {
  final auth = AuthStore(api);
  await auth.signIn('0500000000', '1234');
  return auth;
}

Future<AppServices> pumpMyList(
  WidgetTester tester, {
  required NegevApi api,
  required AuthStore auth,
}) async {
  final services = AppServices(
    api: api,
    auth: auth,
    realtime: RealtimeService(),
    child: MaterialApp(
      theme: AppTheme.light(),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: MyListScreen(),
      ),
    ),
  );
  await tester.pumpWidget(services);
  await tester.pumpAndSettle();
  return services;
}

/// خادم وهمي للتغذية وحدها — `/api/events` بالجسم الممرَّر، والباقي فارغ
/// (القصص والأنواع والبلدات)، كي تُقلع `EventsScreen` بلا مسارات ناقصة.
NegevApi feedApi({required Map<String, dynamic> eventsBody}) {
  final client = MockClient((request) async {
    final path = request.url.path;
    Object response = {'success': true};
    if (path.endsWith('/api/events')) {
      response = eventsBody;
    } else if (path.endsWith('/api/stories')) {
      response = {'success': true, 'stories': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/occasion-types')) {
      response = {'success': true, 'types': <Map<String, dynamic>>[]};
    } else if (path.endsWith('/api/towns')) {
      response = {
        'success': true,
        'towns': <String>[],
        'villages': <Map<String, dynamic>>[],
        'regions': <Map<String, dynamic>>[],
        'town_coordinates': <String, dynamic>{},
      };
    }
    return http.Response(
      jsonEncode(response),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  return NegevApi(ApiClient(client: client));
}

/// ستّ صفوف، واحد لكلّ دلو — التجهيزة التي يقف عليها أغلب هذا الملف.
List<Map<String, dynamic>> sixBuckets() => [
      entryJson(id: 1, bucket: 'now', daysUntilStart: 0),
      entryJson(
        id: 2,
        bucket: 'tomorrow',
        typeName: 'عزا',
        tone: 'solemn',
        daysUntilStart: 1,
      ),
      entryJson(id: 3, bucket: 'this_week', daysUntilStart: 4),
      entryJson(id: 4, bucket: 'later', daysUntilStart: 40),
      entryJson(
        id: 5,
        bucket: 'ended_recent',
        eventDate: '2026-10-10',
        spanStart: '2026-10-10',
        spanEnd: '2026-10-10',
      ),
      entryJson(
        id: 6,
        bucket: 'ended',
        eventDate: '2026-08-01',
        spanStart: '2026-08-01',
        spanEnd: '2026-08-01',
      ),
    ];

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('(أ) تحليل جسم الخادم — MyList و MyListEntry', () {
    test('جسم كامل: العدّادات، الدلاء، التواريخ، تغيّر الموعد حاضراً وغائباً', () {
      final list = MyList.fromJson({
        'success': true,
        'events': [
          entryJson(
            id: 7,
            bucket: 'now',
            daysUntilStart: 0,
            spanStart: '2026-10-20',
            spanEnd: '2026-10-22',
            dateChange: {
              'old_value': '2026-09-20',
              'new_value': '2026-10-20',
              'published_at': '2026-10-01T09:00:00.000Z',
            },
          ),
          entryJson(
            id: 8,
            bucket: 'ended',
            notify: false,
            eventDate: '2026-08-01',
            spanStart: '2026-08-01',
            spanEnd: '2026-08-03',
          ),
        ],
        'counts': {'all': 2, 'upcoming': 1, 'ended': 1},
        'under_review_count': 1,
      });

      expect(list.all, 2);
      expect(list.upcoming, 1);
      expect(list.ended, 1);
      expect(list.underReviewCount, 1);
      expect(list.entries, hasLength(2));

      final first = list.entries.first;
      expect(first.event.id, 7);
      // العنوان من النوع وصاحب المناسبة — نفس مساعد كرت التغذية، لا نسخة ثانية.
      expect(first.event.cardHeadline, 'عرس معاذ النباري');
      expect(first.event.town, 'رهط');
      expect(first.bucket, 'now');
      expect(first.notify, isTrue);
      expect(first.spanStart, '2026-10-20');
      expect(first.spanEnd, '2026-10-22');
      expect(first.daysUntilStart, 0);
      expect(first.isUpcoming, isTrue);
      expect(first.isEnded, isFalse);
      expect(list.nowCount, 1);
      expect(first.dateChange!.oldValue, '2026-09-20');
      expect(first.dateChange!.newValue, '2026-10-20');
      expect(first.dateChange!.publishedAt, '2026-10-01T09:00:00.000Z');

      final second = list.entries[1];
      expect(second.dateChange, isNull);
      expect(second.notify, isFalse);
      expect(second.isEnded, isTrue);
      expect(second.isUpcoming, isFalse);
      expect(list.nowCount, 1, reason: 'صفّ «انتهت» لا يُحتسب في شارة اليوم');
    });

    test('جسم ناقص أو مشوّه لا يُسقط التحليل', () {
      final bare = MyList.fromJson({'success': true});
      expect(bare.entries, isEmpty);
      expect(bare.all, 0);
      expect(bare.upcoming, 0);
      expect(bare.ended, 0);
      expect(bare.underReviewCount, 0);
      expect(bare.nowCount, 0);

      final broken = MyList.fromJson({
        'events': 'ليست قائمة',
        'counts': 5,
        'under_review_count': 'كثير',
      });
      expect(broken.entries, isEmpty);
      expect(broken.all, 0);
      expect(broken.underReviewCount, 0);
    });
  });

  group('(ب) شاشة «قائمتي» — الأقسام الستّ والصفّ', () {
    testWidgets(
      'الأقسام بعنوانها وبترتيبها، «انتهت سابقاً» مطويّ، الجرس للقادم وحده، '
      '«سجّل نقوطك» للمنتهي وحده، وبلا شارة عدّاد على النوع الحدادي',
      (tester) async {
        tester.view.physicalSize = const Size(420, 2600);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        final backend = MyListBackend(listBody(sixBuckets()));
        final api = backend.build();
        final auth = await tester.runAsync(() => signedIn(api));
        await pumpMyList(tester, api: api, auth: auth!);

        // مرساة موجِبة قبل أي نفي: الستّة كلّها هناك.
        for (final bucket in [
          'now',
          'tomorrow',
          'this_week',
          'later',
          'ended_recent',
          'ended',
        ]) {
          expect(
            find.byKey(Key('my_list_section_$bucket')),
            findsOneWidget,
            reason: 'قسم $bucket مفقود',
          );
        }

        // الترتيب: موضع كل عنوان بعد الذي قبله.
        double top(String bucket) =>
            tester.getTopLeft(find.byKey(Key('my_list_section_$bucket'))).dy;
        expect(top('now'), lessThan(top('tomorrow')));
        expect(top('tomorrow'), lessThan(top('this_week')));
        expect(top('this_week'), lessThan(top('later')));
        expect(top('later'), lessThan(top('ended_recent')));
        expect(top('ended_recent'), lessThan(top('ended')));

        // «انتهت سابقاً» مطويّ افتراضياً: عنوانه ظاهر وصفّه لا.
        expect(find.byKey(const Key('my_list_row_6')), findsNothing);
        await tester.tap(find.byKey(const Key('my_list_section_ended')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('my_list_row_6')), findsOneWidget);

        // «سجّل نقوطك» على صفوف المنتهي وحدها (صفّان بعد الفتح).
        expect(find.text('سجّل نقوطك'), findsNWidgets(2));
        for (final id in [1, 2, 3, 4]) {
          expect(
            find.descendant(
              of: find.byKey(Key('my_list_row_$id')),
              matching: find.text('سجّل نقوطك'),
            ),
            findsNothing,
          );
        }
        // والجرس على القادم وحده، وكلّها مفعَّلة.
        expect(find.byTooltip('كتم التنبيه'), findsNWidgets(4));
        expect(find.byTooltip('تفعيل التنبيه'), findsNothing);
        for (final id in [5, 6]) {
          expect(
            find.descendant(
              of: find.byKey(Key('my_list_row_$id')),
              matching: find.byTooltip('كتم التنبيه'),
            ),
            findsNothing,
          );
        }

        // النوع الحدادي بلا شارة عدّاد — وصفّ واحد يجري اليوم يحملها فعلاً
        // (مرساة موجِبة، وإلا لنجح النفي على شاشة لم ترسم شيئاً).
        expect(
          find.descendant(
            of: find.byKey(const Key('my_list_row_2')),
            matching: find.text('غداً'),
          ),
          findsNothing,
        );
        expect(
          find.descendant(
            of: find.byKey(const Key('my_list_row_1')),
            matching: find.text('جارية اليوم'),
          ),
          findsOneWidget,
        );
      },
    );
  });

  group('(ج) رقاقات الفلترة والحالات الفارغة', () {
    testWidgets('رقاقة «انتهت» تُبقي صفوف المنتهي وحدها', (tester) async {
      tester.view.physicalSize = const Size(420, 2600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final backend = MyListBackend(listBody(sixBuckets()));
      final api = backend.build();
      final auth = await tester.runAsync(() => signedIn(api));
      await pumpMyList(tester, api: api, auth: auth!);

      expect(find.byKey(const Key('my_list_row_1')), findsOneWidget);

      await tester.tap(find.text('انتهت (2)'));
      await tester.pumpAndSettle();

      for (final id in [1, 2, 3, 4]) {
        expect(
          find.byKey(Key('my_list_row_$id')),
          findsNothing,
          reason: 'صفّ قادم ظهر تحت رقاقة «انتهت»',
        );
      }
      expect(find.byKey(const Key('my_list_row_5')), findsOneWidget);
      // المطويّ يبقى مطويّاً — الرقاقة تصفّي ولا تفتح.
      expect(find.byKey(const Key('my_list_row_6')), findsNothing);
      await tester.tap(find.byKey(const Key('my_list_section_ended')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('my_list_row_6')), findsOneWidget);
    });

    testWidgets('لكل رقاقة نصّها حين لا صفوف', (tester) async {
      final backend = MyListBackend({
        'success': true,
        'events': <Map<String, dynamic>>[],
        'counts': {'all': 0, 'upcoming': 0, 'ended': 0},
        'under_review_count': 0,
      });
      final api = backend.build();
      final auth = await tester.runAsync(() => signedIn(api));
      await pumpMyList(tester, api: api, auth: auth!);

      expect(
        find.text('قائمتك فارغة. اضغط «أضف لقائمتي» على أي مناسبة لتجدها هنا.'),
        findsOneWidget,
      );
      expect(find.text('تصفّح المناسبات'), findsOneWidget);

      await tester.tap(find.text('القادمة (0)'));
      await tester.pumpAndSettle();
      expect(find.text('لا مناسبات قادمة في قائمتك'), findsOneWidget);
      expect(find.text('تصفّح المناسبات'), findsNothing);

      await tester.tap(find.text('انتهت (0)'));
      await tester.pumpAndSettle();
      expect(find.text('لا مناسبات منتهية في قائمتك'), findsOneWidget);
    });
  });

  group('(د) جرس التنبيه', () {
    testWidgets('الكتم يرسل PATCH بقيمة منطقية ومع رمز الدخول', (tester) async {
      final backend = MyListBackend(listBody([
        entryJson(id: 12, bucket: 'later', daysUntilStart: 9, notify: true),
      ]));
      final api = backend.build();
      final auth = await tester.runAsync(() => signedIn(api));
      await pumpMyList(tester, api: api, auth: auth!);

      expect(find.byTooltip('كتم التنبيه'), findsOneWidget);
      backend.requests.clear();

      await tester.tap(find.byTooltip('كتم التنبيه'));
      await tester.pumpAndSettle();

      final patch = backend
          .requestsTo('/api/events/12/remind')
          .where((request) => request.method == 'PATCH')
          .toList();
      expect(patch, hasLength(1), reason: 'لم يُرسل كتم التنبيه');
      expect(jsonDecode(patch.single.body), {'notify': false});
      expect(
        patch.single.headers['Authorization'],
        'Bearer test-token',
        reason: 'الرمز لا يُرفق إلا عند auth: true — وهذا النداء يتطلّبه',
      );

      // الحالة المحلية تتبع الخادم بلا إعادة جلب: الجرس صار «تفعيل التنبيه».
      expect(find.byTooltip('تفعيل التنبيه'), findsOneWidget);
      expect(find.byTooltip('كتم التنبيه'), findsNothing);
    });
  });

  group('(هـ) «نظّف المنتهية»', () {
    testWidgets('إلغاء لا يحذف شيئاً، والتأكيد يرسل DELETE بنطاق ended',
        (tester) async {
      final backend = MyListBackend(listBody([
        entryJson(id: 1, bucket: 'now'),
        entryJson(id: 5, bucket: 'ended_recent', eventDate: '2026-10-10'),
        entryJson(id: 6, bucket: 'ended', eventDate: '2026-08-01'),
      ], ended: 2));
      final api = backend.build();
      final auth = await tester.runAsync(() => signedIn(api));
      await pumpMyList(tester, api: api, auth: auth!);

      backend.requests.clear();
      await tester.tap(find.text('نظّف المنتهية'));
      await tester.pumpAndSettle();
      expect(find.text('حذف كل المناسبات المنتهية من قائمتك؟'), findsOneWidget);

      await tester.tap(find.text('إلغاء'));
      await tester.pumpAndSettle();
      expect(backend.requestsTo('/api/my-reminders'), isEmpty);

      await tester.tap(find.text('نظّف المنتهية'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('حذف'));
      await tester.pumpAndSettle();

      final deletes = backend
          .requestsTo('/api/my-reminders')
          .where((request) => request.method == 'DELETE')
          .toList();
      expect(deletes, hasLength(1));
      expect(deletes.single.url.queryParameters['scope'], 'ended');
    });
  });

  group('(و) الشريط السفلي — «قائمتي» ثانيةً', () {
    testWidgets(
      'ستّ وجهات، «قائمتي» ثانيةً، وزرّ النشر مخفيّ في تبويب النقوط (٣) '
      'وظاهر فيما سواه — على عرض ٣٦٠dp',
      (tester) async {
        tester.view.physicalSize = const Size(360, 800);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        final backend = MyListBackend({'success': true});
        final api = backend.build();
        final auth = AuthStore(api);

        await tester.pumpWidget(
          AppServices(
            api: api,
            auth: auth,
            realtime: RealtimeService(),
            child: MaterialApp(
              theme: AppTheme.light(),
              home: const Directionality(
                textDirection: TextDirection.rtl,
                child: HomeShell(),
              ),
            ),
          ),
        );
        // `pumpAndSettle` لا يصلح هنا: تبويبات `IndexedStack` تُبنى كلّها معاً
        // وفيها مؤشّر تحميل لا ينتهي (نفس نمط اختبار الشريط في widget_test.dart).
        // والمهلة بعد كل نقرة تترك انتقال الزرّ العائم (ظهوراً واختفاءً) يكتمل —
        // الزرّ المخفيّ يبقى في الشجرة زمن انتقاله.
        Future<void> settleTab() async {
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 600));
        }

        await settleTab();

        final navBar = tester.widget<NavigationBar>(find.byType(NavigationBar));
        expect(navBar.destinations, hasLength(6));
        expect(
          (navBar.destinations[1] as NavigationDestination).label,
          'قائمتي',
          reason: '«قائمتي» تأتي ثانيةً مباشرةً بعد «المناسبات»',
        );
        expect(
          (navBar.destinations[0] as NavigationDestination).label,
          'المناسبات',
        );

        // تبويب المناسبات (٠): لا زرّ عائم — نشرُه في رأس التغذية نفسه
        // (`feed_publish_button`)، فلا شيء يطفو فوق الكرت.
        expect(find.byType(FloatingActionButton), findsNothing);

        await tester.tap(find.text('النقوط'));
        await settleTab();
        expect(
          tester
              .widget<NavigationBar>(find.byType(NavigationBar))
              .selectedIndex,
          3,
          reason: 'النقوط صار ثالثاً بعد إضافة «قائمتي»',
        );
        expect(
          find.byType(FloatingActionButton),
          findsNothing,
          reason: 'دفتر النقوط له زرّه الخاصّ — لا زرّ نشر فوقه',
        );

        await tester.tap(find.text('الخريطة'));
        await settleTab();
        expect(find.byType(FloatingActionButton), findsOneWidget);
      },
    );
  });

  group('(ز) السحب للإزالة و«تراجع»', () {
    testWidgets('السحب يحذف التذكير، و«تراجع» يعيده بـ POST', (tester) async {
      final backend = MyListBackend(listBody([
        entryJson(id: 21, bucket: 'later', daysUntilStart: 5),
      ]));
      final api = backend.build();
      final auth = await tester.runAsync(() => signedIn(api));
      final services = await pumpMyList(tester, api: api, auth: auth!);

      expect(
        services.savedChange.value,
        isNull,
        reason: 'لا إشارة قبل أيّ تغيير',
      );

      backend.requests.clear();
      // في RTL «من النهاية إلى البداية» سحبٌ يبدأ من الحافة اليسرى نحو اليمين.
      await tester.drag(
        find.byKey(const Key('my_list_row_21')),
        const Offset(400, 0),
      );
      await tester.pumpAndSettle();

      final deletes = backend
          .requestsTo('/api/events/21/remind')
          .where((request) => request.method == 'DELETE')
          .toList();
      expect(deletes, hasLength(1), reason: 'السحب لا يحذف التذكير');
      expect(
        find.byKey(const Key('my_list_row_21')),
        findsNothing,
        reason: 'الصفّ المسحوب يخرج من القائمة فوراً',
      );
      // الإشارة التي تسمعها التغذية الحيّة خلف التبويب: هذا الصفّ لم يعد محفوظاً.
      expect(services.savedChange.value, (eventId: 21, saved: false));

      // «تراجع» في الرسالة يعيد التذكير فعلاً — لا زرّ بلا فعل.
      await tester.tap(find.text('تراجع'));
      await tester.pumpAndSettle();

      final posts = backend
          .requestsTo('/api/events/21/remind')
          .where((request) => request.method == 'POST')
          .toList();
      expect(posts, hasLength(1), reason: '«تراجع» لا يعيد التذكير');
      expect(
        find.byKey(const Key('my_list_row_21')),
        findsOneWidget,
        reason: 'بعد «تراجع» يعود الصفّ من الخادم',
      );
      expect(services.savedChange.value, (eventId: 21, saved: true));
    });
  });

  group('(ح) «سجّل نقوطك» — تعبئة أوّلية من المناسبة', () {
    testWidgets(
      'الورقة تُفتح باسم صاحب المناسبة وتاريخ نهاية مداها وبلدتها، والحفظ يُرسَل ويُعلَن',
      (tester) async {
        final backend = MyListBackend(listBody([
          entryJson(
            id: 31,
            bucket: 'ended_recent',
            town: 'حورة',
            eventDate: '2026-10-08',
            spanStart: '2026-10-08',
            spanEnd: '2026-10-10',
          ),
        ]));
        final api = backend.build();
        final auth = await tester.runAsync(() => signedIn(api));
        await pumpMyList(tester, api: api, auth: auth!);

        await tester.tap(find.text('سجّل نقوطك'));
        await tester.pumpAndSettle();

        expect(find.text('إضافة قيد نقوط'), findsOneWidget);
        // اسم المستلم: أوّل أصحاب المناسبة (لا العنوان الكامل).
        expect(find.text('معاذ النباري'), findsOneWidget);
        // والتاريخ: نهاية مداها (`span_end`) لا يوم بدايتها.
        expect(find.text('2026-10-10'), findsOneWidget);
        // والبلدة: بلدة المناسبة لأنّها ضمن قائمة المنتقي — وليست الافتراضية
        // (أوّل القائمة «رهط»)، فالتأكيد يسقط لو أُهمِلت التعبئة.
        expect(
          tester
              .widget<DropdownButtonFormField<String>>(
                find.byType(DropdownButtonFormField<String>),
              )
              .initialValue,
          'حورة',
        );

        backend.requests.clear();
        await tester.enterText(find.byType(TextField).at(1), '500');
        await tester.tap(find.text('حفظ القيد'));
        await tester.pumpAndSettle();

        final posts = backend
            .requestsTo('/api/nokoot')
            .where((request) => request.method == 'POST')
            .toList();
        expect(posts, hasLength(1), reason: 'القيد لم يُرسَل');
        expect(jsonDecode(posts.single.body), {
          'recipient_name': 'معاذ النباري',
          'amount': 500.0,
          'event_date': '2026-10-10',
          'clan_town': 'حورة',
        });
        expect(find.text('تم حفظ القيد في دفتر النقوط'), findsOneWidget);
      },
    );
  });

  group('(ط) إشارة الحفظ — الكرت والتغذية', () {
    testWidgets(
      'الكرت يختصر التسمية إلى «احفظ»/«محفوظة»، والمعنى الكامل في التلميح',
      (tester) async {
        Future<void> pumpCard({required bool reminded}) async {
          final event = Event.fromJson({
            'id': 51,
            'title': 'عرس',
            'groom_name': 'سالم',
            'family_clan': 'آل فلان',
            'town': 'رهط',
            'event_date': '2026-11-01',
            'is_reminded': reminded,
            'occasion_type': {
              'id': 1,
              'name': 'عرس',
              'icon': '💍',
              'color': '#0369a1',
              'tone': 'festive',
              'fields': <Map<String, dynamic>>[],
              'reactions': <String>[],
            },
          });
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light(),
              home: Directionality(
                textDirection: TextDirection.rtl,
                child: Scaffold(
                  body: EventCard(
                    event: event,
                    onTap: () {},
                    onRemindTap: () {},
                  ),
                ),
              ),
            ),
          );
          await tester.pump();
        }

        await pumpCard(reminded: false);
        expect(find.text('احفظ'), findsOneWidget);
        expect(find.text('محفوظة'), findsNothing);
        // النصّ الكامل لم يُفقَد — في التلميح وحده.
        expect(find.byTooltip('أضف لقائمتي'), findsOneWidget);

        await pumpCard(reminded: true);
        expect(find.text('محفوظة'), findsOneWidget);
        expect(find.text('احفظ'), findsNothing);
        expect(find.byTooltip('في قائمتي'), findsOneWidget);
      },
    );

    testWidgets(
      'التغذية الحيّة تصحّح كرتها من إشارة «قائمتي» بلا جلب جديد',
      (tester) async {
        final api = feedApi(
          eventsBody: {
            'success': true,
            'events': [
              {
                'id': 77,
                'title': 'عرس تجريبي',
                'groom_name': 'سالم',
                'family_clan': 'آل فلان',
                'town': 'رهط',
                'event_date': '2026-11-01',
                'is_reminded': true,
                'followers_count': 5,
                'occasion_type': {
                  'id': 1,
                  'name': 'عرس',
                  'icon': '💍',
                  'color': '#0369a1',
                  'tone': 'festive',
                  'fields': <Map<String, dynamic>>[],
                  'reactions': <String>[],
                },
              },
            ],
            'pagination': {'page': 1, 'limit': 30, 'total': 1, 'totalPages': 1},
            'announcements': <Map<String, dynamic>>[],
          },
        );
        final services = AppServices(
          api: api,
          auth: AuthStore(api),
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: EventsScreen(),
            ),
          ),
        );
        await tester.pumpWidget(services);
        await tester.pumpAndSettle();

        EventCard card() => tester.widget<EventCard>(find.byType(EventCard));
        expect(card().event.isReminded, isTrue);
        expect(card().event.followersCount, 5);
        expect(find.text('محفوظة'), findsOneWidget);

        // ما تفعله «قائمتي» بعد إزالة ناجحة.
        services.savedChange.value = (eventId: 77, saved: false);
        await tester.pump();

        expect(card().event.isReminded, isFalse);
        expect(
          card().event.followersCount,
          4,
          reason: 'عدّاد المتابعين يتبع نفس حساب _toggleRemind',
        );
        expect(find.text('احفظ'), findsOneWidget);
        expect(find.text('محفوظة'), findsNothing);
      },
    );
  });

  group('(ي) إصلاحات المراجعة', () {
    /// مناسبة واحدة كما تعيدها التغذية و«قائمتي» معاً.
    Map<String, dynamic> sharedEvent({bool reminded = true, int followers = 3}) =>
        {
          'id': 5,
          'title': 'عرس تجريبي',
          'groom_name': 'سالم',
          'family_clan': 'آل فلان',
          'town': 'رهط',
          'location_name': 'قاعة السلام',
          'event_date': '2026-11-01',
          'is_reminded': reminded,
          'followers_count': followers,
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

    testWidgets(
      'M1: إزالة ← إعادة حفظ من التغذية ← إزالة — الكرت يبقى صادقاً في كل خطوة',
      (tester) async {
        final backend = MyListBackend(
          listBody([entryJson(id: 5, bucket: 'now', daysUntilStart: 0)]),
          eventsBody: {
            'success': true,
            'events': [sharedEvent()],
            'pagination': {'page': 1, 'limit': 30, 'total': 1, 'totalPages': 1},
            'announcements': <Map<String, dynamic>>[],
          },
        );
        final api = backend.build();
        final auth = await tester.runAsync(() => signedIn(api));

        // «قائمتي» والتغذية حيّتان معاً كما في `HomeShell` (`IndexedStack`)،
        // بمبدّل تبويب يقوده الاختبار.
        final tab = ValueNotifier<int>(1);
        final services = AppServices(
          api: api,
          auth: auth!,
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: ValueListenableBuilder<int>(
                valueListenable: tab,
                builder: (context, index, _) => IndexedStack(
                  index: index,
                  children: [
                    EventsScreen(isActive: index == 0),
                    MyListScreen(isActive: index == 1),
                  ],
                ),
              ),
            ),
          ),
        );
        await tester.pumpWidget(services);
        await tester.pumpAndSettle();

        EventCard card() => tester.widget<EventCard>(find.byType(EventCard));
        Future<void> showFeed() async {
          tab.value = 0;
          await tester.pumpAndSettle();
        }

        Future<void> showList() async {
          tab.value = 1;
          await tester.pumpAndSettle();
        }

        // (١) إزالة من «قائمتي».
        await tester.drag(
          find.byKey(const Key('my_list_row_5')),
          const Offset(400, 0),
        );
        await tester.pumpAndSettle();
        expect(services.savedChange.value, (eventId: 5, saved: false));

        await showFeed();
        expect(find.text('احفظ'), findsOneWidget);
        expect(card().event.isReminded, isFalse);

        // رسالة الإزالة العائمة («أُزيلت من قائمتي» + «تراجع») تجلس فوق أسفل
        // الشاشة وتحجب زرّ الكرت تحتها زمن عرضها — تُغلق صراحةً بدل انتظار
        // انقضاء مؤقّتها، فالكبس التالي يصل إلى الزرّ.
        tester
            .state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger))
            .removeCurrentSnackBar();
        await tester.pumpAndSettle();

        // (٢) إعادة الحفظ من كرت التغذية — تُكتب الإشارة هنا أيضاً، وإلا صارت
        // الإزالة التالية تكراراً مساوياً لا يُخطر أحداً.
        await tester.tap(find.text('احفظ'));
        await tester.pumpAndSettle();
        expect(services.savedChange.value, (eventId: 5, saved: true));
        expect(find.text('محفوظة'), findsOneWidget);
        expect(card().event.isReminded, isTrue);

        // (٣) الإزالة الثانية: نفس قيمة البداية، لكن السابقة صارت (٥، محفوظة)
        // فالتغيير يُخطر والكرت لا يبقى على «محفوظة».
        await showList();
        expect(find.byKey(const Key('my_list_row_5')), findsOneWidget);
        await tester.drag(
          find.byKey(const Key('my_list_row_5')),
          const Offset(400, 0),
        );
        await tester.pumpAndSettle();
        expect(services.savedChange.value, (eventId: 5, saved: false));

        await showFeed();
        expect(
          find.text('احفظ'),
          findsOneWidget,
          reason: 'كرت التغذية لا يجوز أن يبقى «محفوظة» بعد إزالة ثانية',
        );
        expect(card().event.isReminded, isFalse);
      },
    );

    testWidgets(
      'M2: الإزالة تُنزل شارة «قائمتي»، وجلب صامت خلف تبويب آخر يرفعها من الخادم',
      (tester) async {
        final backend = MyListBackend(
          listBody([entryJson(id: 8, bucket: 'now', daysUntilStart: 0)]),
        );
        final api = backend.build();
        final auth = await tester.runAsync(() => signedIn(api));

        final active = ValueNotifier<bool>(true);
        final services = AppServices(
          api: api,
          auth: auth!,
          realtime: RealtimeService(),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: TextDirection.rtl,
              child: ValueListenableBuilder<bool>(
                valueListenable: active,
                builder: (context, isActive, _) =>
                    MyListScreen(isActive: isActive),
              ),
            ),
          ),
        );
        await tester.pumpWidget(services);
        await tester.pumpAndSettle();
        expect(services.myListNowCount.value, 1);

        // (١) إزالة متفائلة: الشارة تتبع ما رُسم للتوّ، بلا انتظار جلب.
        await tester.drag(
          find.byKey(const Key('my_list_row_8')),
          const Offset(400, 0),
        );
        await tester.pumpAndSettle();
        expect(services.myListNowCount.value, 0);

        // (٢) صار التبويب خلف آخر، والخادم تغيّر في الأثناء: مجرّد الاختفاء
        // لا يجلب شيئاً…
        backend.body = listBody([
          entryJson(id: 9, bucket: 'now', daysUntilStart: 0),
          entryJson(id: 10, bucket: 'now', daysUntilStart: 0),
        ]);
        active.value = false;
        await tester.pump();
        expect(services.myListNowCount.value, 0);

        // …ثم تبديل تذكير من الخارج يجلب صامتاً فتتقدّم البيانات والشارة.
        services.myListRevision.value++;
        await tester.pumpAndSettle();
        expect(services.myListNowCount.value, 2);
        expect(
          find.byType(CircularProgressIndicator),
          findsNothing,
          reason: 'تحديث خلفيّ صامت — بلا مؤشّر تحميل',
        );
      },
    );

    testWidgets(
      'M5: زرّ «أضف لقائمتي» في صفحة المناسبة يغيب على غير المعتمدة',
      (tester) async {
        Future<void> pumpDetails(String? status) async {
          final event = <String, dynamic>{
            'id': 1,
            'title': 'عرس',
            'groom_name': 'سالم',
            'family_clan': 'آل فلان',
            'town': 'رهط',
            'location_name': 'قاعة السلام',
            'event_date': '2026-11-01',
            'is_reminded': false,
            'occasion_type': {
              'id': 1,
              'name': 'عرس',
              'icon': '💍',
              'color': '#0369a1',
              'tone': 'festive',
              'fields': <Map<String, dynamic>>[],
              'reactions': <String>[],
            },
            'status': ?status,
          };
          final client = MockClient(
            (request) async => http.Response(
              jsonEncode({'success': true, 'event': event}),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'},
            ),
          );
          final api = NegevApi(ApiClient(client: client));
          await tester.pumpWidget(
            AppServices(
              api: api,
              auth: AuthStore(api),
              realtime: RealtimeService(),
              child: MaterialApp(
                theme: AppTheme.light(),
                home: Directionality(
                  textDirection: TextDirection.rtl,
                  // مفتاح لكل حالة: الشاشة تقرأ المناسبة مرّة واحدة، فحالة
                  // أخرى تحتاج `State` جديدة لا نفسها.
                  child: EventDetailsScreen(
                    key: ValueKey('details_$status'),
                    eventId: 1,
                  ),
                ),
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 50));
        }

        await pumpDetails('pending');
        expect(
          find.text('تفاصيل المناسبة'),
          findsOneWidget,
          reason: 'مرساة: الصفحة رُسمت فعلاً',
        );
        expect(find.text('أضف لقائمتي'), findsNothing);

        await pumpDetails('approved');
        expect(find.text('أضف لقائمتي'), findsOneWidget);

        // مناسبة عامة بلا حقل حالة تبقى قابلة للحفظ.
        await pumpDetails(null);
        expect(find.text('أضف لقائمتي'), findsOneWidget);
      },
    );
  });
}
