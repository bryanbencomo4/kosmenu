import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/delivery_config.dart';

void main() {
  test('missing config stays disabled', () {
    final config = DeliveryConfig.fromConfigNegocio(null);
    expect(config.enabled, isFalse);
    expect(config.pricingType, DeliveryConfig.pricingFixed);
  });

  test('parses nested delivery_config without breaking existing negocio json', () {
    final config = DeliveryConfig.fromConfigNegocio({
      'inicio_menu': {'ver_menu': true},
      'delivery_config': {
        'enabled': true,
        'pricing_type': 'distance',
        'distance_config': {
          'base_price': 2,
          'included_km': 3,
          'extra_price_per_km': 0.5,
        },
      },
    });
    expect(config.enabled, isTrue);
    expect(config.pricingType, DeliveryConfig.pricingDistance);
    expect(config.distance.basePrice, 2);
    expect(config.currency, isEmpty);
    final merged = config.mergeIntoConfigNegocio({
      'inicio_menu': {'ver_menu': true},
    });
    expect(merged['inicio_menu']['ver_menu'], isTrue);
    expect(merged['delivery_config']['enabled'], isTrue);
  });

  test('rejects overlapping inverted zone ranges', () {
    final config = DeliveryConfig(
      enabled: true,
      pricingType: DeliveryConfig.pricingZones,
      zones: const [
        DeliveryZone(name: 'Bad', minDistance: 8, maxDistance: 3, price: 4),
      ],
    );
    expect(config.validate(), isNotEmpty);
  });

  test('persists tariff currency so checkout can convert', () {
    final config = DeliveryConfig.fromConfigNegocio({
      'delivery_config': {
        'enabled': true,
        'pricing_type': 'distance',
        'currency': 'cop',
        'distance_config': {
          'base_price': 5000,
          'included_km': 3,
          'extra_price_per_km': 1000,
        },
      },
    });
    expect(config.currency, 'COP');
    expect(config.distance.basePrice, 5000);
    expect(config.toJson()['currency'], 'COP');
    expect(config.summary(), contains('COP'));
  });
}
