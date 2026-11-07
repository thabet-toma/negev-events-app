import 'package:flutter/foundation.dart';

import '../api/negev_api.dart';
import '../models/stats_ticker.dart';

/// الحالة الواحدة لشريط الرئيسية (تذكرة #172): الإحصاء، والتعميم الحيّ الذي
/// يحلّ محلّه — يقرؤها الهيكل والتغذية معاً.
///
/// **لماذا مخزن مشترك:** التعميم كان في مكانين — نصٌّ من Socket في `HomeShell`
/// (شريط الهيكل)، ولقطة من `GET /api/broadcasts/live` في `EventsScreen` عند
/// التحميل/السحب. فتعميم واحد كان يمكن أن يُرى مرّتين، وإغلاق شريط الهيكل كان
/// يمسح نسخته وحده فيبقى شريط الشاشة وتغيب الإحصاءات. هنا **مصدر واحد للعرض
/// اللحظي والإغلاق**: الشاشة ترسم من [broadcast] والهيكل يرسم من نفسه، والإغلاق
/// في أيّهما يخفيه من الاثنين ويعيد شريط الإحصاءات.
///
/// **ولا عرض قبل الحسم:** [broadcastsKnown] تبقى `false` حتى أول ردّ ناجح من
/// `GET /api/broadcasts/live`. وجود رقم إحصاء قبلها لا يكفي: عرضه ثم إخفاؤه
/// حين يصل تعميم ومضة يحكم بها ترتيب الشبكة وحده، و«لم تُعرف» ليست «لا تعميم»
/// (القاعدة نفسها في ويب #172).
class HomeTickerStore extends ChangeNotifier {
  HomeTickerStore({required NegevApi api}) : _api = api;

  final NegevApi _api;

  StatsTicker? _stats;
  List<({int id, String title, String message})> _broadcasts = const [];
  bool _broadcastsKnown = false;
  bool _started = false;
  bool _refreshing = false;

  /// تعاميم أُغلقت في هذه الجلسة — تستبعد من العرض كما في الويب، فلا يعيدها
  /// سحبٌ للتحديث ولا إشارة Socket تالية لتعميم آخر.
  final Set<int> _dismissed = <int>{};

  StatsTicker? get stats => _stats;

  bool get broadcastsKnown => _broadcastsKnown;

  /// التعميم المعروض الآن، أو `null` إن لم تُحسم الحالة بعد أو لم يكن هناك
  /// تعميم حيّ غير مُغلَق. الأحدث أولاً كما يعيده الخادم.
  ({int id, String title, String message})? get broadcast {
    if (!_broadcastsKnown) return null;
    for (final item in _broadcasts) {
      if (!_dismissed.contains(item.id)) return item;
    }
    return null;
  }

  /// أول تحميل مرّة واحدة لكل تشغيل — يطلبه الهيكل والتغذية معاً فلا يتضاعف
  /// النداء. الفشل لا يُعاد تلقائياً؛ السحب للتحديث ([refresh]) يعيد المحاولة.
  Future<void> ensureLoaded() {
    if (_started) return Future<void>.value();
    return refresh();
  }

  /// قراءة جديدة من الخادم — السحب للتحديث، أو إشارة تعميم من Socket. الطلبان
  /// المتزامنان يُطويان في واحد: الهيكل والشاشة قد يطلبان في اللحظة نفسها.
  Future<void> refresh() async {
    if (_refreshing) return;
    _started = true;
    _refreshing = true;
    try {
      await _loadBroadcasts();
      await _loadStats();
    } finally {
      _refreshing = false;
    }
  }

  /// إغلاق التعميم المعروض — الشريط وحده، ومركز الإشعارات لا يُمَسّ. الشريط
  /// يعود إلى الإحصاءات فوراً لأن [broadcast] يصير `null` والإخبار واحد للجميع.
  void dismissActive() {
    final active = broadcast;
    if (active == null) return;
    _dismissed.add(active.id);
    notifyListeners();
  }

  Future<void> _loadBroadcasts() async {
    try {
      final list = await _api.liveBroadcasts();
      _broadcasts = list;
      _broadcastsKnown = true;
      notifyListeners();
    } catch (_) {
      // الفشل صامت: «لم تُعرف» تبقى false فلا أرقام كاذبة، ومركز الإشعارات
      // يعمل بندائه الخاص.
    }
  }

  Future<void> _loadStats() async {
    try {
      _stats = await _api.statsTicker();
      notifyListeners();
    } catch (_) {
      // الفشل صامت: لا شريط أرقام كاذب، والتغذية لا تسقط.
    }
  }
}
