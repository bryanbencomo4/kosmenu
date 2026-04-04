import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/product_form_screen.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProductListScreen extends StatefulWidget {
  const ProductListScreen({
    super.key,
    required this.category,
    required this.allCategories,
  });

  final CategoryModel category;
  final List<CategoryModel> allCategories;

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  static const _pageSize = 12;
  static const _defaultBrandLogoUrl =
      'https://elmenuxfa.com/branding/isotipo.png';

  bool _loading = true;
  bool _isSavingOrder = false;
  bool _isLoadingMore = false;
  bool _hasMoreProducts = true;
  List<ProductModel> _products = <ProductModel>[];
  String? _businessLogoUrl;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  _ProductVisibilityFilter _visibilityFilter = _ProductVisibilityFilter.all;

  @override
  void initState() {
    super.initState();
    _loadBusinessLogo();
    _loadProducts(reset: true);
  }

  Future<void> _loadBusinessLogo() async {
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) return;

    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('logo_url')
          .eq('id', comercioId)
          .maybeSingle();

      if (!mounted || row == null) return;
      setState(() => _businessLogoUrl = row['logo_url']?.toString().trim());
    } catch (_) {
      // Keep defaults on logo read failure.
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadProducts({bool reset = false}) async {
    if (!reset && (!_hasMoreProducts || _isLoadingMore)) return;

    if (reset) {
      setState(() {
        _loading = true;
        _hasMoreProducts = true;
      });
    } else {
      setState(() => _isLoadingMore = true);
    }

    try {
      final offset = reset ? 0 : _products.length;
      final rows = await Supabase.instance.client
          .from('productos')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('categoria_id', widget.category.id)
          .order('orden', ascending: true)
          .order('nombre', ascending: true)
          .range(offset, offset + _pageSize - 1);

      final products = (rows as List<dynamic>)
          .map(
            (row) =>
                ProductModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .toList();

      if (!mounted) return;
      setState(() {
        _products = reset ? products : [..._products, ...products];
        _hasMoreProducts = products.length == _pageSize;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error cargando productos: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _openProductForm({ProductModel? product}) async {
    final didSave = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          categories: widget.allCategories,
          product: product,
          initialCategoryId: widget.category.id,
        ),
      ),
    );

    if (didSave == true) {
      await _loadProducts(reset: true);
    }
  }

  Future<void> _toggleVisibility(ProductModel product, bool value) async {
    final originalProducts = List<ProductModel>.from(_products);

    setState(() {
      _products = _products
          .map(
            (item) => item.id == product.id
                ? ProductModel(
                    id: item.id,
                    comercioId: item.comercioId,
                    categoriaId: item.categoriaId,
                    nombre: item.nombre,
                    precio: item.precio,
                    descripcion: item.descripcion,
                    orden: item.orden,
                    disponible: value,
                    imagenUrl: item.imagenUrl,
                    creadoPorIa: item.creadoPorIa,
                    confianzaIa: item.confianzaIa,
                  )
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
      setState(() => _products = originalProducts);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo actualizar visibilidad: $error')),
      );
    }
  }

  Future<void> _deleteProduct(ProductModel product) async {
    final confirmed = await showDialog<bool>(
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
            '¿Seguro que deseas eliminar "${product.nombre}"?',
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

    if (confirmed != true) return;

    final previous = List<ProductModel>.from(_products);
    if (!mounted) return;
    setState(() {
      _products = _products.where((item) => item.id != product.id).toList();
    });

    try {
      final deletedRows = await Supabase.instance.client
          .from('productos')
          .delete()
          .eq('id', product.id)
          .select('id');

      final deletedCount = (deletedRows as List<dynamic>).length;
      if (deletedCount == 0) {
        throw Exception('No se pudo confirmar el borrado en la base de datos.');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar producto: $error')),
      );
    }
  }

  Future<void> _onReorder(int oldIndex, int newIndex) async {
    if (_isSavingOrder) return;

    final originalList = List<ProductModel>.from(_products);
    final updated = List<ProductModel>.from(_products);

    if (newIndex > oldIndex) newIndex -= 1;
    final item = updated.removeAt(oldIndex);
    updated.insert(newIndex, item);

    setState(() {
      _products = updated;
      _isSavingOrder = true;
    });

    try {
      for (var index = 0; index < updated.length; index++) {
        final row = updated[index];
        await Supabase.instance.client
            .from('productos')
            .update({'orden': index})
            .eq('id', row.id);
      }

      if (!mounted) return;
      setState(() {
        _products = updated
            .asMap()
            .entries
            .map(
              (entry) => ProductModel(
                id: entry.value.id,
                comercioId: entry.value.comercioId,
                categoriaId: entry.value.categoriaId,
                nombre: entry.value.nombre,
                precio: entry.value.precio,
                descripcion: entry.value.descripcion,
                orden: entry.key,
                disponible: entry.value.disponible,
                imagenUrl: entry.value.imagenUrl,
                creadoPorIa: entry.value.creadoPorIa,
                confianzaIa: entry.value.confianzaIa,
              ),
            )
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _products = originalList);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el nuevo orden: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSavingOrder = false);
      }
    }
  }

  List<ProductModel> get _filteredProducts {
    final query = _searchQuery.trim().toLowerCase();
    final searched = query.isEmpty
        ? _products
        : _products.where((product) {
            final price = product.precio.toStringAsFixed(2);
            return product.nombre.toLowerCase().contains(query) ||
                product.descripcion.toLowerCase().contains(query) ||
                price.contains(query);
          }).toList();

    if (_visibilityFilter == _ProductVisibilityFilter.all) {
      return searched;
    }

    final showVisible = _visibilityFilter == _ProductVisibilityFilter.visible;
    return searched
        .where((product) => product.disponible == showVisible)
        .toList();
  }

  int get _visibleCount => _products.where((item) => item.disponible).length;

  int get _hiddenCount => _products.length - _visibleCount;

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
        title: Text(
          widget.category.nombre,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : () => _openProductForm(),
            icon: const Icon(Icons.add),
            tooltip: 'Crear producto',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : () => _openProductForm(),
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Producto'),
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadProducts(reset: true),
        color: colorScheme.primary,
        child: SafeArea(
          top: false,
          bottom: false,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth >= 760;
              final horizontalPadding = isWide ? 28.0 : 14.0;
              final maxWidth = isWide ? 980.0 : 680.0;
              final filteredProducts = _filteredProducts;
              final hasSearch = _searchQuery.trim().isNotEmpty;

              return Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxWidth),
                  child: Stack(
                    children: [
                      Column(
                        children: [
                          Container(
                            margin: EdgeInsets.fromLTRB(
                              horizontalPadding,
                              14,
                              horizontalPadding,
                              8,
                            ),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(18),
                              color: colorScheme.surfaceContainerHigh,
                              border: Border.all(
                                color: colorScheme.outlineVariant,
                              ),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 42,
                                      height: 42,
                                      decoration: BoxDecoration(
                                        color: colorScheme.primary.withValues(
                                          alpha: 0.16,
                                        ),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Icon(
                                        Icons.inventory_2_outlined,
                                        color: colorScheme.primary,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        'Gestiona productos con orden, visibilidad y búsqueda instantánea.',
                                        style: GoogleFonts.manrope(
                                          color: colorScheme.onSurfaceVariant,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    _StatPill(
                                      label: 'Total',
                                      value: '${_products.length}',
                                    ),
                                    _StatPill(
                                      label: 'Visibles',
                                      value: '$_visibleCount',
                                    ),
                                    _StatPill(
                                      label: 'Ocultos',
                                      value: '$_hiddenCount',
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: EdgeInsets.fromLTRB(
                              horizontalPadding,
                              2,
                              horizontalPadding,
                              8,
                            ),
                            child: _ElegantSearchBar(
                              controller: _searchController,
                              hintText:
                                  'Buscar producto por nombre, descripcion o precio...',
                              onChanged: (value) {
                                if (!mounted) return;
                                setState(() => _searchQuery = value);
                              },
                              onClear: () {
                                _searchController.clear();
                                if (!mounted) return;
                                setState(() => _searchQuery = '');
                              },
                            ),
                          ),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            padding: EdgeInsets.fromLTRB(
                              horizontalPadding,
                              0,
                              horizontalPadding,
                              8,
                            ),
                            child: Row(
                              children: _ProductVisibilityFilter.values.map((
                                filter,
                              ) {
                                final selected = _visibilityFilter == filter;
                                return Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                    selected: selected,
                                    showCheckmark: false,
                                    label: Text(filter.label),
                                    avatar: Icon(filter.icon, size: 16),
                                    onSelected: (_) {
                                      if (!mounted) return;
                                      setState(
                                        () => _visibilityFilter = filter,
                                      );
                                    },
                                  ),
                                );
                              }).toList(),
                            ),
                          ),
                          Expanded(
                            child: filteredProducts.isEmpty
                                ? ListView(
                                    physics:
                                        const AlwaysScrollableScrollPhysics(),
                                    padding: EdgeInsets.fromLTRB(
                                      horizontalPadding,
                                      56,
                                      horizontalPadding,
                                      126,
                                    ),
                                    children: [
                                      _EmptyProductsCard(
                                        hasSearchOrFilter:
                                            hasSearch ||
                                            _visibilityFilter !=
                                                _ProductVisibilityFilter.all,
                                        onClear: () {
                                          _searchController.clear();
                                          if (!mounted) return;
                                          setState(() {
                                            _searchQuery = '';
                                            _visibilityFilter =
                                                _ProductVisibilityFilter.all;
                                          });
                                        },
                                      ),
                                    ],
                                  )
                                : NotificationListener<ScrollNotification>(
                                    onNotification: (notification) {
                                      if (notification.metrics.pixels >=
                                          notification.metrics.maxScrollExtent -
                                              180) {
                                        _loadProducts();
                                      }
                                      return false;
                                    },
                                    child: hasSearch
                                        ? ListView.builder(
                                            physics:
                                                const AlwaysScrollableScrollPhysics(),
                                            padding: EdgeInsets.fromLTRB(
                                              horizontalPadding,
                                              8,
                                              horizontalPadding,
                                              126,
                                            ),
                                            itemCount: filteredProducts.length,
                                            itemBuilder: (context, index) {
                                              final product =
                                                  filteredProducts[index];
                                              return _ProductCard(
                                                key: ValueKey(product.id),
                                                product: product,
                                                fallbackImageUrl:
                                                    (_businessLogoUrl != null &&
                                                        _businessLogoUrl!
                                                            .trim()
                                                            .isNotEmpty)
                                                    ? _businessLogoUrl!.trim()
                                                    : _defaultBrandLogoUrl,
                                                onEdit: () => _openProductForm(
                                                  product: product,
                                                ),
                                                onDelete: () =>
                                                    _deleteProduct(product),
                                                onToggleVisible: (value) =>
                                                    _toggleVisibility(
                                                      product,
                                                      value,
                                                    ),
                                                dragHandle: Icon(
                                                  Icons.drag_indicator,
                                                  color: colorScheme
                                                      .onSurfaceVariant,
                                                ),
                                              );
                                            },
                                          )
                                        : ReorderableListView.builder(
                                            padding: EdgeInsets.fromLTRB(
                                              horizontalPadding,
                                              8,
                                              horizontalPadding,
                                              126,
                                            ),
                                            itemCount: filteredProducts.length,
                                            onReorder: _onReorder,
                                            buildDefaultDragHandles: false,
                                            itemBuilder: (context, index) {
                                              final product =
                                                  filteredProducts[index];
                                              return TweenAnimationBuilder<
                                                double
                                              >(
                                                key: ValueKey(product.id),
                                                tween: Tween(begin: 0, end: 1),
                                                duration: Duration(
                                                  milliseconds:
                                                      260 + (index * 18),
                                                ),
                                                curve: Curves.easeOut,
                                                builder:
                                                    (context, value, child) {
                                                      return Opacity(
                                                        opacity: value,
                                                        child:
                                                            Transform.translate(
                                                              offset: Offset(
                                                                0,
                                                                (1 - value) *
                                                                    10,
                                                              ),
                                                              child: child,
                                                            ),
                                                      );
                                                    },
                                                child: _ProductCard(
                                                  product: product,
                                                  fallbackImageUrl:
                                                      (_businessLogoUrl !=
                                                              null &&
                                                          _businessLogoUrl!
                                                              .trim()
                                                              .isNotEmpty)
                                                      ? _businessLogoUrl!.trim()
                                                      : _defaultBrandLogoUrl,
                                                  onEdit: () =>
                                                      _openProductForm(
                                                        product: product,
                                                      ),
                                                  onDelete: () =>
                                                      _deleteProduct(product),
                                                  onToggleVisible: (value) =>
                                                      _toggleVisibility(
                                                        product,
                                                        value,
                                                      ),
                                                  dragHandle:
                                                      ReorderableDragStartListener(
                                                        index: index,
                                                        child: Icon(
                                                          Icons.drag_indicator,
                                                          color: colorScheme
                                                              .onSurfaceVariant,
                                                        ),
                                                      ),
                                                ),
                                              );
                                            },
                                          ),
                                  ),
                          ),
                          if (_isLoadingMore)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 10),
                              child: CircularProgressIndicator(),
                            ),
                        ],
                      ),
                      if (_isSavingOrder)
                        Positioned.fill(
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.12),
                            alignment: Alignment.center,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                CircularProgressIndicator(),
                                SizedBox(height: 10),
                                Text(
                                  'Guardando nuevo orden...',
                                  style: TextStyle(
                                    color: colorScheme.onSurface,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    super.key,
    required this.product,
    required this.fallbackImageUrl,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleVisible,
    required this.dragHandle,
  });

  final ProductModel product;
  final String fallbackImageUrl;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleVisible;
  final Widget dragHandle;

  @override
  Widget build(BuildContext context) {
    final product = this.product;
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: colorScheme.surfaceContainerHigh,
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ProductThumb(
                imageUrl: product.imagenUrl,
                fallbackImageUrl: fallbackImageUrl,
                heroTag: 'hero-product-image-${product.id}',
              ),
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
                        color: colorScheme.onSurface,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    if (product.descripcion.trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        product.descripcion,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: colorScheme.onSurfaceVariant,
                          fontSize: 13,
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: colorScheme.primary.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            '\$${product.precio.toStringAsFixed(2)}',
                            style: TextStyle(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              dragHandle,
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _ProductVisibilityBadge(
                  isVisible: product.disponible,
                  onToggleVisible: onToggleVisible,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FilledButton.icon(
                onPressed: onEdit,
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('Editar'),
                style: FilledButton.styleFrom(
                  backgroundColor: colorScheme.primary.withValues(alpha: 0.16),
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
                onPressed: onDelete,
                tooltip: 'Eliminar producto',
                icon: const Icon(Icons.delete_outline, size: 18),
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
    );
  }
}

class _ProductVisibilityBadge extends StatelessWidget {
  const _ProductVisibilityBadge({
    required this.isVisible,
    required this.onToggleVisible,
  });

  final bool isVisible;
  final ValueChanged<bool> onToggleVisible;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => onToggleVisible(!isVisible),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: isVisible
                ? colorScheme.primary.withValues(alpha: 0.12)
                : colorScheme.errorContainer.withValues(alpha: 0.28),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: isVisible
                  ? colorScheme.primary.withValues(alpha: 0.35)
                  : colorScheme.error.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              Icon(
                isVisible
                    ? Icons.visibility_rounded
                    : Icons.visibility_off_rounded,
                size: 16,
                color: isVisible ? colorScheme.primary : colorScheme.error,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  isVisible ? 'Visible en web' : 'Oculto en web',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: colorScheme.onSurface,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Icon(
                isVisible ? Icons.toggle_on_rounded : Icons.toggle_off_rounded,
                size: 20,
                color: isVisible
                    ? colorScheme.primary
                    : colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ElegantSearchBar extends StatelessWidget {
  const _ElegantSearchBar({
    required this.controller,
    required this.hintText,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          colors: [
            colorScheme.surfaceContainerHigh,
            colorScheme.surfaceContainerHighest,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.3)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          Icon(Icons.search_rounded, color: colorScheme.primary, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: TextStyle(color: colorScheme.onSurface),
              cursorColor: colorScheme.primary,
              decoration: InputDecoration(
                hintText: hintText,
                hintStyle: TextStyle(
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.75),
                ),
                filled: false,
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
          if (controller.text.trim().isNotEmpty)
            IconButton(
              onPressed: onClear,
              icon: Icon(
                Icons.close_rounded,
                color: colorScheme.onSurfaceVariant,
              ),
              tooltip: 'Limpiar búsqueda',
            ),
        ],
      ),
    );
  }
}

class _ProductThumb extends StatelessWidget {
  const _ProductThumb({
    required this.imageUrl,
    required this.fallbackImageUrl,
    this.heroTag,
  });

  final String? imageUrl;
  final String fallbackImageUrl;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final primary = imageUrl?.trim();
    final fallback = fallbackImageUrl.trim();
    final hasFallback = fallback.isNotEmpty;

    Widget iconFallback() => Container(
      width: 72,
      height: 72,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: const Icon(Icons.fastfood_outlined),
    );

    Widget networkWithFallback(String url, {String? backupUrl}) {
      return Image.network(
        url,
        width: 72,
        height: 72,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) {
          if (backupUrl != null &&
              backupUrl.trim().isNotEmpty &&
              backupUrl != url) {
            return Image.network(
              backupUrl,
              width: 72,
              height: 72,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => iconFallback(),
            );
          }
          return iconFallback();
        },
      );
    }

    final thumbChild = primary != null && primary.isNotEmpty
        ? networkWithFallback(primary, backupUrl: hasFallback ? fallback : null)
        : hasFallback
        ? networkWithFallback(fallback)
        : iconFallback();

    final thumb = ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: thumbChild,
    );

    if (heroTag == null || heroTag!.isEmpty) {
      return thumb;
    }

    return Hero(tag: heroTag!, child: thumb);
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: colorScheme.surface,
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

class _EmptyProductsCard extends StatelessWidget {
  const _EmptyProductsCard({
    required this.hasSearchOrFilter,
    required this.onClear,
  });

  final bool hasSearchOrFilter;
  final VoidCallback onClear;

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
          Icon(
            hasSearchOrFilter
                ? Icons.search_off_rounded
                : Icons.inventory_2_outlined,
            size: 32,
            color: colorScheme.primary,
          ),
          const SizedBox(height: 8),
          Text(
            hasSearchOrFilter
                ? 'No encontramos productos con esos filtros'
                : 'Aún no hay productos en esta categoría',
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(
              color: colorScheme.onSurface,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            hasSearchOrFilter
                ? 'Prueba otro término, cambia el filtro o limpia la búsqueda.'
                : 'Crea tu primer producto para empezar a vender en este menú.',
            textAlign: TextAlign.center,
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
          if (hasSearchOrFilter) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onClear,
              icon: const Icon(Icons.filter_alt_off_rounded),
              label: const Text('Limpiar filtros'),
            ),
          ],
        ],
      ),
    );
  }
}

enum _ProductVisibilityFilter { all, visible, hidden }

extension on _ProductVisibilityFilter {
  String get label {
    switch (this) {
      case _ProductVisibilityFilter.all:
        return 'Todos';
      case _ProductVisibilityFilter.visible:
        return 'Visibles';
      case _ProductVisibilityFilter.hidden:
        return 'Ocultos';
    }
  }

  IconData get icon {
    switch (this) {
      case _ProductVisibilityFilter.all:
        return Icons.inventory_2_outlined;
      case _ProductVisibilityFilter.visible:
        return Icons.visibility_rounded;
      case _ProductVisibilityFilter.hidden:
        return Icons.visibility_off_rounded;
    }
  }
}
