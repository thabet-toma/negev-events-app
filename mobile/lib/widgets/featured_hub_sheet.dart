import 'package:flutter/material.dart';

import '../main.dart';
import '../screens/albums_screen.dart';
import '../screens/live_screen.dart';
import '../screens/news_screen.dart';
import '../screens/nokoot_screen.dart';
import '../screens/services_hub_screen.dart' show storesPlatformUrl;
import '../screens/services_prices_screen.dart';
import '../theme.dart';
import 'async_view.dart' show openExternalLink;
import 'congratulations.dart' show openSignInGate;

/// «مميّز عندنا» — الورقة التي يفتحها الزرّ الذهبي في وسط الشريط السفلي.
///
/// القائمة **ثابتة في الكود بقرار المالك** لا تُجلب من الخادم: مختارات واحدة
/// لكل المستخدمين، لا ترتيب يختلف بحساب ولا نسخة تُدار في اللوحة.
///
/// و«أضف عرسك» و«أضف خدمتك» **غائبتان عنها عمداً**: مكانهما الكبستان
/// الثابتتان فوق الشريط (`_publishActions` في الهيكل)، فلا نسخة ثانية لكلٍّ
/// منهما هنا.
///
/// والاختيار يُغلق الورقة **ثم** يفتح وجهته من سياق الأب (السياق الذي فُتحت به
/// الورقة، ويبقى حيّاً بعد إغلاقها) — لا من سياق الورقة نفسه الذي يخرج من
/// الشجرة بالـ`pop`.
Future<void> showFeaturedHubSheet(
  BuildContext context, {
  required VoidCallback onOpenMyHub,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: context.c.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => _FeaturedHubSheet(
      hostContext: context,
      onOpenMyHub: onOpenMyHub,
    ),
  );
}

class _FeaturedHubSheet extends StatelessWidget {
  const _FeaturedHubSheet({
    required this.hostContext,
    required this.onOpenMyHub,
  });

  /// سياق الأب — يبقى مركَّباً بعد إغلاق الورقة، فتُفتح منه الوجهات.
  final BuildContext hostContext;

  /// «صمّم بطاقة دعوتك» — ينقل إلى «مناسباتي» ليختار المستخدم مناسبتها.
  final VoidCallback onOpenMyHub;

  @override
  Widget build(BuildContext context) {
    final signedIn = AppServices.of(context).auth.isSignedIn;
    final c = context.c;

    // إغلاق الورقة أولاً، ثم الفعل على سياق الأب — بهذا الترتيب وحده لا
    // يُطلب من سياقٍ خرج من الشجرة.
    void closeThen(VoidCallback action) {
      Navigator.of(context).pop();
      action();
    }

    void push(Widget screen) {
      Navigator.of(hostContext).push(
        MaterialPageRoute<void>(builder: (_) => screen),
      );
    }

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.65,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 18, end: 8),
            child: Row(
              children: [
                Text(
                  'مميّز عندنا',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: c.ink,
                  ),
                ),
                const Spacer(),
                IconButton(
                  key: const Key('featured_hub_close'),
                  tooltip: 'إغلاق',
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                InkWell(
                  key: const Key('featured_hub_hero'),
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => closeThen(() {
                    // الضيف يُوقَف عند حاجز الدخول الموحّد، والمسجَّل يذهب إلى
                    // «مناسباتي» ليختار المناسبة التي يصمّم بطاقتها من كرتها.
                    if (signedIn) {
                      onOpenMyHub();
                    } else {
                      openSignInGate(
                        hostContext,
                        'سجّل الدخول لتصمّم بطاقة دعوتك',
                      );
                    }
                  }),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: c.gold, width: 1.5),
                      gradient: LinearGradient(
                        colors: [
                          c.gold.withValues(alpha: 0.12),
                          c.surface,
                        ],
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(13),
                            gradient: LinearGradient(
                              colors: [const Color(0xFFF4D57B), c.gold],
                            ),
                          ),
                          child: Icon(
                            Icons.card_giftcard,
                            size: 22,
                            color: c.onSky,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'صمّم بطاقة دعوتك',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                  color: c.ink,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '١٢ قالباً جاهزاً، شاركها بالواتساب',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: c.inkSoft,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_left, color: c.inkFaint),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  childAspectRatio: 0.82,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  children: [
                    _tile(
                      context,
                      index: 0,
                      title: 'حاسبة الذهب',
                      description: 'سعر الغرام اليوم',
                      icon: Icons.diamond_outlined,
                      onTap: () => closeThen(
                        () => push(
                          const ServicesPricesScreen(initial: PricesTool.gold),
                        ),
                      ),
                    ),
                    _tile(
                      context,
                      index: 1,
                      title: 'محوّل العملات',
                      description: 'شيكل، دولار، دينار، يورو',
                      icon: Icons.currency_exchange,
                      onTap: () => closeThen(
                        () => push(
                          const ServicesPricesScreen(initial: PricesTool.fx),
                        ),
                      ),
                    ),
                    _tile(
                      context,
                      index: 2,
                      title: 'ألبومات الأعراس',
                      description: 'صور وفيديوهات أعراس بلدك',
                      icon: Icons.photo_library_outlined,
                      onTap: () => closeThen(
                        () => push(const AlbumsScreen()),
                      ),
                    ),
                    _tile(
                      context,
                      index: 3,
                      title: 'البث المباشر',
                      description: 'شاهد البث والحلقات السابقة',
                      icon: Icons.live_tv,
                      onTap: () => closeThen(
                        () => openLiveScreen(hostContext),
                      ),
                    ),
                    _tile(
                      context,
                      index: 4,
                      title: 'آخر خبر',
                      description: 'أخبار محافظتك',
                      icon: Icons.newspaper,
                      onTap: () => closeThen(
                        () => push(const NewsScreen()),
                      ),
                    ),
                    _tile(
                      context,
                      index: 5,
                      title: 'متاجرنا',
                      description: 'منصّة كترا للمتاجر',
                      icon: Icons.storefront_outlined,
                      onTap: () => closeThen(
                        () => openExternalLink(
                          hostContext,
                          Uri.parse(storesPlatformUrl),
                          failureMessage: 'تعذّر فتح منصة متاجرنا',
                        ),
                      ),
                    ),
                    _tile(
                      context,
                      index: 6,
                      title: 'دفتر النقوط',
                      description: 'سجّل النقوط اللي عليك واللي إلك',
                      icon: Icons.menu_book_outlined,
                      onTap: () => closeThen(() {
                        if (signedIn) {
                          push(const NokootScreen());
                        } else {
                          openSignInGate(
                            hostContext,
                            'سجّل الدخول لفتح دفتر النقوط',
                          );
                        }
                      }),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// بطاقة واحدة في الشبكة — مفتاحها `featured_hub_item_$index` بترتيب
  /// الجدول الثابت.
  Widget _tile(
    BuildContext context, {
    required int index,
    required String title,
    required String description,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    final c = context.c;
    return Material(
      color: c.surfaceSunk,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        key: Key('featured_hub_item_$index'),
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: c.sky),
              ),
              const SizedBox(height: 6),
              Flexible(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: c.ink,
                  ),
                ),
              ),
              const SizedBox(height: 2),
              Flexible(
                child: Text(
                  description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 10, color: c.inkSoft),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
