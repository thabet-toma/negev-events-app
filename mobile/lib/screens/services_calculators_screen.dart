import 'package:flutter/material.dart';

import '../theme.dart';

/// حاسبات «خدماتنا» الخمس (تذكرة #190) — ميزانية العرس، تقسيم المصاريف، عدد
/// المعازيم، العدّ التنازلي، والتاريخ الهجري.
///
/// كل حساب هنا يجري داخل الجهاز: لا `NegevApi` ولا `http` ولا `SharedPreferences`
/// ولا أي نداء `/api`، ولا يُرسَل مدخل واحد إلى الخادم — فتعمل الشاشة بلا شبكة
/// وبلا حساب. وكل حاسبة تتحقّق من مدخلاتها بنفسها وتعيد رسالة عربية واحدة:
/// نجاحاً أو خطأً، فلا `NaN` ولا `Infinity` على الشاشة.
enum ServicesCalculator { budget, split, guests, countdown, hijri }

extension ServicesCalculatorInfo on ServicesCalculator {
  String get label => switch (this) {
    ServicesCalculator.budget => 'ميزانية العرس',
    ServicesCalculator.split => 'تقسيم المصاريف',
    ServicesCalculator.guests => 'عدد المعازيم',
    ServicesCalculator.countdown => 'العدّ التنازلي',
    ServicesCalculator.hijri => 'التاريخ الهجري',
  };

  String get short => switch (this) {
    ServicesCalculator.budget => 'بنود العرس ومجموعها',
    ServicesCalculator.split => 'من يدفع لمن وكم',
    ServicesCalculator.guests => 'تقدير العدد من العائلات والطاولات',
    ServicesCalculator.countdown => 'أيام تبقّت على الموعد',
    ServicesCalculator.hijri => 'تقويم أم القرى — تقريبي ±يوم',
  };

  IconData get icon => switch (this) {
    ServicesCalculator.budget => Icons.savings_outlined,
    ServicesCalculator.split => Icons.call_split,
    ServicesCalculator.guests => Icons.groups_outlined,
    ServicesCalculator.countdown => Icons.event_available_outlined,
    ServicesCalculator.hijri => Icons.calendar_month_outlined,
  };
}

// ---------------------------------------------------------------------------
// حساب خالص بلا واجهة — يُختبر وحده وتستدعيه اللوحات
// ---------------------------------------------------------------------------

const String _arabicDigits = '٠١٢٣٤٥٦٧٨٩';

/// أسماء الأشهر الهجرية بترتيب أم القرى — تقويم قمري، فلا سنة كبيسة فيه.
const List<String> hijriMonthNames = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

/// ترتيب `DateTime.weekday`: الاثنين ١ … الأحد ٧.
const List<String> arabicWeekdays = [
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

const List<String> gregorianMonthNames = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

/// يكتب الأرقام اللاتينية عربية هندية، ويترك أي محرف آخر كما هو.
String arabicDigits(Object value) {
  final buffer = StringBuffer();
  for (final char in '$value'.split('')) {
    final digit = int.tryParse(char);
    buffer.write(digit == null ? char : _arabicDigits[digit]);
  }
  return buffer.toString();
}

/// فاصل آلاف عربي `٬` على رقم مكتوب لاتينياً.
String groupThousands(String digits) {
  final buffer = StringBuffer();
  for (var index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 == 0) buffer.write('٬');
    buffer.write(digits[index]);
  }
  return buffer.toString();
}

/// عدد صحيح مهيّأ للعرض: ٢٤٠، ١٬٢٥٠.
String formatCalcCount(int value) => arabicDigits(groupThousands('$value'));

/// مبلغ بالأغورة إلى نصّ بالشيكل: ٢٬٥٠٠ ₪ أو ٣٣٫٥٠ ₪.
String formatCalcMoney(int cents) {
  final value = cents < 0 ? 0 : cents;
  final shekels = groupThousands('${value ~/ 100}');
  final agorot = value % 100;
  final text = agorot == 0
      ? shekels
      : '$shekels٫${agorot.toString().padLeft(2, '0')}';
  return '${arabicDigits(text)} ₪';
}

/// صيغة العدد في العربية: مفرد ومثنّى وجمع قِلّة (٣-١٠) وجمع كثرة، بصيغة الجرّ
/// لأن كل استعمالاتها تلي حرفاً («على ٣ بنود»، «بين شخصين»).
String calcCountPhrase(
  int count, {
  required String one,
  required String two,
  required String few,
  required String many,
}) {
  if (count == 1) return one;
  if (count == 2) return two;
  if (count >= 3 && count <= 10) return '${arabicDigits(count)} $few';
  return '${arabicDigits(count)} $many';
}

/// أيام: يوم واحد، يومين، ٣ أيام، ٤٥ يوماً.
String calcDaysPhrase(int days) {
  if (days == 1) return 'يوم واحد';
  if (days == 2) return 'يومين';
  if (days >= 3 && days <= 10) return '${arabicDigits(days)} أيام';
  return '${arabicDigits(days)} يوماً';
}

