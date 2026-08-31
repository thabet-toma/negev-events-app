import 'package:flutter/material.dart';

/// هوية بصرية مطابقة لواجهة الويب: أخضر داكن جداً مع ذهبي.
class AppTheme {
  const AppTheme._();

  static const Color bgPrimary = Color(0xFF030A06);
  static const Color bgSecondary = Color(0xFF07160E);
  static const Color bgSurface = Color(0xFF0A1F14);
  static const Color bgCard = Color(0xFF0B1C14);

  static const Color gold = Color(0xFFF3C768);
  static const Color goldLight = Color(0xFFFFF0BE);
  static const Color goldDark = Color(0xFFA17822);
  static const Color emerald = Color(0xFF10E79D);

  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFFCBD5E1);
  static const Color textMuted = Color(0xFF809689);
  static const Color textGold = Color(0xFFF8DF97);

  static const Color borderSubtle = Color(0x29F3C768);

  static ThemeData build() {
    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: bgPrimary,
      colorScheme: base.colorScheme.copyWith(
        primary: gold,
        onPrimary: bgPrimary,
        secondary: emerald,
        surface: bgSurface,
        onSurface: textPrimary,
        error: const Color(0xFFEF5350),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgSecondary,
        foregroundColor: textGold,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: textGold,
          fontSize: 19,
          fontWeight: FontWeight.bold,
        ),
      ),
      cardTheme: CardThemeData(
        color: bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: borderSubtle),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: bgSurface,
        hintStyle: const TextStyle(color: textMuted),
        labelStyle: const TextStyle(color: textSecondary),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: gold, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: gold,
          foregroundColor: bgPrimary,
          padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 22),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: bgSecondary,
        indicatorColor: gold.withValues(alpha: 0.18),
        labelTextStyle: WidgetStateProperty.all(
          const TextStyle(fontSize: 11.5, color: textSecondary),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? gold : textMuted,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(color: borderSubtle, thickness: 1),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: bgSurface,
        contentTextStyle: TextStyle(color: textPrimary),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
