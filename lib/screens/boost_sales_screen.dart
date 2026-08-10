import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/models/upsell_settings.dart';
import 'package:kosmenu_app/screens/boost_sales_auto_suggestions_screen.dart';
import 'package:kosmenu_app/screens/boost_sales_bundles_screen.dart';
import 'package:kosmenu_app/screens/boost_sales_goal_screen.dart';
import 'package:kosmenu_app/screens/boost_sales_rules_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// "Aumentar ventas" hub. Replaces the old chip-cloud Upselling screen with
/// a real rules engine: automatic suggestion templates, an explicit rule
/// builder, real bundles, and a genuine free-delivery goal.
class BoostSalesScreen extends StatefulWidget {
  const BoostSalesScreen({
    super.key,
    required this.categories,
    required this.products,
    required this.currencyCode,
  });

  final List<CategoryModel> categories;
  final List<ProductModel> products;
  final String currencyCode;

  @override
  State<BoostSalesScreen> createState() => _BoostSalesScreenState();
}

class _BoostSalesScreenState extends State<BoostSalesScreen> {
  static const _purple = Color(0xFF6C4DFF);

  bool _loading = true;
  bool _savingToggle = false;
  UpsellSettingsModel? _settings;
  Map<String, dynamic> _summary = const {};
  int _ruleCount = 0;
  int _bundleCount = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final comercioId = SupabaseConfig.currentComercioId.trim();
    try {
      final results = await Future.wait<dynamic>([
        Supabase.instance.client
            .from('upsell_settings')
            .select()
            .eq('comercio_id', comercioId)
            .maybeSingle(),
        Supabase.instance.client
            .from('upsell_rules')
            .select('id')
            .eq('comercio_id', comercioId),
        Supabase.instance.client
            .from('bundles')
            .select('id')
            .eq('comercio_id', comercioId),
        Supabase.instance.client.rpc(
          'get_upsell_summary',
          params: {
            'p_comercio_id': comercioId,
            'p_since': DateTime.now().subtract(const Duration(days: 30)).toIso8601String(),
          },
        ),
      ]);

      final settingsRow = results[0] as Map<String, dynamic>?;
      final rules = results[1] as List<dynamic>;
      final bundles = results[2] as List<dynamic>;
      final summary = results[3];

      if (!mounted) return;
      setState(() {
        _settings = UpsellSettingsModel.fromMap(settingsRow ?? const {}, comercioId: comercioId);
        _ruleCount = rules.length;
        _bundleCount = bundles.length;
        _summary = summary is Map<String, dynamic> ? summary : const {};
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _settings = UpsellSettingsModel(comercioId: comercioId);
        _loading = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar Aumentar ventas: $error')),
      );
    }
  }

  Future<void> _toggleEnabled(bool value) async {
    final settings = _settings;
    if (settings == null || _savingToggle) return;
    setState(() {
      _savingToggle = true;
      _settings = settings.copyWith(enabled: value);
    });
    try {
      await Supabase.instance.client
          .from('upsell_settings')
          .upsert(settings.copyWith(enabled: value).toMap(), onConflict: 'comercio_id');
    } catch (error) {
      if (!mounted) return;
      setState(() => _settings = settings);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: $error')),
      );
    } finally {
      if (mounted) setState(() => _savingToggle = false);
    }
  }

  String _money(num value) {
    final isWhole = value % 1 == 0;
    return '\$${value.toStringAsFixed(isWhole ? 0 : 2)}';
  }

  @override
  Widget build(BuildContext context) {
    final settings = _settings;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text('Aumentar ventas', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
      ),
      body: _loading || settings == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  _card(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Ventas adicionales',
                                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15)),
                              const SizedBox(height: 4),
                              Text(
                                settings.enabled
                                    ? 'Activado en tu menú público'
                                    : 'Desactivado: no se muestran sugerencias',
                                style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280)),
                              ),
                            ],
                          ),
                        ),
                        Switch.adaptive(
                          value: settings.enabled,
                          activeThumbColor: _purple,
                          onChanged: _savingToggle ? null : _toggleEnabled,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text('Este mes', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14)),
                  const SizedBox(height: 8),
                  _metricsGrid(),
                  const SizedBox(height: 20),
                  Text(
                    'Configura cómo aumentar cada pedido',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 10),
                  _navRow(
                    icon: Icons.auto_awesome_outlined,
                    title: 'Sugerencias automáticas',
                    subtitle: 'Plantillas por tipo de categoría (bebidas, acompañantes...)',
                    onTap: () => _openAndReload(BoostSalesAutoSuggestionsScreen(
                      categories: widget.categories,
                    )),
                  ),
                  _navRow(
                    icon: Icons.rule_folder_outlined,
                    title: 'Reglas',
                    subtitle: '$_ruleCount ${_ruleCount == 1 ? 'regla' : 'reglas'} activas',
                    onTap: () => _openAndReload(BoostSalesRulesScreen(
                      categories: widget.categories,
                      products: widget.products,
                      currencyCode: widget.currencyCode,
                    )),
                  ),
                  _navRow(
                    icon: Icons.local_offer_outlined,
                    title: 'Combos',
                    subtitle: '$_bundleCount ${_bundleCount == 1 ? 'combo' : 'combos'} creados',
                    onTap: () => _openAndReload(BoostSalesBundlesScreen(
                      products: widget.products,
                      currencyCode: widget.currencyCode,
                    )),
                  ),
                  _navRow(
                    icon: Icons.local_shipping_outlined,
                    title: 'Meta de envío gratis',
                    subtitle: settings.freeDeliveryThreshold != null
                        ? 'Desde ${_money(settings.freeDeliveryThreshold!)}'
                        : 'Sin configurar',
                    onTap: () => _openAndReload(BoostSalesGoalScreen(
                      currencyCode: widget.currencyCode,
                    )),
                  ),
                ],
              ),
            ),
    );
  }

  Future<void> _openAndReload(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    if (mounted) _load();
  }

  Widget _metricsGrid() {
    final revenue = (_summary['revenue_from_upsell'] as num?) ?? 0;
    final items = (_summary['items_added'] as num?) ?? 0;
    final attach = (_summary['attach_rate'] as num?) ?? 0;
    final ticket = (_summary['avg_ticket_increase'] as num?) ?? 0;

    final hasData = items > 0;

    return _card(
      child: hasData
          ? Row(
              children: [
                Expanded(child: _metricTile(_money(revenue), 'Generado por sugerencias')),
                Expanded(child: _metricTile('$items', 'Productos adicionales vendidos')),
                Expanded(child: _metricTile('${(attach * 100).toStringAsFixed(0)}%', 'Aceptación')),
                Expanded(child: _metricTile('+${_money(ticket)}', 'Por pedido aceptado')),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Todavía no hay datos suficientes.',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  'Cuando actives reglas o combos y los clientes empiecen a pedir, verás aquí ingresos, aceptación e incremento de ticket reales.',
                  style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B7280)),
                ),
              ],
            ),
    );
  }

  Widget _metricTile(String value, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 16, color: _purple)),
        const SizedBox(height: 2),
        Text(
          label,
          style: GoogleFonts.poppins(fontSize: 10.5, color: const Color(0xFF6B7280), fontWeight: FontWeight.w500),
        ),
      ],
    );
  }

  Widget _navRow({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: _card(
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _purple.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: _purple, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B7280))),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF9AA1B2)),
            ],
          ),
        ),
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
