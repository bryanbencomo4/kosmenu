import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';

class ZoomOffice {
  const ZoomOffice({
    required this.id,
    required this.title,
    required this.estado,
    required this.ciudad,
    required this.address,
    this.phone,
    this.lat,
    this.lng,
  });

  final String id;
  final String title;
  final String estado;
  final String ciudad;
  final String address;
  final String? phone;
  final double? lat;
  final double? lng;

  bool get hasCoords =>
      lat != null && lng != null && lat!.isFinite && lng!.isFinite;

  String get subtitle {
    final city = ciudad.trim();
    final state = estado.trim();
    if (city.isNotEmpty && state.isNotEmpty && city.toLowerCase() != state.toLowerCase()) {
      return '$city · $state';
    }
    if (city.isNotEmpty) return city;
    if (state.isNotEmpty) return state;
    return address;
  }

  factory ZoomOffice.fromJson(Map<String, dynamic> json) {
    double? coord(dynamic v) {
      if (v is num) return v.toDouble();
      final n = double.tryParse('${v ?? ''}'.trim());
      return n;
    }

    return ZoomOffice(
      id: '${json['id'] ?? ''}'.trim(),
      title: '${json['title'] ?? json['name'] ?? ''}'.trim(),
      estado: '${json['estado'] ?? json['state'] ?? ''}'.trim(),
      ciudad: '${json['ciudad'] ?? json['city'] ?? ''}'.trim(),
      address: '${json['address'] ?? json['street'] ?? ''}'.trim(),
      phone: () {
        final raw = '${json['phone'] ?? ''}'.trim();
        return raw.isEmpty ? null : raw;
      }(),
      lat: coord(json['lat'] ?? json['latitude']),
      lng: coord(json['lng'] ?? json['lon'] ?? json['longitude']),
    );
  }
}

class ZoomOfficesResult {
  const ZoomOfficesResult({
    required this.offices,
    required this.source,
    required this.manualFallback,
    this.warning,
  });

  final List<ZoomOffice> offices;
  final String source;
  final bool manualFallback;
  final String? warning;

  bool get isLive => source == 'live' || source == 'cache';
}

class ZoomOfficesService {
  const ZoomOfficesService();

  /// Always resolves without throwing — empty list means use manual entry.
  Future<ZoomOfficesResult> load({bool refresh = false}) async {
    try {
      final uri = ElmenuxfaApiConfig.uri(
        '/api/kit/zoom-offices${refresh ? '?refresh=1' : ''}',
      );
      final response = await http
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 25));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return const ZoomOfficesResult(
          offices: [],
          source: 'error',
          manualFallback: true,
          warning: 'http_error',
        );
      }
      final body = jsonDecode(response.body);
      if (body is! Map) {
        return const ZoomOfficesResult(
          offices: [],
          source: 'error',
          manualFallback: true,
          warning: 'bad_payload',
        );
      }
      final raw = body['offices'];
      final offices = <ZoomOffice>[];
      if (raw is List) {
        for (final item in raw) {
          if (item is Map) {
            final office = ZoomOffice.fromJson(Map<String, dynamic>.from(item));
            if (office.title.isNotEmpty) offices.add(office);
          }
        }
      }
      return ZoomOfficesResult(
        offices: offices,
        source: '${body['source'] ?? 'fallback'}',
        manualFallback: body['manualFallback'] != false,
        warning: body['warning']?.toString(),
      );
    } catch (_) {
      return const ZoomOfficesResult(
        offices: [],
        source: 'error',
        manualFallback: true,
        warning: 'network',
      );
    }
  }
}
