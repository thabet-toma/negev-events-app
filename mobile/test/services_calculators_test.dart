import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:negev_events/screens/services_calculators_screen.dart';
import 'package:negev_events/theme.dart';

/// حاسبات «خدماتنا» (تذكرة #190) — خمس حاسبات تعمل في الجهاز.
///
/// الشاشة لا تطلب `AppServices` ولا `NegevApi` إطلاقاً، فتُبنى هنا بلا عميل
/// وهمي ولا جسم استجابة: لو احتاجت شبكة لما بُنيت أصلاً. والحساب الخالص
/// (`hijriFromGregorian`, `splitExpenses`, …) يُختبر وحده، ثم تُقاد اللوحات
/// الحقيقية بالأزرار والحقول نفسها التي يستعملها المستخدم.

/// يبني شاشة الحاسبات على نافذة عالية كي تُبنى اللوحة كلها في عرض واحد.
Future<void> pumpCalculators(
  WidgetTester tester, {
  ServicesCalculator initial = ServicesCalculator.budget,
}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: ServicesCalculatorsScreen(initial: initial),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// `YYYY-MM-DD` بالتوقيت المحلي لهدف العدّ التنازلي في الاختبار.
String localIsoDay(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

Future<void> openTab(WidgetTester tester, ServicesCalculator calculator) async {
  await tester.tap(find.byKey(Key('calc_tab_${calculator.name}')));
  await tester.pumpAndSettle();
}

Future<void> runCalculator(WidgetTester tester, String key) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
}

void main() {
  group('تقويم أم القرى — حساب خالص يُطابق مراجع أم القرى', () {
    test('١٠ أبريل ٢٠٢٤ = ١ شوال ١٤٤٥هـ (عيد الفطر ١٤٤٥)', () {
      final hijri = hijriFromGregorian(DateTime(2024, 4, 10));
      expect(hijri.year, 1445);
      expect(hijri.month, 10);
      expect(hijri.day, 1);
      expect(hijri.label, '١ شوال ١٤٤٥هـ');
    });

    test('١١ مارس ٢٠٢٤ = ١ رمضان ١٤٤٥هـ', () {
      final hijri = hijriFromGregorian(DateTime(2024, 3, 11));
      expect((hijri.year, hijri.month, hijri.day), (1445, 9, 1));
    });

    test('٢٣ مارس ٢٠٢٣ = ١ رمضان ١٤٤٤هـ', () {
      final hijri = hijriFromGregorian(DateTime(2023, 3, 23));
      expect((hijri.year, hijri.month, hijri.day), (1444, 9, 1));
    });

    test('١ يناير ٢٠٠٠ = ٢٤ رمضان ١٤٢٠هـ', () {
      final hijri = hijriFromGregorian(DateTime(2000, 1, 1));
      expect((hijri.year, hijri.month, hijri.day), (1420, 9, 24));
    });
  });

  group('الحساب الخالص — أمثلة معروفة وحالات غير صالحة', () {
    test('مجموع الميزانية بالأغورة، والرسائل العربية للخطأ', () {
      final total = weddingBudgetTotal(const [
        CalcLine(name: 'القاعة', amount: '1500'),
        CalcLine(name: 'العشاء', amount: '1000'),
        CalcLine(name: 'الزفة', amount: '250.5'),
      ]);
      expect(total.value, 275050);

      expect(
        weddingBudgetTotal(const []).error,
        'أضف بنداً واحداً على الأقل',
      );
      expect(
        weddingBudgetTotal(const [CalcLine(name: ' ', amount: '10')]).error,
        'الصف ١: اكتب اسم البند أولاً',
      );
      expect(
        weddingBudgetTotal(const [CalcLine(name: 'قاعة', amount: '-5')]).error,
        'الصف ١ «قاعة»: المبلغ لا يكون سالباً',
      );
      expect(
        weddingBudgetTotal(const [CalcLine(name: 'قاعة', amount: 'ألف')]).error,
        'الصف ١ «قاعة»: المبلغ بالأرقام فقط (مثل ١٥٠٠)',
      );
    });

    test('التسوية: تحويل واحد في المثال المعروف، والأغورة لا تضيع في غير القابل للقسمة', () {
      final plan = splitExpenses(const [
        CalcLine(name: 'علي', amount: '600'),
        CalcLine(name: 'سارة', amount: '300'),
        CalcLine(name: 'حسن', amount: '0'),
      ]).value!;
      expect(plan.totalCents, 90000);
      expect(plan.shareCents, 30000);
      expect(plan.transfers.length, 1);
      expect(plan.transfers.single.from, 'حسن');
      expect(plan.transfers.single.to, 'علي');
      expect(plan.transfers.single.cents, 30000);

      // ٢٠٠ على ثلاثة: حصص ٦٦٫٦٧ و٦٦٫٦٧ و٦٦٫٦٦، ومجموع التحويلين ٦٦٫٦٦ تماماً.
      final remainder = splitExpenses(const [
        CalcLine(name: 'علي', amount: '100'),
        CalcLine(name: 'سارة', amount: '100'),
        CalcLine(name: 'حسن', amount: '0'),
      ]).value!;
      expect(remainder.shareCents, 6666);
      expect(
        remainder.transfers.fold<int>(0, (sum, item) => sum + item.cents),
        6666,
      );
      expect(remainder.transfers.map((item) => item.cents), [3333, 3333]);
    });

    test('التقسيم يرفض صفراً وشخصاً واحداً وقسمة على صفر', () {
      expect(
        splitExpenses(const []).error,
        'أضف شخصاً واحداً على الأقل',
      );
      expect(
        splitExpenses(const [CalcLine(name: 'علي', amount: '100')]).error,
        'شخص واحد فقط — لا شيء يُقسَّم عليه',
      );
      expect(
        splitExpenses(const [
          CalcLine(name: 'علي', amount: '0'),
          CalcLine(name: 'سارة', amount: '0'),
        ]).error,
        'مجموع ما دفعه الجميع صفر — لا شيء يُقسَّم',
      );
    });

    test('التسوية لا تخترع أوغراً ولا تُضيّعه في محاولات متعددة', () {
      // مولّد ثابت البذرة: نفس المحاولات في كل تشغيل، فلا عشوائية تُخفي فشلاً.
      final random = Random(20261013);
      for (var trial = 0; trial < 40; trial += 1) {
        final count = 2 + random.nextInt(6);
        final lines = [
          for (var index = 0; index < count; index += 1)
            CalcLine(
              name: 'p$index',
              amount:
                  '${100 + random.nextInt(5000)}.'
                  '${random.nextInt(100).toString().padLeft(2, '0')}',
            ),
        ];
        final paid = [
          for (final line in lines) parseCalcAmount(line.amount).value!,
        ];
        final total = paid.fold<int>(0, (sum, value) => sum + value);
        final base = total ~/ count;
        final remainder = total % count;
        final plan = splitExpenses(lines).value!;

        expect(plan.totalCents, total);
        expect(plan.shareCents, base);
        expect(plan.transfers.length, lessThanOrEqualTo(count - 1));

        final outflow = List<int>.filled(count, 0);
        final inflow = List<int>.filled(count, 0);
        for (final transfer in plan.transfers) {
          expect(transfer.cents, greaterThan(0));
          expect(transfer.from, isNot(transfer.to));
          final from = int.parse(transfer.from.substring(1));
          final to = int.parse(transfer.to.substring(1));
          outflow[from] += transfer.cents;
          inflow[to] += transfer.cents;
        }
        for (var index = 0; index < count; index += 1) {
          final share = base + (index < remainder ? 1 : 0);
          expect(
            inflow[index] - outflow[index],
            paid[index] - share,
            reason:
                'المحاولة $trial: الشخص $index يستلم زيادة ما دفع أو يسدّ نقصه بالضبط',
          );
        }
      }
    });

    test('تقدير المعازيم: ٢٠×٨ + ٤×١٠ = ٢٠٠، والفراغ صفر والكلّ صفر خطأ', () {
      final estimate = estimateGuests(
        families: '20',
        perFamily: '8',
        tables: '4',
        perTable: '10',
      ).value!;
      expect(estimate.total, 200);
      expect(estimate.fromFamilies, 160);
      expect(estimate.fromTables, 40);

      expect(
        estimateGuests(
          families: '',
          perFamily: '',
          tables: '',
          perTable: '',
        ).error,
        'أدخل عدداً أكبر من صفر في أحد الحقول — لا شيء يُقدَّر',
      );
      expect(
        estimateGuests(
          families: 'كثير',
          perFamily: '2',
          tables: '',
          perTable: '',
        ).error,
        'عدد العائلات: العدد بالأرقام فقط',
      );
      expect(
        estimateGuests(
          families: '-3',
          perFamily: '2',
          tables: '',
          perTable: '',
        ).error,
        'عدد العائلات: العدد لا يكون سالباً',
      );
    });

    test('أيام العدّ التنازلي بين تاريخين محليين، والتاريخ غير الموجود يُرفض', () {
      expect(
        daysBetweenDates(DateTime(2026, 1, 1), DateTime(2026, 3, 1)),
        59,
      );
      expect(
        daysBetweenDates(DateTime(2026, 3, 1), DateTime(2026, 1, 1)),
        -59,
      );
      expect(parseCalcDate('2024-02-29').isOk, isTrue, reason: 'سنة كبيسة');
      expect(parseCalcDate('2026-02-31').error, 'هذا التاريخ غير موجود');
      expect(
        parseCalcDate('').error,
        'اختر تاريخاً أولاً من التقويم',
      );
      expect(
        parseCalcDate('abc').error,
        'التاريخ غير صحيح — اكتبه مثل 2026-12-31',
      );
    });
  });

  group('الشاشة — خمس لوحات تعمل بلا شبكة', () {
    testWidgets('ميزانية العرس تجمع البنود، وترفض الاسم الفارغ والسالب والنصّ', (
      tester,
    ) async {
      await pumpCalculators(tester);

      await tester.enterText(
        find.byKey(const Key('calc_budget_name_0')),
        'القاعة',
      );
      await tester.enterText(
        find.byKey(const Key('calc_budget_amount_0')),
        '1500',
      );
      await tester.enterText(
        find.byKey(const Key('calc_budget_name_1')),
        'العشاء',
      );
      await tester.enterText(
        find.byKey(const Key('calc_budget_amount_1')),
        '1000.50',
      );
      await tester.tap(find.byKey(const Key('calc_budget_add')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('calc_budget_name_2')),
        'الزفة',
      );
      await tester.enterText(
        find.byKey(const Key('calc_budget_amount_2')),
        '249.50',
      );

      await runCalculator(tester, 'calc_budget_run');
      expect(
        find.text('مجموع ميزانية العرس ٢٬٧٥٠ ₪ على ٣ بنود.'),
        findsOneWidget,
        reason: 'المجموع بالأغورة بالأرقام العربية',
      );
      expect(find.textContaining('NaN'), findsNothing);
      expect(find.textContaining('Infinity'), findsNothing);

      // اسم فارغ: رسالة عربية، لا شيء غير ذلك.
      await tester.enterText(find.byKey(const Key('calc_budget_name_0')), '');
      await runCalculator(tester, 'calc_budget_run');
      expect(find.text('الصف ١: اكتب اسم البند أولاً'), findsOneWidget);

      // سالب ثم نصّ.
      await tester.enterText(
        find.byKey(const Key('calc_budget_name_0')),
        'القاعة',
      );
      await tester.enterText(
        find.byKey(const Key('calc_budget_amount_0')),
        '-50',
      );
      await runCalculator(tester, 'calc_budget_run');
      expect(
        find.text('الصف ١ «القاعة»: المبلغ لا يكون سالباً'),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('calc_budget_amount_0')),
        'ألف',
      );
      await runCalculator(tester, 'calc_budget_run');
      expect(
        find.text('الصف ١ «القاعة»: المبلغ بالأرقام فقط (مثل ١٥٠٠)'),
        findsOneWidget,
      );
      expect(find.textContaining('NaN'), findsNothing);
    });

    testWidgets('تقسيم المصاريف يسمّي الدافع والمستلم، ويرفض الصفر وشخصاً واحداً', (
      tester,
    ) async {
      await pumpCalculators(tester);
      await openTab(tester, ServicesCalculator.split);

      await tester.enterText(find.byKey(const Key('calc_split_name_0')), 'علي');
      await tester.enterText(find.byKey(const Key('calc_split_amount_0')), '600');
      await tester.enterText(
        find.byKey(const Key('calc_split_name_1')),
        'سارة',
      );
      await tester.enterText(
        find.byKey(const Key('calc_split_amount_1')),
        '300',
      );
      await tester.tap(find.byKey(const Key('calc_split_add')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('calc_split_name_2')), 'حسن');
      await tester.enterText(find.byKey(const Key('calc_split_amount_2')), '0');

      await runCalculator(tester, 'calc_split_run');
      expect(
        find.text(
          'مجموع المصاريف ٩٠٠ ₪ على ٣ أشخاص — حصّة كل شخص نحو ٣٠٠ ₪. '
          'التسوية: حسن يدفع إلى علي ٣٠٠ ₪.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('Infinity'), findsNothing);

      // مجموع صفر: قسمة على صفر برسالة عربية.
      for (final id in [0, 1, 2]) {
        await tester.enterText(
          find.byKey(Key('calc_split_amount_$id')),
          '0',
        );
      }
      await runCalculator(tester, 'calc_split_run');
      expect(
        find.text('مجموع ما دفعه الجميع صفر — لا شيء يُقسَّم'),
        findsOneWidget,
      );

      // شخص واحد فقط: يُحذف الصفّان الأخيران.
      await tester.tap(find.byKey(const Key('calc_split_remove_1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('calc_split_remove_2')));
      await tester.pumpAndSettle();
      await runCalculator(tester, 'calc_split_run');
      expect(
        find.text('شخص واحد فقط — لا شيء يُقسَّم عليه'),
        findsOneWidget,
      );
      expect(find.textContaining('NaN'), findsNothing);
    });

    testWidgets('عدد المعازيم يضرب العائلات والطاولات ويشرح الحساب', (
      tester,
    ) async {
      await pumpCalculators(tester);
      await openTab(tester, ServicesCalculator.guests);

      await tester.enterText(
        find.byKey(const Key('calc_guests_families')),
        '20',
      );
      await tester.enterText(
        find.byKey(const Key('calc_guests_per_family')),
        '8',
      );
      await tester.enterText(find.byKey(const Key('calc_guests_tables')), '4');
      await tester.enterText(
        find.byKey(const Key('calc_guests_per_table')),
        '10',
      );
      await runCalculator(tester, 'calc_guests_run');
      expect(
        find.text(
          'تقدير عدد المعازيم: ٢٠٠ — العائلات ٢٠ × ٨ = ١٦٠، والطاولات ٤ × ١٠ = ٤٠.',
        ),
        findsOneWidget,
      );

      // نصّ بدل رقم: اسم الحقل في الرسالة.
      await tester.enterText(
        find.byKey(const Key('calc_guests_families')),
        'كثير',
      );
      await runCalculator(tester, 'calc_guests_run');
      expect(find.text('عدد العائلات: العدد بالأرقام فقط'), findsOneWidget);

      // كل الحقول فارغة: لا شيء يُقدَّر.
      for (final key in const [
        'calc_guests_families',
        'calc_guests_per_family',
        'calc_guests_tables',
        'calc_guests_per_table',
      ]) {
        await tester.enterText(find.byKey(Key(key)), '');
      }
      await runCalculator(tester, 'calc_guests_run');
      expect(
        find.text('أدخل عدداً أكبر من صفر في أحد الحقول — لا شيء يُقدَّر'),
        findsOneWidget,
      );
    });

    testWidgets('العدّ التنازلي: اليوم، و٤٥ يوماً، وتاريخ غير موجود', (
      tester,
    ) async {
      await pumpCalculators(tester);
      await openTab(tester, ServicesCalculator.countdown);

      // الحقل يبدأ بتاريخ اليوم: الضغط وحده يقول «اليوم».
      await runCalculator(tester, 'calc_countdown_run');
      expect(find.textContaining('الموعد اليوم — '), findsOneWidget);

      // ٤٥ يوماً من اليوم بالتقويم المحلي.
      final now = DateTime.now();
      final target = DateTime(now.year, now.month, now.day + 45);
      await tester.enterText(
        find.byKey(const Key('calc_countdown_date')),
        localIsoDay(target),
      );
      await runCalculator(tester, 'calc_countdown_run');
      expect(
        find.textContaining('بقي ٤٥ يوماً على الموعد'),
        findsOneWidget,
        reason: 'الأيام تُحسب بالتقويم لا بساعات الصيف',
      );

      // تاريخ غير موجود ثم نصّ ثم فراغ — رسالة عربية في كل مرة.
      await tester.enterText(
        find.byKey(const Key('calc_countdown_date')),
        '2026-02-31',
      );
      await runCalculator(tester, 'calc_countdown_run');
      expect(find.text('هذا التاريخ غير موجود'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('calc_countdown_date')),
        'abc',
      );
      await runCalculator(tester, 'calc_countdown_run');
      expect(
        find.text('التاريخ غير صحيح — اكتبه مثل 2026-12-31'),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(const Key('calc_countdown_date')),
        '',
      );
      await runCalculator(tester, 'calc_countdown_run');
      expect(find.text('اختر تاريخاً أولاً من التقويم'), findsOneWidget);
      expect(find.textContaining('NaN'), findsNothing);
    });

    testWidgets('التاريخ الهجري يطابق مرجعاً معروفاً، والتنبيه «تقريبي ±يوم» ظاهر', (
      tester,
    ) async {
      await pumpCalculators(tester);
      await openTab(tester, ServicesCalculator.hijri);

      await tester.enterText(
        find.byKey(const Key('calc_hijri_date')),
        '2024-04-10',
      );
      await runCalculator(tester, 'calc_hijri_run');
      expect(
        find.text('الأربعاء ١ شوال ١٤٤٥هـ — يوافق ١٠ أبريل ٢٠٢٤.'),
        findsOneWidget,
        reason: '١ شوال ١٤٤٥ = ١٠ أبريل ٢٠٢٤ في تقويم أم القرى',
      );

      // التنبيه نصّ ظاهر في اللوحة، لا tooltip.
      expect(find.byKey(const Key('calc_hijri_note')), findsOneWidget);
      expect(find.textContaining('تقريبي ±يوم'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('calc_hijri_date')),
        '2024-03-11',
      );
      await runCalculator(tester, 'calc_hijri_run');
      expect(
        find.text('الاثنين ١ رمضان ١٤٤٥هـ — يوافق ١١ مارس ٢٠٢٤.'),
        findsOneWidget,
      );

      // غير صالح: رسالة عربية لا «NaNهـ».
      await tester.enterText(
        find.byKey(const Key('calc_hijri_date')),
        'abc',
      );
      await runCalculator(tester, 'calc_hijri_run');
      expect(
        find.text('التاريخ غير صحيح — اكتبه مثل 2026-12-31'),
        findsOneWidget,
      );
      expect(find.textContaining('NaN'), findsNothing);
    });
  });
}
