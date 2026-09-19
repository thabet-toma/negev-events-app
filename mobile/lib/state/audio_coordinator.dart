import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/negev_api.dart';
import '../models/event.dart';

/// الصوت الفعلي لمناسبة: شيلتها الخاصة، وإلا المقطع الافتراضي للمنصّة — لكن
/// فقط لنوع يُظهر حقل `audio_url` (نفس فحص `event_details_screen.dart`). نوع
/// يُخفيه (العزاء) لا صوت له إطلاقاً، ولا حتى شيلة مرفوعة سابقاً. دالة عامة
/// صِرفة لتبقى قابلة للاختبار دون مشغّل حقيقي.
String? effectiveEventAudioUrl(Event event, {String? defaultAudioUrl}) {
  if (!(event.occasionType?.showsField('audio_url') ?? true)) return null;
  final own = event.audioUrl;
  if (own != null && own.trim().isNotEmpty) return own;
  if (defaultAudioUrl == null || defaultAudioUrl.trim().isEmpty) return null;
  return defaultAudioUrl;
}

/// منسّق الصوت — مشغّل واحد مشترك للتطبيق كله، فلا يعلو مقطعان معاً أبداً.
///
/// كل مستدعٍ (التغذية، شاشة التفاصيل) يمرّر نفسه `owner`: الإيقاف والإيقاف
/// المؤقت عبر [release]/[pause] يمسّان المقطع فقط إن كان المستدعي هو من
/// شغّله آخر مرّة — شاشة تفاصيل تُغلق بعد أن استأنفت التغذية لا تُسكِت
/// التغذية. المشغّل نفسه يُنشأ عند أول تشغيل فعلي لا قبله.
class AudioCoordinator extends ChangeNotifier with WidgetsBindingObserver {
  static const mutedKey = 'negev_sound_muted';

  AudioPlayer? _player;
  StreamSubscription<void>? _completeSub;

  String? _url;
  Object? _owner;
  bool _playing = false;
  bool _paused = false;
  bool _pausedByLifecycle = false;
  bool _muted = false;

  Future<String?>? _defaultTrack;

  bool get isMuted => _muted;
  String? get currentUrl => _url;

  /// هل هذا الرابط هو ما يُسمَع الآن؟ — شاشة التفاصيل تبني زرّها منه.
  bool isPlayingUrl(String url) => _playing && _url == url;

  /// حالة الكتم المحفوظة. فشل التخزين المحلي لا يمنع التشغيل — يبقى غير مكتوم.
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _muted = prefs.getBool(mutedKey) ?? false;
      notifyListeners();
    } catch (_) {}
  }

  /// يوقف الصوت حين يغادر التطبيق الواجهة ويستأنفه عند العودة.
  void bindLifecycle() => WidgetsBinding.instance.addObserver(this);

  /// المقطع الافتراضي للمنصّة — يُجلب مرّة واحدة لعمر التطبيق.
  Future<String?> defaultTrack(NegevApi api) =>
      _defaultTrack ??= api.getDefaultEventAudioUrl();

  Future<void> setMuted(bool muted) async {
    _muted = muted;
    notifyListeners();
    if (muted) await _stop();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(mutedKey, muted);
    } catch (_) {}
  }

  /// تشغيل تلقائي — لا شيء إن كان الصوت مكتوماً. نفس المقطع لنفس المالك بعد
  /// إيقاف مؤقت يُستأنف من موضعه بدل أن يبدأ من أوّله. صامت عند الفشل: مقطع
  /// لم يُحمَّل لا يستحقّ رسالة خطأ لم يطلبها أحد.
  Future<void> autoplay(String? url, {required Object owner}) async {
    if (_muted || url == null) {
      await release(owner);
      return;
    }
    if (_url == url && _owner == owner && _paused) {
      await _resume();
      return;
    }
    if (_url == url && _owner == owner && _playing) return;
    try {
      await play(url, owner: owner);
    } catch (_) {}
  }

  /// تشغيل صريح — يعمل حتى والصوت مكتوم (الكتم يوقف التلقائي وحده).
  Future<void> play(String url, {required Object owner}) async {
    _owner = owner;
    _url = url;
    _paused = false;
    _pausedByLifecycle = false;
    _playing = true;
    notifyListeners();
    try {
      final player = _ensurePlayer();
      await player.stop();
      await player.setReleaseMode(ReleaseMode.stop);
      // تبدّل المالك أو المقطع أثناء الانتظار ⇒ هذا الطلب لم يعد المطلوب.
      if (_owner != owner || _url != url) return;
      await player.play(UrlSource(url));
    } catch (_) {
      if (_owner == owner && _url == url) {
        _playing = false;
        notifyListeners();
      }
      rethrow;
    }
  }

  /// زرّ تشغيل/إيقاف يدوي لرابط بعينه.
  Future<void> toggle(String url, {required Object owner}) async {
    if (isPlayingUrl(url)) {
      await pause(owner);
    } else if (_url == url && _paused) {
      _owner = owner;
      await _resume();
    } else {
      await play(url, owner: owner);
    }
  }

  /// إيقاف مؤقت لما شغّله [owner] وحده.
  Future<void> pause(Object owner) async {
    if (_owner != owner || !_playing) return;
    _playing = false;
    _paused = true;
    notifyListeners();
    try {
      await _player?.pause();
    } catch (_) {}
  }

  /// إيقاف تام لما شغّله [owner] وحده — مغادرة كرت أو إغلاق شاشة.
  Future<void> release(Object owner) async {
    if (_owner != owner) return;
    await _stop();
  }

  Future<void> _resume() async {
    _paused = false;
    _pausedByLifecycle = false;
    _playing = true;
    notifyListeners();
    try {
      await _player?.resume();
    } catch (_) {
      _playing = false;
      notifyListeners();
    }
  }

  Future<void> _stop() async {
    final hadSomething = _url != null;
    _url = null;
    _owner = null;
    _playing = false;
    _paused = false;
    _pausedByLifecycle = false;
    if (hadSomething) notifyListeners();
    try {
      await _player?.stop();
    } catch (_) {}
  }

  AudioPlayer _ensurePlayer() {
    final existing = _player;
    if (existing != null) return existing;
    final player = AudioPlayer();
    _completeSub = player.onPlayerComplete.listen((_) {
      // انتهى المقطع — لا تكرار (ReleaseMode.stop)، والزرّ يعود «تشغيل».
      _playing = false;
      _paused = false;
      _url = null;
      _owner = null;
      notifyListeners();
    });
    return _player = player;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_pausedByLifecycle && _url != null) _resume();
      return;
    }
    if (_playing) {
      final owner = _owner;
      if (owner != null) {
        pause(owner);
        _pausedByLifecycle = true;
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _completeSub?.cancel();
    try {
      _player?.dispose();
    } catch (_) {}
    super.dispose();
  }
}
