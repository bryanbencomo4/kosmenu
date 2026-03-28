import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/catalog.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/screens/product_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CategoryListScreen extends StatelessWidget {
  const CategoryListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CatalogListScreen();
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

  @override
  void initState() {
    super.initState();
    _loadCatalogs();
  }

  Future<void> _loadCatalogs() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final rows = await Supabase.instance.client
          .from('catalogos')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .order('orden', ascending: true)
          .order('nombre', ascending: true);

      final catalogs = (rows as List<dynamic>)
          .map((row) => CatalogModel.fromMap(Map<String, dynamic>.from(row as Map)))
          .toList();

      if (!mounted) return;
      setState(() => _catalogs = catalogs);
    } catch (error) {
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

    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        title: Text(
          title,
          style: GoogleFonts.manrope(
            color: const Color(0xFFFFEACC),
            fontWeight: FontWeight.w800,
          ),
        ),
        content: TextFormField(
          initialValue: initialValue,
          onChanged: (value) => draft = value,
          onFieldSubmitted: (value) => Navigator.of(dialogContext).pop(value.trim()),
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(labelText: 'Nombre'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(draft.trim()),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _createCatalog() async {
    if (_isMutating) return;
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
    if (!mounted || name == null || name.isEmpty || name == catalog.nombre) return;

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
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        title: const Text('Eliminar catálogo'),
        content: Text('¿Eliminar "${catalog.nombre}" y sus categorías?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD14545)),
            child: const Text('Eliminar'),
          ),
        ],
      ),
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
    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        title: const Text('Gestión de Catálogos'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: (_loading || _isMutating) ? null : _createCatalog,
        backgroundColor: const Color(0xFF1AB15E),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Catálogo'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadCatalogs,
              child: _catalogs.isEmpty
                  ? ListView(
                      physics: AlwaysScrollableScrollPhysics(),
                      children: [
                        SizedBox(height: 160),
                        Center(
                          child: Text(
                            'No hay catálogos creados',
                            style: TextStyle(color: Colors.white70),
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
  State<CatalogCategoriesScreen> createState() => _CatalogCategoriesScreenState();
}

class _CatalogCategoriesScreenState extends State<CatalogCategoriesScreen> {
  bool _loading = true;
  bool _isMutating = false;
  List<CategoryModel> _categories = <CategoryModel>[];

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final rows = await Supabase.instance.client
          .from('categorias')
          .select()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', widget.catalog.id)
          .order('orden', ascending: true)
          .order('nombre', ascending: true);

      final categories = (rows as List<dynamic>)
          .map((row) => CategoryModel.fromMap(Map<String, dynamic>.from(row as Map)))
          .toList();

      if (!mounted) return;
      setState(() => _categories = categories);
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

  Future<String?> _showNameDialog({
    required String title,
    String initialValue = '',
  }) async {
    String draft = initialValue;

    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        title: Text(
          title,
          style: GoogleFonts.manrope(
            color: const Color(0xFFFFEACC),
            fontWeight: FontWeight.w800,
          ),
        ),
        content: TextFormField(
          initialValue: initialValue,
          onChanged: (value) => draft = value,
          onFieldSubmitted: (value) => Navigator.of(dialogContext).pop(value.trim()),
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(labelText: 'Nombre de la categoría'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(draft.trim()),
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

    setState(() => _isMutating = true);
    try {
      final maxOrder = _categories.isEmpty
          ? 0
          : _categories.map((c) => c.orden).reduce((a, b) => a > b ? a : b) + 1;

      await Supabase.instance.client.from('categorias').insert({
        'comercio_id': SupabaseConfig.currentComercioId,
        'catalogo_id': widget.catalog.id,
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
    if (!mounted || name == null || name.isEmpty || name == category.nombre) return;

    setState(() => _isMutating = true);
    try {
      await Supabase.instance.client
          .from('categorias')
          .update({'nombre': name})
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', widget.catalog.id)
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
          .map((item) => item.id == category.id
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
              : item)
          .toList();
    });

    try {
      await Supabase.instance.client
          .from('categorias')
          .update({'activo': value})
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', widget.catalog.id)
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
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        title: const Text('Eliminar categoría'),
        content: Text('¿Eliminar "${category.nombre}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD14545)),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );

    if (!mounted || confirm != true) return;

    setState(() => _isMutating = true);
    try {
      await Supabase.instance.client
          .from('categorias')
          .delete()
          .eq('comercio_id', SupabaseConfig.currentComercioId)
          .eq('catalogo_id', widget.catalog.id)
          .eq('id', category.id)
          .select('id');

      await _loadCategories();
    } catch (error) {
      if (!mounted) return;
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
        builder: (_) => ProductListScreen(
          category: category,
          allCategories: _categories,
        ),
      ),
    );

    await _loadCategories();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        title: Text(widget.catalog.nombre, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: (_loading || _isMutating) ? null : _createCategory,
        backgroundColor: const Color(0xFF1AB15E),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nueva Categoría'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadCategories,
              child: _categories.isEmpty
                  ? ListView(
                      physics: AlwaysScrollableScrollPhysics(),
                      children: [
                        SizedBox(height: 160),
                        Center(
                          child: Text(
                            'No hay categorías en este catálogo',
                            style: TextStyle(color: Colors.white70),
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 120),
                      itemCount: _categories.length,
                      itemBuilder: (context, index) {
                        final category = _categories[index];
                        return _CategoryCard(
                          category: category,
                          enabled: !_isMutating,
                          onOpen: () => _openProducts(category),
                          onEdit: () => _editCategory(category),
                          onDelete: () => _deleteCategory(category),
                          onToggleActive: (value) => _toggleCategoryActive(category, value),
                        );
                      },
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
    return Card(
      color: const Color(0xFF17120E),
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              catalog.nombre,
              style: GoogleFonts.manrope(
                color: const Color(0xFFFFEACC),
                fontWeight: FontWeight.w800,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: enabled ? onEdit : null,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Editar'),
                ),
                OutlinedButton.icon(
                  onPressed: enabled ? onDelete : null,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Eliminar'),
                ),
                FilledButton.icon(
                  onPressed: enabled ? onOpen : null,
                  icon: const Icon(Icons.folder_open_rounded),
                  label: const Text('Abrir Categorías'),
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
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleActive,
  });

  final CategoryModel category;
  final bool enabled;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final ValueChanged<bool> onToggleActive;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF17120E),
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    category.nombre,
                    style: GoogleFonts.manrope(
                      color: const Color(0xFFFFEACC),
                      fontWeight: FontWeight.w800,
                      fontSize: 17,
                    ),
                  ),
                ),
                Switch.adaptive(
                  value: category.activo,
                  onChanged: enabled ? onToggleActive : null,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: enabled ? onEdit : null,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Editar'),
                ),
                OutlinedButton.icon(
                  onPressed: enabled ? onDelete : null,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Eliminar'),
                ),
                FilledButton.icon(
                  onPressed: enabled ? onOpen : null,
                  icon: const Icon(Icons.restaurant_menu_rounded),
                  label: const Text('Abrir Productos'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
