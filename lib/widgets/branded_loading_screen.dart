import 'package:flutter/material.dart';

/// Quiet hold while a route resolves — purple + spinner, no brand splash.
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
      child: const Center(
        child: SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            strokeWidth: 2.6,
            color: Color(0xFFF4ECFF),
          ),
        ),
      ),
    );

    if (withScaffold) {
      return Scaffold(backgroundColor: backgroundColor, body: content);
    }

    return content;
  }
}
