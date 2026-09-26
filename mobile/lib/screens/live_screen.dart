import 'dart:async';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../api/api_client.dart' show ApiException;
import '../config.dart';
import '../main.dart';
import '../models/live.dart';
import '../state/auth_store.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/congratulations.dart' show openSignInGate;

/// يفتح صفحة البث — من الكبسة الرابعة، ومن «حسابي»، ومن إشعار «بدأ البث».
Future<void> openLiveScreen(BuildContext context) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => const LiveScreen()),
  );
}

/// الكبسة الرابعة «البث المباشر» — ظاهرة وتنكبس دائماً، حتى بلا أي رابط
/// مضبوط. [channel] من GET /api/live؛ حين يكون البث نشِطاً تظهر عليها شارة
/// حمراء «مباشر»، وتنطفئ وحدها عند `until` بمؤقّت محلّي بلا انتظار حدث.
class LiveButton extends StatefulWidget {
  const LiveButton({
    super.key,
    required this.channel,
    required this.onPressed,
    this.color,
  });

  final LiveChannel? channel;
  final VoidCallback onPressed;

  /// لون الأيقونة — أبيض فوق التغذية المظلمة، وافتراضي السمة في رأس اللوحة.
  final Color? color;

  @override
  State<LiveButton> createState() => _LiveButtonState();
}

class _LiveButtonState extends State<LiveButton> {
  bool _badgeOn = false;
  Timer? _offTimer;

  @override
  void initState() {
    super.initState();
    _syncBadge();
  }

  @override
  void didUpdateWidget(LiveButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.channel != widget.channel) _syncBadge();
  }

  void _syncBadge() {
    _offTimer?.cancel();
    _offTimer = null;
    final live = widget.channel?.live;
    if (live == null || !live.active) {
      _badgeOn = false;
      return;
    }
    final until = live.untilTime;
    if (until == null) {
      _badgeOn = true;
      return;
    }
    final remaining = until.difference(DateTime.now());
    if (remaining <= Duration.zero) {
      _badgeOn = false;
      return;
    }
    _badgeOn = true;
    _offTimer = Timer(remaining, () {
      if (mounted) setState(() => _badgeOn = false);
    });
  }

  @override
  void dispose() {
    _offTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // الشارة فوق الأيقونة لا بجانبها: الشريط العائم ممتلئ أصلاً على هاتف
    // ضيّق، فلا يزيد عرض الكبسة حين يبدأ البث.
    return IconButton(
      key: const Key('live_button'),
      tooltip: 'البث المباشر',
      onPressed: widget.onPressed,
      icon: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Icon(Icons.live_tv_rounded, size: 20, color: widget.color),
          if (_badgeOn)
            const Positioned(
              top: -15,
              child: _LiveBadge(key: Key('live_badge'), compact: true),
            ),
        ],
      ),
    );
  }
}

/// نقطة حمراء + «مباشر» — الشارة نفسها على الكبسة وفي بطاقة البث.
class _LiveBadge extends StatelessWidget {
  const _LiveBadge({super.key, this.text = 'مباشر', this.compact = false});

  final String text;