/// ١٠ أبريل ٢٠٢٤ — بلا اسم اليوم.
String formatGregorianDate(DateTime date) =>
    '${arabicDigits(date.day)} ${gregorianMonthNames[date.month - 1]} '
    '${arabicDigits(date.year)}';

/// نتيجة حساب: قيمة أو رسالة عربية، ولا شيء آخر — لا استثناءات في الواجهة.
class CalcOutcome<T> {
  const CalcOutcome.ok(this.value) : error = null;
  const CalcOutcome.failure(this.error) : value = null;

  final T? value;
  final String? error;

  bool get isOk => error == null;
}

/// سطر نتيجة جاهز للعرض: نجاح أو خطأ، والنصّ عربي في الحالتين.
class CalcMessage {
  const CalcMessage.ok(this.text) : isError = false;
  const CalcMessage.failure(this.text) : isError = true;

  final String text;
  final bool isError;
}

/// صفّ مدخلات (اسم ومبلغ) كما يكتبه المستخدم قبل التحقّق منه.
class CalcLine {
  const CalcLine({required this.name, required this.amount});

  final String name;
  final String amount;
}

/// يستبدل الأرقام العربية الهندية باللاتينية ويرمي فواصل الآلاف والمسافات، كي
/// يقبل الحقل ما يكتبه العربي بلوحة مفاتيحه.
String _cleanNumber(String raw) {
  final buffer = StringBuffer();
  for (final char in raw.trim().split('')) {
    final index = _arabicDigits.indexOf(char);
    if (index >= 0) {
      buffer.write(index);
    } else if (char != '٬' && char != ',' && char != '،' && char != ' ') {
      buffer.write(char);
    }
  }
  return buffer.toString();
}

/// يقرأ مبلغاً مكتوباً ويعيده أغورة (عدداً صحيحاً).
CalcOutcome<int> parseCalcAmount(String raw) {
  final text = _cleanNumber(raw);
  if (text.isEmpty) return const CalcOutcome.failure('اكتب المبلغ');
  if (text.startsWith('-')) {
    return const CalcOutcome.failure('المبلغ لا يكون سالباً');
  }
  if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(text)) {
    return const CalcOutcome.failure('المبلغ بالأرقام فقط (مثل ١٥٠٠)');
  }
  final value = double.tryParse(text);
  // حدّ عملي: لا Infinity ولا مبلغ يُخرج الحساب عن حدّ الأعداد الصحيحة.
  if (value == null || !value.isFinite || value > 100000000) {
    return const CalcOutcome.failure('المبلغ كبير جداً');
  }
  return CalcOutcome.ok((value * 100).round());
}

/// يقرأ عدداً صحيحاً غير سالب؛ الفراغ صفر مسموح في حقول التقدير الاختيارية.
CalcOutcome<int> parseCalcCount(String raw, String label) {
  final text = _cleanNumber(raw);
  if (text.isEmpty) return const CalcOutcome.ok(0);
  if (text.startsWith('-')) {
    return CalcOutcome.failure('$label: العدد لا يكون سالباً');
  }
  if (!RegExp(r'^\d+$').hasMatch(text)) {
    return CalcOutcome.failure('$label: العدد بالأرقام فقط');
  }
  final value = int.tryParse(text);
  if (value == null || value > 100000) {
    return CalcOutcome.failure('$label: العدد كبير جداً');
  }
  return CalcOutcome.ok(value);
}

/// يقرأ `YYYY-MM-DD` ويتحقّق من وجود اليوم نفسه: `DateTime(2026, 2, 31)`
/// يعود ٣ مارس، فيُكشف بمقارنة اليوم والشهر بعد الإنشاء لا بالثقة في المدخل.
CalcOutcome<DateTime> parseCalcDate(String raw) {
  final text = _cleanNumber(raw);
  if (text.isEmpty) {
    return const CalcOutcome.failure('اختر تاريخاً أولاً من التقويم');
  }
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(text);
  if (match == null) {
    return const CalcOutcome.failure('التاريخ غير صحيح — اكتبه مثل 2026-12-31');
  }
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final date = DateTime(year, month, day);
  if (date.year != year || date.month != month || date.day != day) {
    return const CalcOutcome.failure('هذا التاريخ غير موجود');
  }
  return CalcOutcome.ok(date);
}

/// ١ — مجموع ميزانية العرس بالأغورة: كل بند باسمه ومبلغه، والمجموع وحده.
CalcOutcome<int> weddingBudgetTotal(List<CalcLine> lines) {
  if (lines.isEmpty) {
    return const CalcOutcome.failure('أضف بنداً واحداً على الأقل');
  }
  var total = 0;
  for (var index = 0; index < lines.length; index += 1) {
    final line = lines[index];
    final label = 'الصف ${arabicDigits(index + 1)}';
    final name = line.name.trim();
    if (name.isEmpty) {
      return CalcOutcome.failure('$label: اكتب اسم البند أولاً');
    }
    final amount = parseCalcAmount(line.amount);
    if (!amount.isOk) {
      return CalcOutcome.failure('$label «$name»: ${amount.error}');
    }
    total += amount.value!;
  }
  return CalcOutcome.ok(total);
}

