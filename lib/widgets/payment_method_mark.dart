import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';

/// Brand mark for a catalog payment method.
///
/// Official trademark artwork is not bundled. Each mark is a geometric badge
/// in the method's color so the picker reads as a real checkout, not a list
/// of unlabeled buttons.
class PaymentMethodMark extends StatelessWidget {
  const PaymentMethodMark({
    super.key,
    required this.method,
    this.size = 48,
  });

  final PaymentMethodCatalog method;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = method.brandColor ?? const Color(0xFF5B21B6);
    final onColor = _onColor(color);

    if (method.logoUrl != null && method.logoUrl!.startsWith('http')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.28),
        child: Image.network(
          method.logoUrl!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _Badge(
            size: size,
            color: color,
            onColor: onColor,
            child: _glyph(method.code, onColor, size),
          ),
        ),
      );
    }

    return _Badge(
      size: size,
      color: color,
      onColor: onColor,
      child: _glyph(method.code, onColor, size),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.size,
    required this.color,
    required this.onColor,
    required this.child,
  });

  final double size;
  final Color color;
  final Color onColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: onColor.withValues(alpha: 0.12)),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.22),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

Widget _glyph(String code, Color onColor, double size) {
  final iconSize = size * 0.46;
  switch (code) {
    case 'crypto_usdt':
      return Icon(Icons.currency_bitcoin_rounded, color: onColor, size: iconSize);
    case 'gift_card':
      return Icon(Icons.card_giftcard_rounded, color: onColor, size: iconSize);
    case 'pago_movil':
      return Icon(Icons.smartphone_rounded, color: onColor, size: iconSize);
    case 'bancolombia':
      return _Letter(letter: 'B', color: onColor, size: size);
    case 'nequi':
      return _Letter(letter: 'N', color: onColor, size: size);
    case 'bre_b':
      return _Letter(letter: 'B', color: onColor, size: size);
    case 'zinli':
      return _Letter(letter: 'Z', color: onColor, size: size);
    case 'efectivo':
      return Icon(Icons.payments_rounded, color: onColor, size: iconSize);
    default:
      return Icon(Icons.account_balance_wallet_rounded, color: onColor, size: iconSize);
  }
}

class _Letter extends StatelessWidget {
  const _Letter({required this.letter, required this.color, required this.size});

  final String letter;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Text(
      letter,
      style: GoogleFonts.manrope(
        color: color,
        fontWeight: FontWeight.w900,
        fontSize: size * 0.44,
        height: 1,
      ),
    );
  }
}

Color _onColor(Color color) {
  return ThemeData.estimateBrightnessForColor(color) == Brightness.dark
      ? Colors.white
      : const Color(0xFF111111);
}
