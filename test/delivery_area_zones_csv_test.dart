import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/utils/delivery_area_zones_csv.dart';

void main() {
  test('parses CSV grouped by zone name', () {
    const csv = '''
nombre,precio,lat,lng
Los Salias,3,10.50,-66.93
Los Salias,3,10.51,-66.93
Los Salias,3,10.51,-66.92
Los Salias,3,10.50,-66.92
Otra,5,10.0,-66.0
Otra,5,10.1,-66.0
''';
    final result = parseDeliveryAreaZonesCsv(csv, idFactory: () => 'id-1');
    expect(result.imported, 1);
    expect(result.zones.first.name, 'Los Salias');
    expect(result.zones.first.polygon, hasLength(4));
    expect(result.skipped, greaterThan(0));
  });
}
