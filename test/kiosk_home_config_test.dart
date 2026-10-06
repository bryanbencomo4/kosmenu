import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/kiosk_home_config.dart';

void main() {
  group('KioskHomeConfig', () {
    test('sin config conserva el inicio actual', () {
      const defaults = KioskHomeConfig();
      expect(KioskHomeConfig.fromConfigNegocio(null).verMenu, isFalse);
      expect(KioskHomeConfig.fromConfigNegocio({}).comerAqui, isTrue);
      expect(KioskHomeConfig.fromConfigNegocio({}).paraLlevar, isTrue);
      expect(KioskHomeConfig.fromConfigNegocio({}).delivery, isTrue);
      expect(KioskHomeConfig.fromConfigNegocio({}).calificacion, isTrue);
      expect(defaults.ubicacion, isTrue);
      expect(defaults.redes, isTrue);
    });

    test('lee solo menú y calificación oculta desde JSONB', () {
      final config = KioskHomeConfig.fromConfigNegocio({
        'social_links': {'instagram': 'https://instagram.com/demo'},
        'inicio_menu': {
          'ver_menu': true,
          'comer_aqui': false,
          'para_llevar': false,
          'delivery': false,
          'calificacion': false,
        },
      });
      expect(config.verMenu, isTrue);
      expect(config.comerAqui, isFalse);
      expect(config.paraLlevar, isFalse);
      expect(config.delivery, isFalse);
      expect(config.calificacion, isFalse);
      expect(config.ubicacion, isTrue);
      expect(config.redes, isTrue);
      expect(config.catalogo, isFalse);
      expect(config.verMetodosPago, isFalse);
    });

    test('al guardar no borra otras claves de config_negocio', () {
      final existing = {
        'social_links': {'instagram': 'https://instagram.com/demo'},
        'moneda_default': 'USD',
        'kiosk_home': {'ver_menu': true},
      };
      final merged = const KioskHomeConfig(
        verMenu: true,
        comerAqui: false,
        paraLlevar: false,
        delivery: false,
        calificacion: false,
      ).mergeIntoConfigNegocio(existing);

      expect(merged['social_links']['instagram'], 'https://instagram.com/demo');
      expect(merged['moneda_default'], 'USD');
      expect(merged.containsKey('kiosk_home'), isFalse);
      expect(merged['inicio_menu']['ver_menu'], isTrue);
      expect(merged['inicio_menu']['comer_aqui'], isFalse);
      expect(merged['inicio_menu']['calificacion'], isFalse);
      expect(merged['inicio_menu']['catalogo'], isFalse);
      expect(merged['inicio_menu']['ver_metodos_pago'], isFalse);
    });
  });
}
