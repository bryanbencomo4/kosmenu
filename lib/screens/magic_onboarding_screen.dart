import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/services/storage_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MagicOnboardingResult {
  final CatalogModel catalog;
  final int createdCategories;
  final int createdProducts;
  final List<String> detectedCategoryNames;
  final bool isNewCatalog;

  const MagicOnboardingResult({
    required this.catalog,
    required this.createdCategories,
    required this.createdProducts,
    required this.detectedCategoryNames,
    required this.isNewCatalog,
  });
}

class MagicOnboardingScreen extends StatefulWidget {
  const MagicOnboardingScreen({super.key});

  @override
  State<MagicOnboardingScreen> createState() => _MagicOnboardingScreenState();
}

class _MagicOnboardingScreenState extends State<MagicOnboardingScreen> {
  final ImagePicker _picker = ImagePicker();
  final StorageService _storageService = const StorageService();
  final TextEditingController _catalogNameController = TextEditingController(
    text: 'Menú Principal',
  );
  final List<String> _processingHints = const <String>[
    'Identificando categorías principales...',
    'Extrayendo precios y descripciones...',
    'Organizando tu menú en una estructura limpia...',
  ];

  XFile? _capturedImage;
  bool _isCapturing = false;
  bool _isProcessing = false;
  int _currentStep = 0;
  String _progressMessage = 'Define el nombre del catálogo para empezar.';
  String? _uploadedImageUrl;
  int _createdCategories = 0;
  int _createdProducts = 0;
  List<String> _detectedCategoryNames = <String>[];
  String? _suggestedCatalogName;
  bool _catalogNameTouched = false;
  Timer? _processingHintTimer;
  int _processingHintIndex = 0;

  double get _progressValue {
    switch (_currentStep) {
      case 0:
        return 0.12;
      case 1:
        return 0.46;
      case 2:
        return 1;
      default:
        return 0;
    }
  }

  @override
  void initState() {
    super.initState();
    _loadCatalogSuggestion();
  }

  @override
  void dispose() {
    _processingHintTimer?.cancel();
    _catalogNameController.dispose();
    super.dispose();
  }

