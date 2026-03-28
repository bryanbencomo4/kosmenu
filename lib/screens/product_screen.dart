import 'package:flutter/material.dart';
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
  bool _loading = true;
  bool _isSavingOrder = false;
  List<ProductModel> _products = <ProductModel>[];

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    setState(() => _loading = true);
    try {
      final rows = await Supabase.instance.client
          .from('productos')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('categoria_id', widget.category.id)
          .order('orden', ascending: true)
          .order('nombre', ascending: true);

      final products = (rows as List<dynamic>)
          .map((row) => ProductModel.fromMap(Map<String, dynamic>.from(row as Map)))
          .toList();

      if (!mounted) return;
      setState(() {
        _products = products;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error cargando productos: $error')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
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
      await _loadProducts();
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
      await Supabase.instance.client.from('productos').delete().eq('id', product.id);
      await _loadProducts();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.category.nombre),
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
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Producto'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _products.isEmpty
              ? const Center(child: Text('No hay productos en este catálogo'))
              : Stack(
                  children: [
                    ReorderableListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      itemCount: _products.length,
                      onReorder: _onReorder,
                      buildDefaultDragHandles: false,
                      itemBuilder: (context, index) {
                        final product = _products[index];

                        return Card(
                          key: ValueKey(product.id),
                          margin: const EdgeInsets.symmetric(vertical: 6),
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(12),
                            leading: product.imagenUrl != null &&
                                    product.imagenUrl!.trim().isNotEmpty
                                ? ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(
                                      product.imagenUrl!,
                                      width: 56,
                                      height: 56,
                                      fit: BoxFit.cover,
                                    ),
                                  )
                                : Container(
                                    width: 56,
                                    height: 56,
                                    decoration: BoxDecoration(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(Icons.fastfood_outlined),
                                  ),
                            title: Text(
                              product.nombre,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (product.descripcion.trim().isNotEmpty)
                                  Text(product.descripcion),
                                const SizedBox(height: 6),
                                Text('\$${product.precio.toStringAsFixed(2)}'),
                                Row(
                                  children: [
                                    const Text('Ocultar'),
                                    Switch.adaptive(
                                      value: product.disponible,
                                      onChanged: (value) =>
                                          _toggleVisibility(product, value),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            trailing: SizedBox(
                              width: 116,
                              child: Row(
                                children: [
                                  IconButton(
                                    onPressed: () => _openProductForm(product: product),
                                    icon: const Icon(Icons.edit_outlined),
                                    tooltip: 'Editar',
                                  ),
                                  IconButton(
                                    onPressed: () => _deleteProduct(product),
                                    icon: const Icon(Icons.delete_outline),
                                    tooltip: 'Eliminar',
                                  ),
                                  ReorderableDragStartListener(
                                    index: index,
                                    child: const Icon(Icons.drag_handle),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    if (_isSavingOrder)
                      Positioned.fill(
                        child: Container(
                          color: Colors.black.withValues(alpha: 0.08),
                          child: const Center(
                            child: CircularProgressIndicator(),
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}
