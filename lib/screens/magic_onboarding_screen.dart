import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/screens/admin_dashboard_screen.dart';
import 'package:kosmenu_app/services/storage_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MagicOnboardingScreen extends StatefulWidget {
  const MagicOnboardingScreen({super.key});

  @override
  State<MagicOnboardingScreen> createState() => _MagicOnboardingScreenState();
}

class _MagicOnboardingScreenState extends State<MagicOnboardingScreen> {
  final ImagePicker _picker = ImagePicker();
  final StorageService _storageService = const StorageService();

  XFile? _capturedImage;
  bool _isCapturing = false;
  bool _isProcessing = false;
  int _currentStep = 0;
  String _progressMessage = '';
  String? _uploadedImageUrl;

  Future<void> _captureMenuPhoto() async {
    setState(() => _isCapturing = true);
    try {
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 90,
      );

      if (!mounted) return;
      setState(() {
        _capturedImage = image;
        _uploadedImageUrl = null;
      });
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

  Future<void> _uploadAndProcessMenu() async {
    if (_capturedImage == null) return;

    if (!SupabaseConfig.hasCurrentComercioId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Configura SupabaseConfig.currentComercioId para usar Magic Onboarding.',
          ),
        ),
      );
      return;
    }

    setState(() {
      _isProcessing = true;
      _currentStep = 1;
      _progressMessage = 'Paso 1/3: Subiendo imagen...';
    });

    try {
      final supabase = Supabase.instance.client;
      final currentComercioId = SupabaseConfig.currentComercioId;

      final uploadResult = await _storageService.uploadMenuScan(
        imageFile: File(_capturedImage!.path),
        comercioId: currentComercioId,
      );
      final fileName = uploadResult.path;
      final publicUrl = supabase.storage
          .from('menu-scans')
          .getPublicUrl(fileName);

      if (!mounted) return;
      setState(() {
        _uploadedImageUrl = publicUrl;
        _currentStep = 2;
        _progressMessage = 'Gemini está analizando tu menú... 🧠🍔';
      });

      final response = await supabase.functions.invoke(
        'process-menu-gemini',
        body: {'image_url': publicUrl, 'comercio_id': currentComercioId},
      );
      print('Respuesta de Gemini: ${response.data}');

      if (response.status < 200 || response.status >= 300) {
        throw StateError(
          'Error en process-menu-gemini (status ${response.status}).',
        );
      }

      if (!mounted) return;
      setState(() {
        _currentStep = 3;
        _progressMessage = 'Paso 3/3: Validando que tu menú esté listo...';
      });
      await Future.wait<void>([
        _waitForMenuReady(currentComercioId),
        Future<void>.delayed(const Duration(seconds: 2)),
      ]);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('¡Menú digitalizado con éxito! 🚀'),
          backgroundColor: Colors.green,
        ),
      );

      await _clearLocalProductsCache();

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const AdminDashboardScreen()),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error en digitalización: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _currentStep = 0;
          _progressMessage = '';
        });
      }
    }
  }

  Future<void> _clearLocalProductsCache() async {
    // Hook listo para limpiar cache local si en el futuro agregas persistencia offline.
  }

  Future<void> _waitForMenuReady(String comercioId) async {
    final supabase = Supabase.instance.client;

    // Retries handle eventual consistency after Edge Function insertions.
    for (var i = 0; i < 5; i++) {
      final rows = await supabase
          .from('productos')
          .select('id')
          .eq('comercio_id', comercioId)
          .limit(1);

      if (rows is List && rows.isNotEmpty) {
        return;
      }

      await Future<void>.delayed(const Duration(milliseconds: 700));
    }
  }

  Widget _buildProgressPanel() {
    if (!_isProcessing) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _progressMessage,
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
                if (_uploadedImageUrl != null && _currentStep >= 2)
                  Text(
                    'Imagen lista en Storage. Procesando menú...',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
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
            onPressed: (_isCapturing || _isProcessing)
                ? null
                : _captureMenuPhoto,
            icon: const Icon(Icons.camera_alt),
            label: Text(
              _isCapturing ? 'Abriendo cámara...' : 'Tomar foto del menú',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),
          if (_capturedImage != null)
            OutlinedButton.icon(
              onPressed: (_isCapturing || _isProcessing)
                  ? null
                  : _captureMenuPhoto,
              icon: const Icon(Icons.refresh),
              label: const Text('Volver a capturar'),
            ),
          const SizedBox(height: 12),
          if (_capturedImage != null)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isProcessing ? null : _uploadAndProcessMenu,
                icon: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.auto_awesome),
                label: Text(
                  _isProcessing ? 'Analizando...' : 'Escanear menú con IA',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orangeAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 32,
                    vertical: 16,
                  ),
                ),
              ),
            ),
          _buildProgressPanel(),
        ],
      ),
    );
  }
}
