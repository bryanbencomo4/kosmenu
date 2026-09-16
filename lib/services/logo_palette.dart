/// Reads a brand palette straight from the logo's pixels.
///
/// This runs locally and is the palette merchants actually end up with: the
/// remote Gemini refinement charges AI credits and fails silently whenever the
/// balance is empty, so this module must stand on its own.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

/// Colors taken from a logo.
class LogoPalette {
  const LogoPalette({
    required this.primary,
    required this.accent,
    required this.surface,
    required this.text,
    required this.colors,
  });

  final Color primary;
  final Color accent;
  final Color surface;
  final Color text;

  /// The logo's dominant colors, most frequent first.
  final List<Color> colors;
}

/// Distance between two colors on a 0-255 scale, weighting each channel by how
/// much it contributes to perceived luminance.
///
/// `Color.r`/`g`/`b` are normalized 0.0-1.0 doubles since Flutter's wide-gamut
/// color migration, so they have to be scaled back up: every threshold compared
/// against this distance is expressed on the 0-255 scale of the old `int`
/// channels. Without the scaling no distance ever exceeded 1.0, so every color
/// counted as a duplicate of the first one and the extracted palette collapsed
/// to a single color.
double logoColorDistance(Color a, Color b) {
  final dr = ((a.r - b.r) * 255).abs();
  final dg = ((a.g - b.g) * 255).abs();
  final db = ((a.b - b.b) * 255).abs();
  return dr * 0.3 + dg * 0.59 + db * 0.11;
}

/// Picks a color that reads as distinct from [primary].
///
/// Falls back to rotating [primary]'s hue when the logo has no second color far
/// enough away, which is common for single-color logos.
Color resolveLogoAccentColor({
  required Color primary,
  required List<Color> candidates,
}) {
  for (final candidate in candidates) {
    if (logoColorDistance(primary, candidate) < 72) {
      continue;
    }
    final hsl = HSLColor.fromColor(candidate);
    if (hsl.saturation > 0.1 && hsl.lightness > 0.16 && hsl.lightness < 0.9) {
      return candidate;
    }
  }

  final base = HSLColor.fromColor(primary);
  final shifted = (base.hue + 34.0) % 360.0;
  final derived = base
      .withHue(shifted)
      .withSaturation((base.saturation + 0.08).clamp(0.18, 0.9));
  final lightness = base.lightness < 0.26
      ? 0.44
      : (base.lightness + 0.06).clamp(0.26, 0.78);
  return derived.withLightness(lightness).toColor();
}

/// Extracts a palette from encoded image [bytes].
///
/// Returns null when the bytes are not a decodable image or hold nothing but
/// near-transparent pixels, which is the only case where there is no logo color
/// to build a brand from.
LogoPalette? extractLogoPalette(Uint8List bytes) {
  final img.Image? decoded;
  try {
    decoded = img.decodeImage(bytes);
  } catch (_) {
    // Format probing reads ahead of the buffer on very short inputs and throws
    // a RangeError instead of just declining the bytes.
    return null;
  }
  if (decoded == null) {
    return null;
  }

  final resized = img.copyResize(
    decoded,
    width: decoded.width > 96 ? 96 : decoded.width,
  );

  final Map<int, int> colorCounts = <int, int>{};
  for (var y = 0; y < resized.height; y += 2) {
    for (var x = 0; x < resized.width; x += 2) {
      final pixel = resized.getPixel(x, y);
      final a = pixel.a;
      // Skip the transparent padding around most logos, otherwise it would
      // dominate the count and decide the brand color.
      if (a < 180) {
        continue;
      }

      final quantized =
          ((pixel.r ~/ 12) << 16) | ((pixel.g ~/ 12) << 8) | (pixel.b ~/ 12);
      colorCounts.update(quantized, (value) => value + 1, ifAbsent: () => 1);
    }
  }

  if (colorCounts.isEmpty) {
    return null;
  }

  final sorted = colorCounts.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));

  final List<Color> extractedColors = <Color>[];
  for (final entry in sorted) {
    final r = (((entry.key >> 16) & 0xFF) * 12).clamp(0, 255);
    final g = (((entry.key >> 8) & 0xFF) * 12).clamp(0, 255);
    final b = ((entry.key & 0xFF) * 12).clamp(0, 255);
    final candidate = Color.fromARGB(255, r, g, b);
    if (extractedColors.any(
      (item) => logoColorDistance(item, candidate) < 34,
    )) {
      continue;
    }
    extractedColors.add(candidate);
    if (extractedColors.length == 8) {
      break;
    }
  }

  Color? primary;
  Color? secondary;
  Color? surface;
  // Prefer a saturated mid-tone: the most frequent color in a logo is usually
  // its white or black background, which makes a poor brand color.
  for (final candidate in extractedColors) {
    final hsl = HSLColor.fromColor(candidate);
    if (hsl.saturation > 0.28 && hsl.lightness > 0.18 && hsl.lightness < 0.78) {
      primary = candidate;
      break;
    }
  }

  primary ??= extractedColors.first;
  for (final candidate in extractedColors) {
    if (logoColorDistance(primary, candidate) < 85) {
      continue;
    }
    final hsl = HSLColor.fromColor(candidate);
    if (hsl.saturation > 0.12 && hsl.lightness > 0.14 && hsl.lightness < 0.9) {
      secondary = candidate;
      break;
    }
  }

  secondary ??= resolveLogoAccentColor(
    primary: primary,
    candidates: extractedColors,
  );
  for (final candidate in extractedColors) {
    final lightness = HSLColor.fromColor(candidate).lightness;
    if (lightness < 0.28) {
      surface = candidate;
      break;
    }
  }
  surface ??= extractedColors.reduce((best, current) {
    return HSLColor.fromColor(current).lightness <
            HSLColor.fromColor(best).lightness
        ? current
        : best;
  });

  return LogoPalette(
    primary: primary,
    accent: secondary,
    surface: surface,
    text: ThemeData.estimateBrightnessForColor(surface) == Brightness.dark
        ? const Color(0xFFF8F5FF)
        : const Color(0xFF1D1733),
    colors: extractedColors,
  );
}
