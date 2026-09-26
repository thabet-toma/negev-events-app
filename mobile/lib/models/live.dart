/// حالة البث المباشر — من GET /api/live (وهي نفسها النصف الأول من
/// GET /api/live/hub). المنصّة لا تُسمّى هنا: الخادم وحده يقرّر إن كان الرابط
/// قابلاً للتضمين (`embed_url`) أو زرّ رابط فقط.
class LiveChannel {
  /// رابط القناة الدائم — `live_channel_url`، ويُقرأ `profile_url` (الاسم
  /// القديم لنفس القيمة) إن غاب الجديد.
  final String? channelUrl;
  final LiveBroadcast? live;

  /// رابط مشغّل قابل للتضمين، أو `null` حين لا بثّ أو الرابط غير قابل له.
  /// العميل لا يحمّله مباشرةً — يحمّل `/live/embed` من خادمنا (Referer).
  final String? embedUrl;

  const LiveChannel({this.channelUrl, this.live, this.embedUrl});

  /// بثّ نشِط الآن حسب الخادم.
  bool get isLive => live?.active ?? false;

  factory LiveChannel.fromJson(Map<String, dynamic> json) {
    final rawLive = json['live'];
    return LiveChannel(
      channelUrl: _nullableString(json['live_channel_url']) ??
          _nullableString(json['profile_url']),
      live: rawLive is Map<String, dynamic> ? LiveBroadcast.fromJson(rawLive) : null,
      embedUrl: _nullableString(json['embed_url']),
    );
  }
}

/// بثّ مضبوط (عنوان + موعد انتهاء + رابط). `active` تصل محسوبة من الخادم؛
/// [untilTime] للعميل كي يُطفئ الشارة وحده عند الموعد بلا انتظار حدث.
class LiveBroadcast {
  final String title;
  final String until;
  final String url;
  final bool active;

  const LiveBroadcast({
    required this.title,
    required this.until,
    required this.url,
    required this.active,
  });

  DateTime? get untilTime => DateTime.tryParse(until);

  factory LiveBroadcast.fromJson(Map<String, dynamic> json) => LiveBroadcast(
        title: '${json['title'] ?? ''}'.trim(),
        until: '${json['until'] ?? ''}',
        url: '${json['url'] ?? ''}',
        active: json['active'] == true,
      );
}

/// صفحة البث كاملة — GET /api/live/hub: حالة البث + حلقة اليوم + نتيجة
/// آخر نقاش قبل اليوم + رابط المشاركة.
class LiveHub {
  final LiveChannel channel;
  final LiveEpisode? today;
  final LivePreviousPoll? previous;
  final String? shareUrl;

  const LiveHub({
    required this.channel,
    this.today,
    this.previous,
    this.shareUrl,
  });

  factory LiveHub.fromJson(Map<String, dynamic> json) {
    final rawToday = json['today'];
    final rawPrevious = json['previous'];
    final previous = rawPrevious is Map<String, dynamic>
        ? LivePreviousPoll.fromJson(rawPrevious)
        : null;
    return LiveHub(
      channel: LiveChannel.fromJson(json),
      today: rawToday is Map<String, dynamic> ? LiveEpisode.fromJson(rawToday) : null,
      previous: (previous == null || previous.results.isEmpty) ? null : previous,
      shareUrl: _nullableString(json['share_url']),
    );
  }

  LiveHub copyWith({LiveEpisode? today}) => LiveHub(
        channel: channel,
        today: today ?? this.today,
        previous: previous,
        shareUrl: shareUrl,
      );
}

/// حلقة اليوم: موضوعها وسؤالها واستفتاؤها (إن وُجد).
class LiveEpisode {
  final int id;
  final String? date;
  final String? topic;
  final String? episodeQuestion;
  final LivePoll? poll;

  const LiveEpisode({
    required this.id,
    this.date,
    this.topic,
    this.episodeQuestion,
    this.poll,
  });

