import 'package:kosmenu_app/services/google_places_rest_parser.dart';

Future<List<PlaceSuggestion>> lookupPlaceAutocompleteImpl({
  required String query,
  double? nearLatitude,
  double? nearLongitude,
  int radiusMeters = 30000,
}) async {
  throw const GooglePlacesLookupException(
    'Place lookup is not supported on this platform.',
    status: 'UNSUPPORTED',
  );
}

Future<Map<String, dynamic>?> lookupPlaceDetailsImpl(String placeId) async {
  throw const GooglePlacesLookupException(
    'Place lookup is not supported on this platform.',
    status: 'UNSUPPORTED',
  );
}

Future<String?> lookupReverseGeocodeImpl({
  required double latitude,
  required double longitude,
}) async {
  throw const GooglePlacesLookupException(
    'Place lookup is not supported on this platform.',
    status: 'UNSUPPORTED',
  );
}
