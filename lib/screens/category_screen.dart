// ignore_for_file: avoid_print

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/product_form_screen.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
import 'package:kosmenu_app/screens/boost_sales_screen.dart';
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

enum _CategorySortOption { order, nameAsc, nameDesc, mostProducts, leastProducts }

enum _ProductSortOption { order, nameAsc, nameDesc, priceAsc, priceDesc }

enum _VisibilityFilterOption { all, visible, hidden }

class _CatalogCategoriesScreenState extends State<CatalogCategoriesScreen> {
  bool _loading = true;
  bool _hasLoadedInitialSnapshot = false;
  bool _isMutating = false;
  bool _isSavingCategoryOrder = false;
  List<CategoryModel> _categories = <CategoryModel>[];
  List<ProductModel> _products = <ProductModel>[];
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  bool _showAppBarSearch = false;
  int _selectedTabIndex = 0;
  String? _selectedProductCategoryId;
  Map<String, int> _productCountByCategory = <String, int>{};
  _CategorySortOption _categorySortOption = _CategorySortOption.order;
  _ProductSortOption _productSortOption = _ProductSortOption.order;
  _VisibilityFilterOption _categoryVisibilityFilter = _VisibilityFilterOption.all;
  _VisibilityFilterOption _productVisibilityFilter = _VisibilityFilterOption.all;
  int _categoryVisibleCount = 20;
  int _productVisibleCount = 24;
  int _desktopProductPage = 0;
  static const int _desktopPageSize = 5;
  bool _desktopProductGridView = false;
  String _commerceCurrency = 'USD';
  double _commerceExchangeRate = 0;
  Timer? _aiImageRefreshTimer;
  final AiImageService _aiImageService = const AiImageService();
  final CategoryIconAiService _categoryIconAiService =
      const CategoryIconAiService();

  String get _currentCatalogoId => widget.catalog.id.trim();

  @override
  void initState() {
    super.initState();
    unawaited(_loadPricingConfig());
    _loadCategories();
  }

  Future<void> _loadPricingConfig() async {
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) return;

