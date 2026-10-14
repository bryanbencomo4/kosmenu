import 'package:flutter/material.dart';

/// Static brand hold while Flutter resolves the next screen.
/// No animation — matches the HTML boot shell so there is no white flash.
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
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isotipoWidth = (constraints.maxWidth * 0.36)
                .clamp(108.0, 160.0)
                .toDouble();
            return Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset(
                      'assets/branding/isotipo.png',
                      width: isotipoWidth,
                      fit: BoxFit.contain,
                      filterQuality: FilterQuality.medium,
                      gaplessPlayback: true,
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'elmenuxfa.com',
                      style: TextStyle(
                        color: const Color(0xFFF4ECFF),
                        fontSize: constraints.maxWidth < 380 ? 34 : 38,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.8,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );

    if (withScaffold) {
      return Scaffold(backgroundColor: backgroundColor, body: content);
    }

    return content;
  }
}
