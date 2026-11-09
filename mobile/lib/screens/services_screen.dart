import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../models/service.dart';
import '../theme.dart';
import '../widgets/async_view.dart' show showMessage;
import '../widgets/auth_action_button.dart';
import '../widgets/congratulations.dart' show openSignInGate;
import 'service_provider_details_screen.dart';

/// يفتح ورقة تقديم عرض الخدمة — **التعريف الوحيد** لفتحها: زرّ «قدّم عرضك»
/// في هذه الشاشة، وزرّ «أضف خدمتك» فوق الشريط السفلي في `HomeShell`، كلاهما
/// يمرّ من هنا. حارس الحساب (`openSignInGate`) والفئات داخل الورقة نفسها، فلا
/// نسخة ثانية من النموذج ولا من الحارس في ملف آخر.
///
/// [categories] تسمح لصاحب الشاشة بتمرير الفئات المجلوبة مسبقاً بدل طلب جديد،
/// وغيابها (من الشريط) يعني جلبها الآن.
Future<void> openSubmitServiceSheet(
  BuildContext context, {
  Future<List<ServiceCategory>>? categories,
}) async {
  final services = AppServices.of(context);
  if (!services.auth.isSignedIn) {
    await openSignInGate(context, 'سجّل الدخول لتقديم عرض خدمتك');
    return;
  }
  final list = await (categories ?? services.api.serviceCategories());
  if (!context.mounted) return;
  await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheetContext) => _SubmitServiceSheet(categories: list),
  );
}

