import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../main.dart';
import '../models/news.dart';
import '../theme.dart';
import '../widgets/async_view.dart' show ErrorView, openExternalLink, showMessage;
import '../widgets/event_card.dart' show arabicEventDate;
import '../widgets/region_banner.dart' show arabicCountUnit;

/// خبر واحد في القائمة — حدّ الصفحة نفسه الذي يطلبه الخادم (`limit=50`).
const int newsPageSize = 50;

/// الوقت النسبي بالعربية: «الآن»، «منذ ٥ دقائق»… الصيغ الثلاث للوحدة من
/// [arabicCountUnit] نفسها المستعملة في القصة ومنتقي المحافظات، لا نسخة رابعة
/// لقاعدة ٣–١٠.
String newsRelativeTime(DateTime? publishedAt, {DateTime? now}) {
  if (publishedAt == null) return '';
  final diff = (now ?? DateTime.now()).difference(publishedAt);
  // تاريخ في المستقبل (ساعة جهاز متأخّرة) لا يُقال «منذ -٣ دقائق».
  if (diff.inMinutes < 1) return 'الآن';
  if (diff.inMinutes < 60) {
    return _ago(diff.inMinutes, 'دقيقة', 'دقيقتين', 'دقائق');
  }
  if (diff.inHours < 24) {
    return _ago(diff.inHours, 'ساعة', 'ساعتين', 'ساعات');
  }
  if (diff.inDays == 1) return 'أمس';
  if (diff.inDays < 30) {
    return _ago(diff.inDays, 'يوم', 'يومين', 'أيام');
  }
  if (diff.inDays < 365) {
    return _ago(diff.inDays ~/ 30, 'شهر', 'شهرين', 'أشهر');
  }
  return _ago(diff.inDays ~/ 365, 'سنة', 'سنتين', 'سنوات');
}

String _ago(int count, String singular, String dual, String plural) {
  if (count <= 1) return 'منذ $singular';
  if (count == 2) return 'منذ $dual';
  final unit = arabicCountUnit(
    count,
    singular: singular,
    dual: dual,
    plural: plural,
  );
  return 'منذ $count $unit';
}