    try {
      final comercio = await Supabase.instance.client
          .from('comercios')
          .select('moneda, exchange_rate_value, tasa_cambio_pesos')
          .eq('id', comercioId)
          .maybeSingle();

      final currency =
          (comercio?['moneda']?.toString().trim().toUpperCase() ?? 'USD');
      final rateRaw =
          comercio?['exchange_rate_value'] ?? comercio?['tasa_cambio_pesos'];
      final rate = rateRaw is num
          ? rateRaw.toDouble()
          : double.tryParse(
                (rateRaw ?? '').toString().trim().replaceAll(',', '.'),
              ) ??
              0;

      if (!mounted) return;
      setState(() {
        _commerceCurrency = currency.isEmpty ? 'USD' : currency;
        _commerceExchangeRate = rate;
      });
    } catch (_) {
      // Mantiene USD por defecto si no se puede cargar la configuración.
    }
  }

  String _formatProductPrice(double storedPrice) {
    final amount = storedPrice;
    final currency = _commerceCurrency;
    final decimals = currency == 'COP' ? 0 : 2;
    final formatted = amount.toStringAsFixed(decimals);

    switch (currency) {
      case 'USD':
        return '\$$formatted';
      case 'COP':
        return '\$$formatted COP';
      case 'EUR':
        return '€$formatted';
      default:
        return '$formatted $currency';
    }
  }

  String? _formatProductPriceSecondary(double storedPrice) {
    if (_commerceExchangeRate <= 0) return null;

    if (_commerceCurrency == 'USD') {
      final cop = storedPrice * _commerceExchangeRate;
      return '\$${cop.toStringAsFixed(0)} COP';
    }
    if (_commerceCurrency == 'COP') {
      final usd = storedPrice / _commerceExchangeRate;
      return '\$${usd.toStringAsFixed(2)} USD';
    }
    return null;
  }

  @override
  void dispose() {
    _aiImageRefreshTimer?.cancel();
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
    var selectedIconValue = _resolveCategoryVisualIcon(
      storedIcon: category?.icono,
      categoryName: category?.nombre ?? '',
    );
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
                                          _buildCategoryEmojiGlyph(option.emoji, size: 26),
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
                                          _buildCategoryEmojiGlyph(option.emoji, size: 26),
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
                                  final iconToSave = _isEmojiContent(selectedIconValue)
                                      ? _canonicalCategoryEmoji(selectedIconValue)
                                      : selectedIconValue;
                                  navigator.pop(
                                    _CategoryEditorResult(
                                      name: draft,
                                      iconValue: iconToSave,
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

  List<CategoryModel> get _searchedCategories {
    final query = _normalizedText(_searchQuery);
    if (query.isEmpty) return _categories;
    return _categories.where((category) {
      final productCount = (_productCountByCategory[category.id] ?? 0)
          .toString();
      return _normalizedText(category.nombre).contains(query) ||
          productCount.contains(query);
    }).toList();
  }

  List<CategoryModel> _applyCategoryFiltersAndSorting(List<CategoryModel> input) {
    var output = input.where((category) {
      switch (_categoryVisibilityFilter) {
        case _VisibilityFilterOption.visible:
          return category.activo;
        case _VisibilityFilterOption.hidden:
          return !category.activo;
        case _VisibilityFilterOption.all:
          return true;
      }
    }).toList();

    switch (_categorySortOption) {
      case _CategorySortOption.nameAsc:
        output.sort((a, b) => a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase()));
        break;
      case _CategorySortOption.nameDesc:
        output.sort((a, b) => b.nombre.toLowerCase().compareTo(a.nombre.toLowerCase()));
        break;
      case _CategorySortOption.mostProducts:
        output.sort((a, b) {
          final delta = (_productCountByCategory[b.id] ?? 0) - (_productCountByCategory[a.id] ?? 0);
          if (delta != 0) return delta;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
      case _CategorySortOption.leastProducts:
        output.sort((a, b) {
          final delta = (_productCountByCategory[a.id] ?? 0) - (_productCountByCategory[b.id] ?? 0);
          if (delta != 0) return delta;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
      case _CategorySortOption.order:
        output.sort((a, b) {
          final byOrder = a.orden.compareTo(b.orden);
          if (byOrder != 0) return byOrder;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
    }

    return output;
  }

  List<CategoryModel> get _filteredCategories =>
      _applyCategoryFiltersAndSorting(_searchedCategories);

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

  List<ProductModel> _applyProductFiltersAndSorting(List<ProductModel> input) {
    var output = input.where((product) {
      switch (_productVisibilityFilter) {
        case _VisibilityFilterOption.visible:
          return product.disponible;
        case _VisibilityFilterOption.hidden:
          return !product.disponible;
        case _VisibilityFilterOption.all:
          return true;
      }
    }).toList();

    switch (_productSortOption) {
      case _ProductSortOption.nameAsc:
        output.sort((a, b) => a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase()));
        break;
      case _ProductSortOption.nameDesc:
        output.sort((a, b) => b.nombre.toLowerCase().compareTo(a.nombre.toLowerCase()));
        break;
      case _ProductSortOption.priceAsc:
        output.sort((a, b) => a.precio.compareTo(b.precio));
        break;
      case _ProductSortOption.priceDesc:
        output.sort((a, b) => b.precio.compareTo(a.precio));
        break;
      case _ProductSortOption.order:
        output.sort((a, b) {
          final byCategory = a.categoriaId.compareTo(b.categoriaId);
          if (byCategory != 0) return byCategory;
          final byOrder = a.orden.compareTo(b.orden);
          if (byOrder != 0) return byOrder;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
    }
    return output;
  }

  List<ProductModel> get _filteredProductsForCategoryTab {
    final products = _applyProductFiltersAndSorting(_searchFilteredProducts);
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

  List<ProductModel> get _desktopPanelProducts => _filteredProductsForCategoryTab;

  List<ProductModel> get _desktopPagedProducts {
    final products = _desktopPanelProducts;
    final start = _desktopProductPage * _desktopPageSize;
    if (start >= products.length) return const [];
    final end = min(start + _desktopPageSize, products.length);
    return products.sublist(start, end);
  }

  int get _desktopTotalProductPages {
    final total = _desktopPanelProducts.length;
    if (total == 0) return 1;
    return (total / _desktopPageSize).ceil();
  }

  List<ProductModel> get _hiddenProducts {
    final output = _searchFilteredProducts
        .where((product) => !product.disponible)
        .toList();
    switch (_productSortOption) {
      case _ProductSortOption.nameAsc:
        output.sort((a, b) => a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase()));
        break;
      case _ProductSortOption.nameDesc:
        output.sort((a, b) => b.nombre.toLowerCase().compareTo(a.nombre.toLowerCase()));
        break;
      case _ProductSortOption.priceAsc:
        output.sort((a, b) => a.precio.compareTo(b.precio));
        break;
      case _ProductSortOption.priceDesc:
        output.sort((a, b) => b.precio.compareTo(a.precio));
        break;
      case _ProductSortOption.order:
        output.sort((a, b) {
          final byCategory = a.categoriaId.compareTo(b.categoriaId);
          if (byCategory != 0) return byCategory;
          final byOrder = a.orden.compareTo(b.orden);
          if (byOrder != 0) return byOrder;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
    }
    return output;
  }

  List<CategoryModel> get _hiddenCategories {
    final output = _searchedCategories
        .where((category) => !category.activo)
        .toList();
    switch (_categorySortOption) {
      case _CategorySortOption.nameAsc:
        output.sort((a, b) => a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase()));
        break;
      case _CategorySortOption.nameDesc:
        output.sort((a, b) => b.nombre.toLowerCase().compareTo(a.nombre.toLowerCase()));
        break;
      case _CategorySortOption.mostProducts:
        output.sort((a, b) {
          final delta = (_productCountByCategory[b.id] ?? 0) - (_productCountByCategory[a.id] ?? 0);
          if (delta != 0) return delta;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
      case _CategorySortOption.leastProducts:
        output.sort((a, b) {
          final delta = (_productCountByCategory[a.id] ?? 0) - (_productCountByCategory[b.id] ?? 0);
          if (delta != 0) return delta;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
      case _CategorySortOption.order:
        output.sort((a, b) {
          final byOrder = a.orden.compareTo(b.orden);
          if (byOrder != 0) return byOrder;
          return a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase());
        });
        break;
    }
    return output;
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

  Future<bool> _updateProductVisibilityInDatabase(
    ProductModel product,
    bool disponible,
  ) async {
    final updatedRows = await Supabase.instance.client
        .from('productos')
        .update({'disponible': disponible})
        .eq('id', product.id)
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .select('id');

    return (updatedRows as List<dynamic>).isNotEmpty;
  }

  Future<void> _setProductVisibility(
    ProductModel product,
    bool disponible,
  ) async {
    if (_isMutating) return;

    final previous = List<ProductModel>.from(_products);

    setState(() {
      _products = _products
          .map(
            (item) => item.id == product.id
                ? item.copyWith(disponible: disponible)
                : item,
          )
          .toList();
    });

    try {
      final updated = await _updateProductVisibilityInDatabase(
        product,
        disponible,
      );
      if (!updated) {
        if (!mounted) return;
        setState(() => _products = previous);
        _showMessage(
          disponible
              ? 'No se pudo actualizar la visibilidad del producto. Intenta nuevamente.'
              : 'No se pudo archivar el producto. Verifica tus permisos o intenta nuevamente.',
        );
        return;
      }

      if (!mounted) return;
      _showMessage(
        disponible
            ? 'Producto visible nuevamente.'
            : 'Producto ocultado del menú público.',
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = previous);
      _showMessage(
        'No se pudo actualizar la visibilidad del producto. Intenta nuevamente.',
      );
    }
  }

  Future<void> _hideProduct(ProductModel product) async {
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
            'Ocultar producto',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            'Este producto dejará de estar visible en tu menú público, pero conservarás su información y podrás mostrarlo nuevamente cuando quieras.',
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
              child: const Text('Ocultar producto'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirm != true) return;
    await _setProductVisibility(product, false);
  }

  Future<void> _showProduct(ProductModel product) async {
    await _setProductVisibility(product, true);
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
    final customPrompt = await _askAiImagePrompt(product.nombre);
    if (!mounted || customPrompt == null) {
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
        customPrompt: customPrompt,
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

  Future<String?> _askAiImagePrompt(String productName) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;
        return AlertDialog(
          backgroundColor: colorScheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            'Describe la imagen',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Describe el fondo o escena para "$productName". Si es marca conocida (Netflix, HBO Max, Spotify, etc.), el logo oficial se agrega automáticamente; no pidas el logo en el texto.',
                  style: TextStyle(color: colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  maxLines: 4,
                  minLines: 3,
                  maxLength: 500,
                  decoration: const InputDecoration(
                    hintText:
                        'Ej: Fondo oscuro premium, TV con ambiente de cine, sin audífonos, sin texto, estilo limpio.',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(null),
              child: const Text('Cancelar'),
            ),
            FilledButton.icon(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text.trim()),
              icon: const Icon(Icons.auto_awesome_rounded, size: 18),
              label: const Text('Generar imagen'),
            ),
          ],
        );
      },
    );
    controller.dispose();
    return result;
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
        _categoryVisibleCount = 20;
        _productVisibleCount = 24;
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

  Future<void> _openUpsellSettings() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BoostSalesScreen(
          categories: List<CategoryModel>.from(_categories),
          products: List<ProductModel>.from(_products),
          currencyCode: _commerceCurrency,
        ),
      ),
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

  Widget _buildCategoryControls() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        SizedBox(
          width: 180,
          child: DropdownButtonFormField<_VisibilityFilterOption>(
            value: _categoryVisibilityFilter,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Estado',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(
                value: _VisibilityFilterOption.all,
                child: Text('Todas'),
              ),
              DropdownMenuItem(
                value: _VisibilityFilterOption.visible,
                child: Text('Activas'),
              ),
              DropdownMenuItem(
                value: _VisibilityFilterOption.hidden,
                child: Text('Ocultas'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _categoryVisibilityFilter = value;
                _categoryVisibleCount = 20;
              });
            },
          ),
        ),
        SizedBox(
          width: 220,
          child: DropdownButtonFormField<_CategorySortOption>(
            value: _categorySortOption,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Ordenar',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(
                value: _CategorySortOption.order,
                child: Text('Orden manual'),
              ),
              DropdownMenuItem(
                value: _CategorySortOption.nameAsc,
                child: Text('Nombre A-Z'),
              ),
              DropdownMenuItem(
                value: _CategorySortOption.nameDesc,
                child: Text('Nombre Z-A'),
              ),
              DropdownMenuItem(
                value: _CategorySortOption.mostProducts,
                child: Text('Más productos'),
              ),
              DropdownMenuItem(
                value: _CategorySortOption.leastProducts,
                child: Text('Menos productos'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _categorySortOption = value;
                _categoryVisibleCount = 20;
              });
            },
          ),
        ),
      ],
    );
  }

  Widget _buildProductControls() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        SizedBox(
          width: 180,
          child: DropdownButtonFormField<_VisibilityFilterOption>(
            value: _productVisibilityFilter,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Visibilidad',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(
                value: _VisibilityFilterOption.all,
                child: Text('Todos'),
              ),
              DropdownMenuItem(
                value: _VisibilityFilterOption.visible,
                child: Text('Visibles'),
              ),
              DropdownMenuItem(
                value: _VisibilityFilterOption.hidden,
                child: Text('Ocultos'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _productVisibilityFilter = value;
                _productVisibleCount = 24;
              });
            },
          ),
        ),
        SizedBox(
          width: 220,
          child: DropdownButtonFormField<_ProductSortOption>(
            value: _productSortOption,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Ordenar',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(
                value: _ProductSortOption.order,
                child: Text('Orden manual'),
              ),
              DropdownMenuItem(
                value: _ProductSortOption.nameAsc,
                child: Text('Nombre A-Z'),
              ),
              DropdownMenuItem(
                value: _ProductSortOption.nameDesc,
                child: Text('Nombre Z-A'),
              ),
              DropdownMenuItem(
                value: _ProductSortOption.priceAsc,
                child: Text('Precio menor a mayor'),
              ),
              DropdownMenuItem(
                value: _ProductSortOption.priceDesc,
                child: Text('Precio mayor a menor'),
              ),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _productSortOption = value;
                _productVisibleCount = 24;
              });
            },
          ),
        ),
      ],
    );
  }

  List<Widget> _buildAllTabSections({required bool useAdminTable}) {
    final featuredCategories = _searchedCategories.take(3).toList();
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
          const SizedBox(width: 12),
          Expanded(
            child: _QuickActionCard(
              icon: Icons.local_offer_outlined,
              title: 'Aumentar ventas',
              subtitle: 'Reglas, combos y envío',
              onTap: _openUpsellSettings,
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

    final canReorder = _searchQuery.trim().isEmpty &&
        _categoryVisibilityFilter == _VisibilityFilterOption.all &&
        _categorySortOption == _CategorySortOption.order;
    final reorderHint = useAdminTable
        ? (canReorder
            ? 'Arrastra el ícono para cambiar el orden de las categorías.'
            : 'Desactiva la búsqueda para reordenar categorías.')
        : (canReorder
            ? (_isSavingCategoryOrder
                ? 'Guardando nuevo orden...'
                : 'Arrastra las categorías para cambiar su orden.')
            : 'Desactiva la búsqueda para reordenar categorías.');

    final pageItems = filtered.take(_categoryVisibleCount).toList();
    final hasMore = filtered.length > pageItems.length;

    return [
      _buildCategoryControls(),
      const SizedBox(height: 10),
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
        categories: pageItems,
        useAdminTable: useAdminTable,
        enabled: !_isMutating && !_isSavingCategoryOrder,
        reorderable: canReorder && !hasMore,
        onReorder: canReorder ? _onCategoryReorder : null,
      ),
      if (hasMore) ...[
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () {
              if (!mounted) return;
              setState(() => _categoryVisibleCount += 20);
            },
            icon: const Icon(Icons.expand_more_rounded),
            label: Text('Cargar más categorías (${filtered.length - pageItems.length})'),
          ),
        ),
      ],
    ];
  }

  List<Widget> _buildProductsTabSections() {
    final products = _filteredProductsForCategoryTab;
    final pageItems = products.take(_productVisibleCount).toList();
    final hasMore = products.length > pageItems.length;
    return [
      _buildProductControls(),
      const SizedBox(height: 10),
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
        ...pageItems.map(_buildProductCard),
      if (hasMore) ...[
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () {
              if (!mounted) return;
              setState(() => _productVisibleCount += 24);
            },
            icon: const Icon(Icons.expand_more_rounded),
            label: Text('Cargar más productos (${products.length - pageItems.length})'),
          ),
        ),
      ],
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
      priceLabel: _formatProductPrice(product.precio),
      priceSecondaryLabel: _formatProductPriceSecondary(product.precio),
      onEdit: () => _openProductFormDirect(product: product),
      onToggleVisible: () {
        if (product.disponible) {
          unawaited(_hideProduct(product));
        } else {
          unawaited(_showProduct(product));
        }
      },
      onImproveImage: () => _generateAiImageForProduct(product),
    );
  }

  void _ensureDesktopCategorySelected(List<CategoryModel> categories) {
    if (!mounted || categories.isEmpty) return;
    final current = _normalizedId(_selectedProductCategoryId);
    if (current.isEmpty) return;
    final exists = categories.any((c) => _normalizedId(c.id) == current);
    if (!exists) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _selectedProductCategoryId = categories.first.id);
      });
    }
  }

  void _selectDesktopCategory(String categoryId) {
    if (_normalizedId(_selectedProductCategoryId) == _normalizedId(categoryId)) {
      return;
    }
    setState(() {
      _selectedProductCategoryId = categoryId;
      _desktopProductPage = 0;
    });
  }

  Widget _buildDesktopMenuLayout({required double horizontalPadding}) {
    const purple = Color(0xFF7C3AED);
    const darkText = Color(0xFF11183C);
    const mutedText = Color(0xFF6B6F92);
    const borderColor = Color(0xFFE8EAF2);
    final disabled = _loading || _isMutating;
    final categories = _filteredCategories;

    if (_categories.isEmpty) {
      return Padding(
        padding: EdgeInsets.fromLTRB(horizontalPadding, 24, horizontalPadding, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildDesktopHeader(
              purple: purple,
              darkText: darkText,
              mutedText: mutedText,
              disabled: disabled,
            ),
            const SizedBox(height: 16),
            _buildDesktopToolbar(
              categories: const [],
              borderColor: borderColor,
              purple: purple,
              mutedText: mutedText,
              disabled: disabled,
            ),
            const SizedBox(height: 24),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: _buildDesktopEmptyState(
                    purple: purple,
                    disabled: disabled,
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    _ensureDesktopCategorySelected(categories);
    final selectedId = _normalizedId(_selectedProductCategoryId);
    CategoryModel? selectedCategory;
    for (final category in categories) {
      if (_normalizedId(category.id) == selectedId) {
        selectedCategory = category;
        break;
      }
    }
    selectedCategory ??= categories.isNotEmpty ? categories.first : null;

    return Padding(
      padding: EdgeInsets.fromLTRB(horizontalPadding, 16, horizontalPadding, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildDesktopHeader(
            purple: purple,
            darkText: darkText,
            mutedText: mutedText,
            disabled: disabled,
          ),
          const SizedBox(height: 16),
          _buildDesktopToolbar(
            categories: categories,
            borderColor: borderColor,
            purple: purple,
            mutedText: mutedText,
            disabled: disabled,
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildDesktopCategorySidebar(
                  categories: categories,
                  selectedCategoryId: selectedId,
                  borderColor: borderColor,
                  purple: purple,
                  darkText: darkText,
                  mutedText: mutedText,
                  disabled: disabled,
                ),
                const SizedBox(width: 20),
                Expanded(
                  child: _buildDesktopProductsPanel(
                    selectedCategory: selectedCategory,
                    borderColor: borderColor,
                    purple: purple,
                    darkText: darkText,
                    mutedText: mutedText,
                    disabled: disabled,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDesktopHeader({
    required Color purple,
    required Color darkText,
    required Color mutedText,
    required bool disabled,
  }) {
    ButtonStyle headerOutlinedStyle({
      required Color foreground,
      required Color border,
    }) {
      return OutlinedButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: foreground,
        side: BorderSide(color: border),
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      );
    }

    final filledHeaderStyle = FilledButton.styleFrom(
      backgroundColor: purple,
      foregroundColor: Colors.white,
      minimumSize: const Size(0, 44),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      textStyle: GoogleFonts.poppins(
        fontWeight: FontWeight.w600,
        fontSize: 14,
      ),
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Menú',
                style: GoogleFonts.poppins(
                  fontSize: 32,
                  fontWeight: FontWeight.w700,
                  color: darkText,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Gestiona las categorías y productos de tu menú.',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: mutedText,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 24),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          alignment: WrapAlignment.end,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            OutlinedButton.icon(
              onPressed: disabled ? null : _openAiMenuGenerator,
              icon: Icon(Icons.auto_awesome_rounded, size: 18, color: purple),
              label: Text(
                'Crear con IA',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  color: purple,
                ),
              ),
              style: headerOutlinedStyle(
                foreground: purple,
                border: purple.withValues(alpha: 0.45),
              ),
            ),
            OutlinedButton.icon(
              onPressed: disabled ? null : _createCategory,
              icon: Icon(Icons.add_rounded, size: 18, color: darkText),
              label: Text(
                'Nueva categoría',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  color: darkText,
                ),
              ),
              style: headerOutlinedStyle(
                foreground: darkText,
                border: const Color(0xFFE8EAF2),
              ),
            ),
            OutlinedButton.icon(
              onPressed: disabled ? null : _openUpsellSettings,
              icon: Icon(Icons.local_offer_outlined, size: 18, color: purple),
              label: Text(
                'Aumentar ventas',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  color: purple,
                ),
              ),
              style: headerOutlinedStyle(
                foreground: purple,
                border: purple.withValues(alpha: 0.45),
              ),
            ),
            FilledButton.icon(
              onPressed: disabled ? null : _openProductFormDirect,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(
                'Nuevo producto',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              style: filledHeaderStyle,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDesktopToolbar({
    required List<CategoryModel> categories,
    required Color borderColor,
    required Color purple,
    required Color mutedText,
    required bool disabled,
  }) {
    InputDecoration toolbarFieldDecoration(String hint) {
      return InputDecoration(
        hintText: hint,
        isDense: true,
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: borderColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: purple, width: 1.4),
        ),
      );
    }

    return Row(
      children: [
        Expanded(
          flex: 3,
          child: TextField(
            controller: _searchController,
            onChanged: (value) {
              if (!mounted) return;
              setState(() {
                _searchQuery = value;
                _categoryVisibleCount = 20;
                _productVisibleCount = 24;
                _desktopProductPage = 0;
              });
            },
            style: GoogleFonts.poppins(fontSize: 14, color: const Color(0xFF11183C)),
            decoration: toolbarFieldDecoration('Buscar productos o categorías...').copyWith(
              prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF6B6F92)),
              suffixIcon: _searchQuery.trim().isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        if (!mounted) return;
                        _searchController.clear();
                        setState(() {
                          _searchQuery = '';
                          _desktopProductPage = 0;
                        });
                      },
                      icon: const Icon(Icons.close_rounded, size: 18),
                    ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 200,
          child: DropdownButtonFormField<String?>(
            value: _selectedProductCategoryId,
            isExpanded: true,
            decoration: toolbarFieldDecoration('Todas las categorías'),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('Todas las categorías'),
              ),
              ...categories.map(
                (category) => DropdownMenuItem<String?>(
                  value: category.id,
                  child: Text(category.nombre, overflow: TextOverflow.ellipsis),
                ),
              ),
            ],
            onChanged: disabled
                ? null
                : (value) {
                    setState(() {
                      _selectedProductCategoryId = value;
                      _desktopProductPage = 0;
                    });
                  },
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 160,
          child: DropdownButtonFormField<_VisibilityFilterOption>(
            value: _productVisibilityFilter,
            isExpanded: true,
            decoration: toolbarFieldDecoration('Estado'),
            items: const [
              DropdownMenuItem(
                value: _VisibilityFilterOption.all,
                child: Text('Estado: Todos'),
              ),
              DropdownMenuItem(
                value: _VisibilityFilterOption.visible,
                child: Text('Estado: Disponibles'),
              ),
              DropdownMenuItem(
                value: _VisibilityFilterOption.hidden,
                child: Text('Estado: Ocultos'),
              ),
            ],
            onChanged: disabled
                ? null
                : (value) {
                    if (value == null) return;
                    setState(() {
                      _productVisibilityFilter = value;
                      _desktopProductPage = 0;
                    });
                  },
          ),
        ),
        const SizedBox(width: 8),
        OutlinedButton(
          onPressed: disabled
              ? null
              : () {
                  setState(() {
                    _productSortOption = _ProductSortOption.nameAsc;
                    _desktopProductPage = 0;
                  });
                },
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(44, 44),
            padding: EdgeInsets.zero,
            backgroundColor: Colors.white,
            side: BorderSide(color: borderColor),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          child: const Icon(Icons.tune_rounded, color: Color(0xFF6B6F92), size: 20),
        ),
      ],
    );
  }

  Widget _buildDesktopEmptyState({
    required Color purple,
    required bool disabled,
  }) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE8EAF2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.restaurant_menu_rounded, size: 40, color: purple),
          const SizedBox(height: 16),
          Text(
            'Tu menú está vacío',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF11183C),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Comienza creando tu primera categoría\no deja que la IA lo haga por ti.',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: const Color(0xFF6B6F92),
              height: 1.45,
            ),
          ),
          const SizedBox(height: 20),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton(
                onPressed: disabled ? null : _createCategory,
                style: FilledButton.styleFrom(
                  backgroundColor: purple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Crear categoría'),
              ),
              OutlinedButton.icon(
                onPressed: disabled ? null : _openAiMenuGenerator,
                icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                label: const Text('Crear con IA'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: purple,
                  side: BorderSide(color: purple.withValues(alpha: 0.35)),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDesktopCategorySidebar({
    required List<CategoryModel> categories,
    required String selectedCategoryId,
    required Color borderColor,
    required Color purple,
    required Color darkText,
    required Color mutedText,
    required bool disabled,
  }) {
    return SizedBox(
      width: 280,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 12, 12),
              child: Row(
                children: [
                  Text(
                    'Categorías',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: darkText,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${categories.length}',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: mutedText,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Material(
                    color: purple.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      onTap: disabled ? null : _createCategory,
                      borderRadius: BorderRadius.circular(8),
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Icon(Icons.add_rounded, size: 18, color: purple),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: categories.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          'No hay categorías que coincidan con tu búsqueda.',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            color: mutedText,
                            fontWeight: FontWeight.w500,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      itemCount: categories.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final category = categories[index];
                        final isSelected =
                            selectedCategoryId == category.id.trim();
                        final count =
                            _productCountByCategory[category.id] ?? 0;
                        return Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () => _selectDesktopCategory(category.id),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 1),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? purple.withValues(alpha: 0.08)
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(10),
                                border: isSelected
                                    ? null
                                    : Border.all(color: Colors.transparent),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 4,
                                    height: 52,
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? purple
                                          : Colors.transparent,
                                      borderRadius: const BorderRadius.horizontal(
                                        left: Radius.circular(10),
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 10,
                                      ),
                                      child: Row(
                                        children: [
                                          SizedBox(
                                            width: 28,
                                            height: 28,
                                            child: Center(
                                              child: _buildCategoryIconVisual(
                                                iconValue: category.icono,
                                                name: category.nombre,
                                                size: 22,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  category.nombre,
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 14,
                                                    fontWeight: FontWeight.w600,
                                                    color: isSelected
                                                        ? purple
                                                        : darkText,
                                                  ),
                                                ),
                                                Text(
                                                  '$count producto${count == 1 ? '' : 's'}',
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w500,
                                                    color: mutedText,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          PopupMenuButton<String>(
                                            enabled: !disabled,
                                            icon: Icon(
                                              Icons.more_vert_rounded,
                                              size: 20,
                                              color: mutedText,
                                            ),
                                            padding: EdgeInsets.zero,
                                            onSelected: (value) {
                                              switch (value) {
                                                case 'edit':
                                                  unawaited(
                                                    _editCategory(category),
                                                  );
                                                  break;
                                                case 'delete':
                                                  unawaited(
                                                    _deleteCategory(category),
                                                  );
                                                  break;
                                              }
                                            },
                                            itemBuilder: (_) => const [
                                              PopupMenuItem(
                                                value: 'edit',
                                                child: Text('Editar'),
                                              ),
                                              PopupMenuItem(
                                                value: 'delete',
                                                child: Text('Eliminar'),
                                              ),
                                            ],
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
                      },
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: OutlinedButton.icon(
                onPressed: disabled ? null : _createCategory,
                icon: Icon(Icons.add_rounded, size: 18, color: purple),
                label: Text(
                  'Nueva categoría',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    color: purple,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: purple,
                  backgroundColor: Colors.white,
                  side: BorderSide(
                    color: purple.withValues(alpha: 0.45),
                    width: 1.2,
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDesktopProductsPanel({
    required CategoryModel? selectedCategory,
    required Color borderColor,
    required Color purple,
    required Color darkText,
    required Color mutedText,
    required bool disabled,
  }) {
    final panelProducts = _desktopPanelProducts;
    final totalProducts = panelProducts.length;
    final totalPages = _desktopTotalProductPages;
    if (_desktopProductPage >= totalPages && totalPages > 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _desktopProductPage = totalPages - 1);
      });
    }
    final pagedProducts = _desktopPagedProducts;
    final start = totalProducts == 0 ? 0 : (_desktopProductPage * _desktopPageSize) + 1;
    final end = min((_desktopProductPage + 1) * _desktopPageSize, totalProducts);
    final title = selectedCategory == null
        ? 'Todos los productos ($totalProducts)'
        : 'Productos en ${selectedCategory.nombre} ($totalProducts)';

    return LayoutBuilder(
      builder: (context, constraints) {
        return SizedBox(
          width: constraints.maxWidth,
          height: constraints.maxHeight,
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: borderColor),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: darkText,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 200,
                        child: DropdownButtonFormField<_ProductSortOption>(
                          value: _productSortOption,
                          isExpanded: true,
                          decoration: InputDecoration(
                            isDense: true,
                            filled: true,
                            fillColor: const Color(0xFFF9FAFB),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(color: borderColor),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(color: borderColor),
                            ),
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: _ProductSortOption.nameAsc,
                              child: Text('Ordenar: Nombre A-Z'),
                            ),
                            DropdownMenuItem(
                              value: _ProductSortOption.nameDesc,
                              child: Text('Ordenar: Nombre Z-A'),
                            ),
                            DropdownMenuItem(
                              value: _ProductSortOption.priceAsc,
                              child: Text('Ordenar: Precio ↑'),
                            ),
                            DropdownMenuItem(
                              value: _ProductSortOption.priceDesc,
                              child: Text('Ordenar: Precio ↓'),
                            ),
                            DropdownMenuItem(
                              value: _ProductSortOption.order,
                              child: Text('Ordenar: Manual'),
                            ),
                          ],
                          onChanged: disabled
                              ? null
                              : (value) {
                                  if (value == null) return;
                                  setState(() {
                                    _productSortOption = value;
                                    _desktopProductPage = 0;
                                  });
                                },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: borderColor),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              onPressed: disabled
                                  ? null
                                  : () => setState(
                                        () => _desktopProductGridView = false,
                                      ),
                              icon: Icon(
                                Icons.view_list_rounded,
                                size: 20,
                                color: !_desktopProductGridView
                                    ? purple
                                    : mutedText,
                              ),
                              tooltip: 'Vista lista',
                            ),
                            IconButton(
                              onPressed: disabled
                                  ? null
                                  : () => setState(
                                        () => _desktopProductGridView = true,
                                      ),
                              icon: Icon(
                                Icons.grid_view_rounded,
                                size: 20,
                                color: _desktopProductGridView
                                    ? purple
                                    : mutedText,
                              ),
                              tooltip: 'Vista cuadrícula',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (!_desktopProductGridView) const Divider(height: 1, color: Color(0xFFE8EAF2)),
                if (!_desktopProductGridView) const _DesktopProductsTableHeader(),
                Expanded(
                  child: totalProducts == 0
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.inventory_2_outlined,
                            size: 40,
                            color: mutedText,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Sin productos',
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: darkText,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Agrega tu primer producto para empezar a vender.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: mutedText,
                            ),
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: disabled
                                ? null
                                : () => _openProductFormDirect(
                                      initialCategoryId:
                                          _selectedProductCategoryId,
                                    ),
                            style: FilledButton.styleFrom(
                              backgroundColor: purple,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                                vertical: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: const Text('Crear producto'),
                          ),
                        ],
                      ),
                    ),
                  )
                : _desktopProductGridView
                    ? GridView.builder(
                        padding: const EdgeInsets.all(16),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 1.35,
                        ),
                        itemCount: pagedProducts.length,
                        itemBuilder: (context, index) {
                          final product = pagedProducts[index];
                          return _DashboardProductCard(
                            key: ValueKey('desktop-grid-${product.id}'),
                            product: product,
                            categoryName: _categoryNameFor(product.categoriaId),
                            priceLabel: _formatProductPrice(product.precio),
                            priceSecondaryLabel:
                                _formatProductPriceSecondary(product.precio),
                            onEdit: () => _openProductFormDirect(product: product),
                            onToggleVisible: () {
                              if (product.disponible) {
                                unawaited(_hideProduct(product));
                              } else {
                                unawaited(_showProduct(product));
                              }
                            },
                            onImproveImage: () =>
                                _generateAiImageForProduct(product),
                          );
                        },
                      )
                    : ListView.separated(
                        padding: EdgeInsets.zero,
                        itemCount: pagedProducts.length,
                        separatorBuilder: (_, _) => const Divider(
                          height: 1,
                          color: Color(0xFFF3F4F6),
                        ),
                        itemBuilder: (context, index) {
                          final product = pagedProducts[index];
                          return _DesktopProductsTableRow(
                            product: product,
                            priceLabel: _formatProductPrice(product.precio),
                            priceSecondaryLabel:
                                _formatProductPriceSecondary(product.precio),
                            disabled: disabled,
                            onEdit: () => _openProductFormDirect(product: product),
                            onToggleVisibility: () {
                              if (product.disponible) {
                                unawaited(_hideProduct(product));
                              } else {
                                unawaited(_showProduct(product));
                              }
                            },
                            onImproveImage: () =>
                                _generateAiImageForProduct(product),
                          );
                        },
                      ),
          ),
          const Divider(height: 1, color: Color(0xFFE8EAF2)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(
              children: [
                Text(
                  totalProducts == 0
                      ? 'Sin productos para mostrar'
                      : 'Mostrando $start a $end de $totalProducts productos',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: mutedText,
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: _desktopProductPage > 0
                      ? () => setState(() => _desktopProductPage -= 1)
                      : null,
                  icon: const Icon(Icons.chevron_left_rounded),
                  tooltip: 'Página anterior',
                ),
                ...List.generate(totalPages, (index) {
                  final isActive = index == _desktopProductPage;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: TextButton(
                      onPressed: () => setState(() => _desktopProductPage = index),
                      style: TextButton.styleFrom(
                        minimumSize: const Size(36, 36),
                        backgroundColor: isActive
                            ? purple.withValues(alpha: 0.12)
                            : Colors.transparent,
                        foregroundColor: isActive ? purple : mutedText,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(
                        '${index + 1}',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  );
                }),
                IconButton(
                  onPressed: _desktopProductPage < totalPages - 1
                      ? () => setState(() => _desktopProductPage += 1)
                      : null,
                  icon: const Icon(Icons.chevron_right_rounded),
                  tooltip: 'Página siguiente',
                ),
              ],
            ),
          ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildMobileMenuLayout({
    required double horizontalPadding,
    required double contentMaxWidth,
  }) {
    final tabSections = _buildCurrentTabSections();

    final scrollView = CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(
        parent: ClampingScrollPhysics(),
      ),
      slivers: [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(
            horizontalPadding,
            12,
            horizontalPadding,
            0,
          ),
          sliver: SliverToBoxAdapter(
            child: _buildDashboardHeaderCard(isDesktop: false),
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(
            horizontalPadding,
            12,
            horizontalPadding,
            120,
          ),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _SegmentTabsContainer(
                selectedTabIndex: _selectedTabIndex,
                onSelected: (index) {
                  if (!mounted) return;
                  setState(() {
                    _selectedTabIndex = index;
                    _categoryVisibleCount = 20;
                    _productVisibleCount = 24;
                  });
                },
              ),
              const SizedBox(height: 14),
              ...tabSections,
            ]),
          ),
        ),
      ],
    );

    return SafeArea(
      top: false,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: contentMaxWidth),
          child: scrollView,
        ),
      ),
    );
  }

  Widget _buildDashboardHeaderCard({required bool isDesktop}) {
    final activeCategories = _categories.where((item) => item.activo).length;
    final totalProducts = _productCountByCategory.values.fold<int>(
      0,
      (sum, count) => sum + count,
    );

    return Container(
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
        mainAxisSize: MainAxisSize.min,
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
                        backgroundColor:
                            const Color(0xFF6D28D9).withValues(alpha: 0.1),
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
                  backgroundColor:
                      const Color(0xFF6D28D9).withValues(alpha: 0.1),
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
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final showInitialLoading =
        _loading && !_hasLoadedInitialSnapshot && _categories.isEmpty;

    if (showInitialLoading) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

    final screenWidth = MediaQuery.sizeOf(context).width;
    final isDesktopLayout = screenWidth >= 1024;

    return Scaffold(
      backgroundColor: isDesktopLayout
          ? const Color(0xFFF8F7FC)
          : const Color(0xFFF8F7FB),
      appBar: AppBar(
        backgroundColor: isDesktopLayout
            ? const Color(0xFFF8F7FC)
            : colorScheme.surfaceContainerHighest,
        foregroundColor: colorScheme.onSurface,
        elevation: isDesktopLayout ? 0 : null,
        scrolledUnderElevation: isDesktopLayout ? 0 : null,
        titleTextStyle: GoogleFonts.manrope(
          color: colorScheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
        title: isDesktopLayout
            ? null
            : (_showAppBarSearch
                ? TextField(
                    controller: _searchController,
                    autofocus: true,
                    onChanged: (value) {
                      if (!mounted) return;
                      setState(() {
                        _searchQuery = value;
                        _categoryVisibleCount = 20;
                        _productVisibleCount = 24;
                      });
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
                  )),
        actions: [
          if (!isDesktopLayout)
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
      body: LayoutBuilder(
        builder: (context, constraints) {
          final viewportWidth = constraints.maxWidth;
          final contentMaxWidth =
              viewportWidth >= 1200 ? 1280.0 : double.infinity;
          final horizontalPadding = viewportWidth >= 1200
              ? 28.0
              : (viewportWidth >= 720 ? 24.0 : 16.0);

          if (isDesktopLayout) {
            final contentWidth = contentMaxWidth == double.infinity
                ? viewportWidth
                : min(viewportWidth, contentMaxWidth);

            return Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                width: contentWidth,
                height: constraints.maxHeight,
                child: _buildDesktopMenuLayout(
                  horizontalPadding: horizontalPadding,
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _loadCategories,
            color: colorScheme.primary,
            child: _buildMobileMenuLayout(
              horizontalPadding: horizontalPadding,
              contentMaxWidth: contentMaxWidth,
            ),
          );
        },
      ),
    );
  }
}

class _DesktopProductsTableHeader extends StatelessWidget {
  const _DesktopProductsTableHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      color: const Color(0xFFF9FAFB),
      child: Row(
        children: [
          const Expanded(
            flex: 5,
            child: Text(
              'Producto',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(
            width: 100,
            child: Text(
              'Precio',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(
            width: 120,
            child: Text(
              'Estado',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(
            width: 140,
            child: Text(
              'Acciones',
              textAlign: TextAlign.end,
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DesktopProductsTableRow extends StatelessWidget {
  const _DesktopProductsTableRow({
    required this.product,
    required this.priceLabel,
    this.priceSecondaryLabel,
    required this.disabled,
    required this.onEdit,
    required this.onToggleVisibility,
    required this.onImproveImage,
  });

  final ProductModel product;
  final String priceLabel;
  final String? priceSecondaryLabel;
  final bool disabled;
  final VoidCallback onEdit;
  final VoidCallback onToggleVisibility;
  final VoidCallback onImproveImage;

  @override
  Widget build(BuildContext context) {
    final description = product.descripcion.trim();
    final statusLabel = product.disponible ? 'Disponible' : 'Agotado';
    final statusColor =
        product.disponible ? const Color(0xFF16A34A) : const Color(0xFFF97316);

    Widget thumb() {
      final imageUrl = product.imagenUrl?.trim();
      if (imageUrl != null && imageUrl.isNotEmpty) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.network(
            imageUrl,
            width: 44,
            height: 44,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const _ProductThumbPlaceholder(
              icon: Icons.fastfood_rounded,
            ),
          ),
        );
      }
      return const SizedBox(
        width: 44,
        height: 44,
        child: _ProductThumbPlaceholder(icon: Icons.fastfood_rounded),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 5,
            child: Row(
              children: [
                thumb(),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.nombre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF11183C),
                        ),
                      ),
                      if (description.isNotEmpty)
                        Text(
                          description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: const Color(0xFF6B6F92),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            width: 100,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  priceLabel,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF11183C),
                  ),
                ),
                if (priceSecondaryLabel != null)
                  Text(
                    priceSecondaryLabel!,
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: const Color(0xFF6B6F92),
                    ),
                  ),
              ],
            ),
          ),
          SizedBox(
            width: 120,
            child: _ProductStatusPill(label: statusLabel, color: statusColor),
          ),
          SizedBox(
            width: 140,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  onPressed: disabled ? null : onEdit,
                  icon: const Icon(Icons.edit_outlined, size: 20),
                  color: const Color(0xFF6B6F92),
                  tooltip: 'Editar',
                ),
                Switch(
                  value: product.disponible,
                  onChanged: disabled ? null : (_) => onToggleVisibility(),
                  activeColor: const Color(0xFF7C3AED),
                ),
                PopupMenuButton<String>(
                  enabled: !disabled,
                  icon: const Icon(
                    Icons.more_vert_rounded,
                    size: 20,
                    color: Color(0xFF6B6F92),
                  ),
                  onSelected: (value) {
                    switch (value) {
                      case 'image':
                        onImproveImage();
                        break;
                      case 'toggle':
                        onToggleVisibility();
                        break;
                    }
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(
                      value: 'image',
                      child: Text('Generar imagen con IA'),
                    ),
                    PopupMenuItem(
                      value: 'toggle',
                      child: Text(
                        product.disponible ? 'Marcar como agotado' : 'Marcar disponible',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
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
  });

  final CategoryModel category;
  final bool enabled;
  final int productCount;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleActive;
  final Widget? dragHandle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
    required this.priceLabel,
    this.priceSecondaryLabel,
    required this.onEdit,
    required this.onToggleVisible,
    required this.onImproveImage,
  });

  final ProductModel product;
  final String categoryName;
  final String priceLabel;
  final String? priceSecondaryLabel;
  final VoidCallback onEdit;
  final VoidCallback onToggleVisible;
  final VoidCallback onImproveImage;

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
                      priceLabel,
                      style: GoogleFonts.manrope(
                        color: const Color(0xFF6D28D9),
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (priceSecondaryLabel != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        priceSecondaryLabel!,
                        style: GoogleFonts.manrope(
                          color: const Color(0xFF6B7280),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
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
                    SizedBox(
                      width: double.infinity,
                      child: _CategoryActionButton(
                        icon: Icons.auto_awesome_rounded,
                        label: 'Mejorar IA',
                        onTap: onImproveImage,
                      ),
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
  _CategoryEmojiOption(emoji: '🎬', label: 'Películas', keywords: ['pelicula', 'películas', 'peliculas', 'cine', 'movie', 'film']),
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

String _normalizeEmojiGlyph(String emoji) {
  return emoji.replaceAll('\uFE0F', '').replaceAll('\uFE0E', '').trim();
}

_CategoryEmojiOption? _categoryEmojiOptionByEmoji(String? emoji) {
  final normalized = _normalizeStoredIconValue(emoji);
  if (normalized == null) {
    return null;
  }
  final comparable = _normalizeEmojiGlyph(normalized);
  for (final option in _categoryEmojiOptions) {
    if (_normalizeEmojiGlyph(option.emoji) == comparable) {
      return option;
    }
  }
  return null;
}

String _canonicalCategoryEmoji(String emoji) {
  return _categoryEmojiOptionByEmoji(emoji)?.emoji ?? emoji;
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

/// Icono único para lista, preview y editor (ignora SVG/claves Material legadas).
String _resolveCategoryVisualIcon({
  required String? storedIcon,
  required String categoryName,
}) {
  final normalized = _normalizeStoredIconValue(storedIcon);
  if (_isImageUrlContent(normalized)) {
    return normalized!;
  }
  if (_isEmojiContent(normalized)) {
    return _canonicalCategoryEmoji(normalized!);
  }
  final name = categoryName.trim();
  if (name.isNotEmpty) {
    return _suggestCategoryEmoji(name);
  }
  return '🏷️';
}

Widget _buildCategoryIconVisual({
  required String? iconValue,
  String? name,
  double size = 28,
}) {
  final resolved = _resolveCategoryVisualIcon(
    storedIcon: iconValue,
    categoryName: name ?? '',
  );

  if (_isImageUrlContent(resolved)) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.35),
      child: Image.network(
        resolved,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _buildCategoryEmojiGlyph(
          _suggestCategoryEmoji(name ?? ''),
          size: size,
        ),
      ),
    );
  }

  return _buildCategoryEmojiGlyph(resolved, size: size);
}

/// Emoji aislado para no heredar Poppins ni alterar el texto adyacente.
Widget _buildCategoryEmojiGlyph(String emoji, {required double size}) {
  return SizedBox(
    width: size,
    height: size,
    child: Center(
      child: Text(
        emoji,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: size * 0.95,
          height: 1,
          inherit: false,
          fontFamily: 'Noto Color Emoji, Apple Color Emoji, Segoe UI Emoji, sans-serif',
        ),
      ),
    ),
  );
}
