import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/google_places_rest_parser.dart';

Future<List<PlaceSuggestion>> lookupPlaceAutocompleteImpl({
  required String query,
  double? nearLatitude,
  double? nearLongitude,
  int radiusMeters = 30000,
}) async {
  final apiKey = SupabaseConfig.googleMapsApiKey.trim();
  final trimmed = query.trim();
  if (apiKey.isEmpty || trimmed.length < 3) {
    return const <PlaceSuggestion>[];
  }

  final params = <String, String>{
    'input': trimmed,
    'language': 'es',
    'key': apiKey,
  };
  if (nearLatitude != null && nearLongitude != null) {
    params['location'] = '$nearLatitude,$nearLongitude';
    params['radius'] = '$radiusMeters';
  }

  final uri = Uri.https(
    'maps.googleapis.com',
    '/maps/api/place/autocomplete/json',
    params,
  );
  final response = await http.get(uri);
  final decoded = jsonDecode(response.body);
  if (decoded is! Map) {
    throw const GooglePlacesLookupException(
      'Invalid autocomplete response body.',
    );
  }
  return parsePlaceAutocompleteResponse(Map<String, dynamic>.from(decoded));
}

Future<Map<String, dynamic>?> lookupPlaceDetailsImpl(String placeId) async {
  final apiKey = SupabaseConfig.googleMapsApiKey.trim();
  final trimmed = placeId.trim();
  if (apiKey.isEmpty || trimmed.isEmpty) {
    return null;
  }

  final uri = Uri.https(
    'maps.googleapis.com',
    '/maps/api/place/details/json',
    {
      'place_id': trimmed,
      'fields':
          'formatted_address,address_component,geometry/location,plus_code,types',
      'language': 'es',
      'key': apiKey,
    },
  );
  final response = await http.get(uri);
  final decoded = jsonDecode(response.body);
  if (decoded is! Map) {
    throw const GooglePlacesLookupException(
      'Invalid place details response body.',
    );
  }
  return parsePlaceDetailsResponse(Map<String, dynamic>.from(decoded));
}

Future<String?> lookupReverseGeocodeImpl({
  required double latitude,
  required double longitude,
}) async {
  final apiKey = SupabaseConfig.googleMapsApiKey.trim();
  if (apiKey.isEmpty) {
    return null;
  }

  final uri = Uri.https('maps.googleapis.com', '/maps/api/geocode/json', {
    'latlng': '$latitude,$longitude',
    'language': 'es',
    'key': apiKey,
  });
  final response = await http.get(uri);
  final decoded = jsonDecode(response.body);
  if (decoded is! Map) {
    throw const GooglePlacesLookupException(
      'Invalid geocode response body.',
    );
  }
  return parseGeocodeResponse(Map<String, dynamic>.from(decoded));
}
