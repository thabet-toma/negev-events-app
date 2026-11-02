import 'dart:async';

import 'package:flutter/material.dart';

import '../main.dart';
import '../state/region_onboarding.dart';
import '../state/update_checker.dart';
import '../theme.dart';
import '../widgets/region_onboarding_sheet.dart';
import '../widgets/update_dialog.dart';
import 'add_event_screen.dart';
import 'events_screen.dart';
import 'services_hub_screen.dart';
import 'services_screen.dart';

/// الهيكل الرئيسي — ثلاث وجهات بشريط تنقّل سفلي: المناسبات، خدماتنا، خدمات
/// الأعراس (بهذا الترتيب في RTL من اليمين).
///
/// «حسابي» ليست وجهةً في الشريط: تُدفع شاشةً من زرّها في الترويسة
/// (`AuthActionButton` ← `AccountScreen`)، فلا نسخة ثانية لها في الشريط.
///
/// الخريطة و«قائمتي» والنقوط خرجت من الشريط حين ضاق بستّ وجهات، وشاشاتها باقية
/// كما هي ويُوصل إليها من بطاقات الوصل السريع داخل شاشة «حسابي» — لم تُحذف ولم
/// تُنسخ.
///
/// وزرّ النشر العائم (FAB) لم تبقَ له حاجة: فوق الشريط كبستان ثابتان —
/// «أضف عرسك» (بارز) و«أضف خدمتك» (أهدأ) — يظهران في كل الوجهات، ونشر التغذية
/// يبقى في رأسها أيضاً (`feed_publish_button` في `EventsScreen`).
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

  /// ورقة أول تشغيل — محاولة واحدة لكل تشغيل تطبيق، لا مع كل إعادة بناء.
  bool _onboardingAttempted = false;

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

    if (!_onboardingAttempted) {
      _onboardingAttempted = true;
      unawaited(_maybeShowOnboardingSheet());
    }
  }

  /// ورقة أول تشغيل (#126) — السؤال الوحيد عند الإقلاع منذ #127: صارت قصة
  /// التوسّع شريطاً داخل التغذية (`RegionBanner`) يتبع المحافظة، فلا تُعرض في
  /// الإقلاع ولا تُسجَّل رؤيتها.
  ///
  /// ولا تُعرض الورقة إن كان على الشاشة غيرها (شاشة مدفوعة أو ورقة مفتوحة) —
  /// وهذا يشمل رابطاً عميقاً فتح شاشته قبلنا — ولا يُسجَّل شيء حينها، فتعود
  /// في الإقلاع التالي بدل أن تفوت. و«محاولة واحدة» تعني مرةً واحدة لهذا
  /// التشغيل: `_onboardingAttempted` يمنع تكرار المحاولة مع كل إعادة بناء.
  Future<void> _maybeShowOnboardingSheet() async {
    // ننتظر أول إطار كي لا تُفتح ورقة أثناء البناء، وأول ما يصل إليه المستخدم
    // شاشته لا حوار.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted || !_isShellOnTop) return;

    if (await isRegionOnboarded()) return;
    if (!mounted || !_isShellOnTop) return;
    await showRegionOnboardingSheet(context);
  }

  /// الهيكل وحده على الشاشة: لا شاشة مدفوعة فوقه ولا ورقة أخرى.
  bool get _isShellOnTop {
    final route = ModalRoute.of(context);
    return (route == null || route.isCurrent) && !Navigator.of(context).canPop();
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
  /// يخدم كبسة «أضف عرسك» فوق الشريط؛ والتغذية تدفع الشاشة نفسها من زرّ
  /// «إعلان مناسبة» في رأسها (`_chromePublishButton`).
  void _openAddEvent() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AddEventScreen()),
    );
  }

  /// كبسة «أضف خدمتك» — الورقة نفسها التي تفتحها «خدمات الأعراس»، بحارس
  /// الحساب وفئات الخدمة داخلها (`openSubmitServiceSheet`)، لا نموذج ثانٍ.
  Future<void> _openAddService() => openSubmitServiceSheet(context);

  @override
  Widget build(BuildContext context) {
    final services = AppServices.of(context);

    // تبديل المحافظة (تذكرة #125) يُعيد بناء الأسطح التي تحتفظ ببياناتها في
    // الذاكرة: التغذية — وفيها شريط الستوريات — وشاشة «خدمات الأعراس»، بمفتاح
    // هو **قيمة `X-Region` المُرسَلة فعلاً** لا الاختيار الصريح وحده: محافظة
    // الحساب تُرسَل ترويسةً أيضاً، ومسحُ محفوظٍ لم يعد موجوداً يغيّرها بلا
    // اختيار جديد. حياةٌ جديدة تعني جلباً جديداً بالترويسة الجديدة، فلا تبقى
    // تغذية المحافظة السابقة على الشاشة.
    //
    // الألبومات شاشات مدفوعة فوق التغذية، ولا تبقى حيّة وقت التبديل (منتقيه
    // في «حسابي»)، فتُجلب بمحافظتها عند أول فتح بعده. و«قائمتي» والنقوط
    // بيانات صاحب الحساب لا اكتشافُ محافظة، فلا تُمسّ.
    return ListenableBuilder(
      listenable: services.regions,
      builder: (context, _) {
        final regionKey = services.regions.headerRegionId;
        final screens = [
          EventsScreen(
            key: ValueKey('feed_$regionKey'),
            isActive: _index == AppServices.feedTabIndex,
          ),
          ServicesHubScreen(key: ValueKey('hub_$regionKey')),
          ServicesScreen(key: ValueKey('services_$regionKey')),
        ];

        return _shell(screens);
      },
    );
  }

  /// الهيكل نفسه — لا يعرف المحافظة ولا مفاتيحها، فيبقى `build` مسؤولاً عنها.
  Widget _shell(List<Widget> screens) {
    // `IndexedStack` يُبقي التغذية حيّة خلف التبويبات الأخرى — تُخبَر
    // صراحةً متى لم تعد المختارة كي تُسكت صوتها.
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
      // لا زرّ نشر عائم: الكبستان فوق الشريط تغطّيان النشر من كل وجهة، ونشر
      // التغذية في رأسها (`feed_publish_button`) أيضاً.
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _publishActions(),
          NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (value) => setState(() => _index = value),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.celebration_outlined),
                selectedIcon: Icon(Icons.celebration),
                label: 'المناسبات',
              ),
              NavigationDestination(
                icon: Icon(Icons.apps_outlined),
                selectedIcon: Icon(Icons.apps),
                label: 'خدماتنا',
              ),
              NavigationDestination(
                icon: Icon(Icons.handyman_outlined),
                selectedIcon: Icon(Icons.handyman),
                label: 'خدمات الأعراس',
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// الكبستان الثابتتان فوق الشريط السفلي — بديل زرّ النشر العائم.
  ///
  /// «أضف عرسك» بارزة بلون العرس الذهبي، و«أضف خدمتك» أهدأ بإطار على سطح
  /// الشريط. كلٌّ منهما تفتح ما كانت تفتحه قبل التغيير نفسه: شاشة النشر، وورقة
  /// تقديم عرض الخدمة (`openSubmitServiceSheet`).
  Widget _publishActions() {
    return Container(
      color: context.c.surfaceSunk,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 2),
      child: Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              key: const Key('shell_add_event'),
              onPressed: _openAddEvent,
              style: ElevatedButton.styleFrom(
                backgroundColor: context.c.gold,
                foregroundColor: context.c.onSky,
                padding: const EdgeInsets.symmetric(vertical: 11),
                textStyle: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
              icon: const Icon(Icons.celebration_outlined, size: 18),
              label: const Text('أضف عرسك'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              key: const Key('shell_add_service'),
              onPressed: _openAddService,
              style: OutlinedButton.styleFrom(
                backgroundColor: context.c.surface,
                foregroundColor: context.c.inkSoft,
                padding: const EdgeInsets.symmetric(vertical: 11),
                side: BorderSide(color: context.c.line),
                textStyle: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              icon: const Icon(Icons.handyman_outlined, size: 18),
              label: const Text('أضف خدمتك'),
            ),
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