/// دليل الخدمات — كروت فاخرة بمواصفات وحزم تقديرية استرشادية،
/// وبحث فوري وتواصل مباشر عبر الواتساب والاتصال.
class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key});

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  Future<List<ServiceCategory>>? _categories;

  int? _categoryId;
  String _town = 'الكل';
  final _searchController = TextEditingController();
  String _searchQuery = '';
  Timer? _searchDebounce;

  List<ServiceProvider> _providers = const [];
  ServiceProvidersPagination? _pagination;
  bool _initialLoading = true;
  bool _loadingMore = false;
  Object? _error;
  bool _didInit = false;

  /// شكل العرض كما يحسمه الخادم (`providers_display`، تذكرة #158): `cards`
  /// وحدها تبدّل التخطيط، وما عداها — ومنها الحالة قبل وصول الإعداد — صفوف
  /// مختصرة. الخادم يحسم الغياب والقيمة غير المعروفة، والعميل يقرأ ما يصل
  /// ويقبل `cards` وحدها: لا تخطيط ثالث هنا ولا إعادة حسم مكان الخادم.
  bool _cardsMode = false;

  /// نفس نمط `events_screen.dart`: طلب فلتر جديد يُلغي أثر أيّ "عرض المزيد"
  /// كان قيد الانتظار لفلتر سابق.
  int _requestGeneration = 0;

  @override
  void dispose() {
    _searchController.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _categories ??= AppServices.of(context).api.serviceCategories();

    if (!_didInit) {
      _didInit = true;
      _loadDisplayMode();
      _loadFirstPage();
    }
  }

  /// يقرأ `providers_display` من `GET /api/settings/public` — القيمة الفعّالة
  /// يحسمها الخادم وحده (`RESOLVED_KEYS`)، والعميل لا يكتب افتراضاً: `cards`
  /// وحدها تبدّل الشكل، وأي قيمة أخرى تبقى صفوفاً مختصرة. لا شيء يصل (انقطاع
  /// أو خادم أقدم) يترك الشكل الحالي كما هو، فلا يعود إلى `cards` بعد أن جاء.
  Future<void> _loadDisplayMode() async {
    final mode = await AppServices.of(context).api.providersDisplayMode();
    if (!mounted || mode == null) return;
    setState(() => _cardsMode = mode == 'cards');
  }

  /// سحب للتحديث: يعيد قراءة الإعداد أيضاً، فتبديل السوبر أدمن للشكل يصل
  /// بلا إغلاق الشاشة.
  Future<void> _refresh() async {
    await _loadDisplayMode();
    await _loadFirstPage();
  }

  void _onSearchChanged(String val) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() => _searchQuery = val.trim());
      _loadFirstPage();
    });
  }

  void _clearSearch() {
    _searchController.clear();
    _searchDebounce?.cancel();
    setState(() => _searchQuery = '');
    _loadFirstPage();
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
            search: _searchQuery.isNotEmpty ? _searchQuery : null,
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
            search: _searchQuery.isNotEmpty ? _searchQuery : null,
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
    final towns = ['الكل', ...AppServices.of(context).places.catalog.towns];
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

  Future<void> _openSubmitService() => openSubmitServiceSheet(
        context,
        categories: _categories,
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // بلا `AppBar`: الشريط العلوي واحد في الهيكل (`_brandBar` في `HomeShell`)
      // فوق الوجهات الثلاث، فشريطان فوق بعضهما على هذه الوجهة عيبٌ لا تصميم
      // (#157). ووظائفه الثلاث لم تُفقد: العنوان ومنتقي البلدة و«حسابي» و«قدّم
      // عرضك» — صفٌّ واحد أوّل الجسم مكانها.
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          key: const Key('services_scroll'),
          // دائماً قابل للتمرير كي يعمل السحب للتحديث في الحالات الفارغة أيضاً.
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // رأس الوجهة (العنوان والبحث والفئات) صار داخل التمرير لا فوقه:
            // كان مثبّتاً يأكل ~165px من ارتفاع القائمة فلا يظهر على الهاتف
            // إلا ثلاثة صفوف. وظائفه ومحتواه كما هما، والشريط العلوي وشريط
            // التنقّل يبقيان في `HomeShell` (#157).
            SliverToBoxAdapter(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsetsDirectional.fromSTEB(14, 8, 8, 0),
                    child: Row(
                      children: [
                        // `Expanded` + `ellipsis`: على هاتف ضيّق يقصر العنوان ولا
                        // يفيض الصفّ — الأدوات الثلاث تبقى بمقاسها.
                        Expanded(
                          child: Text(
                            'خدمات الأعراس',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                              color: context.c.ink,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'فلترة حسب البلدة',
                          icon: Badge(
                            isLabelVisible: _town != 'الكل',
                            smallSize: 8,
                            child: const Icon(Icons.location_on_outlined),
                          ),
                          onPressed: _pickTown,
                        ),
                        // الصفّ مزدحم أصلاً بزرّ «قدّم عرضك» — أيقونة وحدها تكفي هنا.
                        const AuthActionButton(compact: true),
                        Padding(
                          padding: const EdgeInsetsDirectional.only(end: 6),
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
                  ),
                  // شريط البحث الفوري
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 6),
                    child: TextField(
                      controller: _searchController,
                      onChanged: _onSearchChanged,
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: 'ابحث باسم الخدمة، المزوّد، أو المواصفات...',
                        hintStyle: TextStyle(fontSize: 13, color: context.c.inkFaint),
                        prefixIcon: Icon(Icons.search, size: 20, color: context.c.inkFaint),
                        suffixIcon: _searchController.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.close, size: 18),
                                onPressed: _clearSearch,
                              )
                            : null,
                        filled: true,
                        fillColor: context.c.surfaceSunk,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: context.c.line),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: context.c.line),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: context.c.gold, width: 1.5),
                        ),
                      ),
                    ),
                  ),
                  // شريط فئات الخدمات
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
                  // مؤشر الفلاتر الفعّالة
                  if (_town != 'الكل' || _searchQuery.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
                      child: Row(
                        children: [
                          if (_town != 'الكل') ...[
                            Chip(
                              label: Text(_town, style: const TextStyle(fontSize: 12)),
                              onDeleted: () => _onTownSelected('الكل'),
                              deleteIcon: const Icon(Icons.close, size: 14),
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                            const SizedBox(width: 6),
                          ],
                          if (_searchQuery.isNotEmpty) ...[
                            Chip(
                              label: Text('بحث: "$_searchQuery"', style: const TextStyle(fontSize: 12)),
                              onDeleted: _clearSearch,
                              deleteIcon: const Icon(Icons.close, size: 14),
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                          ],
                        ],
                      ),
                    ),
                  const Divider(height: 1),
                ],
              ),
            ),
            _buildListSliver(),
          ],
        ),
      ),
    );
  }

  Widget _buildListSliver() {
    if (_initialLoading) {
      return const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
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
        ),
      );
    }

    if (_providers.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.handyman_outlined, size: 46, color: context.c.inkFaint),
                const SizedBox(height: 14),
                Text(
                  'لا توجد خدمات مطابقة حالياً',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.c.inkFaint, fontSize: 15),
                ),
                if (_searchQuery.isNotEmpty || _town != 'الكل' || _categoryId != null) ...[
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () {
                      _clearSearch();
                      _onTownSelected('الكل');
                      _onCategorySelected(null);
                    },
                    child: const Text('مسح جميع الفلاتر'),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    final hasMore = _pagination?.hasMore ?? false;
    final showFooter = hasMore || _loadingMore;
    final itemCount = _providers.length + (showFooter ? 1 : 0);

    return SliverPadding(
      padding: const EdgeInsets.only(top: 6, bottom: 20),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            if (index < _providers.length) {
              final provider = _providers[index];
              // الشكل يقرّره إعداد المنصة (تذكرة #158): الصفّ المختصر أربعة إلى
              // خمسة مزوّدين في الشاشة، والكرت الكبير هو ما كان قبلها.
              if (_cardsMode) {
                return _LuxuryServiceCard(
                  provider: provider,
                  onTap: () => _openProvider(provider),
                );
              }
              return _CompactServiceRow(
                provider: provider,
                onDetails: () => _openProvider(provider),
              );
            }

            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: _loadingMore
                    ? const CircularProgressIndicator()
                    : OutlinedButton(onPressed: _loadMore, child: const Text('عرض المزيد من الخدمات')),
              ),
            );
          },
          childCount: itemCount,
        ),
      ),
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

