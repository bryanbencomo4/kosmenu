import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/models/upsell_rule.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// The real engine: "Cuando alguien agregue X, sugerir Y". Rendered as
/// readable sentence-cards, never as a wall of chips.
class BoostSalesRulesScreen extends StatefulWidget {
  const BoostSalesRulesScreen({
    super.key,
    required this.categories,
    required this.products,
    required this.currencyCode,
  });

  final List<CategoryModel> categories;
  final List<ProductModel> products;
  final String currencyCode;

  @override
  State<BoostSalesRulesScreen> createState() => _BoostSalesRulesScreenState();
}

class _BoostSalesRulesScreenState extends State<BoostSalesRulesScreen> {
  static const _purple = Color(0xFF6C4DFF);

  bool _loading = true;
  List<UpsellRuleModel> _rules = [];

  Map<String, CategoryModel> get _categoryById => {for (final c in widget.categories) c.id: c};
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
          .from('upsell_rules')
          .select('*, upsell_rule_targets(*)')
          .eq('comercio_id', comercioId)
          .order('created_at');

      final rules = (rows as List<dynamic>).map((row) {
        final map = row as Map<String, dynamic>;
        final targets = (map['upsell_rule_targets'] as List<dynamic>? ?? [])
            .map((t) => UpsellRuleTarget.fromMap(t as Map<String, dynamic>))
            .toList()
          ..sort((a, b) => a.position.compareTo(b.position));
        return UpsellRuleModel.fromMap(map, targets: targets);
      }).toList();

      if (!mounted) return;
      setState(() {
        _rules = rules;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudieron cargar las reglas: $error')),
      );
    }
  }

  String _triggerLabel(UpsellRuleModel rule) {
    switch (rule.triggerType) {
      case 'product':
        final name = _productById[rule.triggerProductId]?.nombre ?? 'Producto eliminado';
        return rule.triggerMinQty > 1 ? '$name (x${rule.triggerMinQty}+)' : name;
      case 'category':
        final name = _categoryById[rule.triggerCategoryId]?.nombre ?? 'Categoría eliminada';
        return rule.triggerMinQty > 1 ? '$name (${rule.triggerMinQty}+ items)' : name;
      case 'cart':
        return 'El carrito';
      default:
        return '—';
    }
  }

  String _targetsLabel(UpsellRuleModel rule) {
    if (rule.targets.isEmpty) return 'Sin sugerencias';
    return rule.targets.map((t) {
      if (t.targetType == 'product') {
        return _productById[t.productId]?.nombre ?? 'Producto eliminado';
      }
      return _categoryById[t.categoryId]?.nombre ?? 'Categoría eliminada';
    }).join(', ');
  }

  Future<void> _toggleEnabled(UpsellRuleModel rule, bool value) async {
    try {
      await Supabase.instance.client.from('upsell_rules').update({'enabled': value}).eq('id', rule.id!);
      _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo actualizar: $error')),
      );
    }
  }

  Future<void> _deleteRule(UpsellRuleModel rule) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar regla'),
        content: Text('¿Eliminar "${rule.name}"? Esta acción no se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await Supabase.instance.client.from('upsell_rules').delete().eq('id', rule.id!);
      _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo eliminar: $error')),
      );
    }
  }

  Future<void> _openEditor([UpsellRuleModel? rule]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _RuleEditorScreen(
          categories: widget.categories,
          products: widget.products,
          rule: rule,
        ),
      ),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(title: Text('Reglas', style: GoogleFonts.poppins(fontWeight: FontWeight.w700))),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _purple,
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('Nueva regla'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _rules.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Todavía no tienes reglas. Crea una para empezar a sugerir productos en el momento correcto.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.poppins(color: const Color(0xFF6B7280)),
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                  children: _rules.map((rule) {
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
                                  child: Text(
                                    '${_triggerLabel(rule)} → ${_targetsLabel(rule)}',
                                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                                  ),
                                ),
                                Switch.adaptive(
                                  value: rule.enabled,
                                  activeThumbColor: _purple,
                                  onChanged: (value) => _toggleEnabled(rule, value),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Wrap(
                              spacing: 8,
                              children: [
                                _pill(UpsellRuleModel.surfaceLabel(rule.surface)),
                                _pill('Máx. ${rule.maxSuggestions}'),
                                _pill('Prioridad ${UpsellRuleModel.priorityLabel(rule.priority)}'),
                                if (rule.orderType != null) _pill(rule.orderType == 'delivery' ? 'Solo delivery' : 'Solo pickup'),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                TextButton(onPressed: () => _openEditor(rule), child: const Text('Editar')),
                                TextButton(
                                  onPressed: () => _deleteRule(rule),
                                  child: Text('Eliminar', style: TextStyle(color: Colors.red.shade600)),
                                ),
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

  Widget _pill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF0EEFF),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text, style: GoogleFonts.poppins(fontSize: 11, color: _purple, fontWeight: FontWeight.w600)),
    );
  }
}

