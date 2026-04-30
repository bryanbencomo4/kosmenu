// ignore_for_file: avoid_print

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/product_form_screen.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
import 'package:kosmenu_app/services/ai_image_service.dart';
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
                  borderRadius: BorderRadius.circular(18),
                  color: colorScheme.surfaceContainerHigh,
                  border: Border.all(
                    color: colorScheme.primary.withValues(alpha: 0.28),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.menu_book_rounded,
                      size: 38,
                      color: colorScheme.primary,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Aún no tienes un menú creado',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: colorScheme.onSurface,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Por ahora trabajamos con un solo menú. Se creará automáticamente como "Menu principal".',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: colorScheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _isCreating ? null : _createFirstCatalog,
                        icon: const Icon(Icons.add_rounded),
                        label: Text(
                          _isCreating ? 'Creando...' : 'Crear menú principal',
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

class CatalogListScreen extends StatefulWidget {
  const CatalogListScreen({super.key});

  @override
  State<CatalogListScreen> createState() => _CatalogListScreenState();
}

class _CatalogListScreenState extends State<CatalogListScreen> {
  bool _loading = true;
  bool _isMutating = false;
  List<CatalogModel> _catalogs = <CatalogModel>[];

  bool get _canCreateCatalog => _catalogs.isEmpty;

  @override
  void initState() {
    super.initState();
    _loadCatalogs();
  }

  Future<void> _loadCatalogs() async {
    if (!mounted) return;
    final comercioId = SupabaseConfig.currentComercioId.trim();
    print('DEBUG: Buscando catálogos para comercio: $comercioId');

    if (comercioId.isEmpty) {
      setState(() {
        _catalogs = <CatalogModel>[];
        _loading = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No hay comercio_id configurado para cargar catálogos.',
          ),
        ),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      final rows = await Supabase.instance.client
          .from('catalogos')
          .select()
          .eq('comercio_id', comercioId)
          .order('orden', ascending: true)
          .order('nombre', ascending: true);

      print('DEBUG: response.status: success');
      print('DEBUG: response.data: $rows');
      print('DEBUG: Resultado de Supabase: $rows');

      final catalogs = (rows as List<dynamic>)
          .map(
            (row) =>
                CatalogModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .toList();

      if (!mounted) return;
      setState(() => _catalogs = catalogs);
    } catch (error) {
      print('DEBUG: response.status: error');
      print('DEBUG: response.data: null');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudieron cargar catálogos: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<String?> _showNameDialog({
    required String title,
    String initialValue = '',
  }) async {
    String draft = initialValue;
    final colorScheme = Theme.of(context).colorScheme;

    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colorScheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        titlePadding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
        contentPadding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
        actionsPadding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
        title: Text(
          title,
          style: GoogleFonts.manrope(
            color: colorScheme.onSurface,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Container(
          decoration: BoxDecoration(
            color: colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: TextFormField(
            initialValue: initialValue,
            onChanged: (value) => draft = value,
            onFieldSubmitted: (value) =>
                Navigator.of(dialogContext).pop(value.trim()),
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            style: TextStyle(color: colorScheme.onSurface),
            cursorColor: colorScheme.primary,
            decoration: InputDecoration(
              hintText: 'Nombre',
              hintStyle: TextStyle(color: colorScheme.onSurfaceVariant),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              errorBorder: InputBorder.none,
              focusedErrorBorder: InputBorder.none,
              disabledBorder: InputBorder.none,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(vertical: 14),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(
              'Cancelar',
              style: TextStyle(color: colorScheme.onSurfaceVariant),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(draft.trim()),
            style: FilledButton.styleFrom(
              backgroundColor: colorScheme.primary,
              foregroundColor: colorScheme.onPrimary,
            ),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _createCatalog() async {
    if (_isMutating) return;
    if (!_canCreateCatalog) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Por ahora solo se permite 1 catalogo por negocio.'),
        ),
      );
      return;
    }

    final name = await _showNameDialog(title: 'Nuevo Catálogo');
    if (!mounted || name == null || name.isEmpty) return;

    setState(() => _isMutating = true);
    try {
      final maxOrder = _catalogs.isEmpty
          ? 0
          : _catalogs.map((c) => c.orden).reduce((a, b) => a > b ? a : b) + 1;

      await Supabase.instance.client.from('catalogos').insert({
        'comercio_id': SupabaseConfig.currentComercioId,
        'nombre': name,
        'orden': maxOrder,
        'activo': true,
      });

      await _loadCatalogs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo crear catálogo: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _editCatalog(CatalogModel catalog) async {
    if (_isMutating) return;
    final name = await _showNameDialog(
      title: 'Editar Catálogo',
      initialValue: catalog.nombre,
    );
    if (!mounted || name == null || name.isEmpty || name == catalog.nombre) {
      return;
    }

    setState(() => _isMutating = true);
    try {
      await Supabase.instance.client
          .from('catalogos')
          .update({'nombre': name})
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('id', catalog.id);

      await _loadCatalogs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo editar catálogo: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _deleteCatalog(CatalogModel catalog) async {
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
            'Eliminar catálogo',
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            '¿Eliminar "${catalog.nombre}" y sus categorías?',
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

    setState(() => _isMutating = true);
    try {
      await Supabase.instance.client
          .from('catalogos')
          .delete()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('id', catalog.id)
          .select('id');

      await _loadCatalogs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar catálogo: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _openCategories(CatalogModel catalog) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CatalogCategoriesScreen(catalog: catalog),
      ),
    );

    await _loadCatalogs();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    if (_loading) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        backgroundColor: colorScheme.surfaceContainerHighest,
        foregroundColor: colorScheme.onSurface,
        titleTextStyle: GoogleFonts.manrope(
          color: colorScheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w800,
        ),
        title: const Text('Gestión de Catálogos'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: (_loading || _isMutating || !_canCreateCatalog)
            ? null
            : _createCatalog,
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        icon: Icon(_canCreateCatalog ? Icons.add : Icons.block_rounded),
        label: Text(_canCreateCatalog ? 'Nuevo Catálogo' : '1 catálogo activo'),
      ),
      body: RefreshIndicator(
        onRefresh: _loadCatalogs,
        child: _catalogs.isEmpty
            ? ListView(
                physics: AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: 160),
                  Center(
                    child: Text(
                      'No hay catálogos creados',
                      style: TextStyle(color: colorScheme.onSurfaceVariant),
                    ),
                  ),
                ],
              )
            : ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
                itemCount: _catalogs.length,
                itemBuilder: (context, index) {
                  final catalog = _catalogs[index];
                  return _CatalogCard(
                    catalog: catalog,
                    enabled: !_isMutating,
                    onOpen: () => _openCategories(catalog),
                    onEdit: () => _editCatalog(catalog),
                    onDelete: () => _deleteCatalog(catalog),
                  );
                },
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

  Future<void> _loadCategories() async {
    if (!mounted) return;
    if (_currentCatalogoId.isEmpty) {
      setState(() {
        _categories = <CategoryModel>[];
        _loading = false;
      });
      return;
    }

    setState(() => _loading = true);
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
      setState(() => _categories = categories);
      await _loadProducts(categories);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudieron cargar categorías: $error')),
      );
    } finally {
      if (mounted) {
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
      unawaited(_loadCategories());
    });
  }

  Future<String?> _showNameDialog({
    required String title,
    String initialValue = '',
  }) async {
    String draft = initialValue;
    final colorScheme = Theme.of(context).colorScheme;

    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: colorScheme.surfaceContainerHigh,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        titlePadding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
        contentPadding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
        actionsPadding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
        title: Text(
          title,
          style: GoogleFonts.manrope(
            color: colorScheme.onSurface,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Container(
          decoration: BoxDecoration(
            color: colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: TextFormField(
            initialValue: initialValue,
            onChanged: (value) => draft = value,
            onFieldSubmitted: (value) =>
                Navigator.of(dialogContext).pop(value.trim()),
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            style: TextStyle(color: colorScheme.onSurface),
            cursorColor: colorScheme.primary,
            decoration: InputDecoration(
              hintText: 'Nombre de la categoría',
              hintStyle: TextStyle(color: colorScheme.onSurfaceVariant),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              errorBorder: InputBorder.none,
              focusedErrorBorder: InputBorder.none,
              disabledBorder: InputBorder.none,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(vertical: 14),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(
              'Cancelar',
              style: TextStyle(color: colorScheme.onSurfaceVariant),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(draft.trim()),
            style: FilledButton.styleFrom(
              backgroundColor: colorScheme.primary,
              foregroundColor: colorScheme.onPrimary,
            ),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _createCategory() async {
    if (_isMutating) return;
    final name = await _showNameDialog(title: 'Nueva Categoría');
    if (!mounted || name == null || name.isEmpty) return;
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
        'nombre': name,
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
    final name = await _showNameDialog(
      title: 'Editar Categoría',
      initialValue: category.nombre,
    );
    if (!mounted || name == null || name.isEmpty || name == category.nombre) {
      return;
    }

    setState(() => _isMutating = true);
    try {
      await Supabase.instance.client
          .from('categorias')
          .update({'nombre': name})
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
    switch (_selectedTabIndex) {
      case 0:
        return _buildAllTabSections();
      case 1:
        return _buildCategoriesTabSections();
      case 2:
        return _buildProductsTabSections();
      case 3:
        return _buildHiddenTabSections();
      default:
        return _buildAllTabSections();
    }
  }

  List<Widget> _buildAllTabSections() {
    final featuredCategories = _filteredCategories.take(3).toList();
    final featuredProducts = _searchFilteredProducts.take(6).toList();

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
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _QuickActionCard(
              icon: Icons.inventory_2_rounded,
              title: 'Nuevo producto',
              subtitle: 'Vende más rápido',
              onTap: _openProductFormDirect,
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
        ...featuredCategories.map(
          (category) => _CategoryCard(
            category: category,
            enabled: !_isMutating,
            productCount: _productCountByCategory[category.id] ?? 0,
            onOpen: () => _openProducts(category),
            onEdit: () => _editCategory(category),
            onDelete: () => _deleteCategory(category),
            onToggleActive: (value) => _toggleCategoryActive(category, value),
          ),
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

  List<Widget> _buildCategoriesTabSections() {
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

    if (_searchQuery.trim().isNotEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            'Desactiva la búsqueda para reordenar categorías.',
            style: GoogleFonts.manrope(
              color: const Color(0xFF6B7280),
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ...filtered.map(
          (category) => _CategoryCard(
            key: ValueKey('category-${category.id}'),
            category: category,
            enabled: !_isMutating,
            productCount: _productCountByCategory[category.id] ?? 0,
            onOpen: () => _openProducts(category),
            onEdit: () => _editCategory(category),
            onDelete: () => _deleteCategory(category),
            onToggleActive: (value) => _toggleCategoryActive(category, value),
          ),
        ),
      ];
    }

    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          _isSavingCategoryOrder
              ? 'Guardando nuevo orden...'
              : 'Arrastra las categorías para cambiar su orden.',
          style: GoogleFonts.manrope(
            color: const Color(0xFF6B7280),
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      ReorderableListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        buildDefaultDragHandles: false,
        itemCount: _categories.length,
        onReorder: _onCategoryReorder,
        itemBuilder: (context, index) {
          final category = _categories[index];
          return _CategoryCard(
            key: ValueKey('category-${category.id}'),
            category: category,
            enabled: !_isMutating && !_isSavingCategoryOrder,
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

  List<Widget> _buildHiddenTabSections() {
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
        ...hiddenCategories.map(
          (category) => _CategoryCard(
            category: category,
            enabled: !_isMutating,
            productCount: _productCountByCategory[category.id] ?? 0,
            onOpen: () => _openProducts(category),
            onEdit: () => _editCategory(category),
            onDelete: () => _deleteCategory(category),
            onToggleActive: (value) => _toggleCategoryActive(category, value),
          ),
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
    if (_loading) {
      return const BrandedLoadingScreen(withScaffold: true);
    }

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
        title: _showAppBarSearch
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
          IconButton(
            onPressed: _toggleAppBarSearch,
            icon: Icon(
              _showAppBarSearch ? Icons.close_rounded : Icons.search_rounded,
            ),
            tooltip: _showAppBarSearch ? 'Cerrar búsqueda' : 'Buscar en el menú',
          ),
        ],
      ),
      floatingActionButton: _buildContextualFab(),
      body: RefreshIndicator(
        onRefresh: _loadCategories,
        color: colorScheme.primary,
        child: SafeArea(
          top: false,
          child: ListView(
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
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
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
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
                              InkWell(
                                onTap: _openAiMenuGenerator,
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
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: _StatChip(
                                      label: 'Categorías',
                                      value: '${_categories.length}',
                                      icon: Icons.folder_rounded,
                                      tint: const Color(0xFF7C3AED),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _StatChip(
                                      label: 'Activas',
                                      value: '$activeCategories',
                                      icon: Icons.check_circle_rounded,
                                      tint: const Color(0xFF16A34A),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _StatChip(
                                      label: 'Productos',
                                      value: '$totalProducts',
                                      icon: Icons.inventory_2_rounded,
                                      tint: const Color(0xFF3B82F6),
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
                Container(
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
                      selectedIndex: _selectedTabIndex,
                      tabs: const ['Todos', 'Categorías', 'Productos', 'Ocultos'],
                      onSelected: (index) {
                        if (!mounted) return;
                        setState(() => _selectedTabIndex = index);
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                ..._buildCurrentTabSections(),
            ],
          ),
        ),
      ),
    );
  }
}

class _CatalogCard extends StatelessWidget {
  const _CatalogCard({
    required this.catalog,
    required this.enabled,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
  });

  final CatalogModel catalog;
  final bool enabled;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      color: colorScheme.surfaceContainerHigh,
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shadowColor: Colors.black.withValues(alpha: 0.18),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    catalog.nombre,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.manrope(
                      color: colorScheme.onSurface,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  onPressed: enabled ? onOpen : null,
                  icon: const Icon(Icons.folder_open_rounded, size: 18),
                  tooltip: 'Abrir categorías',
                  style: IconButton.styleFrom(
                    minimumSize: const Size(32, 32),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    backgroundColor: colorScheme.primary.withValues(
                      alpha: 0.16,
                    ),
                    foregroundColor: colorScheme.primary,
                  ),
                ),
                IconButton(
                  onPressed: enabled ? onEdit : null,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  tooltip: 'Editar catálogo',
                  style: IconButton.styleFrom(
                    minimumSize: const Size(32, 32),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    backgroundColor: colorScheme.secondaryContainer,
                    foregroundColor: colorScheme.onSecondaryContainer,
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  onPressed: enabled ? onDelete : null,
                  icon: const Icon(Icons.delete_outline, size: 18),
                  tooltip: 'Eliminar catálogo',
                  style: IconButton.styleFrom(
                    minimumSize: const Size(32, 32),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    backgroundColor: colorScheme.secondaryContainer,
                    foregroundColor: colorScheme.onSecondaryContainer,
                  ),
                ),
              ],
            ),
          ],
        ),
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
                child: Icon(
                  _categoryIcon(category.nombre),
                  color: const Color(0xFF6D28D9),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      category.nombre,
                      maxLines: 1,
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
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEAE7F2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: tint),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: GoogleFonts.manrope(
              color: const Color(0xFF1F2555),
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.manrope(
              color: const Color(0xFF6B7280),
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
            ),
          ),
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
      child: Container(
        padding: const EdgeInsets.all(14),
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

IconData _categoryIcon(String name) {
  final normalized = name.trim().toLowerCase();
  if (normalized.contains('bebida') || normalized.contains('cafe')) {
    return Icons.local_cafe_rounded;
  }
  if (normalized.contains('perro') || normalized.contains('hot dog')) {
    return Icons.pets_rounded;
  }
  if (normalized.contains('hamburg')) {
    return Icons.lunch_dining_rounded;
  }
  if (normalized.contains('pizza')) {
    return Icons.local_pizza_rounded;
  }
  if (normalized.contains('postre') || normalized.contains('helado')) {
    return Icons.icecream_rounded;
  }
  return Icons.fastfood_rounded;
}
