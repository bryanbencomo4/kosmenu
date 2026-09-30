import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/delivery_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DeliverySettingsScreen extends StatefulWidget {
  const DeliverySettingsScreen({super.key});

  @override
  State<DeliverySettingsScreen> createState() => _DeliverySettingsScreenState();
}

class _DeliverySettingsScreenState extends State<DeliverySettingsScreen> {
  static const _purple = Color(0xFF6D28D9);
  static const _muted = Color(0xFF6B7280);

  bool _loading = true;
  bool _saving = false;
  Map<String, dynamic> _branding = const {};
  Map<String, dynamic> _configNegocio = const {};
  DeliveryConfig _config = const DeliveryConfig();

  late final TextEditingController _fixedPrice;
  late final TextEditingController _basePrice;
  late final TextEditingController _includedKm;
  late final TextEditingController _extraKm;
  late final TextEditingController _freeMinimum;
  late final TextEditingController _minOrder;
  late final TextEditingController _prepMinutes;
  late final TextEditingController _deliveryMinutes;
  late final TextEditingController _customMessage;
  final List<_ZoneControllers> _zones = [];

  @override
  void initState() {
    super.initState();
    _fixedPrice = TextEditingController();
    _basePrice = TextEditingController();
    _includedKm = TextEditingController();
    _extraKm = TextEditingController();
    _freeMinimum = TextEditingController();
    _minOrder = TextEditingController();
    _prepMinutes = TextEditingController();
    _deliveryMinutes = TextEditingController();
    _customMessage = TextEditingController();
    _load();
  }

  @override
  void dispose() {
    _fixedPrice.dispose();
    _basePrice.dispose();
    _includedKm.dispose();
    _extraKm.dispose();
    _freeMinimum.dispose();
    _minOrder.dispose();
    _prepMinutes.dispose();
    _deliveryMinutes.dispose();
    _customMessage.dispose();
    for (final zone in _zones) {
      zone.dispose();
    }
    super.dispose();
  }

  void _hydrate(DeliveryConfig config) {
    _config = config;
    _fixedPrice.text = _num(config.fixedPrice);
    _basePrice.text = _num(config.distance.basePrice);
    _includedKm.text = _num(config.distance.includedKm);
    _extraKm.text = _num(config.distance.extraPricePerKm);
    _freeMinimum.text = _num(config.freeDeliveryMinimum);
    _minOrder.text = _num(config.minOrder);
    _prepMinutes.text = '${config.preparationMinutes}';
    _deliveryMinutes.text = '${config.deliveryMinutes}';
    _customMessage.text = config.customMessage;
    for (final zone in _zones) {
      zone.dispose();
    }
    _zones
      ..clear()
      ..addAll(
        (config.zones.isEmpty
                ? const [
                    DeliveryZone(name: 'Cercana', minDistance: 0, maxDistance: 3, price: 0),
                  ]
                : config.zones)
            .map(_ZoneControllers.fromZone),
      );
  }

