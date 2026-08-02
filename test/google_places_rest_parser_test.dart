import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/google_places_rest_parser.dart';

void main() {
  group('parsePlaceAutocompleteResponse', () {
    test('OK con predicciones -> lista limitada', () {
      final suggestions = parsePlaceAutocompleteResponse(
        <String, dynamic>{
          'status': 'OK',
          'predictions': <Map<String, dynamic>>[
            <String, dynamic>{
              'place_id': 'p1',
              'description': 'Patiecitos, San Cristobal',
            },
            <String, dynamic>{
              'place_id': 'p2',
              'description': 'Patiecitos Cafe',
            },
            <String, dynamic>{'place_id': 'p3', 'description': ''},
            <String, dynamic>{'description': 'sin id'},
          ],
        },
        limit: 6,
      );

      expect(suggestions, hasLength(2));
      expect(suggestions.first.placeId, 'p1');
      expect(suggestions.first.description, 'Patiecitos, San Cristobal');
    });

    test('ZERO_RESULTS -> lista vacia', () {
      final suggestions = parsePlaceAutocompleteResponse(
        <String, dynamic>{'status': 'ZERO_RESULTS', 'predictions': <dynamic>[]},
      );
      expect(suggestions, isEmpty);
    });

    test('REQUEST_DENIED -> excepcion tipada', () {
      expect(
        () => parsePlaceAutocompleteResponse(
          <String, dynamic>{
            'status': 'REQUEST_DENIED',
            'error_message': 'API key invalid',
          },
        ),
        throwsA(
          isA<GooglePlacesLookupException>().having(
            (error) => error.status,
            'status',
            'REQUEST_DENIED',
          ),
        ),
      );
    });
  });

  group('parsePlaceDetailsResponse', () {
    test('OK -> result map', () {
      final result = parsePlaceDetailsResponse(
        <String, dynamic>{
          'status': 'OK',
          'result': <String, dynamic>{
            'formatted_address': 'Calle 1',
            'geometry': <String, dynamic>{
              'location': <String, dynamic>{'lat': 1.5, 'lng': -2.5},
            },
          },
        },
      );
      expect(result['formatted_address'], 'Calle 1');
    });

    test('status no OK -> excepcion', () {
      expect(
        () => parsePlaceDetailsResponse(
          <String, dynamic>{'status': 'NOT_FOUND'},
        ),
        throwsA(isA<GooglePlacesLookupException>()),
      );
    });
  });

  group('parseGeocodeResponse / formatSpecificAddress', () {
    test('elige street_address y formatea', () {
      final address = parseGeocodeResponse(
        <String, dynamic>{
          'status': 'OK',
          'results': <Map<String, dynamic>>[
            <String, dynamic>{
              'types': <String>['plus_code'],
              'formatted_address': 'Plus code alone',
              'address_components': <Map<String, dynamic>>[],
            },
            <String, dynamic>{
              'types': <String>['street_address'],
              'formatted_address': 'Full formatted',
              'address_components': <Map<String, dynamic>>[
                <String, dynamic>{
                  'long_name': 'Principal',
                  'types': <String>['route'],
                },
                <String, dynamic>{
                  'long_name': '12',
                  'types': <String>['street_number'],
                },
                <String, dynamic>{
                  'long_name': 'San Cristobal',
                  'types': <String>['locality'],
                },
                <String, dynamic>{
                  'long_name': 'Tachira',
                  'types': <String>['administrative_area_level_1'],
                },
              ],
            },
          ],
        },
      );

      expect(address, 'Principal 12, San Cristobal, Tachira');
    });

    test('ZERO_RESULTS -> null', () {
      expect(
        parseGeocodeResponse(
          <String, dynamic>{'status': 'ZERO_RESULTS', 'results': <dynamic>[]},
        ),
        isNull,
      );
    });
  });
}
