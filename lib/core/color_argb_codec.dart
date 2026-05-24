import 'dart:ui' show Color;

/// Converts Flutter ARGB values for PostgreSQL `integer` columns (signed int32).
class ColorArgbCodec {
  const ColorArgbCodec._();

  static int toSigned32(int unsignedArgb) {
    return unsignedArgb > 0x7FFFFFFF ? unsignedArgb - 0x100000000 : unsignedArgb;
  }

  static int toUnsigned32(int storedValue) {
    if (storedValue < 0) {
      return storedValue + 0x100000000;
    }
    return storedValue;
  }

  static int fromColor(Color color) => toSigned32(color.toARGB32());

  static Color toColor(int storedValue) => Color(toUnsigned32(storedValue));
}