  factory LiveEpisode.fromJson(Map<String, dynamic> json) {
    final rawPoll = json['poll'];
    final poll = rawPoll is Map<String, dynamic> ? LivePoll.fromJson(rawPoll) : null;
    return LiveEpisode(
      id: _toInt(json['id']) ?? 0,
      date: _nullableString(json['date']),
      topic: _nullableString(json['topic']),
      episodeQuestion: _nullableString(json['episode_question']),
      poll: (poll == null || poll.options.isEmpty) ? null : poll,
    );
  }

  LiveEpisode copyWith({LivePoll? poll}) => LiveEpisode(
        id: id,
        date: date,
        topic: topic,
        episodeQuestion: episodeQuestion,
        poll: poll ?? this.poll,
      );
}

/// استفتاء اليوم. [results] و[totalVotes] لا يصلان إلا بعد أن يصوّت
/// المستخدم نفسه (`my_vote` غير فارغ) — قبلها الخيارات وحدها.
class LivePoll {
  final String question;
  final List<String> options;
  final int? myVote;
  final List<LivePollResult>? results;
  final int? totalVotes;

  const LivePoll({
    required this.question,
    required this.options,
    this.myVote,
    this.results,
    this.totalVotes,
  });

  bool get hasVoted => myVote != null;

  factory LivePoll.fromJson(Map<String, dynamic> json) {
    final rawResults = json['results'];
    return LivePoll(
      question: '${json['question'] ?? ''}'.trim(),
      options: _stringList(json['options']),
      myVote: _toInt(json['my_vote']),
      results: rawResults is List ? _resultsList(rawResults) : null,
      totalVotes: _toInt(json['total_votes']),
    );
  }

  /// نتائج جديدة من قناة `live_poll_<id>` — الخيارات وصوتي يبقيان كما هما.
  LivePoll withResults(List<LivePollResult> results, int totalVotes) => LivePoll(
        question: question,
        options: options,
        myVote: myVote,
        results: results,
        totalVotes: totalVotes,
      );
}

/// نتيجة آخر نقاش قبل اليوم، بنسبه النهائية.
class LivePreviousPoll {
  final String? date;
  final String question;
  final List<LivePollResult> results;
  final int totalVotes;

  const LivePreviousPoll({
    this.date,
    required this.question,
    required this.results,
    required this.totalVotes,
  });

  factory LivePreviousPoll.fromJson(Map<String, dynamic> json) {
    final rawResults = json['results'];
    return LivePreviousPoll(
      date: _nullableString(json['date']),
      question: '${json['poll_question'] ?? ''}'.trim(),
      results: rawResults is List ? _resultsList(rawResults) : const [],
      totalVotes: _toInt(json['total_votes']) ?? 0,
    );
  }
}

/// سطر نتيجة واحد: الخيار وعدد أصواته ونسبته (محسوبة على الخادم).
class LivePollResult {
  final int index;
  final String label;
  final int votes;
  final int percentage;

  const LivePollResult({
    required this.index,
    required this.label,
    required this.votes,
    required this.percentage,
  });

  factory LivePollResult.fromJson(Map<String, dynamic> json) => LivePollResult(
        index: _toInt(json['index']) ?? 0,
        label: '${json['label'] ?? ''}',
        votes: _toInt(json['votes']) ?? 0,
        percentage: _toInt(json['percentage']) ?? 0,
      );
}

/// نتائج من قائمة JSON — تُستعمل أيضاً لحمولة قناة `live_poll_<id>`.
List<LivePollResult> parseLivePollResults(Object? raw) =>
    raw is List ? _resultsList(raw) : const [];

List<LivePollResult> _resultsList(List raw) => raw
    .whereType<Map>()
    .map((m) => LivePollResult.fromJson(Map<String, dynamic>.from(m)))
    .toList();

List<String> _stringList(Object? raw) {
  if (raw is! List) return const [];
  return raw.where((e) => e != null).map((e) => '$e').toList();
}

int? _toInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse('$value'.trim());
}

String? _nullableString(dynamic value) {
  if (value == null) return null;
  final text = '$value'.trim();
  return text.isEmpty ? null : text;
}
