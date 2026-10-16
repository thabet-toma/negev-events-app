import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'api/negev_api.dart';
import 'screens/account_screen.dart' show SignInScreen;
import 'screens/home_shell.dart';
import 'state/analytics.dart';
import 'state/audio_coordinator.dart';
import 'state/auth_store.dart';
import 'state/deep_link_handler.dart';
import 'state/places_store.dart';
import 'state/realtime.dart';
import 'state/reminder_scheduler.dart';
import 'state/theme_store.dart';
import 'theme.dart';

/// جذر الملاحة — [DeepLinkHandler] يدفع شاشة التفاصيل من خارج شجرة الودجت
/// (رابط قد يصل قبل أي `BuildContext` مفيد آخر)، فلا بديل عن مفتاح عام هنا.
final navigatorKey = GlobalKey<NavigatorState>();

/// رسائل على مستوى التطبيق لا تنتمي لشاشة بعينها — انتهاء الجلسة تحديداً،
/// الذي يكتشفه `ApiClient` بلا أي `BuildContext`.
final scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// التغذية تُسكت صوتها حين تُدفع فوقها شاشة أخرى وتستأنفه عند العودة.
final routeObserver = RouteObserver<ModalRoute<void>>();

/// رخصة خط Cairo (OFL 1.1) — الرخصة توجب مرافقة نصّها للخط أينما وُزّع،
/// و APK بيد الناس توزيعٌ كامل: وجود `OFL.txt` في المستودع يغطي الشيفرة
/// وحدها. تسجيلها هنا يجعلها تظهر في صفحة التراخيص داخل التطبيق نفسه.
void _registerFontLicenses() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(
      const ['Cairo'],
      await rootBundle.loadString('assets/fonts/OFL.txt'),
    );
  });
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  _registerFontLicenses();

  final api = NegevApi(ApiClient());
  final auth = AuthStore(api);
  final realtime = RealtimeService();
  final themeStore = ThemeStore();
  final reminders = ReminderScheduler(api: api, auth: auth);
  final audio = AudioCoordinator();
  final places = PlacesStore(api);

  // خلفية ثابتة كرسائل الخطأ في `showMessage` — لا سياق هنا لقراءة الألوان.
  // زرّ «تسجيل الدخول» في الرسالة نفسها يفتح شاشة الدخول من أي مكان، بدل دفعها
  // تلقائياً: نداء في الخلفية قد يُرفض والمستخدم في منتصف قراءة أو نموذج،
  // وشاشة النشر تدفع شاشة الدخول بنفسها أصلاً حين يُرفض إرسالها.
  auth.onSessionExpired = (message) {
    scaffoldMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message, style: const TextStyle(color: Colors.white)),
          backgroundColor: const Color(0xFF7F1D1D),
          duration: const Duration(seconds: 8),
          action: SnackBarAction(
            label: 'تسجيل الدخول',
            textColor: Colors.white,
            onPressed: () => navigatorKey.currentState?.push(
              MaterialPageRoute<void>(builder: (_) => const SignInScreen()),
            ),
          ),
        ),
      );
  };

  // تسجيل فتح التطبيق بالمعرّف/التوكن العشوائي
  recordAnalyticsEvent(api, 'app_opened');

  // لا ننتظر التحميل: الشاشات تعرض حالتها الخاصة عبر AnimatedBuilder.
  auth.load();
  realtime.connect();
  themeStore.load();
  audio.load();
  audio.bindLifecycle();
  audio.defaultTrack(api);
  places.load();
  // إعادة بناء خطّة المنبّهات كل ما تغيّرت هويّة الحساب المسجَّل — يغطّي فتح
  // التطبيق (أول notifyListeners بعد auth.load())، تسجيل الدخول، وتبديل
  // الحساب معاً بمسار واحد؛ تسجيل الخروج يُلغي كل منبّه بلا استثناء (قصة ١٩
  // والقرار الصريح بشأن تبديل الحساب، دفعة ٧).
  auth.addListener(reminders.handleAuthChange);
  // رابط مناسبة (`/e/<id>`) يفتح شاشة تفاصيلها مباشرة — إقلاعاً بارداً أو
  // استئنافاً دافئاً. لا يُنتظر أيضاً: أول إطار يُبنى بصرف النظر عن وجود رابط.
  DeepLinkHandler(navigatorKey: navigatorKey, api: api).start();

  runApp(
    AppServices(
      api: api,
      auth: auth,
      realtime: realtime,
      themeStore: themeStore,
      reminders: reminders,
      audio: audio,
      places: places,
      child: const NegevApp(),
    ),
  );
}

/// حاوية الخدمات المشتركة — بديل خفيف عن حزمة إدارة حالة كاملة.
///
/// `themeStore` اختياري (يُبنى افتراضياً بوضع `system`) كي لا تحتاج شاشات
/// الاختبار الحالية التي تُنشئ `AppServices` مباشرة أن تعرف عنه — و`audio`
/// كذلك (منسّق بلا مشغّل حتى أول تشغيل فعلي)، و`places` (يبدأ بالبلدات
/// الاحتياطية ويحمّل الخادم عند أول طلب من شاشة).
///
/// وإشارات «قائمتي» الأربع اختيارية بالسبب نفسه: كرت التغذية وشاشة التفاصيل
/// يبدّلان التذكير من خارج الشاشة، و`HomeShell` وحده يعرف فهارس تبويباته —
/// فالإشارات تعيش هنا حيث يلقاها الطرفان، لا في هيكل الشريط ولا في الكرت.
class AppServices extends InheritedWidget {
  AppServices({
    super.key,
    required this.api,
    required this.auth,
    required this.realtime,
    ThemeStore? themeStore,
    ReminderScheduler? reminders,
    AudioCoordinator? audio,
    PlacesStore? places,
    ValueNotifier<int>? tabRequest,
    ValueNotifier<int>? myListRevision,
    ValueNotifier<int>? myListNowCount,
    ValueNotifier<({int eventId, bool saved})?>? savedChange,
    required super.child,
  })  : themeStore = themeStore ?? ThemeStore(),
        reminders = reminders ?? ReminderScheduler(api: api, auth: auth),
        audio = audio ?? AudioCoordinator(),
        places = places ?? PlacesStore(api),
        tabRequest = tabRequest ?? ValueNotifier<int>(_noTabRequest),
        myListRevision = myListRevision ?? ValueNotifier<int>(0),
        myListNowCount = myListNowCount ?? ValueNotifier<int>(0),
        savedChange = savedChange ??
            ValueNotifier<({int eventId, bool saved})?>(null);