/// تحويل واحد في تسوية المصاريف: من يدفع، ولمن، وكم.
class SplitTransfer {
  const SplitTransfer({
    required this.from,
    required this.to,
    required this.cents,
  });

  final String from;
  final String to;
  final int cents;
}

/// خطة تسوية: المجموع، وحصّة الشخص، وما يلزم من تحويلات.
class SplitPlan {
  const SplitPlan({
    required this.totalCents,
    required this.shareCents,
    required this.peopleCount,
    required this.transfers,
  });

  final int totalCents;
  final int shareCents;
  final int peopleCount;
  final List<SplitTransfer> transfers;
}

class _Balance {
  _Balance(this.name, this.cents);

  final String name;
  int cents;
}

/// ٢ — تقسيم المصاريف: المجموع يُقسَّم بالتساوي، ثم تسوية بأقل عدد تحويلات
/// (المدين الأكبر إلى الدائن الأكبر حتى ينتهي الطرفان).
///
/// الحساب بالأغورة أعداداً صحيحة كي لا يضيع أوغر في التقريب: الباقي يُضاف
/// أوغراً واحداً لأوائل الصفوف، فيبقى مجموع الحصص مساوياً للمجموع تماماً.
CalcOutcome<SplitPlan> splitExpenses(List<CalcLine> lines) {
  if (lines.isEmpty) {
    return const CalcOutcome.failure('أضف شخصاً واحداً على الأقل');
  }
  if (lines.length == 1) {
    return const CalcOutcome.failure('شخص واحد فقط — لا شيء يُقسَّم عليه');
  }

  final names = <String>[];
  final paid = <int>[];
  for (var index = 0; index < lines.length; index += 1) {
    final line = lines[index];
    final label = 'الصف ${arabicDigits(index + 1)}';
    final name = line.name.trim();
    if (name.isEmpty) {
      return CalcOutcome.failure('$label: اكتب اسم الشخص أولاً');
    }
    final amount = parseCalcAmount(line.amount);
    if (!amount.isOk) {
      return CalcOutcome.failure('$label «$name»: ${amount.error}');
    }
    names.add(name);
    paid.add(amount.value!);
  }

  final total = paid.fold<int>(0, (sum, value) => sum + value);
  if (total <= 0) {
    return const CalcOutcome.failure('مجموع ما دفعه الجميع صفر — لا شيء يُقسَّم');
  }

  final base = total ~/ lines.length;
  final remainder = total % lines.length;
  final creditors = <_Balance>[];
  final debtors = <_Balance>[];
  for (var index = 0; index < lines.length; index += 1) {
    final share = base + (index < remainder ? 1 : 0);
    final difference = paid[index] - share;
    if (difference > 0) {
      creditors.add(_Balance(names[index], difference));
    } else if (difference < 0) {
      debtors.add(_Balance(names[index], -difference));
    }
  }

  creditors.sort((left, right) => right.cents.compareTo(left.cents));
  debtors.sort((left, right) => right.cents.compareTo(left.cents));

  final transfers = <SplitTransfer>[];
  var debtorIndex = 0;
  var creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    final paidNow = debtors[debtorIndex].cents < creditors[creditorIndex].cents
        ? debtors[debtorIndex].cents
        : creditors[creditorIndex].cents;
    if (paidNow > 0) {
      transfers.add(
        SplitTransfer(
          from: debtors[debtorIndex].name,
          to: creditors[creditorIndex].name,
          cents: paidNow,
        ),
      );
    }
    debtors[debtorIndex].cents -= paidNow;
    creditors[creditorIndex].cents -= paidNow;
    if (debtors[debtorIndex].cents == 0) debtorIndex += 1;
    if (creditors[creditorIndex].cents == 0) creditorIndex += 1;
  }

  return CalcOutcome.ok(
    SplitPlan(
      totalCents: total,
      shareCents: base,
      peopleCount: lines.length,
      transfers: transfers,
    ),
  );
}

/// تقدير المعازيم من عائلات وطاولات، مع تفصيل ما جاء من كل مصدر.
class GuestEstimate {
  const GuestEstimate({
    required this.families,
    required this.perFamily,
    required this.tables,
    required this.perTable,
    required this.fromFamilies,
    required this.fromTables,
  });

  final int families;
  final int perFamily;
  final int tables;
  final int perTable;
  final int fromFamilies;
  final int fromTables;

  int get total => fromFamilies + fromTables;
}

