import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../main.dart';
import '../models/service.dart';
import '../theme.dart';
import '../widgets/async_view.dart';
import '../widgets/auth_action_button.dart';

/// أسماء أيام `hours` السبعة — الفهرس نفسه الذي يخزّنه الأدمن (0 = الأحد).
const List<String> _providerDayNames = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

/// صفحة مزوّد خدمة واحد — الوصف والصورة ظاهران فوراً، **والرقم لا يظهر نصّاً
/// إطلاقاً**؛ يُكشف فقط عبر فعل تواصل صريح (زرّ «اتصال» يفتح تطبيق الهاتف
/// مباشرة)، نفس نمط اتصال المضيف في `event_details_screen.dart`. لا نجوم
/// ولا تقييمات — غياب مقصود (#25).
///
/// **وصارت غنية (#184):** الغلاف والشعار، وشارتا «موثّق»/«مميّز»، وجدول ساعات
/// أسبوعي، ومعرض أعمال، وعروض سارية، ومنتجات، ومزوّدون مشابهون يفتح كلٌّ
/// منهم صفحته. **كل قسم فارغ يُخفى**، وزرّ واتساب يستدعي
/// `GET /api/services/providers/:id/whatsapp` ويفتح الرابط الذي يبنيه الخادم
/// — لا يبني الشاشة رابطاً ولا تعرف صيغة الرقم الدولي.
class ServiceProviderDetailsScreen extends StatefulWidget {
  const ServiceProviderDetailsScreen({
    super.key,
    required this.providerId,
    this.initialName,
  });

  final int providerId;

  /// اسم المزوّد من صفّ القائمة — يظهر في الترويسة فوراً قبل اكتمال التحميل،
  /// فلا يفرغ العنوان أثناء الانتظار. الوصف والصورة والرقم يبقون بانتظار
  /// الردّ الكامل، ولا بديل مؤقّت لأيٍّ منها.
  final String? initialName;

  @override
  State<ServiceProviderDetailsScreen> createState() =>
      _ServiceProviderDetailsScreenState();
}

class _ServiceProviderDetailsScreenState
    extends State<ServiceProviderDetailsScreen> {
  Future<ServiceProviderDetail>? _provider;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _provider ??= AppServices.of(context).api.serviceProviderDetails(widget.providerId);
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (!await launchUrl(uri)) {
      if (mounted) showMessage(context, 'تعذّر إجراء الاتصال', isError: true);
    }
  }

  /// رابط واتساب من الخادم — الرسالة والرقم الدولي هناك، والشاشة تفتح `url`.
  Future<void> _openWhatsApp(int providerId) async {
    try {
      final url = await AppServices.of(context).api.providerWhatsapp(providerId);
      if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
        if (mounted) showMessage(context, 'تعذّر فتح تطبيق واتساب', isError: true);
      }
    } catch (error) {
      if (!mounted) return;
      showMessage(
        context,
        error is ApiException ? error.message : 'تعذّر فتح تطبيق واتساب',
        isError: true,
      );
    }
  }

  /// مزوّد مشابه يُفتح فوق الصفحة الحالية — لا استبدال، فالرجوع يعود إليها.
  Future<void> _openProvider(ServiceProvider candidate) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ServiceProviderDetailsScreen(
          providerId: candidate.id,
          initialName: candidate.name,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.initialName ?? 'مزوّد خدمة'),
        actions: const [AuthActionButton()],
      ),
      body: FutureBuilder<ServiceProviderDetail>(
        future: _provider,
        builder: (context, snapshot) {
          return AsyncView<ServiceProviderDetail>(
            snapshot: snapshot,
            onRetry: () => setState(() {
              _provider = AppServices.of(context)
                  .api
                  .serviceProviderDetails(widget.providerId);
            }),
            builder: (provider) => _ProviderBody(
              provider: provider,
              onCall: () => _call(provider.phone),
              onWhatsApp: () => _openWhatsApp(provider.id),
              onOpenSimilar: _openProvider,
            ),
          );
        },
      ),
    );
  }
}

