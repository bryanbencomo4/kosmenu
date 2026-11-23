import 'dart:math' as math;

/// Point as [lat, lng].
typedef GeoPoint = List<double>;

bool pointInPolygon(GeoPoint point, List<GeoPoint> polygon) {
  if (point.length < 2 || polygon.length < 3) return false;
  final lat = point[0];
  final lng = point[1];
  if (lat.isNaN || lng.isNaN) return false;
  var inside = false;
  for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (polygon[i].length < 2 || polygon[j].length < 2) continue;
    final yi = polygon[i][0];
    final xi = polygon[i][1];
    final yj = polygon[j][0];
    final xj = polygon[j][1];
    final denom = yj - yi;
    final intersect = (yi > lat) != (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (denom == 0 ? 1e-12 : denom) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

bool _segmentsIntersect(
  double ax,
  double ay,
  double bx,
  double by,
  double cx,
  double cy,
  double dx,
  double dy,
) {
  double orient(double px, double py, double qx, double qy, double rx, double ry) {
    return (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  }

  bool onSegment(double px, double py, double qx, double qy, double rx, double ry) {
    return math.min(px, rx) <= qx &&
        qx <= math.max(px, rx) &&
        math.min(py, ry) <= qy &&
        qy <= math.max(py, ry);
  }

  final o1 = orient(ax, ay, bx, by, cx, cy);
  final o2 = orient(ax, ay, bx, by, dx, dy);
  final o3 = orient(cx, cy, dx, dy, ax, ay);
  final o4 = orient(cx, cy, dx, dy, bx, by);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1.abs() < 1e-12 && onSegment(ax, ay, cx, cy, bx, by)) return true;
  if (o2.abs() < 1e-12 && onSegment(ax, ay, dx, dy, bx, by)) return true;
  if (o3.abs() < 1e-12 && onSegment(cx, cy, ax, ay, dx, dy)) return true;
  if (o4.abs() < 1e-12 && onSegment(cx, cy, bx, by, dx, dy)) return true;
  return false;
}

/// True if polygons share interior (vertex inside other, or edges cross).
bool polygonsOverlap(List<GeoPoint> a, List<GeoPoint> b) {
  if (a.length < 3 || b.length < 3) return false;
  for (final p in a) {
    if (p.length >= 2 && pointInPolygon(p, b)) return true;
  }
  for (final p in b) {
    if (p.length >= 2 && pointInPolygon(p, a)) return true;
  }
  for (var i = 0; i < a.length; i++) {
    final a1 = a[i];
    final a2 = a[(i + 1) % a.length];
    if (a1.length < 2 || a2.length < 2) continue;
    for (var j = 0; j < b.length; j++) {
      final b1 = b[j];
      final b2 = b[(j + 1) % b.length];
      if (b1.length < 2 || b2.length < 2) continue;
      // Use lng as x, lat as y.
      if (_segmentsIntersect(
        a1[1],
        a1[0],
        a2[1],
        a2[0],
        b1[1],
        b1[0],
        b2[1],
        b2[0],
      )) {
        return true;
      }
    }
  }
  return false;
}

String? findOverlappingAreaZoneName({
  required List<GeoPoint> polygon,
  required List<({String id, String name, List<GeoPoint> polygon})> others,
  String? ignoreId,
}) {
  for (final other in others) {
    if (ignoreId != null && other.id == ignoreId) continue;
    if (polygonsOverlap(polygon, other.polygon)) {
      return other.name;
    }
  }
  return null;
}
