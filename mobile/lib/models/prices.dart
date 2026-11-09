/// نماذج أسعار الذهب والعملات (تذكرة #189) — شكل `GET /api/prices`:
/// `{ success, gold: { k24, k21, k18, currency, source_time }, currencies:
/// [{ code, name_ar, ils_per_unit }], fx_date, stale }`.
///
/// الخادم وحده يقرأ المصدرين ويحسب الغرامات والشيكل لكل وحدة؛ هذا الملف يقرأ
/// ما وصل كما هو ولا يعيد حساب سعر، ولا يخترع تاريخاً حين يغيب: الحقل الغائب
/// يبقى `null` والواجهة تخفي سطره بدل عرض تاريخ وهمي.
class GoldPrices {
  const GoldPrices({
    required this.k24,
    required this.k21,
    required this.k18,
    this.currency = 'ILS',
    this.sourceTime,
  });

  final double k24;
  final double k21;
  final double k18;

  /// عملة السعر — الشيكل دائماً اليوم، والحقل من الخادم لا ثابتاً في العميل.
  final String currency;

  /// لحظة المصدر نفسه (من gold-api)، لا لحظة جلبنا له — تُعرض ليُعرف قدمها.
  final DateTime? sourceTime;

  /// سعر غرام عيار واحد، أو `null` لعيار غير معروف.
  double? perGram(int karat) {
    switch (karat) {
      case 24:
        return k24;
      case 21:
        return k21;
      case 18:
        return k18;
      default:
        return null;
    }
  }

  factory GoldPrices.fromJson(Map<String, dynamic> json) {
    return GoldPrices(
      k24: _toDouble(json['k24']) ?? 0,
      k21: _toDouble(json['k21']) ?? 0,
      k18: _toDouble(json['k18']) ?? 0,
      currency: '${json['currency'] ?? 'ILS'}',
      sourceTime: _toDateTime(json['source_time']),
    );
  }
}

/// عملة واحدة بسعرها: كم شيكلاً تساوي الوحدة الواحدة منها.
class CurrencyPrice {
  const CurrencyPrice({
    required this.code,
    required this.nameAr,
    required this.ilsPerUnit,
  });

  final String code;
  final String nameAr;
  final double ilsPerUnit;

  factory CurrencyPrice.fromJson(Map<String, dynamic> json) {
    return CurrencyPrice(
      code: '${json['code'] ?? ''}',
      nameAr: '${json['name_ar'] ?? json['code'] ?? ''}',
      ilsPerUnit: _toDouble(json['ils_per_unit']) ?? 0,
    );
  }
}

/// ردّ `/api/prices` كاملاً. الأداة لا تُعرض إطلاقاً حين يغيب [gold] أو تخلو
/// القائمة — لا حاسبة بسعر صفر ولا محوّل بلا عملة.
class PricesSnapshot {
  const PricesSnapshot({
    this.gold,
    this.currencies = const [],
    this.fxDate,
    this.stale = false,
  });

  final GoldPrices? gold;
  final List<CurrencyPrice> currencies;

  /// تاريخ فرانكفورت `YYYY-MM-DD` لسعر الصرف، أو `null` إن لم يصل.
  final String? fxDate;

  /// `true` حين يخدم الخادم آخر نسخة ناجحة بعد تعطّل المصدر — والمصدر الأم
  /// في `source_time`/`fx_date` كي لا تُقرأ على أنها أسعار اللحظة.
  final bool stale;

  /// أداة الذهب صالحة حين يصل سعرها، وأداة العملات حين تصل عملة واحدة على الأقل.
  bool get hasGold => gold != null;
  bool get hasCurrencies => currencies.isNotEmpty;

  factory PricesSnapshot.fromJson(Map<String, dynamic> json) {
    final rawGold = json['gold'];
    final rawCurrencies = json['currencies'];
    return PricesSnapshot(
      gold: rawGold is Map
          ? GoldPrices.fromJson(Map<String, dynamic>.from(rawGold))
          : null,
      currencies: rawCurrencies is List
          ? rawCurrencies
              .whereType<Map>()
              .map((row) => CurrencyPrice.fromJson(Map<String, dynamic>.from(row)))
              .where((currency) => currency.code.isNotEmpty)
              .toList()
          : const [],
      fxDate: json['fx_date'] is String && '${json['fx_date']}'.isNotEmpty
          ? '${json['fx_date']}'
          : null,
      stale: json['stale'] == true,
    );
  }
}

double? _toDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value'.trim());
}

DateTime? _toDateTime(Object? value) {
  if (value is! String || value.trim().isEmpty) return null;
  return DateTime.tryParse(value);
}