Color _parseColor(String? hex, Color fallback) {
  if (hex == null || hex.isEmpty) return fallback;
  var value = hex.trim();
  if (value.startsWith('#')) value = value.substring(1);
  if (value.length == 6) value = 'FF$value';
  if (value.length != 8) return fallback;
  final parsed = int.tryParse(value, radix: 16);
  return parsed == null ? fallback : Color(parsed);
}

/// شارة السعر — واحدة للصفّ المختصر والكرت الكبير، فلا تسميتان لسعر واحد.
String _providerPriceBadgeText(ServiceProvider provider) =>
    provider.displayPriceBadge ?? 'سعر تقديري';

/// لون فئة المزوّد نفسه في الشكلين (`compact` و`cards`)، فلا يختلف لون
/// الشارة بينهما.
Color _providerTone(BuildContext context, ServiceProvider provider) =>
    _parseColor(provider.categoryColor, context.c.gold);

/// عدّاد واحد (👁 المشاهدات أو ♥ المفضّلة) في الصفّ المختصر والكرت الكبير
/// (تذكرة #185): الرقم من `views_count`/`favorites_count` التي يعيدها الخادم
/// مع بطاقة القائمة — لا عدّ ولا زيادة في العميل، والصفر يُعرض «0» لا فراغاً.
/// والرقم وحده في `Text` مفتاحُه يقرأه الاختبار، على نمط `provider_views_count`
/// في صفحة المزوّد. الشكل نفسه في «مزوّدون محفوظون» (`my_list_screen.dart`).
///
/// و`valueText` (تذكرة #186) للعدّاد الذي ليس عدداً صحيحاً: ★ «4.5 (12)» —
/// المتوسط والعدد في نصّ واحد. بقية العدّادات تبقى `value` كما هي.
Widget _providerStat({
  required Key valueKey,
  required String icon,
  required int value,
  required Color color,
  double fontSize = 15,
  String? valueText,
}) {
  return Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        icon,
        style: TextStyle(fontSize: fontSize, color: color, height: 1.1),
      ),
      const SizedBox(width: 4),
      Text(
        valueText ?? '$value',
        key: valueKey,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          color: color,
          height: 1.1,
        ),
      ),
    ],
  );
}

