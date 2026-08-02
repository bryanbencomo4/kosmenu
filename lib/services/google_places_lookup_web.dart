import 'dart:js_interop';

import 'package:kosmenu_app/services/google_places_rest_parser.dart';

@JS('__elmenuxfaPlaces')
external JSElmenuxfaPlaces? get _elmenuxfaPlaces;

extension type JSElmenuxfaPlaces._(JSObject _) implements JSObject {
  external JSPromise<JSAny?> autocomplete(
    String input,
    JSNumber? lat,
    JSNumber? lng,
    JSNumber? radiusMeters,
  );

  external JSPromise<JSAny?> details(String placeId);

  external JSPromise<JSAny?> reverseGeocode(JSNumber lat, JSNumber lng);
}

JSNumber? _jsNumberOrNull(double? value) => value?.toJS;

Future<List<PlaceSuggestion>> lookupPlaceAutocompleteImpl({
  required String query,
  double? nearLatitude,
  double? nearLongitude,
  int radiusMeters = 30000,
}) async {
  final trimmed = query.trim();
  if (trimmed.length < 3) {
    return const <PlaceSuggestion>[];
  }

  final bridge = _elmenuxfaPlaces;
  if (bridge == null) {
    throw const GooglePlacesLookupException(
      'Google Places bridge unavailable.',
      status: 'BRIDGE_MISSING',
    );
  }

  try {
    final raw = await bridge
        .autocomplete(
          trimmed,
          _jsNumberOrNull(nearLatitude),
          _jsNumberOrNull(nearLongitude),
          radiusMeters.toJS,
        )
        .toDart;
    return _suggestionsFromJs(raw).take(6).toList();
  } on GooglePlacesLookupException {
    rethrow;
  } catch (error) {
    throw GooglePlacesLookupException(
      error.toString(),
      status: 'JS_ERROR',
    );
  }
}

Future<Map<String, dynamic>?> lookupPlaceDetailsImpl(String placeId) async {
  final trimmed = placeId.trim();
  if (trimmed.isEmpty) {
    return null;
  }

  final bridge = _elmenuxfaPlaces;
  if (bridge == null) {
    throw const GooglePlacesLookupException(
      'Google Places bridge unavailable.',
      status: 'BRIDGE_MISSING',
    );
  }

  try {
    final raw = await bridge.details(trimmed).toDart;
    final map = _jsValueToMap(raw);
    if (map == null) {
      throw const GooglePlacesLookupException(
        'Place details response missing result.',
        status: 'OK',
      );
    }
    return map;
  } on GooglePlacesLookupException {
    rethrow;
  } catch (error) {
    throw GooglePlacesLookupException(
      error.toString(),
      status: 'JS_ERROR',
    );
  }
}

Future<String?> lookupReverseGeocodeImpl({
  required double latitude,
  required double longitude,
}) async {
  final bridge = _elmenuxfaPlaces;
  if (bridge == null) {
    throw const GooglePlacesLookupException(
      'Google Places bridge unavailable.',
      status: 'BRIDGE_MISSING',
    );
  }

  try {
    final raw = await bridge
        .reverseGeocode(latitude.toJS, longitude.toJS)
        .toDart;
    final list = _jsValueToList(raw);
    return pickBestReverseGeocodeAddress(list);
  } on GooglePlacesLookupException {
    rethrow;
  } catch (error) {
    throw GooglePlacesLookupException(
      error.toString(),
      status: 'JS_ERROR',
    );
  }
}

List<PlaceSuggestion> _suggestionsFromJs(JSAny? raw) {
  final list = _jsValueToList(raw);
  return list
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .where((item) => (item['placeId'] ?? item['place_id']) != null)
      .map(
        (item) => PlaceSuggestion(
          placeId: (item['placeId'] ?? item['place_id']).toString(),
          description: item['description']?.toString().trim() ?? '',
        ),
      )
      .where((item) => item.description.isNotEmpty)
      .toList();
}

List<dynamic> _jsValueToList(JSAny? raw) {
  if (raw == null) {
    return const <dynamic>[];
  }
  final dartValue = raw.dartify();
  if (dartValue is List) {
    return dartValue
        .map((item) {
          if (item is Map) {
            return Map<String, dynamic>.from(item);
          }
          return item;
        })
        .toList();
  }
  return const <dynamic>[];
}

Map<String, dynamic>? _jsValueToMap(JSAny? raw) {
  if (raw == null) {
    return null;
  }
  final dartValue = raw.dartify();
  if (dartValue is Map) {
    return Map<String, dynamic>.from(dartValue);
  }
  return null;
}
