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
            ),
          );
        },
      ),
    );
  }
}

class _ProviderBody extends StatelessWidget {
  const _ProviderBody({required this.provider, required this.onCall});

  final ServiceProviderDetail provider;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) {
    final hasImage = provider.imageUrl != null && provider.imageUrl!.isNotEmpty;

    return ListView(
      padding: const EdgeInsets.only(bottom: 28),
      children: [
        if (hasImage)
          CachedNetworkImage(
            imageUrl: provider.imageUrl!,
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
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
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
              const SizedBox(height: 10),
              Text(
                provider.name,
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold, color: context.c.ink),
              ),
              const SizedBox(height: 10),
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
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: onCall,
                  icon: const Icon(Icons.phone_outlined),
                  label: const Text('تواصل'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