  Future<void> _loadCatalogSuggestion() async {
    if (!SupabaseConfig.hasCurrentComercioId) return;

    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('nombre')
          .eq('id', SupabaseConfig.currentComercioId)
          .limit(1)
          .maybeSingle();

      final suggestedName = row == null
          ? 'Menú Principal'
          : (row['nombre']?.toString().trim().isNotEmpty == true
                ? row['nombre']!.toString().trim()
                : 'Menú Principal');

      if (!mounted) return;
      setState(() {
        _suggestedCatalogName = suggestedName;
        if (!_catalogNameTouched && _catalogNameController.text.trim() == 'Menú Principal') {
          _catalogNameController.text = suggestedName;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _suggestedCatalogName = 'Menú Principal');
    }
  }

  bool _validateCatalogName({bool showFeedback = true}) {
    final name = _catalogNameController.text.trim();
    if (name.isNotEmpty) return true;

    if (showFeedback) {
      _showErrorDialog(
        title: 'Nombre requerido',
        message: 'Antes de continuar, indica cómo quieres nombrar este catálogo.',
      );
    }
    return false;
  }

  void _startProcessingHints() {
    _processingHintTimer?.cancel();
    _processingHintIndex = 0;
    _progressMessage = _processingHints[_processingHintIndex];
    _processingHintTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!mounted || !_isProcessing) return;
      setState(() {
        _processingHintIndex = (_processingHintIndex + 1) % _processingHints.length;
        _progressMessage = _processingHints[_processingHintIndex];
      });
    });
  }

  void _stopProcessingHints() {
    _processingHintTimer?.cancel();
    _processingHintTimer = null;
  }

  Future<void> _showErrorDialog({
    required String title,
    required String message,
  }) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Text(
          title,
          style: GoogleFonts.manrope(
            color: const Color(0xFFFFE2BF),
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(
          message,
          style: GoogleFonts.poppins(
            color: const Color(0xFFE3CCAE),
            height: 1.4,
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF6B00),
              foregroundColor: Colors.white,
            ),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  Future<void> _captureMenuPhoto() async {
    if (!_validateCatalogName()) return;

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
        _currentStep = 1;
      });
    } catch (error) {
      await _showErrorDialog(
        title: 'No se pudo abrir la cámara',
        message: 'Hubo un problema al iniciar el escaneo. Detalle: $error',
      );
    } finally {
      if (mounted) {
        setState(() => _isCapturing = false);
      }
    }
  }

  Future<void> _uploadAndProcessMenu() async {
    if (!_validateCatalogName()) return;

    if (_capturedImage == null) {
      await _showErrorDialog(
        title: 'Falta la imagen',
        message: 'Primero captura una foto clara del menú para poder procesarlo.',
      );
      return;
    }

    final catalogName = _catalogNameController.text.trim().isEmpty
        ? 'Menú Principal'
        : _catalogNameController.text.trim();

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
      _currentStep = 2;
      _progressMessage = 'Preparando el envío seguro de la imagen...';
      _createdCategories = 0;
      _createdProducts = 0;
      _detectedCategoryNames = <String>[];
    });

    try {
      final supabase = Supabase.instance.client;
      final currentComercioId = SupabaseConfig.currentComercioId;

      final uploadResult = await _storageService.uploadMenuScan(
        imageFile: File(_capturedImage!.path),
        comercioId: currentComercioId,
      );
      final fileName = uploadResult.path;
      final publicUrl = supabase.storage.from('menu-scans').getPublicUrl(fileName);

      if (!mounted) return;
      setState(() {
        _uploadedImageUrl = publicUrl;
        _currentStep = 2;
      });
      _startProcessingHints();

      final response = await supabase.functions.invoke(
        'process-menu-gemini',
        body: {
          'image_url': publicUrl,
          'comercio_id': currentComercioId,
          'catalog_name': catalogName,
        },
      );

      final responseData = _responseMap(response.data);
      final catalogId = responseData['catalog_id']?.toString().trim();
      final savedCatalogName = responseData['catalog_name']?.toString().trim();
      final createdCategories = _asInt(responseData['created_categories']);
      final createdProducts = _asInt(responseData['created_products']);
      final isNewCatalog = responseData['catalog_created'] == true;
      final detectedCategoryNames = _extractCategoryNames(responseData['parsed_menu']);

      if (response.status < 200 || response.status >= 300) {
        throw StateError(
          'Error en process-menu-gemini (status ${response.status}): '
          '${responseData['error'] ?? 'sin detalle'}.',
        );
      }

      if (!mounted) return;
      setState(() {
        _progressMessage = 'Sincronizando catálogo, categorías y productos...';
        _createdCategories = createdCategories;
        _createdProducts = createdProducts;
        _detectedCategoryNames = detectedCategoryNames;
      });
      _stopProcessingHints();

      await Future.wait<void>([
        _waitForMenuReady(currentComercioId, catalogId: catalogId),
        Future<void>.delayed(const Duration(milliseconds: 900)),
      ]);

      if (!mounted) return;
      await _clearLocalProductsCache();

      final result = MagicOnboardingResult(
        catalog: CatalogModel(
          id: catalogId ?? '',
          comercioId: currentComercioId,
          nombre: savedCatalogName == null || savedCatalogName.isEmpty
              ? catalogName
              : savedCatalogName,
          orden: _asInt(responseData['catalog_order']),
          activo: responseData['catalog_active'] is bool
              ? responseData['catalog_active'] as bool
              : true,
        ),
        createdCategories: createdCategories,
        createdProducts: createdProducts,
        detectedCategoryNames: detectedCategoryNames,
        isNewCatalog: isNewCatalog,
      );

      if (!mounted) return;
      Navigator.of(context).pop(result);
    } catch (error) {
      _stopProcessingHints();
      await _showErrorDialog(
        title: 'No pudimos procesar el menú',
        message:
            'La IA no pudo completar la digitalización en este intento. Revisa la foto e inténtalo nuevamente.\n\nDetalle: $error',
      );
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _progressMessage = _capturedImage == null
              ? 'Define el nombre del catálogo para empezar.'
              : 'Tu imagen está lista para enviarse a Gemini.';
        });
      }
    }
  }

  Future<void> _clearLocalProductsCache() async {
    // Hook listo para limpiar cache local si en el futuro agregas persistencia offline.
  }

  Map<String, dynamic> _responseMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return <String, dynamic>{};
  }

  int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('${value ?? ''}') ?? 0;
  }

  List<String> _extractCategoryNames(dynamic parsedMenu) {
    final parsedMap = _responseMap(parsedMenu);
    final categories = parsedMap['categorias'];
    if (categories is! List) {
      return <String>[];
    }

    return categories
        .map((item) => item is Map ? item['nombre']?.toString().trim() ?? '' : '')
        .where((name) => name.isNotEmpty)
        .cast<String>()
        .toList();
  }

  Future<void> _waitForMenuReady(
    String comercioId, {
    String? catalogId,
  }) async {
    final supabase = Supabase.instance.client;
    final normalizedCatalogId = catalogId?.trim() ?? '';

    for (var i = 0; i < 6; i++) {
      final List<dynamic> productRows = await supabase
          .from('productos')
          .select('id')
          .eq('comercio_id', comercioId)
          .limit(1);

      final catalogReady = normalizedCatalogId.isEmpty
          ? true
          : await _catalogExists(
              supabase,
              comercioId: comercioId,
              catalogId: normalizedCatalogId,
            );
      final categoryReady = normalizedCatalogId.isEmpty
          ? true
          : await _categoryExists(
              supabase,
              comercioId: comercioId,
              catalogId: normalizedCatalogId,
            );

      if (catalogReady && categoryReady && productRows.isNotEmpty) {
        return;
      }

      await Future<void>.delayed(const Duration(milliseconds: 700));
    }
  }

  Future<bool> _catalogExists(
    SupabaseClient supabase, {
    required String comercioId,
    required String catalogId,
  }) async {
    final List<dynamic> rows = await supabase
        .from('catalogos')
        .select('id')
        .eq('comercio_id', comercioId)
        .eq('id', catalogId)
        .limit(1);

    return rows.isNotEmpty;
  }

  Future<bool> _categoryExists(
    SupabaseClient supabase, {
    required String comercioId,
    required String catalogId,
  }) async {
    final List<dynamic> rows = await supabase
        .from('categorias')
        .select('id')
        .eq('comercio_id', comercioId)
        .eq('catalogo_id', catalogId)
        .limit(1);

    return rows.isNotEmpty;
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFF2A1D14), Color(0xFF15110D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x33FFB04A)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 20,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [Color(0xFFFFB04A), Color(0xFFFF6B00)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x44FF8A1D),
                  blurRadius: 18,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(height: 18),
          Text(
            'Magic Menu Studio',
            style: GoogleFonts.manrope(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Transforma tu carta física en un menú digital inteligente con una experiencia guiada, rápida y lista para vender.',
            style: GoogleFonts.poppins(
              color: const Color(0xFFE4CCAC),
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCatalogField() {
    final suggestedName = _suggestedCatalogName ?? 'Menú Principal';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF18120E),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0x22FFFFFF)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Paso 0 · Identidad del catálogo',
            style: GoogleFonts.manrope(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '¿Qué nombre le pondremos a este catálogo? Este valor se enviará a Gemini y se usará para crear o reutilizar el catálogo correcto.',
            style: GoogleFonts.poppins(
              color: const Color(0xFFBCA589),
              fontSize: 12.5,
            ),
          ),
          const SizedBox(height: 14),
          DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                colors: [Color(0xFF241912), Color(0xFF120E0A)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border.all(color: const Color(0x44FFB04A)),
            ),
            child: TextField(
              controller: _catalogNameController,
              enabled: !_isProcessing,
              onChanged: (_) {
                if (!_catalogNameTouched) {
                  setState(() => _catalogNameTouched = true);
                } else {
                  setState(() {});
                }
              },
              textCapitalization: TextCapitalization.words,
              style: GoogleFonts.poppins(color: Colors.white),
              decoration: const InputDecoration(
                hintText: 'Menú Principal',
                hintStyle: TextStyle(color: Color(0x80E4CCAC)),
                prefixIcon: Icon(Icons.menu_book_rounded, color: Color(0xFFFFB04A)),
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 18, vertical: 18),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _SuggestionChip(
                label: 'Sugerencia: $suggestedName',
                onTap: _isProcessing
                    ? null
                    : () {
                        setState(() {
                          _catalogNameController.text = suggestedName;
                          _catalogNameTouched = true;
                        });
                      },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPreviewPanel() {
    final effectiveCatalogName = _catalogNameController.text.trim().isEmpty
        ? 'Menú Principal'
        : _catalogNameController.text.trim();

    return Container(
      height: 320,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFF16110D), Color(0xFF0E0C0A)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border.all(color: const Color(0x22FFFFFF)),
      ),
      clipBehavior: Clip.antiAlias,
      child: _capturedImage == null
          ? Stack(
              fit: StackFit.expand,
              children: [
                const _BackdropContours(),
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 84,
                        height: 84,
                        decoration: BoxDecoration(
                          color: const Color(0x14FFB04A),
                          borderRadius: BorderRadius.circular(26),
                          border: Border.all(color: const Color(0x33FFB04A)),
                        ),
                        child: const Icon(
                          Icons.document_scanner_rounded,
                          size: 38,
                          color: Color(0xFFFFB04A),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'Escanea una carta clara y completa',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.manrope(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'La IA detectará categorías, nombres, descripciones y precios para cargarlos en tu catálogo.',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFC8B199),
                          fontSize: 13.5,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            )
          : Stack(
              fit: StackFit.expand,
              children: [
                Image.file(
                  File(_capturedImage!.path),
                  fit: BoxFit.cover,
                  width: double.infinity,
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.black.withValues(alpha: 0.04),
                        Colors.black.withValues(alpha: 0.62),
                      ],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xCC140F0B),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0x22FFFFFF)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle_rounded, color: Color(0xFF5AD8A6)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Imagen lista para analizar y guardarse dentro de "$effectiveCatalogName".',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 12.8,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildActions() {
    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFFF6B00),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(58),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            onPressed: (_isCapturing || _isProcessing) ? null : _captureMenuPhoto,
            icon: Icon(
              _isCapturing
                  ? Icons.hourglass_top_rounded
                  : (_capturedImage == null
                        ? Icons.camera_alt_rounded
                        : Icons.refresh_rounded),
            ),
            label: Text(_capturedImage == null ? 'Continuar al escaneo' : 'Volver a escanear'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF25170F),
              foregroundColor: const Color(0xFFFFD7AB),
              minimumSize: const Size.fromHeight(58),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: const BorderSide(color: Color(0x44FFB04A)),
              ),
              textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            onPressed: (_capturedImage == null || _isProcessing) ? null : _uploadAndProcessMenu,
            icon: const Icon(Icons.auto_awesome_rounded),
            label: const Text('Crear catálogo inteligente'),
          ),
        ),
      ],
    );
  }

  Widget _buildDetectionCards() {
    final previewNames = _detectedCategoryNames.take(3).toList();

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        _InsightCard(
          icon: Icons.layers_rounded,
          accent: const Color(0xFFFFB04A),
          title: 'Categorías detectadas',
          value: '$_createdCategories',
          subtitle: previewNames.isEmpty
              ? 'La IA está estructurando secciones del menú.'
              : previewNames.join(' · '),
        ),
        _InsightCard(
          icon: Icons.restaurant_menu_rounded,
          accent: const Color(0xFF5AD8A6),
          title: 'Productos preparados',
          value: '$_createdProducts',
          subtitle: 'Listos para guardarse en el catálogo.',
        ),
      ],
    );
  }

  Widget _buildProgressPanel() {
    if (!_isProcessing) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 18),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          colors: [Color(0xFF231710), Color(0xFF15100C)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x33FFB04A)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 24,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const _SignalOrb(),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Motor IA en ejecución',
                      style: GoogleFonts.manrope(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _progressMessage,
                      style: GoogleFonts.poppins(
                        color: const Color(0xFFE4CCAC),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _PremiumProgressBar(value: _progressValue),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StepLabel(
                  index: 1,
                  title: 'Subida',
                  active: _currentStep >= 1,
                  alignment: TextAlign.left,
                ),
              ),
              Expanded(
                child: _StepLabel(
                  index: 2,
                  title: 'Lectura IA',
                  active: _currentStep >= 2,
                  alignment: TextAlign.center,
                ),
              ),
              Expanded(
                child: _StepLabel(
                  index: 3,
                  title: 'Sincronización',
                  active: _currentStep >= 3,
                  alignment: TextAlign.right,
                ),
              ),
            ],
          ),
          if (_uploadedImageUrl != null && _currentStep >= 2) ...[
            const SizedBox(height: 16),
            Text(
              'La imagen ya está en Storage y el modelo está estructurando categorías y productos.',
              style: GoogleFonts.poppins(
                color: const Color(0xFFBAA489),
                fontSize: 12.5,
              ),
            ),
          ],
          if (_createdCategories > 0 || _createdProducts > 0 || _detectedCategoryNames.isNotEmpty) ...[
            const SizedBox(height: 18),
            _buildDetectionCards(),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C0A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leadingWidth: 84,
        leading: TextButton(
          onPressed: _isProcessing ? null : () => Navigator.of(context).maybePop(),
          child: Text(
            'Atrás',
            style: GoogleFonts.poppins(
              color: _isProcessing ? Colors.white38 : const Color(0xFFD7C3AB),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: _isProcessing ? null : () => Navigator.of(context).maybePop(),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(
                color: _isProcessing ? Colors.white38 : const Color(0xFF9F8D7B),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          _StepRail(
            currentStep: _currentStep,
            hasImage: _capturedImage != null,
            isProcessing: _isProcessing,
          ),
          const SizedBox(height: 18),
          _buildHeader(),
          const SizedBox(height: 24),
          _buildCatalogField(),
          const SizedBox(height: 20),
          _buildPreviewPanel(),
          const SizedBox(height: 16),
          _buildActions(),
          _buildProgressPanel(),
        ],
      ),
    );
  }
}

