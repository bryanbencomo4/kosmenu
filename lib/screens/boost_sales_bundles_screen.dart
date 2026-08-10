import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/bundle.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Real commercial offers: fixed items, fixed price. Not a carousel of
/// products relabeled "combo".
class BoostSalesBundlesScreen extends StatefulWidget {
  const BoostSalesBundlesScreen({super.key, required this.products, required this.currencyCode});

  final List<ProductModel> products;
  final String currencyCode;

  @override
  State<BoostSalesBundlesScreen> createState() => _BoostSalesBundlesScreenState();
}

class _BoostSalesBundlesScreenState extends State<BoostSalesBundlesScreen> {
  static const _purple = Color(0xFF6C4DFF);

  bool _loading = true;
  List<BundleModel> _bundles = [];

  Map<String, ProductModel> get _productById => {for (final p in widget.products) p.id: p};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      final rows = await Supabase.instance.client
          .from('bundles')
          .select('*, bundle_items(*)')
          .eq('comercio_id', comercioId)
          .order('created_at');

      final bundles = (rows as List<dynamic>).map((row) {
        final map = row as Map<String, dynamic>;
        final items = (map['bundle_items'] as List<dynamic>? ?? [])
            .map((i) => BundleItemModel.fromMap(i as Map<String, dynamic>))
            .toList();
        return BundleModel.fromMap(map, items: items);
      }).toList();

      if (!mounted) return;
      setState(() {
        _bundles = bundles;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudieron cargar los combos: $error')),
      );
    }
  }

  Future<void> _toggleEnabled(BundleModel bundle, bool value) async {
    try {
      await Supabase.instance.client.from('bundles').update({'enabled': value}).eq('id', bundle.id!);
      _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo actualizar: $error')));
    }
  }

  Future<void> _delete(BundleModel bundle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar combo'),
        content: Text('¿Eliminar "${bundle.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await Supabase.instance.client.from('bundles').delete().eq('id', bundle.id!);
      _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo eliminar: $error')));
    }
  }

  Future<void> _openEditor([BundleModel? bundle]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _BundleEditorScreen(products: widget.products, bundle: bundle)),
    );
    if (saved == true) _load();
  }

  String _money(num value) => '\$${value.toStringAsFixed(value % 1 == 0 ? 0 : 2)}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(title: Text('Combos', style: GoogleFonts.poppins(fontWeight: FontWeight.w700))),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _purple,
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('Nuevo combo'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _bundles.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Todavía no tienes combos. Un combo es una oferta real: productos fijos a un precio fijo.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.poppins(color: const Color(0xFF6B7280)),
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                  children: _bundles.map((bundle) {
                    final normalPrice = bundle.normalPrice({
                      for (final p in widget.products) p.id: p.precio,
                    });
                    final savings = normalPrice - bundle.bundlePrice;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFE8EAF2)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(bundle.name, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14.5)),
                                ),
                                Switch.adaptive(
                                  value: bundle.enabled,
                                  activeThumbColor: _purple,
                                  onChanged: (value) => _toggleEnabled(bundle, value),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              bundle.items.map((i) {
                                final name = _productById[i.productId]?.nombre ?? 'Producto eliminado';
                                return i.quantity > 1 ? '${i.quantity}x $name' : name;
                              }).join(' + '),
                              style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Text(_money(bundle.bundlePrice), style: GoogleFonts.poppins(fontWeight: FontWeight.w800, color: _purple)),
                                if (savings > 0) ...[
                                  const SizedBox(width: 8),
                                  Text(
                                    _money(normalPrice),
                                    style: GoogleFonts.poppins(
                                      fontSize: 12.5,
                                      color: const Color(0xFF9AA1B2),
                                      decoration: TextDecoration.lineThrough,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text('Ahorra ${_money(savings)}', style: GoogleFonts.poppins(fontSize: 11.5, color: Colors.green.shade700, fontWeight: FontWeight.w700)),
                                ],
                              ],
                            ),
                            const SizedBox(height: 6),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                TextButton(onPressed: () => _openEditor(bundle), child: const Text('Editar')),
                                TextButton(onPressed: () => _delete(bundle), child: Text('Eliminar', style: TextStyle(color: Colors.red.shade600))),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
    );
  }
}

