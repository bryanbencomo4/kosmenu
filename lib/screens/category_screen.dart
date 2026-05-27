// ignore_for_file: avoid_print

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/product_form_screen.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
import 'package:kosmenu_app/services/ai_image_service.dart';
import 'package:kosmenu_app/services/category_icon_ai_service.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CategoryListScreen extends StatefulWidget {
  const CategoryListScreen({super.key});

  @override
  State<CategoryListScreen> createState() => _CategoryListScreenState();
}

class _CategoryListScreenState extends State<CategoryListScreen> {
  bool _loading = true;
  bool _isCreating = false;
  CatalogModel? _catalog;

  @override
  void initState() {
    super.initState();
    _resolveSingleCatalog();
  }

  Future<void> _resolveSingleCatalog() async {
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      if (comercioId.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No hay comercio activo para gestionar el menú.'),
          ),
        );
        setState(() => _loading = false);
        return;
      }

      final rows = await Supabase.instance.client
          .from('catalogos')
          .select()
          .eq('comercio_id', comercioId)
          .order('orden', ascending: true)
          .order('nombre', ascending: true)
          .limit(1);

      final list = (rows as List<dynamic>)
          .map(
            (row) =>
                CatalogModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .toList();

      if (!mounted) return;
      setState(() {
        _catalog = list.isEmpty ? null : list.first;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar el menú: $error')),
      );
    }
  }

  Future<void> _createFirstCatalog() async {
    if (_isCreating) return;
    const name = 'Menu principal';

    setState(() => _isCreating = true);
    try {
      await Supabase.instance.client.from('catalogos').insert({
        'comercio_id': SupabaseConfig.currentComercioId,
        'nombre': name,
        'orden': 0,
        'activo': true,
      });
      await _resolveSingleCatalog();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo crear el menú: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isCreating = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    if (_loading) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

    if (_catalog != null) {
      return CatalogCategoriesScreen(catalog: _catalog!);
    }

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        backgroundColor: colorScheme.surfaceContainerHighest,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        foregroundColor: colorScheme.onSurface,
        titleTextStyle: GoogleFonts.manrope(
          color: colorScheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
        title: const Text('Gestión de menú'),
      ),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: colorScheme.outlineVariant),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Todavía no tienes un menú principal',
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurface,
                        fontWeight: FontWeight.w800,
                        fontSize: 22,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Crea tu primer menú para empezar a organizar categorías y productos.',
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isCreating ? null : _createFirstCatalog,
                        icon: const Icon(Icons.add_rounded),
                        label: Text(
                          _isCreating ? 'Creando...' : 'Crear menú principal',
                        ),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(50),
                        ),
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
}

class CatalogCategoriesScreen extends StatefulWidget {
  const CatalogCategoriesScreen({super.key, required this.catalog});

  final CatalogModel catalog;

  @override
  State<CatalogCategoriesScreen> createState() =>
      _CatalogCategoriesScreenState();
}

class _CatalogCategoriesScreenState extends State<CatalogCategoriesScreen> {
  bool _loading = true;
  bool _hasLoadedInitialSnapshot = false;
  bool _isMutating = false;
  bool _isSavingCategoryOrder = false;
  List<CategoryModel> _categories = <CategoryModel>[];
  List<ProductModel> _products = <ProductModel>[];
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String _searchQuery = '';
  bool _showAppBarSearch = false;
  double _headerCollapse = 0;
  int _selectedTabIndex = 0;
  String? _selectedProductCategoryId;
  Map<String, int> _productCountByCategory = <String, int>{};
  Timer? _aiImageRefreshTimer;
  final AiImageService _aiImageService = const AiImageService();
  final CategoryIconAiService _categoryIconAiService =
      const CategoryIconAiService();