class _SignalOrb extends StatefulWidget {
  const _SignalOrb();

  @override
  State<_SignalOrb> createState() => _SignalOrbState();
}

class _SignalOrbState extends State<_SignalOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final glow = 0.72 + (_controller.value * 0.28);
        return Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFFFFB04A), Color(0xFFFF6B00)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0x66FF8A1D).withValues(alpha: glow),
                blurRadius: 18,
                spreadRadius: 1,
              ),
            ],
          ),
          child: const Icon(Icons.auto_graph_rounded, color: Colors.white),
        );
      },
    );
  }
}

class _PremiumProgressBar extends StatelessWidget {
  const _PremiumProgressBar({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    final safeValue = value.clamp(0, 1).toDouble();

    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 14,
        color: const Color(0xFF2A1C12),
        child: Stack(
          children: [
            AnimatedFractionallySizedBox(
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOutCubic,
              widthFactor: safeValue,
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Color(0xFFFFD49A),
                      Color(0xFFFFB04A),
                      Color(0xFFFF6B00),
                    ],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                ),
              ),
            ),
            const Positioned.fill(child: _ProgressShine()),
          ],
        ),
      ),
    );
  }
}

class _ProgressShine extends StatefulWidget {
  const _ProgressShine();

  @override
  State<_ProgressShine> createState() => _ProgressShineState();
}

