import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/onboarding_menu_preview_builder.dart';

void main() {
  group('OnboardingMenuPreviewBuilder', () {
    test('builds payload without published slug and with empty catalog', () {
      final payload = OnboardingMenuPreviewBuilder.build(
        comercioId: '',
        businessName: 'Napoles Pizza',
        logoUrl: 'https://example.com/logo.png',
        category: 'Pizzeria',
        whatsapp: '+584140821633',
        allowsDelivery: true,
        address: 'Av. Principal',
        latitude: 10.1,
        longitude: -66.9,
        menuPaletteId: 'custom',
        palettePrimaryArgb: 0xFFAA0000,
        paletteAccentArgb: 0xFF00AA00,
        paletteSurfaceArgb: 0xFF0000AA,
        paletteTextArgb: 0xFFFFFFFF,
        exchangeRateValue: 36.5,
        categories: const <Map<String, dynamic>>[],
        products: const <Map<String, dynamic>>[],
      );

      final comercio = Map<String, dynamic>.from(payload['comercio'] as Map);
      expect(comercio['id'], 'preview');
      expect(comercio['nombre'], 'Napoles Pizza');
      expect(comercio['logo_url'], 'https://example.com/logo.png');
      expect(comercio['permite_delivery'], isTrue);
      expect(comercio['whatsapp'], '+584140821633');
      expect(comercio['exchange_rate_value'], 36.5);
      expect(payload['categorias'], isEmpty);
      expect(payload['productos'], isEmpty);
    });

    test('keeps real categories and products for multi-category preview', () {
      final payload = OnboardingMenuPreviewBuilder.build(
        comercioId: 'commerce-1',
        businessName: 'Napoles Pizza',
        logoUrl: null,
        category: 'Pizzeria',
        whatsapp: null,
        allowsDelivery: false,
        address: '',
        latitude: null,
        longitude: null,
        menuPaletteId: 'uva',
        palettePrimaryArgb: null,
        paletteAccentArgb: null,
        paletteSurfaceArgb: null,
        paletteTextArgb: null,
        exchangeRateValue: 0,
        categories: const <Map<String, dynamic>>[
          {'id': 'c1', 'nombre': 'Pizzas'},
          {'id': 'c2', 'nombre': 'Bebidas'},
        ],
        products: const <Map<String, dynamic>>[
          {
            'id': 'p1',
            'categoria_id': 'c1',
            'nombre': 'Margarita',
            'precio': 8.5,
            'imagen_url': null,
          },
          {
            'id': 'p2',
            'categoria_id': 'c2',
            'nombre': 'Cola',
            'precio': 2,
            'imagen_url': 'https://example.com/cola.png',
          },
        ],
      );

      expect(payload['comercio'], isA<Map>());
      expect((payload['comercio'] as Map)['id'], 'commerce-1');
      expect((payload['categorias'] as List).length, 2);
      expect((payload['productos'] as List).length, 2);
      expect((payload['productos'] as List).first['imagen_url'], isNull);
    });
  });
}
