class KioskHomeConfig {
  final bool verMenu;
  final bool comerAqui;
  final bool paraLlevar;
  final bool delivery;
  final bool catalogo;
  final bool calificacion;
  final bool ubicacion;
  final bool redes;
  final bool verMetodosPago;

  const KioskHomeConfig({
    this.verMenu = false,
    this.comerAqui = true,
    this.paraLlevar = true,
    this.delivery = true,
    this.catalogo = false,
    this.calificacion = true,
    this.ubicacion = true,
    this.redes = true,
    this.verMetodosPago = false,
  });

  static bool _readBool(dynamic value, bool fallback) {
    if (value is bool) return value;
    if (value == 1 || value == '1' || value == 'true') return true;
    if (value == 0 || value == '0' || value == 'false') return false;
    return fallback;
  }

  static Map<String, dynamic> _asMap(dynamic raw) {
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return const {};
  }

  factory KioskHomeConfig.fromConfigNegocio(dynamic raw) {
    final root = _asMap(raw);
    final nested = _asMap(root['inicio_menu']).isNotEmpty
        ? _asMap(root['inicio_menu'])
        : _asMap(root['kiosk_home']).isNotEmpty
            ? _asMap(root['kiosk_home'])
            : root;
    final actions = _asMap(nested['acciones']);
    final display = _asMap(nested['mostrar']);
    dynamic valueFor(String snake, [String? camel]) {
      if (actions.containsKey(snake)) return actions[snake];
      if (display.containsKey(snake)) return display[snake];
      if (nested.containsKey(snake)) return nested[snake];
      if (camel != null && nested.containsKey(camel)) return nested[camel];
      return null;
    }

    return KioskHomeConfig(
      verMenu: _readBool(valueFor('ver_menu', 'verMenu'), false),
      comerAqui: _readBool(valueFor('comer_aqui', 'comerAqui'), true),
      paraLlevar: _readBool(valueFor('para_llevar', 'paraLlevar'), true),
      delivery: _readBool(valueFor('delivery'), true),
      catalogo: _readBool(valueFor('catalogo'), false),
      calificacion: _readBool(valueFor('calificacion'), true),
      ubicacion: _readBool(valueFor('ubicacion'), true),
      redes: _readBool(valueFor('redes'), true),
      verMetodosPago: _readBool(valueFor('ver_metodos_pago', 'verMetodosPago'), false),
    );
  }

  Map<String, dynamic> mergeIntoConfigNegocio(Map<String, dynamic> existing) {
    final next = Map<String, dynamic>.from(existing);
    next['inicio_menu'] = toJson();
    next.remove('kiosk_home');
    return next;
  }

  KioskHomeConfig copyWith({
    bool? verMenu,
    bool? comerAqui,
    bool? paraLlevar,
    bool? delivery,
    bool? catalogo,
    bool? calificacion,
    bool? ubicacion,
    bool? redes,
    bool? verMetodosPago,
  }) {
    return KioskHomeConfig(
      verMenu: verMenu ?? this.verMenu,
      comerAqui: comerAqui ?? this.comerAqui,
      paraLlevar: paraLlevar ?? this.paraLlevar,
      delivery: delivery ?? this.delivery,
      catalogo: catalogo ?? this.catalogo,
      calificacion: calificacion ?? this.calificacion,
      ubicacion: ubicacion ?? this.ubicacion,
      redes: redes ?? this.redes,
      verMetodosPago: verMetodosPago ?? this.verMetodosPago,
    );
  }

  Map<String, dynamic> toJson() => {
        'ver_menu': verMenu,
        'comer_aqui': comerAqui,
        'para_llevar': paraLlevar,
        'delivery': delivery,
        'catalogo': catalogo,
        'calificacion': calificacion,
        'ubicacion': ubicacion,
        'redes': redes,
        'ver_metodos_pago': verMetodosPago,
      };
}
