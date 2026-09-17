import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../models/service.dart';
import '../theme.dart';
import '../widgets/async_view.dart';

/// صفحة مزوّد خدمة واحد — الوصف والصورة ظاهران فوراً، **والرقم لا يظهر نصّاً
/// إطلاقاً**؛ يُكشف فقط عبر فعل تواصل صريح (زرّ «اتصال» يفتح تطبيق الهاتف
/// مباشرة)، نفس نمط اتصال المضيف في `event_details_screen.dart`. لا نجوم
/// ولا تقييمات — غياب مقصود (#25).
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

  Future<void> _openWhatsApp(String phone, String providerName, String categoryName) async {
    var clean = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (clean.startsWith('05')) {
      clean = '972${clean.substring(1)}';
    } else if (clean.startsWith('+')) {
      clean = clean.substring(1);
    }
    final msg = Uri.encodeComponent('مرحباً $providerName، استفسار بخصوص خدمتك ($categoryName) عبر تطبيق أعراسنا:');
    final url = Uri.parse('https://wa.me/$clean?text=$msg');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      if (mounted) showMessage(context, 'تعذّر فتح تطبيق واتساب', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.initialName ?? 'مزوّد خدمة')),
      body: FutureBuilder<ServiceProviderDetail>(
        future: _provider,
        builder: (context, snapshot) {
          return AsyncView<ServiceProviderDetail>(
            snapshot: snapshot,
            onRetry: () => setState(
              () => _provider =
                  AppServices.of(context).api.serviceProviderDetails(widget.providerId),
            ),
            builder: (provider) => _ProviderBody(
              provider: provider,
              onCall: () => _call(provider.phone),
              onWhatsApp: () => _openWhatsApp(provider.phone, provider.name, provider.categoryName),
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
  });

  final ServiceProviderDetail provider;
  final VoidCallback onCall;
  final VoidCallback onWhatsApp;

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
    final hasImage = provider.imageUrl != null && provider.imageUrl!.isNotEmpty;

    return ListView(
      padding: const EdgeInsets.only(bottom: 28),
      children: [
        if (hasImage)
          CachedNetworkImage(
            imageUrl: provider.imageUrl!,
            height: 240,
            width: double.infinity,
            fit: BoxFit.cover,
            placeholder: (_, _) => Container(
              height: 240,
              color: context.c.surfaceSunk,
              child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            errorWidget: (_, _, _) => Container(
              height: 240,
              color: context.c.surfaceSunk,
              child: Icon(Icons.image_not_supported_outlined, color: context.c.inkFaint, size: 38),
            ),
          )
        else
          Container(
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
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: context.c.gold.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
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

              // Flexible Capacity Notice
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.c.surfaceSunk,
                  borderRadius: BorderRadius.circular(10),
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
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
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
            ],
          ),
        ),
      ],
    );
  }
}
