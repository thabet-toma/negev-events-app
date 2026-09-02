import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../main.dart';
import '../models/service.dart';
import '../theme.dart';
import '../widgets/async_view.dart' show showMessage;
import 'service_provider_details_screen.dart';

/// دليل الخدمات — تاب عام، بلا حساب (story 18). شريط فئات أوّله «الكل» (نفس
/// نمط تبويبات نوع المناسبة في `events_screen.dart`)، وفلتر بلدة في الترويسة،
/// ثم قائمة مزوّدين مسطّحة مرتّبة أبجدياً (ترتيب الخادم نفسه، لا فرز هنا).
///
/// لا رقم ولا زرّ تواصل على أي صفّ — الخادم لا يرسل `phone` في هذه النقطة
/// إطلاقاً، فلا شيء يُخفى هنا، شيء لا يصل أصلاً. ولا تقييمات ولا نجوم —
/// غياب مقصود (#25).
class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key});

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  Future<List<ServiceCategory>>? _categories;

  int? _categoryId;
  String _town = 'الكل';

  List<ServiceProvider> _providers = const [];
  ServiceProvidersPagination? _pagination;
  bool _initialLoading = true;
  bool _loadingMore = false;
  Object? _error;
  bool _didInit = false;

  /// نفس نمط `events_screen.dart`: طلب فلتر جديد يُلغي أثر أيّ "عرض المزيد"
  /// كان قيد الانتظار لفلتر سابق.
  int _requestGeneration = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _categories ??= AppServices.of(context).api.serviceCategories();

    if (!_didInit) {
      _didInit = true;
      _loadFirstPage();
    }
  }

  Future<void> _loadFirstPage() async {
    final generation = ++_requestGeneration;
    setState(() {
      _initialLoading = true;
      _error = null;
      _loadingMore = false;
    });
    try {
      final result = await AppServices.of(context).api.serviceProviders(
            categoryId: _categoryId,
            town: _town,
            page: 1,
          );
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _providers = result.providers;
        _pagination = result.pagination;
        _initialLoading = false;
      });
    } catch (error) {
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _error = error;
        _initialLoading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final pagination = _pagination;
    if (pagination == null || !pagination.hasMore || _loadingMore) return;

    final generation = _requestGeneration;
    setState(() => _loadingMore = true);
    try {
      final result = await AppServices.of(context).api.serviceProviders(
            categoryId: _categoryId,
            town: _town,
            page: pagination.page + 1,
          );
      if (!mounted || generation != _requestGeneration) return;
      setState(() {
        _providers = [..._providers, ...result.providers];
        _pagination = result.pagination;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted || generation != _requestGeneration) return;
      setState(() => _loadingMore = false);
      showMessage(context, '$error', isError: true);
    }
  }

  void _onCategorySelected(int? id) {
    setState(() => _categoryId = id);
    _loadFirstPage();
  }

  void _onTownSelected(String town) {
    setState(() => _town = town);
    _loadFirstPage();
  }

  Future<void> _pickTown() async {
    final towns = ['الكل', ...AppConfig.towns];
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: context.c.surfaceSunk,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Text(
              'فلترة حسب البلدة',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: sheetContext.c.ink,
              ),
            ),
            const SizedBox(height: 6),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: towns
                    .map(
                      (town) => ListTile(
                        title: Text(town),
                        trailing: town == _town
                            ? Icon(Icons.check, color: sheetContext.c.sky)
                            : null,
                        onTap: () => Navigator.of(sheetContext).pop(town),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
    if (picked != null) _onTownSelected(picked);
  }

  Future<void> _openProvider(ServiceProvider provider) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ServiceProviderDetailsScreen(
          providerId: provider.id,
          initialName: provider.name,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('الخدمات'),
        actions: [
          IconButton(
            tooltip: 'فلترة حسب البلدة',
            icon: Badge(
              isLabelVisible: _town != 'الكل',
              smallSize: 8,
              child: const Icon(Icons.location_on_outlined),
            ),
            onPressed: _pickTown,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadFirstPage,
        child: Column(
          children: [
            FutureBuilder<List<ServiceCategory>>(
              future: _categories,
              builder: (context, snapshot) {
                final categories = snapshot.data ?? const <ServiceCategory>[];
                return _CategoryTabs(
                  categories: categories,
                  selectedId: _categoryId,
                  onSelected: _onCategorySelected,
                );
              },
            ),
            if (_town != 'الكل')
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Chip(
                    label: Text(_town),
                    onDeleted: () => _onTownSelected('الكل'),
                    deleteIcon: const Icon(Icons.close, size: 16),
                  ),
                ),
              ),
            const Divider(height: 1),
            Expanded(child: _buildList()),
          ],
        ),
      ),
    );
  }

  Widget _buildList() {
    if (_initialLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off, size: 46, color: context.c.inkFaint),
              const SizedBox(height: 14),
              Text(
                '$_error',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.c.inkSoft, height: 1.6),
              ),
              const SizedBox(height: 18),
              ElevatedButton.icon(
                onPressed: _loadFirstPage,
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة المحاولة'),
              ),
            ],
          ),
        ),
      );
    }

    if (_providers.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.handyman_outlined, size: 46, color: context.c.inkFaint),
              const SizedBox(height: 14),
              Text(
                'لا يوجد مزوّدو خدمات مطابقون حالياً',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.c.inkFaint, fontSize: 15),
              ),
            ],
          ),
        ),
      );
    }

    final hasMore = _pagination?.hasMore ?? false;
    final showFooter = hasMore || _loadingMore;
    final itemCount = _providers.length + (showFooter ? 1 : 0);

    return ListView.builder(
      padding: const EdgeInsets.only(top: 6, bottom: 20),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index < _providers.length) {
          final provider = _providers[index];
          return _ProviderTile(provider: provider, onTap: () => _openProvider(provider));
        }

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Center(
            child: _loadingMore
                ? const CircularProgressIndicator()
                : OutlinedButton(onPressed: _loadMore, child: const Text('عرض المزيد')),
          ),
        );
      },
    );
  }
}