/// ورقة التواصل الواحدة — يفتحها الصفّ المختصر والكرت الكبير معاً (تذكرة #158)،
/// فلا نسخة ثانية من بناء رابط واتساب ولا من صيغة الرقم الدولي في الشاشة.
///
/// الرقم لا يُخزَّن في الشاشة ولا يأتي مع القائمة: يُجلب من
/// `GET /api/services/providers/:id` — الموضع الوحيد الذي يحمله — لحظة طلب
/// التواصل الصريح. `knownPhone` يتيح لمن يملك الرقم مسبقاً تفادي نداء ثانٍ،
/// والقيمة المُعادة هي الرقم المعروف بعد النداء كي يخزّنه من يملكه؛ `null`
/// يعني أن الجلب فشل (وقد قيل ذلك للمستخدم برسالة عربية).
/// `onPhoneResolved` يُنادى بعد انتهاء الجلب وقبل عرض الورقة: الكرت الكبير
/// يرفع به مؤشّر التحميل فلا يبقى يدور ما دامت الورقة مفتوحة (سلوكه قبل
/// استخراج الورقة المشتركة).
Future<String?> showProviderContactSheet(
  BuildContext context,
  ServiceProvider provider, {
  String? knownPhone,
  VoidCallback? onPhoneResolved,
}) async {
  var phone = knownPhone ?? '';
  if (phone.isEmpty) {
    try {
      phone = (await AppServices.of(context).api.serviceProviderDetails(provider.id)).phone;
    } catch (e) {
      if (context.mounted) {
        showMessage(context, 'تعذّر جلب رقم التواصل: $e', isError: true);
      }
      onPhoneResolved?.call();
      return null;
    }
  }
  onPhoneResolved?.call();

  if (!context.mounted) return phone;
  if (phone.isEmpty) return phone;

  var cleanPhone = phone.replaceAll(RegExp(r'[^\d+]'), '');
  if (cleanPhone.startsWith('05')) {
    cleanPhone = '972${cleanPhone.substring(1)}';
  } else if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.substring(1);
  }

  final greeting = Uri.encodeComponent(
    'مرحباً ${provider.name}، استفسار بخصوص خدمتك (${provider.categoryName}) عبر تطبيق أعراسنا:',
  );
  final whatsappUrl = Uri.parse('https://wa.me/$cleanPhone?text=$greeting');
  final telUri = Uri(scheme: 'tel', path: phone);

  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.c.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: sheetContext.c.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'تواصل مع ${provider.name}',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: sheetContext.c.ink,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              provider.categoryName,
              style: TextStyle(
                fontSize: 13,
                color: sheetContext.c.inkSoft,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF25D366),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              icon: const Icon(Icons.chat, size: 20),
              label: const Text(
                'واتساب مباشر',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
              onPressed: () {
                Navigator.of(sheetContext).pop();
                launchUrl(whatsappUrl, mode: LaunchMode.externalApplication);
              },
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: sheetContext.c.line),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: Icon(Icons.phone, size: 20, color: sheetContext.c.ink),
              label: Text(
                'اتصال هاتفي ($phone)',
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold, color: sheetContext.c.ink),
              ),
              onPressed: () {
                Navigator.of(sheetContext).pop();
                launchUrl(telUri);
              },
            ),
          ],
        ),
      ),
    ),
  );

  return phone;
}

/// بطاقة خدمة فاخرة مطابقة لكرت مناسبات المنصة مع الحزم والمواصفات الاسترشادية
class _LuxuryServiceCard extends StatefulWidget {
  const _LuxuryServiceCard({
    required this.provider,
    required this.onTap,
  });

  final ServiceProvider provider;
  final VoidCallback onTap;

  @override
  State<_LuxuryServiceCard> createState() => _LuxuryServiceCardState();
}

class _LuxuryServiceCardState extends State<_LuxuryServiceCard> {
  bool _isExpanded = false;
  bool _loadingContact = false;
  String? _phone;

