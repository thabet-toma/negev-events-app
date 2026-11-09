import 'package:flutter/material.dart';

import '../main.dart';
import '../models/prices.dart';
import '../theme.dart';
import 'services_calculators_screen.dart';

/// أداتا «خدماتنا» للأسعار (تذكرة #189): حاسبة الذهب ومحوّل العملات.
///
/// خلافاً لحاسبات #190 هاتان تقرآن `GET /api/prices` مرّة عند فتح الشاشة —
/// الخادم وحده يقرأ مصدري السوق ويحسب، وهذا الملف يعرض ويضرب ويقسم. وكل نصّ
/// عربي، والنداء عبر `NegevApi` وحده (`AppServices.of(context).api`).
///
/// **وحين لا تصل الأسعار تُخفى الأداة وتاريخها معاً** ويبقى سطر عربي واحد
/// يقول لماذا مع زرّ «إعادة المحاولة» — لا حاسبة بسعر صفر ولا تاريخ وهمي.
enum PricesTool { gold, fx }

extension PricesToolInfo on PricesTool {
  String get label => switch (this) {
    PricesTool.gold => 'حاسبة الذهب',
    PricesTool.fx => 'محوّل العملات',
  };

  String get short => switch (this) {
    PricesTool.gold => 'قيمة المعدن بلا مصنعية بسعر اليوم',
    PricesTool.fx => 'الشيكل والعملات الست بسعر الصرف',
  };

  IconData get icon => switch (this) {
    PricesTool.gold => Icons.diamond_outlined,
    PricesTool.fx => Icons.currency_exchange,
  };
}

/// رسالة الشاشة الوحيدة عند تعذّر الأسعار — عربية، وبلا تفاصيل داخلية.
const String pricesUnavailableMessage =
    'تعذّر جلب أسعار الذهب والعملات الآن — تحقّق من اتصالك وحاول مرة أخرى.';

/// العيارات الثلاثة كما يرسلها الخادم (`k24` `k21` `k18`).
const List<int> goldKarats = [24, 21, 18];

const String _arabicDigits = '٠١٢٣٤٥٦٧٨٩';

/// يستبدل الأرقام العربية الهندية باللاتينية ويرمي فواصل الآلاف والمسافات،
/// كي يقبل حقل الوزن ما يكتبه العربي بلوحة مفاتيحه (كما في حاسبات #190).
String _latinDigits(String raw) {
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

/// رقم عشري إلى نصّ عربي: `٤٣٧٫٥٠`، `٠٫٠٦٢٥`، `١٬٢٥٠٫٠٠`.
String formatPriceNumber(double value, int digits) {
  final fixed = value.toStringAsFixed(digits);
  final parts = fixed.split('.');
  final grouped = groupThousands(parts[0]);
  return arabicDigits(parts.length > 1 ? '$grouped٫${parts[1]}' : grouped);
}

/// يقرأ وزن الذهب بالغرام: موجب، أرقام لاتينية أو عربية، وكسر عشري مسموح.
CalcOutcome<double> parseGoldWeight(String raw) {
  final text = _latinDigits(raw);
  if (text.isEmpty) return const CalcOutcome.failure('اكتب الوزن بالغرام أولاً');
  if (text.startsWith('-')) {
    return const CalcOutcome.failure('الوزن لا يكون سالباً');
  }
  if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(text)) {
    return const CalcOutcome.failure('الوزن بالأرقام فقط (مثل ٢١)');
  }
  final value = double.tryParse(text);
  if (value == null || !value.isFinite || value <= 0) {
    return const CalcOutcome.failure('اكتب وزناً أكبر من صفر');
  }
  if (value > 100000) return const CalcOutcome.failure('الوزن كبير جداً');
  return CalcOutcome.ok(value);
}

