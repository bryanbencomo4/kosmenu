import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:kosmenu_app/services/storage_image_url.dart';

/// Network image helper. Use [BoxFit.cover] for list thumbs; contain keeps a
/// blurred cover fill behind the photo (public-menu hybrid).
class SoftMediaImage extends StatelessWidget {
  const SoftMediaImage({
    super.key,
    required this.imageUrl,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.borderRadius,
    this.optimizeWidth = 240,
    this.backgroundColor,
    this.errorBuilder,
  });

  final String? imageUrl;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final int optimizeWidth;
  final Color? backgroundColor;
  final ImageErrorWidgetBuilder? errorBuilder;

  @override
  Widget build(BuildContext context) {
    final raw = imageUrl?.trim() ?? '';
    final optimized = StorageImageUrl.optimize(raw, width: optimizeWidth) ?? raw;
    final bg =
        backgroundColor ?? Theme.of(context).colorScheme.surfaceContainerHighest;

    Widget fallback(Object error, StackTrace? stackTrace) {
      if (errorBuilder != null) {
        return errorBuilder!(context, error, stackTrace);
      }
      return ColoredBox(
        color: bg,
        child: const Center(child: Icon(Icons.fastfood_outlined)),
      );
    }

    if (optimized.isEmpty) {
      return SizedBox(
        width: width,
        height: height,
        child: fallback(StateError('empty'), StackTrace.current),
      );
    }

    final useContain = fit == BoxFit.contain || fit == BoxFit.scaleDown;

    Widget network(String url, {required BoxFit imageFit}) {
      return SizedBox.expand(
        child: Image.network(
          url,
          fit: imageFit,
          alignment: Alignment.center,
          gaplessPlayback: true,
          errorBuilder: (context, error, stackTrace) {
            if (url != raw && raw.isNotEmpty) {
              return Image.network(
                raw,
                fit: imageFit,
                alignment: Alignment.center,
                width: double.infinity,
                height: double.infinity,
                gaplessPlayback: true,
                errorBuilder: errorBuilder ??
                    (context, error, stackTrace) => fallback(error, stackTrace),
              );
            }
            return fallback(error, stackTrace);
          },
        ),
      );
    }

    final child = useContain
        ? Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(color: bg),
              ClipRect(
                child: ImageFiltered(
                  imageFilter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Transform.scale(
                    scale: 1.28,
                    child: Opacity(
                      opacity: 0.88,
                      child: network(optimized, imageFit: BoxFit.cover),
                    ),
                  ),
                ),
              ),
              network(optimized, imageFit: BoxFit.contain),
            ],
          )
        : Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(color: bg),
              network(optimized, imageFit: fit),
            ],
          );

    final framed = SizedBox(width: width, height: height, child: child);
    if (borderRadius == null) return framed;
    return ClipRRect(borderRadius: borderRadius!, child: framed);
  }
}
