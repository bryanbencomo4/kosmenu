// ignore_for_file: avoid_print

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
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
  List<CategoryModel> _categories = <CategoryModel>[];
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String _searchQuery = '';
  bool _showAppBarSearch = false;
  double _headerCollapse = 0;
  Map<String, int> _productCountByCategory = <String, int>{};

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
      await _loadProductCounts(categories);
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

  Future<void> _loadProductCounts(List<CategoryModel> categories) async {
    final ids = categories
        .map((e) => e.id.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    if (ids.isEmpty) {
      if (!mounted) return;
      setState(() => _productCountByCategory = <String, int>{});
      return;
    }

    try {
      final rows = await Supabase.instance.client
          .from('productos')
          .select('categoria_id')
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .inFilter('categoria_id', ids);

      final counts = <String, int>{};
      for (final row in (rows as List<dynamic>)) {
        final categoryId = row['categoria_id']?.toString().trim() ?? '';
        if (categoryId.isEmpty) continue;
        counts.update(categoryId, (value) => value + 1, ifAbsent: () => 1);
      }

      if (!mounted) return;
      setState(() => _productCountByCategory = counts);
    } catch (_) {
      if (!mounted) return;
      setState(() => _productCountByCategory = <String, int>{});
    }
  }

  List<CategoryModel> get _filteredCategories {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return _categories;
    return _categories.where((category) {
      final productCount = (_productCountByCategory[category.id] ?? 0)
          .toString();
      return category.nombre.toLowerCase().contains(query) ||
          productCount.contains(query);
    }).toList();
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

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final filtered = _filteredCategories;
    final totalProducts = _productCountByCategory.values.fold<int>(
      0,
      (sum, count) => sum + count,
    );
    final activeCategories = _categories.where((item) => item.activo).length;
    final headerScale = (1 - (_headerCollapse * 0.2)).clamp(0.82, 1.0);
    final headerOpacity = (1 - (_headerCollapse * 1.45)).clamp(0.0, 1.0);
    final headerHeightFactor = (1 - (_headerCollapse * 1.4)).clamp(0.0, 1.0);
    final showCompactHeader = _headerCollapse > 0.86;

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
                  hintText: 'Buscar categoría...',
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
            tooltip: _showAppBarSearch ? 'Cerrar búsqueda' : 'Buscar categoría',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: (_loading || _isMutating) ? null : _createCategory,
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        icon: const Icon(Icons.add),
        label: const Text('Nueva Categoría'),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      colorScheme.surfaceContainerHighest.withValues(
                        alpha: 0.34,
                      ),
                      colorScheme.surface,
                    ],
                  ),
                ),
              ),
            ),
          ),
          RefreshIndicator(
            onRefresh: _loadCategories,
            color: colorScheme.primary,
            child: SafeArea(
              top: false,
              child: Stack(
                children: [
                  ListView(
                    controller: _scrollController,
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
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
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(18),
                                  color: colorScheme.surfaceContainerHigh,
                                  border: Border.all(
                                    color: colorScheme.outlineVariant,
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x1F000000),
                                      blurRadius: 22,
                                      offset: Offset(0, 9),
                                    ),
                                  ],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Estructura del menú',
                                      style: GoogleFonts.manrope(
                                        color: colorScheme.onSurface,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 17,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Organiza categorías claras para que agregar y encontrar productos sea más rápido.',
                                      style: TextStyle(
                                        color: colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    SizedBox(
                                      width: double.infinity,
                                      child: FilledButton.icon(
                                      onPressed: _openAiMenuGenerator,
                                      icon: const Icon(
                                        Icons.auto_awesome_rounded,
                                        size: 18,
                                      ),
                                      label: const Text('✨ Generar menú con IA'),
                                      style: FilledButton.styleFrom(
                                        minimumSize: const Size.fromHeight(52),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 18,
                                          vertical: 14,
                                        ),
                                        backgroundColor: colorScheme.primary,
                                        foregroundColor: colorScheme.onPrimary,
                                        textStyle: GoogleFonts.manrope(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 14,
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(14),
                                        ),
                                      ),
                                    ),
                                    ),
                                    const SizedBox(height: 10),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        _StatChip(
                                          label: 'Categorías',
                                          value: '${_categories.length}',
                                        ),
                                        _StatChip(
                                          label: 'Activas',
                                          value: '$activeCategories',
                                        ),
                                        _StatChip(
                                          label: 'Productos',
                                          value: '$totalProducts',
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
                      const SizedBox(height: 10),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        switchInCurve: Curves.easeOut,
                        switchOutCurve: Curves.easeIn,
                        child: showCompactHeader
                            ? Padding(
                                key: const ValueKey('compact-category-header'),
                                padding: const EdgeInsets.only(
                                  top: 8,
                                  bottom: 10,
                                ),
                                child: SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Row(
                                    children: [
                                      _StatChip(
                                        label: 'Categorías',
                                        value: '${_categories.length}',
                                      ),
                                      const SizedBox(width: 8),
                                      _StatChip(
                                        label: 'Activas',
                                        value: '$activeCategories',
                                      ),
                                      const SizedBox(width: 8),
                                      _StatChip(
                                        label: 'Productos',
                                        value: '$totalProducts',
                                      ),
                                    ],
                                  ),
                                ),
                              )
                            : const SizedBox(
                                key: ValueKey('compact-category-spacer'),
                                height: 10,
                              ),
                      ),
                      if (_categories.isEmpty)
                        _EmptyMenuState(
                          icon: Icons.category_outlined,
                          title: 'No hay categorías en este menú',
                          subtitle:
                              'Crea tu primera categoría para empezar a cargar productos.',
                          actionLabel: 'Crear primera categoría',
                          onAction: _isMutating ? null : _createCategory,
                        )
                      else if (filtered.isEmpty)
                        _EmptyMenuState(
                          icon: Icons.search_off_rounded,
                          title: 'Sin resultados para la búsqueda',
                          subtitle:
                              'Prueba otro término o limpia el filtro actual.',
                          actionLabel: 'Limpiar búsqueda',
                          onAction: () {
                            _searchController.clear();
                            setState(() => _searchQuery = '');
                          },
                        )
                      else
                        ...filtered.map(
                          (category) => _CategoryCard(
                            category: category,
                            enabled: !_isMutating,
                            productCount:
                                _productCountByCategory[category.id] ?? 0,
                            onOpen: () => _openProducts(category),
                            onEdit: () => _editCategory(category),
                            onDelete: () => _deleteCategory(category),
                            onToggleActive: (value) =>
                                _toggleCategoryActive(category, value),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
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
    required this.category,
    required this.enabled,
    required this.productCount,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleActive,
  });

  final CategoryModel category;
  final bool enabled;
  final int productCount;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleActive;

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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category.nombre,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                          color: colorScheme.onSurface,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$productCount producto${productCount == 1 ? '' : 's'}',
                        style: TextStyle(
                          color: colorScheme.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Switch.adaptive(
                  value: category.activo,
                  onChanged: enabled ? onToggleActive : null,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                color: category.activo
                    ? colorScheme.primary.withValues(alpha: 0.18)
                    : colorScheme.errorContainer.withValues(alpha: 0.42),
              ),
              child: Text(
                category.activo ? 'Activa' : 'Oculta',
                style: TextStyle(
                  color: category.activo
                      ? colorScheme.onPrimaryContainer
                      : colorScheme.onErrorContainer,
                  fontWeight: FontWeight.w700,
                  fontSize: 11,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                FilledButton.icon(
                  onPressed: enabled ? onOpen : null,
                  icon: const Icon(Icons.restaurant_menu_rounded, size: 16),
                  label: const Text('Ver productos'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colorScheme.primary.withValues(
                      alpha: 0.16,
                    ),
                    foregroundColor: colorScheme.primary,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  onPressed: enabled ? onEdit : null,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  tooltip: 'Editar categoría',
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
                  tooltip: 'Eliminar categoría',
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

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.35)),
      ),
      child: Text(
        '$label: $value',
        style: TextStyle(
          color: colorScheme.onSurface,
          fontWeight: FontWeight.w700,
          fontSize: 12,
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