/// حاسبة الذهب: الوزن × سعر غرام العيار — والحساب بالأغورة (الوزن بأجزاء
/// المئة) كي لا يضيع أغورة في كسر عائم.
CalcMessage goldMetalValue({
  required String weight,
  required int karat,
  required GoldPrices gold,
}) {
  final parsed = parseGoldWeight(weight);
  if (!parsed.isOk) return CalcMessage.failure(parsed.error!);

  final price = gold.perGram(karat);
  if (price == null || !(price > 0)) {
    return const CalcMessage.failure('سعر هذا العيار غير متاح الآن');
  }

  final weightHundredths = (parsed.value! * 100).round();
  final priceAgorot = (price * 100).round();
  final totalAgorot = (weightHundredths * priceAgorot / 100).round();
  return CalcMessage.ok(
    'قيمة المعدن بلا مصنعية: ${formatCalcMoney(totalAgorot)} — '
    'سعر غرام عيار ${arabicDigits(karat)} نحو ${formatCalcMoney(priceAgorot)}.',
  );
}

/// محوّل العملات: شيكل ← عملة أو عملة ← شيكل بسعر `ils_per_unit` نفسه.
CalcMessage convertCurrencyAmount({
  required String amount,
  required CurrencyPrice currency,
  required bool toIls,
}) {
  final parsed = parseCalcAmount(amount);
  if (!parsed.isOk) return CalcMessage.failure(parsed.error!);
  if (!(currency.ilsPerUnit > 0)) {
    return const CalcMessage.failure('سعر هذه العملة غير متاح الآن');
  }

  final value = parsed.value! / 100;
  final rate = formatPriceNumber(currency.ilsPerUnit, 4);
  if (toIls) {
    final agorot = (value * currency.ilsPerUnit * 100).round();
    return CalcMessage.ok(
      '${formatPriceNumber(value, 2)} ${currency.nameAr} = '
      '${formatCalcMoney(agorot)} بسعر $rate ₪ للوحدة الواحدة.',
    );
  }

  final foreign = value / currency.ilsPerUnit;
  return CalcMessage.ok(
    '${formatCalcMoney(parsed.value!)} = '
    '${formatPriceNumber(foreign, 2)} ${currency.nameAr} '
    'بسعر $rate ₪ للوحدة الواحدة.',
  );
}

/// تاريخ المصدر كما يُعرض: «٩ نوفمبر ٢٠٢٦»، أو '' حين لا تاريخ مقروء.
///
/// بتقويم **UTC** الذي كُتبت به لحظة المصدر — لا بتوقيت الجهاز: جهاز في أقصى
/// الشرق كان يعرض «١٠ نوفمبر» لسعر ٩ نوفمبر، والاختبار نفسه كان يتبع منطقة
/// الجهاز. والتاريخ المعروض هنا تاريخ المصدر لا تاريخ الزائر.
String pricesDayLabel(DateTime? time) =>
    time == null ? '' : formatGregorianDate(time.toUtc());

/// تاريخ فرانكفورت `YYYY-MM-DD` كما يُعرض، أو '' لغير المقروء.
String pricesFxDayLabel(String? day) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(day ?? '');
  if (match == null) return '';
  final date = DateTime(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
  return formatGregorianDate(date);
}

// ---------------------------------------------------------------------------
// الشاشة
// ---------------------------------------------------------------------------

/// شاشة الأداتين: رقاقتان في الأعلى، ولوحة واحدة ظاهرة تحتهما. تُدفع من وجهة
/// «خدماتنا» (`services_hub_screen.dart`) ببطاقة كل أداة.
class ServicesPricesScreen extends StatefulWidget {
  const ServicesPricesScreen({super.key, this.initial = PricesTool.gold});

  final PricesTool initial;

  @override
  State<ServicesPricesScreen> createState() => _ServicesPricesScreenState();
}

class _ServicesPricesScreenState extends State<ServicesPricesScreen> {
  late PricesTool _selected = widget.initial;
  PricesSnapshot? _prices;
  bool _loading = true;
  bool _failed = false;
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final prices = await AppServices.of(context).api.prices();
      if (!mounted) return;
      setState(() {
        _prices = prices;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _prices = null;
        _failed = true;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final prices = _prices;
    return Scaffold(
      appBar: AppBar(title: const Text('أسعار الذهب والعملات')),
      body: Column(
        children: [
          _ToolTabs(
            selected: _selected,
            onSelected: (tool) => setState(() => _selected = tool),
          ),
          Expanded(
            child: _loading
                ? const _PricesLoadingView()
                : (prices == null || _failed)
                    ? _PricesErrorView(onRetry: _load)
                    : IndexedStack(
                        index: _selected.index,
                        children: [
                          GoldCalculatorPanel(gold: prices.gold),
                          CurrencyConverterPanel(prices: prices),
                        ],
                      ),
          ),
        ],
      ),
    );
  }
}

class _ToolTabs extends StatelessWidget {
  const _ToolTabs({required this.selected, required this.onSelected});

