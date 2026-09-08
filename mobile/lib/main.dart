import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'api/negev_api.dart';
import 'screens/home_shell.dart';
import 'state/auth_store.dart';
import 'state/deep_link_handler.dart';
import 'state/realtime.dart';
import 'state/reminder_scheduler.dart';
import 'state/theme_store.dart';
import 'theme.dart';

/// جذر الملاحة — [DeepLinkHandler] يدفع شاشة التفاصيل من خارج شجرة الودجت
/// (رابط قد يصل قبل أي `BuildContext` مفيد آخر)، فلا بديل عن مفتاح عام هنا.
final navigatorKey = GlobalKey<NavigatorState>();

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

  // لا ننتظر التحميل: الشاشات تعرض حالتها الخاصة عبر AnimatedBuilder.
  auth.load();
  realtime.connect();
  themeStore.load();
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
      child: const NegevApp(),
    ),
  );
}

/// حاوية الخدمات المشتركة — بديل خفيف عن حزمة إدارة حالة كاملة.
///
/// `themeStore` اختياري (يُبنى افتراضياً بوضع `system`) كي لا تحتاج شاشات
/// الاختبار الحالية التي تُنشئ `AppServices` مباشرة أن تعرف عنه.
class AppServices extends InheritedWidget {
  AppServices({
    super.key,
    required this.api,
    required this.auth,
    required this.realtime,
    ThemeStore? themeStore,
    ReminderScheduler? reminders,
    required super.child,
  })  : themeStore = themeStore ?? ThemeStore(),
        reminders = reminders ?? ReminderScheduler(api: api, auth: auth);

  final NegevApi api;
  final AuthStore auth;
  final RealtimeService realtime;
  final ThemeStore themeStore;
  final ReminderScheduler reminders;

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
      reminders != oldWidget.reminders;
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
