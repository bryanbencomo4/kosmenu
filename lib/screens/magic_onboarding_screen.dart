import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/services/storage_service.dart';
import 'package:kosmenu_app/services/web_camera_handoff_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MagicOnboardingResult {
  final CatalogModel catalog;
  final int createdCategories;
  final int createdProducts;
  final List<String> detectedCategoryNames;
  final bool isNewCatalog;
  final bool requestAiProductImages;

  const MagicOnboardingResult({
    required this.catalog,
    required this.createdCategories,
    required this.createdProducts,
    required this.detectedCategoryNames,
    required this.isNewCatalog,
    required this.requestAiProductImages,
  });
}

class _AiFlowException implements Exception {
  const _AiFlowException(this.message);

  final String message;

  @override
  String toString() => message;
}

enum MagicOnboardingInputMode { camera, fileImport, textPrompt }

class MagicOnboardingScreen extends StatefulWidget {
  const MagicOnboardingScreen({
    super.key,
    this.inputMode = MagicOnboardingInputMode.camera,
  });

  final MagicOnboardingInputMode inputMode;

  @override
  State<MagicOnboardingScreen> createState() => _MagicOnboardingScreenState();
}

class _MagicOnboardingScreenState extends State<MagicOnboardingScreen>
    with SingleTickerProviderStateMixin {
  final ImagePicker _picker = ImagePicker();
  final StorageService _storageService = const StorageService();
  final WebCameraHandoffService _webCameraHandoffService =
      const WebCameraHandoffService();
  final TextEditingController _menuPromptController = TextEditingController();
  static const String _defaultCatalogName = 'Menu principal';
  static const int _maxPromptLength = 2800;

  late final AnimationController _entryController;
  bool _isLaunchingScan = false;
  String _scanProgressMessage = '';
  double _scanProgressValue = 0;
  int _selectedAssetCount = 0;
  bool _generateAiImages = true;

  bool get _isFileImportMode =>
      widget.inputMode == MagicOnboardingInputMode.fileImport;

  bool get _isTextPromptMode =>
      widget.inputMode == MagicOnboardingInputMode.textPrompt;

  String get _screenTitle {
    if (_isTextPromptMode) {
      return 'Crear menu desde texto';
    }
    return _isFileImportMode ? 'Importar archivo con IA' : 'Escaneo con IA';
  }

  String get _primaryActionLabel {
    if (_isTextPromptMode) {
      return 'Generar menu con IA';
    }
    return _isFileImportMode ? 'Seleccionar archivos' : 'Entendido';
  }

  String get _emptyProgressLabel {
    if (_isTextPromptMode) {
      return 'Preparando tu descripcion del menu...';
    }
    return _isFileImportMode
        ? 'Preparando importacion con IA...'
        : 'Preparando escaneo con IA...';
  }

  String get _selectedAssetLabel {
    if (_isTextPromptMode) {
      return 'Bloques';
    }
    return _isFileImportMode ? 'Archivos' : 'Paginas';
  }

  bool get _canSubmitPrompt => _menuPromptController.text.trim().length >= 12;

  @override
  void initState() {
    super.initState();
    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..forward();
  }

  @override
  void dispose() {
    _entryController.dispose();
    _menuPromptController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(
            Icons.arrow_back_rounded,
            color: AppColors.textStrong,
          ),
        ),
        title: Text(_screenTitle, style: textTheme.titleLarge),
      ),
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(
                child: SafeArea(
                  top: false,
                  bottom: false,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                    children: [
                      _AnimatedReveal(
                        animation: CurvedAnimation(
                          parent: _entryController,
                          curve: const Interval(
                            0,
                            0.55,
                            curve: Curves.easeOutCubic,
                          ),
                        ),
                        child: _HeaderCard(inputMode: widget.inputMode),
                      ),
                      const SizedBox(height: 16),
                      _AnimatedReveal(
                        animation: CurvedAnimation(
                          parent: _entryController,
                          curve: const Interval(
                            0.26,
                            0.84,
                            curve: Curves.easeOutCubic,
                          ),
                        ),
                        child: _AiImagesOptInCard(
                          value: _generateAiImages,
                          onChanged: (value) {
                            if (!mounted) {
                              return;
                            }
                            setState(() => _generateAiImages = value);
                          },
                        ),
                      ),
                      const SizedBox(height: 16),
                      _AnimatedReveal(
                        animation: CurvedAnimation(
                          parent: _entryController,
                          curve: const Interval(
                            0.15,
                            0.75,
                            curve: Curves.easeOutCubic,
                          ),
                        ),
                        child: _InfographicCard(
                          animation: _entryController,
                          inputMode: widget.inputMode,
                        ),
                      ),
                      if (_isTextPromptMode) ...[
                        const SizedBox(height: 16),
                        _AnimatedReveal(
                          animation: CurvedAnimation(
                            parent: _entryController,
                            curve: const Interval(
                              0.22,
                              0.88,
                              curve: Curves.easeOutCubic,
                            ),
                          ),
                          child: _PromptComposerCard(
                            controller: _menuPromptController,
                            maxLength: _maxPromptLength,
                            onChanged: () {
                              if (mounted) {
                                setState(() {});
                              }
                            },
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      _AnimatedReveal(
                        animation: CurvedAnimation(
                          parent: _entryController,
                          curve: const Interval(
                            0.3,
                            0.9,
                            curve: Curves.easeOutCubic,
                          ),
                        ),
                        child: _AiNoteCard(inputMode: widget.inputMode),
                      ),
                    ],
                  ),
                ),
              ),
              SafeArea(
                top: false,
                bottom: true,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
                  child: _AnimatedReveal(
                    animation: CurvedAnimation(
                      parent: _entryController,
                      curve: const Interval(
                        0.45,
                        1,
                        curve: Curves.easeOutCubic,
                      ),
                    ),
                    child: FilledButton.icon(
                      onPressed:
                          _isLaunchingScan ||
                              (_isTextPromptMode && !_canSubmitPrompt)
                          ? null
                          : _startIntakeFlow,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accent,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(54),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      icon: Icon(
                        _isLaunchingScan
                            ? Icons.hourglass_top_rounded
                            : Icons.check_circle_rounded,
                      ),
                      label: Text(
                        _primaryActionLabel,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (_isLaunchingScan) _buildFullscreenProgressOverlay(),
        ],
      ),
    );
  }

  Widget _buildFullscreenProgressOverlay() {
    return Positioned.fill(
      child: SafeArea(
        child: Container(
          color: AppColors.canvas.withValues(alpha: 0.96),
          padding: const EdgeInsets.all(20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.borderSubtle),
                  boxShadow: AppTheme.softShadow,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2.2),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'La IA esta trabajando',
                            style: GoogleFonts.manrope(
                              color: AppColors.textStrong,
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _scanProgressMessage.isEmpty
                          ? _emptyProgressLabel
                          : _scanProgressMessage,
                      style: GoogleFonts.poppins(
                        color: AppColors.textStrong,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        minHeight: 8,
                        value: _scanProgressValue.clamp(0.0, 1.0),
                        backgroundColor: AppColors.accentSoft,
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          AppColors.accent,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _selectedAssetCount > 0
                          ? '$_selectedAssetLabel en proceso: $_selectedAssetCount'
                          : _isTextPromptMode
                          ? 'Procesando descripcion del menu...'
                          : _isFileImportMode
                          ? 'Preparando seleccion de archivos...'
                          : 'Preparando captura...',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSoft,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _startIntakeFlow() async {
    if (_isLaunchingScan) {
      return;
    }

    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay un comercio activo para escanear el menu.'),
        ),
      );
      return;
    }

    try {
      if (_isTextPromptMode) {
        await _startPromptFlow(comercioId);
        return;
      }

      final importedAssets = _isFileImportMode
          ? await _selectImportAssets()
          : await _captureMenuPages();

      if (!mounted) {
        return;
      }

      if (importedAssets.isEmpty) {
        return;
      }

      final reviewedAssets = await _reviewImportedAssets(importedAssets);

      if (!mounted) {
        return;
      }

      if (reviewedAssets.isEmpty) {
        return;
      }

      setState(() {
        _isLaunchingScan = true;
        _selectedAssetCount = reviewedAssets.length;
      });
      _setProgress(value: 0.02, message: _initialProgressMessage());
      _setProgress(
        value: 0.06,
        message: _confirmedProgressMessage(reviewedAssets.length),
      );

      final supabase = Supabase.instance.client;
      String catalogId = '';
      String catalogName = _defaultCatalogName;
      bool isNewCatalog = false;
      final existingCatalogRow = await supabase
          .from('catalogos')
          .select('id,nombre')
          .eq('comercio_id', comercioId)
          .order('orden', ascending: true)
          .order('created_at', ascending: true)
          .limit(1)
          .maybeSingle();
      final existing = existingCatalogRow ?? const <String, dynamic>{};
      final existingId = existing['id']?.toString().trim() ?? '';
      final existingName = existing['nombre']?.toString().trim() ?? '';
      if (existingId.isNotEmpty) {
        catalogId = existingId;
      }
      if (existingName.isNotEmpty) {
        catalogName = existingName;
      }
      int totalCreatedCategories = 0;
      int totalCreatedProducts = 0;
      final detectedCategoryNames = <String>{};

      for (var i = 0; i < reviewedAssets.length; i++) {
        final pageNumber = i + 1;
        final totalPages = reviewedAssets.length;
        final pageStart = i / totalPages;
        final asset = reviewedAssets[i];

        _setProgress(
          value: 0.08 + (pageStart * 0.84),
          message: _uploadProgressMessage(
            asset: asset,
            position: pageNumber,
            total: totalPages,
          ),
        );

        final upload = await _storageService.uploadMenuAssetBytes(
          bytes: await asset.file.readAsBytes(),
          comercioId: comercioId,
          contentType: asset.mimeType,
          fileName: asset.displayName,
        );
        final imageUrl = supabase.storage
            .from('menu-scans')
            .getPublicUrl(upload.path);

        _setProgress(
          value: 0.1 + (pageStart * 0.84) + (0.25 / totalPages),
          message: _analyzingProgressMessage(
            asset: asset,
            position: pageNumber,
            total: totalPages,
          ),
        );

        final response = await supabase.functions.invoke(
          'process-menu-gemini',
          body: {
            'file_url': imageUrl,
            'image_url': imageUrl,
            'comercio_id': comercioId,
            'catalog_name': catalogName,
          },
          headers: {
            'Authorization': 'Bearer ${SupabaseConfig.anonKey}',
            'apikey': SupabaseConfig.anonKey,
          },
        );

        final data = _responseMap(response.data);
        if (response.status < 200 || response.status >= 300) {
          throw _AiFlowException(
            _buildAiFailureMessage(
              status: response.status,
              data: data,
              fallback:
                  'No se pudo procesar ${asset.displayName} con IA en este momento.',
            ),
          );
        }

        final returnedCatalogId = data['catalog_id']?.toString().trim() ?? '';
        if (catalogId.isEmpty && returnedCatalogId.isNotEmpty) {
          catalogId = returnedCatalogId;
        }

        final returnedCatalogName =
            data['catalog_name']?.toString().trim() ?? '';
        if (returnedCatalogName.isNotEmpty) {
          catalogName = returnedCatalogName;
        }

        isNewCatalog = isNewCatalog || data['catalog_created'] == true;
        totalCreatedCategories += _asInt(data['created_categories']);
        totalCreatedProducts += _asInt(data['created_products']);
        detectedCategoryNames.addAll(
          _extractCategoryNames(data['parsed_menu']),
        );

        _setProgress(
          value: 0.1 + (((i + 1) / totalPages) * 0.84),
          message: _processedProgressMessage(
            asset: asset,
            position: pageNumber,
            total: totalPages,
          ),
        );
      }

      _setProgress(
        value: 0.95,
        message: _isFileImportMode
            ? 'Uniendo archivos y eliminando productos repetidos...'
            : 'Uniendo paginas y eliminando productos repetidos...',
      );

      final dedupedCount = await _dedupeCatalogProducts(
        comercioId: comercioId,
        catalogId: catalogId,
      );
      totalCreatedProducts = (totalCreatedProducts - dedupedCount).clamp(
        0,
        1 << 31,
      );

      _setProgress(value: 1, message: 'Listo. Menu consolidado correctamente.');

      if (!mounted) {
        return;
      }

      setState(() => _isLaunchingScan = false);
      Navigator.of(context).pop(
        MagicOnboardingResult(
          catalog: CatalogModel(
            id: catalogId,
            comercioId: comercioId,
            nombre: catalogName,
            orden: 0,
            activo: true,
          ),
          createdCategories: totalCreatedCategories,
          createdProducts: totalCreatedProducts,
          detectedCategoryNames: detectedCategoryNames.toList(),
          isNewCatalog: isNewCatalog,
          requestAiProductImages: _generateAiImages,
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _isLaunchingScan = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _buildAiFlowCatchMessage(
              error: error,
              fallback: _isFileImportMode
                  ? 'No se pudo completar la importacion con IA. Intenta con otro archivo.'
                  : 'No se pudo completar el escaneo con IA. Intenta otra foto.',
            ),
          ),
        ),
      );
    }
  }

  Future<void> _startPromptFlow(String comercioId) async {
    final promptText = _menuPromptController.text.trim();
    if (promptText.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Describe tu menu antes de generar con IA.'),
          ),
        );
      }
      return;
    }

    setState(() {
      _isLaunchingScan = true;
      _selectedAssetCount = 0;
    });
    _setProgress(value: 0.02, message: _initialProgressMessage());
    _setProgress(value: 0.08, message: _confirmedProgressMessage(1));

    try {
      final supabase = Supabase.instance.client;
      String catalogId = '';
      String catalogName = _defaultCatalogName;
      bool isNewCatalog = false;
      final existingCatalogRow = await supabase
          .from('catalogos')
          .select('id,nombre')
          .eq('comercio_id', comercioId)
          .order('orden', ascending: true)
          .order('created_at', ascending: true)
          .limit(1)
          .maybeSingle();
      final existing = existingCatalogRow ?? const <String, dynamic>{};
      final existingId = existing['id']?.toString().trim() ?? '';
      final existingName = existing['nombre']?.toString().trim() ?? '';
      if (existingId.isNotEmpty) {
        catalogId = existingId;
      }
      if (existingName.isNotEmpty) {
        catalogName = existingName;
      }

      _setProgress(
        value: 0.24,
        message:
            'IA estructurando categorias, productos y precios desde tu descripcion...',
      );

      final response = await supabase.functions.invoke(
        'process-menu-gemini',
        body: {
          'prompt_text': promptText,
          'comercio_id': comercioId,
          'catalog_name': catalogName,
        },
        headers: {
          'Authorization': 'Bearer ${SupabaseConfig.anonKey}',
          'apikey': SupabaseConfig.anonKey,
        },
      );

      final data = _responseMap(response.data);
      if (response.status < 200 || response.status >= 300) {
        throw _AiFlowException(
          _buildAiFailureMessage(
            status: response.status,
            data: data,
            fallback: 'No se pudo procesar tu descripcion del menu con IA.',
          ),
        );
      }

      final returnedCatalogId = data['catalog_id']?.toString().trim() ?? '';
      if (catalogId.isEmpty && returnedCatalogId.isNotEmpty) {
        catalogId = returnedCatalogId;
      }

      final returnedCatalogName = data['catalog_name']?.toString().trim() ?? '';
      if (returnedCatalogName.isNotEmpty) {
        catalogName = returnedCatalogName;
      }

      isNewCatalog = data['catalog_created'] == true;
      final totalCreatedCategories = _asInt(data['created_categories']);
      var totalCreatedProducts = _asInt(data['created_products']);
      final detectedCategoryNames = _extractCategoryNames(data['parsed_menu']);

      _setProgress(
        value: 0.9,
        message: 'Eliminando productos repetidos y consolidando el menu...',
      );

      final dedupedCount = await _dedupeCatalogProducts(
        comercioId: comercioId,
        catalogId: catalogId,
      );
      totalCreatedProducts = (totalCreatedProducts - dedupedCount).clamp(
        0,
        1 << 31,
      );

      _setProgress(value: 1, message: 'Listo. Menu generado desde texto.');

      if (!mounted) {
        return;
      }

      setState(() => _isLaunchingScan = false);
      Navigator.of(context).pop(
        MagicOnboardingResult(
          catalog: CatalogModel(
            id: catalogId,
            comercioId: comercioId,
            nombre: catalogName,
            orden: 0,
            activo: true,
          ),
          createdCategories: totalCreatedCategories,
          createdProducts: totalCreatedProducts,
          detectedCategoryNames: detectedCategoryNames,
          isNewCatalog: isNewCatalog,
          requestAiProductImages: _generateAiImages,
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _isLaunchingScan = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _buildAiFlowCatchMessage(
              error: error,
              fallback:
                  'No se pudo crear el menu desde texto. Ajusta la descripcion e intenta de nuevo.',
            ),
          ),
        ),
      );
    }
  }

  Future<List<_MenuImportAsset>> _captureMenuPages() async {
    final image = await _webCameraHandoffService.pickCameraImage(
      context,
      feature: 'menu_scan',
      waitingTitle: 'Toma la foto del menu desde tu celular',
      waitingSubtitle:
          'Escanea el codigo con tu telefono y la usaremos para escanear tu menu con IA.',
      imageQuality: 90,
      maxWidth: 2200,
    );
    if (image == null) {
      return <_MenuImportAsset>[];
    }
    return <_MenuImportAsset>[
      _MenuImportAsset(
        file: image,
        displayName: _fileNameFromPath(image.path),
        mimeType: _inferMimeType(image.path),
      ),
    ];
  }

  Future<List<_MenuImportAsset>> _pickMenuFiles() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: true,
        withData: true,
        type: FileType.custom,
        allowedExtensions: const <String>[
          'jpg',
          'jpeg',
          'png',
          'webp',
          'pdf',
          'csv',
          'txt',
        ],
      );

      if (result == null) {
        return <_MenuImportAsset>[];
      }

      final imported = result.files
          .map((file) {
            final trimmedPath = (file.path ?? '').trim();
            final mimeType = _inferMimeType(file.name);
            final xfile = trimmedPath.isNotEmpty
                ? XFile(trimmedPath, name: file.name, mimeType: mimeType)
                : file.bytes == null
                ? null
                : XFile.fromData(
                    file.bytes!,
                    name: file.name,
                    mimeType: mimeType,
                  );
            if (xfile == null) {
              return null;
            }

            return _MenuImportAsset(
              file: xfile,
              displayName: file.name.trim().isEmpty
                  ? _fileNameFromPath(trimmedPath)
                  : file.name.trim(),
              mimeType: mimeType,
            );
          })
          .whereType<_MenuImportAsset>()
          .toList();

      if (imported.isEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'No se pudieron leer los archivos seleccionados desde este dispositivo.',
            ),
          ),
        );
      }

      return imported;
    } on MissingPluginException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'El selector de archivos no esta disponible todavia. Cierra y abre la app por completo e intenta de nuevo.',
            ),
          ),
        );
      }
      return <_MenuImportAsset>[];
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('No se pudo abrir el selector de archivos. $error'),
          ),
        );
      }
      return <_MenuImportAsset>[];
    }
  }

  Future<List<_MenuImportAsset>> _selectImportAssets() async {
    final selectedSource = await showModalBottomSheet<_ImportSource>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: AppColors.canvas,
      builder: (context) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Importar con IA',
                  style: GoogleFonts.manrope(
                    color: AppColors.textStrong,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Elige de donde quieres traer el menu.',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSoft,
                    fontSize: 12.5,
                  ),
                ),
                const SizedBox(height: 14),
                _ImportSourceTile(
                  icon: Icons.photo_library_rounded,
                  title: 'Galeria de imagenes',
                  subtitle:
                      'Importa una o varias fotos del menu desde tu dispositivo.',
                  onTap: () =>
                      Navigator.of(context).pop(_ImportSource.galleryImages),
                ),
                const SizedBox(height: 10),
                _ImportSourceTile(
                  icon: Icons.folder_open_rounded,
                  title: 'Archivos del dispositivo',
                  subtitle:
                      'Usa PDF, CSV, TXT o imagenes desde el explorador de archivos.',
                  onTap: () =>
                      Navigator.of(context).pop(_ImportSource.deviceFiles),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted || selectedSource == null) {
      return <_MenuImportAsset>[];
    }

    switch (selectedSource) {
      case _ImportSource.galleryImages:
        return _pickGalleryImages();
      case _ImportSource.deviceFiles:
        return _pickMenuFiles();
    }
  }

  Future<List<_MenuImportAsset>> _pickGalleryImages() async {
    try {
      final images = await _picker.pickMultiImage(imageQuality: 90);
      if (images.isEmpty) {
        return <_MenuImportAsset>[];
      }

      return images
          .map(
            (image) => _MenuImportAsset(
              file: image,
              displayName: _fileNameFromPath(image.path),
              mimeType: _inferMimeType(image.path),
            ),
          )
          .toList();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo abrir la galeria. $error')),
        );
      }
      return <_MenuImportAsset>[];
    }
  }

  Future<List<_MenuImportAsset>> _reviewImportedAssets(
    List<_MenuImportAsset> assets,
  ) async {
    final result = await showModalBottomSheet<List<_MenuImportAsset>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: AppColors.canvas,
      builder: (context) {
        final working = List<_MenuImportAsset>.from(assets);

        return StatefulBuilder(
          builder: (context, setModalState) {
            return SizedBox(
              height: MediaQuery.of(context).size.height * 0.82,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _isFileImportMode
                                ? 'Revisa los archivos importados'
                                : 'Revisa las paginas capturadas',
                            style: GoogleFonts.manrope(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textStrong,
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: () =>
                              Navigator.of(context).pop(<_MenuImportAsset>[]),
                          child: const Text('Cancelar'),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _isFileImportMode
                                ? 'Puedes reordenar, eliminar o agregar archivos antes del analisis IA.'
                                : 'Puedes arrastrar para reordenar o eliminar paginas borrosas antes del analisis IA.',
                            style: GoogleFonts.poppins(
                              color: AppColors.textSoft,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton.icon(
                          onPressed: () async {
                            final newAssets = _isFileImportMode
                                ? await _pickMenuFiles()
                                : await _captureMenuPages();
                            if (newAssets.isEmpty) {
                              return;
                            }
                            setModalState(() => working.addAll(newAssets));
                          },
                          icon: Icon(
                            _isFileImportMode
                                ? Icons.add_circle_outline_rounded
                                : Icons.add_a_photo_rounded,
                            size: 18,
                          ),
                          label: Text(
                            _isFileImportMode
                                ? 'Agregar archivos'
                                : 'Tomar otra',
                          ),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 40),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 8,
                            ),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Text(
                      '$_selectedAssetLabel: ${working.length}',
                      style: GoogleFonts.poppins(
                        color: AppColors.textSoft,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  Expanded(
                    child: ReorderableListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                      itemCount: working.length,
                      onReorder: (oldIndex, newIndex) {
                        setModalState(() {
                          if (newIndex > oldIndex) {
                            newIndex -= 1;
                          }
                          final moved = working.removeAt(oldIndex);
                          working.insert(newIndex, moved);
                        });
                      },
                      itemBuilder: (context, index) {
                        final asset = working[index];
                        return Container(
                          key: ValueKey(
                            '${asset.displayName}_${asset.path}_${asset.mimeType}',
                          ),
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.borderSubtle),
                          ),
                          child: Row(
                            children: [
                              if (asset.isImage)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: FutureBuilder<Uint8List>(
                                    future: asset.file.readAsBytes(),
                                    builder: (context, snapshot) {
                                      if (snapshot.hasData) {
                                        return Image.memory(
                                          snapshot.data!,
                                          width: 62,
                                          height: 62,
                                          fit: BoxFit.cover,
                                          gaplessPlayback: true,
                                        );
                                      }

                                      return Container(
                                        width: 62,
                                        height: 62,
                                        color: AppColors.surfaceMuted,
                                        alignment: Alignment.center,
                                        child: const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                )
                              else
                                Container(
                                  width: 62,
                                  height: 62,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(8),
                                    color: AppColors.surfaceMuted,
                                    border: Border.all(
                                      color: AppColors.borderSubtle,
                                    ),
                                  ),
                                  child: Icon(
                                    asset.icon,
                                    color: AppColors.accent,
                                  ),
                                ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      asset.displayName,
                                      style: GoogleFonts.poppins(
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.textStrong,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _isFileImportMode
                                          ? 'Archivo ${index + 1} · ${asset.mimeType}'
                                          : 'Pagina ${index + 1}',
                                      style: GoogleFonts.poppins(
                                        color: AppColors.textSoft,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: _isFileImportMode
                                    ? 'Eliminar archivo'
                                    : 'Eliminar pagina',
                                onPressed: () {
                                  setModalState(() => working.removeAt(index));
                                },
                                icon: const Icon(
                                  Icons.delete_outline_rounded,
                                  color: AppColors.danger,
                                ),
                              ),
                              const Icon(
                                Icons.drag_handle_rounded,
                                color: AppColors.textSoft,
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      child: FilledButton.icon(
                        onPressed: working.isEmpty
                            ? null
                            : () => Navigator.of(
                                context,
                              ).pop(List<_MenuImportAsset>.from(working)),
                        icon: const Icon(Icons.check_circle_rounded),
                        label: Text(
                          working.isEmpty
                              ? _isFileImportMode
                                    ? 'Agrega al menos 1 archivo'
                                    : 'Agrega al menos 1 pagina'
                              : _isFileImportMode
                              ? 'Procesar ${working.length} archivo(s)'
                              : 'Procesar ${working.length} pagina(s)',
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    return result ?? <_MenuImportAsset>[];
  }

  String _initialProgressMessage() {
    if (_isTextPromptMode) {
      return 'Preparando tu descripcion para estructurar el menu con IA...';
    }
    return _isFileImportMode
        ? 'Abriendo selector para importar archivos del menu...'
        : 'Abriendo camara para capturar la primera pagina...';
  }

  String _confirmedProgressMessage(int count) {
    if (_isTextPromptMode) {
      return 'Descripcion recibida. Generando menu con IA...';
    }
    return _isFileImportMode
        ? 'Se confirmaron $count archivo(s). Iniciando analisis con IA...'
        : 'Se confirmaron $count pagina(s). Iniciando analisis con IA...';
  }

  String _uploadProgressMessage({
    required _MenuImportAsset asset,
    required int position,
    required int total,
  }) {
    return _isFileImportMode
        ? 'Subiendo archivo $position de $total: ${asset.displayName}...'
        : 'Subiendo pagina $position de $total...';
  }

  String _analyzingProgressMessage({
    required _MenuImportAsset asset,
    required int position,
    required int total,
  }) {
    return _isFileImportMode
        ? 'IA analizando archivo $position de $total: ${asset.displayName}...'
        : 'IA analizando pagina $position de $total...';
  }

  String _processedProgressMessage({
    required _MenuImportAsset asset,
    required int position,
    required int total,
  }) {
    return _isFileImportMode
        ? 'Archivo $position de $total procesado: ${asset.displayName}.'
        : 'Pagina $position procesada.';
  }

  String _fileNameFromPath(String path) {
    final slashNormalized = path.replaceAll('\\', '/');
    return slashNormalized.split('/').last.trim();
  }

  String _inferMimeType(String fileName) {
    final normalized = fileName.trim().toLowerCase();
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.pdf')) return 'application/pdf';
    if (normalized.endsWith('.csv')) return 'text/csv';
    if (normalized.endsWith('.txt')) return 'text/plain';
    return 'image/jpeg';
  }

  Future<int> _dedupeCatalogProducts({
    required String comercioId,
    required String catalogId,
  }) async {
    if (catalogId.trim().isEmpty) {
      return 0;
    }

    final supabase = Supabase.instance.client;
    final categoryRows = await supabase
        .from('categorias')
        .select('id')
        .eq('comercio_id', comercioId)
        .eq('catalogo_id', catalogId);

    final categoryIds = (categoryRows as List<dynamic>)
        .map((row) => row is Map ? row['id']?.toString() ?? '' : '')
        .where((id) => id.isNotEmpty)
        .toList();

    if (categoryIds.isEmpty) {
      return 0;
    }

    final productRows = await supabase
        .from('productos')
        .select('id,nombre,precio,categoria_id')
        .eq('comercio_id', comercioId)
        .inFilter('categoria_id', categoryIds);

    final seen = <String>{};
    final duplicateIds = <String>[];

    for (final row in (productRows as List<dynamic>)) {
      if (row is! Map) {
        continue;
      }
      final id = row['id']?.toString() ?? '';
      if (id.isEmpty) {
        continue;
      }

      final rawName = row['nombre']?.toString().trim().toLowerCase() ?? '';
      final normalizedName = rawName.replaceAll(RegExp(r'\s+'), ' ');
      final price = _asDouble(row['precio']);
      final categoryId = row['categoria_id']?.toString().trim() ?? '';
      final key = '$categoryId|$normalizedName|${price.toStringAsFixed(2)}';

      if (!seen.add(key)) {
        duplicateIds.add(id);
      }
    }

    for (var i = 0; i < duplicateIds.length; i += 100) {
      final end = (i + 100 < duplicateIds.length)
          ? i + 100
          : duplicateIds.length;
      final chunk = duplicateIds.sublist(i, end);
      if (chunk.isEmpty) {
        continue;
      }

      await supabase.from('productos').delete().inFilter('id', chunk);
    }

    return duplicateIds.length;
  }

  double _asDouble(dynamic value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    return double.tryParse('${value ?? ''}') ?? 0;
  }

  void _setProgress({required double value, required String message}) {
    if (!mounted) {
      return;
    }
    setState(() {
      _scanProgressValue = value.clamp(0.0, 1.0);
      _scanProgressMessage = message;
    });
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

  String _buildAiFailureMessage({
    required int status,
    required Map<String, dynamic> data,
    required String fallback,
  }) {
    final serverMessage = data['error']?.toString().trim() ?? '';
    final retryable = data['retryable'] == true;

    if (status == 503 && retryable) {
      return 'La IA esta temporalmente saturada. Intenta de nuevo en unos segundos.';
    }

    if (serverMessage.isNotEmpty) {
      return serverMessage;
    }

    return fallback;
  }

  String _buildAiFlowCatchMessage({
    required Object error,
    required String fallback,
  }) {
    if (error is _AiFlowException) {
      return error.message;
    }

    final raw = error.toString().trim();
    if (raw.isEmpty) {
      return fallback;
    }

    return '$fallback\n$raw';
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
        .map(
          (item) => item is Map ? item['nombre']?.toString().trim() ?? '' : '',
        )
        .where((name) => name.isNotEmpty)
        .cast<String>()
        .toList();
  }
}

class _AnimatedReveal extends StatelessWidget {
  final Animation<double> animation;
  final Widget child;

  const _AnimatedReveal({required this.animation, required this.child});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      child: child,
      builder: (context, builtChild) {
        final value = animation.value;
        final clamped = value < 0 ? 0.0 : (value > 1 ? 1.0 : value);
        final eased = Curves.easeOut.transform(clamped);
        final dy = (1 - eased) * 14;

        return Opacity(
          opacity: eased,
          child: Transform.translate(offset: Offset(0, dy), child: builtChild),
        );
      },
    );
  }
}

class _HeaderCard extends StatelessWidget {
  final MagicOnboardingInputMode inputMode;

  const _HeaderCard({required this.inputMode});

  bool get _isFileImportMode =>
      inputMode == MagicOnboardingInputMode.fileImport;

  bool get _isTextPromptMode =>
      inputMode == MagicOnboardingInputMode.textPrompt;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [AppColors.surface, AppColors.surfaceMuted],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: AppColors.borderSubtle),
        boxShadow: AppTheme.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: AppColors.accentSoft,
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              color: AppColors.accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isTextPromptMode
                      ? 'Recomendaciones para describir tu menu'
                      : _isFileImportMode
                      ? 'Recomendaciones antes de importar'
                      : 'Recomendaciones antes de escanear',
                  style: GoogleFonts.manrope(
                    color: AppColors.textStrong,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _isTextPromptMode
                      ? 'Mientras mas clara y estructurada sea tu descripcion, mejor quedara el menu generado por IA.'
                      : _isFileImportMode
                      ? 'Usa archivos legibles y completos para obtener mejores resultados con IA.'
                      : 'Sigue esta guia rapida para obtener mejores resultados con IA.',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSoft,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfographicCard extends StatelessWidget {
  final Animation<double> animation;
  final MagicOnboardingInputMode inputMode;

  const _InfographicCard({required this.animation, required this.inputMode});

  static const List<_TipItem> _scanTips = <_TipItem>[
    _TipItem(
      number: '01',
      title: 'Buena iluminacion',
      description: 'Usa luz natural o blanca uniforme. Evita fotos oscuras.',
      icon: Icons.wb_sunny_rounded,
    ),
    _TipItem(
      number: '02',
      title: 'Camara estable',
      description:
          'Mantener el telefono recto mejora lectura de texto y precios.',
      icon: Icons.center_focus_strong_rounded,
    ),
    _TipItem(
      number: '03',
      title: 'Menu completo',
      description: 'Evita recortes. Incluye encabezados, categorias y precios.',
      icon: Icons.menu_book_rounded,
    ),
    _TipItem(
      number: '04',
      title: 'Sin reflejos',
      description: 'Quita plastico brillante y sombras sobre el papel.',
      icon: Icons.visibility_rounded,
    ),
    _TipItem(
      number: '05',
      title: 'Texto nitido',
      description: 'No uses zoom digital. Acercate fisicamente al menu.',
      icon: Icons.high_quality_rounded,
    ),
  ];

  static const List<_TipItem> _importTips = <_TipItem>[
    _TipItem(
      number: '01',
      title: 'Archivo completo',
      description: 'Incluye todas las paginas, columnas o secciones del menu.',
      icon: Icons.library_books_rounded,
    ),
    _TipItem(
      number: '02',
      title: 'Formato legible',
      description:
          'PDF, imagen, CSV o TXT deben tener nombres, categorias y precios visibles.',
      icon: Icons.file_present_rounded,
    ),
    _TipItem(
      number: '03',
      title: 'Sin recortes',
      description:
          'Evita exportaciones incompletas o capturas donde falten precios.',
      icon: Icons.crop_free_rounded,
    ),
    _TipItem(
      number: '04',
      title: 'Orden correcto',
      description:
          'Si subes varios archivos, reordena antes de procesar para conservar el contexto.',
      icon: Icons.swap_vert_rounded,
    ),
    _TipItem(
      number: '05',
      title: 'Revision final',
      description:
          'La IA acelera la carga, pero conviene revisar categorias y productos al terminar.',
      icon: Icons.fact_check_rounded,
    ),
  ];

  static const List<_TipItem> _textPromptTips = <_TipItem>[
    _TipItem(
      number: '01',
      title: 'Separar por categorias',
      description:
          'Agrupa tu descripcion por secciones como entradas, hamburguesas, bebidas o postres.',
      icon: Icons.category_rounded,
    ),
    _TipItem(
      number: '02',
      title: 'Precio junto al producto',
      description:
          'Escribe cada item con su precio para que la IA no tenga que inferirlo.',
      icon: Icons.attach_money_rounded,
    ),
    _TipItem(
      number: '03',
      title: 'Variantes y extras',
      description:
          'Si manejas tamanos o sabores, indicalos en la misma linea o debajo del producto.',
      icon: Icons.tune_rounded,
    ),
    _TipItem(
      number: '04',
      title: 'Sin ambiguedad',
      description:
          'Evita frases vagas como “precio segun presentacion” si puedes detallar cada opcion.',
      icon: Icons.rule_rounded,
    ),
    _TipItem(
      number: '05',
      title: 'Revision final',
      description:
          'La IA arma el borrador rapido, pero conviene revisar nombres, descripciones y precios despues.',
      icon: Icons.fact_check_rounded,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final tips = switch (inputMode) {
      MagicOnboardingInputMode.fileImport => _importTips,
      MagicOnboardingInputMode.textPrompt => _textPromptTips,
      MagicOnboardingInputMode.camera => _scanTips,
    };
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderSubtle),
        boxShadow: AppTheme.softShadow,
      ),
      child: Column(
        children: List<Widget>.generate(tips.length, (index) {
          final tip = tips[index];
          final start = (0.12 + (index * 0.1)).clamp(0.0, 1.0).toDouble();
          final end = (start + 0.34).clamp(0.0, 1.0).toDouble();

          return _AnimatedReveal(
            animation: CurvedAnimation(
              parent: animation,
              curve: Interval(start, end, curve: Curves.easeOutCubic),
            ),
            child: Padding(
              padding: EdgeInsets.only(
                bottom: index == tips.length - 1 ? 0 : 10,
              ),
              child: _TipRow(tip: tip),
            ),
          );
        }),
      ),
    );
  }
}

class _TipRow extends StatelessWidget {
  final _TipItem tip;

  const _TipRow({required this.tip});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderSubtle),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: Colors.white,
            ),
            child: Text(
              tip.number,
              style: GoogleFonts.manrope(
                color: AppColors.accent,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Icon(tip.icon, color: AppColors.accent, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tip.title,
                  style: GoogleFonts.manrope(
                    color: AppColors.textStrong,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  tip.description,
                  style: GoogleFonts.poppins(
                    color: AppColors.textSoft,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AiNoteCard extends StatelessWidget {
  final MagicOnboardingInputMode inputMode;

  const _AiNoteCard({required this.inputMode});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderSubtle),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.psychology_alt_rounded, color: AppColors.accent),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              inputMode == MagicOnboardingInputMode.textPrompt
                  ? 'Esta opcion convierte una descripcion escrita en categorias, productos y precios estructurados. Si hay informacion incompleta, la IA intentara ordenarla sin inventar detalles que no aparezcan en tu texto.'
                  : inputMode == MagicOnboardingInputMode.fileImport
                  ? 'Esta importacion se procesa con IA para detectar categorias, productos y precios automaticamente desde archivos como PDF, imagen, CSV o TXT. Mientras mas claro este el contenido, mejor sera el resultado.'
                  : 'Este escaneo se procesa con IA para detectar categorias, productos y precios automaticamente. Mientras mejor sea la foto, mejor sera el resultado.',
              style: GoogleFonts.poppins(
                color: AppColors.textStrong,
                fontSize: 12.5,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AiImagesOptInCard extends StatelessWidget {
  const _AiImagesOptInCard({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderSubtle),
        boxShadow: AppTheme.softShadow,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.accentSoft,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.image_search_rounded,
              color: AppColors.accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Generar imagenes de productos con IA',
                  style: GoogleFonts.manrope(
                    color: AppColors.textStrong,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Se encola al terminar el menu y se procesa en segundo plano. No bloquea el onboarding.',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSoft,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Incluye hasta 30 creditos iniciales. En onboarding se usa una sola vez y mantiene el tope de 25 imagenes.',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSoft,
                    fontSize: 11.5,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Switch.adaptive(
            value: value,
            activeTrackColor: AppColors.accent,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _PromptComposerCard extends StatelessWidget {
  const _PromptComposerCard({
    required this.controller,
    required this.maxLength,
    required this.onChanged,
  });

  final TextEditingController controller;
  final int maxLength;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final text = controller.text.trim();
    final remaining = maxLength - controller.text.characters.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderSubtle),
        boxShadow: AppTheme.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Describe tu menu',
            style: GoogleFonts.manrope(
              color: AppColors.textStrong,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Incluye categorias, nombres de productos, descripciones y precios. Mientras mas ordenado este el texto, mejor quedara el borrador.',
            style: GoogleFonts.poppins(
              color: AppColors.textSoft,
              fontSize: 12.5,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            onChanged: (_) => onChanged(),
            maxLength: maxLength,
            minLines: 8,
            maxLines: 14,
            style: GoogleFonts.poppins(color: AppColors.textStrong),
            decoration: InputDecoration(
              hintText:
                  'Ejemplo:\nEntradas\nTequenos - Palitos de queso con salsa tartara - 6\n\nHamburguesas\nClasica - Carne, queso, lechuga y tomate - 8\nDoble bacon - Doble carne, tocineta y cheddar - 11\n\nBebidas\nRefresco 355ml - 2',
              hintStyle: GoogleFonts.poppins(
                color: AppColors.textSoft,
                fontSize: 12,
                height: 1.45,
              ),
              counterText: '',
              filled: true,
              fillColor: AppColors.surfaceMuted,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: AppColors.borderSubtle),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: AppColors.borderSubtle),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: const BorderSide(color: AppColors.accent),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  text.length < 12
                      ? 'Agrega suficiente detalle para que la IA pueda separar categorias y precios.'
                      : 'La IA usara este texto como base para construir tu catalogo.',
                  style: GoogleFonts.poppins(
                    color: AppColors.textSoft,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '$remaining restantes',
                style: GoogleFonts.poppins(
                  color: remaining < 180
                      ? AppColors.danger
                      : AppColors.textSoft,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TipItem {
  final String number;
  final String title;
  final String description;
  final IconData icon;

  const _TipItem({
    required this.number,
    required this.title,
    required this.description,
    required this.icon,
  });
}

enum _ImportSource { galleryImages, deviceFiles }

class _ImportSourceTile extends StatelessWidget {
  const _ImportSourceTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderSubtle),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.manrope(
                      color: AppColors.textStrong,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: GoogleFonts.poppins(
                      color: AppColors.textSoft,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right_rounded, color: AppColors.textSoft),
          ],
        ),
      ),
    );
  }
}

class _MenuImportAsset {
  _MenuImportAsset({
    required this.file,
    required this.displayName,
    required this.mimeType,
  });

  final XFile file;
  final String displayName;
  final String mimeType;

  String get path => file.path;

  bool get isImage => mimeType.startsWith('image/');

  IconData get icon {
    if (mimeType == 'application/pdf') {
      return Icons.picture_as_pdf_rounded;
    }
    if (mimeType == 'text/csv') {
      return Icons.table_chart_rounded;
    }
    if (mimeType.startsWith('text/')) {
      return Icons.description_rounded;
    }
    return Icons.insert_drive_file_rounded;
  }
}
