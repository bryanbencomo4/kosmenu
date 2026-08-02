import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Non-web fallback: opens the Next.js preview in an external browser.
class NextMenuPreviewFrame extends StatelessWidget {
  const NextMenuPreviewFrame({super.key, required this.previewUrl});

  final Uri previewUrl;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'La vista previa usa el menu publico real en el navegador.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () {
                launchUrl(previewUrl, mode: LaunchMode.externalApplication);
              },
              icon: const Icon(Icons.open_in_browser_rounded),
              label: const Text('Abrir vista previa'),
            ),
          ],
        ),
      ),
    );
  }
}
