import 'dart:async';

import 'package:flutter/material.dart';

import '../main.dart';
import '../state/home_ticker.dart';
import '../state/region_onboarding.dart';
import '../state/region_store.dart';
import '../state/update_checker.dart';
import '../state/welcome.dart';
import '../theme.dart';
import '../widgets/featured_hub_sheet.dart';
import '../widgets/region_onboarding_sheet.dart';
import '../widgets/update_dialog.dart';
import '../widgets/welcome_sheet.dart';
import 'account_screen.dart';
import 'add_event_screen.dart';
import 'agenda_screen.dart';
import 'events_screen.dart';
import 'my_hub_screen.dart';
import 'services_hub_screen.dart';
import 'services_screen.dart';

/// الهيكل الرئيسي — خمس وجهات بشريط تنقّل سفلي، وبين «خدماتنا» و«خدمات
/// الأعراس» زرٌّ ذهبي وسطي (ليس وجهةً)، وبهذا الترتيب في RTL من اليمين:
/// المناسبات، خدماتنا، الزرّ الوسطي، خدمات الأعراس، مناسباتي، حسابي.
///
/// وفوقها ترويسةُ الهيكل بشعار «اعراسنا» (`_brandBar`): نسخة واحدة من الأصل
/// المولَّد، تكبس فتُعيد إلى «المناسبات» وتصعد بقائمتها إلى أولها (#157).
/// وبجانبه ترويسةٌ غنية (تذكرة #174): «أهلاً، الاسم» للمسجَّل وحده، وكبسولة
/// المحافظة التي تفتح ورقة المحافظة القائمة، وقلب «قائمتي»، وزرّ الأجندة.
/// والشاشات المدفوعة («تفاصيل مناسبة»، الألبومات، «قائمتي»…) تغطّيها كلها، فلا
/// شعار فوقها ولا ترويسة ثانية — تبقى «رجوع + عنوان» كما هي.
///
/// و«حسابي» **آخِر وجهة في الشريط** (كانت تُدفع شاشةً من زرّها في الترويسة
/// قبل إعادة تصميم الرئيسية): شاشتها كما هي (`AccountScreen`)، ولها الآن مقعد
/// ثابت بعد «مناسباتي».
///
/// و«مناسباتي» وجهةٌ جديدة: ما نشره المستخدم أوّلاً، ثمّ «قائمتي» (المحفوظات)
/// تحته في الشاشة نفسها (`MyHubScreen`) — لا وجهتان متقاربتان، ولا نسخة ثانية
/// من القائمة. والقلب في الترويسة يبقى يفتح `MyListScreen` وحدها كما كان.
/// والخريطة والنقوط لم تكونا وجهتين هنا، وشاشاتهما باقية كما هي ويُوصل إليها
/// من بطاقات الوصل السريع داخل «حسابي» — لم تُحذف ولم تُنسخ.
///
/// والزرّ الوسطي **ليس وجهة**: ذهبي دائري بشعار العلامة، مرتفع قليلاً فوق
/// الشريط، يفتح ورقة «مميّز عندنا» (`featured_hub_sheet.dart`) بقائمة مختارات
/// ثابتة بقرار المالك — و«أضف عرسك/أضف خدمتك» ليستا فيها لأن مكانهما الكبستان
/// الثابتتان أدناه.
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
  /// فهرس وجهة «خدماتنا» — منصّات كترا الأخرى.
  static const int _hubTab = 1;

  /// فهرس وجهة «خدمات الأعراس» — دليل مزوّدي الخدمة.
  static const int _servicesTab = 2;

  /// فهرس وجهة «مناسباتي» — منشورات المستخدم ثمّ «قائمتي» تحتها.
  static const int _myHubTab = AppServices.myHubTabIndex;

  /// فهرس وجهة «حسابي» — الشاشة القائمة نفسها، آخِر مقعد في الشريط.
  static const int _accountTab = 4;

  /// وجهات الشريط الخمس بترتيبها من اليمين في RTL — بيانات عرضها لا سلوكها،
  /// يقرؤها `_ShellNavBar` وحده. الفهرس الصريح من الثوابت أعلاه، فلا رقم
  /// مكرَّر يفترق عن موضعه في `IndexedStack`.
  static const List<_ShellTab> _tabs = [
    _ShellTab(
      index: AppServices.feedTabIndex,
      label: 'المناسبات',
      icon: Icons.celebration_outlined,
      selectedIcon: Icons.celebration,
    ),
    _ShellTab(
      index: _hubTab,
      label: 'خدماتنا',
      icon: Icons.apps_outlined,
      selectedIcon: Icons.apps,
    ),
    _ShellTab(
      index: _servicesTab,
      label: 'خدمات الأعراس',
      icon: Icons.handyman_outlined,
      selectedIcon: Icons.handyman,
    ),
    _ShellTab(
      index: _myHubTab,
      label: 'مناسباتي',
      icon: Icons.bookmark_border,
      selectedIcon: Icons.bookmark,
    ),
    _ShellTab(
      index: _accountTab,
      label: 'حسابي',
      icon: Icons.person_outline,
      selectedIcon: Icons.person,
    ),
  ];

  int _index = 0;
  StreamSubscription<Map<String, dynamic>>? _broadcastSub;
  HomeTickerStore? _homeTicker;
  ValueNotifier<int>? _tabRequest;
  bool _updateChecked = false;

  /// إشارة «اصعد إلى أوّل القائمة» إلى التغذية — يقرؤها `EventsScreen` وحده.
  /// إشارة لا استدعاء: الهيكل يعرف الوجهة المختارة، ولا يعرف كيف تُمرَّر قائمة
  /// التغذية ولا كيف تُعاد تهيئتها، فلا يُجلب شيء بهذه الكبسة.
  final ValueNotifier<int> _feedTopRequest = ValueNotifier<int>(0);

  /// أول تشغيل (الترحيب ثم ورقة المنطقة) — محاولة واحدة لكل تشغيل تطبيق، لا
  /// مع كل إعادة بناء.
  bool _onboardingAttempted = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final services = AppServices.of(context);
    // التعميم الحيّ يُقرأ من مصدره الواحد (`HomeTickerStore`): إشارة Socket
    // تُعيد الجلب لا تُركّب نصاً من الحمولة (الحمولة بلا معرّف، والويب يفعل
    // الشيء نفسه)، وشريط التغذية يرسم من الحالة نفسها — فلا شريطان لتعميم
    // واحد، وإغلاق أيّهما يعيد شريط الإحصاءات.
    if (_broadcastSub == null) {
      final ticker = services.homeTicker;
      _homeTicker = ticker;
      ticker.addListener(_handleHomeTickerChange);
      ticker.ensureLoaded();
      _broadcastSub =
          services.realtime.onBroadcast.listen((_) => ticker.refresh());
    }

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

  /// أول تشغيل (#126 و#163) — شاشة الترحيب ثم ورقة «من أي منطقة أنت؟».
  ///
  /// الترحيب يُعرض **قبل** الورقة مرة واحدة لكل تثبيت (`welcomeSeenKey`)،
  /// و«تخطّي» فيه لا يتخطّى الورقة: النداء التالي يفتحها كما لو لم يكن هناك
  /// ترحيب. وسؤال المنطقة هو السؤال الوحيد عند الإقلاع منذ #127 — صارت قصة
  /// التوسّع شريطاً داخل التغذية (`RegionBanner`) يتبع المحافظة، فلا تُعرض في
  /// الإقلاع ولا تُسجَّل رؤيتها.
  ///
  /// ولا يُعرض أيٌّ منهما إن كان على الشاشة غير الهيكل (شاشة مدفوعة أو ورقة
  /// مفتوحة) — وهذا يشمل رابطاً عميقاً فتح شاشته قبلنا — ولا يُسجَّل شيء
  /// حينها، فيعودان في الإقلاع التالي بدل أن يفوتا. و«محاولة واحدة» تعني
  /// مرةً واحدة لهذا التشغيل: `_onboardingAttempted` يمنع تكرار المحاولة مع كل
  /// إعادة بناء.
  Future<void> _maybeShowOnboardingSheet() async {
    // ننتظر أول إطار كي لا تُفتح ورقة أثناء البناء، وأول ما يصل إليه المستخدم
    // شاشته لا حوار.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted || !_isShellOnTop) return;

    if (!await isWelcomeSeen()) {
      if (!mounted || !_isShellOnTop) return;
      await showWelcomeSheet(context);
    }

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

  /// الحالة المشتركة تغيّرت — شريط الهيكل يظهر/يغيب معها. شريط التغذية يسمعها
  /// بنفسه (`ListenableBuilder` في `_HomeTicker`)، فلا إعادة بناء لهذه الشاشة.
  void _handleHomeTickerChange() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _broadcastSub?.cancel();
    _homeTicker?.removeListener(_handleHomeTickerChange);
    _tabRequest?.removeListener(_handleTabRequest);
    _feedTopRequest.dispose();
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

  /// شعار الترويسة — باب «الرئيسية» (تذكرة #157). يعيد إلى وجهة «المناسبات»؛
  /// وإن كانت مختارةً أصلاً يصعد بقائمتها إلى أولها. بالتمرير وحده
  /// (`topRequest`): لا فلتر يتغيّر ولا تغذية تُجلب.
  ///
  /// ولا يغلق هنا شاشةً مدفوعة: كل ما يُدفع فوق الهيكل يغطّي ترويسته كلها
  /// بخلفيته (راجع تعليق الصنف)، فلا يُبلغ الشعار وهو فوقه — ولذلك لا فرعَ
  /// `popUntil` هنا، فهو لا يُنفَّذ. والوحيد الذي يبقى فوقها ولا يغطّيها هو لوح
  /// فلاتر التغذية، وهو طبقة داخل `EventsScreen` لا مسار، فيغلقه ذلك الملف
  /// نفسه عند وصول الإشارة (`_jumpToFirstCard`).
  ///
  /// والإشارة تُرسَل في الحالتين: التغذية حيّة خلف `IndexedStack` وهي غير
  /// مختارة، فلوح فلاتر فُتح فيها ثم بُدِّلت الوجهة يبقى مفتوحاً تحتها؛ وكبسة
  /// الشعار من وجهة أخرى هي ما يجب أن تغلقه. (تصعد القائمة إلى أولها معه — لا
  /// يُطلب ذلك، لكنه ثمن إشارة واحدة بدل ثانية، و«الرئيسية» تحتمله.)
  void _goToFeedFromBrand() {
    if (_index != AppServices.feedTabIndex) {
      setState(() => _index = AppServices.feedTabIndex);
    }
    _feedTopRequest.value++;
  }

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
            topRequest: _feedTopRequest,
          ),
          ServicesHubScreen(key: ValueKey('hub_$regionKey')),
          ServicesScreen(key: ValueKey('services_$regionKey')),
          MyHubScreen(isActive: _index == _myHubTab),
          AccountScreen(isActive: _index == _accountTab),
        ];

        return _shell(screens);
      },
    );
  }

  /// الهيكل نفسه — لا يعرف المحافظة ولا مفاتيحها، فيبقى `build` مسؤولاً عنها.
  Widget _shell(List<Widget> screens) {
    final store = AppServices.of(context).homeTicker;
    // شريط التعميم في الهيكل للوجهات الأخرى وحدها: على «المناسبات» يرسمه شريط
    // التغذية نفسه من الحالة المشتركة نفسها (`_HomeTicker`)، فلا يظهر التعميم
    // مرّتين في الشاشة الواحدة.
    final broadcast =
        _index == AppServices.feedTabIndex ? null : store.broadcast;

    // `IndexedStack` يُبقي التغذية حيّة خلف التبويبات الأخرى — تُخبَر
    // صراحةً متى لم تعد المختارة كي تُسكت صوتها.
    return Scaffold(
      // منطقة الأمان العلوية تُستهلك هنا مرّة واحدة، فوق الترويسة: ما تحتها
      // (`SafeArea` في رأس التغذية، ولا `AppBar` في أي وجهة منذ #157) يقرأ
      // `padding.top` صفراً فلا تُضيف حشوة ثانية تحت الترويسة.
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            // ترويسة الهيكل فوق الوجهات الخمس كلها: نسخة واحدة من الشعار لا
            // خمس، وهي خارج `IndexedStack` فلا تُبنى مع كل تبديل وجهة.
            _brandBar(),
            if (broadcast != null)
              _BroadcastBanner(
                key: const Key('shell_broadcast_banner'),
                message: broadcast.message.isNotEmpty
                    ? broadcast.message
                    : broadcast.title,
                onDismiss: store.dismissActive,
              ),
            Expanded(
              child: IndexedStack(index: _index, children: screens),
            ),
          ],
        ),
      ),
      // لا زرّ نشر عائم: الكبستان فوق الشريط تغطّيان النشر من كل وجهة، ونشر
      // التغذية في رأسها (`feed_publish_button`) أيضاً.
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _publishActions(),
          _ShellNavBar(
            selectedIndex: _index,
            onSelect: (index) => setState(() => _index = index),
            onCenterTap: _openFeaturedHub,
          ),
        ],
      ),
    );
  }

  /// يفتح ورقة «مميّز عندنا» من الزرّ الذهبي الأوسط.
  ///
  /// وبطاقتها الأولى («صمّم بطاقة دعوتك») تنقل إلى «مناسباتي» لاختيار المناسبة:
  /// التصميم يحتاج مناسبةً بعينها، ومن هنا يصل المستخدم إلى كرتها.
  Future<void> _openFeaturedHub() {
    return showFeaturedHubSheet(
      context,
      onOpenMyHub: () => setState(() => _index = _myHubTab),
    );
  }

  /// كبسولة المحافظة — تفتح ورقة المحافظة القائمة نفسها (تذكرة #126) التي
  /// يفتحها «حسابي»، فاختيار المحافظة بلا نسخة ثانية من الورقة ولا من منطقها.
  Future<void> _openRegionSheet() => showRegionOnboardingSheet(context);

  /// زرّ الأجندة يفتح `AgendaScreen`، تقويم الشهر بعد تذكرة #175.
  void _openAgenda() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const AgendaScreen()),
    );
  }

  /// اسم المحافظة الفعّالة كما يعرضها المنتقي (`effectiveRegionId`): الاختيار
  /// الصريح، وإلا محافظة الحساب، وإلا الأولى — من كتالوج الخادم نفسه. و«منطقتك»
  /// قبل وصول `GET /api/towns`، كصياغة منتقي التغذية في الويب.
  String _effectiveRegionName(RegionStore regions) {
    final id = regions.effectiveRegionId;
    for (final region in regions.activeRegions) {
      if (region.id == id) return region.name;
    }
    return 'منطقتك';
  }

  /// عمود الهوية وسط الترويسة: «أهلاً، الاسم» للمسجَّل وحده فوق كبسولة
  /// المحافظة، ويُعاد بناؤه مع تغيّر الحساب أو المحافظة أو كتالوج البلدات
  /// (اسم المحافظة يصل معه) معاً.
  ///
  /// والتحية تتبع **حالة الدخول** (`isSignedIn`) لا الاسم وحده: `AuthStore.load()`
  /// يقرأ `negev_user` مستقلاً عن `negev_token`، فحسابٌ محفوظ بلا رمز زائرٌ لا
  /// مسجَّل — والتحية له لا للزائر. والكبسولة والقلب لكل زائر بحسب التذكرة، فلا
  /// يُشترطان بحالة الدخول.
  Widget _headerIdentity(AppServices services) {
    final rawName = (services.auth.user?.fullName ?? '').trim();
    final firstName = services.auth.isSignedIn && rawName.isNotEmpty
        ? rawName.split(RegExp(r'\s+')).first
        : '';
    final regionName = _effectiveRegionName(services.regions);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (firstName.isNotEmpty) ...[
          Text(
            'أهلاً، $firstName',
            key: const Key('shell_header_greeting'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: context.c.ink,
            ),
          ),
          const SizedBox(height: 4),
        ],
        _regionCapsule(regionName),
      ],
    );
  }

  /// كبسولة المحافظة — اسمها من الخادم وحده، ونقرها يفتح الورقة القائمة.
  Widget _regionCapsule(String regionName) {
    final radius = BorderRadius.circular(999);
    return Material(
      color: context.c.surfaceSunk,
      borderRadius: radius,
      child: InkWell(
        key: const Key('shell_header_region'),
        onTap: _openRegionSheet,
        borderRadius: radius,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            border: Border.all(color: context.c.line),
            borderRadius: radius,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.location_on_outlined, size: 14, color: context.c.sky),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  regionName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: context.c.ink,
                  ),
                ),
              ),
              const SizedBox(width: 2),
              Icon(Icons.expand_more, size: 16, color: context.c.inkSoft),
            ],
          ),
        ),
      ),
    );
  }

  /// ترويسة الهيكل: شعار «اعراسنا» على جهة البداية (يمين في RTL) فوق الوجهات
  /// الخمس، وبجانبه الترويسة الغنية (تذكرة #174): «أهلاً، الاسم» وكبسولة
  /// المحافظة، وقلب «قائمتي» وزرّ الأجندة على طرفها الآخر. الأصل المولَّد
  /// `mobile/assets/brand/mark-full.png` — طبقة `full` (بالكلمة) بمقاسها
  /// المنطقي ٧٢px، وهو حدّ القاعدة نفسه؛ و`2.0x`/`3.0x` يلتقطهما `Image.asset`
  /// تلقائياً. لا رسم بكود Flutter ولا تنزيل من الشبكة، فلا نسخة ثانية للعلامة
  /// في العميل.
  ///
  /// وفعل الشعار لم يتغيّر (#157): كبسة واحدة تعيد إلى «المناسبات» وتصعد
  /// بالقائمة إلى أولها بلا فلتر يتغيّر ولا تغذية تُجلب.
  ///
  /// بلا `SafeArea` هنا: منطقة الأمان تُستهلك مرّة واحدة حول عمود الهيكل كلّه.
  Widget _brandBar() {
    final services = AppServices.of(context);
    return Material(
      color: context.c.surface,
      child: Container(
        key: const Key('shell_brand_bar'),
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: context.c.line)),
        ),
        child: Row(
          children: [
            InkWell(
              key: const Key('shell_brand_logo'),
              onTap: _goToFeedFromBrand,
              borderRadius: BorderRadius.circular(16),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.asset(
                  'assets/brand/mark-full.png',
                  width: 72,
                  height: 72,
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.high,
                  // الكلمة مرسومة في العلامة نفسها؛ هذا اسمٌ للقارئ الآلي
                  // وحده بدل أن يقرأ مسار الملف.
                  semanticLabel: 'أعراسنا — العودة إلى المناسبات',
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ListenableBuilder(
                // `places` معهما: كتالوج المحافظات يصل من `GET /api/towns`
                // إليها وحدها (`RegionStore` يقرأ منه ولا يسمعه)، فبلا سماعه
                // تبقى الكبسولة على «منطقتك» بعد وصول الاسم.
                listenable: Listenable.merge([
                  services.auth,
                  services.regions,
                  services.places,
                ]),
                builder: (context, _) => _headerIdentity(services),
              ),
            ),
            const SizedBox(width: 4),
            // قلب «قائمتي» — الشاشة القائمة نفسها التي يفتحها «حسابي» (شاشة
            // مدفوعة لا وجهة في الشريط السفلي)، بلا نسخة ثانية.
            IconButton(
              key: const Key('shell_header_my_list'),
              onPressed: services.openMyList,
              tooltip: 'قائمتي',
              visualDensity: VisualDensity.compact,
              icon: Icon(Icons.favorite_border, color: context.c.inkSoft),
            ),
            IconButton(
              key: const Key('shell_header_agenda'),
              onPressed: _openAgenda,
              tooltip: 'أجندة المناسبات',
              visualDensity: VisualDensity.compact,
              icon: Icon(
                Icons.calendar_month_outlined,
                color: context.c.inkSoft,
              ),
            ),
          ],
        ),
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

/// وجهة واحدة في الشريط السفلي — بيانات عرضها لا سلوكها.
class _ShellTab {
  const _ShellTab({
    required this.index,
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });

  /// موضعها في `IndexedStack` — نفس ثوابت `_HomeShellState._*Tab`.
  final int index;
  final String label;

  /// المجرَّدة حين لا تكون مختارة، والممتلئة حين تكون.
  final IconData icon;
  final IconData selectedIcon;
}

/// شريط التنقّل السفلي — خمس وجهات وخمسة مواضع، والزرّ الوسطي ليس وجهة.
///
/// بُني يدوياً بدل `NavigationBar`: الزرّ الوسطي المرتفع لا مكان له في
/// `NavigationDestination`، وتثبيت مواضع الستّة في ٣٩٠dp يحتاج عرضاً أدنى
/// صريحاً لكل موضع (`minSlot`) — وهو ما لا يضمنه الشريط الجاهز.
///
/// **العرض الكافي (٣٤٤dp = ٥×٥٦ + ٦٤):** صفٌّ بلا تمرير، الوجهات تتمدّد
/// والزرّ الوسطي بعرضه الثابت وحده. **الأضيق:** صفٌّ بعرض ثابت داخل تمرير
/// أفقي، والمختارة تُبقى مرئيّة عند تبديلها (`didUpdateWidget`).
class _ShellNavBar extends StatefulWidget {
  const _ShellNavBar({
    required this.selectedIndex,
    required this.onSelect,
    required this.onCenterTap,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelect;

  /// الزرّ الوسطي لا يختار وجهة — يفتح ورقة «مميّز عندنا».
  final VoidCallback onCenterTap;

  @override
  State<_ShellNavBar> createState() => _ShellNavBarState();
}

class _ShellNavBarState extends State<_ShellNavBar> {
  /// أدنى عرض لموضع وجهة، وعرض موضع الزرّ الوسطي — ومجموعهما ما يلزم الشريطَ
  /// كي يظهر كاملاً بلا تمرير في هاتف ٣٩٠dp.
  static const double minSlot = 56.0;
  static const double centerSlot = 64.0;
  static const double needed = 5 * minSlot + centerSlot;

  /// مفتاح لكل وجهة — يُستعمل لإبقاء المختارة مرئيّة حين يُمرَّر الشريط.
  final Map<int, GlobalKey> _tabKeys = {
    for (final tab in _HomeShellState._tabs) tab.index: GlobalKey(),
  };

  @override
  void didUpdateWidget(covariant _ShellNavBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selectedIndex == oldWidget.selectedIndex) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final targetContext = _tabKeys[widget.selectedIndex]?.currentContext;
      if (targetContext == null) return;
      // الشريط الواسع لا `Scrollable` فيه أصلاً (`ensureVisible` بلا تمرير
      // يرمي)، فلا يُنادى إلا حين يوجد ما يُمرَّر.
      if (Scrollable.maybeOf(targetContext) == null) return;
      Scrollable.ensureVisible(
        targetContext,
        duration: const Duration(milliseconds: 200),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final tabs = _HomeShellState._tabs;

    return Material(
      key: const Key('home_bottom_nav'),
      color: context.c.surface,
      elevation: 3,
      child: SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            // RTL هو ما يرتّب هذه القائمة من اليمين: أول عنصر في الصفّ أيمنها.
            if (constraints.maxWidth >= needed) {
              return Row(
                children: [
                  Expanded(child: _tab(context, tabs[0])),
                  Expanded(child: _tab(context, tabs[1])),
                  _centerSlot(context),
                  Expanded(child: _tab(context, tabs[2])),
                  Expanded(child: _tab(context, tabs[3])),
                  Expanded(child: _tab(context, tabs[4])),
                ],
              );
            }

            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  SizedBox(width: minSlot, child: _tab(context, tabs[0])),
                  SizedBox(width: minSlot, child: _tab(context, tabs[1])),
                  _centerSlot(context),
                  SizedBox(width: minSlot, child: _tab(context, tabs[2])),
                  SizedBox(width: minSlot, child: _tab(context, tabs[3])),
                  SizedBox(width: minSlot, child: _tab(context, tabs[4])),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  /// وجهة واحدة: أيقونة مجرَّدة/ممتلئة وتسمية بسطرين على الأكثر — بلا قطع
  /// بنقاط، فالتسمية العربية قصيرة والمساحة تكفيها في العرض الكافي.
  ///
  /// ومفتاحها العام على المحتوى لا على `InkWell` (الذي يحمل `nav_tab_$i`):
  /// `ensureVisible` يحتاج سياقاً داخل التمرير، وهذا هو.
  Widget _tab(BuildContext context, _ShellTab tab) {
    final c = context.c;
    final selected = tab.index == widget.selectedIndex;

    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        key: Key('nav_tab_${tab.index}'),
        onTap: () => widget.onSelect(tab.index),
        child: Padding(
          key: _tabKeys[tab.index],
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? tab.selectedIcon : tab.icon,
                size: 24,
                color: selected ? c.sky : c.inkSoft,
              ),
              const SizedBox(height: 2),
              Text(
                tab.label,
                maxLines: 2,
                softWrap: true,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.normal,
                  color: selected ? c.sky : c.inkSoft,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// موضع الزرّ الوسطي — `Center` يحفظ للقرص مربّعه (٥٤×٥٤) داخل موضع أوسع:
  /// `SizedBox` وحده يفرض عرضه على الطفل فتصير الدائرة بيضاوية والعلامة تحتها
  /// مقصوصةً بشكلها أيضاً.
  Widget _centerSlot(BuildContext context) {
    return SizedBox(
      width: centerSlot,
      child: Center(child: _centerButton(context)),
    );
  }

  /// الزرّ الذهبي الأوسط — شعار العلامة على قرص، مرتفعٌ عن الشريط بـ١٠px.
  /// `Transform` لا يقصّ ولا يغيّر الحجم: الصعود فوق سطح الشريط بلا توسيع
  /// موضعه، والإطار بلون السطح يفصله عن الحبّة الذهبية.
  Widget _centerButton(BuildContext context) {
    final c = context.c;

    return Transform.translate(
      offset: const Offset(0, -10),
      child: Semantics(
        button: true,
        label: 'مميّز عندنا',
        child: InkWell(
          key: const Key('nav_center_button'),
          customBorder: const CircleBorder(),
          onTap: widget.onCenterTap,
          child: Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [const Color(0xFFF4D57B), c.gold],
              ),
              border: Border.all(color: c.surface, width: 3),
              boxShadow: [
                BoxShadow(
                  color: c.gold.withValues(alpha: 0.45),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: ClipOval(
                // خلفية بيضاء تحت العلامة، كما في أيقونة التطبيق: الأصل
                // مرسوم على أرضية بيضاء، والقرص الذهبي لا يُعاد تلوينه.
                child: ColoredBox(
                  color: Colors.white,
                  child: Image.asset(
                    'assets/brand/mark-full.png',
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            ),
          ),
        ),
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
  const _BroadcastBanner({
    super.key,
    required this.message,
    required this.onDismiss,
  });

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
