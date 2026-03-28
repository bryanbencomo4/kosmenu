import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
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
  bool _supportsActivoColumn = true;
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
          .map(
            (row) => CategoryModel.fromMap(
              Map<String, dynamic>.from(row as Map),
            ),
          )
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
        backgroundColor: const Color(0xFF1A140E),
        title: Text(
          title,
          style: GoogleFonts.manrope(
            color: const Color(0xFFFFEACC),
            fontWeight: FontWeight.w800,
          ),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'Nombre de la categoría',
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
    final name = await _showCatalogNameDialog(title: 'Nueva Categoría');
    if (name == null || name.isEmpty) return;

    try {
      final maxOrder = _catalogs.isEmpty
          ? 0
          : _catalogs.map((c) => c.orden).reduce((a, b) => a > b ? a : b) + 1;

      final payload = <String, dynamic>{
        'comercio_id': SupabaseConfig.currentComercioId,
        'nombre': name,
        'orden': maxOrder,
      };

      if (_supportsActivoColumn) {
        payload['activo'] = true;
      }

      try {
        await Supabase.instance.client.from('categorias').insert(payload);
      } on PostgrestException catch (error) {
        if (_isMissingActivoColumnError(error) && _supportsActivoColumn) {
          _supportsActivoColumn = false;
          payload.remove('activo');
          await Supabase.instance.client.from('categorias').insert(payload);
        } else {
          rethrow;
        }
      }

      await _loadCatalogs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo crear categoría: $error')),
      );
    }
  }

  Future<void> _editCatalog(CategoryModel catalog) async {
    final name = await _showCatalogNameDialog(
      title: 'Editar Categoría',
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
        SnackBar(content: Text('No se pudo editar categoría: $error')),
      );
    }
  }

  Future<void> _toggleCatalogActive(CategoryModel catalog, bool value) async {
    if (!_supportsActivoColumn) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'La visibilidad por categoría no está habilitada en esta base.',
          ),
        ),
      );
      return;
    }

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
    } on PostgrestException catch (error) {
      if (!mounted) return;
      if (_isMissingActivoColumnError(error)) {
        setState(() {
          _catalogs = previous;
          _supportsActivoColumn = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Tu tabla categorias no tiene la columna activo. Se desactivó ese control.',
            ),
          ),
        );
        return;
      }
      rethrow;
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
        backgroundColor: const Color(0xFF1A140E),
        title: const Text('Eliminar categoría'),
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
        SnackBar(content: Text('No se pudo eliminar categoría: $error')),
      );
    }
  }

  bool _isMissingActivoColumnError(PostgrestException error) {
    final code = (error.code ?? '').toUpperCase();
    final message = error.message.toLowerCase();
    return code == 'PGRST204' && message.contains('activo');
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
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        title: const Text('Gestión de Categorías'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _createCatalog,
            icon: const Icon(Icons.add),
            tooltip: 'Crear categoría',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : _createCatalog,
        backgroundColor: const Color(0xFF1AB15E),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Nueva Categoría'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth >= 760;
                final horizontalPadding = isWide ? 28.0 : 14.0;
                final maxWidth = isWide ? 900.0 : 620.0;

                return Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxWidth),
                    child: Column(
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
                            border: Border.all(color: const Color(0x33D7A74D)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 42,
                                height: 42,
                                decoration: BoxDecoration(
                                  color: const Color(0x22D7A74D),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(
                                  Icons.dashboard_customize_rounded,
                                  color: Color(0xFFEACB93),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Crea y edita categorías. Toca una tarjeta para gestionar sus productos.',
                                  style: GoogleFonts.manrope(
                                    color: const Color(0xFFE4C8A5),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: _catalogs.isEmpty
                              ? const Center(
                                  child: Text(
                                    'No hay categorías disponibles',
                                    style: TextStyle(color: Colors.white70),
                                  ),
                                )
                              : ListView.builder(
                                  padding: EdgeInsets.fromLTRB(
                                    horizontalPadding,
                                    8,
                                    horizontalPadding,
                                    86,
                                  ),
                                  itemCount: _catalogs.length,
                                  itemBuilder: (context, index) {
                                    final catalog = _catalogs[index];
                                    return _CatalogCard(
                                      catalog: catalog,
                                      supportsActivoColumn:
                                          _supportsActivoColumn,
                                      onOpen: () => _openCatalogProducts(catalog),
                                      onToggleActive: (value) =>
                                          _toggleCatalogActive(catalog, value),
                                      onEdit: () => _editCatalog(catalog),
                                      onDelete: () => _deleteCatalog(catalog),
                                    );
                                  },
                                ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _CatalogCard extends StatelessWidget {
  const _CatalogCard({
    required this.catalog,
    required this.supportsActivoColumn,
    required this.onOpen,
    required this.onToggleActive,
    required this.onEdit,
    required this.onDelete,
  });

  final CategoryModel catalog;
  final bool supportsActivoColumn;
  final VoidCallback onOpen;
  final ValueChanged<bool> onToggleActive;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: const Color(0xFF17120E),
        border: Border.all(color: const Color(0x2AD7A74D)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      catalog.nombre,
                      style: GoogleFonts.manrope(
                        color: const Color(0xFFFFEACC),
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                      ),
                    ),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      color: supportsActivoColumn
                          ? const Color(0x2227C46B)
                          : const Color(0x22EFA355),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    child: Text(
                      supportsActivoColumn
                          ? (catalog.activo ? 'Activo' : 'Oculto')
                          : 'Sin visibilidad',
                      style: TextStyle(
                        color: supportsActivoColumn
                            ? (catalog.activo
                                ? const Color(0xFF46E18A)
                                : const Color(0xFFEFA355))
                            : const Color(0xFFEFA355),
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F0D0B),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'Visible en web',
                          style: TextStyle(color: Color(0xFFE6D7C4)),
                        ),
                        if (supportsActivoColumn)
                          Switch.adaptive(
                            value: catalog.activo,
                            onChanged: onToggleActive,
                          )
                        else
                          const Padding(
                            padding: EdgeInsets.only(left: 10),
                            child: Icon(
                              Icons.remove_circle_outline,
                              color: Color(0xFFEFA355),
                              size: 20,
                            ),
                          ),
                      ],
                    ),
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
                  FilledButton.icon(
                    onPressed: onOpen,
                    icon: const Icon(Icons.arrow_forward_ios_rounded, size: 14),
                    label: const Text('Abrir Productos'),
                  ),
                ],
              ),
            ],
          ),
        ),
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
