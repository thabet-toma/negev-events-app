import 'dart:async';

import 'package:flutter/material.dart';

import '../main.dart';
import '../state/update_checker.dart';
import '../widgets/update_dialog.dart';
import 'account_screen.dart';
import 'add_event_screen.dart';
import 'events_screen.dart';
import 'map_screen.dart';
import 'my_list_screen.dart';
import 'nokoot_screen.dart';
import 'services_screen.dart';

/// فهرس وجهة «النقوط» — تُخفي زرّ النشر العائم (شاشتها لها زرّها الخاصّ).
const int _nokootTabIndex = 3;

/// الهيكل الرئيسي — ستّ وجهات بشريط تنقّل سفلي، وزرّ عائم للنشر.
///
/// «إضافة» ليست وجهة بل فعل (wayfinder #21 خطوة ١): خرجت من الشريط إلى زرّ
/// عائم، فأفرغت خانة أخذتها «الخدمات» — الخمسة الأصليون (المناسبات، الخريطة،
/// النقوط، حسابي) بقوا كما هم، ولم يتنحَّ أحد.
///
/// و«قائمتي» (الوجه الظاهر لـ«ذكّرني») جاءت سادسةً وتُعرض **ثانيةً** مباشرةً
/// بعد «المناسبات»: هي نتيجة التصفّح، فمكانها بجانبه لا في آخره.
///
/// الخانة الأخيرة هنا «حسابي»، بينما نظيرتها في الويب «الستيكرات» — قرار
/// موثَّق لا انحراف بين العميلين (spec #21 خطوة ١، القرار ٢).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  StreamSubscription<Map<String, dynamic>>? _broadcastSub;
  ValueNotifier<int>? _tabRequest;
  String? _banner;
  bool _updateChecked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppServices.of(context);
    _broadcastSub ??=
        services.realtime.onBroadcast.listen((data) {
      if (!mounted) return;
      setState(() => _banner = '${data['message'] ?? data['title'] ?? ''}');
    });

    // طلب تبديل تبويب من خارج الشريط (زرّ «عرض» في رسالة الإضافة): قيمة على
    // `AppServices` لا استدعاء مباشر، كي لا يستورد كرت التغذية هذا الملف.
    if (_tabRequest == null) {
      _tabRequest = services.tabRequest;
      _tabRequest!.addListener(_handleTabRequest);
    }

    if (!_updateChecked) {
      _updateChecked = true;
      _checkForUpdate();
    }
  }

  /// يستهلك الطلب ثم يعيده إلى «لا طلب» — قيمة سنتين على نفس الرقم ليست
  /// طلباً جديداً (`ValueNotifier` لا يُخطر على قيمة مساوية).
  void _handleTabRequest() {
    final request = _tabRequest!.value;
    if (request < 0 || !mounted) return;
    setState(() => _index = request);
    AppServices.of(context).consumeTabRequest();
  }

  /// فحص التحديث عند الإقلاع. صامت تماماً عند الفشل — التطبيق يعمل بدونه.
  Future<void> _checkForUpdate() async {
    final checker = UpdateChecker(AppServices.of(context).api);
    final status = await checker.check();
    if (status == null || !mounted) return;

    // ننتظر انتهاء أول إطار حتى لا نفتح حواراً أثناء البناء.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) UpdateDialog.show(context, status);
    });
  }

  @override
  void dispose() {
    _broadcastSub?.cancel();
    _tabRequest?.removeListener(_handleTabRequest);
    super.dispose();
  }

  /// يفتح شاشة النشر — نفس ما كان يفعله تبويب «إضافة» بالضبط، فقط كدفعٍ
  /// جديد بدل تبديل تبويب. حاجز الحساب لم يتغيّر: يبقى داخل `AddEventScreen`
  /// نفسها عند الإرسال، لا هنا (`_submit` في add_event_screen.dart).
  void _openAddEvent() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AddEventScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    // `IndexedStack` يُبقي التغذية حيّة خلف التبويبات الأخرى — تُخبَر صراحةً
    // متى لم تعد المختارة كي تُسكت صوتها.
    final screens = [
      EventsScreen(isActive: _index == AppServices.feedTabIndex),
      MyListScreen(isActive: _index == AppServices.myListTabIndex),
      const MapScreen(),
      const NokootScreen(),
      const AccountScreen(),
      const ServicesScreen(),
    ];

    return Scaffold(
      body: Column(
        children: [
          if (_banner != null && _banner!.isNotEmpty) _BroadcastBanner(
            message: _banner!,
            onDismiss: () => setState(() => _banner = null),
          ),
          Expanded(
            child: IndexedStack(index: _index, children: screens),
          ),
        ],
      ),
      floatingActionButton: _index == _nokootTabIndex
          ? null
          : FloatingActionButton.small(
              onPressed: _openAddEvent,
              tooltip: 'إعلان مناسبة',
              elevation: 4,
              child: const Icon(Icons.add, size: 20),
            ),
      floatingActionButtonLocation: _HomeFabLocation(_index),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.celebration_outlined),
            selectedIcon: Icon(Icons.celebration),
            label: 'المناسبات',
          ),
          NavigationDestination(
            icon: _MyListNavIcon(),
            selectedIcon: _MyListNavIcon(selected: true),
            label: 'قائمتي',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: 'الخريطة',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'النقوط',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'حسابي',
          ),
          NavigationDestination(
            icon: Icon(Icons.handyman_outlined),
            selectedIcon: Icon(Icons.handyman),
            label: 'الخدمات',
          ),
        ],
      ),
    );
  }
}