/// شريط فئات أفقي أوّله «الكل» — نفس نمط `_OccasionTypeTabs` في
/// `events_screen.dart` بصرياً (رقائق اختيار، ٤٢ ارتفاعاً)، بلا مشاركة كودٍ
/// لأنّ ذاك خاص بأنواع المناسبات لا فئات الخدمات.
class _CategoryTabs extends StatelessWidget {
  const _CategoryTabs({
    required this.categories,
    required this.selectedId,
    required this.onSelected,
  });

  final List<ServiceCategory> categories;
  final int? selectedId;
  final ValueChanged<int?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        itemCount: categories.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          if (index == 0) {
            final isSelected = selectedId == null;
            return ChoiceChip(
              label: const Text('الكل'),
              selected: isSelected,
              onSelected: (_) => onSelected(null),
              showCheckmark: false,
              backgroundColor: context.c.surface,
              selectedColor: context.c.sky,
              labelStyle: TextStyle(
                fontSize: 13,
                color: isSelected ? context.c.onSky : context.c.inkSoft,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
              side: BorderSide(color: context.c.line),
            );
          }

          final category = categories[index - 1];
          final isSelected = selectedId == category.id;
          return ChoiceChip(
            label: Text(
              category.icon.isEmpty ? category.name : '${category.icon} ${category.name}',
            ),
            selected: isSelected,
            onSelected: (_) => onSelected(category.id),
            showCheckmark: false,
            backgroundColor: context.c.surface,
            selectedColor: context.c.sky,
            labelStyle: TextStyle(
              fontSize: 13,
              color: isSelected ? context.c.onSky : context.c.inkSoft,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
            side: BorderSide(color: context.c.line),
          );
        },
      ),
    );
  }
}

/// صفّ مزوّد في القائمة المسطّحة: الاسم · الفئة · البلدات · الصورة.
/// لا رقم ولا زرّ تواصل — لا في البيانات ولا في الواجهة.
class _ProviderTile extends StatelessWidget {
  const _ProviderTile({required this.provider, required this.onTap});

  final ServiceProvider provider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final townsText = provider.towns.join('، ');
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              _ProviderAvatar(imageUrl: provider.imageUrl),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      provider.name,
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.bold,
                        color: context.c.ink,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      townsText.isEmpty
                          ? provider.categoryName
                          : '${provider.categoryName} · $townsText',
                      style: TextStyle(fontSize: 12.5, color: context.c.inkSoft),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left, color: context.c.inkFaint),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProviderAvatar extends StatelessWidget {
  const _ProviderAvatar({this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    const size = 48.0;
    if (imageUrl == null || imageUrl!.isEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: context.c.skyWash,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(Icons.handyman_outlined, color: context.c.sky),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: CachedNetworkImage(
        imageUrl: imageUrl!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, _) => Container(width: size, height: size, color: context.c.surfaceSunk),
        errorWidget: (_, _, _) => Container(
          width: size,
          height: size,
          color: context.c.surfaceSunk,
          child: Icon(Icons.handyman_outlined, color: context.c.inkFaint),
        ),
      ),
    );
  }
}
