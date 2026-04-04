import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
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

class _MagicOnboardingScreenState extends State<MagicOnboardingScreen>
    with SingleTickerProviderStateMixin {
  final ImagePicker _picker = ImagePicker();
  final StorageService _storageService = const StorageService();
  static const String _defaultCatalogName = 'Menu principal';

  late final AnimationController _entryController;
  bool _isLaunchingScan = false;
  String _scanProgressMessage = '';
  double _scanProgressValue = 0;
  int _capturedPages = 0;

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
          icon: const Icon(Icons.arrow_back_rounded, color: AppColors.textStrong),
        ),
        title: Text(
          'Escaneo con IA',
          style: textTheme.titleLarge,
        ),
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
                          curve: const Interval(0, 0.55, curve: Curves.easeOutCubic),
                        ),
                        child: _HeaderCard(),
                      ),
                      const SizedBox(height: 16),
                      _AnimatedReveal(
                        animation: CurvedAnimation(
                          parent: _entryController,
                          curve: const Interval(0.15, 0.75, curve: Curves.easeOutCubic),
                        ),
                        child: _InfographicCard(animation: _entryController),
                      ),
                      const SizedBox(height: 16),
                      _AnimatedReveal(
                        animation: CurvedAnimation(
                          parent: _entryController,
                          curve: const Interval(0.3, 0.9, curve: Curves.easeOutCubic),
                        ),
                        child: _AiNoteCard(),
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
                      curve: const Interval(0.45, 1, curve: Curves.easeOutCubic),
                    ),
                    child: FilledButton.icon(
                      onPressed: _isLaunchingScan ? null : _startScanFlow,
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
                        'Entendido',
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
                          ? 'Preparando escaneo con IA...'
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
                      _capturedPages > 0
                          ? 'Paginas en proceso: $_capturedPages'
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

  Future<void> _startScanFlow() async {
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

    setState(() => _isLaunchingScan = true);

    try {
      _setProgress(
        value: 0.02,
        message: 'Abriendo camara para capturar la primera pagina...',
      );

      final images = await _captureMenuPages();

      if (!mounted) {
        return;
      }

      if (images.isEmpty) {
        setState(() => _isLaunchingScan = false);
        return;
      }

      _setProgress(
        value: 0.04,
        message: 'Revisa, ordena o elimina paginas antes de procesar.',
      );

      final reviewedImages = await _reviewCapturedPages(images);

      if (!mounted) {
        return;
      }

      if (reviewedImages.isEmpty) {
        setState(() => _isLaunchingScan = false);
        return;
      }

      _capturedPages = reviewedImages.length;
      _setProgress(
        value: 0.06,
        message: 'Se confirmaron ${reviewedImages.length} pagina(s). Iniciando analisis con IA...',
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

      for (var i = 0; i < reviewedImages.length; i++) {
        final pageNumber = i + 1;
        final totalPages = reviewedImages.length;
        final pageStart = i / totalPages;

        _setProgress(
          value: 0.08 + (pageStart * 0.84),
          message: 'Subiendo pagina $pageNumber de $totalPages...',
        );

        final upload = await _storageService.uploadMenuScan(
          imageFile: File(reviewedImages[i].path),
          comercioId: comercioId,
        );
        final imageUrl = supabase.storage.from('menu-scans').getPublicUrl(upload.path);

        _setProgress(
          value: 0.1 + (pageStart * 0.84) + (0.25 / totalPages),
          message: 'IA analizando pagina $pageNumber de $totalPages...',
        );

        final response = await supabase.functions.invoke(
          'process-menu-gemini',
          body: {
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
          throw StateError(
            'Error al procesar la pagina $pageNumber (status ${response.status}): ${data['error'] ?? 'sin detalle'}.',
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

        isNewCatalog = isNewCatalog || data['catalog_created'] == true;
        totalCreatedCategories += _asInt(data['created_categories']);
        totalCreatedProducts += _asInt(data['created_products']);
        detectedCategoryNames.addAll(_extractCategoryNames(data['parsed_menu']));

        _setProgress(
          value: 0.1 + (((i + 1) / totalPages) * 0.84),
          message: 'Pagina $pageNumber procesada.',
        );
      }

      _setProgress(
        value: 0.95,
        message: 'Uniendo paginas y eliminando productos repetidos...',
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
            'No se pudo completar el escaneo con IA. Intenta otra foto.\n$error',
          ),
        ),
      );
    }
  }

  Future<List<XFile>> _captureMenuPages() async {
    final image = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 90,
    );
    if (image == null) {
      return <XFile>[];
    }
    return <XFile>[image];
  }

  Future<List<XFile>> _reviewCapturedPages(List<XFile> pages) async {
    final result = await showModalBottomSheet<List<XFile>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: AppColors.canvas,
      builder: (context) {
        final working = List<XFile>.from(pages);

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
                            'Revisa las paginas capturadas',
                            style: GoogleFonts.manrope(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textStrong,
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(<XFile>[]),
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
                            'Puedes arrastrar para reordenar o eliminar paginas borrosas antes del analisis IA.',
                            style: GoogleFonts.poppins(
                              color: AppColors.textSoft,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton.icon(
                          onPressed: () async {
                            final newImage = await _picker.pickImage(
                              source: ImageSource.camera,
                              imageQuality: 90,
                            );
                            if (newImage == null) {
                              return;
                            }
                            setModalState(() => working.add(newImage));
                          },
                          icon: const Icon(Icons.add_a_photo_rounded, size: 18),
                          label: const Text('Tomar otra'),
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
                      'Paginas: ${working.length}',
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
                        final image = working[index];
                        return Container(
                          key: ValueKey(image.path),
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.borderSubtle),
                          ),
                          child: Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.file(
                                  File(image.path),
                                  width: 62,
                                  height: 62,
                                  fit: BoxFit.cover,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'Pagina ${index + 1}',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.textStrong,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Eliminar pagina',
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
                            : () => Navigator.of(context).pop(
                                  List<XFile>.from(working),
                                ),
                        icon: const Icon(Icons.check_circle_rounded),
                        label: Text(
                          working.isEmpty
                              ? 'Agrega al menos 1 pagina'
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

    return result ?? <XFile>[];
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
      final end = (i + 100 < duplicateIds.length) ? i + 100 : duplicateIds.length;
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
          child: Transform.translate(
            offset: Offset(0, dy),
            child: builtChild,
          ),
        );
      },
    );
  }
}

class _HeaderCard extends StatelessWidget {
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
                  'Recomendaciones antes de escanear',
                  style: GoogleFonts.manrope(
                    color: AppColors.textStrong,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Sigue esta guia rapida para obtener mejores resultados con IA.',
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

  const _InfographicCard({required this.animation});

  static const List<_TipItem> _tips = <_TipItem>[
    _TipItem(
      number: '01',
      title: 'Buena iluminacion',
      description: 'Usa luz natural o blanca uniforme. Evita fotos oscuras.',
      icon: Icons.wb_sunny_rounded,
    ),
    _TipItem(
      number: '02',
      title: 'Camara estable',
      description: 'Mantener el telefono recto mejora lectura de texto y precios.',
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
      child: Column(
        children: List<Widget>.generate(_tips.length, (index) {
          final tip = _tips[index];
          final start = (0.12 + (index * 0.1)).clamp(0.0, 1.0).toDouble();
          final end = (start + 0.34).clamp(0.0, 1.0).toDouble();

          return _AnimatedReveal(
            animation: CurvedAnimation(
              parent: animation,
              curve: Interval(start, end, curve: Curves.easeOutCubic),
            ),
            child: Padding(
              padding: EdgeInsets.only(bottom: index == _tips.length - 1 ? 0 : 10),
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
              'Este escaneo se procesa con IA para detectar categorias, productos y precios automaticamente. Mientras mejor sea la foto, mejor sera el resultado.',
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
