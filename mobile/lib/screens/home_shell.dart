import 'dart:async';

import 'package:flutter/material.dart';

import '../main.dart';
import '../state/update_checker.dart';
import '../widgets/update_dialog.dart';
import 'account_screen.dart';
import 'add_event_screen.dart';
import 'events_screen.dart';
import 'map_screen.dart';
import 'nokoot_screen.dart';
import 'services_screen.dart';

/// الهيكل الرئيسي — خمس وجهات بشريط تنقّل سفلي، وزرّ عائم للنشر في الوسط.
///
/// «إضافة» ليست وجهة بل فعل (wayfinder #21 خطوة ١): خرجت من الشريط إلى زرّ
/// عائم، فأفرغت خانة أخذتها «الخدمات» — الخمسة الأصليون (المناسبات، الخريطة،
/// النقوط، حسابي) بقوا كما هم، ولم يتنحَّ أحد.
///
/// الخانة الخامسة هنا «حسابي»، بينما نظيرتها في الويب «الستيكرات» — قرار
/// موثَّق لا انحراف بين العميلين (spec #21 خطوة ١، القرار ٢).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  StreamSubscription<Map<String, dynamic>>? _broadcastSub;
  String? _banner;
  bool _updateChecked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _broadcastSub ??=
        AppServices.of(context).realtime.onBroadcast.listen((data) {
      if (!mounted) return;
      setState(() => _banner = '${data['message'] ?? data['title'] ?? ''}');
    });

    if (!_updateChecked) {
      _updateChecked = true;
      _checkForUpdate();
    }
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
    const screens = [
      EventsScreen(),
      MapScreen(),
      NokootScreen(),
      AccountScreen(),
      ServicesScreen(),
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
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddEvent,
        tooltip: 'إعلان مناسبة',
        child: const Icon(Icons.add),
      ),
      // في الوسط — RTL لا يعكس الوسط (spec #21 خطوة ١، #4).
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
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
