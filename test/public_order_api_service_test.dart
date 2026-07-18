import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kosmenu_app/services/public_order_api_service.dart';

void main() {
  group('PublicOrderCreateRequest', () {
    test('serializes only allowed DTO fields', () {
      final json = const PublicOrderCreateRequest(
        comercioId: 'comercio-1',
        clientName: 'Ana',
        clientWhatsapp: '04141234567',
        currency: 'USD',
        exchangeRate: 40,
        costoDelivery: 0,
        items: <PublicOrderItemDto>[
          PublicOrderItemDto(
            productId: 'p1',
            nombre: 'Arepa',
            cantidad: 2,
            precio: 3.5,
          ),
        ],
        delivery: PublicOrderDeliveryDto(mode: 'pickup'),
        paymentMethod: PublicOrderPaymentMethodDto(nombre: 'Pago Movil'),
        paymentProofUrl: 'storage://comprobantes/comercio-1/file.jpg',
        orderNotes: 'Sin cebolla',
      ).toJson();

      expect(json.keys, isNot(contains('estado')));
      expect(json.keys, isNot(contains('trackingUrl')));
      expect(json.keys, isNot(contains('public_tracking_token')));
      expect(json.keys, isNot(contains('html')));
      expect(json['clientName'], 'Ana');
      expect(json['items'], isA<List<dynamic>>());
      expect(json['paymentProofUrl'], startsWith('storage://'));
    });
  });

  group('idempotency key', () {
    test('generates uuid-like keys without relying on timestamp only', () {
      final a = generateCheckoutIdempotencyKey();
      final b = generateCheckoutIdempotencyKey();
      expect(a, isNot(equals(b)));
      expect(a.length, greaterThanOrEqualTo(32));
      expect(RegExp(r'^[0-9a-f-]{36}$').hasMatch(a), isTrue);
    });
  });

  group('ComprobanteClientValidator', () {
    test('rejects dangerous types', () {
      expect(
        ComprobanteClientValidator.validate(
          fileName: 'x.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 100,
        ),
        isNotNull,
      );
      expect(
        ComprobanteClientValidator.validate(
          fileName: 'x.html',
          mimeType: 'text/html',
          sizeBytes: 100,
        ),
        isNotNull,
      );
    });

    test('accepts jpeg under 5MB', () {
      expect(
        ComprobanteClientValidator.validate(
          fileName: 'proof.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        ),
        isNull,
      );
    });
  });

  group('PublicOrderApiService.createOrder', () {
    test('sends idempotency header and parses response', () async {
      String? seenKey;
      Map<String, dynamic>? seenBody;

      final client = MockClient((request) async {
        seenKey = request.headers['x-idempotency-key'];
        seenBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'ok': true,
            'data': {
              'orderId': 'ORD-1',
              'trackingUrl': 'https://elmenuxfa.com/orders/ORD-1?t=abc',
              'estado': 'pendiente',
              'confirmation': 'Pedido confirmado',
              'total': 7,
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final service = PublicOrderApiService(client: client);
      final result = await service.createOrder(
        idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        request: const PublicOrderCreateRequest(
          comercioId: 'c1',
          clientName: 'Ana Perez',
          clientWhatsapp: '04141234567',
          currency: 'USD',
          exchangeRate: 1,
          costoDelivery: 0,
          items: <PublicOrderItemDto>[
            PublicOrderItemDto(
              productId: 'p1',
              nombre: 'Item',
              cantidad: 1,
              precio: 7,
            ),
          ],
          delivery: PublicOrderDeliveryDto(mode: 'pickup'),
        ),
      );

      expect(seenKey, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
      expect(seenBody!['comercioId'], 'c1');
      expect(result.orderId, 'ORD-1');
      expect(result.trackingUrl, contains('?t='));
      expect(result.estado, 'pendiente');
    });

    test('maps 409 conflict', () async {
      final client = MockClient(
        (_) async => http.Response('{"error":"conflict"}', 409),
      );
      final service = PublicOrderApiService(client: client);
      expect(
        () => service.createOrder(
          idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          request: const PublicOrderCreateRequest(
            comercioId: 'c1',
            clientName: 'Ana Perez',
            clientWhatsapp: '04141234567',
            currency: 'USD',
            exchangeRate: 1,
            costoDelivery: 0,
            items: <PublicOrderItemDto>[
              PublicOrderItemDto(
                productId: 'p1',
                nombre: 'Item',
                cantidad: 1,
                precio: 1,
              ),
            ],
            delivery: PublicOrderDeliveryDto(mode: 'pickup'),
          ),
        ),
        throwsA(
          isA<PublicOrderApiException>().having(
            (e) => e.statusCode,
            'statusCode',
            409,
          ),
        ),
      );
    });
  });

  group('uploadComprobante', () {
    test('rejects before network on bad mime', () async {
      final service = PublicOrderApiService(
        client: MockClient((_) async => http.Response('nope', 500)),
      );
      expect(
        () => service.uploadComprobante(
          comercioId: 'c1',
          fileName: 'x.svg',
          mimeType: 'image/svg+xml',
          bytes: Uint8List.fromList(<int>[1, 2, 3]),
        ),
        throwsA(isA<PublicOrderApiException>()),
      );
    });
  });
}