class _ProgressShineState extends State<_ProgressShine>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final alignment = Alignment(-1 + (_controller.value * 2), 0);
        return Align(
          alignment: alignment,
          child: Transform.rotate(
            angle: -math.pi / 6,
            child: Container(
              width: 48,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.white.withValues(alpha: 0),
                    Colors.white.withValues(alpha: 0.22),
                    Colors.white.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _StepLabel extends StatelessWidget {
  const _StepLabel({
    required this.index,
    required this.title,
    required this.active,
    required this.alignment,
  });

  final int index;
  final String title;
  final bool active;
  final TextAlign alignment;

  @override
  Widget build(BuildContext context) {
    return Text(
      '$index. $title',
      textAlign: alignment,
      style: GoogleFonts.poppins(
        color: active ? const Color(0xFFFFD49A) : const Color(0xFF8D7B6A),
        fontSize: 11.5,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _StepRail extends StatelessWidget {
  const _StepRail({
    required this.currentStep,
    required this.hasImage,
    required this.isProcessing,
  });

  final int currentStep;
  final bool hasImage;
  final bool isProcessing;

  @override
  Widget build(BuildContext context) {
    final steps = <({String title, bool active, IconData icon})>[
      (title: 'Configuración', active: true, icon: Icons.menu_book_rounded),
      (title: 'Escaneo', active: hasImage || currentStep >= 1, icon: Icons.document_scanner_rounded),
      (title: 'Procesamiento', active: isProcessing || currentStep >= 2, icon: Icons.auto_awesome_rounded),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF17120E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0x22FFFFFF)),
      ),
      child: Row(
        children: steps.asMap().entries.map((entry) {
          final index = entry.key;
          final step = entry.value;
          final activeColor = step.active ? const Color(0xFFFFB04A) : const Color(0xFF6A5A4C);
          return Expanded(
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: activeColor.withValues(alpha: step.active ? 0.18 : 0.1),
                    shape: BoxShape.circle,
                    border: Border.all(color: activeColor.withValues(alpha: 0.5)),
                  ),
                  child: Icon(step.icon, color: activeColor, size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    step.title,
                    style: GoogleFonts.poppins(
                      color: step.active ? Colors.white : const Color(0xFF9A8878),
                      fontWeight: FontWeight.w600,
                      fontSize: 12.5,
                    ),
                  ),
                ),
                if (index < steps.length - 1)
                  Container(
                    width: 24,
                    height: 1,
                    margin: const EdgeInsets.symmetric(horizontal: 8),
                    color: const Color(0x33FFFFFF),
                  ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  const _SuggestionChip({
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Ink(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0x1AFFB04A),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x33FFB04A)),
        ),
        child: Text(
          label,
          style: GoogleFonts.poppins(
            color: const Color(0xFFFFD49A),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({
    required this.icon,
    required this.accent,
    required this.title,
    required this.value,
    required this.subtitle,
  });

  final IconData icon;
  final Color accent;
  final String title;
  final String value;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 154,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF17120E),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: accent.withValues(alpha: 0.28)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: accent, size: 20),
            const SizedBox(height: 12),
            Text(
              value,
              style: GoogleFonts.manrope(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: GoogleFonts.poppins(
                color: const Color(0xFFFFE5C8),
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.poppins(
                color: const Color(0xFFB7A18B),
                fontSize: 11.5,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BackdropContours extends StatelessWidget {
  const _BackdropContours();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _BackdropContoursPainter());
  }
}

class _BackdropContoursPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = const Color(0x22FFB04A);

    final pathA = Path()
      ..moveTo(size.width * 0.08, size.height * 0.28)
      ..quadraticBezierTo(
        size.width * 0.38,
        size.height * 0.14,
        size.width * 0.84,
        size.height * 0.34,
      );

    final pathB = Path()
      ..moveTo(size.width * 0.12, size.height * 0.62)
      ..quadraticBezierTo(
        size.width * 0.48,
        size.height * 0.78,
        size.width * 0.88,
        size.height * 0.56,
      );

    canvas.drawPath(pathA, paint);
    canvas.drawPath(pathB, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
