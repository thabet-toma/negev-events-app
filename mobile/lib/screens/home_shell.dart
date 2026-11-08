import 'dart:async';

import 'package:flutter/material.dart';

import '../main.dart';
import '../state/home_ticker.dart';
import '../state/region_onboarding.dart';
import '../state/region_store.dart';
import '../state/update_checker.dart';
import '../state/welcome.dart';
import '../theme.dart';
import '../widgets/region_onboarding_sheet.dart';
import '../widgets/update_dialog.dart';
import '../widgets/welcome_sheet.dart';
import 'add_event_screen.dart';
import 'agenda_screen.dart';
import 'events_screen.dart';
import 'services_hub_screen.dart';
import 'services_screen.dart';

/// الهيكل الرئيسي — ثلاث وجهات بشريط تنقّل سفلي: المناسبات، خدماتنا، خدمات
/// الأعراس (بهذا الترتيب في RTL من اليمين).
///
/// وفوق الثلاث ترويسةُ الهيكل بشعار «اعراسنا» (`_brandBar`): نسخة واحدة من
/// الأصل المولَّد، تكبس فتُعيد إلى «المناسبات» وتصعد بقائمتها إلى أولها (#157).
/// وبجانبه ترويسةٌ غنية (تذكرة #174): «أهلاً، الاسم» للمسجَّل وحده، وكبسولة
/// المحافظة التي تفتح ورقة المحافظة القائمة، وقلب «قائمتي»، وزرّ الأجندة —
/// والشريط السفلي يبقى ثلاث وجهات.
/// والشاشات المدفوعة («تفاصيل مناسبة»، «حسابي»، الألبومات…) تغطّيها كلها، فلا
/// شعار فوقها ولا ترويسة ثانية — تبقى «رجوع + عنوان» كما هي.
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
            // ترويسة الهيكل فوق الوجهات الثلاث كلها: نسخة واحدة من الشعار لا
            // ثلاث، وهي خارج `IndexedStack` فلا تُبنى مع كل تبديل وجهة.
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
  /// الثلاث، وبجانبه الترويسة الغنية (تذكرة #174): «أهلاً، الاسم» وكبسولة
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
