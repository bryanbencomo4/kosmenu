import 'package:flutter/material.dart';

class BrandedLoadingScreen extends StatelessWidget {
  const BrandedLoadingScreen({
    super.key,
    this.withScaffold = false,
    this.backgroundColor = const Color(0xFF5B21B6),
  });

  final bool withScaffold;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    final content = ColoredBox(
      color: backgroundColor,
      child: const SafeArea(child: _BrandedLoadingContent()),
    );

    if (withScaffold) {
      return Scaffold(backgroundColor: backgroundColor, body: content);
    }

    return content;
  }
}

class _BrandedLoadingContent extends StatelessWidget {
  const _BrandedLoadingContent();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isotipoWidth = (constraints.maxWidth * 0.34)
            .clamp(108.0, 156.0)
            .toDouble();

        return Center(
          child: SingleChildScrollView(
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0.94, end: 1),
              duration: const Duration(milliseconds: 760),
              curve: Curves.easeOutBack,
              builder: (context, value, child) {
                final introOpacity = value.clamp(0.0, 1.0).toDouble();
                return Opacity(
                  opacity: introOpacity,
                  child: Transform.scale(scale: value, child: child),
                );
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Image.asset(
                    'assets/branding/isotipo.png',
                    width: isotipoWidth,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.high,
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'elmenuxfa.com',
                    style: TextStyle(
                      color: Color(0xFFF4ECFF),
                      fontSize: 36,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.8,
                      shadows: [
                        Shadow(
                          color: Color(0x40000000),
                          blurRadius: 12,
                          offset: Offset(0, 5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
