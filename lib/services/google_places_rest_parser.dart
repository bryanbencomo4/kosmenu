/// Pure helpers for Google Places / Geocoding REST JSON responses.
/// Kept free of Flutter/HTTP so unit tests can run without widgets.
library;

class PlaceSuggestion {
  const PlaceSuggestion({
    required this.placeId,
    required this.description,
  });

  final String placeId;
  final String description;
}

class GooglePlacesLookupException implements Exception {
  const GooglePlacesLookupException(this.message, {this.status});

  final String message;
  final String? status;

  @override
  String toString() => 'GooglePlacesLookupException($status): $message';
}

/// Parses autocomplete JSON. Returns empty list for ZERO_RESULTS.
/// Throws [GooglePlacesLookupException] for denied/invalid statuses.
List<PlaceSuggestion> parsePlaceAutocompleteResponse(
  Map<String, dynamic> json, {
  int limit = 6,
}) {
  final status = (json['status']?.toString().trim() ?? '');
  if (status == 'ZERO_RESULTS') {
    return const <PlaceSuggestion>[];
  }
  if (status != 'OK') {
    final errorMessage = json['error_message']?.toString().trim();
    throw GooglePlacesLookupException(
      errorMessage?.isNotEmpty == true
          ? errorMessage!
          : 'Place autocomplete failed.',
      status: status.isEmpty ? null : status,
    );
  }

  final predictions = (json['predictions'] as List<dynamic>? ?? <dynamic>[])
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();

  return predictions
      .where((item) => item['place_id'] != null)
      .map(
        (item) => PlaceSuggestion(
          placeId: item['place_id'].toString(),
          description: item['description']?.toString().trim() ?? '',
        ),
      )
      .where((item) => item.description.isNotEmpty)
      .take(limit)
      .toList();
}

/// Returns the `result` map from place details JSON, or throws.
Map<String, dynamic> parsePlaceDetailsResponse(Map<String, dynamic> json) {
  final status = (json['status']?.toString().trim() ?? '');
  if (status != 'OK') {
    final errorMessage = json['error_message']?.toString().trim();
    throw GooglePlacesLookupException(
      errorMessage?.isNotEmpty == true
          ? errorMessage!
          : 'Place details failed.',
      status: status.isEmpty ? null : status,
    );
  }

  final result = json['result'];
  if (result is Map) {
    return Map<String, dynamic>.from(result);
  }
  throw const GooglePlacesLookupException(
    'Place details response missing result.',
    status: 'OK',
  );
}

String? _componentLongName(
  List<Map<String, dynamic>> components,
  String type,
) {
  for (final component in components) {
    final types = (component['types'] as List<dynamic>? ?? <dynamic>[])
        .map((item) => item.toString())
        .toList();
    if (types.contains(type)) {
      final value = component['long_name']?.toString().trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }
  }
  return null;
}

/// Builds a readable address from a geocode/place result map.
String? formatSpecificAddress(Map<String, dynamic> result) {
  final components =
      (result['address_components'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
  if (components.isEmpty) {
    return result['formatted_address']?.toString().trim();
  }

  final street = _componentLongName(components, 'route');
  final streetNumber = _componentLongName(components, 'street_number');
  final premise = _componentLongName(components, 'premise');
  final subpremise = _componentLongName(components, 'subpremise');
  final neighborhood = _componentLongName(components, 'neighborhood') ??
      _componentLongName(components, 'sublocality') ??
      _componentLongName(components, 'sublocality_level_1');
  final locality = _componentLongName(components, 'locality') ??
      _componentLongName(components, 'administrative_area_level_2');
  final region =
      _componentLongName(components, 'administrative_area_level_1');

  final plusCodeMap = result['plus_code'] is Map
      ? Map<String, dynamic>.from(result['plus_code'] as Map)
      : <String, dynamic>{};
  final plusCodeShort =
      plusCodeMap['compound_code']?.toString().trim().isNotEmpty == true
      ? plusCodeMap['compound_code'].toString().trim()
      : (plusCodeMap['global_code']?.toString().trim() ?? '');

  final firstLineParts = <String>[];
  if (street != null && street.isNotEmpty) {
    firstLineParts.add(street);
    if (streetNumber != null && streetNumber.isNotEmpty) {
      firstLineParts.add(streetNumber);
    }
  } else if (premise != null && premise.isNotEmpty) {
    firstLineParts.add(premise);
    if (subpremise != null && subpremise.isNotEmpty) {
      firstLineParts.add(subpremise);
    }
  }

  final detailParts = <String>[];
  if (neighborhood != null && neighborhood.isNotEmpty) {
    detailParts.add(neighborhood);
  }
  if (locality != null && locality.isNotEmpty) {
    detailParts.add(locality);
  }
  if (region != null && region.isNotEmpty) {
    detailParts.add(region);
  }
  if (plusCodeShort.isNotEmpty) {
    detailParts.add(plusCodeShort);
  }

  final firstLine = firstLineParts.join(' ').trim();
  final detailLine = detailParts.join(', ').trim();
  if (firstLine.isNotEmpty && detailLine.isNotEmpty) {
    return '$firstLine, $detailLine';
  }
  if (firstLine.isNotEmpty) {
    return firstLine;
  }
  if (detailLine.isNotEmpty) {
    return detailLine;
  }
  return result['formatted_address']?.toString().trim();
}

/// Picks the best reverse-geocode result and formats it.
String? pickBestReverseGeocodeAddress(List<dynamic> results) {
  final maps = results
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
  if (maps.isEmpty) {
    return null;
  }

  Map<String, dynamic> best = maps.first;
  var bestScore = -1;
  for (final result in maps) {
    final types = (result['types'] as List<dynamic>? ?? <dynamic>[])
        .map((item) => item.toString())
        .toList();
    var score = 0;
    if (types.contains('street_address')) score += 5;
    if (types.contains('premise')) score += 4;
    if (types.contains('subpremise')) score += 3;
    if (types.contains('route')) score += 2;
    if (types.contains('plus_code')) score += 1;
    final components = result['address_components'] as List<dynamic>?;
    if ((components?.length ?? 0) >= 4) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  final specific = formatSpecificAddress(best);
  if (specific != null && specific.trim().isNotEmpty) {
    return specific.trim();
  }

  final formatted = best['formatted_address']?.toString().trim();
  if (formatted != null && formatted.isNotEmpty) {
    return formatted;
  }
  return null;
}

/// Parses geocode JSON into a formatted address string.
String? parseGeocodeResponse(Map<String, dynamic> json) {
  final status = (json['status']?.toString().trim() ?? '');
  if (status == 'ZERO_RESULTS') {
    return null;
  }
  if (status != 'OK') {
    final errorMessage = json['error_message']?.toString().trim();
    throw GooglePlacesLookupException(
      errorMessage?.isNotEmpty == true
          ? errorMessage!
          : 'Reverse geocode failed.',
      status: status.isEmpty ? null : status,
    );
  }

  final results = json['results'] as List<dynamic>? ?? <dynamic>[];
  return pickBestReverseGeocodeAddress(results);
}
