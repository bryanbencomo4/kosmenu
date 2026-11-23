import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:kosmenu_app/models/delivery_config.dart';
import 'package:kosmenu_app/services/google_places_lookup.dart';
import 'package:kosmenu_app/utils/polygon_geometry.dart';
import 'package:kosmenu_app/widgets/google_maps_sdk_gate.dart';

/// Full-screen editor: search place, drag vertices, prevent overlap with other zones.
class DeliveryAreaZoneEditor extends StatefulWidget {
  const DeliveryAreaZoneEditor({
    super.key,
    required this.initial,
    this.center,
    this.otherZones = const [],
  });

  final DeliveryAreaZone initial;
  final LatLng? center;
  /// Other saved area zones (for overlap checks + map preview).
  final List<DeliveryAreaZone> otherZones;

  static Future<DeliveryAreaZone?> open(
    BuildContext context, {
    DeliveryAreaZone? initial,
    LatLng? center,
    List<DeliveryAreaZone> otherZones = const [],
  }) {
    return Navigator.of(context).push<DeliveryAreaZone>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => DeliveryAreaZoneEditor(
          initial: initial ??
              DeliveryAreaZone(
                id: 'area-${DateTime.now().microsecondsSinceEpoch}',
                name: 'Nueva zona',
                price: 0,
              ),
          center: center,
          otherZones: otherZones,
        ),
      ),
    );
  }

  @override
  State<DeliveryAreaZoneEditor> createState() => _DeliveryAreaZoneEditorState();
}

class _DeliveryAreaZoneEditorState extends State<DeliveryAreaZoneEditor> {
  static const _purple = Color(0xFF6D28D9);
  static const _muted = Color(0xFF6B7280);
  static const _otherFill = Color(0xFF64748B);

  late final TextEditingController _name;
  late final TextEditingController _price;
  late final TextEditingController _search;
  late List<LatLng> _points;

