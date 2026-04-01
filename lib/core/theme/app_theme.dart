import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 40;
}

class AppColors {
  static const Color canvas = Color(0xFFF6F2FF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1EAFE);
  static const Color textStrong = Color(0xFF1E1238);
  static const Color textSoft = Color(0xFF5B4B7A);
  static const Color borderSubtle = Color(0xFFE3D8F8);
  static const Color accent = Color(0xFF5B21B6);
  static const Color accentSoft = Color(0xFFEDE9FE);
  static const Color success = Color(0xFF15803D);
  static const Color warning = Color(0xFFD97706);
  static const Color danger = Color(0xFFB42318);
}

class AppTheme {
  static ThemeData lightTheme({Color accentColor = AppColors.accent}) {
    final base = ThemeData(useMaterial3: true, brightness: Brightness.light);

    final colorScheme =
        ColorScheme.fromSeed(
          seedColor: accentColor,
          brightness: Brightness.light,
        ).copyWith(
          primary: accentColor,
          onPrimary: _onColor(accentColor),
          secondary: accentColor.withValues(alpha: 0.14),
          onSecondary: AppColors.textStrong,
          surface: AppColors.surface,
          onSurface: AppColors.textStrong,
          outline: AppColors.borderSubtle,
          error: AppColors.danger,
          onError: Colors.white,
        );

    final textTheme = _buildTextTheme(base.textTheme, colorScheme);

    return base.copyWith(
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.canvas,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: AppColors.canvas,
        foregroundColor: AppColors.textStrong,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.borderSubtle),
        ),
        margin: EdgeInsets.zero,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,
          minimumSize: const Size.fromHeight(52),
          elevation: 0,
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.textStrong,
          side: const BorderSide(color: AppColors.borderSubtle),
          minimumSize: const Size.fromHeight(48),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        hintStyle: textTheme.bodyMedium?.copyWith(color: AppColors.textSoft),
        labelStyle: textTheme.bodyMedium?.copyWith(color: AppColors.textSoft),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.primary, width: 1.4),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.textStrong,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.borderSubtle,
        thickness: 1,
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.borderSubtle),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }

  static List<BoxShadow> softShadow = const [
    BoxShadow(color: Color(0x1A0F172A), blurRadius: 18, offset: Offset(0, 8)),
  ];

  static TextTheme _buildTextTheme(TextTheme base, ColorScheme colorScheme) {
    final body = GoogleFonts.robotoTextTheme(base).apply(
      bodyColor: AppColors.textStrong,
      displayColor: AppColors.textStrong,
    );

    return body.copyWith(
      displayLarge: GoogleFonts.montserrat(
        fontSize: 39,
        fontWeight: FontWeight.w700,
        color: AppColors.textStrong,
      ),
      headlineLarge: GoogleFonts.montserrat(
        fontSize: 31,
        fontWeight: FontWeight.w700,
        color: AppColors.textStrong,
      ),
      headlineMedium: GoogleFonts.montserrat(
        fontSize: 25,
        fontWeight: FontWeight.w700,
        color: AppColors.textStrong,
      ),
      titleLarge: GoogleFonts.montserrat(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: AppColors.textStrong,
      ),
      titleMedium: GoogleFonts.montserrat(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.textStrong,
      ),
      bodyLarge: GoogleFonts.roboto(
        fontSize: 16,
        height: 1.5,
        color: AppColors.textStrong,
      ),
      bodyMedium: GoogleFonts.roboto(
        fontSize: 14,
        height: 1.45,
        color: AppColors.textSoft,
      ),
      labelLarge: GoogleFonts.roboto(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: colorScheme.onPrimary,
      ),
    );
  }

  static Color _onColor(Color color) {
    return color.computeLuminance() > 0.45
        ? AppColors.textStrong
        : Colors.white;
  }
}