/// ٣ — عدد المعازيم: عائلات × متوسطها + طاولات × متوسطها، وحقل فارغ صفر.
CalcOutcome<GuestEstimate> estimateGuests({
  required String families,
  required String perFamily,
  required String tables,
  required String perTable,
}) {
  final familiesCount = parseCalcCount(families, 'عدد العائلات');
  if (!familiesCount.isOk) return CalcOutcome.failure(familiesCount.error!);
  final perFamilyCount = parseCalcCount(
    perFamily,
    'متوسط المدعوين لكل عائلة',
  );
  if (!perFamilyCount.isOk) {
    return CalcOutcome.failure(perFamilyCount.error!);
  }
  final tablesCount = parseCalcCount(tables, 'عدد الطاولات');
  if (!tablesCount.isOk) return CalcOutcome.failure(tablesCount.error!);
  final perTableCount = parseCalcCount(perTable, 'الجالسون على الطاولة');
  if (!perTableCount.isOk) return CalcOutcome.failure(perTableCount.error!);

  final estimate = GuestEstimate(
    families: familiesCount.value!,
    perFamily: perFamilyCount.value!,
    tables: tablesCount.value!,
    perTable: perTableCount.value!,
    fromFamilies: familiesCount.value! * perFamilyCount.value!,
    fromTables: tablesCount.value! * perTableCount.value!,
  );
  if (estimate.total <= 0) {
    return const CalcOutcome.failure(
      'أدخل عدداً أكبر من صفر في أحد الحقول — لا شيء يُقدَّر',
    );
  }
  return CalcOutcome.ok(estimate);
}

/// ٤ — أيام بين تاريخين بالتقويم المحلي: منتصف الليل إلى منتصف الليل بتوقيت
/// UTC، فلا تقصّ ساعةُ الصيف يوماً ولا تضيف يوماً.
int daysBetweenDates(DateTime from, DateTime to) {
  final start = DateTime.utc(from.year, from.month, from.day);
  final end = DateTime.utc(to.year, to.month, to.day);
  return end.difference(start).inDays;
}

/// تاريخ هجري كما يعيده الحساب.
class HijriDate {
  const HijriDate({required this.year, required this.month, required this.day});

  final int year;
  final int month;
  final int day;

  String get monthName => hijriMonthNames[(month - 1).clamp(0, 11)];

  String get label =>
      '${arabicDigits(day)} $monthName ${arabicDigits(year)}هـ';
}

/// ٥ — التقويم الهجري: تقويم أم القرى حسابياً بالخوارزمية الكويتية الجدولية —
/// رقم يوم يولياني (Julian Day Number) من الميلادي، ثم تحويله هجرياً بدورة
/// ثلاثين سنة فيها ١١ سنة كبيسة.
///
/// مرجع تحقّق يدوي: ١٠ أبريل ٢٠٢٤ ← ١ شوال ١٤٤٥هـ (عيد الفطر ١٤٤٥)،
/// و١١ مارس ٢٠٢٤ ← ١ رمضان ١٤٤٥. والنتيجة تقريبية بيوم على الأكثر، ولذلك
/// التنبيه «تقريبي ±يوم» ظاهر تحت اللوحة دائماً.
HijriDate hijriFromGregorian(DateTime date) {
  var year = date.year;
  var month = date.month;
  final day = date.day;
  if (month < 3) {
    year -= 1;
    month += 12;
  }
  final century = year ~/ 100;
  final correction = 2 - century + century ~/ 4;
  final julianDay = (365.25 * (year + 4716)).floor() +
      (30.6001 * (month + 1)).floor() +
      day +
      correction -
      1524;

  final l = julianDay - 1948440 + 10632;
  final n = (l - 1) ~/ 10631;
  var l2 = l - 10631 * n + 354;
  final j = ((10985 - l2) ~/ 5316) * ((50 * l2) ~/ 17719) +
      (l2 ~/ 5670) * ((43 * l2) ~/ 15238);
  l2 = l2 -
      ((30 - j) ~/ 15) * ((17719 * j) ~/ 50) -
      (j ~/ 16) * ((15238 * j) ~/ 43) +
      29;
  final hijriMonth = (24 * l2) ~/ 709;
  final hijriDay = l2 - (709 * hijriMonth) ~/ 24;
  return HijriDate(
    year: 30 * n + j - 30,
    month: hijriMonth,
    day: hijriDay,
  );
}