/// أيقونة «قائمتي» في الشريط مع شارة عدد مناسبات اليوم الجارية — تُخفى حين لا
/// شيء جارٍ أو حين لا حساب، فلا رقم بلا معنى. العدّاد تكتبه شاشة «قائمتي»
/// وحدها (`myListNowCount`) بعد كل جلب ناجح.
class _MyListNavIcon extends StatelessWidget {
  const _MyListNavIcon({this.selected = false});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final services = AppServices.of(context);
    return AnimatedBuilder(
      animation: Listenable.merge([services.auth, services.myListNowCount]),
      builder: (context, _) {
        final count =
            services.auth.isSignedIn ? services.myListNowCount.value : 0;
        return Badge(
          isLabelVisible: count > 0,
          label: Text('$count'),
          child: Icon(selected ? Icons.bookmark : Icons.bookmark_border),
        );
      },
    );
  }
}

/// خلفية ثابتة مستقلة عن الوضع الفاتح/الداكن — تنبيه نظام لا هوية مناسبة،
/// مطابقة لتدرّج `.broadcast-banner` في `web/styles.css`: الويب تعمّد تدرّجاً
/// أغمق (لا `var(--warn)`) لأنّ الرمز يهتزّ تباينه مع نص أبيض بين الوضعين،
/// فنفس القرار هنا (#20 خطوة ١٥).
const _broadcastBannerColor = Color(0xFF78350F);

class _BroadcastBanner extends StatelessWidget {
  const _BroadcastBanner({required this.message, required this.onDismiss});

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _broadcastBannerColor,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
          child: Row(
            children: [
              const Icon(Icons.campaign, color: Colors.white, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 18),
                onPressed: onDismiss,
                tooltip: 'إغلاق',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// موقع زر الإضافة العائم: في الشريط العلوي لتبويب المناسبات حتى لا يغطي الكرت،
/// وفي الزاوية السفلية (endFloat) للشاشات الأخرى.
class _HomeFabLocation extends FloatingActionButtonLocation {
  const _HomeFabLocation(this.index);

  final int index;

  @override
  Offset getOffset(ScaffoldPrelayoutGeometry scaffoldGeometry) {
    if (index == 0) {
      final double statusBar = scaffoldGeometry.minViewPadding.top;
      final double y = statusBar + 8.0;
      final double x = (scaffoldGeometry.scaffoldSize.width -
              scaffoldGeometry.floatingActionButtonSize.width) /
          2;
      return Offset(x, y);
    }
    return FloatingActionButtonLocation.endFloat.getOffset(scaffoldGeometry);
  }
}