class _RuleEditorScreen extends StatefulWidget {
  const _RuleEditorScreen({required this.categories, required this.products, this.rule});

  final List<CategoryModel> categories;
  final List<ProductModel> products;
  final UpsellRuleModel? rule;

  @override
  State<_RuleEditorScreen> createState() => _RuleEditorScreenState();
}

class _RuleEditorScreenState extends State<_RuleEditorScreen> {
  static const _purple = Color(0xFF6C4DFF);

  late String _triggerType;
  String? _triggerProductId;
  String? _triggerCategoryId;
  int _triggerMinQty = 1;
  late String _surface;
  late String _priority;
  int _maxSuggestions = 2;
  String? _orderType;
  final _minCartController = TextEditingController();
  final _maxCartController = TextEditingController();
  late List<UpsellRuleTarget> _targets;
  bool _saving = false;

  bool get _isEditing => widget.rule != null;

  @override
  void initState() {
    super.initState();
    final rule = widget.rule;
    _triggerType = rule?.triggerType ?? 'product';
    _triggerProductId = rule?.triggerProductId;
    _triggerCategoryId = rule?.triggerCategoryId;
    _triggerMinQty = rule?.triggerMinQty ?? 1;
    _surface = rule?.surface ?? UpsellRuleModel.surfaceAddToCart;
    _priority = rule?.priority ?? 'normal';
    _maxSuggestions = rule?.maxSuggestions ?? 2;
    _orderType = rule?.orderType;
    _minCartController.text = rule?.minCartAmount?.toStringAsFixed(2) ?? '';
    _maxCartController.text = rule?.maxCartAmount?.toStringAsFixed(2) ?? '';
    _targets = List<UpsellRuleTarget>.from(rule?.targets ?? const []);
  }

  @override
  void dispose() {
    _minCartController.dispose();
    _maxCartController.dispose();
    super.dispose();
  }

  String _autoName() {
    final products = {for (final p in widget.products) p.id: p.nombre};
    final categories = {for (final c in widget.categories) c.id: c.nombre};
    final triggerName = _triggerType == 'product'
        ? (products[_triggerProductId] ?? 'Producto')
        : _triggerType == 'category'
            ? (categories[_triggerCategoryId] ?? 'Categoría')
            : 'Carrito';
    final targetNames = _targets
        .map((t) => t.targetType == 'product' ? products[t.productId] : categories[t.categoryId])
        .whereType<String>()
        .join(', ');
    return targetNames.isEmpty ? triggerName : '$triggerName → $targetNames';
  }

  bool get _canSave {
    if (_triggerType == 'product' && _triggerProductId == null) return false;
    if (_triggerType == 'category' && _triggerCategoryId == null) return false;
    if (_triggerType == 'cart' && _triggerProductId == null && _triggerCategoryId == null) return false;
    return _targets.isNotEmpty;
  }

