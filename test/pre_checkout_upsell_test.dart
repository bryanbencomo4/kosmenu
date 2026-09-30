import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/pre_checkout_upsell.dart';

void main() {
  group('PreCheckoutUpsellConfig', () {
    test('restaurantes actuales sin config quedan desactivados', () {
      expect(PreCheckoutUpsellConfig.fromUpsellConfig(null).activo, isFalse);
      expect(PreCheckoutUpsellConfig.fromUpsellConfig({'upselling': false}).activo, isFalse);
    });

    test('lee pre_checkout del JSONB sin borrar otras claves al guardar', () {
      final existing = {
        'legacy_flag': true,
        'pre_checkout': {
          'activo': true,
          'tipos': ['bebida', 'postre'],
          'max_productos': 4,
          'reglas': [
            {
              'categoria_id': 'cat-pizzas',
              'categoria_origen': 'Pizzas',
              'sugerir_tipos': ['bebida', 'postre'],
            },
          ],
        },
      };
      final config = PreCheckoutUpsellConfig.fromUpsellConfig(existing);
      expect(config.activo, isTrue);
      expect(config.tipos, ['bebida', 'postre']);
      expect(config.reglas.single.categoriaOrigen, 'Pizzas');

      final merged = config.copyWith(activo: false).mergeIntoUpsellConfig(existing);
      expect(merged['legacy_flag'], isTrue);
      expect(merged['pre_checkout']['activo'], isFalse);
      expect(merged['upselling'], isFalse);
    });

    test('mapea tipo de categoría por rol, no por nombre', () {
      expect(PreCheckoutUpsellConfig.kindFromRol('drink'), 'bebida');
      expect(PreCheckoutUpsellConfig.kindFromRol('dessert'), 'postre');
      expect(PreCheckoutUpsellConfig.kindFromRol('side'), 'acompanamiento');
      expect(PreCheckoutUpsellConfig.rolFromKind('bebida'), 'drink');
      expect(CategoryModel.upsellKindLabel(null), 'Normal');
      expect(CategoryModel.upsellKindLabel('drink'), 'Bebidas');
    });
  });
}