/// «آخر الأخبار» — تغذية أخبار محافظة المستخدم من منصة كترا الإخبارية.
///
/// المحافظة تُشتقّ على الخادم من `X-Region`؛ الشاشة تعرض اسمها في العنوان من
/// كتالوج المحافظات فوراً ثم من [NewsFeed.regionName] إن وصل.
///
/// الصفحة الأولى [newsPageSize] خبراً، و«المزيد» حين يقول الخادم `has_more`.
/// الحالة الفارغة تعرض زرّ «أخبار محلية عامة» يطلب `general=1` نفسه.
class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key});

  @override
  State<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends State<NewsScreen> {
  final List<NewsItem> _items = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = false;
  bool _general = false;
  Object? _error;
  String _regionName = '';
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    _regionName = _localRegionName();
    _load();
  }

  /// اسم المحافظة من الكتالوج المحلي قبل أي نداء — العنوان لا ينتظر الشبكة،
  /// ويُستبدل باسم الخادم إن اختلف.
  String _localRegionName() {
    final services = AppServices.of(context);
    final id = services.regions.effectiveRegionId;
    for (final region in services.regions.regions) {
      if (region.id == id) return region.name;
    }
    return '';
  }

  String get _title =>
      _regionName.isEmpty ? 'آخر الأخبار' : 'آخر الأخبار — $_regionName';

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _items.clear();
      _hasMore = false;
    });
    try {
      final feed = await AppServices.of(context).api.newsFeed(
            limit: newsPageSize,
            offset: 0,
            general: _general,
          );
      if (!mounted) return;
      setState(() {
        _items.addAll(feed.items);
        _hasMore = feed.hasMore;
        if (feed.regionName.isNotEmpty) _regionName = feed.regionName;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final feed = await AppServices.of(context).api.newsFeed(
            limit: newsPageSize,
            offset: _items.length,
            general: _general,
          );
      if (!mounted) return;
      setState(() {
        _items.addAll(feed.items);
        _hasMore = feed.hasMore;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      showMessage(context, '$error', isError: true);
    }
  }

  /// «أخبار محلية عامة» — نفس الشاشة بطلب `general=1`، والرجوع عن الأخبار
  /// المحافظة بطلب جديد لا بتعديل ما رُسم.
  void _showGeneral() {
    setState(() => _general = true);
    _load();
  }

  void _openItem(NewsItem item) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => NewsDetailsScreen(newsId: item.id, initial: item),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        actions: [
          // وسم «عامة» كما في هيدر الويب: يعلن أنّ الوجه المعروض أخبار محلية
          // عامة لا أخبار المحافظة، فلا يُقرأ العنوان على أنه محافظة أخرى.
          if (_general)
            Center(
              child: Container(
                key: const Key('news_general_tag'),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: context.c.skyWash,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'عامة',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: context.c.sky,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(onRefresh: _load, child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final error = _error;
    if (error != null) {
      return ErrorView(message: '$error', onRetry: _load);
    }

    if (_items.isEmpty) return _emptyState();

    final footer = _hasMore || _loadingMore;
    return ListView.builder(
      padding: const EdgeInsets.only(top: 6, bottom: 24),
      itemCount: _items.length + (footer ? 1 : 0),
      itemBuilder: (context, index) {
        if (index >= _items.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Center(
              child: _loadingMore
                  ? const CircularProgressIndicator()
                  : OutlinedButton(
                      onPressed: _loadMore,
                      child: const Text('المزيد'),
                    ),
            ),
          );
        }
        final item = _items[index];
        return _NewsCard(
          key: ValueKey('news_card_${item.id}'),
          item: item,
          onTap: () => _openItem(item),
        );
      },
    );
  }

  Widget _emptyState() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.newspaper_outlined,
              size: 48,
              color: context.c.inkFaint,
            ),
            const SizedBox(height: 14),
            Text(
              _general ? 'لا أخبار محلية بعد' : 'لا أخبار لمحافظتك بعد',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            if (!_general) ...[
              const SizedBox(height: 10),
              Text(
                'جرّب الأخبار المحلية العامة من كترا الإخبارية',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.c.inkSoft,
                  fontSize: 13,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 18),
              OutlinedButton.icon(
                key: const Key('news_general_button'),
                onPressed: _showGeneral,
                icon: const Icon(Icons.public, size: 18),
                label: const Text('أخبار محلية عامة'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// شارة «عاجل» — حمراء بنصّ يتبع الوضع، على الصورة أو فوق العنوان.
class _BreakingBadge extends StatelessWidget {
  const _BreakingBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.c.danger,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        'عاجل',
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.bold,
          color: context.c.onSky,
        ),
      ),
    );
  }
}

/// كرت خبر بنمط كروت المناسبات: صورة ١٦:٩ إن وُجدت، وشارة، وعنوان، وقسم،
/// ووقت نسبي. النقر على الكرت أو صورته يفتح التفاصيل.
class _NewsCard extends StatelessWidget {
  const _NewsCard({super.key, required this.item, required this.onTap});

  final NewsItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final image = item.image;
    final category = item.category?.name ?? '';
    final when = newsRelativeTime(item.publishedAt);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: cardGold.withValues(alpha: 0.35),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (image != null)
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      CachedNetworkImage(
                        imageUrl: image,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => Container(
                          color: context.c.surfaceSunk,
                          child: const Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                        errorWidget: (_, _, _) => Container(
                          color: context.c.surfaceSunk,
                          child: Icon(
                            Icons.image_not_supported_outlined,
                            color: context.c.inkFaint,
                          ),
                        ),
                      ),
                      if (item.isBreaking)
                        const Positioned(
                          top: 10,
                          right: 10,
                          child: _BreakingBadge(),
                        ),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (item.isBreaking && image == null) ...[
                      const _BreakingBadge(),
                      const SizedBox(height: 8),
                    ],
                    Text(
                      item.title,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: context.c.ink,
                        height: 1.35,
                      ),
                    ),
                    if (item.excerpt.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        item.excerpt,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: context.c.inkSoft,
                          height: 1.5,
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (category.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: context.c.skyWash,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              category,
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: context.c.sky,
                              ),
                            ),
                          ),
                        if (category.isNotEmpty && when.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            child: Text(
                              '·',
                              style: TextStyle(color: context.c.inkFaint),
                            ),
                          ),
                        if (when.isNotEmpty)
                          Text(
                            when,
                            style: TextStyle(
                              fontSize: 11.5,
                              color: context.c.inkFaint,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// تفاصيل خبر: صورة، عنوان، تاريخ، قسم، النصّ فقرات، مصدره، وزرّ فتحه على
/// منصة كترا. [initial] يصل من الكرت كي تُرسم الصورة والعنوان فوراً، والنصّ
/// الكامل يصل من `GET /api/news/:id`.
class NewsDetailsScreen extends StatefulWidget {
  const NewsDetailsScreen({super.key, required this.newsId, this.initial});

  final int newsId;
  final NewsItem? initial;

  @override
  State<NewsDetailsScreen> createState() => _NewsDetailsScreenState();
}

class _NewsDetailsScreenState extends State<NewsDetailsScreen> {
  NewsItem? _item;
  Object? _error;
  bool _loading = true;
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    _item = widget.initial;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      if (_item == null) _loading = true;
    });
    try {
      final item = await AppServices.of(context).api.newsItem(widget.newsId);
      if (!mounted) return;
      setState(() {
        _item = item;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الخبر')),
      body: _loading && item == null
          ? const Center(child: CircularProgressIndicator())
          : item == null
              ? ErrorView(
                  message: '${_error ?? 'تعذّر جلب الخبر'}',
                  onRetry: _load,
                )
              : _content(item),
    );
  }

  Widget _content(NewsItem item) {
    final image = item.image;
    final category = item.category?.name ?? '';
    final url = item.url;
    final publishedAt = item.publishedAt;
    final body = item.bodyText ?? item.excerpt;
    final paragraphs = body
        .split('\n')
        .map((paragraph) => paragraph.trim())
        .where((paragraph) => paragraph.isNotEmpty)
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 30),
      children: [
        if (image != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: CachedNetworkImage(
                imageUrl: image,
                fit: BoxFit.cover,
                placeholder: (_, _) => Container(color: context.c.surfaceSunk),
                errorWidget: (_, _, _) => Container(
                  color: context.c.surfaceSunk,
                  child: Icon(
                    Icons.image_not_supported_outlined,
                    color: context.c.inkFaint,
                  ),
                ),
              ),
            ),
          ),
        if (image != null) const SizedBox(height: 14),
        if (item.isBreaking) ...[
          const Align(alignment: AlignmentDirectional.centerStart, child: _BreakingBadge()),
          const SizedBox(height: 10),
        ],
        Text(
          item.title,
          style: TextStyle(
            fontSize: 21,
            fontWeight: FontWeight.bold,
            color: context.c.ink,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (category.isNotEmpty)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: context.c.skyWash,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  category,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: context.c.sky,
                  ),
                ),
              ),
            if (publishedAt != null)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.schedule,
                    size: 15,
                    color: context.c.inkFaint,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    arabicEventDate(publishedAt.toIso8601String()),
                    style: TextStyle(
                      fontSize: 12.5,
                      color: context.c.inkSoft,
                    ),
                  ),
                ],
              ),
          ],
        ),
        Divider(height: 26, color: context.c.line),
        for (final paragraph in paragraphs)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              paragraph,
              style: TextStyle(
                fontSize: 15,
                height: 1.85,
                color: context.c.ink,
              ),
            ),
          ),
        const SizedBox(height: 6),
        Text(
          'من منصة كترا الإخبارية',
          style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
        ),
        const SizedBox(height: 18),
        ElevatedButton.icon(
          key: const Key('news_open_on_ktra'),
          onPressed: url == null
              ? null
              : () => openExternalLink(
                    context,
                    Uri.parse(url),
                    failureMessage: 'تعذّر فتح الخبر على منصة كترا',
                  ),
          icon: const Icon(Icons.open_in_new, size: 18),
          label: const Text('افتح على كترا'),
        ),
      ],
    );
  }
}
