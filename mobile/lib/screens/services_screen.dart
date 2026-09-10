import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../config.dart';
import '../main.dart';
import '../models/service.dart';
import '../theme.dart';
import '../widgets/async_view.dart' show showMessage;
import '../widgets/congratulations.dart' show openSignInGate;
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

  Future<void> _openSubmitService() async {
    final auth = AppServices.of(context).auth;
    if (!auth.isSignedIn) {
      await openSignInGate(context, 'سجّل الدخول لتقديم عرض خدمتك');
      return;
    }
    final categories = await (_categories ?? AppServices.of(context).api.serviceCategories());
    if (!mounted) return;
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _SubmitServiceSheet(categories: categories),
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
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 8),
            child: TextButton.icon(
              style: TextButton.styleFrom(
                backgroundColor: context.c.skyWash,
                foregroundColor: context.c.sky,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('قدّم عرضك', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
              onPressed: _openSubmitService,
            ),
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

/// شريط فئات أفقي أوّله «الكل» — رقائق اختيار بارتفاع ٤٢. كان يحاكي
/// `_OccasionTypeTabs` في `events_screen.dart`، وقد حلّت محلّها هناك رقاقة
/// تفتح ورقة بحث متعدّدة الاختيار (#85 دفعة ٨) لأنّ شريطين زاحفين كانا يأكلان
/// أعلى شاشة المناسبات. دليل الخدمات فيه شريط واحد لا شريطان، فالسبب لا ينطبق
/// عليه ولم يُغيَّر.
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
              if (provider.price != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: context.c.surfaceSunk,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: context.c.line),
                  ),
                  child: Text(
                    '${provider.price} ₪',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                      color: context.c.gold,
                    ),
                  ),
                ),
              ],
              const SizedBox(width: 4),
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

/// ورقة تقديم عرض خدمة جديد — يقدّمها صاحب الخدمة وتذهب لقيد المراجعة.
class _SubmitServiceSheet extends StatefulWidget {
  const _SubmitServiceSheet({required this.categories});

  final List<ServiceCategory> categories;

  @override
  State<_SubmitServiceSheet> createState() => _SubmitServiceSheetState();
}

class _SubmitServiceSheetState extends State<_SubmitServiceSheet> {
  final _formKey = GlobalKey<FormState>();
  int? _selectedCategoryId;
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _priceController = TextEditingController();
  final _descriptionController = TextEditingController();
  final Set<String> _selectedTowns = {};
  XFile? _pickedImage;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    if (widget.categories.isNotEmpty) {
      _selectedCategoryId = widget.categories.first.id;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _priceController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) {
      setState(() => _pickedImage = picked);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCategoryId == null) {
      showMessage(context, 'يرجى اختيار فئة الخدمة', isError: true);
      return;
    }
    if (_selectedTowns.isEmpty) {
      showMessage(context, 'يرجى اختيار بلدة واحدة على الأقل', isError: true);
      return;
    }

    final api = AppServices.of(context).api;
    setState(() => _submitting = true);
    try {
      http.MultipartFile? imageFile;
      if (_pickedImage != null) {
        final bytes = await _pickedImage!.readAsBytes();
        imageFile = http.MultipartFile.fromBytes(
          'image',
          bytes,
          filename: _pickedImage!.name,
        );
      }

      final priceVal = _priceController.text.trim();
      final price = priceVal.isNotEmpty ? num.tryParse(priceVal) : null;

      await api.submitProviderOffer(
            categoryId: _selectedCategoryId!,
            name: _nameController.text.trim(),
            phone: _phoneController.text.trim(),
            description: _descriptionController.text.trim(),
            price: price,
            towns: _selectedTowns.toList(),
            image: imageFile,
          );

      if (!mounted) return;
      showMessage(context, 'تم إرسال عرض الخدمة بنجاح، وهو قيد مراجعة الإدارة');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      showMessage(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.88,
        ),
        decoration: BoxDecoration(
          color: context.c.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.c.line,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'قدّم عرض خدمتك',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'سيظهر عرضك في دليل الخدمات بعد موافقة الإدارة',
                style: TextStyle(fontSize: 13, color: context.c.inkSoft),
              ),
              const SizedBox(height: 18),
              DropdownButtonFormField<int>(
                initialValue: _selectedCategoryId,
                decoration: const InputDecoration(
                  labelText: 'فئة الخدمة *',
                  border: OutlineInputBorder(),
                ),
                items: widget.categories
                    .map(
                      (c) => DropdownMenuItem(
                        value: c.id,
                        child: Text('${c.icon.isNotEmpty ? "${c.icon} " : ""}${c.name}'),
                      ),
                    )
                    .toList(),
                onChanged: (val) => setState(() => _selectedCategoryId = val),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'اسم الخدمة أو المزوّد *',
                  hintText: 'مثال: استوديو الأفراح، فرقة الدبكة...',
                  border: OutlineInputBorder(),
                ),
                validator: (val) =>
                    (val == null || val.trim().isEmpty) ? 'يرجى كتابة الاسم' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'رقم الهاتف للتواصل *',
                  hintText: '05XXXXXXXX',
                  border: OutlineInputBorder(),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return 'يرجى كتابة رقم الهاتف';
                  final clean = val.trim().replaceAll(RegExp(r'[\s-]'), '');
                  if (!RegExp(r'^0\d{8,9}$').hasMatch(clean)) {
                    return 'رقم الهاتف غير صالح';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _priceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'السعر التقريبي (₪) (اختياري)',
                  hintText: 'مثال: 500',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'البلدات التي تخدمها *',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: AppConfig.towns.map((town) {
                  final isSelected = _selectedTowns.contains(town);
                  return FilterChip(
                    label: Text(town),
                    selected: isSelected,
                    onSelected: (selected) {
                      setState(() {
                        if (selected) {
                          _selectedTowns.add(town);
                        } else {
                          _selectedTowns.remove(town);
                        }
                      });
                    },
                    backgroundColor: context.c.surfaceSunk,
                    selectedColor: context.c.skyWash,
                    checkmarkColor: context.c.sky,
                    labelStyle: TextStyle(
                      fontSize: 12.5,
                      color: isSelected ? context.c.sky : context.c.ink,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descriptionController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'تفاصيل وعرض الخدمة (اختياري)',
                  hintText: 'اكتب نبذة عن ما تقدمه وما يميز خدمتك...',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'صورة توضيحية للخدمة (اختياري)',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const SizedBox(height: 8),
              if (_pickedImage != null)
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: context.c.surfaceSunk,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle, color: Colors.green, size: 18),
                          const SizedBox(width: 6),
                          Text(
                            _pickedImage!.name,
                            style: TextStyle(fontSize: 12.5, color: context.c.ink),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.close, size: 16),
                            onPressed: () => setState(() => _pickedImage = null),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                          ),
                        ],
                      ),
                    ),
                  ],
                )
              else
                OutlinedButton.icon(
                  onPressed: _pickImage,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: const Text('اختيار صورة من المعرض'),
                ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: context.c.sky,
                    foregroundColor: context.c.onSky,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Text(
                          'إرسال العرض للمراجعة',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
