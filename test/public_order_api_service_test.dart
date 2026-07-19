import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kosmenu_app/services/public_order_api_service.dart';

PublicOrderCreateRequest _sampleRequest() {
  return const PublicOrderCreateRequest(
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
  );
}

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
      expect(json.keys, isNot(contains('owner_id')));
      expect(json.keys, isNot(contains('service_role')));
      expect(json['clientName'], 'Ana');
      expect(json['items'], isA<List<dynamic>>());
      expect(json['paymentProofUrl'], startsWith('storage://comprobantes/'));
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
    test('accepts jpeg png webp pdf under 5MB', () {
      for (final entry in <(String, String)>[
        ('a.jpg', 'image/jpeg'),
        ('a.png', 'image/png'),
        ('a.webp', 'image/webp'),
        ('a.pdf', 'application/pdf'),
      ]) {
        expect(
          ComprobanteClientValidator.validate(
            fileName: entry.$1,
            mimeType: entry.$2,
            sizeBytes: 1024,
          ),
          isNull,
          reason: entry.$2,
        );
      }
    });

    test('rejects svg html and oversized files', () {
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
      expect(
        ComprobanteClientValidator.validate(
          fileName: 'big.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: kComprobanteMaxBytes + 1,
        ),
        isNotNull,
      );
    });
  });

  group('PublicOrderApiService.createOrder', () {
    test('sends idempotency header and uses server trackingUrl', () async {
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
              'trackingUrl':
                  'https://preview.example/v/demo/orders/ORD-1?t=abc123',
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
        request: _sampleRequest(),
      );

      expect(seenKey, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
      expect(seenBody!['comercioId'], 'c1');
      expect(result.orderId, 'ORD-1');
      expect(
        result.trackingUrl,
        'https://preview.example/v/demo/orders/ORD-1?t=abc123',
      );
      expect(result.estado, 'pendiente');
    });

    test('maps status codes to user-safe exceptions', () async {
      Future<void> expectStatus(int status) async {
        final client = MockClient(
          (_) async => http.Response('{"error":"x"}', status),
        );
        final service = PublicOrderApiService(client: client);
        try {
          await service.createOrder(
            idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            request: _sampleRequest(),
          );
          fail('expected exception for $status');
        } on PublicOrderApiException catch (error) {
          expect(error.statusCode, status);
          expect(error.message.toLowerCase(), isNot(contains('eyj')));
          expect(error.message.toLowerCase(), isNot(contains('token')));
          expect(error.message.toLowerCase(), isNot(contains('0414')));
          if (status == 429 || status >= 500) {
            expect(error.retryable, isTrue);
          }
        }
      }

      await expectStatus(400);
      await expectStatus(409);
      await expectStatus(422);
      await expectStatus(429);
      await expectStatus(500);
    });

    test('timeout is retryable and does not leak request body', () async {
      final client = MockClient((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 80));
        return http.Response('{}', 200);
      });
      final service = PublicOrderApiService(
        client: client,
        timeout: const Duration(milliseconds: 10),
      );
      try {
        await service.createOrder(
          idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          request: _sampleRequest(),
        );
        fail('expected timeout');
      } on PublicOrderApiException catch (error) {
        expect(error.retryable, isTrue);
        expect(error.message.toLowerCase(), isNot(contains('ana perez')));
        expect(error.message.toLowerCase(), isNot(contains('0414')));
      }
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

    test('accepts storage:// response and rejects public http urls', () async {
      final okClient = MockClient((request) async {
        expect(request.url.path, contains('/api/orders/comprobantes'));
        expect(request.method, 'POST');
        return http.Response(
          jsonEncode({
            'ok': true,
            'data': {
              'storageRef': 'storage://comprobantes/c1/file.jpg',
              'paymentProofUrl': 'storage://comprobantes/c1/file.jpg',
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });
      final ok = await PublicOrderApiService(client: okClient).uploadComprobante(
        comercioId: 'c1',
        fileName: 'file.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List.fromList(<int>[1, 2, 3]),
      );
      expect(ok.storageRef, startsWith('storage://comprobantes/'));

      final badClient = MockClient(
        (_) async => http.Response(
          jsonEncode({
            'ok': true,
            'data': {
              'storageRef': 'https://public.example/comprobantes/file.jpg',
            },
          }),
          201,
          headers: {'content-type': 'application/json'},
        ),
      );
      expect(
        () => PublicOrderApiService(client: badClient).uploadComprobante(
          comercioId: 'c1',
          fileName: 'file.jpg',
          mimeType: 'image/jpeg',
          bytes: Uint8List.fromList(<int>[1, 2, 3]),
        ),
        throwsA(isA<PublicOrderApiException>()),
      );
    });
  });

  group('fetchComprobanteSignedUrl', () {
    test('requires session token', () async {
      final service = PublicOrderApiService(
        client: MockClient((_) async => http.Response('{}', 200)),
      );
      expect(
        () => service.fetchComprobanteSignedUrl(orderId: 'ORD-1', accessToken: ''),
        throwsA(
          isA<PublicOrderApiException>().having(
            (e) => e.statusCode,
            'statusCode',
            401,
          ),
        ),
      );
    });

    test('sends bearer and returns expiresInSec without logging secrets', () async {
      String? auth;
      final client = MockClient((request) async {
        auth = request.headers['authorization'];
        expect(request.url.path, contains('/api/business/orders/'));
        return http.Response(
          jsonEncode({
            'ok': true,
            'data': {
              'url': 'https://signed.example/tmp',
              'expiresInSec': 300,
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final result = await PublicOrderApiService(client: client)
          .fetchComprobanteSignedUrl(
            orderId: 'ORD-1',
            accessToken: 'session-token',
          );
      expect(auth, 'Bearer session-token');
      expect(result.expiresInSec, 300);
      expect(result.url, 'https://signed.example/tmp');
    });

    test('foreign ownership is generic 404/403', () async {
      final client = MockClient(
        (_) async => http.Response('{"error":"No disponible."}', 404),
      );
      try {
        await PublicOrderApiService(client: client).fetchComprobanteSignedUrl(
          orderId: 'ORD-B',
          accessToken: 'token-a',
        );
        fail('expected exception');
      } on PublicOrderApiException catch (error) {
        expect(error.message, 'Comprobante no disponible.');
        expect(error.message.toLowerCase(), isNot(contains('owner')));
        expect(error.message.toLowerCase(), isNot(contains('token-a')));
      }
    });
  });
}
