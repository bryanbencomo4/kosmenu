import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/product_form_screen.dart';
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

  bool _loading = true;
  bool _isSavingOrder = false;
  bool _isLoadingMore = false;
  bool _hasMoreProducts = true;
  List<ProductModel> _products = <ProductModel>[];
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadProducts(reset: true);
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
            (row) => ProductModel.fromMap(
              Map<String, dynamic>.from(row as Map),
            ),
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
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        title: const Text('Eliminar producto'),
        content: Text('¿Seguro que deseas eliminar "${product.nombre}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await Supabase.instance.client
          .from('productos')
          .delete()
          .eq('id', product.id);
        await _loadProducts(reset: true);
    } catch (error) {
      if (!mounted) return;
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
    if (query.isEmpty) return _products;
    return _products.where((product) {
      final price = product.precio.toStringAsFixed(2);
      return product.nombre.toLowerCase().contains(query) ||
          product.descripcion.toLowerCase().contains(query) ||
          price.contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
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
        backgroundColor: const Color(0xFF1AB15E),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Producto'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () => _loadProducts(reset: true),
              color: const Color(0xFFFFB04A),
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
                                gradient: const LinearGradient(
                                  colors: [Color(0xFF2B1C11), Color(0xFF1B140E)],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                border: Border.all(
                                  color: const Color(0x33D7A74D),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 42,
                                    height: 42,
                                    decoration: BoxDecoration(
                                      color: const Color(0x221AB15E),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: const Icon(
                                      Icons.inventory_2_outlined,
                                      color: Color(0xFF54E697),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      'Arrastra para cambiar orden, oculta productos de temporada o edítalos rápido.',
                                      style: GoogleFonts.manrope(
                                        color: const Color(0xFFE4C8A5),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
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
                                hintText: 'Buscar producto por nombre, descripcion o precio...',
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
                            Expanded(
                              child: filteredProducts.isEmpty
                                  ? ListView(
                                      physics:
                                          const AlwaysScrollableScrollPhysics(),
                                      padding: EdgeInsets.fromLTRB(
                                        horizontalPadding,
                                        60,
                                        horizontalPadding,
                                        126,
                                      ),
                                      children: const [
                                        Center(
                                          child: Text(
                                            'No se encontraron productos',
                                            style: TextStyle(
                                              color: Colors.white70,
                                            ),
                                          ),
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
                                                  dragHandle: const Icon(
                                                    Icons.drag_indicator,
                                                    color: Color(0xFFD5B78A),
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
                                                    double>(
                                                  key: ValueKey(product.id),
                                                  tween: Tween(
                                                    begin: 0,
                                                    end: 1,
                                                  ),
                                                  duration: Duration(
                                                    milliseconds:
                                                        260 + (index * 18),
                                                  ),
                                                  curve: Curves.easeOut,
                                                  builder:
                                                      (context, value, child) {
                                                    return Opacity(
                                                      opacity: value,
                                                      child: Transform.translate(
                                                        offset: Offset(
                                                          0,
                                                          (1 - value) * 10,
                                                        ),
                                                        child: child,
                                                      ),
                                                    );
                                                  },
                                                  child: _ProductCard(
                                                    product: product,
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
                                                      child: const Icon(
                                                        Icons.drag_indicator,
                                                        color: Color(0xFFD5B78A),
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
                                children: const [
                                  CircularProgressIndicator(),
                                  SizedBox(height: 10),
                                  Text(
                                    'Guardando nuevo orden...',
                                    style: TextStyle(color: Colors.white),
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
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    super.key,
    required this.product,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleVisible,
    required this.dragHandle,
  });

  final ProductModel product;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleVisible;
  final Widget dragHandle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: const Color(0xFF17120E),
        border: Border.all(color: const Color(0x2AD7A74D)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ProductThumb(
                imageUrl: product.imagenUrl,
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
                        color: const Color(0xFFFFEACC),
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
                        style: const TextStyle(color: Color(0xFFD3BEA0)),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0x2227C46B),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '\$${product.precio.toStringAsFixed(2)}',
                        style: const TextStyle(
                          color: Color(0xFF4BE18D),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              dragHandle,
            ],
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 430;

              if (!compact) {
                return Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _ProductVisibilityBadge(
                      isVisible: product.disponible,
                      onToggleVisible: onToggleVisible,
                    ),
                    OutlinedButton.icon(
                      onPressed: onEdit,
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Editar'),
                    ),
                    OutlinedButton.icon(
                      onPressed: onDelete,
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Eliminar'),
                    ),
                  ],
                );
              }

              return Column(
                children: [
                  _ProductVisibilityBadge(
                    isVisible: product.disponible,
                    onToggleVisible: onToggleVisible,
                    fullWidth: true,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onEdit,
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text(
                            'Editar',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onDelete,
                          icon: const Icon(Icons.delete_outline),
                          label: const Text(
                            'Eliminar',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
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

class _ProductVisibilityBadge extends StatelessWidget {
  const _ProductVisibilityBadge({
    required this.isVisible,
    required this.onToggleVisible,
    this.fullWidth = false,
  });

  final bool isVisible;
  final ValueChanged<bool> onToggleVisible;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final label = const Text(
      'Visible en web',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(color: Color(0xFFE6D7C4)),
    );

    return Container(
      width: fullWidth ? double.infinity : null,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F0D0B),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
        children: [
          if (fullWidth) Expanded(child: label) else label,
          Switch.adaptive(
            value: isVisible,
            onChanged: onToggleVisible,
          ),
        ],
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
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          colors: [Color(0xFF21160F), Color(0xFF17120E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x33FFD49A)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, color: Color(0xFFFFC977), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: hintText,
                hintStyle: const TextStyle(color: Color(0x80E6C9A8)),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          if (controller.text.trim().isNotEmpty)
            IconButton(
              onPressed: onClear,
              icon: const Icon(Icons.close_rounded, color: Colors.white70),
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
    this.heroTag,
  });

  final String? imageUrl;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final hasImage = imageUrl != null && imageUrl!.trim().isNotEmpty;
    final thumb = ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: hasImage
          ? Image.network(
              imageUrl!,
              width: 72,
              height: 72,
              fit: BoxFit.cover,
            )
          : Container(
              width: 72,
              height: 72,
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: const Icon(Icons.fastfood_outlined),
            ),
    );

    if (heroTag == null || heroTag!.isEmpty) {
      return thumb;
    }

    return Hero(
      tag: heroTag!,
      child: thumb,
    );
  }
}
