import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';

/// Resolution-aware WebP marks (`1.0x` / `2.0x` / `3.0x`) — no SVG assets.
/// Flutter picks the density variant; on web we skip cacheWidth so bitmaps stay crisp.
const Map<String, String> kPaymentMethodAssetLogos = <String, String>{
  'crypto_usdt': 'assets/branding/payments/binance_pay.webp',
  'pago_movil': 'assets/branding/payments/pago_movil_bdv.webp',
};

/// Brand mark for a catalog payment method.
class PaymentMethodMark extends StatelessWidget {
  const PaymentMethodMark({
    super.key,
    required this.method,
    this.size = 56,
  });

  final PaymentMethodCatalog method;
  final double size;

  Color get _plateColor {
    switch (method.code) {
      case 'crypto_usdt':
        return const Color(0xFF0B0E11);
      case 'pago_movil':
        return Colors.white;
      default:
        return method.brandColor ?? const Color(0xFF5B21B6);
    }
  }

  BorderRadius get _radius {
    if (method.code == 'crypto_usdt') {
      return BorderRadius.circular(size / 2);
    }
    return BorderRadius.circular(size * 0.28);
  }

  EdgeInsets get _padding {
    switch (method.code) {
      case 'crypto_usdt':
        return EdgeInsets.zero;
      case 'pago_movil':
        return EdgeInsets.all(size * 0.12);
      default:
        return EdgeInsets.all(size * 0.1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = method.brandColor ?? const Color(0xFF5B21B6);
    final onColor = _onColor(color);
    final asset = kPaymentMethodAssetLogos[method.code];
    // Mobile only: decode near device pixels. On web, cacheWidth softens marks.
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final int? decodePx = kIsWeb
        ? null
        : (size * dpr).round().clamp(96, 384);

    // Gift card: original gift-box icon (no photo asset).
    if (method.code == 'gift_card') {
      return _Badge(
        size: size,
        color: color,
        onColor: onColor,
        child: _glyph(method.code, onColor, size),
      );
    }

    if (asset != null) {
      final isBinance = method.code == 'crypto_usdt';
      // Binance: asset is a full-bleed circle — ClipOval + cover, no plate
      // behind it (that plate caused the black side bars).
      if (isBinance) {
        return Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.18),
                blurRadius: 10,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: ClipOval(
            child: Image.asset(
              asset,
              width: size,
              height: size,
              fit: BoxFit.cover,
              alignment: Alignment.center,
              filterQuality: FilterQuality.high,
              isAntiAlias: true,
              gaplessPlayback: true,
              cacheWidth: decodePx,
              cacheHeight: decodePx,
              errorBuilder: (_, _, _) => ColoredBox(
                color: const Color(0xFF0B0E11),
                child: Center(child: _glyph(method.code, onColor, size)),
              ),
            ),
          ),
        );
      }

      return Container(
        width: size,
        height: size,
        padding: _padding,
        decoration: BoxDecoration(
          color: _plateColor,
          borderRadius: _radius,
          border: Border.all(color: const Color(0xFFE8E2F4)),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.14),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Image.asset(
          asset,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.medium,
          isAntiAlias: true,
          gaplessPlayback: true,
          cacheWidth: decodePx,
          cacheHeight: decodePx,
          errorBuilder: (_, _, _) => Center(
            child: _glyph(method.code, onColor, size),
          ),
        ),
      );
    }

    if (method.logoUrl != null && method.logoUrl!.startsWith('http')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.28),
        child: CachedNetworkImage(
          imageUrl: method.logoUrl!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorWidget: (_, _, _) => _Badge(
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
