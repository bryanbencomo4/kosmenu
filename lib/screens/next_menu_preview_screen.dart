import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kosmenu_app/widgets/next_menu_preview_frame.dart';
import 'package:url_launcher/url_launcher.dart';

/// Fullscreen host for the Next.js owner menu preview (`/preview/[id]`).
class NextMenuPreviewScreen extends StatelessWidget {
  const NextMenuPreviewScreen({super.key, required this.previewUrl});

  final Uri previewUrl;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          tooltip: 'Cerrar vista previa',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.close_rounded),
        ),
        title: const Text(
          'Vista previa del menu',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        actions: [
          if (!kIsWeb)
            IconButton(
              tooltip: 'Abrir en el navegador',
              onPressed: () {
                launchUrl(previewUrl, mode: LaunchMode.externalApplication);
              },
              icon: const Icon(Icons.open_in_browser_rounded),
            ),
        ],
      ),
      body: NextMenuPreviewFrame(previewUrl: previewUrl),
    );
  }
}
