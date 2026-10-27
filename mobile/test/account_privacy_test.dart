import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:negev_events/api/api_client.dart';
import 'package:negev_events/api/negev_api.dart';
import 'package:negev_events/main.dart';
import 'package:negev_events/models/user.dart';
import 'package:negev_events/screens/account_screen.dart';
import 'package:negev_events/state/auth_store.dart';
import 'package:negev_events/state/realtime.dart';
import 'package:negev_events/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «الخصوصية» في «حسابي»: مفتاح إحصاءات الاستخدام، وحذف بياناتها.
///
/// سياسة الخصوصية المنشورة تعد بهما «من صفحة حسابي»، وصفحة الويب تنفّذهما
/// (`analyticsOptOutToggle` و`handleAnalyticsErasure` في `web/app.js`). هذه
/// الاختبارات تحرس ما يخرج إلى الشبكة فعلاً (المسار والجسم والرمز) وما يصل
/// إلى الشاشة بعده — لا شكل الودجت.
class _PrivacyServer {
  _PrivacyServer({this.patchShouldFail = false, this.erasureShouldFail = false});

  /// يردّ 500 برسالة عربية على `PATCH /api/auth/me` — الحالة التي يجب أن
  /// تُبقي المفتاح على حاله وتعرض نصّ الخادم.
  final bool patchShouldFail;

  /// يردّ 500 برسالة عربية على `POST /api/privacy/analytics-erasure`.
  final bool erasureShouldFail;

  /// كل طلب وصل، بالترتيب — عليه تُقرأ الأجسام والترويسات المُرسَلة.
  final requests = <http.Request>[];

  late Map<String, dynamic> user = <String, dynamic>{
    'id': 9,
    'phone_number': '0509999999',
    'full_name': 'نور أبو سالم',
    'clan_town': 'رهط',
    'role': 'user',
    'avatar_url': null,
    'analytics_opt_out': false,
  };

  http.Response _json(Map<String, dynamic> body, [int status = 200]) =>
      http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );

  Future<http.Response> handle(http.Request request) async {
    requests.add(request);
    final path = request.url.path;

    if (path.endsWith('/api/auth/me')) {
      if (request.method == 'PATCH') {
        if (patchShouldFail) {
          return _json(
            {'success': false, 'message': 'تعذّر حفظ إعداد التحليلات، حاول لاحقاً'},
            500,
          );
        }
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        user = {...user, 'analytics_opt_out': body['analytics_opt_out']};
        final optOut = body['analytics_opt_out'] == true;
        return _json({
          'success': true,
          'user': user,
          'message':
              optOut ? 'تم إيقاف التحليلات السلوكية' : 'تم تفعيل التحليلات السلوكية',
        });
      }
      return _json({'success': true, 'user': user});
    }
    if (path.endsWith('/api/privacy/analytics-erasure')) {
      if (erasureShouldFail) {
        return _json(
          {'success': false, 'message': 'تعذّر حذف بيانات التحليلات، حاول لاحقاً'},
          500,
        );
      }
      return _json({
        'success': true,
        'message': 'تم حذف بيانات التحليلات السلوكية الخاصة بك',
      });
    }
    return _json({'success': true});
  }
}

/// جلسة محفوظة يخدمها الخادم الوهمي — `load()` يستدعي `/api/auth/me` فيصل
/// المستخدم إلى الشاشة كما يصل في التشغيل الحقيقي.
Future<({NegevApi api, AuthStore auth})> _signedIn(_PrivacyServer server) async {
  SharedPreferences.setMockInitialValues({
    'negev_token': 'privacy-token',
    'negev_user': jsonEncode(server.user),
  });
  final api = NegevApi(ApiClient(client: MockClient(server.handle)));
  final auth = AuthStore(api);
  await auth.load();
  return (api: api, auth: auth);
}

