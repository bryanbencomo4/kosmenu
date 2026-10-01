import 'package:kosmenu_app/services/google_places_lookup_stub.dart'
    if (dart.library.html)
      'package:kosmenu_app/services/google_places_lookup_web.dart'
    if (dart.library.io)
      'package:kosmenu_app/services/google_places_lookup_io.dart'
    as lookup_platform;
import 'package:kosmenu_app/services/google_places_rest_parser.dart';

export 'package:kosmenu_app/services/google_places_rest_parser.dart';

/// Cross-platform Google Places / Geocoding lookup.
///
/// - Web: JavaScript Places/Geocoder bridge (`window.__elmenuxfaPlaces`)
/// - IO: Places REST API via `package:http`
class GooglePlacesLookup {
  const GooglePlacesLookup._();

  static Future<void>? _mapsReady;

  static Future<void> ensureReady() async {
    final future = _mapsReady ??= lookup_platform.ensureGoogleMapsLoadedImpl();
    try {
      await future;
    } catch (_) {
      _mapsReady = null;
      rethrow;
    }
  }

  static Future<List<PlaceSuggestion>> autocomplete({
    required String query,
    double? nearLatitude,
    double? nearLongitude,
    int radiusMeters = 30000,
  }) {
    return lookup_platform.lookupPlaceAutocompleteImpl(
      query: query,
      nearLatitude: nearLatitude,
      nearLongitude: nearLongitude,
      radiusMeters: radiusMeters,
    );
  }

  static Future<Map<String, dynamic>?> details(String placeId) {
    return lookup_platform.lookupPlaceDetailsImpl(placeId);
  }

  static Future<String?> reverseGeocode({
    required double latitude,
    required double longitude,
  }) {
    return lookup_platform.lookupReverseGeocodeImpl(
      latitude: latitude,
      longitude: longitude,
    );
  }
}