  Future<void> _save() async {
    if (!_canSave || _saving) return;
    setState(() => _saving = true);
    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      final minCart = double.tryParse(_minCartController.text.trim().replaceAll(',', '.'));
      final maxCart = double.tryParse(_maxCartController.text.trim().replaceAll(',', '.'));

      final payload = UpsellRuleModel(
        comercioId: comercioId,
        name: _autoName(),
        enabled: widget.rule?.enabled ?? true,
        triggerType: _triggerType,
        triggerProductId: _triggerType != 'category' ? _triggerProductId : null,
        triggerCategoryId: _triggerType != 'product' ? _triggerCategoryId : null,
        triggerMinQty: _triggerMinQty,
        surface: _surface,
        priority: _priority,
        minCartAmount: minCart,
        maxCartAmount: maxCart,
        orderType: _orderType,
        maxSuggestions: _maxSuggestions,
      ).toMap();

      String ruleId;
      if (_isEditing) {
        ruleId = widget.rule!.id!;
        await Supabase.instance.client.from('upsell_rules').update(payload).eq('id', ruleId);
        await Supabase.instance.client.from('upsell_rule_targets').delete().eq('rule_id', ruleId);
      } else {
        final inserted = await Supabase.instance.client
            .from('upsell_rules')
            .insert(payload)
            .select('id')
            .single();
        ruleId = inserted['id'].toString();
      }

      var position = 0;
      for (final target in _targets) {
        await Supabase.instance.client.from('upsell_rule_targets').insert(target.toMap(ruleId)..['position'] = position);
        position++;
      }

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar la regla: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _addTarget() {
    setState(() => _targets = [..._targets, const UpsellRuleTarget(targetType: 'category')]);
  }

  void _removeTarget(int index) {
    setState(() {
      final next = List<UpsellRuleTarget>.from(_targets);
      next.removeAt(index);
      _targets = next;
    });
  }

  void _updateTarget(int index, UpsellRuleTarget target) {
    setState(() {
      final next = List<UpsellRuleTarget>.from(_targets);
      next[index] = target;
      _targets = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text(_isEditing ? 'Editar regla' : 'Nueva regla', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
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
          _sentenceCard(
            label: 'Cuando alguien agregue',
            child: _triggerPicker(),
          ),
          const SizedBox(height: 12),
          _sentenceCard(
            label: 'sugerir',
            child: _targetsPicker(),
          ),
          const SizedBox(height: 12),
          _sentenceCard(
            label: 'mostrar',
            child: DropdownButton<String>(
              isExpanded: true,
              value: _surface,
              items: const [
                DropdownMenuItem(value: UpsellRuleModel.surfaceAddToCart, child: Text('Al agregar al carrito')),
                DropdownMenuItem(value: UpsellRuleModel.surfaceCart, child: Text('En el carrito')),
                DropdownMenuItem(value: UpsellRuleModel.surfaceCheckout, child: Text('Antes de pagar')),
              ],
              onChanged: (value) => setState(() => _surface = value ?? _surface),
            ),
          ),
          const SizedBox(height: 12),
          _sentenceCard(
            label: 'máximo',
            child: Row(
              children: [
                IconButton(
                  onPressed: _maxSuggestions > 1 ? () => setState(() => _maxSuggestions--) : null,
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text('$_maxSuggestions productos', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
                IconButton(
                  onPressed: _maxSuggestions < 5 ? () => setState(() => _maxSuggestions++) : null,
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _sentenceCard(
            label: 'prioridad',
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'low', label: Text('Baja')),
                ButtonSegment(value: 'normal', label: Text('Normal')),
                ButtonSegment(value: 'high', label: Text('Alta')),
              ],
              selected: {_priority},
              onSelectionChanged: (value) => setState(() => _priority = value.first),
            ),
          ),
          const SizedBox(height: 18),
          ExpansionTile(
            title: Text('Avanzado', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13.5)),
            tilePadding: EdgeInsets.zero,
            childrenPadding: EdgeInsets.zero,
            children: [
              _sentenceCard(
                label: 'tipo de pedido',
                child: DropdownButton<String?>(
                  isExpanded: true,
                  value: _orderType,
                  items: const [
                    DropdownMenuItem(value: null, child: Text('Delivery y pickup')),
                    DropdownMenuItem(value: 'delivery', child: Text('Solo delivery')),
                    DropdownMenuItem(value: 'pickup', child: Text('Solo pickup')),
                  ],
                  onChanged: (value) => setState(() => _orderType = value),
                ),
              ),
              const SizedBox(height: 12),
              _sentenceCard(
                label: 'monto del carrito (opcional)',
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _minCartController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Mínimo'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _maxCartController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Máximo'),
                      ),
                    ),
                  ],
                ),
              ),
              if (_triggerType == 'cart') ...[
                const SizedBox(height: 12),
                _sentenceCard(
                  label: 'cantidad mínima en el carrito',
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: _triggerMinQty > 1 ? () => setState(() => _triggerMinQty--) : null,
                        icon: const Icon(Icons.remove_circle_outline),
                      ),
                      Text('$_triggerMinQty', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
                      IconButton(
                        onPressed: () => setState(() => _triggerMinQty++),
                        icon: const Icon(Icons.add_circle_outline),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _triggerPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'product', label: Text('Producto')),
            ButtonSegment(value: 'category', label: Text('Categoría')),
            ButtonSegment(value: 'cart', label: Text('Carrito')),
          ],
          selected: {_triggerType},
          onSelectionChanged: (value) => setState(() => _triggerType = value.first),
        ),
        const SizedBox(height: 10),
        if (_triggerType == 'product' || _triggerType == 'cart')
          DropdownButton<String?>(
            isExpanded: true,
            value: _triggerProductId,
            hint: const Text('Elige un producto'),
            items: widget.products
                .map((p) => DropdownMenuItem<String?>(value: p.id, child: Text(p.nombre, overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: (value) => setState(() {
              _triggerProductId = value;
              if (value != null) _triggerCategoryId = null;
            }),
          ),
        if (_triggerType == 'category' || (_triggerType == 'cart' && _triggerProductId == null))
          DropdownButton<String?>(
            isExpanded: true,
            value: _triggerCategoryId,
            hint: const Text('Elige una categoría'),
            items: widget.categories
                .map((c) => DropdownMenuItem<String?>(value: c.id, child: Text(c.nombre)))
                .toList(),
            onChanged: (value) => setState(() {
              _triggerCategoryId = value;
              if (value != null) _triggerProductId = null;
            }),
          ),
      ],
    );
  }

  Widget _targetsPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ..._targets.asMap().entries.map((entry) {
          final index = entry.key;
          final target = entry.value;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'category', label: Text('Categoría')),
                    ButtonSegment(value: 'product', label: Text('Producto')),
                  ],
                  selected: {target.targetType},
                  onSelectionChanged: (value) => _updateTarget(
                    index,
                    UpsellRuleTarget(targetType: value.first, position: index),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: target.targetType == 'product'
                      ? DropdownButton<String?>(
                          isExpanded: true,
                          value: target.productId,
                          hint: const Text('Elige producto'),
                          items: widget.products
                              .map((p) => DropdownMenuItem<String?>(value: p.id, child: Text(p.nombre, overflow: TextOverflow.ellipsis)))
                              .toList(),
                          onChanged: (value) => _updateTarget(
                            index,
                            UpsellRuleTarget(targetType: 'product', productId: value, position: index),
                          ),
                        )
                      : DropdownButton<String?>(
                          isExpanded: true,
                          value: target.categoryId,
                          hint: const Text('Elige categoría'),
                          items: widget.categories
                              .map((c) => DropdownMenuItem<String?>(value: c.id, child: Text(c.nombre)))
                              .toList(),
                          onChanged: (value) => _updateTarget(
                            index,
                            UpsellRuleTarget(targetType: 'category', categoryId: value, position: index),
                          ),
                        ),
                ),
                IconButton(onPressed: () => _removeTarget(index), icon: const Icon(Icons.close_rounded)),
              ],
            ),
          );
        }),
        TextButton.icon(
          onPressed: _addTarget,
          icon: const Icon(Icons.add),
          label: const Text('Agregar sugerencia'),
        ),
      ],
    );
  }

  Widget _sentenceCard({required String label, required Widget child}) {
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
          Text(label, style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 12.5, color: const Color(0xFF6B7280))),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}
