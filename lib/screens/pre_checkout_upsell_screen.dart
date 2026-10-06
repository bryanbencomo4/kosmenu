import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/pre_checkout_upsell.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class PreCheckoutUpsellScreen extends StatefulWidget {
  const PreCheckoutUpsellScreen({super.key, required this.categories});

  final List<CategoryModel> categories;

  @override
  State<PreCheckoutUpsellScreen> createState() => _PreCheckoutUpsellScreenState();
}

class _PreCheckoutUpsellScreenState extends State<PreCheckoutUpsellScreen> {
  static const _purple = Color(0xFF6C4DFF);

  bool _loading = true;
  bool _saving = false;
  Map<String, dynamic> _existingConfig = const {};
  PreCheckoutUpsellConfig _config = const PreCheckoutUpsellConfig();
  late Map<String, String?> _rolByCategoryId;

  @override
  void initState() {
    super.initState();
    _rolByCategoryId = {
      for (final category in widget.categories) category.id: category.rol,
    };
    _load();
  }

  List<PreCheckoutListedCategory> _listedFromRoles() {
    return [
      for (final category in widget.categories)
        if (PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id]) != null)
          PreCheckoutListedCategory(
            id: category.id,
            tipo: PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id])!,
          ),
    ];
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final comercioId = SupabaseConfig.currentComercioId.trim();
    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('upsell_config')
          .eq('id', comercioId)
          .maybeSingle();
      final raw = row?['upsell_config'];
      final existing = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
      var config = PreCheckoutUpsellConfig.fromUpsellConfig(existing);
      if (config.categorias.isEmpty) {
        config = config.copyWith(categorias: _listedFromRoles());
      } else {
        for (final listed in config.categorias) {
          _rolByCategoryId[listed.id] = PreCheckoutUpsellConfig.rolFromKind(listed.tipo);
        }
      }
      if (!mounted) return;
      setState(() {
        _existingConfig = existing;
        _config = config;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar venta sugerida: $error')),
      );
    }
  }

  Future<void> _save(PreCheckoutUpsellConfig next) async {
    final withListed = next.copyWith(categorias: _listedFromRoles());
    setState(() {
      _saving = true;
      _config = withListed;
    });
    try {
      await Supabase.instance.client
          .from('comercios')
          .update({'upsell_config': withListed.mergeIntoUpsellConfig(_existingConfig)})
          .eq('id', SupabaseConfig.currentComercioId.trim());
      if (!mounted) return;
      setState(() => _existingConfig = withListed.mergeIntoUpsellConfig(_existingConfig));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setCategoryKind(CategoryModel category, String? tipo) async {
    final rol = PreCheckoutUpsellConfig.rolFromKind(tipo);
    setState(() => _rolByCategoryId[category.id] = rol);
    try {
      await Supabase.instance.client
          .from('categorias')
          .update({'rol': rol})
          .eq('id', category.id)
          .eq('comercio_id', SupabaseConfig.currentComercioId.trim());
      await _save(_config);
    } catch (error) {
      if (!mounted) return;
      setState(() => _rolByCategoryId[category.id] = category.rol);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el tipo de ${category.nombre}: $error')),
      );
    }
  }

  void _toggleTipo(String tipo, bool selected) {
    final next = [..._config.tipos];
    if (selected) {
      if (!next.contains(tipo)) next.add(tipo);
    } else {
      next.remove(tipo);
    }
    _save(_config.copyWith(tipos: next));
  }

  void _setRuleTipos(CategoryModel category, List<String> tipos) {
    final nextRules = [
      for (final rule in _config.reglas)
        if (rule.categoriaId != category.id) rule,
      if (tipos.isNotEmpty)
        PreCheckoutUpsellRule(
          categoriaId: category.id,
          categoriaOrigen: category.nombre,
          sugerirTipos: tipos,
        ),
    ];
    _save(_config.copyWith(reglas: nextRules));
  }

  List<String> _ruleTiposFor(String categoryId) {
    return _config.reglas
        .where((rule) => rule.categoriaId == categoryId)
        .expand((rule) => rule.sugerirTipos)
        .toSet()
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final suggestible = widget.categories
        .where((category) => PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id]) != null)
        .toList();
    final originCategories = widget.categories
        .where((category) => PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id]) == null)
        .toList();
    final missingTipos = _config.tipos
        .where(
          (tipo) => !suggestible.any(
            (category) => PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id]) == tipo,
          ),
        )
        .toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text('Venta sugerida', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                _card(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Ofrecer productos antes del checkout',
                              style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _config.activo
                                  ? 'Activada: Carrito → Sugerencias → Checkout'
                                  : 'Desactivada: el flujo sigue Carrito → Checkout',
                              style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                            ),
                          ],
                        ),
                      ),
                      Switch.adaptive(
                        value: _config.activo,
                        activeThumbColor: _purple,
                        onChanged: _saving ? null : (value) => _save(_config.copyWith(activo: value)),
                      ),
                    ],
                  ),
                ),
                if (_config.activo) ...[
                  const SizedBox(height: 16),
                  Text(
                    'Marca tus categorías',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Tener una categoría llamada Bebidas no alcanza. Elige el tipo de cada una: Bebidas, Postres o Complementos.',
                    style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                  ),
                  const SizedBox(height: 8),
                  if (widget.categories.isEmpty)
                    _card(
                      child: Text(
                        'Crea primero las categorías en Gestión de categorías.',
                        style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                      ),
                    )
                  else
                    for (final category in widget.categories)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _card(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                category.nombre,
                                style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  ChoiceChip(
                                    label: const Text('Normal'),
                                    selected: PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id]) == null,
                                    onSelected: _saving
                                        ? null
                                        : (_) => _setCategoryKind(category, null),
                                    selectedColor: _purple.withValues(alpha: 0.16),
                                  ),
                                  for (final tipo in PreCheckoutUpsellConfig.kinds)
                                    ChoiceChip(
                                      label: Text(PreCheckoutUpsellConfig.kindLabel(tipo)),
                                      selected:
                                          PreCheckoutUpsellConfig.kindFromRol(_rolByCategoryId[category.id]) == tipo,
                                      onSelected: _saving
                                          ? null
                                          : (selected) => _setCategoryKind(
                                                category,
                                                selected ? tipo : null,
                                              ),
                                      selectedColor: _purple.withValues(alpha: 0.16),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  if (missingTipos.isNotEmpty) ...[
                    _card(
                      child: Text(
                        'Activaste ${missingTipos.map(PreCheckoutUpsellConfig.kindLabel).join(', ')}, pero ninguna categoría tiene ese tipo. Márcala arriba o no se mostrará nada antes de pagar.',
                        style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFFB45309)),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  Text(
                    '¿Qué tipos ofrecer?',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 8),
                  _card(
                    child: Column(
                      children: [
                        for (final tipo in PreCheckoutUpsellConfig.kinds)
                          CheckboxListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            value: _config.tipos.contains(tipo),
                            onChanged: _saving
                                ? null
                                : (value) => _toggleTipo(tipo, value ?? false),
                            title: Text(
                              PreCheckoutUpsellConfig.kindLabel(tipo),
                              style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
                            ),
                            controlAffinity: ListTileControlAffinity.leading,
                            activeColor: _purple,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Máximo productos sugeridos',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 8),
                  _card(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_config.maxProductos}',
                          style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20, color: _purple),
                        ),
                        Slider(
                          value: _config.maxProductos.toDouble().clamp(1, 24),
                          min: 1,
                          max: 24,
                          divisions: 23,
                          label: '${_config.maxProductos}',
                          activeColor: _purple,
                          onChanged: _saving
                              ? null
                              : (value) => setState(
                                    () => _config = _config.copyWith(maxProductos: value.round()),
                                  ),
                          onChangeEnd: (value) => _save(_config.copyWith(maxProductos: value.round())),
                        ),
                        Text(
                          'Puedes sugerir hasta 24 productos.',
                          style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B7280)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Reglas por categoría de origen',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Si el cliente pide de esta categoría, qué tipos sugerir. Vacío = usa las casillas de arriba.',
                    style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                  ),
                  const SizedBox(height: 8),
                  if (originCategories.isEmpty)
                    _card(
                      child: Text(
                        suggestible.isEmpty
                            ? 'Marca arriba al menos una categoría como Bebidas, Postres o Complementos.'
                            : 'Todas tus categorías ya tienen un tipo especial. Las de origen (pizzas, hamburguesas) deben quedar en Normal.',
                        style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                      ),
                    )
                  else
                    for (final category in originCategories)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _card(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                category.nombre,
                                style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  for (final tipo in PreCheckoutUpsellConfig.kinds)
                                    FilterChip(
                                      label: Text(PreCheckoutUpsellConfig.kindLabel(tipo)),
                                      selected: _ruleTiposFor(category.id).contains(tipo),
                                      onSelected: _saving
                                          ? null
                                          : (selected) {
                                              final current = _ruleTiposFor(category.id);
                                              final next = [...current];
                                              if (selected) {
                                                if (!next.contains(tipo)) next.add(tipo);
                                              } else {
                                                next.remove(tipo);
                                              }
                                              _setRuleTipos(category, next);
                                            },
                                      selectedColor: _purple.withValues(alpha: 0.16),
                                      checkmarkColor: _purple,
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                ],
              ],
            ),
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8EAF2)),
      ),
      child: child,
    );
  }
}