/// `YYYY-MM-DD` محلياً — لا `toIso8601String` فهو UTC ويسبق اليوم شرقاً.
String _isoDay(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

// ---------------------------------------------------------------------------
// الشاشة
// ---------------------------------------------------------------------------

/// شاشة الحاسبات الخمس: رقاقات اختيار في الأعلى، ولوحة واحدة ظاهرة تحتها.
///
/// تُدفع من وجهة «خدماتنا» (`services_hub_screen.dart`) وتبقى لوحاتها حيّة في
/// `IndexedStack` كي لا يضيع ما كتبه الزائر حين يتنقّل بينها.
class ServicesCalculatorsScreen extends StatefulWidget {
  const ServicesCalculatorsScreen({
    super.key,
    this.initial = ServicesCalculator.budget,
  });

  final ServicesCalculator initial;

  @override
  State<ServicesCalculatorsScreen> createState() =>
      _ServicesCalculatorsScreenState();
}

class _ServicesCalculatorsScreenState extends State<ServicesCalculatorsScreen> {
  late ServicesCalculator _selected = widget.initial;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('حاسبات تهمّك')),
      body: Column(
        children: [
          _CalculatorTabs(
            selected: _selected,
            onSelected: (calculator) =>
                setState(() => _selected = calculator),
          ),
          Expanded(
            child: IndexedStack(
              index: _selected.index,
              children: const [
                WeddingBudgetCalculator(),
                ExpenseSplitCalculator(),
                GuestCountCalculator(),
                CountdownCalculator(),
                HijriCalculator(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CalculatorTabs extends StatelessWidget {
  const _CalculatorTabs({required this.selected, required this.onSelected});

  final ServicesCalculator selected;
  final ValueChanged<ServicesCalculator> onSelected;

  @override
  Widget build(BuildContext context) {
    // خمس رقاقات في سطرين عند الحاجة — لا تمرير أفقي يخفي الخامسة عن العين.
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final calculator in ServicesCalculator.values)
            _CalculatorChip(
              calculator: calculator,
              selected: calculator == selected,
              onTap: () => onSelected(calculator),
            ),
        ],
      ),
    );
  }
}

class _CalculatorChip extends StatelessWidget {
  const _CalculatorChip({
    required this.calculator,
    required this.selected,
    required this.onTap,
  });

  final ServicesCalculator calculator;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      key: Key('calc_tab_${calculator.name}'),
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? c.sky : c.surfaceSunk,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? c.sky : c.line),
        ),
        child: Text(
          calculator.label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w900,
            height: 1,
            color: selected ? c.onSky : c.inkSoft,
          ),
        ),
      ),
    );
  }
}

/// شرح اللوحة في سطرين — كل حاسبة تقول ما تفعله وما لا تفعله (حفظ/إرسال).
class _PanelLead extends StatelessWidget {
  const _PanelLead(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(fontSize: 12.5, height: 1.7, color: context.c.inkSoft),
    );
  }
}

/// صفّ مدخلات في حاسبة بنود: اسم ثم مبلغ ثم زرّ حذف.
class _EntryRowFields extends StatelessWidget {
  const _EntryRowFields({
    super.key,
    required this.nameKey,
    required this.amountKey,
    required this.removeKey,
    required this.nameHint,
    required this.amountHint,
    required this.onNameChanged,
    required this.onAmountChanged,
    required this.onRemove,
  });

  final Key nameKey;
  final Key amountKey;
  final Key removeKey;
  final String nameHint;
  final String amountHint;
  final ValueChanged<String> onNameChanged;
  final ValueChanged<String> onAmountChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: TextFormField(
              key: nameKey,
              onChanged: onNameChanged,
              decoration: InputDecoration(hintText: nameHint, isDense: true),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: TextFormField(
              key: amountKey,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: onAmountChanged,
              decoration: InputDecoration(hintText: amountHint, isDense: true),
            ),
          ),
          IconButton(
            key: removeKey,
            onPressed: onRemove,
            icon: const Icon(Icons.close, size: 18),
            tooltip: 'حذف الصف',
          ),
        ],
      ),
    );
  }
}

/// زرّ الحساب الأوّلي — واحد في كل لوحة، بعرضها.
class _RunButton extends StatelessWidget {
  const _RunButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(onPressed: onPressed, child: Text(label)),
    );
  }
}

/// نتيجة الحاسبة: نصّ عربي واحد، أخضر عند النجاح وأحمر عند الخطأ.
class _ResultBox extends StatelessWidget {
  const _ResultBox({
    super.key,
    required this.message,
    required this.isError,
  });

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: isError ? c.dangerWash : c.successWash,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        message,
        style: TextStyle(
          fontSize: 13,
          height: 1.8,
          fontWeight: FontWeight.w700,
          color: isError ? c.danger : c.success,
        ),
      ),
    );
  }
}

/// صفّ واحد في قائمة بنود تتغيّر (ميزانية أو أشخاص). القيم تُحفظ في الكائن
/// نفسه عبر `onChanged`، فلا `TextEditingController` لكل صفّ ولا تفريغها.
class _EntryRow {
  _EntryRow(this.id);

  final int id;
  String name = '';
  String amount = '';
}

class _RowsCalculator extends StatefulWidget {
  const _RowsCalculator({
    required this.lead,
    required this.nameHint,
    required this.amountHint,
    required this.addLabel,
    required this.runLabel,
    required this.keyPrefix,
    required this.addKey,
    required this.runKey,
    required this.resultKey,
    required this.run,
  });

