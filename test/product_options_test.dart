import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/models/product_option_group.dart';

const _tamano = ProductOptionGroup(
  id: 'g_tamano',
  nombre: 'Tamaño',
  obligatorio: true,
  min: 1,
  opciones: [
    ProductOptionChoice(id: 'o_peq', nombre: 'Pequeña', precio: 12000),
    ProductOptionChoice(id: 'o_gra', nombre: 'Grande', precio: 22000),
  ],
);

void main() {
  group('ProductOptionGroup', () {
    test('product without opciones_menu is a simple product', () {
      final product = ProductModel.fromMap({'id': 'p1', 'precio': 5000});
      expect(product.opcionesMenu, isNull);
      expect(product.optionGroups, isEmpty);
      expect(product.hasOptionsEnabled, isFalse);
    });

    test('groups only count as enabled with activadas: true', () {
      final grupos = [_tamano.toMap()];
      expect(
        ProductModel.fromMap({
          'id': 'p1',
          'opciones_menu': {'grupos': grupos},
        }).hasOptionsEnabled,
        isFalse,
      );
      expect(
        ProductModel.fromMap({
          'id': 'p1',
          'opciones_menu': {'activadas': false, 'grupos': grupos},
        }).hasOptionsEnabled,
        isFalse,
      );
      final enabled = ProductModel.fromMap({
        'id': 'p1',
        'opciones_menu': {'activadas': true, 'grupos': grupos},
      });
      expect(enabled.hasOptionsEnabled, isTrue);
      expect(enabled.optionGroups.single.opciones.last.precio, 22000);
    });

    test('parses groups, keeps inactive options, drops invalid ones', () {
      final groups = ProductOptionGroup.listFromMenuOptions({
        'grupos': [
          {
            'id': 'g_extras',
            'nombre': 'Extras',
            'tipo': 'multiple',
            'max': 9,
            'opciones': [
              {'id': 'o_queso', 'nombre': 'Extra queso', 'precio': 1000},
              {'id': 'o_off', 'nombre': 'Aguacate', 'precio': 1, 'activo': false},
              {'id': 'bad id', 'nombre': 'X'},
              {'id': 'o_queso', 'nombre': 'Duplicado'},
            ],
          },
          {'id': 'g_empty_name', 'nombre': ''},
        ],
      });
      expect(groups, hasLength(1));
      final extras = groups.single;
      expect(extras.isSingle, isFalse);
      expect(extras.opciones.map((o) => o.id), ['o_queso', 'o_off']);
      expect(extras.opciones.last.activo, isFalse);
      expect(extras.max, 2);
      expect(extras.min, 0);
    });

    test('normalizes single-choice and required rules like the public menu', () {
      final group = _tamano.copyWith(min: 0, max: 3).normalized();
      expect(group.max, 1);
      expect(group.min, 1);
      expect(group.toMap()['tipo'], 'unica');
    });

    test('merge writes activadas + grupos and keeps legacy keys', () {
      final current = <String, dynamic>{
        'tamanos': [
          {'id': 'g', 'label': 'Grande', 'precio': 12},
        ],
      };
      final on = ProductOptionGroup.mergeIntoMenuOptions(current, const [
        _tamano,
      ], enabled: true);
      expect(on!['tamanos'], current['tamanos']);
      expect(on['activadas'], isTrue);
      expect((on['grupos'] as List).single['id'], 'g_tamano');

      final off = ProductOptionGroup.mergeIntoMenuOptions(on, const [
        _tamano,
      ], enabled: false);
      expect(off!['activadas'], isFalse);
      expect(off['grupos'], isNotEmpty);

      final cleared = ProductOptionGroup.mergeIntoMenuOptions(
        on,
        const [],
        enabled: true,
      );
      expect(cleared!.containsKey('grupos'), isFalse);
      expect(cleared.containsKey('activadas'), isFalse);
      expect(cleared['tamanos'], current['tamanos']);

      expect(
        ProductOptionGroup.mergeIntoMenuOptions(
          {'activadas': true, 'grupos': []},
          const [],
          enabled: false,
        ),
        isNull,
      );
    });

    test('generated ids match the id pattern shared with the site', () {
      final id = generateProductOptionId('g');
      expect(RegExp(r'^g_[a-z0-9]{8}$').hasMatch(id), isTrue);
    });

    test('round-trips dependent price rules without pizza-specific fields', () {
      const extra = ProductOptionChoice(
        id: 'queso_extra',
        nombre: 'Extra queso',
        reglasPrecio: [
          ProductOptionPriceRule(grupo: 'tamano', opcion: 'normal', precio: 2000),
          ProductOptionPriceRule(grupo: 'tamano', opcion: 'grande', precio: 5000),
        ],
      );
      final encoded = extra.toMap();
      expect(encoded['precio_base'], 0);
      expect(encoded['reglas_precio'], [
        {
          'cuando': {'grupo': 'tamano', 'opcion': 'normal'},
          'precio': 2000,
        },
        {
          'cuando': {'grupo': 'tamano', 'opcion': 'grande'},
          'precio': 5000,
        },
      ]);

      final parsed = ProductOptionChoice.fromMap({
        'id': 'queso_extra',
        'nombre': 'Extra queso',
        'precio_base': 0,
        'reglas_precio': encoded['reglas_precio'],
      });
      expect(parsed!.reglasPrecio.map((rule) => rule.precio), [2000, 5000]);
      expect(parsed.reglasPrecio.first.grupo, 'tamano');
    });

    test('round-trips optional default and free-text flags', () {
      final encoded = const ProductOptionChoice(
        id: 'otro',
        nombre: 'Otro',
        predeterminada: true,
        textoLibre: true,
      ).toMap();
      expect(encoded['predeterminada'], isTrue);
      expect(encoded['texto_libre'], isTrue);
      expect(
        const ProductOptionChoice(id: 'o_nor', nombre: 'Normal').toMap().containsKey('predeterminada'),
        isFalse,
      );

      final parsed = ProductOptionChoice.fromMap(encoded);
      expect(parsed!.predeterminada, isTrue);
      expect(parsed.textoLibre, isTrue);
    });
  });

  group('PedidoItemModel modifiers', () {
    test('simple item and older orders look exactly as before', () {
      final item = PedidoItemModel.fromMap({
        'nombre': 'Hamburguesa clásica',
        'cantidad': 1,
        'precio': 5000,
        'opciones': {'tamanoId': 'g'},
      });
      expect(item.displayName, 'Hamburguesa clásica');
      expect(item.hasModifiers, isFalse);
      expect(item.modifierGroups, isEmpty);
      expect(item.toMap().containsKey('selecciones'), isFalse);
    });

    test('snapshot shows base name and grouped modifiers for the kitchen', () {
      final item = PedidoItemModel.fromMap({
        'nombre': 'Campesina · Grande · Extra queso · Tocineta',
        'cantidad': 1,
        'precio': 25000,
        'producto': 'Campesina',
        'precio_base': 0,
        'precio_final': 25000,
        'selecciones': [
          {'grupo': 'Tamaño', 'opcion': 'Grande', 'precio': 22000},
          {'grupo': 'Extras', 'opcion': 'Extra queso', 'precio': 1000},
          {'grupo': 'Extras', 'opcion': 'Tocineta', 'precio': 2000},
        ],
      });
      expect(item.displayName, 'Campesina');
      expect(item.precioBase, 0);
      expect(item.modifierGroups.map((g) => g.grupo), ['Tamaño', 'Extras']);
      expect(item.modifierGroups.map((g) => g.label), [
        'Tamaño: Grande',
        'Extras: ✓ Extra queso ✓ Tocineta',
      ]);

      final roundTrip = PedidoItemModel.fromMap(item.toMap());
      expect(roundTrip.modifierGroups.last.opciones.map((o) => o.nombre), [
        'Extra queso',
        'Tocineta',
      ]);
    });

    test('reads older snapshots that used nombre instead of opcion', () {
      final item = PedidoItemModel.fromMap({
        'nombre': 'Campesina',
        'cantidad': 1,
        'precio': 22000,
        'producto': 'Campesina',
        'selecciones': [
          {'grupo': 'Tamaño', 'nombre': 'Grande', 'precio': 22000},
        ],
      });
      expect(item.hasModifiers, isTrue);
      expect(item.modifierGroups.single.label, 'Tamaño: Grande');
    });
  });
}