  String get _currentCatalogoId => widget.catalog.id.trim();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadCategories();
  }

  void _onScroll() {
    final next =
        (_scrollController.hasClients ? (_scrollController.offset / 140) : 0.0)
            .clamp(0.0, 1.0);
    if ((next - _headerCollapse).abs() < 0.02 || !mounted) return;
    setState(() => _headerCollapse = next);
  }

  @override
  void dispose() {
    _aiImageRefreshTimer?.cancel();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories({bool showLoadingIndicator = true}) async {
    if (!mounted) return;
    if (_currentCatalogoId.isEmpty) {
      setState(() {
        _categories = <CategoryModel>[];
        _loading = false;
      });
      return;
    }

    if (showLoadingIndicator) {
      setState(() => _loading = true);
    }

    try {
      final rows = await Supabase.instance.client
          .from('categorias')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', _currentCatalogoId)
          .order('orden', ascending: true)
          .order('nombre', ascending: true);

      final categories = (rows as List<dynamic>)
          .map(
            (row) =>
                CategoryModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .toList();

      if (!mounted) return;
      setState(() {
        _categories = categories;
        _hasLoadedInitialSnapshot = true;
      });
      await _loadProducts(categories);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudieron cargar categorías: $error')),
      );
    } finally {
      if (mounted && showLoadingIndicator) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadProducts(List<CategoryModel> categories) async {
    final ids = categories
        .map((e) => e.id.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    final categoryIds = ids.toSet();
    if (ids.isEmpty) {
      if (!mounted) return;
      setState(() {
        _products = <ProductModel>[];
        _productCountByCategory = <String, int>{};
        _selectedProductCategoryId = null;
      });
      return;
    }

    try {
      final rows = await Supabase.instance.client
          .from('productos')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .order('nombre', ascending: true);

      final products = (rows as List<dynamic>)
          .map(
            (row) =>
                ProductModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .where((product) => categoryIds.contains(product.categoriaId.trim()))
          .toList()
        ..sort((a, b) {
          final categoryCompare = a.categoriaId.compareTo(b.categoriaId);
          if (categoryCompare != 0) return categoryCompare;
          final orderCompare = a.orden.compareTo(b.orden);
          if (orderCompare != 0) return orderCompare;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });

      final counts = <String, int>{};
      for (final product in products) {
        final categoryId = product.categoriaId.trim();
        if (categoryId.isEmpty) continue;
        counts.update(categoryId, (value) => value + 1, ifAbsent: () => 1);
      }

      if (!mounted) return;
      setState(() {
        _products = products;
        _productCountByCategory = counts;
        if (_selectedProductCategoryId != null &&
            !ids.contains(_selectedProductCategoryId)) {
          _selectedProductCategoryId = null;
        }
      });
      _syncAiImageRefresh(products);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _products = <ProductModel>[];
        _productCountByCategory = <String, int>{};
        _selectedProductCategoryId = null;
      });
      _showMessage('No se pudieron cargar productos: $error');
    }
  }

  Future<bool?> _confirmCategoryAiIconGeneration() {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Sugerir emoji con IA',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            'Primero intentaremos resolver la categoría con reglas locales gratis. Si hace falta consultar IA, se descontará 1 crédito. ¿Deseas continuar?',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.auto_awesome_rounded, size: 18),
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
              ),
              label: const Text('Sugerir'),
            ),
          ],
        );
      },
    );
  }

  String _formatCategoryIconAiErrorMessage(Object error) {
    final message = error.toString().replaceFirst('Bad state: ', '').trim();
    final normalized = message.toLowerCase();
    if (normalized.contains('not enough credits')) {
      return 'No tienes créditos IA suficientes para generar un icono.';
    }
    if (normalized.contains('ai disabled')) {
      return 'La IA no está habilitada para este comercio.';
    }
    if (normalized.contains('gemini error')) {
      return 'No se pudo sugerir el emoji con IA en este momento.';
    }
    if (normalized.contains('boot_error') ||
        normalized.contains('function failed to start') ||
        normalized.contains('service unavailable') ||
        normalized.contains('functionexception')) {
      return 'El servicio de iconos IA no está disponible en este momento. Inténtalo nuevamente en unos minutos.';
    }
    return message.isEmpty ? 'No se pudo sugerir el emoji con IA.' : message;
  }

  Future<_CategoryEditorResult?> _showCategoryEditorSheet({
    required String title,
    CategoryModel? category,
  }) async {
    final colorScheme = Theme.of(context).colorScheme;
    final navigator = Navigator.of(context);
    final nameController = TextEditingController(text: category?.nombre ?? '');
    final emojiSearchController = TextEditingController();
    var selectedIconValue = _normalizeStoredIconValue(category?.icono) ??
      _suggestCategoryEmoji(category?.nombre ?? '');
    var generatedWithAi = category?.creadoPorIa == true;
    var aiConfidence = category?.confianzaIa;
    var isGeneratingAi = false;
    var emojiSearchQuery = '';
    var isSheetClosed = false;
    String? helperMessage;

    final result = await showModalBottomSheet<_CategoryEditorResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final media = MediaQuery.of(sheetContext);
            final selectedEmojiOption = _categoryEmojiOptionByEmoji(selectedIconValue);
            final selectedIconKey = _normalizeCategoryIconKey(selectedIconValue);
            final legacyIconOption = selectedIconKey != null
                ? _categoryIconOptionByKey(selectedIconKey)
                : null;
            final hasCustomImage = _isImageUrlContent(selectedIconValue);
            final hasCustomSvg = _isSvgIconContent(selectedIconValue);
            final isEmoji = _isEmojiContent(selectedIconValue);
            final filteredEmojiOptions = _filterCategoryEmojiOptions(
              name: nameController.text,
              query: emojiSearchQuery,
            );
            final recommendedEmojiOptions = _recommendedCategoryEmojiOptions(
              name: nameController.text,
              query: emojiSearchQuery,
            );
            final previewLabel = hasCustomImage
                ? 'Imagen URL antigua'
                : hasCustomSvg
                ? 'Icono SVG legado'
                : isEmoji
                ? (selectedEmojiOption?.label ?? 'Emoji personalizado')
                : (legacyIconOption?.label ?? 'Icono legado');

            Future<void> generateWithAi() async {
              final categoryName = nameController.text.trim();
              if (categoryName.isEmpty) {
                if (isSheetClosed || !sheetContext.mounted) return;
                setSheetState(() {
                  helperMessage =
                      'Escribe primero el nombre de la categoría para usar IA.';
                });
                return;
              }

              final confirmed = await _confirmCategoryAiIconGeneration();
              if (confirmed != true || isSheetClosed || !mounted || !sheetContext.mounted) {
                return;
              }

              setSheetState(() {
                isGeneratingAi = true;
                helperMessage = null;
              });

              try {
                final suggestion = await _categoryIconAiService.generateIcon(
                  comercioId: SupabaseConfig.currentComercioId,
                  categoryName: categoryName,
                  context:
                      'Sugiere un emoji estilo WhatsApp para una categoría comercial según las palabras clave del título.',
                );

                if (!mounted || isSheetClosed || !sheetContext.mounted) return;
                setSheetState(() {
                  selectedIconValue = suggestion.emoji;
                  generatedWithAi = true;
                  aiConfidence = suggestion.confidence;
                  helperMessage = suggestion.reason.isNotEmpty
                      ? '${suggestion.reason} · ${suggestion.creditsCharged == 0 ? 'sin costo' : '${suggestion.creditsCharged.toStringAsFixed(0)} crédito'}'
                      : 'Emoji sugerido con IA.';
                });
              } catch (error) {
                if (!mounted || isSheetClosed || !sheetContext.mounted) return;
                setSheetState(() {
                  helperMessage = _formatCategoryIconAiErrorMessage(error);
                });
              } finally {
                if (mounted && !isSheetClosed && sheetContext.mounted) {
                  setSheetState(() => isGeneratingAi = false);
                }
              }
            }

            return SafeArea(
              top: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  20,
                  8,
                  20,
                  max(4, media.viewInsets.bottom + 12),
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: media.size.height - media.padding.top - media.padding.bottom - 12,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: GoogleFonts.manrope(
                                  color: colorScheme.onSurface,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 22,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Elige un emoji manualmente o pide una sugerencia con IA.',
                                style: GoogleFonts.manrope(
                                  color: colorScheme.onSurfaceVariant,
                                  fontWeight: FontWeight.w500,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 16),
                              TextField(
                                controller: nameController,
                                autofocus: category == null,
                                onChanged: (_) => setSheetState(() {}),
                                textCapitalization: TextCapitalization.words,
                                cursorColor: colorScheme.primary,
                                decoration: InputDecoration(
                                  labelText: 'Nombre de la categoría',
                                  hintText: 'Ej: Hamburguesas, Postres, Bebidas',
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 16),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: colorScheme.surfaceContainerHigh,
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(color: colorScheme.outlineVariant),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 56,
                                      height: 56,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF6D28D9).withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                      child: Center(
                                        child: _buildCategoryIconVisual(
                                          iconValue: selectedIconValue,
                                          name: nameController.text.trim(),
                                          size: 28,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            nameController.text.trim().isEmpty
                                                ? 'Vista previa de la categoría'
                                                : nameController.text.trim(),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: GoogleFonts.manrope(
                                              color: colorScheme.onSurface,
                                              fontWeight: FontWeight.w800,
                                              fontSize: 15,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            previewLabel,
                                            style: GoogleFonts.manrope(
                                              color: colorScheme.onSurfaceVariant,
                                              fontWeight: FontWeight.w600,
                                              fontSize: 12.5,
                                            ),
                                          ),
                                          if (generatedWithAi) ...[
                                            const SizedBox(height: 6),
                                            Text(
                                              'Sugerido por IA${aiConfidence != null ? ' · ${aiConfidence!.toStringAsFixed(2)}' : ''}',
                                              style: GoogleFonts.manrope(
                                                color: const Color(0xFF6D28D9),
                                                fontWeight: FontWeight.w700,
                                                fontSize: 11.5,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                              OutlinedButton.icon(
                                onPressed: isGeneratingAi ? null : generateWithAi,
                                icon: isGeneratingAi
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : const Icon(Icons.auto_awesome_rounded),
                                label: Text(
                                  isGeneratingAi
                                      ? 'Sugiriendo...'
                                      : 'Sugerir emoji con IA',
                                ),
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size.fromHeight(48),
                                ),
                              ),
                              if (helperMessage != null) ...[
                                const SizedBox(height: 8),
                                Text(
                                  helperMessage!,
                                  style: GoogleFonts.manrope(
                                    color: colorScheme.onSurfaceVariant,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 16),
                              Text(
                                'Recomendados',
                                style: GoogleFonts.manrope(
                                  color: colorScheme.onSurface,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14.5,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 10,
                                runSpacing: 10,
                                children: recommendedEmojiOptions.map((option) {
                                  final selected = option.emoji == selectedIconValue;
                                  return InkWell(
                                    onTap: () {
                                      setSheetState(() {
                                        selectedIconValue = option.emoji;
                                        generatedWithAi = false;
                                        aiConfidence = null;
                                        helperMessage = null;
                                      });
                                    },
                                    borderRadius: BorderRadius.circular(16),
                                    child: Container(
                                      width: 88,
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                                      decoration: BoxDecoration(
                                        color: selected
                                            ? const Color(0xFF6D28D9).withValues(alpha: 0.14)
                                            : colorScheme.surfaceContainerHigh,
                                        borderRadius: BorderRadius.circular(16),
                                        border: Border.all(
                                          color: selected
                                              ? const Color(0xFF6D28D9)
                                              : colorScheme.outlineVariant,
                                        ),
                                      ),
                                      child: Column(
                                        children: [
                                          Text(option.emoji, style: const TextStyle(fontSize: 26)),
                                          const SizedBox(height: 6),
                                          Text(
                                            option.label,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            textAlign: TextAlign.center,
                                            style: GoogleFonts.manrope(
                                              color: colorScheme.onSurface,
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                              const SizedBox(height: 16),
                              TextField(
                                controller: emojiSearchController,
                                onChanged: (value) {
                                  setSheetState(() => emojiSearchQuery = value);
                                },
                                decoration: InputDecoration(
                                  prefixIcon: const Icon(Icons.search_rounded),
                                  hintText: 'Buscar emoji por comida o negocio',
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'Emojis disponibles',
                                style: GoogleFonts.manrope(
                                  color: colorScheme.onSurface,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14.5,
                                ),
                              ),
                              const SizedBox(height: 10),
                              GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: filteredEmojiOptions.length,
                                gridDelegate:
                                    const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 4,
                                  mainAxisSpacing: 10,
                                  crossAxisSpacing: 10,
                                  childAspectRatio: 0.74,
                                ),
                                itemBuilder: (context, index) {
                                  final option = filteredEmojiOptions[index];
                                  final selected = option.emoji == selectedIconValue;
                                  return InkWell(
                                    onTap: () {
                                      setSheetState(() {
                                        selectedIconValue = option.emoji;
                                        generatedWithAi = false;
                                        aiConfidence = null;
                                        helperMessage = null;
                                      });
                                    },
                                    borderRadius: BorderRadius.circular(16),
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: selected
                                            ? const Color(0xFF6D28D9).withValues(alpha: 0.14)
                                            : colorScheme.surfaceContainerHigh,
                                        borderRadius: BorderRadius.circular(16),
                                        border: Border.all(
                                          color: selected
                                              ? const Color(0xFF6D28D9)
                                              : colorScheme.outlineVariant,
                                        ),
                                      ),
                                      padding: const EdgeInsets.all(10),
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            option.emoji,
                                            style: const TextStyle(fontSize: 26),
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            option.label,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            textAlign: TextAlign.center,
                                            style: GoogleFonts.manrope(
                                              color: colorScheme.onSurface,
                                              fontSize: 10.5,
                                              fontWeight: selected
                                                  ? FontWeight.w800
                                                  : FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                              if (filteredEmojiOptions.isEmpty) ...[
                                const SizedBox(height: 8),
                                Text(
                                  'No hay emojis para esa búsqueda. Prueba con comida, delivery, belleza o tecnología.',
                                  style: GoogleFonts.manrope(
                                    color: colorScheme.onSurfaceVariant,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      SafeArea(
                        top: false,
                        minimum: const EdgeInsets.only(top: 14, bottom: 2),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextButton(
                                onPressed: () {
                                  isSheetClosed = true;
                                  FocusManager.instance.primaryFocus?.unfocus();
                                  navigator.pop();
                                },
                                child: const Text('Cancelar'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: FilledButton(
                                onPressed: () {
                                  final draft = nameController.text.trim();
                                  if (draft.isEmpty) {
                                    setSheetState(() {
                                      helperMessage =
                                          'Escribe un nombre para guardar la categoría.';
                                    });
                                    return;
                                  }

                                  isSheetClosed = true;
                                  FocusManager.instance.primaryFocus?.unfocus();
                                  navigator.pop(
                                    _CategoryEditorResult(
                                      name: draft,
                                      iconValue: selectedIconValue,
                                      generatedWithAi: generatedWithAi,
                                      aiConfidence: aiConfidence,
                                    ),
                                  );
                                },
                                child: const Text('Guardar categoría'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    isSheetClosed = true;
    return result;
  }

  Future<void> _createCategory() async {
    if (_isMutating) return;
    final draft = await _showCategoryEditorSheet(title: 'Nueva categoría');
    if (!mounted || draft == null || draft.name.isEmpty) return;
    if (_currentCatalogoId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Catálogo inválido. No se puede crear categoría.'),
        ),
      );
      return;
    }

    setState(() => _isMutating = true);
    try {
      final maxOrder = _categories.isEmpty
          ? 0
          : _categories.map((c) => c.orden).reduce((a, b) => a > b ? a : b) + 1;

      await Supabase.instance.client.from('categorias').insert({
        'comercio_id': SupabaseConfig.currentComercioId,
        'catalogo_id': _currentCatalogoId,
        'nombre': draft.name,
        'icono': draft.iconValue,
        'creado_por_ia': draft.generatedWithAi,
        'confianza_ia': draft.aiConfidence,
        'orden': maxOrder,
        'activo': true,
      });

      await _loadCategories();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo crear categoría: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _editCategory(CategoryModel category) async {
    if (_isMutating) return;
    final draft = await _showCategoryEditorSheet(
      title: 'Editar categoría',
      category: category,
    );
    if (!mounted || draft == null || draft.name.isEmpty) {
      return;
    }

    final didChange = draft.name != category.nombre ||
    draft.iconValue != (_normalizeStoredIconValue(category.icono) ?? '') ||
        draft.generatedWithAi != (category.creadoPorIa == true) ||
        (draft.aiConfidence ?? -1) != (category.confianzaIa ?? -1);

    if (!didChange) {
      return;
    }

    setState(() => _isMutating = true);
    try {
      await Supabase.instance.client
          .from('categorias')
          .update({
            'nombre': draft.name,
            'icono': draft.iconValue,
            'creado_por_ia': draft.generatedWithAi,
            'confianza_ia': draft.aiConfidence,
          })
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', _currentCatalogoId)
          .eq('id', category.id);

      await _loadCategories();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo editar categoría: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  List<CategoryModel> get _filteredCategories {
    final query = _normalizedText(_searchQuery);
    if (query.isEmpty) return _categories;
    return _categories.where((category) {
      final productCount = (_productCountByCategory[category.id] ?? 0)
          .toString();
      return _normalizedText(category.nombre).contains(query) ||
          productCount.contains(query);
    }).toList();
  }

  Map<String, CategoryModel> get _categoryById {
    return {
      for (final category in _categories)
        _normalizedId(category.id): category,
    };
  }

  String _categoryNameFor(String categoryId) {
    return _categoryById[_normalizedId(categoryId)]?.nombre ?? 'Sin categoría';
  }

  bool _matchesProductQuery(ProductModel product) {
    final query = _normalizedText(_searchQuery);
    if (query.isEmpty) return true;
    return _normalizedText(product.nombre).contains(query) ||
        _normalizedText(product.descripcion).contains(query) ||
        _normalizedText(_categoryNameFor(product.categoriaId)).contains(query);
  }

  List<ProductModel> get _searchFilteredProducts {
    final query = _normalizedText(_searchQuery);
    if (query.isEmpty) return List<ProductModel>.from(_products);
    return _products.where(_matchesProductQuery).toList();
  }

  List<ProductModel> get _filteredProductsForCategoryTab {
    final products = _searchFilteredProducts;
    final selectedCategoryId = _normalizedId(_selectedProductCategoryId);
    if (selectedCategoryId.isEmpty) {
      return products;
    }
    return products
        .where(
          (product) => _normalizedId(product.categoriaId) == selectedCategoryId,
        )
        .toList();
  }

  List<ProductModel> get _hiddenProducts {
    return _searchFilteredProducts
        .where((product) => !product.disponible)
        .toList();
  }

  List<CategoryModel> get _hiddenCategories {
    return _filteredCategories.where((category) => !category.activo).toList();
  }

  Future<void> _openProductFormDirect({
    ProductModel? product,
    String? initialCategoryId,
  }) async {
    if (_categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Crea una categoría antes de agregar productos.'),
        ),
      );
      return;
    }

    final didSave = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          categories: _categories,
          product: product,
          initialCategoryId:
              product?.categoriaId ??
              initialCategoryId ??
              _selectedProductCategoryId ??
              _categories.first.id,
        ),
      ),
    );

    if (didSave == true) {
      await _loadCategories();
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _toggleProductVisible(ProductModel product, bool value) async {
    final previous = List<ProductModel>.from(_products);

    setState(() {
      _products = _products
          .map(
            (item) => item.id == product.id
                ? item.copyWith(disponible: value)
                : item,
          )
          .toList();
    });

    try {
      await Supabase.instance.client
          .from('productos')
          .update({'disponible': value})
          .eq('id', product.id);
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = previous);
      _showMessage('No se pudo actualizar visibilidad: $error');
    }
  }

  Future<void> _deleteProduct(ProductModel product) async {
    if (_isMutating) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Eliminar producto',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            '¿Eliminar "${product.nombre}"?',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
              ),
              child: const Text('Eliminar'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirm != true) return;

    final previous = List<ProductModel>.from(_products);
    setState(() {
      _products = _products.where((item) => item.id != product.id).toList();
      _productCountByCategory.update(
        product.categoriaId,
        (value) => value > 0 ? value - 1 : 0,
        ifAbsent: () => 0,
      );
    });

    try {
      final deletedRows = await Supabase.instance.client
          .from('productos')
          .delete()
          .eq('id', product.id)
          .select('id');

      if ((deletedRows as List<dynamic>).isEmpty) {
        throw Exception('No se pudo confirmar el borrado en la base de datos.');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _products = previous;
        final counts = <String, int>{};
        for (final item in previous) {
          counts.update(item.categoriaId, (value) => value + 1, ifAbsent: () => 1);
        }
        _productCountByCategory = counts;
      });
      _showMessage('No se pudo eliminar producto: $error');
    }
  }

  Future<bool?> _confirmAiImageGeneration(ProductModel product) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Generar imagen con IA',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            'Se descontará 1 crédito para generar la imagen de "${product.nombre}" y el proceso continuará en segundo plano. ¿Deseas continuar?',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.auto_awesome_rounded, size: 18),
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
              ),
              label: const Text('Generar'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _generateAiImageForProduct(ProductModel product) async {
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) {
      _showMessage('No hay comercio activo para generar la imagen IA.');
      return;
    }

    final confirmed = await _confirmAiImageGeneration(product);
    if (confirmed != true) {
      return;
    }

    setState(() {
      _products = _products
          .map(
            (item) => item.id == product.id
                ? item.copyWith(
                    aiImageStatus: 'pending',
                    clearAiImageErrorMessage: true,
                  )
                : item,
          )
          .toList();
    });
    _syncAiImageRefresh(_products);

    try {
      final response = await _aiImageService.enqueueProductImage(
        comercioId: comercioId,
        productId: product.id,
        productName: product.nombre,
        description: product.descripcion,
        categoryName: _categoryNameFor(product.categoriaId),
      );

      if (!mounted) return;
      final message = response['message']?.toString().trim();
      _showMessage(
        message?.isNotEmpty == true
            ? message!
            : 'Imagen IA en cola para ${product.nombre}.',
      );
      await _loadCategories();
    } catch (error) {
      if (!mounted) return;
      final friendlyMessage = _formatAiImageErrorMessage(
        error.toString().replaceFirst('Bad state: ', ''),
      );
      setState(() {
        _products = _products
            .map(
              (item) => item.id == product.id
                  ? item.copyWith(
                      aiImageStatus: 'failed',
                      aiImageErrorMessage: friendlyMessage,
                    )
                  : item,
            )
            .toList();
      });
      _showMessage(friendlyMessage);
    }
  }

  void _syncAiImageRefresh(List<ProductModel> products) {
    final hasPendingAiImages = products.any(
      (product) => product.hasAiImageInProgress,
    );
    if (!hasPendingAiImages) {
      _aiImageRefreshTimer?.cancel();
      _aiImageRefreshTimer = null;
      return;
    }

    _aiImageRefreshTimer ??= Timer.periodic(const Duration(seconds: 7), (_) {
      if (!mounted) {
        return;
      }
      unawaited(_loadCategories(showLoadingIndicator: false));
    });
  }

  Future<void> _toggleCategoryActive(CategoryModel category, bool value) async {
    final previous = List<CategoryModel>.from(_categories);

    setState(() {
      _categories = _categories
          .map(
            (item) => item.id == category.id
                ? CategoryModel(
                    id: item.id,
                    comercioId: item.comercioId,
                    catalogoId: item.catalogoId,
                    nombre: item.nombre,
                    orden: item.orden,
                    activo: value,
                    icono: item.icono,
                    creadoPorIa: item.creadoPorIa,
                    confianzaIa: item.confianzaIa,
                  )
                : item,
          )
          .toList();
    });

    try {
      await Supabase.instance.client
          .from('categorias')
          .update({'activo': value})
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', _currentCatalogoId)
          .eq('id', category.id);
    } catch (error) {
      if (!mounted) return;
      setState(() => _categories = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo actualizar visibilidad: $error')),
      );
    }
  }

  Future<void> _onCategoryReorder(int oldIndex, int newIndex) async {
    if (_isSavingCategoryOrder || _isMutating) return;

    final originalList = List<CategoryModel>.from(_categories);
    final updated = List<CategoryModel>.from(_categories);

    if (newIndex > oldIndex) newIndex -= 1;
    final item = updated.removeAt(oldIndex);
    updated.insert(newIndex, item);

    setState(() {
      _categories = updated;
      _isSavingCategoryOrder = true;
    });

    try {
      for (var index = 0; index < updated.length; index++) {
        final row = updated[index];
        await Supabase.instance.client
            .from('categorias')
            .update({'orden': index})
            .eq('comercio_id', SupabaseConfig.currentComercioId)
            .eq('catalogo_id', _currentCatalogoId)
            .eq('id', row.id);
      }

      if (!mounted) return;
      setState(() {
        _categories = updated
            .asMap()
            .entries
            .map(
              (entry) => CategoryModel(
                id: entry.value.id,
                comercioId: entry.value.comercioId,
                catalogoId: entry.value.catalogoId,
                nombre: entry.value.nombre,
                orden: entry.key,
                activo: entry.value.activo,
                icono: entry.value.icono,
                creadoPorIa: entry.value.creadoPorIa,
                confianzaIa: entry.value.confianzaIa,
              ),
            )
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _categories = originalList);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el nuevo orden: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSavingCategoryOrder = false);
      }
    }
  }

  Future<void> _deleteCategory(CategoryModel category) async {
    if (_isMutating) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Eliminar categoría',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            '¿Eliminar "${category.nombre}"?',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: colorScheme.primary,
                foregroundColor: colorScheme.onPrimary,
              ),
              child: const Text('Eliminar'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirm != true) return;

    final previous = List<CategoryModel>.from(_categories);
    setState(() => _isMutating = true);
    setState(() {
      _categories = _categories
          .where((item) => item.id != category.id)
          .toList();
    });

    try {
      final deletedRows = await Supabase.instance.client
          .from('categorias')
          .delete()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', _currentCatalogoId)
          .eq('id', category.id)
          .select('id');

      final deletedCount = (deletedRows as List<dynamic>).length;
      if (deletedCount == 0) {
        throw Exception('No se pudo confirmar el borrado en la base de datos.');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _categories = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar categoría: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _openProducts(CategoryModel category) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            ProductListScreen(category: category, allCategories: _categories),
      ),
    );

    await _loadCategories();
  }

  void _toggleAppBarSearch() {
    if (!mounted) return;
    if (_showAppBarSearch) {
      _searchController.clear();
      setState(() {
        _showAppBarSearch = false;
        _searchQuery = '';
      });
      return;
    }

    setState(() => _showAppBarSearch = true);
  }

  Future<void> _openAiMenuGenerator() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MagicOnboardingScreen()),
    );
  }

  String _formatAiImageErrorMessage(String? rawMessage) {
    final message = (rawMessage ?? '').trim();
    if (message.isEmpty) {
      return 'No se pudo generar la imagen IA.';
    }

    final normalized = message.toLowerCase();

    if (normalized.contains('resource_exhausted') ||
        normalized.contains('prepayment credits are depleted') ||
        normalized.contains('gemini image generation failed (429)')) {
      return 'Google Gemini no tiene saldo disponible en este momento. Recarga créditos del proyecto e inténtalo de nuevo.';
    }

    if (normalized.contains('not enough credits')) {
      return 'Este comercio no tiene créditos IA suficientes para generar la imagen.';
    }

    if (normalized.contains('unauthorized request') ||
        normalized.contains('worker secret')) {
      return 'El servicio interno de imágenes IA no está disponible ahora mismo.';
    }

    if (normalized.contains('producto no encontrado')) {
      return 'No se encontró el producto para generar su imagen IA.';
    }

    if (normalized.contains('ya tiene una imagen manual')) {
      return 'Este producto ya tiene una imagen manual.';
    }

    final firstLine = message.split('\n').first.trim();
    return firstLine.isEmpty ? 'No se pudo generar la imagen IA.' : firstLine;
  }

  String _normalizedId(String? value) {
    return value?.trim() ?? '';
  }

  String _normalizedText(String? value) {
    return value?.trim().toLowerCase() ?? '';
  }

  Future<void> _openQuickCreateSheet() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        final colorScheme = Theme.of(context).colorScheme;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.category_rounded),
                title: const Text('Nueva categoría'),
                subtitle: const Text('Crea una sección nueva en tu menú'),
                onTap: () => Navigator.of(context).pop('category'),
              ),
              ListTile(
                leading: Icon(Icons.inventory_2_rounded, color: colorScheme.primary),
                title: const Text('Nuevo producto'),
                subtitle: const Text('Agrega un producto sin entrar a la categoría'),
                onTap: () => Navigator.of(context).pop('product'),
              ),
            ],
          ),
        );
      },
    );

    if (!mounted) return;
    switch (action) {
      case 'category':
        await _createCategory();
        break;
      case 'product':
        await _openProductFormDirect();
        break;
      default:
        break;
    }
  }

  Widget _buildDesktopPrimaryAction() {
    final disabled = _loading || _isMutating;
    switch (_selectedTabIndex) {
      case 1:
        return FilledButton.icon(
          onPressed: disabled ? null : _createCategory,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Crear categoría'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF6D28D9),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          ),
        );
      case 2:
        return FilledButton.icon(
          onPressed: disabled ? null : _openProductFormDirect,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Crear producto'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF6D28D9),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          ),
        );
      default:
        return FilledButton.icon(
          onPressed: disabled ? null : _openQuickCreateSheet,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Crear'),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF6D28D9),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          ),
        );
    }
  }

  Widget _buildContextualFab() {
    switch (_selectedTabIndex) {
      case 1:
        return FloatingActionButton.extended(
          onPressed: (_loading || _isMutating) ? null : _createCategory,
          backgroundColor: const Color(0xFF6D28D9),
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add),
          label: const Text('Nueva categoría'),
        );
      case 2:
        return FloatingActionButton.extended(
          onPressed: (_loading || _isMutating) ? null : _openProductFormDirect,
          backgroundColor: const Color(0xFF6D28D9),
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add),
          label: const Text('Nuevo producto'),
        );
      default:
        return FloatingActionButton.extended(
          onPressed: (_loading || _isMutating) ? null : _openQuickCreateSheet,
          backgroundColor: const Color(0xFF6D28D9),
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add),
          label: const Text('Crear'),
        );
    }
  }

  List<Widget> _buildCurrentTabSections() {
    final useAdminTable = MediaQuery.sizeOf(context).width >= 1024;

    switch (_selectedTabIndex) {
      case 0:
        return _buildAllTabSections(useAdminTable: useAdminTable);
      case 1:
        return _buildCategoriesTabSections(useAdminTable: useAdminTable);
      case 2:
        return _buildProductsTabSections();
      case 3:
        return _buildHiddenTabSections(useAdminTable: useAdminTable);
      default:
        return _buildAllTabSections(useAdminTable: useAdminTable);
    }
  }

  Widget _buildCategoriesPresentation({
    required List<CategoryModel> categories,
    required bool useAdminTable,
    required bool enabled,
    bool reorderable = false,
    void Function(int oldIndex, int newIndex)? onReorder,
  }) {
    if (!useAdminTable) {
      if (reorderable && onReorder != null) {
        return ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: categories.length,
          onReorder: onReorder,
          itemBuilder: (context, index) {
            final category = categories[index];
            return _CategoryCard(
              key: ValueKey('category-${category.id}'),
              category: category,
              enabled: enabled,
              productCount: _productCountByCategory[category.id] ?? 0,
              onOpen: () => _openProducts(category),
              onEdit: () => _editCategory(category),
              onDelete: () => _deleteCategory(category),
              onToggleActive: (value) => _toggleCategoryActive(category, value),
              dragHandle: ReorderableDelayedDragStartListener(
                index: index,
                child: Icon(
                  Icons.drag_indicator_rounded,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            );
          },
        );
      }

      return Column(
        children: categories
            .map(
              (category) => _CategoryCard(
                key: ValueKey('category-${category.id}'),
                category: category,
                enabled: enabled,
                productCount: _productCountByCategory[category.id] ?? 0,
                onOpen: () => _openProducts(category),
                onEdit: () => _editCategory(category),
                onDelete: () => _deleteCategory(category),
                onToggleActive: (value) => _toggleCategoryActive(category, value),
              ),
            )
            .toList(),
      );
    }

    return _CategoryAdminTable(
      categories: categories,
      enabled: enabled,
      productCountFor: (id) => _productCountByCategory[id] ?? 0,
      onOpen: _openProducts,
      onEdit: _editCategory,
      onDelete: _deleteCategory,
      onToggleActive: _toggleCategoryActive,
      reorderable: reorderable && onReorder != null,
      onReorder: onReorder,
      isSavingOrder: _isSavingCategoryOrder,
    );
  }

  List<Widget> _buildAllTabSections({required bool useAdminTable}) {
    final featuredCategories = _filteredCategories.take(3).toList();
    final featuredProducts = _searchFilteredProducts.take(6).toList();
    final isDesktop = MediaQuery.sizeOf(context).width >= 1024;

    return [
      _DashboardSectionHeader(
        title: 'Atajos del vendedor',
        subtitle: 'Gestiona categorías y productos sin cambiar de pantalla.',
      ),
      const SizedBox(height: 10),
      Row(
        children: [
          Expanded(
            child: _QuickActionCard(
              icon: Icons.category_rounded,
              title: 'Nueva categoría',
              subtitle: 'Organiza tu menú',
              onTap: _createCategory,
              compact: isDesktop,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _QuickActionCard(
              icon: Icons.inventory_2_rounded,
              title: 'Nuevo producto',
              subtitle: 'Vende más rápido',
              onTap: _openProductFormDirect,
              compact: isDesktop,
            ),
          ),
        ],
      ),
      const SizedBox(height: 18),
      _DashboardSectionHeader(
        title: 'Categorías principales',
        subtitle: 'Edita o entra a las categorías más relevantes.',
      ),
      const SizedBox(height: 10),
      if (featuredCategories.isEmpty)
        _EmptyMenuState(
          icon: Icons.category_outlined,
          title: 'No hay categorías para mostrar',
          subtitle: 'Crea una categoría para empezar a construir tu menú.',
          actionLabel: 'Crear categoría',
          onAction: _createCategory,
        )
      else
        _buildCategoriesPresentation(
          categories: featuredCategories,
          useAdminTable: useAdminTable,
          enabled: !_isMutating,
        ),
      const SizedBox(height: 6),
      _DashboardSectionHeader(
        title: 'Productos del menú',
        subtitle: 'Edita, oculta o mejora imágenes sin entrar a la categoría.',
      ),
      const SizedBox(height: 10),
      if (featuredProducts.isEmpty)
        _EmptyMenuState(
          icon: Icons.inventory_2_outlined,
          title: 'No hay productos que coincidan con tu búsqueda',
          subtitle: 'Prueba otro término o crea un producto nuevo.',
          actionLabel: 'Nuevo producto',
          onAction: _openProductFormDirect,
        )
      else
        ...featuredProducts.map(_buildProductCard),
    ];
  }

  List<Widget> _buildCategoriesTabSections({required bool useAdminTable}) {
    final filtered = _filteredCategories;
    if (filtered.isEmpty) {
      return [
        _EmptyMenuState(
          icon: Icons.category_outlined,
          title: 'No hay categorías en este menú',
          subtitle: 'Crea tu primera categoría para empezar a cargar productos.',
          actionLabel: 'Crear primera categoría',
          onAction: _isMutating ? null : _createCategory,
        ),
      ];
    }

    final canReorder = _searchQuery.trim().isEmpty;
    final reorderHint = useAdminTable
        ? (canReorder
            ? 'Arrastra el ícono para cambiar el orden de las categorías.'
            : 'Desactiva la búsqueda para reordenar categorías.')
        : (canReorder
            ? (_isSavingCategoryOrder
                ? 'Guardando nuevo orden...'
                : 'Arrastra las categorías para cambiar su orden.')
            : 'Desactiva la búsqueda para reordenar categorías.');

    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          reorderHint,
          style: GoogleFonts.manrope(
            color: const Color(0xFF6B7280),
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      _buildCategoriesPresentation(
        categories: canReorder ? _categories : filtered,
        useAdminTable: useAdminTable,
        enabled: !_isMutating && !_isSavingCategoryOrder,
        reorderable: canReorder,
        onReorder: canReorder ? _onCategoryReorder : null,
      ),
    ];
  }

  List<Widget> _buildProductsTabSections() {
    final products = _filteredProductsForCategoryTab;
    return [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                selected: _selectedProductCategoryId == null,
                showCheckmark: false,
                label: const Text('Todas'),
                onSelected: (_) => setState(() => _selectedProductCategoryId = null),
              ),
            ),
            ..._categories.map(
              (category) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  selected: _selectedProductCategoryId == category.id,
                  showCheckmark: false,
                  label: Text(category.nombre),
                  onSelected: (_) =>
                      setState(() => _selectedProductCategoryId = category.id),
                ),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      if (products.isEmpty)
        _EmptyMenuState(
          icon: Icons.inventory_2_outlined,
          title: 'No hay productos para mostrar',
          subtitle: 'Prueba otra categoría o crea un producto nuevo.',
          actionLabel: 'Nuevo producto',
          onAction: _openProductFormDirect,
        )
      else
        ...products.map(_buildProductCard),
    ];
  }

  List<Widget> _buildHiddenTabSections({required bool useAdminTable}) {
    final hiddenCategories = _hiddenCategories;
    final hiddenProducts = _hiddenProducts;

    if (hiddenCategories.isEmpty && hiddenProducts.isEmpty) {
      return [
        _EmptyMenuState(
          icon: Icons.visibility_rounded,
          title: 'No hay elementos ocultos',
          subtitle: 'Aquí verás categorías y productos ocultos para reactivarlos rápido.',
          actionLabel: 'Ir a productos',
          onAction: () => setState(() => _selectedTabIndex = 2),
        ),
      ];
    }

    return [
      if (hiddenCategories.isNotEmpty) ...[
        _DashboardSectionHeader(
          title: 'Categorías ocultas',
          subtitle: 'Actívalas de nuevo o edítalas sin salir del dashboard.',
        ),
        const SizedBox(height: 10),
        _buildCategoriesPresentation(
          categories: hiddenCategories,
          useAdminTable: useAdminTable,
          enabled: !_isMutating,
        ),
        const SizedBox(height: 6),
      ],
      if (hiddenProducts.isNotEmpty) ...[
        _DashboardSectionHeader(
          title: 'Productos ocultos',
          subtitle: 'Vuélvelos a mostrar, edítalos o elimínalos desde aquí.',
        ),
        const SizedBox(height: 10),
        ...hiddenProducts.map(_buildProductCard),
      ],
    ];
  }

  Widget _buildProductCard(ProductModel product) {
    return _DashboardProductCard(
      key: ValueKey('dashboard-product-${product.id}'),
      product: product,
      categoryName: _categoryNameFor(product.categoriaId),
      onEdit: () => _openProductFormDirect(product: product),
      onToggleVisible: () => _toggleProductVisible(product, !product.disponible),
      onImproveImage: () => _generateAiImageForProduct(product),
      onDelete: () => _deleteProduct(product),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final totalProducts = _productCountByCategory.values.fold<int>(
      0,
      (sum, count) => sum + count,
    );
    final activeCategories = _categories.where((item) => item.activo).length;
    final headerScale = (1 - (_headerCollapse * 0.2)).clamp(0.82, 1.0);
    final headerOpacity = (1 - (_headerCollapse * 1.45)).clamp(0.0, 1.0);
    final headerHeightFactor = (1 - (_headerCollapse * 1.4)).clamp(0.0, 1.0);
    final showInitialLoading =
        _loading && !_hasLoadedInitialSnapshot && _categories.isEmpty;

    if (showInitialLoading) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

    final screenWidth = MediaQuery.sizeOf(context).width;
    final isDesktopLayout = screenWidth >= 1024;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FB),
      appBar: AppBar(
        backgroundColor: colorScheme.surfaceContainerHighest,
        foregroundColor: colorScheme.onSurface,
        titleTextStyle: GoogleFonts.manrope(
          color: colorScheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
        title: (!isDesktopLayout && _showAppBarSearch)
            ? TextField(
                controller: _searchController,
                autofocus: true,
                onChanged: (value) {
                  if (!mounted) return;
                  setState(() => _searchQuery = value);
                },
                style: TextStyle(color: colorScheme.onSurface),
                cursorColor: colorScheme.primary,
                decoration: InputDecoration(
                  hintText: 'Buscar categorías y productos...',
                  hintStyle: TextStyle(
                    color: colorScheme.onSurfaceVariant.withValues(alpha: 0.8),
                  ),
                  border: InputBorder.none,
                  isDense: true,
                ),
              )
            : Text(
                widget.catalog.nombre,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
        actions: [
          if (isDesktopLayout) ...[
            _buildDesktopPrimaryAction(),
            const SizedBox(width: 8),
          ] else
            IconButton(
              onPressed: _toggleAppBarSearch,
              icon: Icon(
                _showAppBarSearch ? Icons.close_rounded : Icons.search_rounded,
              ),
              tooltip: _showAppBarSearch ? 'Cerrar búsqueda' : 'Buscar en el menú',
            ),
        ],
      ),
      floatingActionButton: isDesktopLayout ? null : _buildContextualFab(),
      body: RefreshIndicator(
        onRefresh: _loadCategories,
        color: colorScheme.primary,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final viewportWidth = constraints.maxWidth;
            final isDesktop = viewportWidth >= 1024;
            final contentMaxWidth =
                viewportWidth >= 1200 ? 1280.0 : double.infinity;
            final horizontalPadding = viewportWidth >= 1200
                ? 28.0
                : (viewportWidth >= 720 ? 24.0 : 16.0);

            final list = ListView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(horizontalPadding, 12, horizontalPadding, 120),
              children: [
                ClipRect(
                  child: Align(
                    alignment: Alignment.topCenter,
                    heightFactor: headerHeightFactor,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 140),
                      opacity: headerOpacity,
                      child: Transform.scale(
                        scale: headerScale,
                        alignment: Alignment.topCenter,
                        child: Container(
                          padding: EdgeInsets.all(isDesktop ? 20 : 16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x0D000000),
                                blurRadius: 10,
                                offset: Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (isDesktop)
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Row(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          CircleAvatar(
                                            radius: 24,
                                            backgroundColor: const Color(0xFF6D28D9)
                                                .withValues(alpha: 0.1),
                                            child: const Icon(
                                              Icons.restaurant_menu,
                                              color: Color(0xFF6D28D9),
                                            ),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'Estructura del menú',
                                                  style: GoogleFonts.manrope(
                                                    fontSize: 16,
                                                    fontWeight: FontWeight.w700,
                                                    color: const Color(0xFF1F2555),
                                                  ),
                                                ),
                                                const SizedBox(height: 6),
                                                Text(
                                                  'Administra categorías y productos desde un solo dashboard para reducir clicks del vendedor.',
                                                  style: GoogleFonts.manrope(
                                                    color: const Color(0xFF6B7280),
                                                    fontSize: 13.5,
                                                    fontWeight: FontWeight.w500,
                                                    height: 1.45,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 16),
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(
                                        minWidth: 220,
                                        maxWidth: 280,
                                      ),
                                      child: _AiGeneratorButton(onTap: _openAiMenuGenerator),
                                    ),
                                  ],
                                )
                              else ...[
                                Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 24,
                                      backgroundColor: const Color(0xFF6D28D9)
                                          .withValues(alpha: 0.1),
                                      child: const Icon(
                                        Icons.restaurant_menu,
                                        color: Color(0xFF6D28D9),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        'Estructura del menú',
                                        style: GoogleFonts.manrope(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                          color: const Color(0xFF1F2555),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Administra categorías y productos desde un solo dashboard para reducir clicks del vendedor.',
                                  style: GoogleFonts.manrope(
                                    color: const Color(0xFF6B7280),
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w500,
                                    height: 1.45,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                _AiGeneratorButton(onTap: _openAiMenuGenerator),
                              ],
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: _StatChip(
                                      label: 'Categorías',
                                      value: '${_categories.length}',
                                      icon: Icons.folder_rounded,
                                      tint: const Color(0xFF7C3AED),
                                      compact: isDesktop,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _StatChip(
                                      label: 'Activas',
                                      value: '$activeCategories',
                                      icon: Icons.check_circle_rounded,
                                      tint: const Color(0xFF16A34A),
                                      compact: isDesktop,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _StatChip(
                                      label: 'Productos',
                                      value: '$totalProducts',
                                      icon: Icons.inventory_2_rounded,
                                      tint: const Color(0xFF3B82F6),
                                      compact: isDesktop,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                if (isDesktop)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      IntrinsicWidth(
                        child: _SegmentTabsContainer(
                          selectedTabIndex: _selectedTabIndex,
                          onSelected: (index) {
                            if (!mounted) return;
                            setState(() => _selectedTabIndex = index);
                          },
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextField(
                          controller: _searchController,
                          onChanged: (value) {
                            if (!mounted) return;
                            setState(() => _searchQuery = value);
                          },
                          style: GoogleFonts.manrope(
                            color: const Color(0xFF1F2555),
                            fontSize: 14,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Buscar categorías y productos...',
                            hintStyle: GoogleFonts.manrope(
                              color: const Color(0xFF9CA3AF),
                              fontSize: 14,
                            ),
                            prefixIcon: const Icon(
                              Icons.search_rounded,
                              color: Color(0xFF6B7280),
                            ),
                            suffixIcon: _searchQuery.trim().isEmpty
                                ? null
                                : IconButton(
                                    onPressed: () {
                                      if (!mounted) return;
                                      _searchController.clear();
                                      setState(() => _searchQuery = '');
                                    },
                                    icon: const Icon(Icons.close_rounded),
                                    tooltip: 'Limpiar búsqueda',
                                  ),
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0xFFEAE7F2),
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0xFFEAE7F2),
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                color: Color(0xFF6D28D9),
                                width: 1.4,
                              ),
                            ),
                            isDense: true,
                          ),
                        ),
                      ),
                    ],
                  )
                else
                  _SegmentTabsContainer(
                    selectedTabIndex: _selectedTabIndex,
                    onSelected: (index) {
                      if (!mounted) return;
                      setState(() => _selectedTabIndex = index);
                    },
                  ),
                const SizedBox(height: 14),
                ..._buildCurrentTabSections(),
              ],
            );

            return SafeArea(
              top: false,
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: contentMaxWidth),
                  child: list,
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _CategoryAdminTable extends StatelessWidget {
  const _CategoryAdminTable({
    required this.categories,
    required this.enabled,
    required this.productCountFor,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleActive,
    this.reorderable = false,
    this.onReorder,
    this.isSavingOrder = false,
  });

  final List<CategoryModel> categories;
  final bool enabled;
  final int Function(String categoryId) productCountFor;
  final void Function(CategoryModel category) onOpen;
  final void Function(CategoryModel category) onEdit;
  final void Function(CategoryModel category) onDelete;
  final void Function(CategoryModel category, bool value) onToggleActive;
  final bool reorderable;
  final void Function(int oldIndex, int newIndex)? onReorder;
  final bool isSavingOrder;

  @override
  Widget build(BuildContext context) {
    final rowEnabled = enabled && !isSavingOrder;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEAE7F2)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CategoryTableHeader(showDragColumn: reorderable),
          if (reorderable && onReorder != null)
            ReorderableListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              buildDefaultDragHandles: false,
              itemCount: categories.length,
              onReorder: onReorder!,
              itemBuilder: (context, index) {
                final category = categories[index];
                return _CategoryTableRow(
                  key: ValueKey('category-row-${category.id}'),
                  category: category,
                  productCount: productCountFor(category.id),
                  enabled: rowEnabled,
                  onOpen: () => onOpen(category),
                  onEdit: () => onEdit(category),
                  onDelete: () => onDelete(category),
                  onToggleActive: (value) => onToggleActive(category, value),
                  dragHandle: ReorderableDelayedDragStartListener(
                    index: index,
                    child: const Icon(
                      Icons.drag_indicator_rounded,
                      color: Color(0xFF9CA3AF),
                      size: 20,
                    ),
                  ),
                );
              },
            )
          else
            ...categories.map(
              (category) => _CategoryTableRow(
                key: ValueKey('category-row-${category.id}'),
                category: category,
                productCount: productCountFor(category.id),
                enabled: rowEnabled,
                onOpen: () => onOpen(category),
                onEdit: () => onEdit(category),
                onDelete: () => onDelete(category),
                onToggleActive: (value) => onToggleActive(category, value),
              ),
            ),
        ],
      ),
    );
  }
}

class _CategoryTableHeader extends StatelessWidget {
  const _CategoryTableHeader({this.showDragColumn = false});

  final bool showDragColumn;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: Color(0xFFF8F7FB),
        border: Border(
          bottom: BorderSide(color: Color(0xFFEAE7F2)),
        ),
      ),
      child: Row(
        children: [
          if (showDragColumn) const SizedBox(width: 28),
          const Expanded(
            flex: 5,
            child: Text(
              'Categoría',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(
            width: 72,
            child: Text(
              'Productos',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(
            width: 88,
            child: Text(
              'Estado',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(
            width: 72,
            child: Text(
              'Visible',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
          const Expanded(
            flex: 4,
            child: Text(
              'Acciones',
              textAlign: TextAlign.end,
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryTableRow extends StatelessWidget {
  const _CategoryTableRow({
    super.key,
    required this.category,
    required this.productCount,
    required this.enabled,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleActive,
    this.dragHandle,
  });

  final CategoryModel category;
  final int productCount;
  final bool enabled;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleActive;
  final Widget? dragHandle;

  @override
  Widget build(BuildContext context) {
    final statusColor =
        category.activo ? const Color(0xFF16A34A) : const Color(0xFFEF4444);

    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: enabled ? onOpen : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Color(0xFFF1F2F6)),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (dragHandle != null) ...[
                dragHandle!,
                const SizedBox(width: 8),
              ],
              Expanded(
                flex: 5,
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFF6D28D9).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: _buildCategoryIconVisual(
                          iconValue: category.icono,
                          name: category.nombre,
                          size: 20,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            category.nombre,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: const Color(0xFF1F2555),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 72,
                child: Text(
                  '$productCount',
                  style: GoogleFonts.manrope(
                    color: const Color(0xFF1F2555),
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
              SizedBox(
                width: 88,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    category.activo ? 'Activa' : 'Oculta',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.manrope(
                      color: statusColor,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              SizedBox(
                width: 72,
                child: Center(
                  child: Switch.adaptive(
                    value: category.activo,
                    onChanged: enabled ? onToggleActive : null,
                    activeTrackColor: const Color(0xFF6D28D9),
                    activeThumbColor: Colors.white,
                  ),
                ),
              ),
              Expanded(
                flex: 4,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    alignment: WrapAlignment.end,
                    children: [
                      _CategoryTableAction(
                        icon: Icons.visibility_outlined,
                        label: 'Ver',
                        onTap: enabled ? onOpen : null,
                      ),
                      _CategoryTableAction(
                        icon: Icons.edit_outlined,
                        label: 'Editar',
                        onTap: enabled ? onEdit : null,
                      ),
                      _CategoryTableAction(
                        icon: Icons.delete_outline,
                        label: 'Eliminar',
                        onTap: enabled ? onDelete : null,
                        isDanger: true,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryTableAction extends StatelessWidget {
  const _CategoryTableAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isDanger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool isDanger;

  @override
  Widget build(BuildContext context) {
    final color = isDanger
        ? const Color(0xFFDC2626)
        : const Color(0xFF4B5563);
    return TextButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 15, color: color),
      label: Text(
        label,
        style: GoogleFonts.manrope(
          color: color,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 32),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    super.key,
    required this.category,
    required this.enabled,
    required this.productCount,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleActive,
    this.dragHandle,
    this.useOuterMargin = true,
  });

  final CategoryModel category;
  final bool enabled;
  final int productCount;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleActive;
  final Widget? dragHandle;
  final bool useOuterMargin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: useOuterMargin ? const EdgeInsets.only(bottom: 16) : null,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFF6D28D9).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: _buildCategoryIconVisual(
                    iconValue: category.icono,
                    name: category.nombre,
                    size: 24,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      category.nombre,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w700,
                        fontSize: 15.5,
                        color: const Color(0xFF1F2555),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$productCount producto${productCount == 1 ? '' : 's'}',
                      style: GoogleFonts.manrope(
                        color: const Color(0xFF6B7280),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: (category.activo
                                ? const Color(0xFF16A34A)
                                : const Color(0xFFEF4444))
                            .withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        category.activo ? 'Activa' : 'Oculta',
                        style: GoogleFonts.manrope(
                          color: category.activo
                              ? const Color(0xFF16A34A)
                              : const Color(0xFFEF4444),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                children: [
                  if (dragHandle != null) ...[
                    dragHandle!,
                    const SizedBox(height: 4),
                  ],
                  Switch.adaptive(
                    value: category.activo,
                    onChanged: enabled ? onToggleActive : null,
                    activeTrackColor: const Color(0xFF6D28D9),
                    activeThumbColor: Colors.white,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _CategoryActionButton(
                  icon: Icons.visibility,
                  label: 'Ver',
                  onTap: enabled ? onOpen : null,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _CategoryActionButton(
                  icon: Icons.edit,
                  label: 'Editar',
                  onTap: enabled ? onEdit : null,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _CategoryActionButton(
                  icon: Icons.delete,
                  label: 'Eliminar',
                  onTap: enabled ? onDelete : null,
                  isDanger: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    this.compact = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final iconBox = Container(
      width: compact ? 24 : 28,
      height: compact ? 24 : 28,
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, size: compact ? 14 : 16, color: tint),
    );

    final valueText = Text(
      value,
      style: GoogleFonts.manrope(
        color: const Color(0xFF1F2555),
        fontWeight: FontWeight.w800,
        fontSize: compact ? 14 : 15,
      ),
    );

    final labelText = Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: GoogleFonts.manrope(
        color: const Color(0xFF6B7280),
        fontSize: compact ? 11 : 11.5,
        fontWeight: FontWeight.w600,
      ),
    );

    return Container(
      constraints: BoxConstraints(minHeight: compact ? 72 : 84),
      padding: EdgeInsets.symmetric(
        horizontal: 12,
        vertical: compact ? 10 : 12,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEAE7F2)),
      ),
      child: compact
          ? Row(
              children: [
                iconBox,
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      valueText,
                      labelText,
                    ],
                  ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                iconBox,
                const SizedBox(height: 10),
                valueText,
                const SizedBox(height: 2),
                labelText,
              ],
            ),
    );
  }
}

class _CategoryActionButton extends StatelessWidget {
  const _CategoryActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isDanger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool isDanger;

  @override
  Widget build(BuildContext context) {
    final iconColor = isDanger
        ? const Color(0xFFDC2626)
        : const Color(0xFF6B7280);
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 16, color: iconColor),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: isDanger
            ? const Color(0xFFDC2626)
            : const Color(0xFF111827),
        side: BorderSide(color: const Color(0xFFD1D5DB).withValues(alpha: 0.6)),
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: GoogleFonts.manrope(
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
    );
  }
}

class _DashboardSectionHeader extends StatelessWidget {
  const _DashboardSectionHeader({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GoogleFonts.manrope(
            color: const Color(0xFF1F2555),
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: GoogleFonts.manrope(
            color: const Color(0xFF6B7280),
            fontWeight: FontWeight.w500,
            fontSize: 12.5,
          ),
        ),
      ],
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        constraints: BoxConstraints(minHeight: compact ? 80 : 0),
        padding: EdgeInsets.symmetric(
          horizontal: 14,
          vertical: compact ? 12 : 14,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0D000000),
              blurRadius: 10,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: compact
            ? Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFF6D28D9).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: const Color(0xFF6D28D9)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: GoogleFonts.manrope(
                            color: const Color(0xFF1F2555),
                            fontWeight: FontWeight.w800,
                            fontSize: 14.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          subtitle,
                          style: GoogleFonts.manrope(
                            color: const Color(0xFF6B7280),
                            fontWeight: FontWeight.w500,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: const Color(0xFF6D28D9).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: const Color(0xFF6D28D9)),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    style: GoogleFonts.manrope(
                      color: const Color(0xFF1F2555),
                      fontWeight: FontWeight.w800,
                      fontSize: 14.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: GoogleFonts.manrope(
                      color: const Color(0xFF6B7280),
                      fontWeight: FontWeight.w500,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _AiGeneratorButton extends StatelessWidget {
  const _AiGeneratorButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: const LinearGradient(
            colors: [
              Color(0xFF6D28D9),
              Color(0xFF9333EA),
            ],
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x296D28D9),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            const Icon(Icons.auto_awesome, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Generar menú con IA',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.manrope(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
            const Icon(
              Icons.arrow_forward_ios,
              size: 16,
              color: Colors.white,
            ),
          ],
        ),
      ),
    );
  }
}

class _SegmentTabsContainer extends StatelessWidget {
  const _SegmentTabsContainer({
    required this.selectedTabIndex,
    required this.onSelected,
  });

  final int selectedTabIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF1ECFB),
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A1F2555),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: _DashboardTopTabs(
          selectedIndex: selectedTabIndex,
          tabs: const ['Todos', 'Categorías', 'Productos', 'Ocultos'],
          onSelected: onSelected,
        ),
      ),
    );
  }
}

class _DashboardTopTabs extends StatelessWidget {
  const _DashboardTopTabs({
    required this.tabs,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<String> tabs;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 380;
        final tabMinWidth = compact ? 88.0 : 104.0;

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (var index = 0; index < tabs.length; index++) ...[
                ConstrainedBox(
                  constraints: BoxConstraints(minWidth: tabMinWidth),
                  child: _DashboardTopTabItem(
                    label: tabs[index],
                    isSelected: selectedIndex == index,
                    compact: compact,
                    onTap: () => onSelected(index),
                  ),
                ),
                if (index != tabs.length - 1) const SizedBox(width: 8),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DashboardTopTabItem extends StatelessWidget {
  const _DashboardTopTabItem({
    required this.label,
    required this.isSelected,
    required this.compact,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: isSelected ? Colors.white : Colors.transparent,
        boxShadow: isSelected
            ? const [
                BoxShadow(
                  color: Color(0x141F2555),
                  blurRadius: 12,
                  offset: Offset(0, 4),
                ),
              ]
            : const [],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 14 : 18,
              vertical: compact ? 12 : 13,
            ),
            child: Center(
              child: AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                style: GoogleFonts.manrope(
                  fontSize: compact ? 12 : 12.5,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w700,
                  color: isSelected
                      ? const Color(0xFF1F2555)
                      : const Color(0xFF6B7280),
                  letterSpacing: 0,
                ),
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DashboardProductCard extends StatelessWidget {
  const _DashboardProductCard({
    super.key,
    required this.product,
    required this.categoryName,
    required this.onEdit,
    required this.onToggleVisible,
    required this.onImproveImage,
    required this.onDelete,
  });

  final ProductModel product;
  final String categoryName;
  final VoidCallback onEdit;
  final VoidCallback onToggleVisible;
  final VoidCallback onImproveImage;
  final VoidCallback onDelete;

  Color _statusColor() {
    if (product.hasAiImageFailure) return const Color(0xFFDC2626);
    if (product.hasAiImageInProgress) return const Color(0xFF7C3AED);
    if (product.isAiGeneratedImage) return const Color(0xFF2563EB);
    return const Color(0xFF6B7280);
  }

  String _statusLabel() {
    if (product.hasAiImageInProgress) return 'Generando imagen...';
    if (product.hasAiImageFailure) return 'Error al generar imagen';
    if (product.isAiGeneratedImage) return 'IA';
    return 'Manual';
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor();

    Widget thumb() {
      final imageUrl = product.imagenUrl?.trim();
      if (imageUrl != null && imageUrl.isNotEmpty) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Image.network(
            imageUrl,
            width: 72,
            height: 72,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => _ProductThumbPlaceholder(
              icon: product.isAiGeneratedImage
                  ? Icons.auto_awesome_rounded
                  : Icons.fastfood_rounded,
            ),
          ),
        );
      }
      return _ProductThumbPlaceholder(
        icon: product.isAiGeneratedImage
            ? Icons.auto_awesome_rounded
            : Icons.fastfood_rounded,
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              thumb(),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.nombre,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        color: const Color(0xFF1F2555),
                        fontWeight: FontWeight.w800,
                        fontSize: 15.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      categoryName,
                      style: GoogleFonts.manrope(
                        color: const Color(0xFF6B7280),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '4${product.precio.toStringAsFixed(2)}',
                      style: GoogleFonts.manrope(
                        color: const Color(0xFF6D28D9),
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _ProductStatusPill(
                          label: product.disponible ? 'Visible' : 'Oculto',
                          color: product.disponible
                              ? const Color(0xFF16A34A)
                              : const Color(0xFFEF4444),
                        ),
                        _ProductStatusPill(
                          label: _statusLabel(),
                          color: statusColor,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 520;
              if (compact) {
                return Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _CategoryActionButton(
                            icon: Icons.edit,
                            label: 'Editar',
                            onTap: onEdit,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _CategoryActionButton(
                            icon: product.disponible
                                ? Icons.visibility_off_rounded
                                : Icons.visibility_rounded,
                            label: product.disponible ? 'Ocultar' : 'Mostrar',
                            onTap: onToggleVisible,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _CategoryActionButton(
                            icon: Icons.auto_awesome_rounded,
                            label: 'Mejorar IA',
                            onTap: onImproveImage,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _CategoryActionButton(
                            icon: Icons.delete,
                            label: 'Eliminar',
                            onTap: onDelete,
                            isDanger: true,
                          ),
                        ),
                      ],
                    ),
                  ],
                );
              }

              return Row(
                children: [
                  Expanded(
                    child: _CategoryActionButton(
                      icon: Icons.edit,
                      label: 'Editar',
                      onTap: onEdit,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _CategoryActionButton(
                      icon: product.disponible
                          ? Icons.visibility_off_rounded
                          : Icons.visibility_rounded,
                      label: product.disponible ? 'Ocultar' : 'Mostrar',
                      onTap: onToggleVisible,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _CategoryActionButton(
                      icon: Icons.auto_awesome_rounded,
                      label: 'Mejorar IA',
                      onTap: onImproveImage,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _CategoryActionButton(
                      icon: Icons.delete,
                      label: 'Eliminar',
                      onTap: onDelete,
                      isDanger: true,
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ProductThumbPlaceholder extends StatelessWidget {
  const _ProductThumbPlaceholder({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        color: const Color(0xFFF4F1FB),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icon, color: const Color(0xFF6D28D9)),
    );
  }
}

class _ProductStatusPill extends StatelessWidget {
  const _ProductStatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: GoogleFonts.manrope(
          color: color,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _EmptyMenuState extends StatelessWidget {
  const _EmptyMenuState({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: colorScheme.surfaceContainerHigh,
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, size: 30, color: colorScheme.primary),
          const SizedBox(height: 8),
          Text(
            title,
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: onAction,
            icon: const Icon(Icons.arrow_forward_rounded),
            label: Text(actionLabel),
          ),
        ],
      ),
    );
  }
}

class _CategoryEditorResult {
  const _CategoryEditorResult({
    required this.name,
    required this.iconValue,
    required this.generatedWithAi,
    required this.aiConfidence,
  });

  final String name;
  final String iconValue;
  final bool generatedWithAi;
  final double? aiConfidence;
}

class _CategoryIconOption {
  const _CategoryIconOption({
    required this.key,
    required this.label,
    required this.icon,
  });

  final String key;
  final String label;
  final IconData icon;
}

class _CategoryEmojiOption {
  const _CategoryEmojiOption({
    required this.emoji,
    required this.label,
    required this.keywords,
  });

  final String emoji;
  final String label;
  final List<String> keywords;
}

const List<_CategoryEmojiOption> _categoryEmojiOptions = [
  _CategoryEmojiOption(emoji: '🍔', label: 'Hamburguesas', keywords: ['hamburguesa', 'burger', 'fast food']),
  _CategoryEmojiOption(emoji: '🍕', label: 'Pizzas', keywords: ['pizza', 'italiana']),
  _CategoryEmojiOption(emoji: '🍗', label: 'Pollo', keywords: ['pollo', 'chicken']),
  _CategoryEmojiOption(emoji: '🥩', label: 'Carnes', keywords: ['carne', 'parrilla', 'asado']),
  _CategoryEmojiOption(emoji: '🍣', label: 'Sushi', keywords: ['sushi', 'japonesa']),
  _CategoryEmojiOption(emoji: '🍝', label: 'Pastas', keywords: ['pasta', 'spaghetti', 'lasagna']),
  _CategoryEmojiOption(emoji: '🌮', label: 'Mexicana', keywords: ['taco', 'mexicana', 'burrito']),
  _CategoryEmojiOption(emoji: '🥗', label: 'Saludable', keywords: ['ensalada', 'fit', 'healthy']),
  _CategoryEmojiOption(emoji: '🍰', label: 'Postres', keywords: ['postre', 'cake', 'torta']),
  _CategoryEmojiOption(emoji: '🍦', label: 'Helados', keywords: ['helado', 'gelato']),
  _CategoryEmojiOption(emoji: '🥐', label: 'Panadería', keywords: ['pan', 'panaderia', 'bakery']),
  _CategoryEmojiOption(emoji: '☕', label: 'Café', keywords: ['cafe', 'coffee']),
  _CategoryEmojiOption(emoji: '🥤', label: 'Bebidas', keywords: ['bebida', 'jugo', 'refresco']),
  _CategoryEmojiOption(emoji: '🍺', label: 'Bar', keywords: ['cerveza', 'bar']),
  _CategoryEmojiOption(emoji: '🍷', label: 'Vinos', keywords: ['vino', 'wine']),
  _CategoryEmojiOption(emoji: '🎁', label: 'Promociones', keywords: ['promo', 'oferta', 'descuento', 'regalo']),
  _CategoryEmojiOption(emoji: '🛵', label: 'Delivery', keywords: ['delivery', 'envio', 'reparto']),
  _CategoryEmojiOption(emoji: '🛍️', label: 'Tienda', keywords: ['tienda', 'shop', 'store']),
  _CategoryEmojiOption(emoji: '💊', label: 'Salud', keywords: ['farmacia', 'salud']),
  _CategoryEmojiOption(emoji: '💄', label: 'Belleza', keywords: ['belleza', 'maquillaje']),
  _CategoryEmojiOption(emoji: '👕', label: 'Ropa', keywords: ['ropa', 'moda']),
  _CategoryEmojiOption(emoji: '💻', label: 'Tecnología', keywords: ['tecnologia', 'electronica', 'computadora']),
  _CategoryEmojiOption(emoji: '🐶', label: 'Mascotas', keywords: ['mascota', 'perro', 'pet']),
  _CategoryEmojiOption(emoji: '🧽', label: 'Limpieza', keywords: ['limpieza', 'aseo']),
  _CategoryEmojiOption(emoji: '🏠', label: 'Hogar', keywords: ['hogar', 'casa']),
  _CategoryEmojiOption(emoji: '🛠️', label: 'Servicios', keywords: ['servicio', 'herramienta', 'ferreteria']),
  _CategoryEmojiOption(emoji: '🎓', label: 'Educación', keywords: ['educacion', 'curso', 'academia']),
  _CategoryEmojiOption(emoji: '🏋️', label: 'Deporte', keywords: ['fitness', 'gym', 'deporte']),
  _CategoryEmojiOption(emoji: '🚗', label: 'Autos', keywords: ['auto', 'carro', 'repuesto']),
  _CategoryEmojiOption(emoji: '🎵', label: 'Música', keywords: ['musica', 'audio']),
  _CategoryEmojiOption(emoji: '🎮', label: 'Juegos', keywords: ['juego', 'gaming']),
  _CategoryEmojiOption(emoji: '💎', label: 'Premium', keywords: ['premium', 'especial', 'destacado', 'deluxe']),
  _CategoryEmojiOption(emoji: '🏷️', label: 'General', keywords: ['general', 'otros']),
];

const List<_CategoryIconOption> _categoryIconOptions = [
  _CategoryIconOption(key: 'restaurant', label: 'Restaurante', icon: Icons.restaurant_rounded),
  _CategoryIconOption(key: 'fastfood', label: 'Comida rápida', icon: Icons.fastfood_rounded),
  _CategoryIconOption(key: 'lunch_dining', label: 'Hamburguesas', icon: Icons.lunch_dining_rounded),
  _CategoryIconOption(key: 'dinner_dining', label: 'Platos', icon: Icons.dinner_dining_rounded),
  _CategoryIconOption(key: 'ramen_dining', label: 'Ramen', icon: Icons.ramen_dining_rounded),
  _CategoryIconOption(key: 'local_pizza', label: 'Pizza', icon: Icons.local_pizza_rounded),
  _CategoryIconOption(key: 'bakery_dining', label: 'Panadería', icon: Icons.bakery_dining_rounded),
  _CategoryIconOption(key: 'icecream', label: 'Helados', icon: Icons.icecream_rounded),
  _CategoryIconOption(key: 'cake', label: 'Postres', icon: Icons.cake_rounded),
  _CategoryIconOption(key: 'emoji_food_beverage', label: 'Snacks', icon: Icons.emoji_food_beverage_rounded),
  _CategoryIconOption(key: 'local_cafe', label: 'Café', icon: Icons.local_cafe_rounded),
  _CategoryIconOption(key: 'local_bar', label: 'Bar', icon: Icons.local_bar_rounded),
  _CategoryIconOption(key: 'wine_bar', label: 'Vinos', icon: Icons.wine_bar_rounded),
  _CategoryIconOption(key: 'sports_bar', label: 'Bebidas', icon: Icons.sports_bar_rounded),
  _CategoryIconOption(key: 'brunch_dining', label: 'Brunch', icon: Icons.brunch_dining_rounded),
  _CategoryIconOption(key: 'egg_alt', label: 'Huevos', icon: Icons.egg_alt_rounded),
  _CategoryIconOption(key: 'set_meal', label: 'Combos', icon: Icons.set_meal_rounded),
  _CategoryIconOption(key: 'kebab_dining', label: 'Parrilla', icon: Icons.kebab_dining_rounded),
  _CategoryIconOption(key: 'rice_bowl', label: 'Bowls', icon: Icons.rice_bowl_rounded),
  _CategoryIconOption(key: 'takeout_dining', label: 'Para llevar', icon: Icons.takeout_dining_rounded),
  _CategoryIconOption(key: 'delivery_dining', label: 'Delivery', icon: Icons.delivery_dining_rounded),
  _CategoryIconOption(key: 'local_drink', label: 'Jugos', icon: Icons.local_drink_rounded),
  _CategoryIconOption(key: 'liquor', label: 'Licores', icon: Icons.liquor_rounded),
  _CategoryIconOption(key: 'tapas', label: 'Tapas', icon: Icons.tapas_rounded),
  _CategoryIconOption(key: 'cookie', label: 'Galletas', icon: Icons.cookie_rounded),
  _CategoryIconOption(key: 'breakfast_dining', label: 'Desayunos', icon: Icons.breakfast_dining_rounded),
  _CategoryIconOption(key: 'soup_kitchen', label: 'Sopas', icon: Icons.soup_kitchen_rounded),
  _CategoryIconOption(key: 'outdoor_grill', label: 'Asados', icon: Icons.outdoor_grill_rounded),
  _CategoryIconOption(key: 'local_fire_department', label: 'Picante', icon: Icons.local_fire_department_rounded),
  _CategoryIconOption(key: 'spa', label: 'Té', icon: Icons.spa_rounded),
  _CategoryIconOption(key: 'eco', label: 'Veggie', icon: Icons.eco_rounded),
  _CategoryIconOption(key: 'grass', label: 'Ensaladas', icon: Icons.grass_rounded),
  _CategoryIconOption(key: 'emoji_nature', label: 'Natural', icon: Icons.emoji_nature_rounded),
  _CategoryIconOption(key: 'nutrition', label: 'Saludable', icon: Icons.monitor_heart_rounded),
  _CategoryIconOption(key: 'favorite', label: 'Favoritos', icon: Icons.favorite_rounded),
  _CategoryIconOption(key: 'celebration', label: 'Especiales', icon: Icons.celebration_rounded),
  _CategoryIconOption(key: 'redeem', label: 'Promos', icon: Icons.redeem_rounded),
  _CategoryIconOption(key: 'storefront', label: 'Casa', icon: Icons.storefront_rounded),
  _CategoryIconOption(key: 'star', label: 'Premium', icon: Icons.star_rounded),
  _CategoryIconOption(key: 'diamond', label: 'Signature', icon: Icons.diamond_rounded),
];

_CategoryIconOption? _categoryIconOptionByKey(String? iconKey) {
  final normalized = _normalizeCategoryIconKey(iconKey);
  if (normalized == null) return null;
  for (final option in _categoryIconOptions) {
    if (option.key == normalized) return option;
  }
  return null;
}

String? _normalizeCategoryIconKey(String? iconKey) {
  final normalized = iconKey?.trim();
  if (normalized == null || normalized.isEmpty) {
    return null;
  }
  if (_isSvgIconContent(normalized) || _isEmojiContent(normalized)) {
    return null;
  }
  return _categoryIconOptionByKeyInternal(normalized) ? normalized : null;
}

String? _normalizeStoredIconValue(String? value) {
  final normalized = value?.trim();
  if (normalized == null || normalized.isEmpty) {
    return null;
  }
  return normalized;
}

bool _isSvgIconContent(String? value) {
  final normalized = value?.trim().toLowerCase() ?? '';
  return normalized.startsWith('<svg') && normalized.contains('</svg>');
}

bool _isImageUrlContent(String? value) {
  final normalized = value?.trim() ?? '';
  if (normalized.isEmpty) {
    return false;
  }
  final uri = Uri.tryParse(normalized);
  return uri != null && (uri.scheme == 'http' || uri.scheme == 'https');
}

bool _isEmojiContent(String? value) {
  final normalized = value?.trim() ?? '';
  if (normalized.isEmpty) {
    return false;
  }
  if (normalized.contains(' ')) {
    return false;
  }
  return RegExp(r'[\u00A9\u00AE\u203C-\u3299\u{1F000}-\u{1FAFF}]', unicode: true)
      .hasMatch(normalized) && normalized.runes.length <= 8;
}

bool _categoryIconOptionByKeyInternal(String iconKey) {
  for (final option in _categoryIconOptions) {
    if (option.key == iconKey) return true;
  }
  return false;
}

String _suggestCategoryIconKey(String name) {
  final normalized = name.trim().toLowerCase();
  if (normalized.contains('bebida') || normalized.contains('cafe')) {
    return 'local_cafe';
  }
  if (normalized.contains('perro') || normalized.contains('hot dog')) {
    return 'fastfood';
  }
  if (normalized.contains('hamburg')) {
    return 'lunch_dining';
  }
  if (normalized.contains('pizza')) {
    return 'local_pizza';
  }
  if (normalized.contains('postre') || normalized.contains('helado')) {
    return 'icecream';
  }
  if (normalized.contains('desayuno')) {
    return 'breakfast_dining';
  }
  if (normalized.contains('ensalada') || normalized.contains('veg')) {
    return 'eco';
  }
  return 'restaurant';
}

_CategoryEmojiOption? _categoryEmojiOptionByEmoji(String? emoji) {
  final normalized = _normalizeStoredIconValue(emoji);
  if (normalized == null) {
    return null;
  }
  for (final option in _categoryEmojiOptions) {
    if (option.emoji == normalized) {
      return option;
    }
  }
  return null;
}

String _suggestCategoryEmoji(String name) {
  final normalized = _normalizeEmojiSearchText(name);
  for (final option in _categoryEmojiOptions) {
    for (final keyword in option.keywords) {
      if (normalized.contains(_normalizeEmojiSearchText(keyword))) {
        return option.emoji;
      }
    }
  }
  return '🏷️';
}

List<_CategoryEmojiOption> _recommendedCategoryEmojiOptions({
  required String name,
  required String query,
}) {
  final suggestedEmoji = _suggestCategoryEmoji(name);
  final suggestedOption = _categoryEmojiOptionByEmoji(suggestedEmoji);
  final results = <_CategoryEmojiOption>[];

  if (suggestedOption != null) {
    results.add(suggestedOption);
  }

  for (final option in _filterCategoryEmojiOptions(name: name, query: query)) {
    if (results.any((item) => item.emoji == option.emoji)) {
      continue;
    }
    results.add(option);
    if (results.length >= 6) {
      break;
    }
  }

  return results;
}

List<_CategoryEmojiOption> _filterCategoryEmojiOptions({
  required String name,
  required String query,
}) {
  final normalizedQuery = _normalizeEmojiSearchText(query);
  final normalizedName = _normalizeEmojiSearchText(name);

  final matching = _categoryEmojiOptions.where((option) {
    if (normalizedQuery.isEmpty) {
      return true;
    }

    if (_normalizeEmojiSearchText(option.label).contains(normalizedQuery)) {
      return true;
    }

    return option.keywords.any(
      (keyword) => _normalizeEmojiSearchText(keyword).contains(normalizedQuery),
    );
  }).toList();

  matching.sort((left, right) {
    final leftMatch = left.keywords.any(
      (keyword) => normalizedName.contains(_normalizeEmojiSearchText(keyword)),
    );
    final rightMatch = right.keywords.any(
      (keyword) => normalizedName.contains(_normalizeEmojiSearchText(keyword)),
    );
    if (leftMatch != rightMatch) {
      return leftMatch ? -1 : 1;
    }
    return left.label.compareTo(right.label);
  });

  return matching;
}

String _normalizeEmojiSearchText(String? value) {
  return (value ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[áàäâ]'), 'a')
      .replaceAll(RegExp(r'[éèëê]'), 'e')
      .replaceAll(RegExp(r'[íìïî]'), 'i')
      .replaceAll(RegExp(r'[óòöô]'), 'o')
      .replaceAll(RegExp(r'[úùüû]'), 'u')
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

IconData _resolveCategoryIcon({String? iconKey, String? name}) {
  final option = _categoryIconOptionByKey(iconKey);
  if (option != null) {
    return option.icon;
  }
  final suggestedKey = _suggestCategoryIconKey(name ?? '');
  return _categoryIconOptionByKey(suggestedKey)?.icon ?? Icons.restaurant_rounded;
}

Widget _buildCategoryIconVisual({
  required String? iconValue,
  String? name,
  double size = 28,
}) {
  final normalized = _normalizeStoredIconValue(iconValue);
  if (_isImageUrlContent(normalized)) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.35),
      child: Image.network(
        normalized!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(
          _resolveCategoryIcon(name: name),
          color: const Color(0xFF6D28D9),
          size: size,
        ),
      ),
    );
  }
  if (_isSvgIconContent(normalized)) {
    return SvgPicture.string(
      normalized!,
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }
  if (_isEmojiContent(normalized)) {
    return Text(
      normalized!,
      style: TextStyle(
        fontSize: size,
        height: 1,
      ),
    );
  }

  return Icon(
    _resolveCategoryIcon(iconKey: normalized, name: name),
    color: const Color(0xFF6D28D9),
    size: size,
  );
}