  Future<void> _revealContactSheet() async {
    final known = _phone;
    if (known == null || known.isEmpty) {
      setState(() => _loadingContact = true);
    }
    final phone = await showProviderContactSheet(
      context,
      widget.provider,
      knownPhone: known,
      // المؤشّر يُرفع بعد الجلب وقبل عرض الورقة، كما كان قبل استخراجها: لا
      // يبقى يدور ما دامت الورقة مفتوحة.
      onPhoneResolved: () {
        if (mounted && _loadingContact) {
          setState(() => _loadingContact = false);
        }
      },
    );
    if (!mounted) return;
    // الرقم المجلوب يُحفظ للضغطة التالية، والورقة نفسها لا تعيده نصّاً هنا.
    if (phone != null && phone.isNotEmpty) setState(() => _phone = phone);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.provider;
    final toneColor = _providerTone(context, p);
    // «جميع بلدات منطقتك» ادّعاءٌ لا يُقال بلا بيانات (تذكرة #127): القائمة
    // الطويلة وحدها تبرّره، والفارغة تقول الحقيقة — لا تُنسب إليه بلدة.
    final townsText = p.towns.isEmpty
        ? 'مناطق الخدمة غير محدَّدة'
        : (p.towns.length > 4 ? 'يخدم جميع بلدات منطقتك' : 'يخدم: ${p.towns.join('، ')}');

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Media Area with Floating Badges
          GestureDetector(
            onTap: widget.onTap,
            child: SizedBox(
              height: 220,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (p.imageUrl != null && p.imageUrl!.isNotEmpty)
                    CachedNetworkImage(
                      imageUrl: p.imageUrl!,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => Container(
                        color: context.c.surfaceSunk,
                        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      ),
                      errorWidget: (_, _, _) => _buildPlaceholderMedia(p, toneColor),
                    )
                  else
                    _buildPlaceholderMedia(p, toneColor),

                  // Top Floating Badges
                  Positioned(
                    top: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: toneColor,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (p.categoryIcon.isNotEmpty) ...[
                            Text(p.categoryIcon, style: const TextStyle(fontSize: 12)),
                            const SizedBox(width: 4),
                          ],
                          Text(
                            p.categoryName,
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    top: 10,
                    left: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFFFE082), Color(0xFFFFB300)],
                        ),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.15),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.sell, size: 12, color: Color(0xFF222222)),
                          const SizedBox(width: 4),
                          Text(
                            p.price != null ? '${p.price} ₪ (${_providerPriceBadgeText(p)})' : _providerPriceBadgeText(p),
                            style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF111111),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 2. Card Caption
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                InkWell(
                  onTap: widget.onTap,
                  child: Text(
                    p.name,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: context.c.ink,
                      height: 1.25,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: cardGold.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border(
                      right: BorderSide(color: cardGold, width: 3.5),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${_providerPriceBadgeText(p)}: ',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.c.inkSoft),
                      ),
                      Text(
                        p.price != null ? '${p.price} ₪' : 'حسب الطلب',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          color: cardGold,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Icon(Icons.location_on, size: 14, color: toneColor),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        townsText,
                        style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                // عدّادا 👁/♥ (تذكرة #185): القيمة التي جاءت مع بطاقة القائمة
                // من الخادم، لا حساب محلي ولا رقم يخمّنه العميل.
                Row(
                  children: [
                    _providerStat(
                      valueKey: Key('service_card_views_${p.id}'),
                      icon: '👁',
                      value: p.viewsCount,
                      color: context.c.inkFaint,
                      fontSize: 13,
                    ),
                    const SizedBox(width: 14),
                    _providerStat(
                      valueKey: Key('service_card_favorites_${p.id}'),
                      icon: '♥',
                      value: p.favoritesCount,
                      color: context.c.inkFaint,
                      fontSize: 13,
                    ),
                    // ★ المتوسط (العدد) — تذكرة #186. لا نجمة بلا تقييمات.
                    if (p.ratingCount > 0 && p.ratingAvg != null) ...[
                      const SizedBox(width: 14),
                      _providerStat(
                        valueKey: Key('service_card_rating_${p.id}'),
                        icon: '★',
                        value: p.ratingCount,
                        valueText:
                            '${p.ratingAvg!.toStringAsFixed(1)} (${p.ratingCount})',
                        color: context.c.inkFaint,
                        fontSize: 13,
                      ),
                    ],
                  ],
                ),

                // Benchmark Package Banner
                if (p.priceEstimateDesc != null && p.priceEstimateDesc!.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: cardGold.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: cardGold.withValues(alpha: 0.35),
                        style: BorderStyle.solid,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.calculate_outlined, size: 15, color: cardGold),
                            const SizedBox(width: 6),
                            Text(
                              '📦 حزمة نموذجية استرشادية بهذا السعر:',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: cardGold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          p.priceEstimateDesc!,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: context.c.ink,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '* مثال توضيحي لتقدير التكلفة، والكميات والمواصفات قابلة للزيادة أو التعديل بالاتفاق المباشر مع المزوّد',
                          style: TextStyle(
                            fontSize: 11,
                            fontStyle: FontStyle.italic,
                            color: context.c.inkFaint,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                // Action Buttons
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (p.hasPhone) ...[
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.c.sky,
                          foregroundColor: context.c.onSky,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          elevation: 0,
                        ),
                        icon: _loadingContact
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.phone, size: 16),
                        label: const Text(
                          'تواصل فوري',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                        onPressed: _loadingContact ? null : _revealContactSheet,
                      ),
                    ),
                    const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          side: BorderSide(color: context.c.line),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: Icon(
                          _isExpanded ? Icons.expand_less : Icons.expand_more,
                          size: 18,
                          color: context.c.ink,
                        ),
                        label: Text(
                          _isExpanded ? 'إخفاء التفاصيل' : 'مزيد من التفاصيل',
                          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: context.c.ink),
                        ),
                        onPressed: () => setState(() => _isExpanded = !_isExpanded),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // 3. Collapsible Inline Details Panel
          if (_isExpanded) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.c.surfaceSunk,
                border: Border(top: BorderSide(color: context.c.line)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Capacity & Flexibility Notice
                  // `ClipRRect` بدل `borderRadius` على `Border` غير موحّد اللون:
                  // نفس عيب شاشة المزوّد، وكان يرمي في debug عند فتح هذه اللوحة
                  // وحدها. القصّ يحفظ الزوايا والألوان والسماكة كما هي.
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: context.c.surface,
                        border: Border(
                          right: BorderSide(color: cardGold, width: 3.5),
                          top: BorderSide(color: context.c.line),
                          left: BorderSide(color: context.c.line),
                          bottom: BorderSide(color: context.c.line),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline, size: 18, color: cardGold),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'توضيح مهم بشأن المواصفات والكميات:',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: context.c.ink,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'المواصفات الموضحة أدناه هي مثال لحزمة قياسية تقريبية لتوضيح السعر الاسترشادي. الكميات قابلة للتعديل والزيادة (مثل 2000 كرسي أو خيام إضافية) بالاتفاق المباشر حسب حجم مناسبتك مع المزوّد.',
                                  style: TextStyle(fontSize: 11.5, color: context.c.inkSoft, height: 1.45),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Specs Grid
                  if (p.attributes.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      'بنود ومواصفات هذه الحزمة النموذجية:',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.bold,
                        color: context.c.ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: p.attributes.map((attr) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: context.c.surface,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: context.c.line),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                attr.label,
                                style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                attr.unit.isNotEmpty ? '${attr.value} ${attr.unit}' : attr.value,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: context.c.ink,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],

                  const SizedBox(height: 14),
                  if (p.hasPhone)
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: cardGold,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 11),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.phone_in_talk, size: 16),
                      label: const Text(
                        'إظهار خيارات الاتصال والواتساب',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      onPressed: _revealContactSheet,
                    )
                  else
                    Text(
                      'لا يوجد رقم تواصل مسجّل',
                      style: TextStyle(fontSize: 12.5, color: context.c.inkFaint),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPlaceholderMedia(ServiceProvider p, Color toneColor) {
    return Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment.center,
          radius: 0.9,
          colors: [
            Color(0xFFFFFDF8),
            Color(0xFFFBF1D9),
            Color(0xFFF3DFAD),
          ],
        ),
      ),
      child: Center(
        child: p.categoryIcon.isNotEmpty
            ? Text(
                p.categoryIcon,
                style: const TextStyle(fontSize: 48),
              )
            : Icon(
                Icons.handyman_outlined,
                size: 48,
                color: toneColor.withValues(alpha: 0.8),
              ),
      ),
    );
  }
}

