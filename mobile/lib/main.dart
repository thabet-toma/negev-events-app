import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'api/negev_api.dart';
import 'screens/home_shell.dart';
import 'state/auth_store.dart';
import 'state/realtime.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final api = NegevApi(ApiClient());
  final auth = AuthStore(api);
  final realtime = RealtimeService();

  // لا ننتظر التحميل: الشاشات تعرض حالتها الخاصة عبر AnimatedBuilder.
  auth.load();
  realtime.connect();

  runApp(
    AppServices(
      api: api,
      auth: auth,
      realtime: realtime,
      child: const NegevApp(),
    ),
  );
}

/// حاوية الخدمات المشتركة — بديل خفيف عن حزمة إدارة حالة كاملة.
class AppServices extends InheritedWidget {
  const AppServices({
    super.key,
    required this.api,
    required this.auth,
    required this.realtime,
    required super.child,
  });

  final NegevApi api;
  final AuthStore auth;
  final RealtimeService realtime;

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
      realtime != oldWidget.realtime;
}

class NegevApp extends StatelessWidget {
  const NegevApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'مناسبات النقب',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.build(),
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
  }
}
