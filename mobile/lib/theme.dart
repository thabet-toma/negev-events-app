import 'package:flutter/material.dart';

/// لوحة سماء النقب — رموز مطابقة حرفياً لمتغيرات CSS في `web/styles.css`
/// (الفاتح من `:root`، الداكن من `:root[data-theme="dark"]`)، بدل ثوابت لون
/// ساكنة لا تتبع وضعاً. الوصول من الواجهات عبر `context.c.<رمز>`.
@immutable
class NegevPalette extends ThemeExtension<NegevPalette> {
  const NegevPalette({
    required this.ground,
    required this.surface,
    required this.surfaceSunk,
    required this.line,
    required this.lineSoft,
    required this.ink,
    required this.inkSoft,
    required this.inkFaint,
    required this.sky,
    required this.skyDeep,
    required this.skyBright,
    required this.skyWash,
    required this.gold,
    required this.goldWash,
    required this.mourn,
    required this.mournWash,
    required this.onSky,
    required this.success,
    required this.successWash,
    required this.warn,
    required this.warnWash,
    required this.danger,
    required this.dangerWash,
  });

  final Color ground;
  final Color surface;
  final Color surfaceSunk;
  final Color line;
  final Color lineSoft;
  final Color ink;
  final Color inkSoft;
  final Color inkFaint;
  final Color sky;
  final Color skyDeep;
  final Color skyBright;
  final Color skyWash;

  /// لون نوع «عرس» على الخادم — لا لون واجهة عام. لا تستعمله لإبراز أو أزرار.
  final Color gold;
  final Color goldWash;
  final Color mourn;
  final Color mournWash;

  /// نص/أيقونة فوق [sky] — يبقى مقروءاً في الوضعين (أبيض فوق سماء داكنة
  /// نهاراً، وحبر داكن فوق سماء ساطعة ليلاً).
  final Color onSky;

  final Color success;
  final Color successWash;
  final Color warn;
  final Color warnWash;
  final Color danger;
  final Color dangerWash;

  static const light = NegevPalette(
    ground: Color(0xFFEEF2F6),
    surface: Color(0xFFFFFFFF),
    surfaceSunk: Color(0xFFE3EAF1),
    line: Color(0xFFCDD9E4),
    lineSoft: Color(0xFFDFE7EE),
    ink: Color(0xFF0C1B2A),
    inkSoft: Color(0xFF47617A),
    inkFaint: Color(0xFF4F6C83),
    sky: Color(0xFF0369A1),
    skyDeep: Color(0xFF075985),
    skyBright: Color(0xFF38BDF8),
    skyWash: Color(0xFFE0F2FE),
    gold: Color(0xFF8F6A20),
    goldWash: Color(0xFFFDF6E3),
    mourn: Color(0xFF475569),
    mournWash: Color(0xFFEEF1F5),
    onSky: Color(0xFFFFFFFF),
    success: Color(0xFF15803D),
    successWash: Color(0xFFDCFCE7),
    warn: Color(0xFFB45309),
    warnWash: Color(0xFFFEF3C7),
    danger: Color(0xFFB91C1C),
    dangerWash: Color(0xFFFEE2E2),
  );

  static const dark = NegevPalette(
    ground: Color(0xFF0A1622),
    surface: Color(0xFF12212F),
    surfaceSunk: Color(0xFF0D1B27),
    line: Color(0xFF24384A),
    lineSoft: Color(0xFF1B2C3C),
    ink: Color(0xFFEAF2F8),
    inkSoft: Color(0xFF9FB6C9),
    inkFaint: Color(0xFF7F95A6),
    sky: Color(0xFF38BDF8),
    skyDeep: Color(0xFF7DD3FC),
    skyBright: Color(0xFF0EA5E9),
    skyWash: Color(0xFF0D2B3E),
    gold: Color(0xFFE3BD6A),
    goldWash: Color(0xFF2A2113),
    mourn: Color(0xFF94A3B8),
    mournWash: Color(0xFF1A232E),
    onSky: Color(0xFF06202E),
    success: Color(0xFF4ADE80),
    successWash: Color(0xFF0F2B1C),
    warn: Color(0xFFFBBF24),
    warnWash: Color(0xFF2C210A),
    danger: Color(0xFFF87171),
    dangerWash: Color(0xFF301313),
  );