  final String lead;
  final String nameHint;
  final String amountHint;
  final String addLabel;
  final String runLabel;
  final String keyPrefix;
  final Key addKey;
  final Key runKey;
  final Key resultKey;

  /// تتحقّق من الصفوف وتعيد سطر النتيجة جاهزاً — الرسالة العربية تُبنى هنا لا
  /// في الواجهة، فتبقى اللوحة عرضاً بحتاً.
  final CalcMessage Function(List<CalcLine> lines) run;

  @override
  State<_RowsCalculator> createState() => _RowsCalculatorState();
}

class _RowsCalculatorState extends State<_RowsCalculator> {
  final List<_EntryRow> _rows = [_EntryRow(0), _EntryRow(1)];
  int _nextRowId = 2;
  String? _message;
  bool _isError = false;

  void _addRow() => setState(() => _rows.add(_EntryRow(_nextRowId++)));

  void _removeRow(int id) =>
      setState(() => _rows.removeWhere((row) => row.id == id));

  void _run() {
    final message = widget.run([
      for (final row in _rows) CalcLine(name: row.name, amount: row.amount),
    ]);
    setState(() {
      _message = message.text;
      _isError = message.isError;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
      children: [
        _PanelLead(widget.lead),
        const SizedBox(height: 14),
        for (final row in _rows)
          _EntryRowFields(
            // المفتاح على الصفّ نفسه كي يتبع محرّرُه صفَّه بعد الحذف، فلا يضيع
            // ما كتبه المستخدم في الصفوف الباقية.
            key: ValueKey<int>(row.id),
            nameKey: Key('${widget.keyPrefix}_name_${row.id}'),
            amountKey: Key('${widget.keyPrefix}_amount_${row.id}'),
            removeKey: Key('${widget.keyPrefix}_remove_${row.id}'),
            nameHint: widget.nameHint,
            amountHint: widget.amountHint,
            onNameChanged: (value) => row.name = value,
            onAmountChanged: (value) => row.amount = value,
            onRemove: () => _removeRow(row.id),
          ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            key: widget.addKey,
            onPressed: _addRow,
            icon: const Icon(Icons.add, size: 18),
            label: Text(widget.addLabel),
          ),
        ),
        const SizedBox(height: 6),
        _RunButton(key: widget.runKey, label: widget.runLabel, onPressed: _run),
        if (_message != null)
          _ResultBox(
            key: widget.resultKey,
            message: _message!,
            isError: _isError,
          ),
      ],
    );
  }
}

/// لوحة الميزانية — كبسة/بنود بلا سقف ميزانية هنا: بند وبند فقط.
class WeddingBudgetCalculator extends StatelessWidget {
  const WeddingBudgetCalculator({super.key});

  @override
  Widget build(BuildContext context) {
    return _RowsCalculator(
      lead: 'اكتب بنود العرس ومبالغها، والمجموع يظهر لك فور الضغط — بلا حفظ ولا إرسال.',
      nameHint: 'اسم البند',
      amountHint: 'المبلغ (₪)',
      addLabel: 'بند جديد',
      runLabel: 'احسب المجموع',
      keyPrefix: 'calc_budget',
      addKey: const Key('calc_budget_add'),
      runKey: const Key('calc_budget_run'),
      resultKey: const Key('calc_budget_result'),
      run: (lines) {
        final outcome = weddingBudgetTotal(lines);
        if (!outcome.isOk) return CalcMessage.failure(outcome.error!);
        final countText = calcCountPhrase(
          lines.length,
          one: 'بند واحد',
          two: 'بندين',
          few: 'بنود',
          many: 'بنداً',
        );
        return CalcMessage.ok(
          'مجموع ميزانية العرس ${formatCalcMoney(outcome.value!)} على '
          '$countText.',
        );
      },
    );
  }
}

/// لوحة تقسيم المصاريف — كل شخص دفع مبلغاً، والتسوية تحسب الباقي.
class ExpenseSplitCalculator extends StatelessWidget {
  const ExpenseSplitCalculator({super.key});

  @override
  Widget build(BuildContext context) {
    return _RowsCalculator(
      lead: 'اكتب كم دفع كل شخص، والتسوية تخرج لك: من يدفع لمن وكم.',
      nameHint: 'اسم الشخص',
      amountHint: 'دفع (₪)',
      addLabel: 'شخص جديد',
      runLabel: 'احسب التسوية',
      keyPrefix: 'calc_split',
      addKey: const Key('calc_split_add'),
      runKey: const Key('calc_split_run'),
      resultKey: const Key('calc_split_result'),
      run: (lines) {
        final outcome = splitExpenses(lines);
        if (!outcome.isOk) return CalcMessage.failure(outcome.error!);
        final plan = outcome.value!;
        final people = calcCountPhrase(
          plan.peopleCount,
          one: 'شخص واحد',
          two: 'شخصين',
          few: 'أشخاص',
          many: 'شخصاً',
        );
        final summary =
            'مجموع المصاريف ${formatCalcMoney(plan.totalCents)} على $people — '
            'حصّة كل شخص نحو ${formatCalcMoney(plan.shareCents)}.';
        if (plan.transfers.isEmpty) {
          return CalcMessage.ok('$summary لا تسوية لازمة — كلٌّ دفع حصّته.');
        }
        final settlement = plan.transfers
            .map(
              (transfer) =>
                  '${transfer.from} يدفع إلى ${transfer.to} '
                  '${formatCalcMoney(transfer.cents)}',
            )
            .join(' · ');
        return CalcMessage.ok('$summary التسوية: $settlement.');
      },
    );
  }
}

