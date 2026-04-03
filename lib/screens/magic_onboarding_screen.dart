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

  late final AnimationController _entryController;
  bool _isLaunchingScan = false;

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
      body: Column(
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
                    _isLaunchingScan ? 'Abriendo camara...' : 'Entendido',
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
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 90,
      );

      if (!mounted) {
        return;
      }

      if (image == null) {
        setState(() => _isLaunchingScan = false);
        return;
      }

      final supabase = Supabase.instance.client;

      final upload = await _storageService.uploadMenuScan(
        imageFile: File(image.path),
        comercioId: comercioId,
      );
      final imageUrl = supabase.storage.from('menu-scans').getPublicUrl(upload.path);

      final response = await supabase.functions.invoke(
        'process-menu-gemini',
        body: {
          'image_url': imageUrl,
          'comercio_id': comercioId,
          'catalog_name': 'Menu principal',
        },
        headers: {
          'Authorization': 'Bearer ${SupabaseConfig.anonKey}',
          'apikey': SupabaseConfig.anonKey,
        },
      );

      final data = _responseMap(response.data);
      if (response.status < 200 || response.status >= 300) {
        throw StateError(
          'Error al procesar menu (status ${response.status}): ${data['error'] ?? 'sin detalle'}.',
        );
      }

      final catalogName = (data['catalog_name']?.toString().trim().isNotEmpty ?? false)
          ? data['catalog_name'].toString().trim()
          : 'Menu principal';

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(
        MagicOnboardingResult(
          catalog: CatalogModel(
            id: data['catalog_id']?.toString() ?? '',
            comercioId: comercioId,
            nombre: catalogName,
            orden: _asInt(data['catalog_order']),
            activo: data['catalog_active'] is bool ? data['catalog_active'] as bool : true,
          ),
          createdCategories: _asInt(data['created_categories']),
          createdProducts: _asInt(data['created_products']),
          detectedCategoryNames: _extractCategoryNames(data['parsed_menu']),
          isNewCatalog: data['catalog_created'] == true,
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
