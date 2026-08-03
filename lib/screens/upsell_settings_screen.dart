import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/models/upsell_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class UpsellSettingsScreen extends StatefulWidget {
  const UpsellSettingsScreen({
    super.key,
    required this.products,
    required this.currencyCode,
  });

  final List<ProductModel> products;
  final String currencyCode;

  @override
  State<UpsellSettingsScreen> createState() => _UpsellSettingsScreenState();
}

class _UpsellSettingsScreenState extends State<UpsellSettingsScreen> {
  bool _loading = true;
  bool _saving = false;
  UpsellConfigModel _config = const UpsellConfigModel();
  final TextEditingController _thresholdController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _thresholdController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      final row = await Supabase.instance.client
          .from('comercios')
          .select('upsell_config')
          .eq('id', comercioId)
          .maybeSingle();
      final config = UpsellConfigModel.fromDynamic(row?['upsell_config']);
      _thresholdController.text = config.freeDeliveryThreshold == null
          ? ''
          : config.freeDeliveryThreshold!.toStringAsFixed(
              config.freeDeliveryThreshold! % 1 == 0 ? 0 : 2,
            );
      if (!mounted) return;
      setState(() {
        _config = config;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar upselling: $error')),
      );
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final parsedThreshold = double.tryParse(
        _thresholdController.text.trim().replaceAll(',', '.'),
      );
      final next = _config.copyWith(
        freeDeliveryThreshold: parsedThreshold,
        clearFreeDeliveryThreshold:
            _thresholdController.text.trim().isEmpty ||
            parsedThreshold == null ||
            parsedThreshold <= 0,
      );

      await Supabase.instance.client
          .from('comercios')
          .update({'upsell_config': next.toMap()})
          .eq('id', SupabaseConfig.currentComercioId);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Upselling guardado')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toggleProduct(List<String> current, String id, {required bool isCombo}) {
    final next = List<String>.from(current);
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    setState(() {
      _config = isCombo
          ? _config.copyWith(comboProductIds: next)
          : _config.copyWith(crossSellProductIds: next);
    });
  }

  void _moveId(List<String> current, int index, int delta, {required bool isCombo}) {
    final target = index + delta;
    if (target < 0 || target >= current.length) return;
    final next = List<String>.from(current);
    final item = next.removeAt(index);
    next.insert(target, item);
    setState(() {
      _config = isCombo
          ? _config.copyWith(comboProductIds: next)
          : _config.copyWith(crossSellProductIds: next);
    });
  }

  @override
  Widget build(BuildContext context) {
    final purple = const Color(0xFF6C4DFF);
    final productsById = {
      for (final product in widget.products) product.id: product,
    };
    final available = widget.products
        .where((p) => p.disponible && p.precio > 0)
        .toList()
      ..sort((a, b) => a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase()));

    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text(
          'Upselling',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        actions: [
          TextButton(
            onPressed: _saving || _loading ? null : _save,
            child: Text(
              'Guardar',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w700,
                color: purple,
              ),
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Text(
                  'Controla combos, recomendaciones y envío gratis del menú público.',
                  style: GoogleFonts.poppins(
                    fontSize: 13.5,
                    color: const Color(0xFF6B7280),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 16),
                _sectionCard(
                  title: 'Modo',
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: UpsellConfigModel.modeAuto, label: Text('Automático')),
                      ButtonSegment(value: UpsellConfigModel.modeCustom, label: Text('Personalizado')),
                      ButtonSegment(value: UpsellConfigModel.modeOff, label: Text('Apagado')),
                    ],
                    selected: {_config.mode},
                    onSelectionChanged: (value) {
                      setState(() => _config = _config.copyWith(mode: value.first));
                    },
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _config.mode == UpsellConfigModel.modeAuto
                      ? 'Automático usa sugerencias del catálogo (como ahora).'
                      : _config.mode == UpsellConfigModel.modeOff
                          ? 'Apagado oculta carruseles, nudges y barra de envío gratis.'
                          : 'Personalizado usa solo los productos que elijas abajo.',
                  style: GoogleFonts.poppins(
                    fontSize: 12.5,
                    color: const Color(0xFF6B7280),
                  ),
                ),
                if (_config.mode != UpsellConfigModel.modeOff) ...[
                  const SizedBox(height: 18),
                  _sectionCard(
                    title: 'Envío gratis',
                    child: TextField(
                      controller: _thresholdController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                        labelText: 'Umbral (${widget.currencyCode})',
                        hintText: 'Vacío = ocultar barra',
                        border: const OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: _config.showProductNudges,
                    onChanged: (value) {
                      setState(() => _config = _config.copyWith(showProductNudges: value));
                    },
                    title: Text(
                      'Mostrar sugerencias en tarjetas',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      'Mensajes tipo “Añade bebida…” bajo los productos.',
                      style: GoogleFonts.poppins(fontSize: 12.5),
                    ),
                  ),
                ],
                if (_config.mode == UpsellConfigModel.modeCustom) ...[
                  const SizedBox(height: 18),
                  _productPickerSection(
                    title: 'Combos recomendados',
                    selectedIds: _config.comboProductIds,
                    productsById: productsById,
                    available: available,
                    isCombo: true,
                  ),
                  const SizedBox(height: 16),
                  _productPickerSection(
                    title: 'Clientes también agregan',
                    selectedIds: _config.crossSellProductIds,
                    productsById: productsById,
                    available: available,
                    isCombo: false,
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(
                    backgroundColor: purple,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: Text(
                    _saving ? 'Guardando...' : 'Guardar upselling',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8EAF2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _productPickerSection({
    required String title,
    required List<String> selectedIds,
    required Map<String, ProductModel> productsById,
    required List<ProductModel> available,
    required bool isCombo,
  }) {
    return _sectionCard(
      title: title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (selectedIds.isEmpty)
            Text(
              'Ningún producto seleccionado.',
              style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
            ),
          ...selectedIds.asMap().entries.map((entry) {
            final index = entry.key;
            final id = entry.value;
            final product = productsById[id];
            final name = product?.nombre ?? 'Producto eliminado';
            return ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(name, style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
              subtitle: product == null
                  ? null
                  : Text(
                      '\$${product.precio.toStringAsFixed(2)}',
                      style: GoogleFonts.poppins(fontSize: 12),
                    ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Subir',
                    onPressed: () => _moveId(selectedIds, index, -1, isCombo: isCombo),
                    icon: const Icon(Icons.keyboard_arrow_up_rounded),
                  ),
                  IconButton(
                    tooltip: 'Bajar',
                    onPressed: () => _moveId(selectedIds, index, 1, isCombo: isCombo),
                    icon: const Icon(Icons.keyboard_arrow_down_rounded),
                  ),
                  IconButton(
                    tooltip: 'Quitar',
                    onPressed: () => _toggleProduct(selectedIds, id, isCombo: isCombo),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            );
          }),
          const Divider(height: 24),
          Text(
            'Agregar productos',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: available.map((product) {
              final selected = selectedIds.contains(product.id);
              return FilterChip(
                selected: selected,
                label: Text(product.nombre),
                onSelected: (_) => _toggleProduct(selectedIds, product.id, isCombo: isCombo),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