  @override
  NegevPalette copyWith({
    Color? ground,
    Color? surface,
    Color? surfaceSunk,
    Color? line,
    Color? lineSoft,
    Color? ink,
    Color? inkSoft,
    Color? inkFaint,
    Color? sky,
    Color? skyDeep,
    Color? skyBright,
    Color? skyWash,
    Color? gold,
    Color? goldWash,
    Color? mourn,
    Color? mournWash,
    Color? onSky,
    Color? success,
    Color? successWash,
    Color? warn,
    Color? warnWash,
    Color? danger,
    Color? dangerWash,
  }) {
    return NegevPalette(
      ground: ground ?? this.ground,
      surface: surface ?? this.surface,
      surfaceSunk: surfaceSunk ?? this.surfaceSunk,
      line: line ?? this.line,
      lineSoft: lineSoft ?? this.lineSoft,
      ink: ink ?? this.ink,
      inkSoft: inkSoft ?? this.inkSoft,
      inkFaint: inkFaint ?? this.inkFaint,
      sky: sky ?? this.sky,
      skyDeep: skyDeep ?? this.skyDeep,
      skyBright: skyBright ?? this.skyBright,
      skyWash: skyWash ?? this.skyWash,
      gold: gold ?? this.gold,
      goldWash: goldWash ?? this.goldWash,
      mourn: mourn ?? this.mourn,
      mournWash: mournWash ?? this.mournWash,
      onSky: onSky ?? this.onSky,
      success: success ?? this.success,
      successWash: successWash ?? this.successWash,
      warn: warn ?? this.warn,
      warnWash: warnWash ?? this.warnWash,
      danger: danger ?? this.danger,
      dangerWash: dangerWash ?? this.dangerWash,
    );
  }

  @override
  NegevPalette lerp(ThemeExtension<NegevPalette>? other, double t) {
    if (other is! NegevPalette) return this;
    return NegevPalette(
      ground: Color.lerp(ground, other.ground, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceSunk: Color.lerp(surfaceSunk, other.surfaceSunk, t)!,
      line: Color.lerp(line, other.line, t)!,
      lineSoft: Color.lerp(lineSoft, other.lineSoft, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkSoft: Color.lerp(inkSoft, other.inkSoft, t)!,
      inkFaint: Color.lerp(inkFaint, other.inkFaint, t)!,
      sky: Color.lerp(sky, other.sky, t)!,
      skyDeep: Color.lerp(skyDeep, other.skyDeep, t)!,
      skyBright: Color.lerp(skyBright, other.skyBright, t)!,
      skyWash: Color.lerp(skyWash, other.skyWash, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      goldWash: Color.lerp(goldWash, other.goldWash, t)!,
      mourn: Color.lerp(mourn, other.mourn, t)!,
      mournWash: Color.lerp(mournWash, other.mournWash, t)!,
      onSky: Color.lerp(onSky, other.onSky, t)!,
      success: Color.lerp(success, other.success, t)!,
      successWash: Color.lerp(successWash, other.successWash, t)!,
      warn: Color.lerp(warn, other.warn, t)!,
      warnWash: Color.lerp(warnWash, other.warnWash, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      dangerWash: Color.lerp(dangerWash, other.dangerWash, t)!,
    );
  }
}

/// وصول قصير للرموز الحالية — `context.c.sky` بدل `Theme.of(context)...`.
/// يسقط إلى اللوحة الفاتحة إن غاب الامتداد (مثلاً `MaterialApp` بلا
/// `AppTheme.light()` صريح في اختبار) بدل رمي استثناء.
extension NegevColors on BuildContext {
  NegevPalette get c =>
      Theme.of(this).extension<NegevPalette>() ?? NegevPalette.light;
}

/// بناء `ThemeData` للوضعين — الفاتح افتراضياً، والداكن مدعوم بنفس اللوحة.
class AppTheme {
  const AppTheme._();

  static ThemeData light() => _build(NegevPalette.light, Brightness.light);

  static ThemeData dark() => _build(NegevPalette.dark, Brightness.dark);

  static ThemeData _build(NegevPalette c, Brightness brightness) {
    final base = ThemeData(
      brightness: brightness,
      useMaterial3: true,
      fontFamily: 'Cairo',
    );

    return base.copyWith(
      scaffoldBackgroundColor: c.ground,
      extensions: [c],
      colorScheme: base.colorScheme.copyWith(
        primary: c.sky,
        onPrimary: c.onSky,
        secondary: c.gold,
        surface: c.surface,
        onSurface: c.ink,
        error: c.danger,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.surfaceSunk,
        foregroundColor: c.ink,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: c.ink,
          fontSize: 19,
          fontWeight: FontWeight.bold,
        ),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: c.line),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surfaceSunk,
        hintStyle: TextStyle(color: c.inkFaint),
        labelStyle: TextStyle(color: c.inkSoft),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c.sky, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: c.sky,
          foregroundColor: c.onSky,
          padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 22),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surfaceSunk,
        indicatorColor: c.sky.withValues(alpha: 0.18),
        labelTextStyle: WidgetStateProperty.all(
          TextStyle(fontSize: 11.5, color: c.inkSoft),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? c.sky : c.inkFaint,
          ),
        ),
      ),
      dividerTheme: DividerThemeData(color: c.line, thickness: 1),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.surfaceSunk,
        contentTextStyle: TextStyle(color: c.ink),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