/// لوحة تقدير المعازيم — عائلات وطاولات، وكل مصدر بمعادلاته.
class GuestCountCalculator extends StatefulWidget {
  const GuestCountCalculator({super.key});

  @override
  State<GuestCountCalculator> createState() => _GuestCountCalculatorState();
}

class _GuestCountCalculatorState extends State<GuestCountCalculator> {
  String _families = '';
  String _perFamily = '';
  String _tables = '';
  String _perTable = '';
  String? _message;
  bool _isError = false;

  void _run() {
    final outcome = estimateGuests(
      families: _families,
      perFamily: _perFamily,
      tables: _tables,
      perTable: _perTable,
    );
    setState(() {
      if (!outcome.isOk) {
        _isError = true;
        _message = outcome.error;
        return;
      }
      _isError = false;
      final estimate = outcome.value!;
      final parts = <String>[];
      if (estimate.fromFamilies > 0) {
        parts.add(
          'العائلات ${formatCalcCount(estimate.families)} × '
          '${formatCalcCount(estimate.perFamily)} = '
          '${formatCalcCount(estimate.fromFamilies)}',
        );
      }
      if (estimate.fromTables > 0) {
        parts.add(
          'الطاولات ${formatCalcCount(estimate.tables)} × '
          '${formatCalcCount(estimate.perTable)} = '
          '${formatCalcCount(estimate.fromTables)}',
        );
      }
      _message =
          'تقدير عدد المعازيم: ${formatCalcCount(estimate.total)} — '
          '${parts.join('، و')}.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
      children: [
        const _PanelLead(
          'قدّر عدد المعازيم من العائلات والطاولات — اترك ما لا تعرفه فارغاً.',
        ),
        const SizedBox(height: 14),
        TextFormField(
          key: const Key('calc_guests_families'),
          keyboardType: TextInputType.number,
          onChanged: (value) => _families = value,
          decoration: const InputDecoration(
            labelText: 'عدد العائلات المدعوّة',
            hintText: 'مثال: ٢٠',
            isDense: true,
          ),
        ),
        const SizedBox(height: 10),
        TextFormField(
          key: const Key('calc_guests_per_family'),
          keyboardType: TextInputType.number,
          onChanged: (value) => _perFamily = value,
          decoration: const InputDecoration(
            labelText: 'متوسط المدعوين لكل عائلة',
            hintText: 'مثال: ٨',
            isDense: true,
          ),
        ),
        const SizedBox(height: 10),
        TextFormField(
          key: const Key('calc_guests_tables'),
          keyboardType: TextInputType.number,
          onChanged: (value) => _tables = value,
          decoration: const InputDecoration(
            labelText: 'عدد الطاولات',
            hintText: 'مثال: ٤',
            isDense: true,
          ),
        ),
        const SizedBox(height: 10),
        TextFormField(
          key: const Key('calc_guests_per_table'),
          keyboardType: TextInputType.number,
          onChanged: (value) => _perTable = value,
          decoration: const InputDecoration(
            labelText: 'الجالسون على الطاولة',
            hintText: 'مثال: ١٠',
            isDense: true,
          ),
        ),
        const SizedBox(height: 16),
        _RunButton(
          key: const Key('calc_guests_run'),
          label: 'قدّر العدد',
          onPressed: _run,
        ),
        if (_message != null)
          _ResultBox(
            key: const Key('calc_guests_result'),
            message: _message!,
            isError: _isError,
          ),
      ],
    );
  }
}

/// لوحة التاريخ المختار: حقل كتابة + منتقي تقويم يكتب فيه، والقراءة واحدة
/// للحاسبتين (العدّ التنازلي والهجري) فلا نسختان من التحقّق من التاريخ.
class _DateField extends StatelessWidget {
  const _DateField({
    required this.fieldKey,
    required this.pickKey,
    required this.label,
    required this.controller,
  });

  final Key fieldKey;
  final Key pickKey;
  final String label;
  final TextEditingController controller;