/// الصفّ المختصر لمزوّد خدمة (تذكرة #158) — أربعة إلى خمسة صفوف في الشاشة:
/// صورة مربّعة 88px، الاسم عريض 17، سطر الفئة والبلدة، شارة سعر صغيرة، وزرّا
/// «اتصال» (حين يوجد رقم وحده) و«تفاصيل» الذي يدفع شاشة المزوّد القائمة.
///
/// كل نص في الصفّ 15px أو أكبر، وكل زرّ 44px على الأقل — يحرس ذلك اختبار
/// widget على هذه الشاشة. والرقم لا يُعرض ولا يُطلب هنا: «اتصال» يفتح الورقة
/// المشتركة `showProviderContactSheet` التي تجلبه لحظة الطلب وحده.
class _CompactServiceRow extends StatelessWidget {
  const _CompactServiceRow({
    required this.provider,
    required this.onDetails,
  });

  /// ارتفاع هدف اللمس الأدنى لكل زرّ في الصفّ (‏أقل من 44 لا يجوز).
  static const double actionHeight = 44;

  final ServiceProvider provider;
  final VoidCallback onDetails;

  /// سطر البلدة لا يدّعي «جميع البلدات» من قائمة قصيرة (تذكرة #127): يسمّي
  /// أول بلدتين ويشير إلى الباقي بـ«وغيرها»، والفارغ يقول الحقيقة. هذا يبقي
  /// السطر قصيراً كما يشترط ارتفاع الصفّ (٤–٥ صفوف في الشاشة).
  String get _townsText {
    if (provider.towns.isEmpty) return 'مناطق الخدمة غير محدَّدة';
    if (provider.towns.length <= 3) return provider.towns.join('، ');
    return '${provider.towns.take(2).join('، ')} وغيرها';
  }

