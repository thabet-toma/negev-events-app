import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/negev_api.dart';
import 'auth_store.dart';
import 'places_store.dart';

/// المحافظة المختارة للاكتشاف — تُحفظ على الجهاز وعلى الحساب معاً (تذكرة #125).
///
/// نظير `selectedRegionId` و`negev_region` في الويب (#124): **معرّف رقمي
/// نصّاً** في التخزين المحلي، و`X-Region` يُرفق مع كل نداء من `ApiClient`.
///
/// ثلاث حالات لا رابعة لها، والثلاث تُرسَل ترويسةً إلا الأخيرة:
/// - اختيار صريح على الجهاز ([regionId] غير فارغ) — يغلب كل شيء.
/// - بلا اختيار جهاز، والحساب له محافظة نشطة ([_accountRegionId]) — تُرسَل
///   ترويسةً كذلك: نداءات الاكتشاف في هذا العميل عامة (`auth: false`)، ففرع
///   `req.user` في `server/src/middleware/region.js` لا يُبلَغ أبداً، ومحافظة
///   الحساب لا تصل الخادم إلا بهذه الترويسة.
/// - لا هذا ولا ذاك — لا ترويسة، والخادم يقرّر الافتراضية.
class RegionStore extends ChangeNotifier {
  RegionStore(this.api, this.places, this.auth);

  /// نفس مفتاح الويب حرفياً — معرّف رقمي نصّاً.
  static const storageKey = 'negev_region';

  final NegevApi api;
  final PlacesStore places;
  final AuthStore auth;

  /// الاختيار الصريح على الجهاز؛ `null` = «لم أختر» لا «اخترت الافتراضية».
  int? _regionId;

  /// محافظة الحساب المسجَّل — تُرسَل ترويسةً ما دام لا اختيار جهاز، ولا تُكتب
  /// على الجهاز.
  int? _accountRegionId;

  int? get regionId => _regionId;

  /// قيمة `X-Region` المُرسَلة فعلاً — `null` = بلا ترويسة. عليها تُفتح أسطح
  /// `HomeShell` (تغذية/خريطة/خدمات)، فتتجدّد كلما تغيّر **ما يُرسَل** لا
  /// الاختيار الصريح وحده — ومنه مسحُ محفوظٍ لم يعد موجوداً.
  String? get headerRegionId => api.client.regionId;

  /// المحافظات النشطة — من كتالوج البلدات المشترك (`GET /api/towns`).
  /// قائمة فارغة قبل وصول الخادم أو عند انقطاعه، فتُخفى المنتقي ولا يُحكم
  /// على المحفوظ.
  List<Region> get regions => places.catalog.regions;

  /// ما يُعلَّم في المنتقي: الاختيار الصريح، وإلا محافظة الحساب النشطة، وإلا
  /// الأولى — فالتطبيق «يفتح على المحافظة المحفوظة، وإلا الافتراضية».
  int? get effectiveRegionId {
    final explicit = _regionId;
    if (explicit != null) return explicit;
    final account = _activeAccountRegionId;
    if (account != null) return account;
    final active = regions;
    return active.isEmpty ? null : active.first.id;
  }

  /// محافظة الحساب إن كانت نشطة في الكتالوج — قبل وصول المحافظات لا تُعرف
  /// فلا تُرسَل، ويعيد [reconcile] ضبطها بعد وصولها.
  int? get _activeAccountRegionId {
    final account = _accountRegionId;
    if (account == null || !_isActive(regions, account)) return null;
    return account;
  }

  /// الترويسة تتبع **المحافظة الفعّالة** لا الاختيار الصريح وحده — انظر شرح
  /// الحالات الثلاث أعلى الملف.
  void _syncHeader() {
    final target = _regionId ?? _activeAccountRegionId;
    api.client.regionId = target == null ? null : '$target';
  }

  /// القراءة الكاملة: المحفوظ على الجهاز ثم التحقق من أنه ما زال نشطاً.
  ///
  /// **الإقلاع لا يستعملها**: `main.dart` ينتظر [restore] وحدها (قراءة محلية
  /// بلا شبكة) قبل أول طلب، ثم يُطلق [reconcile] بلا انتظار كي لا يتوقّف أول
  /// إطار على `GET /api/towns`.
  Future<void> load() async {
    await restore();
    await reconcile();
  }

  /// قراءة التفضيل المحفوظ وضبط ترويسة [ApiClient] — بلا شبكة إطلاقاً.
  /// تُنتظر في `main.dart` قبل أول طلب كي يحمل أول `GET /api/events` الترويسة
  /// الصحيحة لا ترويسة غائبة.
  ///
  /// تُضبط الترويسة هنا **قبل** التحقق من وجود المحافظة، لأن التحقق يحتاج
  /// شبكة؛ [reconcile] هو من يزيلها إن تبيّن أن المحفوظ لم يعد موجوداً.
  Future<void> restore() async {
    _regionId = await _readSaved();
    _syncHeader();
    notifyListeners();
  }

