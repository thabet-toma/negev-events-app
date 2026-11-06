import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:negev_events/state/rate_us.dart';
import 'package:negev_events/theme.dart';
import 'package:negev_events/widgets/rate_us_prompt.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «قيّمنا» (تذكرة #163): العدّاد المحلي، وعتبة اللحظة الثالثة، والتبريد
/// [rateUsCooldownDays] يوماً، وأن اللحظة الفاشلة لا تزيد العدّاد.
///
/// لا شبكة ولا متجر حقيقي: `SharedPreferences` وهمية، والحوار يُفتح من موضع
/// الاستدعاء نفسه الذي تستعمله الشاشات (`maybeShowRateUsPrompt`)، والعدّ من
/// `runPositiveMoment` الذي يغلّف نجاح النداء في `events_screen` و
/// `event_details_screen` و`my_list_screen` و`congratulations`.

class _PromptHost extends StatelessWidget {
  const _PromptHost();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: Builder(
            builder: (context) => Column(
              children: [
                ElevatedButton(
                  key: const Key('host_prompt'),
                  onPressed: () => maybeShowRateUsPrompt(context),
                  child: const Text('اعرض حوار «قيّمنا»'),
                ),
                ElevatedButton(
                  key: const Key('host_success_moment'),
                  onPressed: () => runPositiveMoment(() async {}),
                  child: const Text('لحظة ناجحة'),
                ),
                ElevatedButton(
                  key: const Key('host_failed_moment'),
                  onPressed: () async {
                    try {
                      await runPositiveMoment(
                        () async => throw StateError('فشل النداء'),
                      );
                    } catch (_) {
                      // الفشل هو موضوع الاختبار نفسه، لا يُترك يفلت.
                    }
                  },
                  child: const Text('لحظة فاشلة'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _pumpHost(WidgetTester tester) async {
  await tester.pumpWidget(const _PromptHost());
  await tester.pump();
}

/// نقرة ثم تقدّم زمنيّ كافٍ لظهور الحوار: فتحه ينتظر قراءة التخزين وكتابة
/// التبريد، وإطارٌ واحد لا يكفي دائماً.
Future<void> _tapAndAdvance(WidgetTester tester, Key key) async {
  await tester.tap(find.byKey(key));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

Future<int> _moments() async =>
    (await SharedPreferences.getInstance()).getInt(rateUsMomentsKey) ?? 0;

Future<int?> _promptedAt() async =>
    (await SharedPreferences.getInstance()).getInt(rateUsPromptedAtKey);

void main() {
  testWidgets('لا حوار قبل اللحظة الإيجابية الثالثة', (tester) async {
    // لحظتان محفوظتان: العتبة لم تبلغ بعد.
    SharedPreferences.setMockInitialValues({rateUsMomentsKey: 2});
    await _pumpHost(tester);

    await _tapAndAdvance(tester, const Key('host_prompt'));
    expect(
      find.byKey(const Key('rate_us_dialog')),
      findsNothing,
      reason: 'لحظتان لا تكفيان — الحوار بعد الثالثة',
    );
    expect(
      await _promptedAt(),
      isNull,
      reason: 'لا تبريد بلا ظهور: عرضٌ لم يقع لا يستهلك فترة الانتظار',
    );
  });

  testWidgets('الثالثة تُشعل الحوار، والتبريد يُكتب قبل أي زرّ',
      (tester) async {
    SharedPreferences.setMockInitialValues({rateUsMomentsKey: 2});
    await _pumpHost(tester);

    await tester.tap(find.byKey(const Key('host_success_moment')));
    await tester.pump();
    expect(await _moments(), 3, reason: 'اللحظة الناجحة تزيد العدّاد واحداً');

    await _tapAndAdvance(tester, const Key('host_prompt'));
    expect(
      find.byKey(const Key('rate_us_dialog')),
      findsOneWidget,
      reason: 'اللحظة الثالثة تُشعل الحوار',
    );

    final prompted = await _promptedAt();
    expect(
      prompted,
      isNotNull,
      reason: 'التبريد يُكتب قبل العرض، فيشمل القبول والرفض معاً',
    );

    // الرفض لا يمسح التبريد ولا يعيد كتابته بقيمة أخرى.
    await _tapAndAdvance(tester, const Key('rate_us_later'));
    expect(find.byKey(const Key('rate_us_dialog')), findsNothing);
    expect(
      await _promptedAt(),
      prompted,
      reason: 'إغلاق الحوار لا يمسّ وقت التبريد',
    );
  });

  testWidgets('بعد 90 يوماً يعود الحوار، وقبلها لا', (tester) async {
    final now = DateTime.now();
    SharedPreferences.setMockInitialValues({
      rateUsMomentsKey: 3,
      rateUsPromptedAtKey:
          now.subtract(const Duration(days: 89)).millisecondsSinceEpoch,
    });
    await _pumpHost(tester);

    await _tapAndAdvance(tester, const Key('host_prompt'));
    expect(
      find.byKey(const Key('rate_us_dialog')),
      findsNothing,
      reason: '89 يوماً داخل التبريد — لا حوار',
    );

    // زيارة بعد 91 يوماً من آخر ظهور: التبريد انقضى.
    await tester.pumpWidget(const SizedBox());
    SharedPreferences.setMockInitialValues({
      rateUsMomentsKey: 3,
      rateUsPromptedAtKey:
          now.subtract(const Duration(days: 91)).millisecondsSinceEpoch,
    });
    await _pumpHost(tester);

    await _tapAndAdvance(tester, const Key('host_prompt'));
    expect(
      find.byKey(const Key('rate_us_dialog')),
      findsOneWidget,
      reason: 'بعد 90 يوماً يحين الحوار من جديد',
    );
  });

  testWidgets('لحظة فاشلة لا تزيد العدّاد', (tester) async {
    SharedPreferences.setMockInitialValues({rateUsMomentsKey: 2});
    await _pumpHost(tester);

    await tester.tap(find.byKey(const Key('host_failed_moment')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(
      await _moments(),
      2,
      reason: 'الفشل يرمي قبل العدّ — لا لحظة إيجابية بلا نجاح',
    );
  });

  test('رابط Play والتبريد محفوظان كما اتُّفق في التذكرة', () {
    // القيمة من `applicationId` في mobile/android/app/build.gradle.kts:43 —
    // والاختبار يمسك أي انحراف في الرابط نفسه، لا يقرأ ملف البناء.
    expect(
      rateUsPlayStoreUrl,
      'https://play.google.com/store/apps/details?id=com.negev.negev_events',
    );
    expect(rateUsCooldownDays, 90);
  });
}