  /// فهرس وجهة «المناسبات» في الشريط السفلي.
  static const int feedTabIndex = 0;

  /// فهرس وجهة «قائمتي» — ثانيةً مباشرةً بعد المناسبات.
  static const int myListTabIndex = 1;

  /// «لا طلب تبديل» — القيمة الابتدائية الوحيدة التي لا تُقرأ كطلب.
  static const int _noTabRequest = -1;

  final NegevApi api;
  final AuthStore auth;
  final RealtimeService realtime;
  final ThemeStore themeStore;
  final ReminderScheduler reminders;
  final AudioCoordinator audio;
  final PlacesStore places;

  /// طلب تبديل تبويب من خارج الشريط السفلي — يستهلكه `HomeShell` ويعيده إلى
  /// [_noTabRequest]. قيمة لا استدعاء: الكرت لا يستورد هيكل الشريط لأجل رقم.
  final ValueNotifier<int> tabRequest;

  /// عدّاد يُزاد بعد كل تبديل تذكير ناجح من أيّ شاشة — «قائمتي» تسمعه فتعيد
  /// الجلب عند ظهورها. عدّاد لا قيمة منطقية: التغيير نفسه هو الخبر.
  final ValueNotifier<int> myListRevision;

  /// عدد مناسبات «قائمتي» الجارية اليوم — شارة تبويبها في الشريط السفلي.
  /// تكتبه شاشة «قائمتي» وحدها بعد كل جلب ناجح، وتحصفره عند الخروج.
  final ValueNotifier<int> myListNowCount;

  /// آخر تغيير في حالة الحفظ وقع في أيّ شاشة (لا في التغذية وحدها): إزالة من
  /// «قائمتي»، تراجع عنها، أو تبديل تذكير من كرت التغذية أو صفحة المناسبة.
  ///
  /// تُكتب من كل من يبدّل الحفظ، لا من الإزالة وحدها — قيمتها سجلّ «آخر تغيير»
  /// لا عدّاد، والقيمتان المتساويتان (إزالة، إعادة حفظ، إزالة) لا تُخطران
  /// `ValueNotifier` (السجلّات تُقارَن بالقيمة)، فبقاء الكتابة على الإزالة وحدها
  /// يترك التغذية الحيّة على حالة قديمة. والتغذية تصحّح كرتها بهذه الإشارة
  /// وتتجاهل تغييراً يطابق حالتها الحالية، فلا عمل مزدوجاً ولا نداءً معاكساً
  /// لمن كبس زرّه لاحقاً.
  final ValueNotifier<({int eventId, bool saved})?> savedChange;

  /// يفتح «قائمتي» — زرّ «عرض» في رسالة الإضافة، ومعها إشارة إعادة الجلب كي
  /// لا يرى المستخدم قائمة بلحظة ما قبل الإضافة.
  void openMyList() {
    myListRevision.value++;
    tabRequest.value = myListTabIndex;
  }

  /// يفتح تبويب المناسبات — زرّ «تصفّح المناسبات» في القائمة الفارغة.
  void openFeed() {
    tabRequest.value = feedTabIndex;
  }

  /// يستهلك الطلب بعد أن ينفّذه `HomeShell` — يعيده إلى [_noTabRequest] كي
  /// لا يُعاد تنفيذه مع كل بناء، ولا يعود إليه المستخدم بعد كل تنقّل يدوي.
  void consumeTabRequest() {
    tabRequest.value = _noTabRequest;
  }

  static AppServices of(BuildContext context) {
    final services =
        context.dependOnInheritedWidgetOfExactType<AppServices>();
    assert(services != null, 'AppServices غير موجود في الشجرة');
    return services!;
  }

  @override
  bool updateShouldNotify(AppServices oldWidget) =>
      api != oldWidget.api ||
      auth != oldWidget.auth ||
      realtime != oldWidget.realtime ||
      themeStore != oldWidget.themeStore ||
      reminders != oldWidget.reminders ||
      audio != oldWidget.audio ||
      places != oldWidget.places ||
      tabRequest != oldWidget.tabRequest ||
      myListRevision != oldWidget.myListRevision ||
      myListNowCount != oldWidget.myListNowCount ||
      savedChange != oldWidget.savedChange;
}

class NegevApp extends StatelessWidget {
  const NegevApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeStore = AppServices.of(context).themeStore;

    return AnimatedBuilder(
      animation: themeStore,
      builder: (context, _) {
        return MaterialApp(
          navigatorKey: navigatorKey,
          scaffoldMessengerKey: scaffoldMessengerKey,
          navigatorObservers: [routeObserver],
          title: 'أعراسنا',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: themeStore.mode,
          // الواجهة عربية بالكامل — RTL يأتي من الـlocale.
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const HomeShell(),
        );
      },
    );
  }
}