class _ProviderBody extends StatelessWidget {
  const _ProviderBody({
    required this.provider,
    required this.onCall,
    required this.onWhatsApp,
    required this.onOpenSimilar,
  });

  final ServiceProviderDetail provider;
  final VoidCallback onCall;
  final VoidCallback onWhatsApp;
  final ValueChanged<ServiceProvider> onOpenSimilar;

  String _priceBadgeText() {
    switch (provider.priceType) {
      case 'contact':
        return 'تواصل للسعر';
      case 'starting_at':
        return 'ابتداءً من';
      case 'fixed':
        return 'سعر محدد';
      case 'estimated':
      default:
        return 'سعر تقديري';
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.only(bottom: 28),
      children: [
        _ProviderHeader(provider: provider),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (provider.logoUrl != null) ...[
                ClipOval(
                  child: CachedNetworkImage(
                    key: const Key('provider_logo'),
                    imageUrl: provider.logoUrl!,
                    width: 64,
                    height: 64,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => Container(
                      width: 64,
                      height: 64,
                      color: context.c.surfaceSunk,
                      child: Icon(Icons.storefront_outlined, size: 22, color: context.c.inkFaint),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              if (provider.isVerified || provider.isFeatured) ...[
                _ProviderBadges(provider: provider),
                const SizedBox(height: 10),
              ],
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: context.c.skyWash,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      provider.categoryName,
                      style: TextStyle(fontSize: 12.5, color: context.c.sky, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: context.c.gold.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: context.c.gold.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      _priceBadgeText(),
                      style: TextStyle(fontSize: 12, color: context.c.gold, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                provider.name,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: context.c.ink),
              ),
              const SizedBox(height: 10),
              // `ClipRRect` بدل `borderRadius` على `Border` غير موحّد اللون:
              // Flutter في وضع debug يرمي «A borderRadius can only be given on
              // borders with uniform colors» حين تختلف ألوان الجوانب، فينفجر
              // بناء الشاشة كلها. القصّ الخارجي يعطي الزوايا المستديرة نفسها
              // ويحفظ لون كل جانب وسماكته بلا تغيير مرئي.
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: context.c.gold.withValues(alpha: 0.12),
                    border: Border(
                      right: BorderSide(color: context.c.gold, width: 4),
                      top: BorderSide(color: context.c.gold.withValues(alpha: 0.3)),
                      left: BorderSide(color: context.c.gold.withValues(alpha: 0.3)),
                      bottom: BorderSide(color: context.c.gold.withValues(alpha: 0.3)),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _priceBadgeText(),
                            style: TextStyle(fontSize: 12, color: context.c.inkSoft, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            provider.price != null ? '${provider.price} ₪' : 'تواصل للسعر',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: context.c.gold,
                            ),
                          ),
                        ],
                      ),
                      Row(
                        children: [
                          Icon(Icons.handshake_outlined, size: 16, color: context.c.inkSoft),
                          const SizedBox(width: 4),
                          Text('اتفاق مباشر', style: TextStyle(fontSize: 12, color: context.c.inkSoft)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              // Benchmark package description banner
              if (provider.priceEstimateDesc != null && provider.priceEstimateDesc!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.c.gold.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: context.c.gold.withValues(alpha: 0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.calculate_outlined, size: 16, color: context.c.gold),
                          const SizedBox(width: 6),
                          Text(
                            '📦 حزمة نموذجية استرشادية بهذا السعر:',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.bold,
                              color: context.c.gold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        provider.priceEstimateDesc!,
                        style: TextStyle(
                          fontSize: 13.5,
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

              const SizedBox(height: 12),
              if (provider.towns.isNotEmpty)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.location_on_outlined, size: 17, color: context.c.sky),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        provider.towns.join('، '),
                        style: TextStyle(color: context.c.ink, fontSize: 14.5, height: 1.45),
                      ),
                    ),
                  ],
                ),
              if (provider.description != null && provider.description!.trim().isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  provider.description!,
                  style: TextStyle(fontSize: 14.5, color: context.c.inkSoft, height: 1.6),
                ),
              ],

              // ساعات العمل (#184) — جدول أسبوعي، ويُخفى كاملاً بلا ساعات.
              if (provider.hours.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'ساعات العمل', icon: Icons.schedule_outlined),
                const SizedBox(height: 8),
                Column(
                  key: const Key('provider_hours_section'),
                  children: (List<ServiceProviderHours>.from(provider.hours)
                        ..sort((left, right) => left.day.compareTo(right.day)))
                      .map((hours) => Padding(
                            key: Key('provider_hours_row_${hours.day}'),
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  hours.day >= 0 && hours.day < _providerDayNames.length
                                      ? _providerDayNames[hours.day]
                                      : '${hours.day}',
                                  style: TextStyle(fontSize: 13.5, color: context.c.inkSoft),
                                ),
                                Text(
                                  hours.closed ? 'مغلق' : '${hours.from} — ${hours.to}',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.bold,
                                    color: hours.closed ? context.c.inkFaint : context.c.ink,
                                  ),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ],

              // معرض الأعمال (#184): شبكة ثلاثية، وتعليق تحت الصورة إن وُجد.
              if (provider.gallery.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'معرض الأعمال', icon: Icons.photo_library_outlined),
                const SizedBox(height: 8),
                GridView.count(
                  key: const Key('provider_gallery_section'),
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                  childAspectRatio: 0.95,
                  children: provider.gallery
                      .map((photo) => Column(
                            key: Key('provider_gallery_photo_${photo.id}'),
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: CachedNetworkImage(
                                    imageUrl: photo.imageUrl,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, _, _) => Container(
                                      color: context.c.surfaceSunk,
                                      child: Icon(Icons.image_not_supported_outlined,
                                          size: 22, color: context.c.inkFaint),
                                    ),
                                  ),
                                ),
                              ),
                              if (photo.caption != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 3),
                                  child: Text(
                                    photo.caption!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 10.5, color: context.c.inkFaint),
                                  ),
                                ),
                            ],
                          ))
                      .toList(),
                ),
              ],

              // العروض السارية (#184) — الخادم لا يرسل المنتهي ولا المطفأ.
              if (provider.offers.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'عروض سارية', icon: Icons.local_offer_outlined),
                const SizedBox(height: 8),
                Column(
                  key: const Key('provider_offers_section'),
                  children: provider.offers
                      .map((offer) => Container(
                            key: Key('provider_offer_${offer.id}'),
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(11),
                            decoration: BoxDecoration(
                              color: context.c.surfaceSunk,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: context.c.line),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  offer.title,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: context.c.ink,
                                  ),
                                ),
                                if (offer.description != null) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    offer.description!,
                                    style: TextStyle(fontSize: 12.5, color: context.c.inkSoft, height: 1.5),
                                  ),
                                ],
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    if (offer.price != null) ...[
                                      Icon(Icons.sell_outlined, size: 14, color: context.c.gold),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${offer.price} ₪',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.bold,
                                          color: context.c.gold,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                    ],
                                    if (offer.endsAt != null) ...[
                                      Icon(Icons.schedule, size: 13, color: context.c.inkFaint),
                                      const SizedBox(width: 4),
                                      Text(
                                        'ينتهي ${offer.endsAt}',
                                        style: TextStyle(fontSize: 11.5, color: context.c.inkFaint),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ],

              // المنتجات (#184) بسعر «تبدأ من».
              if (provider.products.isNotEmpty) ...[
                const SizedBox(height: 20),
                _SectionTitle(title: 'منتجاتنا', icon: Icons.inventory_2_outlined),
                const SizedBox(height: 8),
                Column(
                  key: const Key('provider_products_section'),
                  children: provider.products
                      .map((product) => Padding(
                            key: Key('provider_product_${product.id}'),
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (product.imageUrl != null)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: CachedNetworkImage(
                                      imageUrl: product.imageUrl!,
                                      width: 54,
                                      height: 54,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => Container(
                                        width: 54,
                                        height: 54,
                                        color: context.c.surfaceSunk,
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    width: 54,
                                    height: 54,
                                    decoration: BoxDecoration(
                                      color: context.c.surfaceSunk,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Icon(Icons.inventory_2_outlined,
                                        size: 22, color: context.c.inkFaint),
                                  ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        product.name,
                                        style: TextStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.bold,
                                          color: context.c.ink,
                                        ),
                                      ),
                                      if (product.description != null)
                                        Text(
                                          product.description!,
                                          style: TextStyle(
                                              fontSize: 12, color: context.c.inkSoft, height: 1.45),
                                        ),
                                      if (product.price != null)
                                        Text(
                                          'تبدأ من ${product.price} ₪',
                                          style: TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.bold,
                                            color: context.c.gold,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ],

              // Flexible Capacity Notice
              const SizedBox(height: 16),
              // نفس سبب `ClipRRect` أعلاه: حدود بألوان مختلفة مع زوايا مستديرة.
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.c.surfaceSunk,
                    border: Border(
                      right: BorderSide(color: context.c.gold, width: 3.5),
                      top: BorderSide(color: context.c.line),
                      left: BorderSide(color: context.c.line),
                      bottom: BorderSide(color: context.c.line),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline, size: 18, color: context.c.gold),
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
                            const SizedBox(height: 3),
                            Text(
                              'المواصفات والكميات الموضحة هنا تمثل حزمة استرشادية قياسية بهذا السعر كمثال لتقدير التكلفة. بإمكانك دائماً طلب كميات أكبر أو أصغر أو تعديل المواصفات بالاتفاق المباشر مع المزوّد لتناسب حجم مناسبتك تماماً.',
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
              if (provider.attributes.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'بنود ومواصفات هذه الحزمة النموذجية:',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: provider.attributes.map((attr) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: context.c.surfaceSunk,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.c.line),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            attr.label,
                            style: TextStyle(fontSize: 11, color: context.c.inkFaint),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            attr.unit.isNotEmpty ? '${attr.value} ${attr.unit}' : attr.value,
                            style: TextStyle(
                              fontSize: 13.5,
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

              const SizedBox(height: 24),
              if (!provider.hasPhone)
                Text(
                  'لا يوجد رقم تواصل مسجّل',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: context.c.inkFaint),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        key: const Key('provider_whatsapp_btn'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF25D366),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          elevation: 0,
                        ),
                        onPressed: onWhatsApp,
                        icon: const Icon(Icons.chat, size: 18),
                        label: const Text(
                          'واتساب مباشر',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: context.c.sky,
                          foregroundColor: context.c.onSky,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          elevation: 0,
                        ),
                        onPressed: onCall,
                        icon: const Icon(Icons.phone_outlined, size: 18),
                        label: const Text(
                          'اتصال هاتفي',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),

              // مزوّدون مشابهون (#184) — حتى ستة، والنقر يفتح صفحة المزوّد.
              if (provider.similar.isNotEmpty) ...[
                const SizedBox(height: 24),
                _SectionTitle(title: 'مزوّدون مشابهون', icon: Icons.people_outline),
                const SizedBox(height: 8),
                SizedBox(
                  key: const Key('provider_similar_section'),
                  height: 132,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: provider.similar.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final candidate = provider.similar[index];
                      return InkWell(
                        key: Key('provider_similar_${candidate.id}'),
                        onTap: () => onOpenSimilar(candidate),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          width: 116,
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            border: Border.all(color: context.c.line),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: candidate.imageUrl != null
                                    ? ClipRRect(
                                        borderRadius: BorderRadius.circular(7),
                                        child: CachedNetworkImage(
                                          imageUrl: candidate.imageUrl!,
                                          fit: BoxFit.cover,
                                          errorWidget: (_, _, _) => Container(
                                            color: context.c.surfaceSunk,
                                          ),
                                        ),
                                      )
                                    : Container(
                                        decoration: BoxDecoration(
                                          color: context.c.surfaceSunk,
                                          borderRadius: BorderRadius.circular(7),
                                        ),
                                        child: Center(
                                          child: Text(
                                            candidate.categoryIcon.isNotEmpty
                                                ? candidate.categoryIcon
                                                : '🛠️',
                                            style: const TextStyle(fontSize: 22),
                                          ),
                                        ),
                                      ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                candidate.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.bold,
                                  color: context.c.ink,
                                ),
                              ),
                              Text(
                                candidate.towns.isNotEmpty
                                    ? candidate.towns.take(2).join('، ')
                                    : 'مناطق الخدمة غير محدَّدة',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 10, color: context.c.inkFaint),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// غلاف الصفحة (#184): الغلاف إن وُجد، وإلا صورة المزوّد، وإلا التدرّج وأيقونة
/// الفئة. الشعار يُرسم في جسم الصفحة تحته (لا بموضع متراكب يغطّي ما بعده).
class _ProviderHeader extends StatelessWidget {
  const _ProviderHeader({required this.provider});

  final ServiceProviderDetail provider;

  @override
  Widget build(BuildContext context) {
    final banner = provider.coverUrl ?? provider.imageUrl;

    if (banner == null || banner.isEmpty) {
      return Container(
        height: 180,
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            colors: [Color(0xFFFFFDF8), Color(0xFFFBF1D9), Color(0xFFF3DFAD)],
          ),
        ),
        child: Center(
          child: provider.categoryIcon.isNotEmpty
              ? Text(provider.categoryIcon, style: const TextStyle(fontSize: 48))
              : Icon(Icons.handyman_outlined, size: 48, color: context.c.gold),
        ),
      );
    }

    return CachedNetworkImage(
      key: const Key('provider_cover'),
      imageUrl: banner,
      height: 220,
      width: double.infinity,
      fit: BoxFit.cover,
      placeholder: (_, _) => Container(
        height: 220,
        color: context.c.surfaceSunk,
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      errorWidget: (_, _, _) => Container(
        height: 220,
        color: context.c.surfaceSunk,
        child: Icon(Icons.image_not_supported_outlined, color: context.c.inkFaint, size: 38),
      ),
    );
  }
}

/// شارتا «موثّق» و«مميّز» — تظهران بما يرسله الخادم وحده.
class _ProviderBadges extends StatelessWidget {
  const _ProviderBadges({required this.provider});

  final ServiceProviderDetail provider;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      key: const Key('provider_badges'),
      spacing: 6,
      runSpacing: 6,
      children: [
        if (provider.isVerified)
          _badge(
            context,
            key: const Key('provider_badge_verified'),
            label: 'موثّق',
            icon: Icons.verified_outlined,
            color: const Color(0xFF166534),
            background: const Color(0x2216A34A),
          ),
        if (provider.isFeatured)
          _badge(
            context,
            key: const Key('provider_badge_featured'),
            label: 'مميّز',
            icon: Icons.star_outline,
            color: const Color(0xFF8A6109),
            background: const Color(0x22B8860B),
          ),
      ],
    );
  }

  Widget _badge(
    BuildContext context, {
    required Key key,
    required String label,
    required IconData icon,
    required Color color,
    required Color background,
  }) {
    return Container(
      key: key,
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: color),
          ),
        ],
      ),
    );
  }
}

/// عنوان قسم داخل الصفحة — واحد لكل أقسامها (#184)، فلا ثلاثة أنماط عنوان.
class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 17, color: context.c.gold),
        const SizedBox(width: 7),
        Text(
          title,
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: context.c.ink),
        ),
      ],
    );
  }
}