  final PricesTool selected;
  final ValueChanged<PricesTool> onSelected;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final tool in PricesTool.values)
            InkWell(
              key: Key('prices_tab_${tool.name}'),
              borderRadius: BorderRadius.circular(999),
              onTap: () => onSelected(tool),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                decoration: BoxDecoration(
                  color: tool == selected ? c.sky : c.surfaceSunk,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: tool == selected ? c.sky : c.line,
                  ),
                ),
                child: Text(
                  tool.label,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                    height: 1,
                    color: tool == selected ? c.onSky : c.inkSoft,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// انتظار الأسعار: نصّ عربي صريح مع مؤشّر — لا شاشة فارغة.
class _PricesLoadingView extends StatelessWidget {
  const _PricesLoadingView();

  @override
  Widget build(BuildContext context) {
    return Center(
      key: const Key('prices_loading'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
          const SizedBox(height: 12),
          Text(
            'جارٍ جلب الأسعار…',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: context.c.inkSoft,
            ),
          ),
        ],
      ),
    );
  }
}

/// حالة الغياب: الأداتان وتاريخهما مخفيّان، والرسالة العربية وزرّ المحاولة ظاهران.
class _PricesErrorView extends StatelessWidget {
  const _PricesErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Center(
      key: const Key('prices_error'),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, size: 34, color: c.inkFaint),
            const SizedBox(height: 12),
            Text(
              pricesUnavailableMessage,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                height: 1.8,
                fontWeight: FontWeight.w700,
                color: c.danger,
              ),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              key: const Key('prices_retry'),
              onPressed: onRetry,
              child: const Text('إعادة المحاولة'),
            ),
          ],
        ),
      ),
    );
  }
}

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

/// سطر نتيجة: أخضر عند النجاح وأحمر عند الخطأ — كما في حاسبات #190.
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

/// رقاقة اختيار (عيار أو عملة أو اتجاه) — نمط رقاقات الحاسبات نفسه.
class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? c.sky : c.surfaceSunk,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? c.sky : c.line),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w900,
            height: 1,
            color: selected ? c.onSky : c.inkSoft,
          ),
        ),
      ),
    );
  }
}

/// لوحة حاسبة الذهب: الوزن (غرام) × العيار، وتحت الزرّ قيمة المعدن وتاريخ المصدر.
class GoldCalculatorPanel extends StatefulWidget {
  const GoldCalculatorPanel({super.key, required this.gold});

  /// سعر الغرام من `/api/prices`، أو `null` إن غاب — واللوحة تقولها صراحةً.
  final GoldPrices? gold;

  @override
  State<GoldCalculatorPanel> createState() => _GoldCalculatorPanelState();
}

class _GoldCalculatorPanelState extends State<GoldCalculatorPanel> {
  String _weight = '';
  int _karat = 24;
  String? _message;
  bool _isError = false;

  void _run() {
    final gold = widget.gold;
    if (gold == null) {
      setState(() {
        _isError = true;
        _message = pricesUnavailableMessage;
      });
      return;
    }
    final outcome = goldMetalValue(
      weight: _weight,
      karat: _karat,
      gold: gold,
    );
    setState(() {
      _message = outcome.text;
      _isError = outcome.isError;
    });
  }