  String _num(double value) {
    if (value == value.roundToDouble()) return '${value.round()}';
    return value.toString();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('branding_ia')
          .eq('id', SupabaseConfig.currentComercioId.trim())
          .maybeSingle();
      final brandingRaw = row?['branding_ia'];
      final branding = brandingRaw is Map
          ? Map<String, dynamic>.from(brandingRaw)
          : <String, dynamic>{};
      final configRaw = branding['config_negocio'];
      final configNegocio =
          configRaw is Map ? Map<String, dynamic>.from(configRaw) : <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        _branding = branding;
        _configNegocio = configNegocio;
        _hydrate(DeliveryConfig.fromConfigNegocio(configNegocio));
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar delivery: $error')),
      );
    }
  }

  DeliveryConfig _draft() {
    return _config.copyWith(
      fixedPrice: double.tryParse(_fixedPrice.text.replaceAll(',', '.')) ?? 0,
      distance: DeliveryDistanceConfig(
        basePrice: double.tryParse(_basePrice.text.replaceAll(',', '.')) ?? 0,
        includedKm: double.tryParse(_includedKm.text.replaceAll(',', '.')) ?? 0,
        extraPricePerKm: double.tryParse(_extraKm.text.replaceAll(',', '.')) ?? 0,
      ),
      zones: _zones.map((zone) => zone.toZone()).toList(),
      freeDeliveryMinimum:
          double.tryParse(_freeMinimum.text.replaceAll(',', '.')) ?? 0,
      minOrder: double.tryParse(_minOrder.text.replaceAll(',', '.')) ?? 0,
      preparationMinutes: int.tryParse(_prepMinutes.text) ?? 20,
      deliveryMinutes: int.tryParse(_deliveryMinutes.text) ?? 30,
      customMessage: _customMessage.text.trim(),
    );
  }

  Future<void> _save(DeliveryConfig next, {bool silent = false}) async {
    final errors = next.enabled ? next.validate() : const <String>[];
    if (errors.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(errors.first)),
      );
      return;
    }
    setState(() {
      _saving = true;
      _config = next;
    });
    try {
      final mergedConfig = next.mergeIntoConfigNegocio(_configNegocio);
      final branding = Map<String, dynamic>.from(_branding);
      branding['config_negocio'] = mergedConfig;
      await Supabase.instance.client.from('comercios').update({
        'branding_ia': branding,
      }).eq('id', SupabaseConfig.currentComercioId.trim());
      if (!mounted) return;
      setState(() {
        _configNegocio = mergedConfig;
        _branding = branding;
      });
      if (!silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tarifas de delivery guardadas.')),
        );
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: $error')),
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
        title: Text(
          'Delivery',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text('🚚', style: TextStyle(fontSize: 22)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Delivery',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                              ),
                            ),
                          ),
                          Switch.adaptive(
                            value: _config.enabled,
                            activeThumbColor: _purple,
                            onChanged: _saving
                                ? null
                                : (value) {
                                    final next = _draft().copyWith(enabled: value);
                                    setState(() => _config = next);
                                    _save(next, silent: true);
                                  },
                          ),
                        ],
                      ),
                      Text(
                        _config.enabled ? 'Activo' : 'Inactivo',
                        style: GoogleFonts.poppins(
                          color: _config.enabled ? _purple : _muted,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Activa esta opción si deseas cobrar automáticamente el servicio de entrega a tus clientes. Si está apagada, el checkout no cambia.',
                        style: GoogleFonts.poppins(fontSize: 13, color: _muted, height: 1.35),
                      ),
                    ],
                  ),
                ),
                if (!_config.enabled) ...[
                  const SizedBox(height: 12),
                  _card(
                    child: Text(
                      'No se muestran tarifas al cliente y los pedidos siguen igual. Enciende delivery cuando quieras definir precios.',
                      style: GoogleFonts.poppins(fontSize: 13, color: _muted, height: 1.4),
                    ),
                  ),
                ] else ...[
                  const SizedBox(height: 16),
                  Text(
                    '¿Cómo calcular el delivery?',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 8),
                  _card(
                    child: Column(
                      children: [
                        _radio('Precio fijo', DeliveryConfig.pricingFixed),
                        _radio('Por distancia', DeliveryConfig.pricingDistance),
                        _radio('Por zonas', DeliveryConfig.pricingZones),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_config.pricingType == DeliveryConfig.pricingFixed)
                    _card(
                      child: _moneyField(
                        controller: _fixedPrice,
                        label: 'Delivery cuesta',
                        hint: '3',
                        helper: 'Todos los pedidos de delivery tendrán este costo.',
                      ),
                    ),
                  if (_config.pricingType == DeliveryConfig.pricingDistance)
                    _card(
                      child: Column(
                        children: [
                          _moneyField(
                            controller: _basePrice,
                            label: 'Precio base',
                            hint: '2',
                          ),
                          const SizedBox(height: 10),
                          _moneyField(
                            controller: _includedKm,
                            label: 'Kilómetros incluidos',
                            hint: '3',
                          ),
                          const SizedBox(height: 10),
                          _moneyField(
                            controller: _extraKm,
                            label: 'Costo adicional por km',
                            hint: '0.50',
                          ),
                        ],
                      ),
                    ),
                  if (_config.pricingType == DeliveryConfig.pricingZones) ...[
                    ..._zones.asMap().entries.map((entry) {
                      final index = entry.key;
                      final zone = entry.value;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _card(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'Zona ${index + 1}',
                                      style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                                    ),
                                  ),
                                  if (_zones.length > 1)
                                    IconButton(
                                      onPressed: () => setState(() {
                                        zone.dispose();
                                        _zones.removeAt(index);
                                      }),
                                      icon: const Icon(Icons.delete_outline_rounded),
                                    ),
                                ],
                              ),
                              _textField(controller: zone.name, label: 'Nombre', hint: 'Centro'),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: _moneyField(
                                      controller: zone.minKm,
                                      label: 'Desde km',
                                      hint: '0',
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: _moneyField(
                                      controller: zone.maxKm,
                                      label: 'Hasta km',
                                      hint: '3',
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              _moneyField(
                                controller: zone.price,
                                label: 'Precio',
                                hint: '2',
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                    OutlinedButton.icon(
                      onPressed: () => setState(() {
                        final last = _zones.isEmpty ? 0.0 : double.tryParse(_zones.last.maxKm.text) ?? 0;
                        _zones.add(
                          _ZoneControllers.fromZone(
                            DeliveryZone(
                              name: 'Zona ${_zones.length + 1}',
                              minDistance: last,
                              maxDistance: last + 5,
                              price: 0,
                            ),
                          ),
                        );
                      }),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Agregar zona'),
                    ),
                  ],
                  const SizedBox(height: 16),
                  _card(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            'Delivery gratis desde cierto monto',
                            style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                          value: _config.freeDeliveryEnabled,
                          activeThumbColor: _purple,
                          onChanged: (value) => setState(
                            () => _config = _config.copyWith(freeDeliveryEnabled: value),
                          ),
                        ),
                        if (_config.freeDeliveryEnabled)
                          _moneyField(
                            controller: _freeMinimum,
                            label: 'Pedido mayor a',
                            hint: '20',
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _card(
                    child: Column(
                      children: [
                        _moneyField(
                          controller: _minOrder,
                          label: 'Mínimo de compra para delivery',
                          hint: '5',
                          helper: '0 = aceptar cualquier monto.',
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: _moneyField(
                                controller: _prepMinutes,
                                label: 'Preparación (min)',
                                hint: '20',
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _moneyField(
                                controller: _deliveryMinutes,
                                label: 'Entrega (min)',
                                hint: '30',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _textField(
                          controller: _customMessage,
                          label: 'Mensaje al cliente',
                          hint: 'Delivery disponible de lunes a sábado',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _card(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Configuración actual',
                          style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _draft().summary(),
                          style: GoogleFonts.poppins(fontSize: 13, height: 1.45, color: const Color(0xFF374151)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _saving ? null : () => _save(_draft()),
                    style: FilledButton.styleFrom(
                      backgroundColor: _purple,
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Guardar tarifas'),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _radio(String label, String value) {
    return RadioListTile<String>(
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(label, style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
      value: value,
      groupValue: _config.pricingType,
      activeColor: _purple,
      onChanged: (next) {
        if (next == null) return;
        setState(() => _config = _config.copyWith(pricingType: next));
      },
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _moneyField({
    required TextEditingController controller,
    required String label,
    required String hint,
    String? helper,
  }) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        helperText: helper,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String label,
    required String hint,
  }) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

class _ZoneControllers {
  _ZoneControllers({
    required this.name,
    required this.minKm,
    required this.maxKm,
    required this.price,
  });

  factory _ZoneControllers.fromZone(DeliveryZone zone) {
    String num(double value) =>
        value == value.roundToDouble() ? '${value.round()}' : '$value';
    return _ZoneControllers(
      name: TextEditingController(text: zone.name),
      minKm: TextEditingController(text: num(zone.minDistance)),
      maxKm: TextEditingController(text: num(zone.maxDistance)),
      price: TextEditingController(text: num(zone.price)),
    );
  }

  final TextEditingController name;
  final TextEditingController minKm;
  final TextEditingController maxKm;
  final TextEditingController price;

  DeliveryZone toZone() {
    return DeliveryZone(
      name: name.text.trim().isEmpty ? 'Zona' : name.text.trim(),
      minDistance: double.tryParse(minKm.text.replaceAll(',', '.')) ?? 0,
      maxDistance: double.tryParse(maxKm.text.replaceAll(',', '.')) ?? 0,
      price: double.tryParse(price.text.replaceAll(',', '.')) ?? 0,
    );
  }

  void dispose() {
    name.dispose();
    minKm.dispose();
    maxKm.dispose();
    price.dispose();
  }
}