  /// أصغر فوق أيقونة الكبسة، وبحجمه العادي في بطاقة البث.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 4 : 6, vertical: compact ? 1 : 2),
      decoration: BoxDecoration(
        color: context.c.danger,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: compact ? 5 : 6,
            height: compact ? 5 : 6,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
          ),
          SizedBox(width: compact ? 3 : 4),
          Text(
            text,
            style: TextStyle(
              color: Colors.white,
              fontSize: compact ? 9 : 11,
              height: 1.2,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

/// صفحة البث: المشغّل أو زرّ الدخول، ثم موضوع الحلقة وسؤالها، ثم نقاش
/// التطبيق (استفتاء اليوم)، ثم نتيجة نقاش الأمس.
///
/// المشغّل WebView على `/live/embed` من خادمنا (لا `embed_url` مباشرة — انظر
/// `NegevApi.liveEmbedUrl`)، ويُنشأ فقط حين يصل `embed_url`؛ ويُفرَّغ عند
/// الخروج كي يتوقّف الصوت.
class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  Future<LiveHub>? _future;
  LiveHub? _hub;
  bool _voting = false;

  WebViewController? _web;
  String? _webEmbedUrl;

  AuthStore? _auth;
  bool _wasSignedIn = false;
  StreamSubscription<void>? _liveStatusSub;
  VoidCallback? _unsubscribePoll;
  int? _pollEpisodeId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_future != null) return;
    final services = AppServices.of(context);
    _auth = services.auth;
    _wasSignedIn = services.auth.isSignedIn;
    services.auth.addListener(_onAuthChanged);
    _liveStatusSub = services.realtime.onLiveStatus.listen((_) => _refresh(quiet: true));
    _reload();
  }

  @override
  void dispose() {
    _auth?.removeListener(_onAuthChanged);
    _liveStatusSub?.cancel();
    _unsubscribePoll?.call();
    _releasePlayer();
    super.dispose();
  }

  /// تحميل أوّل أو «إعادة المحاولة» — بحالة التحميل الكاملة.
  void _reload() {
    final future = _fetch();
    setState(() {
      _future = future;
    });
  }

  /// تحديث بلا حالة تحميل: السحب للتحديث، عودة من الدخول، تغيّر البث، وبعد
  /// رفض تصويت. الأخطاء تُقال للمستخدم إلا في التحديث الصامت.
  Future<void> _refresh({bool quiet = false}) async {
    try {
      await _fetch();
    } catch (error) {
      if (!quiet && mounted) showMessage(context, '$error', isError: true);
    }
  }

  Future<LiveHub> _fetch() async {
    final services = AppServices.of(context);
    final hub = await services.api.liveHub(auth: services.auth.isSignedIn);
    if (mounted) setState(() => _applyHub(hub));
    return hub;
  }

  void _onAuthChanged() {
    final signedIn = _auth?.isSignedIn ?? false;
    if (signedIn == _wasSignedIn) return;
    _wasSignedIn = signedIn;
    // عودة من شاشة الدخول (أو خروج): `my_vote` ونتائج اليوم تتبع الحساب.
    if (mounted) _refresh(quiet: true);
  }

  void _applyHub(LiveHub hub) {
    _hub = hub;
    // المشغّل للبث القائم فقط، كالموقع: بث انتهى موعده لا يُعرض كأنه مباشر.
    final live = hub.channel.live;
    _syncPlayer(live != null && live.active ? hub.channel.embedUrl : null);
    _syncPollChannel(hub.today);
  }

  void _syncPlayer(String? embedUrl) {
    if (embedUrl == null) {
      _releasePlayer();
      return;
    }
    if (_web != null && _webEmbedUrl == embedUrl) return;
    final uri = AppServices.of(context).api.liveEmbedUrl;
    _webEmbedUrl = embedUrl;
    if (_web != null) {
      // بثّ آخر صار مضبوطاً — الصفحة نفسها تلفّ الرابط الجديد.
      _web!.loadRequest(uri);
      return;
    }
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..loadRequest(uri);
  }

  /// صفحة فارغة قبل التخلّص من المتحكّم — وإلا بقي صوت البث يعمل بعد الخروج.
  void _releasePlayer() {
    final web = _web;
    _web = null;
    _webEmbedUrl = null;
    // المنصّة قد تكون أزالت العرض فعلاً عند الخروج — لا رمية تفلت من هنا.
    if (web != null) {
      unawaited(web.loadRequest(Uri.parse('about:blank')).catchError((Object _) {}));
    }
  }

