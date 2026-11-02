import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/async_view.dart' show openExternalLink;
import 'news_screen.dart';

/// منصتا كترا الأخريان — روابط خارجية تُفتح في المتصفّح بنفس مسار المشروع
/// (`openExternalLink`)، لا `http` ولا `WebView` هنا.
const String storesPlatformUrl = 'https://kolshee.ktra-pro.tech/';
const String erpPlatformUrl = 'https://ktra-pro.tech/';

/// «خدماتنا» — وجهة الشريط الأولى بعد المناسبات: منصات شركة كترا للحلول
/// الذكية الثلاث، أوّلها «آخر خبر» داخل التطبيق، والباقي خارجيّ.
///
/// الشاشة عامة بلا حساب، ولا تعرض أي بيانات: بطاقات صور تعريفية فقط.
class ServicesHubScreen extends StatelessWidget {
  const ServicesHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('خدماتنا')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 30),
        children: [
          Text(
            'منصاتنا الأخرى من شركة كترا للحلول الذكية',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              height: 1.6,
              color: context.c.inkSoft,
            ),
          ),
          const SizedBox(height: 18),
          // صورتان في صفّ واحد — الأولى يميناً في RTL — ثم العريضة تحتهما.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _HubCard(
                  key: const Key('hub_card_news'),
                  imageAsset: 'assets/platforms/news.jpg',
                  icon: Icons.newspaper,
                  title: 'آخر خبر',
                  short: 'أخبار منطقتك أولاً بأول',
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => const NewsScreen()),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _HubCard(
                  key: const Key('hub_card_stores'),
                  imageAsset: 'assets/platforms/stores.jpg',
                  logoAsset: 'assets/platforms/logo-stores.png',
                  title: 'متاجرنا',
                  short: 'مطاعم ومتاجر بلدتك',
                  onTap: () => openExternalLink(
                    context,
                    Uri.parse(storesPlatformUrl),
                    failureMessage: 'تعذّر فتح منصة متاجرنا',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _HubCard(
            key: const Key('hub_card_erp'),
            imageAsset: 'assets/platforms/erp.jpg',
            logoAsset: 'assets/platforms/logo-erp.png',
            title: 'K.T.R.A ERP',
            short: 'مخزون وفواتير ومحاسبة',
            wide: true,
            onTap: () => openExternalLink(
              context,
              Uri.parse(erpPlatformUrl),
              failureMessage: 'تعذّر فتح منصة K.T.R.A ERP',
            ),
          ),
        ],
      ),
    );
  }
}

/// بطاقة منصة صورةً كاملة: الغلاف هو الصورة، والاسم والوصف القصير فوقها على
/// تدرّج داكن أسفلها، والبطاقة كلها هدف ضغط واحد بلا زرّ منفصل.
///
/// الشارة مربّع صغير: أيقونة بيضاء على أحمر للخبر، أو شعار المنصة على أبيض
/// للاثنتين الأخريين. والعريضة وحدها تحمل كبسولة «افتح» (بلا فعل مستقل).
class _HubCard extends StatelessWidget {
  const _HubCard({
    super.key,
    required this.imageAsset,
    required this.title,
    required this.short,
    required this.onTap,
    this.wide = false,
    this.icon,
    this.logoAsset,
  }) : assert(
         (icon == null) != (logoAsset == null),
         'شارة البطاقة إمّا أيقونة أو شعار، لا الاثنان ولا دونهما',
       );

  final String imageAsset;
  final String title;
  final String short;
  final VoidCallback onTap;
  final bool wide;
  final IconData? icon;
  final String? logoAsset;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$title — $short',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AspectRatio(
          aspectRatio: wide ? 16 / 7 : 4 / 5,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: cardGold.withValues(alpha: 0.35),
                width: 1.2,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    imageAsset,
                    fit: BoxFit.cover,
                    excludeFromSemantics: true,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        stops: [0, .36, .68],
                        colors: [
                          Color(0xF0040E16),
                          Color(0xA8040E16),
                          Color(0x0F040E16),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: EdgeInsets.all(wide ? 16 : 13),
                    child: wide
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Expanded(child: _texts()),
                              const SizedBox(width: 10),
                              _openCapsule(),
                            ],
                          )
                        : _texts(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// شارة + الاسم + الوصف القصير، محاذاةً للبداية وأسفل الصورة.
  Widget _texts() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        _badge(),
        const SizedBox(height: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w900,
            height: 1.2,
            color: Colors.white,
            shadows: [
              Shadow(
                color: Color(0x99000000),
                blurRadius: 6,
                offset: Offset(0, 1),
              ),
            ],
          ),
        ),
        const SizedBox(height: 2),
        Text(
          short,
          style: TextStyle(
            fontSize: 11.5,
            height: 1.3,
            color: Colors.white.withValues(alpha: 0.85),
          ),
        ),
      ],
    );
  }

  Widget _badge() {
    final hasIcon = icon != null;
    return Container(
      width: 34,
      height: 34,
      padding: hasIcon ? null : const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: hasIcon ? const Color(0xFFC81E2B) : Colors.white,
        borderRadius: BorderRadius.circular(10),
      ),
      child: hasIcon
          ? Icon(icon, size: 19, color: Colors.white)
          : Image.asset(
              logoAsset!,
              fit: BoxFit.contain,
              excludeFromSemantics: true,
            ),
    );
  }

  /// كبسولة العريضة وحدها — شكل بلا فعل مستقل، النقر كلّه للبطاقة.
  Widget _openCapsule() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.55)),
      ),
      child: const Text(
        'افتح',
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
    );
  }
}
