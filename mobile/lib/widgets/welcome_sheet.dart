import 'package:flutter/material.dart';

import '../state/welcome.dart';
import '../theme.dart';

/// شاشة الترحيب — مرة واحدة لكل تثبيت، وقبل ورقة «من أي منطقة أنت؟» في أول
/// تشغيل (تذكرة #163).
///
/// محتواها واحد لا أكثر: العلامة المولَّدة `assets/brand/mark-full.png` (نفس
/// أصل ترويسة الهيكل، فلا نسخة ثانية للشعار في العميل)، وجملة تعريف، وثلاث
/// بطاقات تقول ما يجده المستخدم، و«تخطّي». لا زرّ يفتح وجهة بعينها: الشاشة
/// تعريفٌ لا منتقي تنقّل، وورقة المنطقة تأتي بعدها مباشرةً.
///
/// **التخطّي يذهب إلى ورقة المنطقة لا إلى التغذية**: الإغلاق هنا لا يعني تجاوز
/// أول تشغيل، والنداء التالي في `HomeShell` يفتح الورقة.
Future<void> showWelcomeSheet(BuildContext context) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.c.surfaceSunk,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => const _WelcomeSheet(),
  );

  // أي خروج (تخطٍّ، أو سحب، أو نقرة خارج، أو زرّ رجوع) يُسجَّل هنا — لا مسار
  // خروج ينساه أحد.
  await markWelcomeSeen();
}

class _WelcomeSheet extends StatelessWidget {
  const _WelcomeSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        key: const Key('welcome_sheet'),
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.9,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 22, 18, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // المحتوى وحده يتمرّر على الشاشات القصيرة؛ «تخطّي» يبقى ظاهراً
              // في أسفل الورقة دائماً — مخرجٌ لا يحتاج تمريراً ليجده أحد.
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: Image.asset(
                          'assets/brand/mark-full.png',
                          height: 96,
                          fit: BoxFit.contain,
                          filterQuality: FilterQuality.high,
                          // الكلمة مرسومة في العلامة نفسها؛ هذا اسمٌ للقارئ الآلي.
                          semanticLabel: 'أعراسنا',
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'أهلاً بك في أعراسنا',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: context.c.ink,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'منصّة مناسبات النقب: مناسبات بلدك، وألبومات الأعراس، ودفتر '
                        'النقوط — في مكان واحد.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: context.c.inkSoft,
                          fontSize: 13.5,
                          height: 1.6,
                        ),
                      ),
                      const SizedBox(height: 18),
                      const _FeatureCard(
                        key: Key('welcome_card_events'),
                        icon: Icons.celebration_outlined,
                        title: 'مناسبات بلدك',
                        line: 'الأعراس والخطوبات والعزا في محافظتك، على الخريطة وفي '
                            'التغذية.',
                      ),
                      const _FeatureCard(
                        key: Key('welcome_card_albums'),
                        icon: Icons.photo_library_outlined,
                        title: 'ألبومات الأعراس',
                        line: 'صور وفيديوهات الأعراس بأسماء أصحابها، من أرشيف المنصّة.',
                      ),
                      const _FeatureCard(
                        key: Key('welcome_card_nokoot'),
                        icon: Icons.menu_book_outlined,
                        title: 'دفتر النقوط',
                        line: 'دفترك الخاص: سجّل من أعطيت ومن أخذت، بلا دفاتر ورقية.',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 6),
              TextButton(
                key: const Key('welcome_skip'),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('تخطّي'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// بطاقة تعريف واحدة — غير قابلة للنقر عمداً: الشاشة تقول ماذا يوجد، ولا
/// تفتح وجهة قبل اختيار المحافظة.
class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    super.key,
    required this.icon,
    required this.title,
    required this.line,
  });

  final IconData icon;
  final String title;
  final String line;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: context.c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.c.line),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: context.c.skyWash,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: context.c.sky),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: context.c.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  line,
                  style: TextStyle(
                    color: context.c.inkSoft,
                    fontSize: 12.5,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
