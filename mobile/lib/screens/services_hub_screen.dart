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
/// الشاشة عامة بلا حساب، ولا تعرض أي بيانات: كبسات تعريفية فقط.
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
          // عمود من ثلاث كبسات بعرض الشاشة — لا صفّ صورتين وعريضة تحتهما.
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _HubCard(
                key: const Key('hub_card_news'),
                imageAsset: 'assets/platforms/news.jpg',
                icon: Icons.newspaper,
                title: 'آخر خبر',
                short: 'أخبار منطقتك أولاً بأول',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const NewsScreen()),
                ),
              ),
              const SizedBox(height: 18),
              _HubCard(
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
              const SizedBox(height: 18),
              _HubCard(
                key: const Key('hub_card_erp'),
                imageAsset: 'assets/platforms/erp.jpg',
                logoAsset: 'assets/platforms/logo-erp.png',
                title: 'K.T.R.A ERP',
                short: 'مخزون وفواتير ومحاسبة',
                onTap: () => openExternalLink(
                  context,
                  Uri.parse(erpPlatformUrl),
                  failureMessage: 'تعذّر فتح منصة K.T.R.A ERP',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// كبسة منصّة بلاستيكية: كبسولة بوجه بارز (لمعة علوية) على حائط بلون العلامة
/// وظلّ مسقَط. عند الضغط ينزل الوجه ٦px ويقصر الحائط بمقداره فيبدو غائراً في
/// مكانه — بلا `scale`، والهدف كلّه ضغط واحد بلا زرّ منفصل.
///
/// الشارة مربّع صغير على حافة الصورة: أيقونة بيضاء على أحمر للخبر، أو شعار
/// المنصة على أبيض للاثنتين الأخريين.
class _HubCard extends StatefulWidget {
  const _HubCard({
    super.key,
    required this.imageAsset,
    required this.title,
    required this.short,
    required this.onTap,
    this.icon,
    this.logoAsset,
  }) : assert(
         (icon == null) != (logoAsset == null),
         'شارة الكبسة إمّا أيقونة أو شعار، لا الاثنان ولا دونهما',
       );

  final String imageAsset;
  final String title;
  final String short;
  final VoidCallback onTap;
  final IconData? icon;
  final String? logoAsset;

  @override
  State<_HubCard> createState() => _HubCardState();
}

class _HubCardState extends State<_HubCard> {
  /// حالة الكبس الفعلية — تُشغَّل بالنزول وتُطفأ بالرفع أو الإلغاء.
  bool _pressed = false;

  void _press(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // حائط الكبسة بلون العلامة والظلّ المسقَط على الأرض — نهاريّها وليليّها.
    final accentWall = isDark
        ? const Color(0xFF0EA5E9)
        : const Color(0xFF075985);
    final cast = isDark
        ? Colors.black.withValues(alpha: 0.6)
        : const Color.fromRGBO(12, 27, 42, 0.28);
    final radius = BorderRadius.circular(999);

    return Semantics(
      button: true,
      label: '${widget.title} — ${widget.short}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onTapDown: (_) => _press(true),
        onTapUp: (_) => _press(false),
        onTapCancel: () => _press(false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 70),
          curve: Curves.easeOut,
          transform: Matrix4.translationValues(0, _pressed ? 6 : 0, 0),
          transformAlignment: Alignment.center,
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: radius,
            border: Border.all(color: c.line),
            boxShadow: [
              // الحائط: طبقة صلبة بلا تمويه، وقصرها هو ما يجعل النزول ظاهراً.
              BoxShadow(
                color: accentWall,
                offset: Offset(0, _pressed ? 3 : 9),
                blurRadius: 0,
              ),
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.16),
                offset: Offset(0, _pressed ? 5 : 11),
                blurRadius: 0,
              ),
              // الظلّ المسقَط على الأرض — يخفت ويقرب حين تُكبَس الكبسة.
              BoxShadow(
                color: cast,
                offset: Offset(0, _pressed ? 8 : 18),
                blurRadius: _pressed ? 12 : 20,
              ),
            ],
          ),
          child: Stack(
            children: [
              // لمعة علوية وانحدار خفيف إلى القاع فوق لون الوجه.
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: radius,
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      stops: const [0, .42, 1],
                      colors: [
                        Colors.white.withValues(alpha: isDark ? .10 : .55),
                        Colors.transparent,
                        Colors.black.withValues(alpha: isDark ? .25 : .05),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.only(
                  start: 22,
                  end: 18,
                  top: 10,
                  bottom: 10,
                ),
                child: Row(
                  children: [
                    _picture(c, cast),
                    const SizedBox(width: 12),
                    Expanded(child: _texts(c)),
                    const SizedBox(width: 12),
                    _openCapsule(c, cast),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// صورة دائرية ٥٦px، وشعار المنصّة ملصقٌ على حافتها.
  Widget _picture(NegevPalette c, Color cast) {
    final hasIcon = widget.icon != null;
    return SizedBox(
      width: 56,
      height: 56,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: ClipOval(
              child: Image.asset(
                widget.imageAsset,
                fit: BoxFit.cover,
                excludeFromSemantics: true,
              ),
            ),
          ),
          PositionedDirectional(
            start: -5,
            bottom: -5,
            child: Container(
              width: 24,
              height: 24,
              padding: hasIcon ? null : const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: hasIcon ? const Color(0xFFC81E2B) : Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: c.line),
                boxShadow: [
                  BoxShadow(
                    color: cast,
                    offset: const Offset(0, 2),
                    blurRadius: 5,
                  ),
                ],
              ),
              child: hasIcon
                  ? Icon(widget.icon, size: 13, color: Colors.white)
                  : Image.asset(
                      widget.logoAsset!,
                      fit: BoxFit.contain,
                      excludeFromSemantics: true,
                    ),
            ),
          ),
        ],
      ),
    );
  }

  /// الاسم ثم السطر القصير تحته، محاذاةً للبداية (يمين الكبسة في RTL).
  Widget _texts(NegevPalette c) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.title,
          style: TextStyle(
            fontSize: 16.5,
            fontWeight: FontWeight.w900,
            height: 1.3,
            color: c.ink,
          ),
        ),
        Text(
          widget.short,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            height: 1.5,
            color: c.inkSoft,
          ),
        ),
      ],
    );
  }

  /// كبسولة «افتح» في النهاية — شكل بلا فعل مستقل، النقر كلّه للكبسة.
  Widget _openCapsule(NegevPalette c, Color cast) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
      decoration: BoxDecoration(
        color: c.sky,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(color: cast, offset: const Offset(0, 2), blurRadius: 6),
        ],
      ),
      child: Text(
        'افتح',
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w900,
          height: 1,
          color: c.onSky,
        ),
      ),
    );
  }
}
