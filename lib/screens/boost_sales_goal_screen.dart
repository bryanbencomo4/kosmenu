import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/upsell_settings.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// A real free-delivery goal: only shown on the public menu when there is
/// an actual threshold, and only for the order types the merchant picks.
class BoostSalesGoalScreen extends StatefulWidget {
  const BoostSalesGoalScreen({super.key, required this.currencyCode});

  final String currencyCode;

  @override
  State<BoostSalesGoalScreen> createState() => _BoostSalesGoalScreenState();
}

class _BoostSalesGoalScreenState extends State<BoostSalesGoalScreen> {
  static const _purple = Color(0xFF6C4DFF);

  bool _loading = true;
  bool _saving = false;
  UpsellSettingsModel? _settings;
  final _thresholdController = TextEditingController();
  bool _appliesDelivery = true;
  bool _appliesPickup = false;

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
    final comercioId = SupabaseConfig.currentComercioId.trim();
    try {
      final row = await Supabase.instance.client
          .from('upsell_settings')
          .select()
          .eq('comercio_id', comercioId)
          .maybeSingle();
      final settings = UpsellSettingsModel.fromMap(row ?? const {}, comercioId: comercioId);
      if (!mounted) return;
      setState(() {
        _settings = settings;
        _thresholdController.text = settings.freeDeliveryThreshold?.toStringAsFixed(
              settings.freeDeliveryThreshold! % 1 == 0 ? 0 : 2,
            ) ??
            '';
        _appliesDelivery = settings.freeDeliveryOrderTypes.contains('delivery');
        _appliesPickup = settings.freeDeliveryOrderTypes.contains('pickup');
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _settings = UpsellSettingsModel(comercioId: comercioId);
        _loading = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar: $error')),
      );
    }
  }

  Future<void> _save() async {
    final settings = _settings;
    if (settings == null || _saving) return;
    setState(() => _saving = true);
    try {
      final parsed = double.tryParse(_thresholdController.text.trim().replaceAll(',', '.'));
      final orderTypes = <String>[
        if (_appliesDelivery) 'delivery',
        if (_appliesPickup) 'pickup',
      ];
      final next = settings.copyWith(
        freeDeliveryThreshold: (parsed == null || parsed <= 0) ? null : parsed,
        clearFreeDeliveryThreshold: parsed == null || parsed <= 0,
        freeDeliveryOrderTypes: orderTypes.isEmpty ? ['delivery'] : orderTypes,
      );
      await Supabase.instance.client.from('upsell_settings').upsert(next.toMap(), onConflict: 'comercio_id');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meta de envío gratis guardada')));
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo guardar: $error')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text('Meta de envío gratis', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        actions: [
          TextButton(
            onPressed: _saving || _loading ? null : _save,
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
                  'La barra de progreso solo tiene sentido si representa una política real de envío gratis. Déjala vacía si no aplica.',
                  style: GoogleFonts.poppins(fontSize: 12.5, color: const Color(0xFF6B7280), fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 16),
                _card(
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
                _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('¿A qué tipo de pedido aplica?', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13.5)),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _appliesDelivery,
                        title: const Text('Delivery'),
                        onChanged: (value) => setState(() => _appliesDelivery = value ?? true),
                      ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _appliesPickup,
                        title: const Text('Pickup'),
                        subtitle: const Text('Normalmente no aplica: el envío gratis no tiene sentido para retiro en tienda.'),
                        onChanged: (value) => setState(() => _appliesPickup = value ?? false),
                      ),
                    ],
                  ),
                ),
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