  /// يمسح المحفوظ إن لم يعد محافظة نشطة ويعامله كأنه لا اختيار (كما يفعل
  /// الخادم بالترويسة لمحافظة عُطّلت: يعود للافتراضية) — **ويزيل الترويسة
  /// ويُخطر**، فيعيد `HomeShell` الجلب بالمحافظة الفعّالة بدل أن يبقى كل نداء
  /// اكتشاف مردوداً بـ400 على معرّف غير موجود.
  ///
  /// لا يحكم على القائمة الاحتياطية ولا على قائمة فارغة — انقطاع الشبكة ليس
  /// دليلاً على أن المحافظة حُذفت، ومسحُها حينها يُفقد المستخدم اختياره.
  Future<void> reconcile() async {
    try {
      final catalog = await places.load();
      if (!catalog.fromServer || catalog.regions.isEmpty) return;

      var changed = false;
      final saved = _regionId;
      if (saved != null && !_isActive(catalog.regions, saved)) {
        _regionId = null;
        await _writeSaved(null);
        changed = true;
      }
      final account = _accountRegionId;
      if (account != null && !_isActive(catalog.regions, account)) {
        _accountRegionId = null;
        changed = true;
      }

      final before = api.client.regionId;
      _syncHeader();
      if (changed || api.client.regionId != before) notifyListeners();
    } catch (_) {
      // فشل الشبكة ليس خطأ مستخدم — والمستدعي في `main.dart` لا ينتظر هذا
      // النداء، فلا يجوز أن يخرج منه استثناء غير معالَج. المحفوظ يبقى كما هو،
      // والمنتقي يُخفي نفسه بلا محافظات، والشاشات تعرض حالتها الخاصة.
    }
  }

  /// تبديل المحافظة: الجهاز أولاً فوراً، ثم الحساب إن كان المستخدم مسجَّلاً.
  ///
  /// **[signedIn] افتراضياً حالة `AuthStore`** — صريحاً في الاختبارات ولشاشة
  /// تعرف الحالة بنفسها. فشل الحساب (`ApiException` من `PATCH`) يصل للمستدعي
  /// بعد أن يكون الجهاز قد حُفظ بالفعل: الترويسة الجديدة سارية، والرسالة
  /// للمستخدم وحده.
  Future<void> select(int regionId, {bool? signedIn}) async {
    if (regionId <= 0) return;

    _regionId = regionId;
    _syncHeader();
    await _writeSaved('$regionId');
    notifyListeners();

    if (!(signedIn ?? auth.isSignedIn)) return;
    final user = await api.setRegion(regionId);
    await auth.updateUser(user);
  }

  /// تبنّي محافظة الحساب بعد الدخول أو تحديث الجلسة — **لا تعلو على اختيار
  /// جهاز صريح**، ولا تُكتب على الجهاز. وتُرسَل ترويسةً ما دامت نشطة، فنداءات
  /// الاكتشاف لا تحمل رمزاً كي يقرأها الخادم من الحساب.
  void adoptAccountRegion() {
    final account = auth.user?.regionId;
    if (account == _accountRegionId) return;
    _accountRegionId = account;
    _syncHeader();
    notifyListeners();
  }

  static bool _isActive(List<Region> active, int id) =>
      active.any((region) => region.id == id);

  /// `null` لكل ما ليس معرّفاً رقمياً موجباً — والقيمة المخزَّنة نصّ كما يكتبها
  /// الويب، فرقم سالب أو نصّ مختلط يُعامل «بلا اختيار» ولا يُرسَل للخادم.
  static int? _parseRegionId(String? raw) {
    final id = raw == null ? null : int.tryParse(raw.trim());
    return id != null && id > 0 ? id : null;
  }

  /// قراءة محصَّنة: تخزين معطّل أو تالف = «بلا اختيار» لا فشل إقلاع — نفس
  /// ما يفعله `readSavedRegionId` في الويب.
  Future<int?> _readSaved() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return _parseRegionId(prefs.getString(storageKey));
    } catch (_) {
      return null;
    }
  }

  /// كتابة محصَّنة بالسبب نفسه: فشل التخزين لا يمنع الترويسة من السريان في
  /// هذه الجلسة (كما يعيد `saveRegionId` في الويب `false` ولا يُسقط الاختيار).
  Future<void> _writeSaved(String? value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (value == null) {
        await prefs.remove(storageKey);
      } else {
        await prefs.setString(storageKey, value);
      }
    } catch (_) {
      // تخزين معطّل — الاختيار يسري حتى إغلاق التطبيق.
    }
  }
}
