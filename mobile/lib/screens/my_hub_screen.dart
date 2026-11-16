import 'package:flutter/material.dart';

import '../main.dart';
import '../theme.dart';
import '../widgets/congratulations.dart' show openSignInGate;
import 'my_events_screen.dart';
import 'my_list_screen.dart';

/// «مناسباتي» — الوجهة الرابعة في الشريط السفلي (الجديدة في إعادة تصميم
/// الرئيسية).
///
/// تُعرض فيها **مناسباتي التي نشرتها** أوّلاً، ثمّ **«قائمتي»** (المحفوظات)
/// تحتها في شاشة واحدة: مكانٌ واحد يرى فيه المستخدم ما نشره وما تابعه، بلا
/// وجهتين متقاربتين في الشريط ولا نسخة ثانية من قائمته.
///
/// وبطاقة «صمّم بطاقة دعوتك» في «مميّز عندنا» تنتهي هنا بقصد: الاختيار يحتاج
/// مناسبةً بعينها، ومناسباته هي ما يختار منها، ثمّ يفتح «صمّم بطاقة» من كرتها.
///
/// ولا `Scaffold` ولا `AppBar` هنا: الإطار من الهيكل (الشعار والترويسة الغنية
/// والكبستان)، كما في وجهات الشريط الأخرى.
class MyHubScreen extends StatefulWidget {
  const MyHubScreen({super.key, this.isActive = true});

  /// هل الشاشة معروضة الآن؟ تُبنى دائماً داخل `IndexedStack` في الهيكل،
  /// فالمخفية تمرّر `false` إلى «قائمتي» كي لا تجلب وهي بعيدة — نفس دلالة
  /// [MyListScreen.isActive].
  final bool isActive;

  @override
  State<MyHubScreen> createState() => _MyHubScreenState();
}

class _MyHubScreenState extends State<MyHubScreen> {
  final GlobalKey<MyEventsSectionState> _eventsKey =
      GlobalKey<MyEventsSectionState>();
  final GlobalKey<MyListSectionState> _listKey =
      GlobalKey<MyListSectionState>();

  /// سحب للتحديث: القسمان معاً لا الأوّل وحده، ثمّ ينتهي المؤشّر ولو فشل
  /// أحدهما (`reload` في كل قسم يطوي فشله ويعرضه في مكانه).
  Future<void> _refresh() async {
    await Future.wait([
      _eventsKey.currentState?.reload() ?? Future.value(),
      _listKey.currentState?.reload() ?? Future.value(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final auth = AppServices.of(context).auth;

    return AnimatedBuilder(
      animation: auth,
      builder: (context, _) {
        if (!auth.isSignedIn) return _buildGuest();
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 96),
            children: [
              _header(
                'مناسباتي اللي نشرتها',
                const Key('my_hub_header_published'),
              ),
              MyEventsSection(
                key: _eventsKey,
                embedded: true,
                isActive: widget.isActive,
              ),
              _header('قائمتي', const Key('my_hub_header_list')),
              MyListSection(
                key: _listKey,
                embedded: true,
                isActive: widget.isActive,
              ),
            ],
          ),
        );
      },
    );
  }

  /// عنوان قسم داخل الشاشة — القسمان يعرفان شكل قائمتهما، والعنوان هنا لأن
  /// ترتيبهما وما بينهما شأن هذه الشاشة.
  Widget _header(String title, Key key) {
    return Padding(
      key: key,
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w900,
          color: context.c.ink,
        ),
      ),
    );
  }

  /// الزائر: دعوة صريحة إلى الدخول بدل قائمتين فارغتين — الشاشتان تحتاجان
  /// حساباً أصلاً، والحاجز الموحّد هو مَن يفتح شاشة الدخول.
  Widget _buildGuest() {
    return Center(
      key: const Key('my_hub_guest'),
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.bookmark_border, size: 48, color: context.c.inkFaint),
            const SizedBox(height: 16),
            Text(
              'سجّل دخولك لترى مناسباتك',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: context.c.ink,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () =>
                  openSignInGate(context, 'سجّل الدخول لعرض مناسباتك'),
              child: const Text('دخول'),
            ),
          ],
        ),
      ),
    );
  }
}
