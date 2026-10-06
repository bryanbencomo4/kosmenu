import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/widgets/product_options_editor.dart';
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
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  testWidgets(
    'personalization defaults off and explicit removals serialize independently',
    (tester) async {
      final key = GlobalKey<ProductOptionsEditorState>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Form(
                child: ProductOptionsEditor(
                  key: key,
                  initialGroups: const [],
                  currencyCode: 'COP',
                ),
              ),
            ),
          ),
        ),
      );
      expect(key.currentState!.personalizationChanged, isFalse);
      expect(
        key.currentState!.personalization['combinacion']['activada'],
        isFalse,
      );
      expect(
        key.currentState!.personalization['exclusiones']['activadas'],
        isFalse,
      );
      expect(find.text('Agregar ingrediente'), findsNothing);
      expect(find.text('Usar el precio más alto'), findsNothing);
      await tester.tap(find.text('Permitir quitar ingredientes'));
      await tester.pump();
      await tester.ensureVisible(find.text('Agregar ingrediente'));
      await tester.tap(find.text('Agregar ingrediente'));
      await tester.pump();
      final ingredientField = find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.labelText == 'Ingrediente removible',
      );
      await tester.enterText(ingredientField, 'Ingrediente A');
      expect(key.currentState!.personalizationChanged, isTrue);
      expect(
        key.currentState!.personalization['combinacion']['activada'],
        isFalse,
      );
      expect(
        key.currentState!.personalization['exclusiones']['activadas'],
        isTrue,
      );
      expect(
        key
            .currentState!
            .personalization['exclusiones']['ingredientes']
            .single['nombre'],
        'Ingrediente A',
      );
    },
  );

  test('compatible products are grouped by category in menu order', () {
    final groups = groupCompatibleProducts(
      products: [
        {'id': 'p3', 'nombre': 'Refresco', 'categoria_id': 'c2', 'orden': 0},
        {'id': 'p2', 'nombre': 'Tropical', 'categoria_id': 'c1', 'orden': 1},
        {'id': 'p1', 'nombre': 'Vegetariana', 'categoria_id': 'c1', 'orden': 0},
        {'id': 'p4', 'nombre': 'Suelto', 'categoria_id': null},
        {'id': 'p5', 'nombre': 'Huérfano', 'categoria_id': 'gone'},
      ],
      categories: [
        {'id': 'c2', 'nombre': 'Bebidas', 'orden': 2},
        {'id': 'c1', 'nombre': 'Pizzas', 'orden': 1},
        {'id': 'c3', 'nombre': 'Vacía', 'orden': 3},
      ],
    );
    expect(groups.map((g) => g.nombre), ['Pizzas', 'Bebidas', 'Sin categoría']);
    expect(groups.first.products.map((p) => p.nombre), [
      'Vegetariana',
      'Tropical',
    ]);
    expect(groups.last.products.map((p) => p.id), ['p5', 'p4']);
    final noCategories = groupCompatibleProducts(
      products: [
        {'id': 'p1', 'nombre': 'A'},
      ],
      categories: const [],
    );
    expect(noCategories.single.nombre, 'Productos');
  });

  testWidgets('a whole category can be selected for combinations', (
    tester,
  ) async {
    final key = GlobalKey<ProductOptionsEditorState>();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Form(
              child: ProductOptionsEditor(
                key: key,
                initialGroups: const [],
                currencyCode: 'COP',
                initialMenuOptions: const {
                  'personalizacion': {
                    'version': 1,
                    'combinacion': {
                      'activada': true,
                      'titulo': 'Combina con',
                      'productos_compatibles': ['p2'],
                      'regla_precio': 'max',
                    },
                  },
                },
                compatibleProductsLoader: () async => const [
                  CompatibleProductCategory(
                    id: 'c1',
                    nombre: 'Pizzas',
                    products: [
                      (id: 'p1', nombre: 'Vegetariana'),
                      (id: 'p2', nombre: 'Tropical'),
                    ],
                  ),
                  CompatibleProductCategory(
                    id: 'c2',
                    nombre: 'Bebidas',
                    products: [(id: 'p3', nombre: 'Refresco')],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    List<String> selected() => List<String>.from(
      key.currentState!.personalization['combinacion']['productos_compatibles']
          as List,
    )..sort();

    expect(find.text('Pizzas'), findsOneWidget);
    expect(find.text('1 de 2 seleccionados'), findsOneWidget);
    // Categories with a selection start open; the others start closed.
    expect(find.text('Tropical'), findsOneWidget);
    expect(find.text('Refresco'), findsNothing);

    final pizzaCheckbox = find.descendant(
      of: find.widgetWithText(InkWell, 'Pizzas'),
      matching: find.byType(Checkbox),
    );
    expect(tester.widget<Checkbox>(pizzaCheckbox).value, isNull);
    await tester.tap(pizzaCheckbox);
    await tester.pump();
    expect(selected(), ['p1', 'p2']);
    expect(find.text('2 de 2 seleccionados'), findsOneWidget);
    await tester.tap(pizzaCheckbox);
    await tester.pump();
    expect(selected(), isEmpty);

    await tester.tap(find.text('Bebidas'));
    await tester.pump();
    expect(find.text('Refresco'), findsOneWidget);
    await tester.tap(find.text('Refresco'));
    await tester.pump();
    expect(selected(), ['p3']);
    expect(key.currentState!.personalizationChanged, isTrue);
  });

  test('ingredientsFromDescription splits a comma list', () {
    expect(ingredientsFromDescription('Jamón, Queso, Anchoas, Maíz'), [
      'Jamón',
      'Queso',
      'Anchoas',
      'Maíz',
    ]);
    expect(
      ingredientsFromDescription(' queso cheddar ,, Maiz,  maíz , tomate. '),
      ['Queso cheddar', 'Maiz', 'Tomate'],
    );
    expect(ingredientsFromDescription(''), isEmpty);
    expect(ingredientsFromDescription(' . , ;'), isEmpty);
    expect(
      ingredientsFromDescription('a' * 100).single.length,
      removableIngredientMaxLength,
    );
  });

  group('removable ingredients from the description', () {
    Future<GlobalKey<ProductOptionsEditorState>> pumpEditor(
      WidgetTester tester,
      TextEditingController description, {
      Map<String, dynamic>? menuOptions,
    }) async {
      final key = GlobalKey<ProductOptionsEditorState>();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Form(
                child: ProductOptionsEditor(
                  key: key,
                  initialGroups: const [],
                  currencyCode: 'COP',
                  initialMenuOptions: menuOptions,
                  descriptionController: description,
                ),
              ),
            ),
          ),
        ),
      );
      return key;
    }

    List<String> names(GlobalKey<ProductOptionsEditorState> key) => [
      for (final entry
          in key.currentState!.personalization['exclusiones']['ingredientes']
              as List)
        entry['nombre'] as String,
    ];

    testWidgets('turns on by itself and follows the description', (
      tester,
    ) async {
      final description = TextEditingController(text: 'Jamón, Queso, Maíz');
      addTearDown(description.dispose);
      final key = await pumpEditor(tester, description);
      await tester.tap(find.text('Permitir quitar ingredientes'));
      await tester.pump();
      expect(names(key), ['Jamón', 'Queso', 'Maíz']);
      expect(
        key.currentState!.personalization['exclusiones']['desde_descripcion'],
        isTrue,
      );
      expect(find.widgetWithText(Chip, 'Queso'), findsOneWidget);
      expect(find.text('Agregar ingrediente'), findsNothing);
      final ids = key.currentState!.personalization['exclusiones']
          ['ingredientes'] as List;
      final quesoId = ids[1]['id'];

      description.text = 'Queso, Anchoas';
      await tester.pump();
      expect(names(key), ['Queso', 'Anchoas']);
      final updated = key.currentState!.personalization['exclusiones']
          ['ingredientes'] as List;
      expect(updated.first['id'], quesoId);

      description.text = 'Pizza artesanal';
      await tester.pump();
      expect(names(key), ['Pizza artesanal']);
      description.text = '';
      await tester.pump();
      expect(key.currentState!.personalizationError, isNotNull);
    });

    testWidgets('a plain description keeps the manual list', (tester) async {
      final description = TextEditingController(text: 'Pizza de la casa');
      addTearDown(description.dispose);
      final key = await pumpEditor(tester, description);
      await tester.tap(find.text('Permitir quitar ingredientes'));
      await tester.pump();
      expect(names(key), isEmpty);
      expect(
        key.currentState!.personalization['exclusiones'].containsKey(
          'desde_descripcion',
        ),
        isFalse,
      );
      expect(find.text('Agregar ingrediente'), findsOneWidget);
    });

    testWidgets('switching on offers undo for manual ingredients', (
      tester,
    ) async {
      final description = TextEditingController(text: 'Jamón, Queso');
      addTearDown(description.dispose);
      final key = await pumpEditor(
        tester,
        description,
        menuOptions: {
          'personalizacion': {
            'version': 1,
            'exclusiones': {
              'activadas': true,
              'titulo': '¿Quieres quitar algo?',
              'ingredientes': [
                {'id': 'r_queso', 'nombre': 'queso'},
                {'id': 'r_aceitunas', 'nombre': 'Aceitunas'},
              ],
            },
          },
        },
      );
      expect(key.currentState!.personalizationChanged, isFalse);
      await tester.ensureVisible(find.text('Tomar de la descripción'));
      await tester.tap(find.text('Tomar de la descripción'));
      await tester.pump();
      expect(names(key), ['Jamón', 'Queso']);
      final ids = key.currentState!.personalization['exclusiones']
          ['ingredientes'] as List;
      expect(ids[1]['id'], 'r_queso');
      expect(find.textContaining('Se reemplazó 1 ingrediente'), findsOneWidget);

      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.text('Deshacer'));
      await tester.pump();
      expect(names(key), ['queso', 'Aceitunas']);
      expect(
        key.currentState!.personalization['exclusiones'].containsKey(
          'desde_descripcion',
        ),
        isFalse,
      );
      expect(find.text('Agregar ingrediente'), findsOneWidget);
    });

    testWidgets('a saved product picks up description edits made elsewhere', (
      tester,
    ) async {
      final description = TextEditingController(text: 'Jamón, Piña');
      addTearDown(description.dispose);
      final key = await pumpEditor(
        tester,
        description,
        menuOptions: {
          'personalizacion': {
            'version': 1,
            'exclusiones': {
              'activadas': true,
              'titulo': '¿Quieres quitar algo?',
              'desde_descripcion': true,
              'ingredientes': [
                {'id': 'r_jamon', 'nombre': 'Jamón'},
              ],
            },
          },
        },
      );
      expect(names(key), ['Jamón', 'Piña']);
      expect(key.currentState!.personalizationChanged, isTrue);
      final ids = key.currentState!.personalization['exclusiones']
          ['ingredientes'] as List;
      expect(ids.first['id'], 'r_jamon');
    });
  });

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
              {
                'id': 'o_off',
                'nombre': 'Aguacate',
                'precio': 1,
                'activo': false,
              },
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

    test(
      'normalizes single-choice and required rules like the public menu',
      () {
        final group = _tamano.copyWith(min: 0, max: 3).normalized();
        expect(group.max, 1);
        expect(group.min, 1);
        expect(group.toMap()['tipo'], 'unica');
      },
    );

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
          ProductOptionPriceRule(
            grupo: 'tamano',
            opcion: 'normal',
            precio: 2000,
          ),
          ProductOptionPriceRule(
            grupo: 'tamano',
            opcion: 'grande',
            precio: 5000,
          ),
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
        const ProductOptionChoice(
          id: 'o_nor',
          nombre: 'Normal',
        ).toMap().containsKey('predeterminada'),
        isFalse,
      );

      final parsed = ProductOptionChoice.fromMap(encoded);
      expect(parsed!.predeterminada, isTrue);
      expect(parsed.textoLibre, isTrue);
    });

    test('question gate is opt-in, optional-only and round-trips', () {
      const choice = ProductOptionChoice(id: 'o_queso', nombre: 'Queso');
      final plain = const ProductOptionGroup(
        id: 'g_extras',
        nombre: 'Extras',
        opciones: [choice],
      ).toMap();
      expect(plain.containsKey('pregunta_activada'), isFalse);
      expect(plain.containsKey('pregunta'), isFalse);

      final gated = const ProductOptionGroup(
        id: 'g_extras',
        nombre: 'Extras',
        opciones: [choice],
        preguntaActivada: true,
        pregunta: '  ¿Quieres   agregar un extra?  ',
      ).toMap();
      expect(gated['pregunta_activada'], isTrue);
      expect(gated['pregunta'], '¿Quieres agregar un extra?');
      final parsed = ProductOptionGroup.fromMap(gated)!;
      expect(parsed.preguntaActivada, isTrue);
      expect(parsed.pregunta, '¿Quieres agregar un extra?');

      final required = ProductOptionGroup.fromMap({
        ...gated,
        'obligatorio': true,
        'min': 1,
      })!;
      expect(required.preguntaActivada, isFalse);
      expect(required.toMap().containsKey('pregunta_activada'), isFalse);

      expect(gated.containsKey('pregunta_directa'), isFalse);
      final notFreeText = ProductOptionGroup.fromMap({
        ...gated,
        'pregunta_directa': true,
      })!;
      expect(notFreeText.preguntaDirecta, isFalse);
      final direct = ProductOptionGroup.fromMap({
        ...gated,
        'pregunta_directa': true,
        'opciones': [
          const ProductOptionChoice(
            id: 'o_extra',
            nombre: 'Añadir extra',
            textoLibre: true,
          ).toMap(),
        ],
      })!;
      expect(direct.preguntaDirecta, isTrue);
      expect(direct.toMap()['pregunta_directa'], isTrue);
      final withoutQuestion = ProductOptionGroup.fromMap({
        ...gated,
        'pregunta_activada': false,
        'pregunta_directa': true,
      })!;
      expect(withoutQuestion.toMap().containsKey('pregunta_directa'), isFalse);
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

    test('combined lines read as one natural list', () {
      final item = PedidoItemModel.fromMap({
        'nombre': 'Campesina + Queso y Bocadillo',
        'cantidad': 1,
        'precio': 55587,
        'selecciones': [
          {'grupo': 'Combina con', 'opcion': 'Campesina + Queso y Bocadillo'},
          {'grupo': 'Campesina · Tamaño', 'opcion': 'Grande'},
          {'grupo': 'Campesina', 'opcion': 'Sin Maiz'},
        ],
        'personalizacion': {
          'version': 1,
          'componentes': [
            {
              'nombre': 'Campesina',
              'selecciones': [
                {'grupo': 'Tamaño', 'opcion': 'Grande', 'precio': 0},
                {'grupo': 'Ingrediente Extra', 'opcion': 'Extra de pollo'},
              ],
              'exclusiones': [
                {'id': 'r1', 'nombre': 'Maiz'},
                {'id': 'r2', 'nombre': 'Cebolla'},
              ],
            },
            {
              'nombre': 'Queso y Bocadillo',
              'selecciones': [],
              'exclusiones': [],
            },
          ],
        },
      });
      expect(item.displayName, '(Combinación) Campesina + Queso y Bocadillo');
      final group = item.modifierGroups.single;
      expect(group.bulleted, isTrue);
      expect(group.opciones.map((option) => option.nombre), [
        'Tamaño: Grande',
        'Ingrediente Extra: Extra de pollo',
        'Sin: Maiz, Cebolla',
      ]);
      final roundTrip = PedidoItemModel.fromMap(item.toMap());
      expect(roundTrip.modifierGroups.single.opciones.length, 3);

      final single = PedidoItemModel.fromMap({
        'nombre': 'Campesina',
        'cantidad': 1,
        'precio': 22000,
        'selecciones': [
          {'grupo': '', 'opcion': 'Sin Maiz'},
        ],
        'personalizacion': {
          'version': 1,
          'componentes': [
            {
              'nombre': 'Campesina',
              'exclusiones': [
                {'nombre': 'Maiz'},
              ],
            },
          ],
        },
      });
      expect(single.displayName, 'Campesina');
      expect(single.modifierGroups.single.bulleted, isFalse);
      expect(single.modifierGroups.single.opciones.single.nombre, 'Sin Maiz');
    });

    test('reads immutable category/image snapshots for an order line', () {
      final item = PedidoItemModel.fromMap({
        'product_id': 'p1',
        'nombre': 'POLLO - CARNE',
        'cantidad': 1,
        'precio': 12000,
        'categoria_nombre': 'Hamburguesas',
        'imagen_url': 'https://cdn.example.test/pollo.jpg',
      });

      expect(item.productId, 'p1');
      expect(item.categoryName, 'Hamburguesas');
      expect(item.imageUrl, 'https://cdn.example.test/pollo.jpg');
      expect(item.hasImageSnapshot, isTrue);
      expect(item.hasCategorySnapshot, isTrue);
    });

    test(
      'legacy items use catalog fallback only when snapshot keys are absent',
      () {
        final legacy = PedidoItemModel.fromMap({
          'product_id': 'p1',
          'nombre': 'POLLO - CARNE',
          'cantidad': 1,
          'precio': 12000,
        });
        final enriched = legacy.withCatalogFallback(
          imageUrl: 'https://cdn.example.test/current.jpg',
          categoryName: 'Hamburguesas',
        );
        expect(enriched.imageUrl, 'https://cdn.example.test/current.jpg');
        expect(enriched.categoryName, 'Hamburguesas');

        final snapshotWithoutImage =
            PedidoItemModel.fromMap({
              'product_id': 'p1',
              'nombre': 'POLLO - CARNE',
              'cantidad': 1,
              'precio': 12000,
              'imagen_url': null,
              'categoria_nombre': null,
            }).withCatalogFallback(
              imageUrl: 'https://cdn.example.test/changed.jpg',
              categoryName: 'Nueva categoría',
            );
        expect(snapshotWithoutImage.imageUrl, isNull);
        expect(snapshotWithoutImage.categoryName, isNull);
      },
    );
  });

  testWidgets('option groups can be folded and reordered', (tester) async {
    final key = GlobalKey<ProductOptionsEditorState>();
    ProductOptionGroup group(String id, String nombre) => ProductOptionGroup(
      id: id,
      nombre: nombre,
      opciones: [
        ProductOptionChoice(id: '${id}_o', nombre: 'Opción', precio: 0),
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Form(
              child: ProductOptionsEditor(
                key: key,
                initiallyActive: true,
                currencyCode: 'USD',
                initialGroups: [group('g_sabor', 'Sabor'), group('g_tamano', 'Tamaño')],
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Tipo'), findsNothing);
    expect(find.text('Sabor'), findsOneWidget);
    expect(find.text('Tamaño'), findsOneWidget);

    await tester.tap(find.byTooltip('Desplegar grupo').first);
    await tester.pump();
    expect(find.text('Tipo'), findsOneWidget);
    expect(find.text('Nombre del grupo'), findsOneWidget);

    await tester.tap(find.byTooltip('Plegar grupo'));
    await tester.pump();
    expect(find.text('Tipo'), findsNothing);

    List<String> names() => [
      for (final entry in key.currentState!.groups) entry.nombre,
    ];
    expect(names(), ['Sabor', 'Tamaño']);
    await tester.tap(find.byTooltip('Bajar grupo').first);
    await tester.pump();
    expect(names(), ['Tamaño', 'Sabor']);
    await tester.tap(find.byTooltip('Subir grupo').at(1));
    await tester.pump();
    expect(names(), ['Sabor', 'Tamaño']);
  });
}