/// يرفع الشاشة بنافذة أطول من الافتراضية (٦٠٠px): `ListView` تبني صفوفها
/// الظاهرة فقط، فبلا هذا الحجم لا يكون بلوك الخصوصية في الشجرة أصلاً ويفشل
/// `find.byKey` لسبب لا علاقة له بالسلوك المُختبَر.
Future<void> _pumpAccount(
  WidgetTester tester,
  NegevApi api,
  AuthStore auth,
) async {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

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
  await tester.pump();
}

/// قيمة المفتاح المرسومة الآن — لا المحفوظة في الجلسة.
bool _switchValue(WidgetTester tester) => tester
    .widget<SwitchListTile>(find.byKey(const Key('profile_analytics_switch')))
    .value;

void main() {
  test('AppUser: analytics_opt_out يُقرأ من JSON ويُكتب في toJson — وإلا ضاع الرفض عند إعادة تحميل الجلسة', () {
    final optedOut = AppUser.fromJson({
      'id': 3,
      'phone_number': '0500000001',
      'full_name': 'سالم',
      'role': 'user',
      'analytics_opt_out': true,
    });
    expect(optedOut.analyticsOptOut, isTrue, reason: 'true من الخادم يعني رفضاً');

    final saved = optedOut.toJson();
    expect(
      saved['analytics_opt_out'],
      isTrue,
      reason:
          'الجلسة تُحفظ من toJson وتُقرأ بـfromJson عند الإقلاع — غياب المفتاح '
          'هنا يجعل الرفض يعود مفعَّلاً بصمت بعد إعادة التشغيل',
    );
    expect(
      AppUser.fromJson(saved).analyticsOptOut,
      isTrue,
      reason: 'دورة حفظ/قراءة كاملة لا تفقد الإعداد',
    );

    final plain = AppUser.fromJson({
      'id': 4,
      'phone_number': '0500000002',
      'full_name': 'نور',
      'role': 'user',
    });
    expect(
      plain.analyticsOptOut,
      isFalse,
      reason: 'غياب المفتاح في ردّ قديم ليس null — الافتراضي «التحليلات مسجَّلة»',
    );
    expect(plain.toJson()['analytics_opt_out'], isFalse);
  });

  testWidgets(
      'مفتاح «إحصاءات الاستخدام»: كل تبديل يرسل analytics_opt_out وحده في PATCH /api/auth/me ويعكس ردّ الخادم (true ثم false)',
      (tester) async {
    final server = _PrivacyServer();
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    expect(
      _switchValue(tester),
      isFalse,
      reason: 'الحالة الابتدائية تأتي من الخادم (analytics_opt_out: false)',
    );

    await tester.tap(find.byKey(const Key('profile_analytics_switch')));
    await tester.pumpAndSettle();

    var patches = server.requests
        .where((request) =>
            request.method == 'PATCH' && request.url.path.endsWith('/api/auth/me'))
        .toList();
    expect(patches, hasLength(1));
    expect(
      jsonDecode(patches.single.body),
      {'analytics_opt_out': true},
      reason:
          'الحقل وحده بلا full_name/clan_town: إرسال الاسم والبلدة مع المفتاح '
          'يكتب عليهما ما لم يغيّره المستخدم',
    );
    expect(
      patches.single.headers['Authorization'],
      'Bearer privacy-token',
      reason: 'الخادم يعرف صاحب الطلب من الرمز وحده',
    );
    expect(
      session.auth.user!.analyticsOptOut,
      isTrue,
      reason: 'auth.updateUser ينقل المستخدم العائد من الخادم إلى الجلسة',
    );
    expect(_switchValue(tester), isTrue, reason: 'الشاشة تُعاد من auth');

    // وبعد النقر ثانيةً يعود الرفض: الحقل نفسه بقيمة false لا حذفاً له.
    await tester.tap(find.byKey(const Key('profile_analytics_switch')));
    await tester.pumpAndSettle();

    patches = server.requests
        .where((request) =>
            request.method == 'PATCH' && request.url.path.endsWith('/api/auth/me'))
        .toList();
    expect(patches, hasLength(2), reason: 'نداء واحد لكل تبديل — لا إرسال مكرّر');
    expect(jsonDecode(patches.last.body), {'analytics_opt_out': false});
    expect(session.auth.user!.analyticsOptOut, isFalse);
    expect(_switchValue(tester), isFalse);

    final prefs = await SharedPreferences.getInstance();
    final savedUser =
        jsonDecode(prefs.getString('negev_user')!) as Map<String, dynamic>;
    expect(
      savedUser['analytics_opt_out'],
      isFalse,
      reason: 'آخر إعداد محفوظ في الجلسة المحلية يساوي آخر ردّ من الخادم',
    );
  });

  testWidgets(
      'مفتاح «إحصاءات الاستخدام»: فشل الخادم يعرض رسالته ويُبقي المفتاح مطفأً — لا قلب محلي',
      (tester) async {
    final server = _PrivacyServer(patchShouldFail: true);
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_analytics_switch')));
    await tester.pumpAndSettle();

    expect(find.text('تعذّر حفظ إعداد التحليلات، حاول لاحقاً'), findsOneWidget);
    expect(
      _switchValue(tester),
      isFalse,
      reason: 'المفتاح المرسوم يتبع auth وحده، ولم يتغيّر auth — فلا حالة كاذبة',
    );
    expect(session.auth.user!.analyticsOptOut, isFalse);
  });

  testWidgets(
      '«حذف بيانات الإحصائيات»: الإلغاء لا يرسل أي طلب إلى /api/privacy/analytics-erasure',
      (tester) async {
    final server = _PrivacyServer();
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_analytics_erase')));
    await tester.pumpAndSettle();

    expect(
      find.text('سيُحذف فوراً كل ما سُجّل عنك من بيانات التحليلات. متابعة؟'),
      findsOneWidget,
      reason: 'الحذف لا رجعة فيه فلا يُرسَل بلا تأكيد صريح يسمّي ما سيُحذف',
    );

    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();

    expect(
      server.requests.where(
          (request) => request.url.path.endsWith('/api/privacy/analytics-erasure')),
      isEmpty,
      reason: '«إلغاء» تعني بلا نداء — لا طلب ثم تجاهل',
    );
  });

  testWidgets(
      '«حذف بيانات الإحصائيات»: التأكيد يرسل POST موثَّقاً بلا حقول ويعرض رسالة الخادم نفسها',
      (tester) async {
    final server = _PrivacyServer();
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_analytics_erase')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile_analytics_erase_confirm')));
    await tester.pumpAndSettle();

    final erasure = server.requests.singleWhere(
        (request) => request.url.path.endsWith('/api/privacy/analytics-erasure'));
    expect(erasure.method, 'POST');
    expect(
      jsonDecode(erasure.body),
      isEmpty,
      reason: 'لا جسم: الهوية في الرمز وحده، ولا حقل يستطيع تسمية مستخدم آخر',
    );
    expect(erasure.headers['Authorization'], 'Bearer privacy-token');
    expect(
      find.text('تم حذف بيانات التحليلات السلوكية الخاصة بك'),
      findsOneWidget,
      reason: 'الرسالة المعروضة هي نصّ الخادم لا نسخة محلية منه',
    );
  });

  testWidgets(
      '«حذف بيانات الإحصائيات»: فشل الخادم يعرض رسالته خطأً لا نجاحاً',
      (tester) async {
    final server = _PrivacyServer(erasureShouldFail: true);
    final session = await _signedIn(server);
    await _pumpAccount(tester, session.api, session.auth);

    await tester.tap(find.byKey(const Key('profile_analytics_erase')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('profile_analytics_erase_confirm')));
    await tester.pumpAndSettle();

    expect(find.text('تعذّر حذف بيانات التحليلات، حاول لاحقاً'), findsOneWidget);
    expect(
      find.text('تم حذف بيانات التحليلات السلوكية الخاصة بك'),
      findsNothing,
      reason: 'فشل 500 لا يُعرض كنجاح',
    );
  });
}
