import 'package:kosmenu_app/services/google_places_lookup_stub.dart'
    if (dart.library.html) 'package:kosmenu_app/services/google_places_lookup_web.dart'
    if (dart.library.io) 'package:kosmenu_app/services/google_places_lookup_io.dart';
import 'package:kosmenu_app/services/google_places_rest_parser.dart';

export 'package:kosmenu_app/services/google_places_rest_parser.dart';

/// Cross-platform Google Places / Geocoding lookup.
///
/// - Web: JavaScript Places/Geocoder bridge (`window.__elmenuxfaPlaces`)
/// - IO: Places REST API via `package:http`
class GooglePlacesLookup {
  const GooglePlacesLookup._();

  static Future<List<PlaceSuggestion>> autocomplete({
    required String query,
    double? nearLatitude,
    double? nearLongitude,
    int radiusMeters = 30000,
  }) {
    return lookupPlaceAutocompleteImpl(
      query: query,
      nearLatitude: nearLatitude,
      nearLongitude: nearLongitude,
      radiusMeters: radiusMeters,
    );
  }

  static Future<Map<String, dynamic>?> details(String placeId) {
    return lookupPlaceDetailsImpl(placeId);
  }

  static Future<String?> reverseGeocode({
    required double latitude,
    required double longitude,
  }) {
    return lookupReverseGeocodeImpl(
      latitude: latitude,
      longitude: longitude,
    );
  }
}
