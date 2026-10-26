import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart' show ApiException;
import '../api/negev_api.dart';
import '../main.dart';
import '../models/album.dart';
import '../models/event.dart' show Pagination;
import '../state/auth_store.dart';
import '../state/share_album.dart';
import '../theme.dart';
import '../widgets/async_view.dart' show openExternalLink, showMessage;
import '../widgets/congratulations.dart' show openSignInGate;
import 'account_screen.dart';

/// «ألبومات الأعراس» — بحث واحد بثلاث مجموعات (ألبومات/صور/أشخاص)، ثم ألبوم،
/// ثم صورة مستقلة بوسومها. لا سقف للصور؛ الترقيم على الخادم.
class AlbumsScreen extends StatefulWidget {
  const AlbumsScreen({super.key});

  @override
  State<AlbumsScreen> createState() => _AlbumsScreenState();
}

class _AlbumsScreenState extends State<AlbumsScreen> {
  final TextEditingController _search = TextEditingController();
  Timer? _debounce;
  int _tab = 0;
  bool _loading = false;
  String? _error;
  List<EventAlbum> _albums = const [];
  AlbumSearchResults? _results;
  bool _started = false;

  /// `AppServices.of` قراءةٌ من جهة موروثة، و`initState` يسبق توافرها — فالنداء
  /// هناك يرمي في وضع التطوير ويترك الشاشة على حالة الخطأ دائماً. أوّل تحميل
  /// مكانه هنا، مرّة واحدة.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final query = _search.text.trim();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (query.isEmpty) {
        if (_tab == 0) {
          final data = await AppServices.of(context).api.albums(page: 1, limit: 30);
          if (!mounted) return;
          setState(() => _albums = data.albums);
        } else {
          if (mounted) setState(() => _albums = const []);
        }
      } else {
        final data = await AppServices.of(context).api.searchAlbums(query);
        if (!mounted) return;
        setState(() => _results = data);
      }
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) _load();
    });
    setState(() {});
  }

  void _setTab(int tab) {
    setState(() => _tab = tab);
    _load();
  }

  Future<void> _openMyPhotos() async {
    if (!AppServices.of(context).auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لترى الصور التي وسمت نفسك فيها');
      return;
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MyPhotosScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final query = _search.text.trim();
    final albums = query.isEmpty ? _albums : (_results?.albums ?? const <EventAlbum>[]);
    final photos = _results?.photos ?? const <EventPhoto>[];
    final people = _results?.people ?? const <PersonSearchResult>[];

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('ألبومات الأعراس'),
          actions: [
            IconButton(
              icon: const Icon(Icons.person_search),
              tooltip: 'صوري',
              onPressed: _openMyPhotos,
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
                child: TextField(
                  controller: _search,
                  onChanged: _onSearchChanged,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'ابحث باسم العرس، العشيرة، الشخص، أو وصف الصورة...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: query.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _search.clear();
                              _results = null;
                              _load();
                            },
                          ),
                    filled: true,
                    fillColor: c.surfaceSunk,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  children: [
                    _tabChip('ألبومات', 0, albums.length),
                    const SizedBox(width: 8),
                    _tabChip('صور', 1, photos.length),
                    const SizedBox(width: 8),
                    _tabChip('أشخاص', 2, people.length),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Expanded(child: _buildBody(c, query, albums, photos, people)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tabChip(String label, int index, int count) {
    final selected = _tab == index;
    return ChoiceChip(
      label: Text(count > 0 ? '$label ($count)' : label),
      selected: selected,
      onSelected: (_) => _setTab(index),
    );
  }

  Widget _buildBody(
    NegevPalette c,
    String query,
    List<EventAlbum> albums,
    List<EventPhoto> photos,
    List<PersonSearchResult> people,
  ) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return _Message(
        icon: Icons.cloud_off,
        title: 'تعذّر تحميل الألبومات',
        body: _error!,
        action: TextButton(onPressed: _load, child: const Text('إعادة المحاولة')),
      );
    }
    if (_tab == 0) {
      if (albums.isEmpty) {
        return _Message(
          icon: Icons.photo_library_outlined,
          title: query.isEmpty ? 'لا ألبومات ظاهرة بعد' : 'لا ألبومات تطابق بحثك',
          // الشروط مسمّاة كما هي في الخادم: الأربعة في publicAlbumConditions()
          // **وصورةٌ معتمدة واحدة** (PUBLIC_PHOTO_EXISTS) — ألبومٌ يمرّ بالأربعة
          // بلا صورة لا يظهر، فقولُ «أربعة» وحده يكذب. (تذكرة #101، القرار D1)
          body: query.isEmpty
              ? 'الألبوم يظهر بعد خمسة شروط: أن يكون منشوراً، وأن تكون المناسبة معتمدة، وأن يسمح نوعها بألبوم صور، وأن تكون المناسبة قد انتهت، وأن تحمل صورةً معتمدة واحدة على الأقل.'
              : 'جرّب كلمة واحدة من اسم العريس أو العشيرة أو البلدة.',
          action: query.isEmpty
              ? TextButton(
                  // `openFeed` تبديلُ تبويب لا رجوعٌ من المكدّس: تعمل حتى لو
                  // فُتحت الشاشة جذراً من رابط، حيث `pop` لا تفعل شيئاً.
                  onPressed: () {
                    AppServices.of(context).openFeed();
                    Navigator.of(context).maybePop();
                  },
                  child: const Text('تصفّح المناسبات'),
                )
              : null,
        );
      }
      return GridView.builder(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 28),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.78,
        ),
        itemCount: albums.length,
        itemBuilder: (context, index) {
          final album = albums[index];
          return _AlbumCard(
            album: album,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => AlbumDetailScreen(album: album)),
            ),
          );
        },
      );
    }
    if (_tab == 1) {
      if (query.isEmpty) {
        return const _Message(
          icon: Icons.search,
          title: 'ابحث لتظهر الصور',
          body: 'اكتب اسم العريس أو العشيرة أو وصف الصورة — أو اسم شخص لترى صوره.',
        );
      }
      if (photos.isEmpty) {
        return const _Message(
          icon: Icons.image_not_supported,
          title: 'لا صور تطابق بحثك',
          body: 'جرّب كلمة واحدة من الاسم أو الوصف.',
        );
      }
      return _PhotoGrid(photos: photos);
    }
    if (query.isEmpty) {
      return const _Message(
        icon: Icons.people_outline,
        title: 'ابحث باسم شخص',
        body: 'الأسماء تأتي من الوسوم التي وافق عليها صاحبها أو أضافها الأدمن.',
      );
    }
    if (people.isEmpty) {
      return const _Message(
        icon: Icons.person_off_outlined,
        title: 'لا أشخاص يطابقون بحثك',
        body: 'جرّب الاسم الأول أو لقب العائلة.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 28),
      itemCount: people.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final person = people[index];
        return ListTile(
          tileColor: c.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          leading: CircleAvatar(
            backgroundColor: c.skyWash,
            backgroundImage: person.sampleThumbUrl == null
                ? null
                : CachedNetworkImageProvider(person.sampleThumbUrl!),
            child: person.sampleThumbUrl == null
                ? Icon(Icons.person, color: c.sky)
                : null,
          ),
          title: Text(person.name),
          subtitle: Text('${person.photosCount} صورة'),
          trailing: const Icon(Icons.chevron_left),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PersonScreen(personId: person.id),
            ),
          ),
        );
      },
    );
  }
}