  @override
  Widget build(BuildContext context) {
    final p = provider;
    final tone = _providerTone(context, p);

    return Container(
      key: Key('service_row_${p.id}'),
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: Row(
        // سطر واحد (~124–138px على Cairo): الصورة والبيانات والزرّان في عمود
        // واحد جانبي — فتحمل الشاشة أربعة صفوف كاملة بعد تمرير الرأس.
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _buildMedia(context, tone),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: context.c.ink,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 3),
                Wrap(
                  spacing: 10,
                  runSpacing: 2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      p.categoryIcon.isEmpty
                          ? p.categoryName
                          : '${p.categoryIcon} ${p.categoryName}',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: tone,
                      ),
                    ),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.location_on, size: 15, color: context.c.inkFaint),
                        const SizedBox(width: 3),
                        Flexible(
                          child: Text(
                            _townsText,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 15, color: context.c.inkSoft),
                          ),
                        ),
                      ],
                    ),
                    // عدّادا 👁/♥ (تذكرة #185) داخل الـ`Wrap` نفسه فلا يضيف
                    // سطراً جديداً حين يتّسع له السطر، و15px كبقية نصوص الصفّ.
                    _providerStat(
                      valueKey: Key('service_row_views_${p.id}'),
                      icon: '👁',
                      value: p.viewsCount,
                      color: context.c.inkFaint,
                    ),
                    _providerStat(
                      valueKey: Key('service_row_favorites_${p.id}'),
                      icon: '♥',
                      value: p.favoritesCount,
                      color: context.c.inkFaint,
                    ),
                    // ★ المتوسط (العدد) — تذكرة #186، بلا نجمة لمن لا تقييمات.
                    if (p.ratingCount > 0 && p.ratingAvg != null)
                      _providerStat(
                        valueKey: Key('service_row_rating_${p.id}'),
                        icon: '★',
                        value: p.ratingCount,
                        valueText:
                            '${p.ratingAvg!.toStringAsFixed(1)} (${p.ratingCount})',
                        color: context.c.inkFaint,
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                  decoration: BoxDecoration(
                    color: cardGold.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: cardGold.withValues(alpha: 0.35)),
                  ),
                  child: Text(
                    // الرقم أولاً: على 360px تُقصّ الشارة من نهايتها، فلا يضيع
                    // السعر. النصّ يبقى سطراً واحداً فلا يتضخّم الصفّ.
                    '${p.price != null ? '${p.price} ₪ · ' : ''}${_providerPriceBadgeText(p)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: context.c.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // عمود الزرّين جانبه: 44px لكل زرّ كما هي القاعدة، وسطران لا يزيدان
          // ارتفاع الصفّ عن ارتفاع الصورة 88px إلا بستّة بكسلات فراغ.
          SizedBox(
            width: 96,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (p.hasPhone) ...[
                  SizedBox(
                    height: actionHeight,
                    child: ElevatedButton.icon(
                      key: Key('service_row_contact_${p.id}'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: context.c.sky,
                        foregroundColor: context.c.onSky,
                        padding: EdgeInsets.zero,
                        minimumSize: const Size.fromHeight(actionHeight),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.phone, size: 17),
                      label: const Text(
                        'اتصال',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      ),
                      onPressed: () => showProviderContactSheet(context, p),
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
                SizedBox(
                  height: actionHeight,
                  child: OutlinedButton.icon(
                    key: Key('service_row_details_${p.id}'),
                    style: OutlinedButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size.fromHeight(actionHeight),
                      side: BorderSide(color: context.c.line),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: Icon(Icons.info_outline, size: 17, color: context.c.ink),
                    label: Text(
                      'تفاصيل',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: context.c.ink),
                    ),
                    onPressed: onDetails,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// الصورة المربّعة 88px — الخيار نفسه في الكرت الكبير: صورة المزوّد أو
  /// أيقونة فئته على أرضية ذهبية هادئة.
  Widget _buildMedia(BuildContext context, Color tone) {
    const double side = 88;
    final hasImage = provider.imageUrl != null && provider.imageUrl!.isNotEmpty;

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: side,
        height: side,
        child: hasImage
            ? CachedNetworkImage(
                imageUrl: provider.imageUrl!,
                fit: BoxFit.cover,
                placeholder: (_, _) => Container(color: context.c.surfaceSunk),
                errorWidget: (_, _, _) => _buildPlaceholderMedia(context, tone),
              )
            : _buildPlaceholderMedia(context, tone),
      ),
    );
  }

  Widget _buildPlaceholderMedia(BuildContext context, Color tone) {
    return Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment.center,
          radius: 0.9,
          colors: [
            Color(0xFFFFFDF8),
            Color(0xFFFBF1D9),
            Color(0xFFF3DFAD),
          ],
        ),
      ),
      child: Center(
        child: provider.categoryIcon.isNotEmpty
            ? Text(provider.categoryIcon, style: const TextStyle(fontSize: 30))
            : Icon(
                Icons.handyman_outlined,
                size: 30,
                color: tone.withValues(alpha: 0.8),
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
  String _priceType = 'estimated';
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _priceController = TextEditingController();
  final _priceEstimateDescController = TextEditingController();
  final _descriptionController = TextEditingController();
  final Map<String, TextEditingController> _attrControllers = {};
  final Set<String> _selectedTowns = {};
  XFile? _pickedImage;
  bool _submitting = false;

  ServiceCategory? get _selectedCategory {
    return widget.categories.cast<ServiceCategory?>().firstWhere(
          (c) => c?.id == _selectedCategoryId,
          orElse: () => null,
        );
  }

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
    _priceEstimateDescController.dispose();
    _descriptionController.dispose();
    for (final c in _attrControllers.values) {
      c.dispose();
    }
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

      final List<Map<String, dynamic>> attributes = [];
      final cat = _selectedCategory;
      if (cat != null && cat.attributes.isNotEmpty) {
        for (final raw in cat.attributes) {
          if (raw is Map) {
            final key = '${raw['attr_key'] ?? raw['key'] ?? ''}';
            final label = '${raw['label'] ?? raw['name'] ?? key}';
            final unit = '${raw['unit'] ?? ''}';
            final val = _attrControllers[key]?.text.trim() ?? '';
            if (val.isNotEmpty) {
              attributes.add({
                'attr_key': key,
                'label': label,
                if (unit.isNotEmpty) 'unit': unit,
                'value': val,
              });
            }
          }
        }
      }

      await api.submitProviderOffer(
            categoryId: _selectedCategoryId!,
            name: _nameController.text.trim(),
            phone: _phoneController.text.trim(),
            description: _descriptionController.text.trim(),
            price: price,
            priceType: _priceType,
            priceEstimateDesc: _priceEstimateDescController.text.trim(),
            attributes: attributes.isNotEmpty ? attributes : null,
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

  Widget _buildDynamicAttributesSection() {
    final cat = _selectedCategory;
    if (cat == null || cat.attributes.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.c.surfaceSunk,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.c.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.checklist_rounded, size: 18, color: context.c.gold),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'مواصفات الحزمة النموذجية الاسترشادية لهذا السعر:',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...cat.attributes.map((raw) {
            if (raw is! Map) return const SizedBox.shrink();
            final key = '${raw['attr_key'] ?? raw['key'] ?? ''}';
            final label = '${raw['label'] ?? raw['name'] ?? key}';
            final unit = '${raw['unit'] ?? ''}';
            final sample = '${raw['sample_value'] ?? ''}';

            final controller = _attrControllers.putIfAbsent(
              key,
              () => TextEditingController(),
            );

            final unitText = unit.isNotEmpty ? ' ($unit)' : '';
            final hintText = sample.isNotEmpty ? 'مثال: $sample' : '';

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: TextFormField(
                controller: controller,
                decoration: InputDecoration(
                  labelText: '$label$unitText',
                  hintText: hintText,
                  border: const OutlineInputBorder(),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
            );
          }),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: context.c.gold.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 15, color: context.c.gold),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'تنبيه توضيحي: هذه المواصفات والكميات تمثل حزمة استرشادية لتقدير السعر فقط، والزبون بإمكانه دائماً طلب كميات أكبر أو أصغر بالاتفاق المباشر معك حسب حجم مناسبته.',
                    style: TextStyle(fontSize: 11.5, color: context.c.ink, height: 1.35),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
                'عرّف الناس بخدمتك',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: context.c.ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'التصوير، الطبخ، الخيام والكراسي، الصوت والإضاءة… اكتب ما تجيده '
                'والبلدات التي تخدمها، ليصل إليك من يحتاجه في منطقتك بعد اعتماد '
                'الإدارة.',
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
                  labelText: 'رقم الهاتف للتواصل (اختياري)',
                  hintText: '05XXXXXXXX',
                  border: OutlineInputBorder(),
                ),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) return null;
                  final clean = val.trim().replaceAll(RegExp(r'[\s-]'), '');
                  if (!RegExp(r'^0\d{8,9}$').hasMatch(clean)) {
                    return 'رقم الهاتف غير صالح';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _priceType,
                decoration: const InputDecoration(
                  labelText: 'نوع التسعير',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'estimated', child: Text('سعر تقديري')),
                  DropdownMenuItem(value: 'starting_at', child: Text('ابتداءً من')),
                  DropdownMenuItem(value: 'fixed', child: Text('سعر محدد')),
                  DropdownMenuItem(value: 'contact', child: Text('تواصل للسعر')),
                ],
                onChanged: (val) => setState(() => _priceType = val ?? 'estimated'),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _priceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'السعر المالي (₪) (اختياري)',
                  hintText: 'مثال: 4500',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _priceEstimateDescController,
                decoration: const InputDecoration(
                  labelText: 'وصف الحزمة النموذجية / التسعير التقديري (اختياري)',
                  hintText: 'مثال: 1000 كرسي + برجين إضاءة = 4,500 ₪ تقديري',
                  border: OutlineInputBorder(),
                ),
              ),
              _buildDynamicAttributesSection(),
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
                children: AppServices.of(context).places.catalog.towns.map((town) {
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