class _BundleEditorScreen extends StatefulWidget {
  const _BundleEditorScreen({required this.products, this.bundle});

  final List<ProductModel> products;
  final BundleModel? bundle;

  @override
  State<_BundleEditorScreen> createState() => _BundleEditorScreenState();
}

class _BundleEditorScreenState extends State<_BundleEditorScreen> {
  static const _purple = Color(0xFF6C4DFF);

  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  late List<BundleItemModel> _items;
  bool _saving = false;

  bool get _isEditing => widget.bundle != null;

  @override
  void initState() {
    super.initState();
    _nameController.text = widget.bundle?.name ?? '';
    _descriptionController.text = widget.bundle?.description ?? '';
    _priceController.text = widget.bundle?.bundlePrice.toStringAsFixed(2) ?? '';
    _items = List<BundleItemModel>.from(widget.bundle?.items ?? const []);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _nameController.text.trim().isNotEmpty &&
      double.tryParse(_priceController.text.trim().replaceAll(',', '.')) != null &&
      _items.isNotEmpty &&
      _items.every((i) => i.productId.isNotEmpty);

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      final price = double.parse(_priceController.text.trim().replaceAll(',', '.'));
      final payload = BundleModel(
        comercioId: comercioId,
        name: _nameController.text.trim(),
        description: _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
        bundlePrice: price,
        enabled: widget.bundle?.enabled ?? true,
      ).toMap();

      String bundleId;
      if (_isEditing) {
        bundleId = widget.bundle!.id!;
        await Supabase.instance.client.from('bundles').update(payload).eq('id', bundleId);
        await Supabase.instance.client.from('bundle_items').delete().eq('bundle_id', bundleId);
      } else {
        final inserted = await Supabase.instance.client.from('bundles').insert(payload).select('id').single();
        bundleId = inserted['id'].toString();
      }

      for (final item in _items) {
        await Supabase.instance.client.from('bundle_items').insert(item.toMap(bundleId));
      }

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo guardar el combo: $error')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _addItem() {
    setState(() => _items = [..._items, const BundleItemModel(productId: '')]);
  }

  void _updateItem(int index, BundleItemModel item) {
    setState(() {
      final next = List<BundleItemModel>.from(_items);
      next[index] = item;
      _items = next;
    });
  }

  void _removeItem(int index) {
    setState(() {
      final next = List<BundleItemModel>.from(_items);
      next.removeAt(index);
      _items = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text(_isEditing ? 'Editar combo' : 'Nuevo combo', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        actions: [
          TextButton(
            onPressed: _canSave && !_saving ? _save : null,
            child: Text('Guardar', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, color: _purple)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: 'Nombre', hintText: 'Ej. Combo Pareja'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descriptionController,
            decoration: const InputDecoration(labelText: 'Descripción (opcional)'),
            maxLines: 2,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _priceController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Precio del combo', prefixText: '\$ '),
          ),
          const SizedBox(height: 18),
          Text('Productos incluidos', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 8),
          ..._items.asMap().entries.map((entry) {
            final index = entry.key;
            final item = entry.value;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: item.productId.isEmpty ? null : item.productId,
                      hint: const Text('Elige producto'),
                      items: widget.products
                          .map((p) => DropdownMenuItem(value: p.id, child: Text(p.nombre, overflow: TextOverflow.ellipsis)))
                          .toList(),
                      onChanged: (value) => _updateItem(index, BundleItemModel(productId: value ?? '', quantity: item.quantity)),
                    ),
                  ),
                  IconButton(
                    onPressed: item.quantity > 1
                        ? () => _updateItem(index, BundleItemModel(productId: item.productId, quantity: item.quantity - 1))
                        : null,
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                  Text('${item.quantity}', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
                  IconButton(
                    onPressed: () => _updateItem(index, BundleItemModel(productId: item.productId, quantity: item.quantity + 1)),
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                  IconButton(onPressed: () => _removeItem(index), icon: const Icon(Icons.close_rounded)),
                ],
              ),
            );
          }),
          TextButton.icon(onPressed: _addItem, icon: const Icon(Icons.add), label: const Text('Agregar producto')),
        ],
      ),
    );
  }
}
