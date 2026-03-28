import 'package:flutter/material.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CatalogListScreen extends StatefulWidget {
  const CatalogListScreen({super.key});

  @override
  State<CatalogListScreen> createState() => _CatalogListScreenState();
}

class _CatalogListScreenState extends State<CatalogListScreen> {
  bool _loading = true;
  List<CategoryModel> _catalogs = <CategoryModel>[];

  @override
  void initState() {
    super.initState();
    _loadCatalogs();
  }

  Future<void> _loadCatalogs() async {
    setState(() => _loading = true);

    try {
      final rows = await Supabase.instance.client
          .from('categorias')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .order('orden', ascending: true)
          .order('nombre', ascending: true);

      final categories = (rows as List<dynamic>)
          .map((row) => CategoryModel.fromMap(Map<String, dynamic>.from(row as Map)))
          .toList();

      if (!mounted) return;
      setState(() => _catalogs = categories);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error cargando catálogos: $error')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _showCatalogNameDialog({
    required String title,
    String? initialValue,
  }) async {
    final controller = TextEditingController(text: initialValue ?? '');

    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Nombre del catálogo',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );

    controller.dispose();
    return result;
  }

  Future<void> _createCatalog() async {
    final name = await _showCatalogNameDialog(title: 'Nuevo Catálogo');
    if (name == null || name.isEmpty) return;

    try {
      final maxOrder = _catalogs.isEmpty
          ? 0
          : _catalogs.map((c) => c.orden).reduce((a, b) => a > b ? a : b) + 1;

      await Supabase.instance.client.from('categorias').insert({
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
    }
  }

  Future<void> _editCatalog(CategoryModel catalog) async {
    final name = await _showCatalogNameDialog(
      title: 'Editar Catálogo',
      initialValue: catalog.nombre,
    );
    if (name == null || name.isEmpty) return;

    try {
      await Supabase.instance.client
          .from('categorias')
          .update({'nombre': name})
          .eq('id', catalog.id);

      await _loadCatalogs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo editar catálogo: $error')),
      );
    }
  }

  Future<void> _toggleCatalogActive(CategoryModel catalog, bool value) async {
    final previous = List<CategoryModel>.from(_catalogs);

    setState(() {
      _catalogs = _catalogs
          .map(
            (item) => item.id == catalog.id
                ? CategoryModel(
                    id: item.id,
                    comercioId: item.comercioId,
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
          .eq('id', catalog.id);
    } catch (error) {
      if (!mounted) return;
      setState(() => _catalogs = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cambiar estado activo: $error')),
      );
    }
  }

  Future<void> _deleteCatalog(CategoryModel catalog) async {
    final confirmDelete = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar catálogo'),
        content: Text(
          '¿Seguro que deseas eliminar "${catalog.nombre}"? Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFD14545),
            ),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );

    if (confirmDelete != true) return;

    try {
      await Supabase.instance.client
          .from('categorias')
          .delete()
          .eq('id', catalog.id);

      await _loadCatalogs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar catálogo: $error')),
      );
    }
  }

  Future<void> _openCatalogProducts(CategoryModel category) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ProductListScreen(
          category: category,
          allCategories: _catalogs,
        ),
      ),
    );

    await _loadCatalogs();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catálogos'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _createCatalog,
            icon: const Icon(Icons.add),
            tooltip: 'Crear catálogo',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : _createCatalog,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Catálogo'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _catalogs.isEmpty
              ? const Center(child: Text('No hay catálogos disponibles'))
              : ListView.builder(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  itemCount: _catalogs.length,
                  itemBuilder: (context, index) {
                    final catalog = _catalogs[index];

                    return Card(
                      elevation: 2,
                      margin: const EdgeInsets.symmetric(vertical: 6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => _openCatalogProducts(catalog),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      catalog.nombre,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      catalog.activo
                                          ? 'Activo'
                                          : 'Oculto (no visible para clientes)',
                                      style: TextStyle(
                                        color: catalog.activo
                                            ? const Color(0xFF1E9D57)
                                            : Colors.orange.shade700,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Switch.adaptive(
                                value: catalog.activo,
                                onChanged: (value) =>
                                    _toggleCatalogActive(catalog, value),
                              ),
                              IconButton(
                                onPressed: () => _editCatalog(catalog),
                                icon: const Icon(Icons.edit_outlined),
                                tooltip: 'Editar Nombre',
                              ),
                              IconButton(
                                onPressed: () => _deleteCatalog(catalog),
                                icon: const Icon(Icons.delete_outline),
                                tooltip: 'Eliminar',
                              ),
                              const Icon(Icons.chevron_right),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}

class CategoryListScreen extends StatelessWidget {
  const CategoryListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CatalogListScreen();
  }
}
