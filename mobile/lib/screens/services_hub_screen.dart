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
/// الشاشة عامة بلا حساب، ولا تعرض أي بيانات: بطاقات تعريفية فقط.
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
          _HubCard(
            key: const Key('hub_card_news'),
            icon: Icons.newspaper,
            title: 'آخر خبر',
            description: 'أخبار منطقتك لحظة بلحظة، من منصة كترا الإخبارية',
            actionLabel: 'افتح',
            actionIcon: Icons.arrow_forward,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const NewsScreen()),
            ),
          ),
          const SizedBox(height: 14),
          _HubCard(
            key: const Key('hub_card_stores'),
            icon: Icons.storefront,
            title: 'متاجرنا',
            description: 'مطاعم ومتاجر بلدتك، هواتف وإلكترونيات، بقالة '
                'ومستلزمات، مع توصيل ودفع عند الاستلام',
            actionLabel: 'زيارة المنصة',
            actionIcon: Icons.open_in_new,
            onPressed: () => openExternalLink(
              context,
              Uri.parse(storesPlatformUrl),
              failureMessage: 'تعذّر فتح منصة متاجرنا',
            ),
          ),
          const SizedBox(height: 14),
          _HubCard(
            key: const Key('hub_card_erp'),
            icon: Icons.insights,
            title: 'K.T.R.A ERP',
            description: 'إدارة الاستيراد والمخزون والفواتير والمحاسبة، مع '
                'بوابة خاصة للمحاسب القانوني',
            actionLabel: 'زيارة المنصة',
            actionIcon: Icons.open_in_new,
            onPressed: () => openExternalLink(
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

/// بطاقة منصة: أيقونة في دائرة ذهبية، اسم، وصف، وزرّ واحد. نفس طابع بطاقات
/// المشروع الفاخرة (سطح + إطار ذهبي خفيف + ظلّ ناعم) وبألوان `theme.dart`.
class _HubCard extends StatelessWidget {
  const _HubCard({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.actionLabel,
    required this.actionIcon,
    required this.onPressed,
  });

  final IconData icon;
  final String title;
  final String description;
  final String actionLabel;
  final IconData actionIcon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(18),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: context.c.goldWash,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: cardGold.withValues(alpha: 0.45),
                  ),
                ),
                child: Icon(icon, size: 21, color: context.c.gold),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: context.c.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            description,
            style: TextStyle(
              fontSize: 13,
              height: 1.7,
              color: context.c.inkSoft,
            ),
          ),
          const SizedBox(height: 14),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: ElevatedButton.icon(
              onPressed: onPressed,
              style: ElevatedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                textStyle: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.bold,
                ),
              ),
              icon: Icon(actionIcon, size: 17),
              label: Text(actionLabel),
            ),
          ),
        ],
      ),
    );
  }
}
