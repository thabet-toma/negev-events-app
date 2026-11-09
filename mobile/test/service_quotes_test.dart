import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/screens/service_provider_details_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «اطلب عرض سعر» في الموبايل (تذكرة #188، ADR-0016): الزرّ والنموذج في صفحة
/// المزوّد، وقسما «الطلبات الواردة» و«العروض المستلمة» في «حسابي».
///
/// الخادم وهمي، والتأكيد على **الجسم المُرسَل** وعلى ما يُرسم بعده — لا على
/// وجود العنصر وحده. وفتح رابط واتساب (`launchUrl`) قناة منصّة لا تُخدم في
/// `flutter test`، فقناة `whatsapp` تُختبر في `web-dom.test.js` حيث `window.open`
/// قابل للرصد؛ وهنا تُختبر قناة `app` وحدها.

Map<String, dynamic> quoteProvider() => {
      'id': 701,
      'name': 'مزوّد عروض الأسعار',
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
      'hours': null,
      'is_verified': false,
      'is_featured': false,
      'views_count': 3,
      'favorites_count': 0,
      'is_favorite': false,
      'price': 4500,
      'price_type': 'starting_at',
      'price_estimate_desc': null,
      'attributes': <Map<String, dynamic>>[],
      'towns': ['رهط'],
      'gallery': <Map<String, dynamic>>[],
      'offers': <Map<String, dynamic>>[],
      'products': <Map<String, dynamic>>[],
      'similar': <Map<String, dynamic>>[],
      'is_linked_provider': false,
      'my_review': null,
    };

/// صفّ طلب عرض سعر كما يخدمه `shapeQuoteRow` في الخادم نفسه للطرفين.
Map<String, dynamic> quoteRow({
  required int id,
  String status = 'awaiting_offer',
  String? userName,
  String? note,
  String? offerPrice,
  String? offerNote,
}) =>
    {
      'id': id,
      'status': status,
      'provider_id': 701,
      'provider_name': 'مزوّد عروض الأسعار',
      'provider_category_name': 'صالات أفراح',
      'user_name': userName,
      'event_id': null,
      'event_title': null,
      'event_date': null,
      'wanted_date': '2027-06-01',
      'guests_count': 250,
      'note': note,
      'offer_price': offerPrice,
      'offer_note': offerNote,
      'offered_at': offerPrice == null ? null : '2026-11-11T09:00:00.000Z',
      'decided_at': null,
      'created_at': '2026-11-10T10:00:00.000Z',
    };

/// خادم وهمي لعروض الأسعار: الطلبات الواردة، و«العروض المستلمة» بفلترة الخادم
/// نفسها (`awaiting` = `offered`، و`accepted` = `accepted`). قناة الطلب هنا
/// `app` وحدها: `whatsapp` تفتح رابطاً بـ`launchUrl`، وهي قناة منصّة لا تُخدم
/// في `flutter test` — تُختبر هناك في `web-dom.test.js` حيث `window.open` مرصود.
class _QuoteServer {
  _QuoteServer({
    List<Map<String, dynamic>>? incoming,
    List<Map<String, dynamic>>? myQuotes,
  })  : incoming = [...?incoming],
        myQuotes = [...?myQuotes];

  final List<Map<String, dynamic>> incoming;
  final List<Map<String, dynamic>> myQuotes;

  /// كل طلب وصل، بالترتيب — عليه تُقرأ الأجسام المُرسَلة.
  final List<http.Request> requests = [];

  Map<String, dynamic> get user => {
        'id': 7,
        'phone_number': '0500000000',
        'full_name': 'سالم أبو محمد',
        'role': 'user',
      };

  http.Response _json(Map<String, dynamic> body, [int status = 200]) => http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  Future<http.Response> handle(http.Request request) async {
    requests.add(request);
    final path = request.url.path;
    final method = request.method;

    if (path.endsWith('/api/auth/login')) {
      return _json({'success': true, 'token': 'test-token', 'user': user});
    }
    if (path.endsWith('/api/auth/me')) {
      return _json({'success': true, 'user': user});
    }
    if (path.endsWith('/api/services/my-providers')) {
      return _json({'success': true, 'providers': const []});
    }
    if (path.endsWith('/api/services/providers/701') && method == 'GET') {
      return _json({'success': true, 'provider': quoteProvider()});
    }
    if (path.endsWith('/api/services/providers/701/view')) {
      return _json({'success': true, 'counted': true, 'views_count': 4});
    }
    if (path.endsWith('/api/services/providers/701/reviews')) {
      return _json({
        'success': true,
        'reviews': const [],
        'pagination': {'page': 1, 'limit': 5, 'total': 0, 'totalPages': 0},
      });
    }
    if (path.endsWith('/api/services/providers/701/quote-requests') && method == 'POST') {
      // رسالة الخادم هي ما يُعرض: نصٌّ مختلف عن الافتراضي المحلي كي يسقط التأكيد
      // لو تجاهلت الشاشة `result.message` ورسمت نصّها.
      return _json({
        'success': true,
        'channel': 'app',
        'quote': quoteRow(id: 3102),
        'message': 'وصل طلبك إلى المزوّد — سيصلك عرضه في «العروض المستلمة»',
      }, 201);
    }
    if (path.endsWith('/api/services/incoming-quotes') && method == 'GET') {
      return _json({'success': true, 'quotes': incoming});
    }
    if (path.endsWith('/api/services/incoming-quotes/3101/offer') && method == 'PUT') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      final index = incoming.indexWhere((entry) => entry['id'] == 3101);
      if (index >= 0) {
        incoming[index] = {
          ...incoming[index],
          'status': 'offered',
          'offer_price': body['price'],
          'offer_note': body['note'],
        };
      }
      return _json({'success': true, 'quote': index >= 0 ? incoming[index] : quoteRow(id: 3101)});
    }
    if (path.endsWith('/api/services/my-quotes') && method == 'GET') {
      final tab = request.url.queryParameters['tab'] ?? 'all';
      final quotes = tab == 'awaiting'
          ? myQuotes.where((entry) => entry['status'] == 'offered').toList()
          : tab == 'accepted'
              ? myQuotes.where((entry) => entry['status'] == 'accepted').toList()
              : myQuotes;
      return _json({'success': true, 'quotes': quotes});
    }
    final decide = RegExp(r'/api/services/my-quotes/(\d+)$').firstMatch(path);
    if (decide != null && method == 'PATCH') {
      final id = int.parse(decide.group(1)!);
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      final status = body['action'] == 'accept'
          ? 'accepted'
          : body['action'] == 'decline'
              ? 'declined'
              : 'cancelled';
      final index = myQuotes.indexWhere((entry) => entry['id'] == id);
      if (index >= 0) myQuotes[index] = {...myQuotes[index], 'status': status};
      return _json({'success': true, 'quote': index >= 0 ? myQuotes[index] : quoteRow(id: id)});
    }
    return _json({'success': true});
  }
}