  final Completer<GoogleMapController> _mapController = Completer();
  Timer? _searchDebounce;
  List<PlaceSuggestion> _suggestions = const [];
  bool _searching = false;
  int? _selectedIndex;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.initial.name);
    final price = widget.initial.price;
    _price = TextEditingController(
      text: price == price.roundToDouble() ? '${price.round()}' : '$price',
    );
    _search = TextEditingController();
    _points = widget.initial.polygon
        .where((p) => p.length >= 2)
        .map((p) => LatLng(p[0], p[1]))
        .toList();
    _search.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _search.removeListener(_onSearchChanged);
    _name.dispose();
    _price.dispose();
    _search.dispose();
    super.dispose();
  }

  LatLng get _cameraTarget {
    if (_points.isNotEmpty) return _points.first;
    return widget.center ?? const LatLng(10.4806, -66.9036);
  }

  List<({String id, String name, List<GeoPoint> polygon})> get _otherGeo {
    return widget.otherZones
        .where((z) => z.id != widget.initial.id)
        .map(
          (z) => (
            id: z.id,
            name: z.name,
            polygon: z.polygon,
          ),
        )
        .toList();
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    final query = _search.text.trim();
    if (query.length < 3) {
      setState(() {
        _searching = false;
        _suggestions = const [];
      });
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      unawaited(_runSearch(query));
    });
  }

  Future<void> _runSearch(String query) async {
    setState(() => _searching = true);
    try {
      final near = _cameraTarget;
      final suggestions = await GooglePlacesLookup.autocomplete(
        query: query,
        nearLatitude: near.latitude,
        nearLongitude: near.longitude,
        radiusMeters: 40000,
      );
      if (!mounted || _search.text.trim() != query) return;
      setState(() {
        _searching = false;
        _suggestions = suggestions;
      });
    } on GooglePlacesLookupException {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _suggestions = const [];
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudieron cargar sugerencias. Intenta de nuevo.'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _suggestions = const [];
      });
    }
  }

  double? _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse('${value ?? ''}'.replaceAll(',', '.'));
  }

  Future<void> _selectSuggestion(PlaceSuggestion suggestion) async {
    try {
      final details = await GooglePlacesLookup.details(suggestion.placeId);
      if (!mounted) return;
      if (details == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No se pudo abrir esa ubicación. Prueba otra sugerencia.'),
          ),
        );
        return;
      }

      final geometry = details['geometry'] is Map
          ? Map<String, dynamic>.from(details['geometry'] as Map)
          : <String, dynamic>{};
      final location = geometry['location'] is Map
          ? Map<String, dynamic>.from(geometry['location'] as Map)
          : <String, dynamic>{};
      final viewport = geometry['viewport'] is Map
          ? Map<String, dynamic>.from(geometry['viewport'] as Map)
          : <String, dynamic>{};
      final ne = viewport['northeast'] is Map
          ? Map<String, dynamic>.from(viewport['northeast'] as Map)
          : <String, dynamic>{};
      final sw = viewport['southwest'] is Map
          ? Map<String, dynamic>.from(viewport['southwest'] as Map)
          : <String, dynamic>{};

      final lat = _toDouble(location['lat']);
      final lng = _toDouble(location['lng']);
      final neLat = _toDouble(ne['lat']);
      final neLng = _toDouble(ne['lng']);
      final swLat = _toDouble(sw['lat']);
      final swLng = _toDouble(sw['lng']);

      final shortName = suggestion.description.split(',').first.trim();
      setState(() {
        _suggestions = const [];
        _search.text = suggestion.description;
        final currentName = _name.text.trim().toLowerCase();
        if (currentName.isEmpty ||
            currentName == 'nueva zona' ||
            currentName == 'zona') {
          _name.text = shortName.isEmpty ? suggestion.description : shortName;
        }
      });

      final canAutoDraw = neLat != null &&
          neLng != null &&
          swLat != null &&
          swLng != null &&
          (neLat - swLat).abs() > 0.00005 &&
          (neLng - swLng).abs() > 0.00005;

      final draw = canAutoDraw
          ? await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: Text(
                  '¿Dibujar la zona automáticamente?',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                ),
                content: Text(
                  'Usaremos el área aproximada de “${shortName.isEmpty ? suggestion.description : shortName}” en el mapa. Luego puedes arrastrar los pines para ajustarla.',
                  style: GoogleFonts.poppins(fontSize: 14, height: 1.4),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Solo centrar'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    style: FilledButton.styleFrom(backgroundColor: _purple),
                    child: const Text('Dibujar'),
                  ),
                ],
              ),
            )
          : false;

      if (!mounted) return;

      if (draw == true &&
          neLat != null &&
          neLng != null &&
          swLat != null &&
          swLng != null) {
        final south = swLat;
        final west = swLng;
        final north = neLat;
        final east = neLng;
        final rect = <LatLng>[
          LatLng(south, west),
          LatLng(south, east),
          LatLng(north, east),
          LatLng(north, west),
        ];
        final overlap = findOverlappingAreaZoneName(
          polygon: rect.map((p) => [p.latitude, p.longitude]).toList(),
          others: _otherGeo,
          ignoreId: widget.initial.id,
        );
        if (overlap != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Esa área se solapa con “$overlap”. Centramos el mapa para que la dibujes a mano.',
              ),
            ),
          );
          await _panTo(
            LatLng(
              lat ?? (south + north) / 2,
              lng ?? (west + east) / 2,
            ),
            zoom: 14,
          );
          return;
        }
        setState(() {
          _points = rect;
          _selectedIndex = null;
        });
        await _fitBounds(rect);
        return;
      }

      if (lat != null && lng != null) {
        await _panTo(LatLng(lat, lng), zoom: 15);
      }
    } on GooglePlacesLookupException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudo abrir esa ubicación. Prueba otra sugerencia.'),
        ),
      );
    }
  }

  Future<void> _panTo(LatLng target, {double zoom = 15}) async {
    if (!_mapController.isCompleted) return;
    final controller = await _mapController.future;
    await controller.animateCamera(
      CameraUpdate.newCameraPosition(CameraPosition(target: target, zoom: zoom)),
    );
  }

  Future<void> _fitBounds(List<LatLng> points) async {
    if (points.isEmpty || !_mapController.isCompleted) return;
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;
    for (final p in points) {
      minLat = mathMin(minLat, p.latitude);
      maxLat = mathMax(maxLat, p.latitude);
      minLng = mathMin(minLng, p.longitude);
      maxLng = mathMax(maxLng, p.longitude);
    }
    final controller = await _mapController.future;
    await controller.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        48,
      ),
    );
  }

  double mathMin(double a, double b) => a < b ? a : b;
  double mathMax(double a, double b) => a > b ? a : b;

  Set<Marker> get _markers {
    return {
      for (var i = 0; i < _points.length; i++)
        Marker(
          markerId: MarkerId('v$i'),
          position: _points[i],
          draggable: true,
          consumeTapEvents: true,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            _selectedIndex == i
                ? BitmapDescriptor.hueAzure
                : BitmapDescriptor.hueRed,
          ),
          infoWindow: InfoWindow(title: 'Punto ${i + 1}'),
          onTap: () => unawaited(_onVertexTap(i)),
          onDragStart: (_) {
            setState(() => _selectedIndex = i);
          },
          onDragEnd: (pos) {
            setState(() {
              final next = List<LatLng>.from(_points);
              next[i] = pos;
              _points = next;
              _selectedIndex = i;
            });
          },
        ),
    };
  }

  Set<Polygon> get _polygons {
    final set = <Polygon>{};
    for (final zone in widget.otherZones) {
      if (zone.id == widget.initial.id) continue;
      if (zone.polygon.length < 3) continue;
      set.add(
        Polygon(
          polygonId: PolygonId('other-${zone.id}'),
          points: zone.polygon.map((p) => LatLng(p[0], p[1])).toList(),
          strokeWidth: 1,
          strokeColor: _otherFill,
          fillColor: _otherFill.withValues(alpha: 0.18),
        ),
      );
    }
    if (_points.length >= 3) {
      set.add(
        Polygon(
          polygonId: const PolygonId('area'),
          points: _points,
          strokeWidth: 2,
          strokeColor: _purple,
          fillColor: _purple.withValues(alpha: 0.25),
        ),
      );
    }
    return set;
  }

  Set<Polyline> get _polylines {
    if (_points.length < 2 || _points.length >= 3) return {};
    return {
      Polyline(
        polylineId: const PolylineId('draft'),
        points: _points,
        width: 2,
        color: _purple,
      ),
    };
  }

  Future<void> _onVertexTap(int index) async {
    setState(() => _selectedIndex = index);
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Punto ${index + 1}',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                const SizedBox(height: 4),
                Text(
                  'Arrástralo en el mapa para ajustar la zona.',
                  style: GoogleFonts.poppins(fontSize: 13, color: _muted),
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const Icon(Icons.open_with_rounded, color: _purple),
                  title: Text('Mover', style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    'Cierra esto y arrastra el pin azul',
                    style: GoogleFonts.poppins(fontSize: 12, color: _muted),
                  ),
                  onTap: () => Navigator.pop(ctx, 'move'),
                ),
                ListTile(
                  leading: const Icon(Icons.delete_outline_rounded, color: Color(0xFFDC2626)),
                  title: Text(
                    'Eliminar punto',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFFDC2626),
                    ),
                  ),
                  onTap: () => Navigator.pop(ctx, 'delete'),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (!mounted) return;
    if (action == 'delete') {
      setState(() {
        _points = [
          for (var i = 0; i < _points.length; i++)
            if (i != index) _points[i],
        ];
        _selectedIndex = null;
      });
    }
  }

  void _onMapTap(LatLng point) {
    setState(() {
      _points = [..._points, point];
      _selectedIndex = _points.length - 1;
      _suggestions = const [];
    });
  }

  void _undo() {
    if (_points.isEmpty) return;
    setState(() {
      _points = _points.sublist(0, _points.length - 1);
      _selectedIndex = null;
    });
  }

  void _clear() {
    setState(() {
      _points = [];
      _selectedIndex = null;
    });
  }

  void _save() {
    final name = _name.text.trim().isEmpty ? 'Zona' : _name.text.trim();
    final price = double.tryParse(_price.text.replaceAll(',', '.')) ?? 0;
    if (_points.length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Marca al menos 3 puntos en el mapa.')),
      );
      return;
    }
    if (price < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El precio no puede ser negativo.')),
      );
      return;
    }
    final polygon = _points.map((p) => [p.latitude, p.longitude]).toList();
    final overlap = findOverlappingAreaZoneName(
      polygon: polygon,
      others: _otherGeo,
      ignoreId: widget.initial.id,
    );
    if (overlap != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Esta zona se solapa con “$overlap”. Ajusta los pines para que no se crucen.',
          ),
        ),
      );
      return;
    }
    final id = widget.initial.id.trim().isEmpty
        ? 'area-${DateTime.now().microsecondsSinceEpoch}'
        : widget.initial.id;
    Navigator.of(context).pop(
      DeliveryAreaZone(
        id: id,
        name: name,
        price: price,
        polygon: polygon,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: Text(
          'Dibujar zona',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
        actions: [
          TextButton(
            onPressed: _save,
            child: Text(
              'Guardar',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w700, color: _purple),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _name,
                  decoration: InputDecoration(
                    labelText: 'Nombre de la zona',
                    hintText: 'Los Salias',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _price,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                  decoration: InputDecoration(
                    labelText: 'Precio',
                    hintText: '3',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Toca el mapa para agregar pines. Arrástralos para precisar. Clic en un pin para eliminarlo. ${_points.length} punto${_points.length == 1 ? '' : 's'}.',
                  style: GoogleFonts.poppins(fontSize: 12, color: _muted, height: 1.35),
                ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: GoogleMapsSdkGate(
                        loading: const Center(child: CircularProgressIndicator()),
                        child: GoogleMap(
                          initialCameraPosition: CameraPosition(
                            target: _cameraTarget,
                            zoom: 14,
                          ),
                          onMapCreated: (controller) {
                            if (!_mapController.isCompleted) {
                              _mapController.complete(controller);
                            }
                          },
                          onTap: _onMapTap,
                          markers: _markers,
                          polygons: _polygons,
                          polylines: _polylines,
                          myLocationButtonEnabled: false,
                          zoomControlsEnabled: false,
                          mapToolbarEnabled: false,
                        ),
                      ),
                    ),
                    Positioned(
                      top: 12,
                      left: 12,
                      right: 12,
                      child: Material(
                        elevation: 3,
                        borderRadius: BorderRadius.circular(14),
                        color: Colors.white,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TextField(
                              controller: _search,
                              textInputAction: TextInputAction.search,
                              decoration: InputDecoration(
                                hintText: 'Buscar zona, barrio o dirección…',
                                hintStyle: GoogleFonts.poppins(fontSize: 13, color: _muted),
                                prefixIcon: const Icon(Icons.search_rounded),
                                suffixIcon: _searching
                                    ? const Padding(
                                        padding: EdgeInsets.all(12),
                                        child: SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        ),
                                      )
                                    : (_search.text.isEmpty
                                        ? null
                                        : IconButton(
                                            onPressed: () {
                                              _search.clear();
                                              setState(() => _suggestions = const []);
                                            },
                                            icon: const Icon(Icons.close_rounded),
                                          )),
                                border: InputBorder.none,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 14,
                                ),
                              ),
                              style: GoogleFonts.poppins(fontSize: 14),
                            ),
                            if (_suggestions.isNotEmpty) ...[
                              const Divider(height: 1),
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxHeight: 220),
                                child: ListView.separated(
                                  shrinkWrap: true,
                                  padding: EdgeInsets.zero,
                                  itemCount: _suggestions.length,
                                  separatorBuilder: (context, index) =>
                                      const Divider(height: 1),
                                  itemBuilder: (context, index) {
                                    final item = _suggestions[index];
                                    return ListTile(
                                      dense: true,
                                      leading: const Icon(
                                        Icons.place_outlined,
                                        color: _purple,
                                      ),
                                      title: Text(
                                        item.description,
                                        style: GoogleFonts.poppins(fontSize: 13),
                                      ),
                                      onTap: () => unawaited(_selectSuggestion(item)),
                                    );
                                  },
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _points.isEmpty ? null : _undo,
                      icon: const Icon(Icons.undo_rounded),
                      label: const Text('Deshacer'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _points.isEmpty ? null : _clear,
                      icon: const Icon(Icons.delete_outline_rounded),
                      label: const Text('Limpiar'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