class _AlbumCard extends StatelessWidget {
  const _AlbumCard({required this.album, required this.onTap});

  final EventAlbum album;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final cover = album.coverThumbUrl ?? album.coverUrl;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: c.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: cover == null
                  ? ColoredBox(
                      color: c.surfaceSunk,
                      child: Icon(Icons.photo_library, color: c.sky, size: 36),
                    )
                  : CachedNetworkImage(
                      imageUrl: cover,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => ColoredBox(color: c.surfaceSunk),
                      errorWidget: (_, _, _) => ColoredBox(
                        color: c.surfaceSunk,
                        child: Icon(Icons.broken_image, color: c.inkFaint),
                      ),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(album.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  // بلا مناسبة: اسم العريس وبلدته مكان عنوان المناسبة وبلدتها —
                  // والسطر يغيب كلّياً حين لا معلومة بدل سطرٍ فارغ.
                  if (album.contextLine.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      album.contextLine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: c.inkFaint, fontSize: 11),
                    ),
                  ],
                  const SizedBox(height: 2),
                  Text('${album.photoCount} صورة', style: TextStyle(color: c.inkFaint, fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AlbumDetailScreen extends StatefulWidget {
  /// من كائن ألبوم جاهز (قائمة أو شريط في صفحة المناسبة).
  const AlbumDetailScreen({super.key, required this.album})
      : albumId = null,
        focusPhotoId = null;

  /// من معرّف وحده — رابط عميق `/a/<id>` أو `/p/<id>` (تذكرة #104)، حيث لا
  /// كائن ألبوم في اليد بل رقمٌ في الرابط.
  const AlbumDetailScreen.byId({
    super.key,
    required this.albumId,
    this.focusPhotoId,
  }) : album = null;

  final EventAlbum? album;
  final int? albumId;

  /// حين يقود الرابط إلى صورة بعينها: يُفتح عارضها على موضعها بعد التحميل،
  /// لا عارضٌ فيه `1 / 1` — صورةٌ يتيمة بلا سياق ليست تجربة.
  final int? focusPhotoId;

  int get id => album?.id ?? albumId!;

  @override
  State<AlbumDetailScreen> createState() => _AlbumDetailScreenState();
}

class _AlbumDetailScreenState extends State<AlbumDetailScreen> {
  EventAlbum? _album;
  List<EventPhoto> _photos = const [];
  /// فيديوهات الألبوم — صفحةٌ كاملة مع أوّل جلب، فـ`_loadMore` لا يمسّها.
  List<EventVideo> _videos = const [];
  Pagination? _pagination;
  bool _loading = true;
  String? _error;
  bool _loadingMore = false;
  bool _focused = false;

  bool _started = false;

  // كبقية الشاشات هنا: `AppServices.of` قراءةٌ من جهة موروثة، و`initState`
  // يسبق توافرها — فالنداء هناك يترك الشاشة على حالة الخطأ في وضع التطوير.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _load();
  }

  Future<void> _load() async {
    if (!_loading) {
      // إعادة المحاولة: امسح الخطأ وأظهر التحميل، وإلّا بقي نصّ الفشل القديم
      // ظاهراً أثناء محاولة جديدة تنجح.
      setState(() { _loading = true; _error = null; });
    }
    try {
      final data = await AppServices.of(context).api.albumDetails(widget.id);
      if (!mounted) return;
      setState(() {
        _album = data.album;
        _photos = data.photos;
        _videos = data.videos;
        _pagination = data.pagination;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() { _loading = false; _error = '$error'; });
      return;
    }
    // خارج `catch` الألبوم: فشلُ جلب صفحة إضافية للبحث عن الصورة المطلوبة
    // يجب ألّا يستبدل ألبوماً حُمّل بنجاح برسالة فشل.
    try {
      await _openFocusPhoto();
    } catch (_) {
      // الرابط قاد إلى صورة لم نجدها — الألبوم يبقى معروضاً من أعلاه.
    }
  }

  /// يفتح العارض على الصورة التي جاء الرابط من أجلها. أوّل تحميل يجلب ٢٤ صورة
  /// فقط، فرابطٌ لصورة في صفحة أبعد كان يفتح الألبوم من أعلاه؛ فنجلب الصفحات
  /// التالية حتى نجدها — بسقفٍ كي لا يصير رابط خاطئ حلقةً لا تنتهي.
  Future<void> _openFocusPhoto() async {
    final focus = widget.focusPhotoId;
    if (focus == null || _focused) return;
    // يُقفل قبل أي `await`: ضغطتان على «إعادة المحاولة» كانتا تدفعان العارض
    // مرّتين.
    _focused = true;
    var index = _photos.indexWhere((photo) => photo.id == focus);
    for (var attempt = 0; index < 0 && attempt < 10; attempt += 1) {
      final pagination = _pagination;
      if (pagination == null || !pagination.hasMore) break;
      final data = await AppServices.of(context).api.albumDetails(widget.id, page: pagination.page + 1);
      if (!mounted) return;
      setState(() {
        _photos = [..._photos, ...data.photos];
        _pagination = data.pagination;
      });
      index = _photos.indexWhere((photo) => photo.id == focus);
    }
    if (index < 0) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => PhotoViewerScreen(photos: _photos, initialIndex: index),
        ),
      );
    });
  }

  Future<void> _loadMore() async {
    final pagination = _pagination;
    if (pagination == null || !pagination.hasMore || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final data = await AppServices.of(context).api.albumDetails(widget.id, page: pagination.page + 1);
      if (!mounted) return;
      setState(() {
        _photos = [..._photos, ...data.photos];
        _pagination = data.pagination;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // بلا مناسبة: اسم العريس وبلدته مكان عنوان المناسبة وبلدتها وتاريخها —
    // والسطر لا يُرسم فارغاً حين لا معلومة (التخطيط نفسه في الحالتين).
    final info = _album?.detailLine ?? '';
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: Text(_album?.title ?? 'ألبوم عرس'),
          actions: [
            IconButton(
              key: const Key('album_share_btn'),
              icon: const Icon(Icons.share_outlined),
              tooltip: 'مشاركة',
              onPressed: _album == null ? null : () => shareAlbum(context, _album!),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _Message(
                    icon: Icons.cloud_off,
                    title: 'تعذّر تحميل الألبوم',
                    body: _error!,
                    action: TextButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                  )
                : Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                        child: Row(
                          children: [
                            if (info.isEmpty)
                              const Spacer()
                            else
                              Expanded(
                                child: Text(
                                  info,
                                  style: TextStyle(color: context.c.inkFaint, fontSize: 12),
                                ),
                              ),
                            Text('${_album?.photoCount ?? _photos.length} صورة',
                                style: TextStyle(color: context.c.inkFaint, fontSize: 12)),
                          ],
                        ),
                      ),
                      // الفيديوهات جزءٌ من الألبوم لا صفحةٌ ثانية: شريط أفقي
                      // واحد بين الرأس والشبكة، يُخفى كاملاً حين لا فيديو.
                      if (_videos.isNotEmpty)
                        SizedBox(
                          height: 150,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.fromLTRB(14, 0, 14, 0),
                            itemCount: _videos.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 10),
                            itemBuilder: (context, index) {
                              final video = _videos[index];
                              return _VideoCard(
                                key: Key('album_video_${video.id}'),
                                video: video,
                                albumTitle: _album?.title,
                                town: _album?.town,
                              );
                            },
                          ),
                        ),
                      Expanded(
                        child: _photos.isEmpty
                            ? const _Message(
                                icon: Icons.image_not_supported,
                                title: 'لا صور ظاهرة',
                                body: 'الألبوم موجود لكن لا صور معتمدة فيه بعد.',
                              )
                            : _PhotoGrid(
                                photos: _photos,
                                onTap: (index) => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => PhotoViewerScreen(photos: _photos, initialIndex: index),
                                  ),
                                ),
                              ),
                      ),
                      if (_pagination?.hasMore == true)
                        Padding(
                          padding: const EdgeInsets.all(10),
                          child: TextButton(
                            onPressed: _loadingMore ? null : _loadMore,
                            child: _loadingMore
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('عرض المزيد من الصور'),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}

class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({
    required this.photos,
    this.onTap,
    this.shrinkWrap = false,
    this.physics,
  });

  final List<EventPhoto> photos;
  final void Function(int index)? onTap;
  final bool shrinkWrap;
  final ScrollPhysics? physics;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GridView.builder(
      shrinkWrap: shrinkWrap,
      physics: physics,
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 28),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
      ),
      itemCount: photos.length,
      itemBuilder: (context, index) {
        final photo = photos[index];
        return InkWell(
          onTap: onTap == null
              ? () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PhotoViewerScreen(photos: photos, initialIndex: index),
                    ),
                  )
              : () => onTap!(index),
          child: Stack(
            fit: StackFit.expand,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CachedNetworkImage(
                  imageUrl: photo.displayImage,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => ColoredBox(color: c.surfaceSunk),
                  errorWidget: (_, _, _) => ColoredBox(
                    color: c.surfaceSunk,
                    child: Icon(Icons.broken_image, color: c.inkFaint),
                  ),
                ),
              ),
              if (photo.caption != null)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(6, 12, 6, 5),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black87],
                      ),
                    ),
                    child: Text(
                      photo.caption!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// بطاقة فيديو واحدة في شريط الألبوم: غلافٌ 16:9 وشارة تشغيل، عنوانٌ سطر واحد
/// ووسم المنصّة، وزرّ مشاركة صغير. النقر يفتح الفيديو في تطبيقه — التطبيق لا
/// يشغّل الفيديو بنفسه؛ والمشاركة تمرّ بصفحة `/v/:id` التي تغلّفه ببطاقة المنصّة.
class _VideoCard extends StatelessWidget {
  const _VideoCard({
    super.key,
    required this.video,
    this.albumTitle,
    this.town,
  });

  final EventVideo video;
  final String? albumTitle;
  final String? town;

  /// المخطّط يُفحص قبل التسليم إلى `launchUrl`: لا `javascript:`/`intent:` ولا
  /// رابط ناقص، والفشل — بالطريقتين، false ورمية — يُقال بالعربية.
  Future<void> _open(BuildContext context) async {
    final url = video.externalUrl;
    final uri = url == null ? null : Uri.tryParse(url);
    final isHttp = uri != null && (uri.scheme == 'http' || uri.scheme == 'https');
    if (!isHttp) {
      showMessage(context, 'تعذّر فتح الفيديو', isError: true);
      return;
    }
    await openExternalLink(context, uri, failureMessage: 'تعذّر فتح الفيديو');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final thumb = video.thumbUrl;
    return SizedBox(
      width: 192,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _open(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 192 × 9/16 — غلافٌ 16:9 بعرض ~200، كما في شبكة الصور.
            SizedBox(
              height: 108,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    // بلا مصغّرة: مربّع بأيقونة فيلم، لا رابط فارغ يُرسَل
                    // إلى الشبكة ثم يفشل مرّتين (الطلب والفشل).
                    child: thumb == null
                        ? ColoredBox(
                            color: c.surfaceSunk,
                            child: Icon(Icons.movie_outlined, color: c.inkFaint),
                          )
                        : CachedNetworkImage(
                            imageUrl: thumb,
                            fit: BoxFit.cover,
                            placeholder: (_, _) => ColoredBox(color: c.surfaceSunk),
                            errorWidget: (_, _, _) => ColoredBox(
                              color: c.surfaceSunk,
                              child: Icon(Icons.movie_outlined, color: c.inkFaint),
                            ),
                          ),
                  ),
                  Center(
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: const BoxDecoration(
                        color: Color(0x99000000),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          video.title ?? 'فيديو',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: c.ink,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          video.providerLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: c.inkFaint, fontSize: 10.5),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    key: Key('album_video_share_${video.id}'),
                    icon: Icon(Icons.share_outlined, size: 17, color: c.inkSoft),
                    tooltip: 'مشاركة',
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact,
                    constraints: const BoxConstraints.tightFor(width: 30, height: 30),
                    onPressed: () => shareVideo(
                      context,
                      video,
                      albumTitle: albumTitle,
                      town: town,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// صفحة الشخص (ADR-0011، تذكرة #106): اسمه وعدداه، مناسباته، ثم صوره.
/// تُفتح من بطاقة في تبويب «أشخاص» ومن رابط `/person/<id>` — وتقرأ من
/// `/api/people/:id` وحده، فلا تعرف العميلُ من ظاهر ولا تجمّع صوراً بالاسم.
class PersonScreen extends StatefulWidget {
  const PersonScreen({super.key, required this.personId});

  final int personId;

  @override
  State<PersonScreen> createState() => _PersonScreenState();
}

class _PersonScreenState extends State<PersonScreen> {
  Person? _person;
  List<EventPhoto> _photos = const [];
  List<EventAlbum> _albums = const [];
  List<PersonOccasion> _occasions = const [];
  Pagination? _pagination;
  bool _loading = true;
  String? _error;
  bool _loadingMore = false;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _load();
  }

  Future<void> _load() async {
    try {
      final person = await AppServices.of(context).api.person(widget.personId);
      if (!mounted) return;
      setState(() {
        _person = person;
        _photos = person.photos;
        _albums = person.albums;
        _occasions = person.events;
        _pagination = person.pagination;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() { _loading = false; _error = '$error'; });
    }
  }

  Future<void> _loadMore() async {
    final pagination = _pagination;
    if (pagination == null || !pagination.hasMore || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final person = await AppServices.of(context).api.person(
        widget.personId,
        page: pagination.page + 1,
      );
      if (!mounted) return;
      setState(() {
        _photos = [..._photos, ...person.photos];
        _pagination = person.pagination;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final person = _person;
    final c = context.c;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: Text(person?.name ?? 'شخص')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _Message(
                    icon: Icons.cloud_off,
                    title: 'تعذّر تحميل الشخص',
                    body: _error!,
                    action: TextButton(onPressed: _load, child: const Text('إعادة المحاولة')),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              person?.name ?? '',
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                            ),
                          ),
                          Text(
                            '${person?.photosCount ?? _photos.length} صورة · ${person?.albumsCount ?? _albums.length} مناسبة',
                            style: TextStyle(color: c.inkFaint, fontSize: 12),
                          ),
                        ],
                      ),
                      if (_albums.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        SizedBox(
                          height: 200,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _albums.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 10),
                            itemBuilder: (context, index) {
                              final album = _albums[index];
                              return SizedBox(
                                width: 150,
                                child: _AlbumCard(
                                  album: album,
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => AlbumDetailScreen(album: album)),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                      if (_albums.isEmpty && _occasions.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        // مناسبة ظاهرة بلا ألبوم منشور بعد: تُذكر هنا بدل صفحة
                        // فيها اسمٌ ورقمان ولا شيء تحتهما.
                        ..._occasions.map(
                          (occasion) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.celebration_outlined, color: c.sky),
                            title: Text(occasion.title ?? occasion.occasionTypeName ?? 'مناسبة'),
                            subtitle: Text(occasion.line),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      if (_photos.isEmpty)
                        const _Message(
                          icon: Icons.image_not_supported,
                          title: 'لا صور ظاهرة',
                          body: 'لم يُوسم هذا الاسم في صورة ظاهرة بعد.',
                        )
                      else
                        _PhotoGrid(
                          photos: _photos,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                        ),
                      if (_pagination?.hasMore == true)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: TextButton(
                            onPressed: _loadingMore ? null : _loadMore,
                            child: _loadingMore
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Text('عرض المزيد من الصور'),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}

class MyPhotosScreen extends StatefulWidget {
  const MyPhotosScreen({super.key});

  @override
  State<MyPhotosScreen> createState() => _MyPhotosScreenState();
}

class _MyPhotosScreenState extends State<MyPhotosScreen> {
  late Future<List<EventPhoto>> _future;

  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _future = _load();
  }

  Future<List<EventPhoto>> _load() async {
    final data = await AppServices.of(context).api.myPhotos(limit: 48);
    return data.photos;
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('صوري')),
        body: FutureBuilder<List<EventPhoto>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return _Message(icon: Icons.cloud_off, title: 'تعذّر تحميل صورك', body: '${snapshot.error}');
            }
            final photos = snapshot.data ?? const <EventPhoto>[];
            if (photos.isEmpty) {
              return const _Message(
                icon: Icons.photo_library_outlined,
                title: 'لا صور بعد',
                body: 'افتح صورة من الألبوم واضغط «أنا في الصورة»؛ تظهر هنا بعد موافقة الإدارة.',
              );
            }
            return _PhotoGrid(photos: photos);
          },
        ),
      ),
    );
  }
}

class PhotoViewerScreen extends StatefulWidget {
  const PhotoViewerScreen({super.key, required this.photos, required this.initialIndex});

  final List<EventPhoto> photos;
  final int initialIndex;

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  bool _busy = false;

  EventPhoto get _photo => widget.photos[_index];

  /// «أنا في الصورة» لا ترسل شيئاً بنفسها: تفتح ورقة تشرح الوسم وتذكّر
  /// بشرطَيه (صورة شخصية مرفوعة، ورقم يخصّ صاحب الحساب). الورقة وحدها ترسل،
  /// وتغلق نفسها بـ`true` عند النجاح — والرسالة هنا كي لا تختفي الورقة بلا خبر.
  Future<void> _tag() async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لتضع اسمك في الصورة');
      return;
    }
    final photoId = _photo.id;
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.c.surfaceSunk,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => _TagPhotoSheet(
        photoId: photoId,
        api: services.api,
        auth: services.auth,
      ),
    );
    if (!mounted || sent != true) return;
    showMessage(context, 'تم إرسال طلبك — يظهر اسمك بعد موافقة الإدارة');
  }

  Future<void> _withdraw() async {
    setState(() => _busy = true);
    try {
      await AppServices.of(context).api.withdrawPhotoTag(_photo.id);
      if (mounted) showMessage(context, 'تم سحب وسمك من الصورة');
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _report() async {
    final services = AppServices.of(context);
    if (!services.auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول للإبلاغ عن الصورة');
      return;
    }
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('سبب الإبلاغ'),
        children: [
          SimpleDialogOption(onPressed: () => Navigator.pop(dialogContext, 'privacy'), child: const Text('أنا في الصورة وأطلب مراجعتها')),
          SimpleDialogOption(onPressed: () => Navigator.pop(dialogContext, 'inappropriate'), child: const Text('محتوى غير لائق')),
          SimpleDialogOption(onPressed: () => Navigator.pop(dialogContext, 'wrong_event'), child: const Text('الصورة لمناسبة أخرى')),
          SimpleDialogOption(onPressed: () => Navigator.pop(dialogContext, 'other'), child: const Text('سبب آخر')),
        ],
      ),
    );
    if (reason == null) return;
    setState(() => _busy = true);
    try {
      await services.api.reportPhoto(_photo.id, reason: reason);
      if (mounted) showMessage(context, 'تم استلام بلاغك — ستراجعه الإدارة');
    } catch (error) {
      if (mounted) showMessage(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final photo = _photo;
    final signedIn = AppServices.of(context).auth.isSignedIn;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Text('${_index + 1} / ${widget.photos.length}'),
        ),
        body: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: widget.photos.length,
                onPageChanged: (value) => setState(() => _index = value),
                itemBuilder: (context, index) {
                  final item = widget.photos[index];
                  return InteractiveViewer(
                    child: Center(
                      child: CachedNetworkImage(
                        imageUrl: item.imageUrl,
                        fit: BoxFit.contain,
                        placeholder: (_, _) => const CircularProgressIndicator(color: Colors.white54),
                        errorWidget: (_, _, _) => const Icon(Icons.broken_image, color: Colors.white54, size: 48),
                      ),
                    ),
                  );
                },
              ),
            ),
            Container(
              width: double.infinity,
              color: Colors.black,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (photo.caption != null) ...[
                    Text(photo.caption!, textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                  ],
                  if (photo.tags.isNotEmpty)
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 6,
                      runSpacing: 4,
                      children: photo.tags
                          .map((tag) => Chip(
                                label: Text(tag.name),
                                backgroundColor: Colors.white24,
                                labelStyle: const TextStyle(color: Colors.white, fontSize: 11),
                              ))
                          .toList(),
                    ),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      FilledButton.icon(
                        onPressed: _busy ? null : _tag,
                        icon: const Icon(Icons.person_add_alt_1, size: 18),
                        label: const Text('أنا في الصورة'),
                      ),
                      OutlinedButton.icon(
                        key: const Key('photo_share_btn'),
                        onPressed: _busy ? null : () => sharePhoto(context, _photo),
                        icon: const Icon(Icons.share_outlined, size: 18),
                        label: const Text('مشاركة'),
                      ),
                      if (signedIn)
                        OutlinedButton(
                          onPressed: _busy ? null : _withdraw,
                          child: const Text('سحب وسطي'),
                        ),
                      OutlinedButton.icon(
                        onPressed: _busy ? null : _report,
                        icon: const Icon(Icons.flag_outlined, size: 18),
                        label: const Text('إبلاغ'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// ورقة «أنا في الصورة» — تشرح الوسم قبل إرساله بدل أن ترسل فوراً.
///
/// الوسم بشري بلا تعرّف وجوه آلي: المستخدم يقول «هذا أنا»، والإدارة توافق قبل
/// ظهور الاسم. والخادم يرفض الطلب ما لم يكن على الحساب صورة شخصية مرفوعة
/// (`avatar_url`) ولم يؤكّد المستخدم أن الرقم رقمه (`confirm_phone`) — فالشرطان
/// معروضان هنا قبل الإرسال، والزرّ معطّل دونهما.
///
/// النصّان اختياريان ويُرسَلان دائماً؛ فارغين يعني NULL على الخادم. وردّ 400
/// (أو أي خطأ خادم) يبقى في سطر الخطأ داخل الورقة كي يصحّح المستخدم ما ينقصه.
class _TagPhotoSheet extends StatefulWidget {
  const _TagPhotoSheet({
    required this.photoId,
    required this.api,
    required this.auth,
  });

  final int photoId;
  final NegevApi api;
  final AuthStore auth;

  @override
  State<_TagPhotoSheet> createState() => _TagPhotoSheetState();
}

class _TagPhotoSheetState extends State<_TagPhotoSheet> {
  final _selfDescription = TextEditingController();
  final _captionSuggestion = TextEditingController();
  bool _confirmPhone = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _selfDescription.dispose();
    _captionSuggestion.dispose();
    super.dispose();
  }

  bool get _hasAvatar => widget.auth.user?.avatarUrl != null;

  /// «ارفع صورتك الآن» و«عدّل رقمي»: تُغلق الورقة أولاً ثم تُفتح «حسابي» —
  /// الرفع في شاشة الحساب وحدها (هنا لا `image_picker`)، والورقة لا تعيش فوق
  /// شاشة أخرى لتُعاد قراءة `avatar_url` فيها. تُعاد فتحها بالحالة الجديدة.
  void _openAccount() {
    final navigator = Navigator.of(context);
    navigator.pop();
    navigator.push(
      MaterialPageRoute<void>(builder: (_) => const AccountScreen()),
    );
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.tagPhoto(
        widget.photoId,
        selfDescription: _selfDescription.text.trim(),
        captionSuggestion: _captionSuggestion.text.trim(),
        confirmPhone: true,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.auth.user;
    final hasAvatar = _hasAvatar;
    final canSubmit = hasAvatar && _confirmPhone && !_busy;
    final hintStyle = TextStyle(color: context.c.inkSoft, height: 1.6, fontSize: 13);

    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.only(
          left: 18,
          right: 18,
          top: 20,
          bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'أنا في الصورة',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'الوسم يربط الصورة بحسابك: اسمك يظهر تحتها، وتلقاها في «صوري». '
              'ما في تعرّف وجوه آلي — أنت اللي تقول «هذا أنا»، والإدارة توافق قبل الظهور.',
              style: hintStyle,
            ),
            const SizedBox(height: 12),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              children: [
                Text(
                  hasAvatar
                      ? '✅ صورتك الشخصية مرفوعة'
                      : '⚠️ لازم ترفع صورتك الشخصية أولاً',
                  key: const Key('tag_avatar_state'),
                  style: TextStyle(
                    color: hasAvatar ? context.c.ink : context.c.danger,
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),
                if (!hasAvatar)
                  TextButton(
                    key: const Key('tag_upload_avatar'),
                    onPressed: _openAccount,
                    child: const Text('ارفع صورتك الآن'),
                  ),
              ],
            ),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              children: [
                Text(
                  'رقمك الشخصي: ${user?.phoneNumber ?? '—'}',
                  key: const Key('tag_phone_state'),
                  style: TextStyle(
                    color: context.c.ink,
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),
                TextButton(
                  key: const Key('tag_edit_phone'),
                  onPressed: _openAccount,
                  child: const Text('عدّل رقمي'),
                ),
              ],
            ),
            Row(
              children: [
                Checkbox(
                  key: const Key('tag_confirm_phone'),
                  value: _confirmPhone,
                  onChanged: (value) =>
                      setState(() => _confirmPhone = value ?? false),
                ),
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _confirmPhone = !_confirmPhone),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        'نعم، هذا رقمي الشخصي',
                        style: TextStyle(color: context.c.ink, fontSize: 13.5),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'مين أنت في الصورة؟ (اختياري — يفيد الإدارة إن كان في الصورة أكثر من شخص)',
              style: hintStyle,
            ),
            const SizedBox(height: 6),
            TextField(
              key: const Key('tag_self_description'),
              controller: _selfDescription,
              maxLength: 200,
              minLines: 1,
              maxLines: 2,
              style: TextStyle(color: context.c.ink, fontSize: 13.5),
            ),
            const SizedBox(height: 6),
            Text(
              'وصف الصورة (اختياري — يصير وصفها بعد موافقة الإدارة)',
              style: hintStyle,
            ),
            const SizedBox(height: 6),
            TextField(
              key: const Key('tag_caption_suggestion'),
              controller: _captionSuggestion,
              maxLength: 200,
              minLines: 1,
              maxLines: 2,
              style: TextStyle(color: context.c.ink, fontSize: 13.5),
            ),
            if (_error != null && _error!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                _error!,
                key: const Key('tag_error'),
                style: TextStyle(
                  color: context.c.danger,
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            ],
            const SizedBox(height: 10),
            FilledButton(
              key: const Key('tag_submit'),
              onPressed: canSubmit ? _submit : null,
              child: Text(_busy ? 'جارٍ الإرسال…' : 'أرسل الطلب'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.title, required this.body, this.action});

  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 54, color: c.sky),
            const SizedBox(height: 10),
            Text(title, textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 6),
            Text(body, textAlign: TextAlign.center, style: TextStyle(color: c.inkFaint, height: 1.6)),
            if (action != null) ...[const SizedBox(height: 10), action!],
          ],
        ),
      ),
    );
  }
}