/// إطارات محدّدة بدل `pumpAndSettle`: صور الغلاف والمعرض تُحمَّل بـ
/// `CachedNetworkImage` ولا شبكة في الاختبار، فقد تُبقي دائرة انتظارها الرسم
/// حيّاً بلا استقرار — نفس سبب `settleFrames` في `service_provider_page_test.dart`.
Future<void> _frames(WidgetTester tester, [int count = 6]) async {
  for (var index = 0; index < count; index += 1) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void _sizeScreen(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

Future<void> _pumpProviderPage(
  WidgetTester tester,
  NegevApi api, {
  bool signedIn = true,
}) async {
  _sizeScreen(tester, const Size(900, 2400));

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
  await _frames(tester);
}

/// جلسة محفوظة يخدمها الخادم الوهمي — `load()` يستدعي `/api/auth/me` فيمرّ منه.
Future<({NegevApi api, AuthStore auth})> _signedIn(_QuoteServer server) async {
  SharedPreferences.setMockInitialValues({
    'negev_token': 'test-token',
    'negev_user': jsonEncode(server.user),
  });
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  await auth.load();
  return (api: api, auth: auth);
}

Future<void> _pumpAccount(
  WidgetTester tester,
  NegevApi api,
  AuthStore auth,
) async {
  // «حسابي» قائمة كسولة: القسمان يقعان أسفل البطاقة والوصول السريع، فشاشة
  // الاختبار الافتراضية لا تبنيهما أصلاً. ارتفاع يكفي لوصولهما — لا أكثر.
  _sizeScreen(tester, const Size(1000, 4000));

  await tester.pumpWidget(
    AppServices(
      api: api,
      auth: auth,
      realtime: RealtimeService(),
      child: MaterialApp(
        theme: AppTheme.light(),
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: AccountScreen(),
        ),
      ),
    ),
  );
  await _frames(tester);
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('زرّ «اطلب عرض سعر» يفتح النموذج ويرسل التاريخ والمعازيم والملاحظة',
      (tester) async {
    final server = _QuoteServer();
    final api = NegevApi(ApiClient(client: MockClient(server.handle)));
    await _pumpProviderPage(tester, api);

    await tester.ensureVisible(find.byKey(const Key('provider_quote_btn')));
    await tester.tap(find.byKey(const Key('provider_quote_btn')));
    await _frames(tester, 3);

    expect(
      find.byKey(const Key('quote_request_submit')),
      findsOneWidget,
      reason: 'الزرّ يفتح نموذج الطلب',
    );

    await tester.enterText(find.byKey(const Key('quote_request_date')), '2027-06-15');
    await tester.enterText(find.byKey(const Key('quote_request_guests')), '250');
    await tester.enterText(find.byKey(const Key('quote_request_note')), 'عرس في قاعة كبيرة');
    await tester.tap(find.byKey(const Key('quote_request_submit')));
    await _frames(tester, 8);

    final sent = server.requests
        .where((request) =>
            request.method == 'POST' &&
            request.url.path.endsWith('/api/services/providers/701/quote-requests'))
        .toList();
    expect(sent, hasLength(1), reason: 'الطلب أُرسل مرة واحدة');
    final body = jsonDecode(sent.first.body) as Map<String, dynamic>;
    expect(body['wanted_date'], '2027-06-15', reason: 'التاريخ المرغوب كما كُتب');
    expect(body['guests_count'], 250, reason: 'وعدد المعازيم رقماً لا نصّاً');
    expect(body['note'], 'عرس في قاعة كبيرة', reason: 'والملاحظة');
    expect(
      body.containsKey('event_id'),
      isFalse,
      reason: 'ولا مناسبة تُرسل من صفحة المزوّد في التطبيق',
    );

    expect(
      find.byKey(const Key('quote_request_submit')),
      findsNothing,
      reason: 'النموذج أُغلق بعد نجاح الإرسال',
    );
    expect(
      find.text('وصل طلبك إلى المزوّد — سيصلك عرضه في «العروض المستلمة»'),
      findsOneWidget,
      reason: 'ورسالة الخادم هي ما يُعرض، لا نصّ يبنيه العميل',
    );
  });

  testWidgets('الزائر يُحوَّل إلى بوابة الدخول ولا يُرسل طلباً', (tester) async {
    final server = _QuoteServer();
    final api = NegevApi(ApiClient(client: MockClient(server.handle)));
    await _pumpProviderPage(tester, api, signedIn: false);

    await tester.ensureVisible(find.byKey(const Key('provider_quote_btn')));
    await tester.tap(find.byKey(const Key('provider_quote_btn')));
    await _frames(tester, 3);

    expect(
      find.text('سجّل الدخول لطلب عرض سعر من المزوّد'),
      findsOneWidget,
      reason: 'بوابة الدخول القائمة تفتح بنيّة الطلب',
    );
    expect(
      find.byKey(const Key('quote_request_submit')),
      findsNothing,
      reason: 'ولا يُفتح النموذج قبل الدخول',
    );
    expect(
      server.requests.where((request) => request.url.path.endsWith('/quote-requests')),
      isEmpty,
      reason: 'ولا طلب يُرسل بلا حساب',
    );
  });

  testWidgets('«الطلبات الواردة» تعرض الطلب وتُرسل العرض بـPUT', (tester) async {
    final server = _QuoteServer(
      incoming: [
        quoteRow(id: 3101, userName: 'سالم', note: 'عرس في قاعة كبيرة'),
      ],
    );
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    expect(
      find.byKey(const Key('account_incoming_quotes')),
      findsOneWidget,
      reason: 'القسم مبنيّ لأن للمزوّد طلباً وارداً',
    );
    expect(find.byKey(const Key('incoming_quote_3101')), findsOneWidget, reason: 'بطاقة لكل طلب');
    expect(find.text('سالم'), findsOneWidget, reason: 'باسم الطالب');
    expect(find.text('التاريخ المرغوب: 2027-06-01'), findsOneWidget, reason: 'وبالتاريخ المرغوب');
    expect(find.text('عدد المعازيم: 250'), findsOneWidget, reason: 'وبعدد المعازيم');
    expect(find.text('ملاحظة: عرس في قاعة كبيرة'), findsOneWidget, reason: 'وبالملاحظة');

    await tester.ensureVisible(find.byKey(const Key('quote_offer_price_3101')));
    await tester.enterText(find.byKey(const Key('quote_offer_price_3101')), '1500 شيكل');
    await tester.enterText(find.byKey(const Key('quote_offer_note_3101')), 'شامل الكراسي');
    await tester.ensureVisible(find.byKey(const Key('quote_offer_btn_3101')));
    await tester.tap(find.byKey(const Key('quote_offer_btn_3101')));
    await _frames(tester, 10);

    final sent = server.requests
        .where((request) =>
            request.method == 'PUT' &&
            request.url.path.endsWith('/api/services/incoming-quotes/3101/offer'))
        .toList();
    expect(sent, hasLength(1), reason: 'العرض أُرسل على مسار الطلب');
    final body = jsonDecode(sent.first.body) as Map<String, dynamic>;
    expect(body['price'], '1500 شيكل', reason: 'السعر نصّاً كما كتبه المزوّد');
    expect(body['note'], 'شامل الكراسي', reason: 'والملاحظة');

    expect(
      find.text('عرضك: 1500 شيكل — شامل الكراسي'),
      findsOneWidget,
      reason: 'وسطر العرض يُرسم من ردّ الخادم بعد الإعادة',
    );
    expect(
      find.byKey(const Key('quote_offer_btn_3101')),
      findsNothing,
      reason: 'ونموذج العرض ذهب بعد إرساله',
    );
  });

  testWidgets('«العروض المستلمة» ثلاثة أقسام، والقرار يُرسل الإجراء الذي ضُغط',
      (tester) async {
    final server = _QuoteServer(
      myQuotes: [
        quoteRow(id: 3201, status: 'offered', offerPrice: '1500 شيكل', offerNote: 'شامل الكراسي'),
        quoteRow(id: 3202, status: 'accepted', offerPrice: '900 شيكل'),
        quoteRow(id: 3203),
      ],
    );
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    expect(find.byKey(const Key('account_my_quotes')), findsOneWidget, reason: 'القسم ظاهر بطلباته');
    expect(find.byKey(const Key('my_quotes_tab_all')), findsOneWidget, reason: 'قسم «الكل»');
    expect(find.byKey(const Key('my_quotes_tab_awaiting')), findsOneWidget, reason: 'وقسم «بانتظار ردك»');
    expect(find.byKey(const Key('my_quotes_tab_accepted')), findsOneWidget, reason: 'وقسم «مقبولة»');
    expect(find.text('العرض: 1500 شيكل — شامل الكراسي'), findsOneWidget, reason: 'وسعر العرض ظاهر');

    expect(find.byKey(const Key('my_quote_accept_3201')), findsOneWidget, reason: 'للعرض الواصل قبول');
    expect(find.byKey(const Key('my_quote_decline_3201')), findsOneWidget, reason: 'ورفض');
    expect(find.byKey(const Key('my_quote_cancel_3201')), findsOneWidget, reason: 'وإلغاء');
    expect(
      find.byKey(const Key('my_quote_accept_3203')),
      findsNothing,
      reason: 'وما لم يصله عرض لا قرار فيه',
    );
    expect(
      find.byKey(const Key('my_quote_cancel_3203')),
      findsOneWidget,
      reason: 'لكن يُلغى قبل القرار',
    );
    expect(
      find.byKey(const Key('my_quote_accept_3202')),
      findsNothing,
      reason: 'والمقبول بلا أزرار',
    );

    // «بانتظار ردك» يقرأ من الخادم بـtab=awaiting ويعرض المعروض وحده.
    await tester.ensureVisible(find.byKey(const Key('my_quotes_tab_awaiting')));
    await tester.tap(find.byKey(const Key('my_quotes_tab_awaiting')));
    await _frames(tester, 8);

    expect(
      server.requests.where((request) =>
          request.url.path.endsWith('/api/services/my-quotes') &&
          request.url.queryParameters['tab'] == 'awaiting'),
      isNotEmpty,
      reason: 'التبويب طلب قسمه من الخادم لا فلترةً محلية',
    );
    expect(find.byKey(const Key('my_quote_3201')), findsOneWidget, reason: 'المعروض في القسم');
    expect(find.byKey(const Key('my_quote_3203')), findsNothing, reason: 'والانتظار ليس فيه');
    expect(find.byKey(const Key('my_quote_3202')), findsNothing, reason: 'ولا المقبول');

    await tester.ensureVisible(find.byKey(const Key('my_quote_accept_3201')));
    await tester.tap(find.byKey(const Key('my_quote_accept_3201')));
    await _frames(tester, 10);

    final decided = server.requests
        .where((request) =>
            request.method == 'PATCH' &&
            request.url.path.endsWith('/api/services/my-quotes/3201'))
        .toList();
    expect(decided, hasLength(1), reason: 'القرار أُرسل مرة واحدة');
    expect(
      (jsonDecode(decided.first.body) as Map<String, dynamic>)['action'],
      'accept',
      reason: 'والإجراء هو ما ضُغط — لا إجراء ثابت',
    );
    expect(
      find.text('لا طلبات في هذا القسم.'),
      findsOneWidget,
      reason: 'والقسم المختار فرغ بعد القبول',
    );
    expect(
      find.byKey(const Key('my_quotes_tab_accepted')),
      findsOneWidget,
      reason: 'وتبويباته باقية كي يُنتقل لغيره',
    );
  });
}