  @override
  Widget build(BuildContext context) {
    final gold = widget.gold;
    final day = pricesDayLabel(gold?.sourceTime);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
      children: [
        const _PanelLead(
          'اكتب وزن الذهب بالغرام واختر عياره، وتظهر قيمة المعدن بلا مصنعية '
          'بسعر المصدر.',
        ),
        const SizedBox(height: 14),
        TextFormField(
          key: const Key('prices_gold_weight'),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (value) => _weight = value,
          decoration: const InputDecoration(
            labelText: 'الوزن (غرام)',
            hintText: 'مثال: ٢١',
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final karat in goldKarats)
              _ChoiceChip(
                key: Key('prices_gold_karat_$karat'),
                label: 'عيار ${arabicDigits(karat)}',
                selected: karat == _karat,
                onTap: () => setState(() => _karat = karat),
              ),
          ],
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            key: const Key('prices_gold_run'),
            onPressed: _run,
            child: const Text('احسب قيمة المعدن'),
          ),
        ),
        if (_message != null)
          _ResultBox(
            key: const Key('prices_gold_result'),
            message: _message!,
            isError: _isError,
          ),
        const SizedBox(height: 14),
        Text(
          key: const Key('prices_gold_source'),
          day.isEmpty
              ? 'المصدر: gold-api.'
              : 'تاريخ سعر الذهب: $day — المصدر: gold-api.',
          style: TextStyle(fontSize: 11.5, height: 1.7, color: context.c.inkFaint),
        ),
      ],
    );
  }
}

/// لوحة محوّل العملات: المبلغ والعملة والاتجاه، ثم النتيجة وتاريخ سعر الصرف.
class CurrencyConverterPanel extends StatefulWidget {
  const CurrencyConverterPanel({super.key, required this.prices});

  final PricesSnapshot prices;

  @override
  State<CurrencyConverterPanel> createState() => _CurrencyConverterPanelState();
}

class _CurrencyConverterPanelState extends State<CurrencyConverterPanel> {
  String _amount = '';
  String? _code;
  bool _toIls = false;
  String? _message;
  bool _isError = false;

  List<CurrencyPrice> get _currencies => widget.prices.currencies;

  CurrencyPrice? get _currency {
    if (_currencies.isEmpty) return null;
    final code = _code;
    for (final currency in _currencies) {
      if (currency.code == code) return currency;
    }
    return _currencies.first;
  }

  void _run() {
    final currency = _currency;
    if (currency == null) {
      setState(() {
        _isError = true;
        _message = pricesUnavailableMessage;
      });
      return;
    }
    final outcome = convertCurrencyAmount(
      amount: _amount,
      currency: currency,
      toIls: _toIls,
    );
    setState(() {
      _message = outcome.text;
      _isError = outcome.isError;
    });
  }

  @override
  Widget build(BuildContext context) {
    final currency = _currency;
    final day = pricesFxDayLabel(widget.prices.fxDate);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 30),
      children: [
        const _PanelLead(
          'حوّل بين الشيكل والعملات الست بسعر الصرف المعلن — اختر العملة '
          'والاتجاه.',
        ),
        const SizedBox(height: 14),
        TextFormField(
          key: const Key('prices_fx_amount'),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (value) => _amount = value,
          decoration: const InputDecoration(
            labelText: 'المبلغ',
            hintText: 'مثال: ١٠٠٠',
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final item in _currencies)
              _ChoiceChip(
                key: Key('prices_fx_currency_${item.code}'),
                label: item.nameAr,
                selected: currency != null && item.code == currency.code,
                onTap: () => setState(() => _code = item.code),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _ChoiceChip(
              key: const Key('prices_fx_to_ils'),
              label: 'من العملة إلى الشيكل',
              selected: _toIls,
              onTap: () => setState(() => _toIls = true),
            ),
            _ChoiceChip(
              key: const Key('prices_fx_to_foreign'),
              label: 'من الشيكل إلى العملة',
              selected: !_toIls,
              onTap: () => setState(() => _toIls = false),
            ),
          ],
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            key: const Key('prices_fx_run'),
            onPressed: _run,
            child: const Text('حوّل'),
          ),
        ),
        if (_message != null)
          _ResultBox(
            key: const Key('prices_fx_result'),
            message: _message!,
            isError: _isError,
          ),
        const SizedBox(height: 14),
        Text(
          key: const Key('prices_fx_source'),
          day.isEmpty
              ? 'المصدر: Frankfurter.'
              : 'تاريخ سعر الصرف: $day — المصدر: Frankfurter.',
          style: TextStyle(fontSize: 11.5, height: 1.7, color: context.c.inkFaint),
        ),
      ],
    );
  }
}