  Future<void> _pick(BuildContext context) async {
    final parsed = parseCalcDate(controller.text);
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: parsed.isOk ? parsed.value! : now,
      firstDate: DateTime(now.year - 10),
      lastDate: DateTime(now.year + 20),
    );
    if (picked == null) return;
    controller.text = _isoDay(picked);
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      key: fieldKey,
      controller: controller,
      keyboardType: TextInputType.datetime,
      decoration: InputDecoration(
        labelText: label,
        hintText: '2026-12-31',
        isDense: true,
        suffixIcon: IconButton(
          key: pickKey,
          onPressed: () => _pick(context),
          icon: const Icon(Icons.calendar_today, size: 18),
          tooltip: 'اختر من التقويم',
        ),
      ),
    );
  }
}

/// لوحة العدّ التنازلي — أيام تبقّت بين اليوم المحلي وتاريخ مختار.
class CountdownCalculator extends StatefulWidget {
  const CountdownCalculator({super.key});

  @override
  State<CountdownCalculator> createState() => _CountdownCalculatorState();
}

class _CountdownCalculatorState extends State<CountdownCalculator> {
  late final TextEditingController _date = TextEditingController(
    text: _isoDay(DateTime.now()),
  );
  String? _message;
  bool _isError = false;

  @override
  void dispose() {
    _date.dispose();
    super.dispose();
  }

  void _run() {
    final parsed = parseCalcDate(_date.text);
    setState(() {
      if (!parsed.isOk) {
        _isError = true;
        _message = parsed.error;
        return;
      }
      _isError = false;
      final chosen = parsed.value!;
      final days = daysBetweenDates(DateTime.now(), chosen);
      final dateText =
          'الموعد يوم ${arabicWeekdays[chosen.weekday - 1]} '
          '${formatGregorianDate(chosen)}';
      if (days > 0) {
        _message = 'بقي ${calcDaysPhrase(days)} على الموعد — $dateText.';
      } else if (days == 0) {
        _message = 'الموعد اليوم — $dateText.';
      } else {
        _message = 'مضى الموعد منذ ${calcDaysPhrase(-days)} ($dateText).';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
      children: [
        const _PanelLead(
          'اختر تاريخ المناسبة، ويظهر لك كم يوماً بقي عليها — والتاريخ يُكتب '
          'أو يُختار من التقويم.',
        ),
        const SizedBox(height: 14),
        _DateField(
          fieldKey: const Key('calc_countdown_date'),
          pickKey: const Key('calc_countdown_pick'),
          label: 'تاريخ المناسبة',
          controller: _date,
        ),
        const SizedBox(height: 16),
        _RunButton(
          key: const Key('calc_countdown_run'),
          label: 'كم بقي؟',
          onPressed: _run,
        ),
        if (_message != null)
          _ResultBox(
            key: const Key('calc_countdown_result'),
            message: _message!,
            isError: _isError,
          ),
      ],
    );
  }
}

/// لوحة التاريخ الهجري — تقويم أم القرى حسابياً، والتنبيه «تقريبي ±يوم» ظاهر
/// دائماً تحتها لا في tooltip ولا في عنوان مخفي.
class HijriCalculator extends StatefulWidget {
  const HijriCalculator({super.key});

  @override
  State<HijriCalculator> createState() => _HijriCalculatorState();
}

class _HijriCalculatorState extends State<HijriCalculator> {
  late final TextEditingController _date = TextEditingController(
    text: _isoDay(DateTime.now()),
  );
  String? _message;
  bool _isError = false;

  @override
  void dispose() {
    _date.dispose();
    super.dispose();
  }

  void _run() {
    final parsed = parseCalcDate(_date.text);
    setState(() {
      if (!parsed.isOk) {
        _isError = true;
        _message = parsed.error;
        return;
      }
      _isError = false;
      final date = parsed.value!;
      final hijri = hijriFromGregorian(date);
      _message =
          '${arabicWeekdays[date.weekday - 1]} ${hijri.label} — '
          'يوافق ${formatGregorianDate(date)}.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
      children: [
        const _PanelLead(
          'تاريخ أم القرى مقابلاً للميلادي، يُحسب حسابياً في جهازك.',
        ),
        const SizedBox(height: 14),
        _DateField(
          fieldKey: const Key('calc_hijri_date'),
          pickKey: const Key('calc_hijri_pick'),
          label: 'التاريخ الميلادي',
          controller: _date,
        ),
        const SizedBox(height: 16),
        _RunButton(
          key: const Key('calc_hijri_run'),
          label: 'اعرض التاريخ الهجري',
          onPressed: _run,
        ),
        if (_message != null)
          _ResultBox(
            key: const Key('calc_hijri_result'),
            message: _message!,
            isError: _isError,
          ),
        Container(
          key: const Key('calc_hijri_note'),
          margin: const EdgeInsets.only(top: 14),
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
          decoration: BoxDecoration(
            color: c.warnWash,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            'تقريبي ±يوم — حسابٌ جدوليّ لا رؤية هلال، فلا تعتمد عليه في '
            'المواعيد الشرعية.',
            style: TextStyle(
              fontSize: 12,
              height: 1.7,
              fontWeight: FontWeight.w700,
              color: c.warn,
            ),
          ),
        ),
      ],
    );
  }
}
