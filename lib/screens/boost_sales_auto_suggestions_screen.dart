import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _RoleTemplate {
  const _RoleTemplate(this.fromRole, this.toRole);
  final String fromRole;
  final String toRole;

  String get label => '${CategoryModel.roleLabel(fromRole)} → ${CategoryModel.roleLabel(toRole)}';
}

const _templates = <_RoleTemplate>[
  _RoleTemplate('main', 'drink'),
  _RoleTemplate('main', 'side'),
  _RoleTemplate('main', 'extra'),
  _RoleTemplate('side', 'drink'),
];

/// Cold-start cross-sell: the merchant assigns a role to each category
/// (plato principal, bebida, acompañante...) and approves ready-made
/// category -> category rules. No invented popularity, no fake ratings.
class BoostSalesAutoSuggestionsScreen extends StatefulWidget {
  const BoostSalesAutoSuggestionsScreen({super.key, required this.categories});

  final List<CategoryModel> categories;

  @override
  State<BoostSalesAutoSuggestionsScreen> createState() => _BoostSalesAutoSuggestionsScreenState();
}

class _BoostSalesAutoSuggestionsScreenState extends State<BoostSalesAutoSuggestionsScreen> {
  static const _purple = Color(0xFF6C4DFF);

  bool _loading = true;
  bool _saving = false;
  late Map<String, String?> _roleByCategoryId;
  Set<String> _approvedTemplateKeys = {};

  @override
  void initState() {
    super.initState();
    _roleByCategoryId = {for (final c in widget.categories) c.id: c.rol};
    _loadExistingRules();
  }

  String _templateKey(_RoleTemplate t) => '${t.fromRole}->${t.toRole}';

  Future<void> _loadExistingRules() async {
    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      final rules = await Supabase.instance.client
          .from('upsell_rules')
          .select('id, trigger_category_id, upsell_rule_targets(category_id)')
          .eq('comercio_id', comercioId)
          .eq('trigger_type', 'category');

      final approved = <String>{};
      for (final rule in rules as List<dynamic>) {
        final triggerCategoryId = rule['trigger_category_id']?.toString();
        final fromRole = _roleByCategoryId[triggerCategoryId];
        if (fromRole == null) continue;
        final targets = (rule['upsell_rule_targets'] as List<dynamic>? ?? []);
        for (final target in targets) {
          final targetCategoryId = target['category_id']?.toString();
          final toRole = _roleByCategoryId[targetCategoryId];
          if (toRole == null) continue;
          approved.add('$fromRole->$toRole');
        }
      }
      if (!mounted) return;
      setState(() {
        _approvedTemplateKeys = approved;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveRoles() async {
    setState(() => _saving = true);
    try {
      final futures = <Future>[];
      for (final category in widget.categories) {
        if (_roleByCategoryId[category.id] == category.rol) continue;
        futures.add(
          Supabase.instance.client
              .from('categorias')
              .update({'rol': _roleByCategoryId[category.id]})
              .eq('id', category.id),
        );
      }
      await Future.wait(futures);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Roles de categoría guardados')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  List<CategoryModel> _categoriesWithRole(String role) =>
      widget.categories.where((c) => _roleByCategoryId[c.id] == role).toList();

  Future<void> _approveTemplate(_RoleTemplate template) async {
    final fromCategories = _categoriesWithRole(template.fromRole);
    final toCategories = _categoriesWithRole(template.toRole);
    if (fromCategories.isEmpty || toCategories.isEmpty) return;

    setState(() => _saving = true);
    try {
      final comercioId = SupabaseConfig.currentComercioId.trim();
      for (final from in fromCategories) {
        final ruleRow = await Supabase.instance.client
            .from('upsell_rules')
            .insert({
              'comercio_id': comercioId,
              'name': '${from.nombre} → ${CategoryModel.roleLabel(template.toRole)}',
              'enabled': true,
              'trigger_type': 'category',
              'trigger_category_id': from.id,
              'trigger_min_qty': 1,
              'surface': 'add_to_cart',
              'priority': 'normal',
              'max_suggestions': 2,
            })
            .select('id')
            .single();

        final ruleId = ruleRow['id'].toString();
        var position = 0;
        for (final to in toCategories) {
          await Supabase.instance.client.from('upsell_rule_targets').insert({
            'rule_id': ruleId,
            'target_type': 'category',
            'category_id': to.id,
            'position': position,
            'enabled': true,
          });
          position++;
        }
      }
      if (!mounted) return;
      setState(() => _approvedTemplateKeys = {..._approvedTemplateKeys, _templateKey(template)});
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Plantilla activada: ${template.label}')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo activar: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text('Sugerencias automáticas', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        actions: [
          TextButton(
            onPressed: _saving ? null : _saveRoles,
            child: Text('Guardar', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, color: _purple)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Text(
                  'ElMenúXFA usa las relaciones entre categorías que tú apruebes. Nunca inventamos popularidad ni comportamiento de otros clientes.',
                  style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280), fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 16),
                _card(
                  title: '¿Qué tipo de productos contiene cada categoría?',
                  child: Column(
                    children: widget.categories.map((category) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(category.nombre, style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 13.5)),
                            ),
                            DropdownButton<String?>(
                              value: _roleByCategoryId[category.id],
                              hint: const Text('Sin definir'),
                              items: [
                                const DropdownMenuItem<String?>(value: null, child: Text('Sin definir')),
                                ...CategoryModel.roles.map(
                                  (role) => DropdownMenuItem<String?>(value: role, child: Text(CategoryModel.roleLabel(role))),
                                ),
                              ],
                              onChanged: (value) => setState(() => _roleByCategoryId[category.id] = value),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 18),
                Text('Plantillas sugeridas', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 8),
                ..._templates.map((template) {
                  final fromCount = _categoriesWithRole(template.fromRole).length;
                  final toCount = _categoriesWithRole(template.toRole).length;
                  final available = fromCount > 0 && toCount > 0;
                  final approved = _approvedTemplateKeys.contains(_templateKey(template));
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _card(
                      title: null,
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(template.label, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                const SizedBox(height: 2),
                                Text(
                                  available
                                      ? 'Al agregar de estas categorías, sugerir de las otras.'
                                      : 'Asigna roles primero para poder activarla.',
                                  style: GoogleFonts.poppins(fontSize: 11.5, color: const Color(0xFF6B7280)),
                                ),
                              ],
                            ),
                          ),
                          if (approved)
                            Text('Activa', style: GoogleFonts.poppins(color: Colors.green.shade700, fontWeight: FontWeight.w700, fontSize: 12.5))
                          else
                            FilledButton(
                              onPressed: available && !_saving ? () => _approveTemplate(template) : null,
                              style: FilledButton.styleFrom(backgroundColor: _purple),
                              child: const Text('Usar'),
                            ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
    );
  }

  Widget _card({required String? title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8EAF2)),
      ),
      child: title == null
          ? child
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 10),
                child,
              ],
            ),
    );
  }
}
