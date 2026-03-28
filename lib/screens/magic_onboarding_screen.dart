import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

class MagicOnboardingScreen extends StatefulWidget {
  const MagicOnboardingScreen({super.key});

  @override
  State<MagicOnboardingScreen> createState() => _MagicOnboardingScreenState();
}

class _MagicOnboardingScreenState extends State<MagicOnboardingScreen> {
  final ImagePicker _picker = ImagePicker();
  XFile? _capturedImage;
  bool _isCapturing = false;

  Future<void> _captureMenuPhoto() async {
    setState(() => _isCapturing = true);
    try {
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 90,
      );

      if (!mounted) return;
      setState(() => _capturedImage = image);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo abrir la cámara: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isCapturing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Magic Onboarding')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Digitaliza tu menú físico con IA',
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Toma una foto clara del menú impreso y usaremos esta pantalla como punto de entrada al flujo inteligente de carga.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          Container(
            height: 320,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
            clipBehavior: Clip.antiAlias,
            child: _capturedImage == null
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Aún no has capturado una foto del menú.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : Image.file(
                    File(_capturedImage!.path),
                    fit: BoxFit.cover,
                    width: double.infinity,
                  ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF6B00),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            onPressed: _isCapturing ? null : _captureMenuPhoto,
            icon: const Icon(Icons.camera_alt),
            label: Text(
              _isCapturing ? 'Abriendo cámara...' : 'Tomar foto del menú',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),
          if (_capturedImage != null)
            OutlinedButton.icon(
              onPressed: _isCapturing ? null : _captureMenuPhoto,
              icon: const Icon(Icons.refresh),
              label: const Text('Volver a capturar'),
            ),
        ],
      ),
    );
  }
}
