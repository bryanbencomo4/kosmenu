import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/ai_service.dart';
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
  final AiService _aiService = const AiService();

  XFile? _capturedImage;
  bool _isCapturing = false;
  bool _isAnalyzing = false;
  bool _isSaving = false;
  Map<String, dynamic>? _aiPreview;
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
        _aiPreview = null;
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

  Future<void> _uploadAndAnalyzeMenu() async {
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
      _isAnalyzing = true;
      _aiPreview = null;
    });

    try {
      final uploadResult = await _storageService.uploadMenuScan(
        imageFile: File(_capturedImage!.path),
        comercioId: SupabaseConfig.currentComercioId,
      );

      final preview = await _aiService.analyzeMenuFromImageUrl(
        uploadResult.publicUrl,
      );

      if (!mounted) return;
      setState(() {
        _uploadedImageUrl = uploadResult.publicUrl;
        _aiPreview = preview;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error subiendo o analizando menu: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isAnalyzing = false);
      }
    }
  }

  Future<void> _confirmAndSaveMenu() async {
    final preview = _aiPreview;
    if (preview == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Primero analiza una imagen para generar la estructura.',
          ),
        ),
      );
      return;
    }

    if (!SupabaseConfig.hasCurrentComercioId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Configura SupabaseConfig.currentComercioId para guardar el menu.',
          ),
        ),
      );
      return;
    }

    final categories = (preview['categorias'] as List<dynamic>? ?? <dynamic>[])
        .cast<Map<String, dynamic>>();

    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No hay categorias para guardar.')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final client = Supabase.instance.client;
      final comercioId = SupabaseConfig.currentComercioId;

      for (
        var categoryIndex = 0;
        categoryIndex < categories.length;
        categoryIndex++
      ) {
        final category = categories[categoryIndex];
        final products =
            (category['productos'] as List<dynamic>? ?? <dynamic>[])
                .cast<Map<String, dynamic>>();

        final categoryInsert = await client
            .from('categorias')
            .insert({
              'comercio_id': comercioId,
              'nombre': (category['nombre'] ?? 'Categoria').toString(),
              'orden': categoryIndex,
              'creado_por_ia': true,
              'confianza_ia': 0.90,
            })
            .select('id')
            .single();

        final categoriaId = categoryInsert['id']?.toString();
        if (categoriaId == null || categoriaId.isEmpty) {
          throw StateError('No se obtuvo id de categoria insertada.');
        }

        if (products.isNotEmpty) {
          final productRows = products
              .map(
                (product) => <String, dynamic>{
                  'comercio_id': comercioId,
                  'categoria_id': categoriaId,
                  'nombre': (product['nombre'] ?? 'Producto').toString(),
                  'descripcion': (product['descripcion'] ?? '').toString(),
                  'precio': _toDouble(product['precio']),
                  'creado_por_ia': true,
                  'confianza_ia': 0.90,
                },
              )
              .toList();

          await client.from('productos').insert(productRows);
        }
      }

      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      messenger.showSnackBar(
        const SnackBar(
          content: Text('¡Menú digitalizado con éxito! 🚀'),
          backgroundColor: Colors.green,
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 900));
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el menu: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();

    final normalized = '$value'.trim();
    if (normalized.isEmpty) return 0.0;

    return double.tryParse(normalized.replaceAll(',', '.')) ?? 0.0;
  }

  Widget _buildAiPreview() {
    final preview = _aiPreview;
    if (preview == null) return const SizedBox.shrink();

    final categories = (preview['categorias'] as List<dynamic>? ?? <dynamic>[])
        .cast<Map<String, dynamic>>();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),
        Text(
          'Vista previa de la IA',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        if (_uploadedImageUrl != null)
          Text(
            'Imagen subida correctamente a Supabase.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        const SizedBox(height: 12),
        ...categories.map((category) {
          final products =
              (category['productos'] as List<dynamic>? ?? <dynamic>[])
                  .cast<Map<String, dynamic>>();

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${category['nombre'] ?? 'Categoria'} (${products.length})',
                    style: GoogleFonts.poppins(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...products.map(
                    (product) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '- ${product['nombre']}  |  \$${product['precio']}',
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _isSaving ? null : _confirmAndSaveMenu,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF6B00),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: Text(
              _isSaving
                  ? 'Guardando en menu...'
                  : 'Confirmar y Guardar en Menu',
            ),
          ),
        ),
      ],
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
            onPressed: (_isCapturing || _isAnalyzing)
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
              onPressed: (_isCapturing || _isAnalyzing)
                  ? null
                  : _captureMenuPhoto,
              icon: const Icon(Icons.refresh),
              label: const Text('Volver a capturar'),
            ),
          const SizedBox(height: 12),
          if (_capturedImage != null)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _isAnalyzing ? null : _uploadAndAnalyzeMenu,
                icon: const Icon(Icons.cloud_upload),
                label: Text(
                  _isAnalyzing
                      ? 'Subiendo y analizando...'
                      : 'Subir foto y analizar con IA',
                ),
              ),
            ),
          if (_isAnalyzing)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.2),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Procesando menu: subiendo imagen y preparando categorias/productos...',
                    ),
                  ),
                ],
              ),
            ),
          _buildAiPreview(),
        ],
      ),
    );
  }
}