  void _syncPollChannel(LiveEpisode? today) {
    final episodeId = today?.poll == null ? null : today!.id;
    if (episodeId == _pollEpisodeId) return;
    _unsubscribePoll?.call();
    _unsubscribePoll = null;
    _pollEpisodeId = episodeId;
    if (episodeId == null) return;
    _unsubscribePoll = AppServices.of(context).realtime.onLivePoll(episodeId, (data) {
      final hub = _hub;
      final today = hub?.today;
      final poll = today?.poll;
      // النتائج تُعرض فقط بعد أن يصوّت المستخدم نفسه.
      if (!mounted || hub == null || today == null || poll == null || !poll.hasVoted) return;
      if (today.id != episodeId) return;
      final results = parseLivePollResults(data['results']);
      if (results.isEmpty) return;
      final total = int.tryParse('${data['total_votes']}') ?? poll.totalVotes ?? 0;
      setState(() {
        _hub = hub.copyWith(today: today.copyWith(poll: poll.withResults(results, total)));
      });
    });
  }

  Future<void> _vote(LiveEpisode episode, int optionIndex) async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لتشارك في نقاش اليوم');
      return;
    }
    if (_voting) return;
    setState(() => _voting = true);
    try {
      final poll = await services.api.voteLive(episode.id, optionIndex);
      if (!mounted) return;
      final hub = _hub;
      if (hub != null) {
        setState(() => _hub = hub.copyWith(today: episode.copyWith(poll: poll)));
      }
      showMessage(context, 'تم تسجيل صوتك');
    } on ApiException catch (error) {
      if (!mounted) return;
      showMessage(context, error.message, isError: true);
      // صوت سابق (409)، نقاش أُغلق (400)، أو حلقة حُذفت (404) — الصفحة تتبع
      // الخادم فتُعرض النتيجة أو يختفي القسم.
      if (error.statusCode == 409 || error.statusCode == 400 || error.statusCode == 404) {
        await _refresh(quiet: true);
      }
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _voting = false);
    }
  }

  Future<void> _share() async {
    final hub = _hub;
    final url = hub?.shareUrl ?? '${AppConfig.apiBase}/live';
    final live = hub?.channel.live;
    final title = (live != null && live.active && live.title.isNotEmpty)
        ? live.title
        : 'البث المباشر — مناسبات النقب';
    try {
      await SharePlus.instance.share(ShareParams(text: '$title\n$url'));
    } catch (_) {
      if (mounted) showMessage(context, 'تعذّر فتح قائمة المشاركة', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('البث المباشر'),
        actions: [
          IconButton(
            tooltip: 'مشاركة',
            icon: const Icon(Icons.share_rounded),
            onPressed: _share,
          ),
        ],
      ),
      body: FutureBuilder<LiveHub>(
        future: _future,
        builder: (context, snapshot) => AsyncView<LiveHub>(
          snapshot: snapshot,
          onRetry: _reload,
          builder: (data) => RefreshIndicator(
            onRefresh: _refresh,
            child: _buildBody(_hub ?? data),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(LiveHub hub) {
    final channel = hub.channel;
    final live = channel.live;
    final today = hub.today;
    final poll = today?.poll;
    final previous = hub.previous;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 28),
      children: [
        _buildPlayer(channel),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (live != null && live.title.isNotEmpty && live.active)
                Text(
                  live.title,
                  style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
                ),
              if (today?.topic != null)
                _LabelledText(label: 'موضوع اليوم', text: today!.topic!),
              if (today?.episodeQuestion != null)
                _LabelledText(label: 'سؤال الحلقة', text: today!.episodeQuestion!),
              if (today != null && poll != null) _buildPoll(today, poll),
              if (previous != null) _buildPrevious(previous),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPlayer(LiveChannel channel) {
    final live = channel.live;
    final web = _web;

    if (web != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: ColoredBox(
              color: Colors.black,
              child: WebViewWidget(controller: web),
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () {
                final target = Uri.tryParse(live?.url ?? '');
                openExternalLink(
                  context,
                  (target != null && target.hasScheme)
                      ? target
                      : AppServices.of(context).api.liveGoUrl,
                  failureMessage: 'تعذّر فتح يوتيوب',
                );
              },
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('افتح في يوتيوب'),
            ),
          ),
        ],
      );
    }

    if (live != null && live.active) {
      return _Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Align(
              alignment: AlignmentDirectional.centerStart,
              child: _LiveBadge(text: 'مباشر الآن'),
            ),
            if (live.title.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                live.title,
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ],
            const SizedBox(height: 14),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              onPressed: () => openExternalLink(
                context,
                AppServices.of(context).api.liveGoUrl,
                failureMessage: 'تعذّر فتح صفحة البث',
              ),
              icon: const Icon(Icons.play_circle_fill_rounded),
              label: const Text('ادخل البث'),
            ),
          ],
        ),
      );
    }

    final channelUrl = Uri.tryParse(channel.channelUrl ?? '');
    return _Card(
      child: Column(
        children: [
          Icon(Icons.live_tv_rounded, size: 40, color: context.c.inkFaint),
          const SizedBox(height: 10),
          Text(
            'لا يوجد بث الآن',
            style: TextStyle(fontSize: 16, color: context.c.inkSoft),
          ),
          if (channelUrl != null && channelUrl.hasScheme) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => openExternalLink(
                context,
                channelUrl,
                failureMessage: 'تعذّر فتح القناة',
              ),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('قناتنا'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPoll(LiveEpisode episode, LivePoll poll) {
    final results = poll.results;
    return _Section(
      title: 'نقاش التطبيق',
      children: [
        if (poll.question.isNotEmpty)
          Text(
            poll.question,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.5),
          ),
        const SizedBox(height: 10),
        if (poll.hasVoted && results != null) ...[
          _ResultBars(results: results, highlightIndex: poll.myVote),
          const SizedBox(height: 6),
          Text(
            'عدد المشاركين: ${poll.totalVotes ?? 0}',
            style: TextStyle(fontSize: 13, color: context.c.inkFaint),
          ),
        ] else
          for (var i = 0; i < poll.options.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton(
                onPressed: _voting ? null : () => _vote(episode, i),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
                  alignment: AlignmentDirectional.centerStart,
                ),
                child: Text(poll.options[i]),
              ),
            ),
      ],
    );
  }

  Widget _buildPrevious(LivePreviousPoll previous) {
    return _Section(
      title: 'نتيجة نقاش الأمس',
      children: [
        if (previous.question.isNotEmpty)
          Text(
            previous.question,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.5),
          ),
        const SizedBox(height: 10),
        _ResultBars(results: previous.results),
        const SizedBox(height: 6),
        Text(
          'عدد المشاركين: ${previous.totalVotes}',
          style: TextStyle(fontSize: 13, color: context.c.inkFaint),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(18, 16, 18, 0),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.c.line),
      ),
      child: child,
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: context.c.sky,
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _LabelledText extends StatelessWidget {
  const _LabelledText({required this.label, required this.text});

  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: context.c.inkFaint)),
          const SizedBox(height: 3),
          Text(text, style: const TextStyle(fontSize: 15.5, height: 1.55)),
        ],
      ),
    );
  }
}

/// أشرطة النتائج بالنسب المحسوبة على الخادم — لاستفتاء اليوم ونتيجة الأمس.
class _ResultBars extends StatelessWidget {
  const _ResultBars({required this.results, this.highlightIndex});

  final List<LivePollResult> results;
  final int? highlightIndex;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final result in results)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    if (result.index == highlightIndex) ...[
                      Icon(Icons.check_circle, size: 16, color: context.c.sky),
                      const SizedBox(width: 4),
                    ],
                    Expanded(child: Text(result.label)),
                    Text(
                      '${result.percentage}%',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: (result.percentage.clamp(0, 100)) / 100,
                    minHeight: 8,
                    backgroundColor: context.c.surfaceSunk,
                    color: result.index == highlightIndex ? context.c.sky : context.c.inkFaint,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
