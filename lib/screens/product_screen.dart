import 'package:flutter/material.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProductListScreen extends StatefulWidget {
  final CategoryModel category;

  const ProductListScreen({super.key, required this.category});

  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  Future<List<ProductModel>> _fetchProducts() async {
    if (!SupabaseConfig.hasCurrentComercioId) {
      throw StateError(
        'Configura SupabaseConfig.currentComercioId para cargar productos.',
      );
    }

    final rows = await Supabase.instance.client
        .from('productos')
        .select()
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .eq('categoria_id', widget.category.id);

    return (rows as List<dynamic>)
        .map(
          (row) => ProductModel.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.category.nombre)),
      body: FutureBuilder<List<ProductModel>>(
        future: _fetchProducts(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Error cargando productos: ${snapshot.error}'),
              ),
            );
          }

          final products = snapshot.data ?? const <ProductModel>[];
          if (products.isEmpty) {
            return const Center(child: Text('No hay productos disponibles'));
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            itemCount: products.length,
            itemBuilder: (context, index) {
              final product = products[index];

              return Card(
                elevation: 2,
                margin: const EdgeInsets.symmetric(vertical: 6),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  title: Text(
                    product.nombre,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      product.descripcion,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  trailing: Text(
                    '\$${product.precio.toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: Color(0xFFFF6B00),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
