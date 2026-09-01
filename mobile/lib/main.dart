import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'api/negev_api.dart';
import 'screens/home_shell.dart';
import 'state/auth_store.dart';
import 'state/realtime.dart';
import 'state/theme_store.dart';
import 'theme.dart';

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

  // لا ننتظر التحميل: الشاشات تعرض حالتها الخاصة عبر AnimatedBuilder.
  auth.load();
  realtime.connect();
  themeStore.load();

  runApp(
    AppServices(
      api: api,
      auth: auth,
      realtime: realtime,
      themeStore: themeStore,
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
    required super.child,
  }) : themeStore = themeStore ?? ThemeStore();

  final NegevApi api;
  final AuthStore auth;
  final RealtimeService realtime;
  final ThemeStore themeStore;

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
      themeStore != oldWidget.themeStore;
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
          title: 'مناسبات النقب',
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
