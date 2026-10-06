import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/kiosk_home_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class KioskHomeSettingsScreen extends StatefulWidget {
  const KioskHomeSettingsScreen({super.key});

  @override
  State<KioskHomeSettingsScreen> createState() => _KioskHomeSettingsScreenState();
}

class _KioskHomeSettingsScreenState extends State<KioskHomeSettingsScreen> {
  static const _purple = Color(0xFF6D28D9);

  bool _loading = true;
  bool _saving = false;
  bool _permiteDelivery = true;
  Map<String, dynamic> _branding = const {};
  Map<String, dynamic> _configNegocio = const {};
  KioskHomeConfig _config = const KioskHomeConfig();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('permite_delivery, branding_ia')
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
        _permiteDelivery = row?['permite_delivery'] == true;
        _branding = branding;
        _configNegocio = configNegocio;
        _config = KioskHomeConfig.fromConfigNegocio(configNegocio);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cargar la pantalla de inicio: $error')),
      );
    }
  }

  Future<void> _save(KioskHomeConfig next) async {
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
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar: $error')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _preview {
    final actions = <String>[
      if (_config.verMenu) 'Ver menú',
      if (_config.catalogo) 'Catálogo',
      if (_config.comerAqui) 'Comer aquí',
      if (_config.paraLlevar) 'Para llevar',
      if (_config.delivery) 'Delivery',
    ];
    if (_config.verMetodosPago) actions.add('Métodos de pago');
    if (actions.isEmpty) return 'El cliente verá Ver menú para consultar productos.';
    return 'El cliente verá: ${actions.join(', ')}.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text(
          'Pantalla de inicio',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Text(
                  'Elige qué ve el cliente al abrir tu menú. Los restaurantes actuales no cambian hasta que guardes aquí.',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: const Color(0xFF6B7280),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Formas de pedir',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                const SizedBox(height: 8),
                _switchCard(
                  title: 'Ver menú',
                  subtitle: 'Solo consulta productos, sin pedidos. También aparece si el negocio está cerrado.',
                  value: _config.verMenu,
                  onChanged: (value) => _save(_config.copyWith(verMenu: value)),
                ),
                _switchCard(
                  title: 'Catálogo',
                  subtitle: 'El cliente ve los productos, los suma y mira el total y los métodos de pago.',
                  value: _config.catalogo,
                  onChanged: (value) => _save(_config.copyWith(catalogo: value)),
                ),
                _switchCard(
                  title: 'Comer aquí',
                  subtitle: 'Pedido para mesa',
                  value: _config.comerAqui,
                  onChanged: (value) => _save(_config.copyWith(comerAqui: value)),
                ),
                _switchCard(
                  title: 'Para llevar',
                  subtitle: 'El cliente retira en el local',
                  value: _config.paraLlevar,
                  onChanged: (value) => _save(_config.copyWith(paraLlevar: value)),
                ),
                _switchCard(
                  title: 'Delivery',
                  subtitle: _permiteDelivery
                      ? 'Envío a domicilio'
                      : 'Actívalo también en Operación y WhatsApp para recibirlo.',
                  value: _config.delivery,
                  onChanged: (value) => _save(_config.copyWith(delivery: value)),
                ),
                const SizedBox(height: 18),
                Text(
                  'Información en el inicio',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                const SizedBox(height: 8),
                _switchCard(
                  title: 'Calificación',
                  subtitle: 'Promedio y cantidad de opiniones',
                  value: _config.calificacion,
                  onChanged: (value) => _save(_config.copyWith(calificacion: value)),
                ),
                _switchCard(
                  title: 'Ubicación',
                  subtitle: 'Dirección del local',
                  value: _config.ubicacion,
                  onChanged: (value) => _save(_config.copyWith(ubicacion: value)),
                ),
                _switchCard(
                  title: 'Redes sociales',
                  subtitle: 'Instagram, Facebook, YouTube o TikTok',
                  value: _config.redes,
                  onChanged: (value) => _save(_config.copyWith(redes: value)),
                ),
                _switchCard(
                  title: 'Ver métodos de pago',
                  subtitle: 'Se muestran en la pantalla de inicio. Desactivado, el inicio queda igual.',
                  value: _config.verMetodosPago,
                  onChanged: (value) => _save(_config.copyWith(verMetodosPago: value)),
                ),
                const SizedBox(height: 12),
                _card(
                  child: Text(
                    _preview,
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF374151),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _switchCard({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _card(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: GoogleFonts.poppins(
                      fontSize: 12.5,
                      color: const Color(0xFF6B7280),
                    ),
                  ),
                ],
              ),
            ),
            Switch.adaptive(
              value: value,
              activeThumbColor: _purple,
              onChanged: _saving ? null : onChanged,
            ),
          ],
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
