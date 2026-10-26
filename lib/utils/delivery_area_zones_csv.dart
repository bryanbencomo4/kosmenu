import 'package:kosmenu_app/models/delivery_config.dart';

class DeliveryAreaZonesCsvResult {
  const DeliveryAreaZonesCsvResult({
    required this.zones,
    required this.imported,
    required this.skipped,
  });

  final List<DeliveryAreaZone> zones;
  final int imported;
  final int skipped;
}

/// Parses CSV rows grouped by zone name:
/// nombre,precio,lat,lng
DeliveryAreaZonesCsvResult parseDeliveryAreaZonesCsv(
  String raw, {
  String Function()? idFactory,
}) {
  final lines = raw
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .split('\n')
      .map((line) => line.trim())
      .where((line) => line.isNotEmpty)
      .toList();
  if (lines.isEmpty) {
    return const DeliveryAreaZonesCsvResult(zones: [], imported: 0, skipped: 0);
  }

  var start = 0;
  final header = _splitCsvLine(lines.first).map((c) => c.toLowerCase()).toList();
  final looksLikeHeader = header.any((c) => c.contains('nombre') || c.contains('name')) &&
      header.any((c) => c.contains('lat')) &&
      header.any((c) => c.contains('lng') || c.contains('lon'));
  if (looksLikeHeader) start = 1;

  final buckets = <String, _CsvZoneBucket>{};
  var skipped = 0;

  for (var i = start; i < lines.length; i++) {
    final cols = _splitCsvLine(lines[i]);
    if (cols.length < 4) {
      skipped++;
      continue;
    }
    final name = cols[0].trim();
    final price = double.tryParse(cols[1].replaceAll(',', '.'));
    final lat = double.tryParse(cols[2].replaceAll(',', '.'));
    final lng = double.tryParse(cols[3].replaceAll(',', '.'));
    if (name.isEmpty || price == null || lat == null || lng == null) {
      skipped++;
      continue;
    }
    if (lat.abs() > 90 || lng.abs() > 180 || price.isNegative) {
      skipped++;
      continue;
    }
    final key = name.toLowerCase();
    final bucket = buckets.putIfAbsent(
      key,
      () => _CsvZoneBucket(name: name, price: price),
    );
    bucket.price = price;
    bucket.points.add([lat, lng]);
  }

  final zones = <DeliveryAreaZone>[];
  for (final bucket in buckets.values) {
    if (bucket.points.length < 3) {
      skipped += bucket.points.isEmpty ? 1 : bucket.points.length;
      continue;
    }
    final id = idFactory?.call() ?? 'area-${DateTime.now().microsecondsSinceEpoch}-${zones.length}';
    zones.add(
      DeliveryAreaZone(
        id: id,
        name: bucket.name,
        price: bucket.price,
        polygon: List<List<double>>.from(bucket.points),
      ),
    );
  }

  return DeliveryAreaZonesCsvResult(
    zones: zones,
    imported: zones.length,
    skipped: skipped,
  );
}

String deliveryAreaZonesCsvTemplate() {
  return 'nombre,precio,lat,lng\n'
      'Ejemplo Zona,3,10.500,-66.930\n'
      'Ejemplo Zona,3,10.510,-66.930\n'
      'Ejemplo Zona,3,10.510,-66.920\n'
      'Ejemplo Zona,3,10.500,-66.920\n';
}

List<String> _splitCsvLine(String line) {
  final result = <String>[];
  final buffer = StringBuffer();
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    final ch = line[i];
    if (ch == '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] == '"') {
        buffer.write('"');
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch == ',' && !inQuotes) {
      result.add(buffer.toString());
      buffer.clear();
      continue;
    }
    buffer.write(ch);
  }
  result.add(buffer.toString());
  return result;
}

class _CsvZoneBucket {
  _CsvZoneBucket({required this.name, required this.price});

  final String name;
  double price;
  final List<List<double>> points = [];
}
