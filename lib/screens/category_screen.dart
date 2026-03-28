import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CategoryListScreen extends StatefulWidget {
  const CategoryListScreen({super.key});

  @override
  State<CategoryListScreen> createState() => _CategoryListScreenState();
}

class _CategoryListScreenState extends State<CategoryListScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Categorías')),
      body: FutureBuilder<List<CategoryModel>>(
        future: (() async {
          try {
            if (!SupabaseConfig.hasCurrentComercioId) {
              throw StateError(
                'Configura SupabaseConfig.currentComercioId para cargar categorías.',
              );
            }

            final rows = await Supabase.instance.client
                .from('categorias')
                .select()
                .eq('comercio_id', SupabaseConfig.currentComercioId);

            final categories = (rows as List<dynamic>)
                .map(
                  (row) => CategoryModel.fromMap(
                    Map<String, dynamic>.from(row as Map),
                  ),
                )
                .toList();

            categories.sort((a, b) => a.orden.compareTo(b.orden));
            return categories;
          } catch (error, stackTrace) {
            debugPrint('Category query error: $error');
            debugPrint('$stackTrace');
            rethrow;
          }
        })(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Error cargando categorías: ${snapshot.error}'),
              ),
            );
          }

          final categories = snapshot.data ?? const <CategoryModel>[];
          if (categories.isEmpty) {
            return const Center(child: Text('No hay categorías disponibles'));
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            itemCount: categories.length,
            itemBuilder: (context, index) {
              final categoria = categories[index];

              return Card(
                elevation: 2,
                margin: const EdgeInsets.symmetric(vertical: 6),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  leading:
                      categoria.icono != null && categoria.icono!.isNotEmpty
                      ? CircleAvatar(child: Text(categoria.icono!))
                      : const CircleAvatar(child: Icon(Icons.restaurant_menu)),
                  title: Text(
                    categoria.nombre,
                    style: GoogleFonts.poppins(fontWeight: FontWeight.bold),
                  ),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ProductListScreen(category: categoria),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
