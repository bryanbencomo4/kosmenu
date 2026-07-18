import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:kosmenu_app/core/color_argb_codec.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/public_menu_api_service.dart';
import 'package:kosmenu_app/services/public_order_api_service.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:url_launcher/url_launcher.dart';

class PublicMenuView extends StatefulWidget {
  const PublicMenuView({
    super.key,
    required this.comercioId,
    this.assistedMode,
    this.entrySource,
  });

  final String comercioId;
  final bool? assistedMode;
  final String? entrySource;

  @override
  State<PublicMenuView> createState() => _PublicMenuViewState();
}

class _PublicMenuViewState extends State<PublicMenuView> {
  static const String _defaultBrandLogoAsset = 'assets/branding/logotipo.png';
  static const double _stickyHeaderExtent = 132;
  static const List<String> _paymentMethods = <String>[
    'Pago Movil',
    'Efectivo (USD/COP)',
    'Zelle',
  ];

  late Future<_PublicMenuData> _menuFuture;
  late final ScrollController _scrollController;
  late final bool _isAssistedMode;
  final Map<String, int> _cart = <String, int>{};
  final Map<String, GlobalKey> _categorySectionKeys = <String, GlobalKey>{};
  final TextEditingController _searchController = TextEditingController();
  String? _activeCategoryId;
  String? _entrySource;
  String _searchQuery = '';
  Timer? _aiImageRefreshTimer;

  static const String _deliveryModePickup = 'pickup';
  static const String _deliveryModeDelivery = 'delivery';

  @override
  void initState() {
    super.initState();
    final routeParams = Uri.base.queryParameters;
    _isAssistedMode = widget.assistedMode ?? routeParams['mode'] == 'assisted';
    _entrySource = (widget.entrySource ?? routeParams['source'])?.trim();
    _scrollController = ScrollController()..addListener(_handleMenuScroll);
    _menuFuture = _fetchMenuData();
  }

  @override
  void dispose() {
    _aiImageRefreshTimer?.cancel();
    _scrollController
      ..removeListener(_handleMenuScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<_PublicMenuData> _fetchMenuData() async {
    final payload = await PublicMenuApiService().fetchMenu(widget.comercioId);
    final comercioMap = Map<String, dynamic>.from(
      (payload['comercio'] as Map?) ?? const <String, dynamic>{},
    );
    final resolvedComercioId =
        (comercioMap['id']?.toString() ?? widget.comercioId).trim();

    final categories = ((payload['categorias'] as List<dynamic>?) ?? const [])
        .map(
          (row) =>
              _PublicCategory.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .toList();

    final products = ((payload['productos'] as List<dynamic>?) ?? const [])
        .map(
          (row) =>
              _PublicProduct.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .toList();

    _syncAiImageRefresh(products);

    return _PublicMenuData(
      comercioId: resolvedComercioId,
      comercioNombre: comercioMap['nombre']?.toString() ?? 'Kosmenu',
      comercioLogoUrl: _resolveComercioLogoUrl(comercioMap),
      whatsappNumber: _normalizePhone(comercioMap['whatsapp']?.toString()),
      allowsDelivery: comercioMap['permite_delivery'] == true,
      comercioAddress: (comercioMap['direccion']?.toString() ?? '').trim(),
      businessLatitude: _toDoubleOrNull(comercioMap['latitud']),
      businessLongitude: _toDoubleOrNull(comercioMap['longitud']),
      tasaCambioPesos: _parseRate(
        comercioMap['exchange_rate_value'] ?? comercioMap['tasa_cambio_pesos'],
      ),
      palette: _PublicMenuPalette.fromMenuPalette(
        comercioMap['menu_palette']?.toString(),
        primaryArgb: _toInt(comercioMap['menu_palette_primary']),
        accentArgb: _toInt(comercioMap['menu_palette_accent']),
        surfaceArgb: _toInt(comercioMap['menu_palette_surface']),
        textArgb: _toInt(comercioMap['menu_palette_text']),
      ),
      categories: categories,
      products: products,
    );
  }

  void _syncAiImageRefresh(List<_PublicProduct> products) {
    final hasPendingAiImages = products.any(
      (product) => product.hasAiImageInProgress,
    );
    if (!hasPendingAiImages) {
      _aiImageRefreshTimer?.cancel();
      _aiImageRefreshTimer = null;
      return;
    }

    _aiImageRefreshTimer ??= Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted) {
        return;
      }
      setState(() => _menuFuture = _fetchMenuData());
    });
  }

  String? _resolveComercioLogoUrl(Map<String, dynamic> comercioMap) {
    const logoKeys = <String>[
      'logo_url',
      'logo',
      'imagen_logo',
      'brand_logo_url',
    ];

    for (final key in logoKeys) {
      final value = comercioMap[key]?.toString().trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }

    return null;
  }

  int? _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }

  String? _normalizePhone(String? rawValue) {
    if (rawValue == null || rawValue.trim().isEmpty) return null;
    final normalized = rawValue.replaceAll(RegExp(r'[^\d]'), '');
    return normalized.isEmpty ? null : normalized;
  }

  double _parseRate(dynamic value) {
    if (value is num) return value.toDouble();

    final normalized = '$value'.trim();
    if (normalized.isEmpty) return 0.0;

    return double.tryParse(normalized.replaceAll(',', '.')) ?? 0.0;
  }

  double? _toDoubleOrNull(dynamic value) {
    if (value is num) return value.toDouble();
    final raw = (value ?? '').toString().trim();
    if (raw.isEmpty) return null;
    return double.tryParse(raw.replaceAll(',', '.'));
  }

  Future<Map<String, dynamic>> _httpGetJson(Uri uri) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(uri);
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      return <String, dynamic>{};
    } finally {
      client.close(force: true);
    }
  }

  Future<String?> _reverseGeocodeFromLatLng(LatLng position) async {
    final apiKey = SupabaseConfig.googleMapsApiKey.trim();
    if (apiKey.isEmpty) return null;

    try {
      final uri = Uri.https('maps.googleapis.com', '/maps/api/geocode/json', {
        'latlng': '${position.latitude},${position.longitude}',
        'language': 'es',
        'key': apiKey,
      });
      final payload = await _httpGetJson(uri);
      final status = (payload['status']?.toString() ?? '').trim();
      if (status != 'OK') return null;
      final results = payload['results'] as List<dynamic>? ?? const <dynamic>[];
      if (results.isEmpty) return null;
      final first = results.first;
      if (first is! Map) return null;
      return first['formatted_address']?.toString().trim();
    } catch (_) {
      return null;
    }
  }

  Future<LatLng> _defaultDeliveryMapPosition(_PublicMenuData data) async {
    if (data.businessLatitude != null && data.businessLongitude != null) {
      return LatLng(data.businessLatitude!, data.businessLongitude!);
    }

    try {
      final permission = await Geolocator.checkPermission();
      LocationPermission resolvedPermission = permission;
      if (permission == LocationPermission.denied) {
        resolvedPermission = await Geolocator.requestPermission();
      }

      if (resolvedPermission == LocationPermission.denied ||
          resolvedPermission == LocationPermission.deniedForever) {
        return const LatLng(10.4806, -66.9036);
      }

      final position = await Geolocator.getCurrentPosition();
      return LatLng(position.latitude, position.longitude);
    } catch (_) {
      return const LatLng(10.4806, -66.9036);
    }
  }

  void _incrementProduct(String productId) {
    setState(() {
      _cart.update(productId, (value) => value + 1, ifAbsent: () => 1);
    });
  }

  void _handleQuickAdd(_PublicProduct product) {
    _incrementProduct(product.id);
  }

  void _decrementProduct(String productId) {
    setState(() {
      final current = _cart[productId] ?? 0;
      if (current <= 1) {
        _cart.remove(productId);
      } else {
        _cart[productId] = current - 1;
      }
    });
  }

  void _handleMenuScroll() {
    _updateActiveCategoryFromScroll();
  }

  List<_CategorySection> _buildVisibleSections(_PublicMenuData data) {
    final categoryNameById = <String, String>{
      for (final category in data.categories)
        category.id.trim(): category.nombre,
    };
    final normalizedSearch = _normalizeSearchText(_searchQuery);

    bool matchesSearch(_PublicProduct product) {
      if (normalizedSearch.isEmpty) return true;
      final categoryName = categoryNameById[product.categoryId.trim()] ?? '';
      final haystack = _normalizeSearchText(
        '${product.nombre} ${product.descripcion} $categoryName',
      );
      return haystack.contains(normalizedSearch);
    }

    final sections = <_CategorySection>[];
    for (final category in data.categories) {
      final items = data.products
          .where((product) => product.categoryId.trim() == category.id.trim())
          .where(matchesSearch)
          .toList(growable: false);
      if (items.isEmpty) continue;
      sections.add(
        _CategorySection(
          id: category.id.trim(),
          title: category.nombre,
          products: items,
        ),
      );
    }

    final knownIds = categoryNameById.keys.toSet();
    final uncategorized = data.products
        .where((product) => !knownIds.contains(product.categoryId.trim()))
        .where(matchesSearch)
        .toList(growable: false);
    if (uncategorized.isNotEmpty) {
      sections.add(
        _CategorySection(
          id: '_uncategorized',
          title: 'Recomendados',
          products: uncategorized,
        ),
      );
    }

    return sections;
  }

  void _syncActiveCategory(List<_CategorySection> sections) {
    final sectionIds = sections.map((section) => section.id).toSet();
    final nextActive = sectionIds.contains(_activeCategoryId)
        ? _activeCategoryId
        : sections.isEmpty
        ? null
        : sections.first.id;
    if (nextActive == _activeCategoryId) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || nextActive == _activeCategoryId) return;
      setState(() => _activeCategoryId = nextActive);
    });
  }

  void _updateActiveCategoryFromScroll() {
    if (_categorySectionKeys.isEmpty || !mounted) return;

    const anchorY = 206.0;
    String? nextActive;
    double closestDistance = double.infinity;

    for (final entry in _categorySectionKeys.entries) {
      final context = entry.value.currentContext;
      if (context == null) continue;
      final renderObject = context.findRenderObject();
      if (renderObject is! RenderBox || !renderObject.hasSize) continue;
      final offsetY = renderObject.localToGlobal(Offset.zero).dy;
      final distance = (offsetY - anchorY).abs();

      if (offsetY <= anchorY + 24 && distance < closestDistance) {
        nextActive = entry.key;
        closestDistance = distance;
      }
    }

    nextActive ??= _categorySectionKeys.keys.isEmpty
        ? null
        : _categorySectionKeys.keys.first;

    if (nextActive != null && nextActive != _activeCategoryId) {
      setState(() => _activeCategoryId = nextActive);
    }
  }

  Future<void> _scrollToCategory(String categoryId) async {
    if (_activeCategoryId != categoryId) {
      setState(() => _activeCategoryId = categoryId);
    }

    final context = _categorySectionKeys[categoryId]?.currentContext;
    if (context == null) return;

    await Scrollable.ensureVisible(
      context,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
      alignment: 0.02,
    );
  }

  Future<PublicOrderCreateResult> _createOrderViaApi({
    required String comercioId,
    required String comercioNombre,
    required String clientName,
    required String clientWhatsapp,
    required String idempotencyKey,
    required List<_CartLine> items,
    required double tasaAplicada,
    required String selectedPaymentMethod,
    required String deliveryMode,
    required String deliveryAddress,
    required String deliveryReference,
    required String deliveryInstructions,
    required double? deliveryLatitude,
    required double? deliveryLongitude,
    required String orderNotes,
    String? paymentProofStorageRef,
  }) {
    final exchangeRate = tasaAplicada > 0 ? tasaAplicada : 1.0;
    final isDelivery = deliveryMode == _deliveryModeDelivery;
    final request = PublicOrderCreateRequest(
      comercioId: comercioId,
      comercioNombre: comercioNombre,
      clientName: clientName,
      clientWhatsapp: clientWhatsapp,
      currency: 'USD',
      exchangeRate: exchangeRate,
      costoDelivery: 0,
      items: items
          .map(
            (item) => PublicOrderItemDto(
              productId: item.product.id,
              nombre: item.product.nombre,
              cantidad: item.quantity,
              precio: item.product.precio,
            ),
          )
          .toList(),
      delivery: PublicOrderDeliveryDto(
        mode: isDelivery ? 'delivery' : 'pickup',
        address: isDelivery ? deliveryAddress : null,
        reference: isDelivery ? deliveryReference : null,
        instructions: isDelivery ? deliveryInstructions : null,
        lat: isDelivery ? deliveryLatitude : null,
        lng: isDelivery ? deliveryLongitude : null,
      ),
      paymentMethod: PublicOrderPaymentMethodDto(nombre: selectedPaymentMethod),
      paymentProofUrl: paymentProofStorageRef,
      orderNotes: orderNotes,
    );

    return PublicOrderApiService().createOrder(
      request: request,
      idempotencyKey: idempotencyKey,
    );
  }

  String _buildWhatsAppMessage({
    required String comercioNombre,
    required String orderId,
    required String trackingUrl,
    required List<_CartLine> items,
    required double totalUsd,
    required double totalCop,
    required double tasaCambioPesos,
    required String paymentMethod,
    required String deliveryMode,
    required String deliveryAddress,
    required String deliveryReference,
    required String deliveryInstructions,
    required String orderNotes,
  }) {
    final buffer = StringBuffer(
      'Pedido $orderId\nHola $comercioNombre, quiero pedir:\n',
    );

    for (final item in items) {
      buffer.writeln(
        'x${item.quantity} ${item.product.nombre} (${_formatUsd(item.lineTotalUsd)})',
      );
    }

    final copSection = tasaCambioPesos > 0
        ? ' / ${_formatCop(totalCop)} COP'
        : '';
    final isDelivery = deliveryMode == _deliveryModeDelivery;
    buffer.writeln(
      'Tipo de entrega: ${isDelivery ? 'Delivery' : 'Retiro en tienda'}',
    );
    if (isDelivery && deliveryAddress.trim().isNotEmpty) {
      buffer.writeln('Direccion de entrega: ${deliveryAddress.trim()}');
    }
    if (isDelivery && deliveryReference.trim().isNotEmpty) {
      buffer.writeln('Referencia: ${deliveryReference.trim()}');
    }
    if (isDelivery && deliveryInstructions.trim().isNotEmpty) {
      buffer.writeln('Indicaciones: ${deliveryInstructions.trim()}');
    }
    if (orderNotes.trim().isNotEmpty) {
      buffer.writeln('Notas del pedido: ${orderNotes.trim()}');
    }
    buffer.writeln('Metodo de pago: $paymentMethod');
    buffer.writeln('Total: ${_formatUsd(totalUsd)}$copSection');
    buffer.write('Seguimiento: $trackingUrl');

    return buffer.toString();
  }

  Future<_DeliveryMapPick?> _pickDeliveryOnMap({
    required _PublicMenuData data,
    required String currentAddress,
    required double? currentLatitude,
    required double? currentLongitude,
  }) async {
    final seedPosition = currentLatitude != null && currentLongitude != null
        ? LatLng(currentLatitude, currentLongitude)
        : null;
    final initialPosition =
        seedPosition ?? await _defaultDeliveryMapPosition(data);
    if (!mounted) return null;
    final fallbackAddress = currentAddress.trim().isNotEmpty
        ? currentAddress.trim()
        : data.comercioAddress.trim();

    LatLng selectedPosition = initialPosition;
    String resolvedAddress = fallbackAddress;
    bool isResolvingAddress = false;
    GoogleMapController? mapController;

    return showModalBottomSheet<_DeliveryMapPick>(
      context: context,
      isScrollControlled: true,
      backgroundColor: data.palette.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (sheetContext) {
        Future<void> resolveAddress(StateSetter setModalState) async {
          setModalState(() => isResolvingAddress = true);
          final geocoded = await _reverseGeocodeFromLatLng(selectedPosition);
          if (!sheetContext.mounted) return;
          setModalState(() {
            isResolvingAddress = false;
            if (geocoded != null && geocoded.trim().isNotEmpty) {
              resolvedAddress = geocoded.trim();
            }
          });
        }

        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              child: SizedBox(
                height: MediaQuery.of(context).size.height * 0.78,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        margin: const EdgeInsets.only(top: 10),
                        width: 52,
                        height: 5,
                        decoration: BoxDecoration(
                          color: data.palette.onSurfaceMuted.withValues(
                            alpha: 0.45,
                          ),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 12, 18, 8),
                      child: Row(
                        children: [
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: data.palette.primary.withValues(
                                alpha: 0.14,
                              ),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              Icons.pin_drop_rounded,
                              color: data.palette.primary,
                              size: 19,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Seleccionar direccion de entrega',
                                  style: GoogleFonts.manrope(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    color: data.palette.onSurface,
                                  ),
                                ),
                                Text(
                                  'Mueve el mapa y apunta el pin al lugar exacto.',
                                  style: GoogleFonts.manrope(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: data.palette.onSurfaceMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            decoration: BoxDecoration(
                              color: data.palette.surfaceAlt,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: IconButton(
                              onPressed: () => Navigator.pop(sheetContext),
                              icon: Icon(
                                Icons.close_rounded,
                                color: data.palette.onSurface,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(22),
                          child: Stack(
                            children: [
                              GoogleMap(
                                initialCameraPosition: CameraPosition(
                                  target: initialPosition,
                                  zoom: 16,
                                ),
                                myLocationButtonEnabled: true,
                                myLocationEnabled: true,
                                zoomControlsEnabled: false,
                                mapToolbarEnabled: false,
                                onMapCreated: (controller) {
                                  mapController = controller;
                                  if (resolvedAddress.isEmpty) {
                                    unawaited(resolveAddress(setModalState));
                                  }
                                },
                                onCameraMove: (position) {
                                  selectedPosition = position.target;
                                },
                                onCameraIdle: () {
                                  unawaited(resolveAddress(setModalState));
                                },
                              ),
                              IgnorePointer(
                                child: Center(
                                  child: Icon(
                                    Icons.location_on_rounded,
                                    size: 44,
                                    color: data.palette.primary,
                                  ),
                                ),
                              ),
                              Positioned(
                                top: 12,
                                left: 12,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: data.palette.surface.withValues(
                                      alpha: 0.9,
                                    ),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.touch_app_rounded,
                                        size: 14,
                                        color: data.palette.onSurfaceMuted,
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        'Arrastra para ajustar',
                                        style: GoogleFonts.manrope(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: data.palette.onSurfaceMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                      decoration: BoxDecoration(
                        color: data.palette.surfaceAlt,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.place_outlined,
                                size: 18,
                                color: data.palette.onSurfaceMuted,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                isResolvingAddress
                                    ? 'Buscando direccion...'
                                    : 'Direccion seleccionada',
                                style: GoogleFonts.manrope(
                                  color: data.palette.onSurfaceMuted,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            resolvedAddress.isNotEmpty
                                ? resolvedAddress
                                : '${selectedPosition.latitude.toStringAsFixed(6)}, ${selectedPosition.longitude.toStringAsFixed(6)}',
                            style: GoogleFonts.manrope(
                              color: data.palette.onSurface,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () async {
                                    final target =
                                        await _defaultDeliveryMapPosition(data);
                                    selectedPosition = target;
                                    await mapController?.animateCamera(
                                      CameraUpdate.newCameraPosition(
                                        CameraPosition(
                                          target: target,
                                          zoom: 16,
                                        ),
                                      ),
                                    );
                                    if (!sheetContext.mounted) return;
                                    unawaited(resolveAddress(setModalState));
                                  },
                                  icon: const Icon(
                                    Icons.my_location_rounded,
                                    size: 16,
                                  ),
                                  label: const Text('Mi ubicacion'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: FilledButton(
                                  onPressed: () {
                                    Navigator.pop(
                                      sheetContext,
                                      _DeliveryMapPick(
                                        address: resolvedAddress,
                                        latitude: selectedPosition.latitude,
                                        longitude: selectedPosition.longitude,
                                      ),
                                    );
                                  },
                                  style: FilledButton.styleFrom(
                                    backgroundColor: data.palette.primary,
                                    foregroundColor: data.palette.onPrimary,
                                  ),
                                  child: const Text('Usar esta ubicacion'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _openOrderSheet(_PublicMenuData data) async {
    final cartItems = data.products
        .where((product) => (_cart[product.id] ?? 0) > 0)
        .map(
          (product) =>
              _CartLine(product: product, quantity: _cart[product.id] ?? 0),
        )
        .toList();

    if (cartItems.isEmpty) return;

    final totalUsd = cartItems.fold<double>(
      0,
      (sum, item) => sum + item.lineTotalUsd,
    );
    final totalCop = data.tasaCambioPesos > 0
        ? totalUsd * data.tasaCambioPesos
        : 0.0;
    final palette = data.palette;

    var selectedPaymentMethod = _paymentMethods.first;
    var isSubmittingOrder = false;
    var selectedDeliveryMode = _deliveryModePickup;
    var deliveryLatitude = data.businessLatitude;
    var deliveryLongitude = data.businessLongitude;
    var uploadProgress = 0.0;
    var proofFileName = '';
    Uint8List? proofBytes;
    String? proofMimeType;
    // One key per checkout attempt; reused on controlled retries of the same attempt.
    final idempotencyKey = generateCheckoutIdempotencyKey();

    final clientNameController = TextEditingController();
    final clientWhatsappController = TextEditingController();
    final deliveryAddressController = TextEditingController();
    final deliveryReferenceController = TextEditingController();
    final deliveryInstructionsController = TextEditingController();
    final orderNotesController = TextEditingController();

    deliveryAddressController.text = data.comercioAddress;

    try {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: palette.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        builder: (sheetContext) {
          return StatefulBuilder(
            builder: (context, setModalState) {
              return SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 44,
                          height: 5,
                          decoration: BoxDecoration(
                            color: palette.onSurfaceMuted.withValues(
                              alpha: 0.45,
                            ),
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'Tu pedido',
                        style: GoogleFonts.manrope(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: palette.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        data.comercioNombre,
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: palette.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Tus datos',
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: palette.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: clientNameController,
                        enabled: !isSubmittingOrder,
                        textCapitalization: TextCapitalization.words,
                        style: GoogleFonts.manrope(
                          color: palette.onSurface,
                          fontWeight: FontWeight.w600,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Nombre completo',
                          filled: true,
                          fillColor: palette.surface,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: clientWhatsappController,
                        enabled: !isSubmittingOrder,
                        keyboardType: TextInputType.phone,
                        style: GoogleFonts.manrope(
                          color: palette.onSurface,
                          fontWeight: FontWeight.w600,
                        ),
                        decoration: InputDecoration(
                          hintText: 'WhatsApp (solo numeros)',
                          filled: true,
                          fillColor: palette.surface,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Resumen (${cartItems.length})',
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: palette.onSurfaceMuted,
                        ),
                      ),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 180),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: cartItems.length,
                          separatorBuilder: (_, _) => const Divider(height: 16),
                          itemBuilder: (context, index) {
                            final item = cartItems[index];

                            return Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    'x${item.quantity} ${item.product.nombre}',
                                    style: GoogleFonts.manrope(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: palette.onSurface,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  _formatUsd(item.lineTotalUsd),
                                  style: GoogleFonts.manrope(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: palette.primary,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Entrega',
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: palette.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('Retiro'),
                            selected:
                                selectedDeliveryMode == _deliveryModePickup,
                            onSelected: isSubmittingOrder
                                ? null
                                : (_) {
                                    setModalState(
                                      () => selectedDeliveryMode =
                                          _deliveryModePickup,
                                    );
                                  },
                            selectedColor: palette.primary,
                            backgroundColor: palette.surface,
                            side: BorderSide.none,
                            labelStyle: GoogleFonts.manrope(
                              color: selectedDeliveryMode == _deliveryModePickup
                                  ? palette.onPrimary
                                  : palette.onSurface,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          ChoiceChip(
                            label: const Text('Delivery'),
                            selected:
                                selectedDeliveryMode == _deliveryModeDelivery,
                            onSelected:
                                isSubmittingOrder || !data.allowsDelivery
                                ? null
                                : (_) {
                                    setModalState(
                                      () => selectedDeliveryMode =
                                          _deliveryModeDelivery,
                                    );
                                  },
                            selectedColor: palette.primary,
                            disabledColor: palette.surface,
                            backgroundColor: palette.surface,
                            side: BorderSide.none,
                            labelStyle: GoogleFonts.manrope(
                              color:
                                  selectedDeliveryMode == _deliveryModeDelivery
                                  ? palette.onPrimary
                                  : data.allowsDelivery
                                  ? palette.onSurface
                                  : palette.onSurfaceMuted,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                      if (!data.allowsDelivery)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            'Este comercio no tiene delivery habilitado.',
                            style: GoogleFonts.manrope(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: palette.onSurfaceMuted,
                            ),
                          ),
                        ),
                      if (selectedDeliveryMode == _deliveryModeDelivery)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Column(
                            children: [
                              TextFormField(
                                controller: deliveryAddressController,
                                style: GoogleFonts.manrope(
                                  color: palette.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                                decoration: InputDecoration(
                                  hintText: 'Direccion de entrega',
                                  filled: true,
                                  fillColor: palette.surface,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton(
                                  onPressed: isSubmittingOrder
                                      ? null
                                      : () async {
                                          final picked =
                                              await _pickDeliveryOnMap(
                                                data: data,
                                                currentAddress:
                                                    deliveryAddressController
                                                        .text,
                                                currentLatitude:
                                                    deliveryLatitude,
                                                currentLongitude:
                                                    deliveryLongitude,
                                              );
                                          if (picked == null || !mounted) {
                                            return;
                                          }
                                          setModalState(() {
                                            deliveryLatitude = picked.latitude;
                                            deliveryLongitude =
                                                picked.longitude;
                                            if (picked.address
                                                .trim()
                                                .isNotEmpty) {
                                              deliveryAddressController.text =
                                                  picked.address.trim();
                                            }
                                          });
                                        },
                                  child: const Text('Seleccionar en mapa'),
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextFormField(
                                controller: deliveryReferenceController,
                                style: GoogleFonts.manrope(
                                  color: palette.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                                decoration: InputDecoration(
                                  hintText: 'Referencia (opcional)',
                                  filled: true,
                                  fillColor: palette.surface,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextFormField(
                                controller: deliveryInstructionsController,
                                minLines: 2,
                                maxLines: 3,
                                style: GoogleFonts.manrope(
                                  color: palette.onSurface,
                                  fontWeight: FontWeight.w600,
                                ),
                                decoration: InputDecoration(
                                  hintText: 'Indicaciones (opcional)',
                                  filled: true,
                                  fillColor: palette.surface,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                              if (deliveryAddressController.text.trim().length <
                                  6)
                                Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Align(
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      'Ingresa una direccion valida para delivery.',
                                      style: GoogleFonts.manrope(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: const Color(0xFFE11D48),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 12),
                      Text(
                        'Metodo de pago',
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: palette.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue: selectedPaymentMethod,
                        isExpanded: true,
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: palette.surfaceAlt,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                        dropdownColor: palette.surface,
                        style: GoogleFonts.manrope(
                          color: palette.onSurface,
                          fontWeight: FontWeight.w700,
                        ),
                        items: _paymentMethods
                            .map(
                              (method) => DropdownMenuItem<String>(
                                value: method,
                                child: Text(method),
                              ),
                            )
                            .toList(),
                        onChanged: isSubmittingOrder
                            ? null
                            : (value) {
                                if (value == null) return;
                                setModalState(
                                  () => selectedPaymentMethod = value,
                                );
                              },
                      ),
                      const SizedBox(height: 12),
                      _SummaryRow(
                        label: 'Total USD',
                        value: _formatUsd(totalUsd),
                        labelColor: palette.onSurfaceMuted,
                        valueColor: palette.onSurface,
                      ),
                      if (data.tasaCambioPesos > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: _SummaryRow(
                            label: 'Total COP',
                            value: '${_formatCop(totalCop)} COP',
                            labelColor: palette.onSurfaceMuted,
                            valueColor: palette.onSurface,
                          ),
                        ),
                      const SizedBox(height: 12),
                      Text(
                        'Comprobante (opcional)',
                        style: GoogleFonts.manrope(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: palette.onSurfaceMuted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: isSubmittingOrder
                            ? null
                            : () async {
                                final picked = await FilePicker.platform
                                    .pickFiles(
                                      type: FileType.custom,
                                      allowedExtensions: const <String>[
                                        'jpg',
                                        'jpeg',
                                        'png',
                                        'webp',
                                        'pdf',
                                      ],
                                      withData: true,
                                    );
                                if (picked == null || picked.files.isEmpty) {
                                  return;
                                }
                                final file = picked.files.first;
                                final bytes = file.bytes;
                                if (bytes == null) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'No se pudo leer el archivo seleccionado.',
                                      ),
                                    ),
                                  );
                                  return;
                                }
                                final name = file.name;
                                final mime = _guessComprobanteMime(name);
                                final error = ComprobanteClientValidator.validate(
                                  fileName: name,
                                  mimeType: mime,
                                  sizeBytes: bytes.length,
                                );
                                if (error != null) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text(error)),
                                  );
                                  return;
                                }
                                setModalState(() {
                                  proofBytes = Uint8List.fromList(bytes);
                                  proofFileName = name;
                                  proofMimeType = mime;
                                });
                              },
                        icon: const Icon(Icons.attach_file_rounded, size: 18),
                        label: Text(
                          proofFileName.isEmpty
                              ? 'Adjuntar JPEG/PNG/WebP/PDF'
                              : proofFileName,
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (isSubmittingOrder && uploadProgress > 0) ...[
                        const SizedBox(height: 8),
                        LinearProgressIndicator(value: uploadProgress),
                      ],
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: orderNotesController,
                        minLines: 2,
                        maxLines: 3,
                        style: GoogleFonts.manrope(
                          color: palette.onSurface,
                          fontWeight: FontWeight.w600,
                        ),
                        decoration: InputDecoration(
                          hintText:
                              'Notas del pedido (sin cebolla, tocar timbre, etc.)',
                          filled: true,
                          fillColor: palette.surface,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: isSubmittingOrder
                              ? null
                              : () async {
                                  final whatsappNumber = data.whatsappNumber;
                                  if (whatsappNumber == null ||
                                      whatsappNumber.isEmpty) {
                                    if (!mounted || !sheetContext.mounted) {
                                      return;
                                    }
                                    Navigator.pop(sheetContext);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Este comercio no tiene WhatsApp configurado.',
                                        ),
                                      ),
                                    );
                                    return;
                                  }

                                  final localScaffoldMessenger =
                                      ScaffoldMessenger.of(context);
                                  final clientName =
                                      clientNameController.text.trim();
                                  final clientWhatsapp =
                                      clientWhatsappController.text
                                          .replaceAll(RegExp(r'\D'), '');

                                  if (clientName.length < 3) {
                                    localScaffoldMessenger.showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Ingresa tu nombre (minimo 3 caracteres).',
                                        ),
                                      ),
                                    );
                                    return;
                                  }
                                  if (clientWhatsapp.length < 10) {
                                    localScaffoldMessenger.showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Ingresa un WhatsApp valido.',
                                        ),
                                      ),
                                    );
                                    return;
                                  }

                                  setModalState(() => isSubmittingOrder = true);

                                  final isDeliveryOrder =
                                      selectedDeliveryMode ==
                                      _deliveryModeDelivery;
                                  final normalizedAddress =
                                      deliveryAddressController.text.trim();
                                  final normalizedReference =
                                      deliveryReferenceController.text.trim();
                                  final normalizedInstructions =
                                      deliveryInstructionsController.text
                                          .trim();
                                  final normalizedOrderNotes =
                                      orderNotesController.text.trim();

                                  if (isDeliveryOrder &&
                                      normalizedAddress.length < 6) {
                                    if (!mounted) return;
                                    setModalState(
                                      () => isSubmittingOrder = false,
                                    );
                                    localScaffoldMessenger.showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Ingresa una direccion valida para el delivery.',
                                        ),
                                      ),
                                    );
                                    return;
                                  }

                                  if (isDeliveryOrder &&
                                      (deliveryLatitude == null ||
                                          deliveryLongitude == null)) {
                                    if (!mounted) return;
                                    setModalState(
                                      () => isSubmittingOrder = false,
                                    );
                                    localScaffoldMessenger.showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Selecciona la ubicacion exacta en el mapa para continuar con el delivery.',
                                        ),
                                      ),
                                    );
                                    return;
                                  }

                                  try {
                                    final api = PublicOrderApiService();
                                    String? storageRef;
                                    final pendingBytes = proofBytes;
                                    final pendingName = proofFileName;
                                    final pendingMime = proofMimeType;
                                    if (pendingBytes != null &&
                                        pendingName.isNotEmpty &&
                                        pendingMime != null) {
                                      final uploaded = await api
                                          .uploadComprobante(
                                            comercioId: data.comercioId,
                                            fileName: pendingName,
                                            mimeType: pendingMime,
                                            bytes: pendingBytes,
                                            onProgress: (value) {
                                              if (!mounted) return;
                                              setModalState(
                                                () => uploadProgress = value,
                                              );
                                            },
                                          );
                                      storageRef = uploaded.storageRef;
                                    }

                                    final created = await _createOrderViaApi(
                                      comercioId: data.comercioId,
                                      comercioNombre: data.comercioNombre,
                                      clientName: clientName,
                                      clientWhatsapp: clientWhatsapp,
                                      idempotencyKey: idempotencyKey,
                                      items: cartItems,
                                      tasaAplicada: data.tasaCambioPesos,
                                      selectedPaymentMethod:
                                          selectedPaymentMethod,
                                      deliveryMode: selectedDeliveryMode,
                                      deliveryAddress: isDeliveryOrder
                                          ? normalizedAddress
                                          : '',
                                      deliveryReference: isDeliveryOrder
                                          ? normalizedReference
                                          : '',
                                      deliveryInstructions: isDeliveryOrder
                                          ? normalizedInstructions
                                          : '',
                                      deliveryLatitude: isDeliveryOrder
                                          ? deliveryLatitude
                                          : null,
                                      deliveryLongitude: isDeliveryOrder
                                          ? deliveryLongitude
                                          : null,
                                      orderNotes: normalizedOrderNotes,
                                      paymentProofStorageRef: storageRef,
                                    );

                                    final message = _buildWhatsAppMessage(
                                      comercioNombre: data.comercioNombre,
                                      orderId: created.orderId,
                                      trackingUrl: created.trackingUrl,
                                      items: cartItems,
                                      totalUsd: totalUsd,
                                      totalCop: totalCop,
                                      tasaCambioPesos: data.tasaCambioPesos,
                                      paymentMethod: selectedPaymentMethod,
                                      deliveryMode: selectedDeliveryMode,
                                      deliveryAddress: isDeliveryOrder
                                          ? normalizedAddress
                                          : '',
                                      deliveryReference: isDeliveryOrder
                                          ? normalizedReference
                                          : '',
                                      deliveryInstructions: isDeliveryOrder
                                          ? normalizedInstructions
                                          : '',
                                      orderNotes: normalizedOrderNotes,
                                    );
                                    final uri = Uri.parse(
                                      'https://wa.me/$whatsappNumber?text=${Uri.encodeComponent(message)}',
                                    );

                                    final launched = await launchUrl(uri);
                                    if (!mounted) return;

                                    if (launched) {
                                      setState(() => _cart.clear());
                                      if (sheetContext.mounted) {
                                        Navigator.pop(sheetContext);
                                      }
                                    } else {
                                      localScaffoldMessenger.showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            'Pedido ${created.orderId} confirmado. No se pudo abrir WhatsApp.',
                                          ),
                                        ),
                                      );
                                    }
                                  } on PublicOrderApiException catch (error) {
                                    if (!mounted) return;
                                    localScaffoldMessenger.showSnackBar(
                                      SnackBar(content: Text(error.message)),
                                    );
                                  } catch (_) {
                                    if (!mounted) return;
                                    localScaffoldMessenger.showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'No se pudo registrar el pedido. Intentalo de nuevo.',
                                        ),
                                      ),
                                    );
                                  } finally {
                                    if (mounted) {
                                      setModalState(() {
                                        isSubmittingOrder = false;
                                        uploadProgress = 0;
                                      });
                                    }
                                  }
                                },
                          style: FilledButton.styleFrom(
                            backgroundColor: palette.primary,
                            foregroundColor: palette.onPrimary,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (isSubmittingOrder) ...[
                                SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.2,
                                    color: palette.onPrimary,
                                  ),
                                ),
                                const SizedBox(width: 10),
                              ],
                              Text(
                                isSubmittingOrder
                                    ? 'Registrando pedido...'
                                    : 'Confirmar por WhatsApp',
                                style: GoogleFonts.manrope(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      );
    } finally {
      clientNameController.dispose();
      clientWhatsappController.dispose();
      deliveryAddressController.dispose();
      deliveryReferenceController.dispose();
      deliveryInstructionsController.dispose();
      orderNotesController.dispose();
    }
  }

  String _guessComprobanteMime(String fileName) {
    final lower = fileName.trim().toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return 'image/jpeg';
  }

  String _formatUsd(double amount) => '\$${amount.toStringAsFixed(2)}';

  String _formatCop(double amount) => amount.toStringAsFixed(0);

  String _normalizeSearchText(String value) {
    return value.toLowerCase().trim().replaceAll(
      RegExp(r'[\u0300-\u036f]'),
      '',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: FutureBuilder<_PublicMenuData>(
          future: _menuFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const BrandedLoadingScreen();
            }

            if (snapshot.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'No se pudo cargar el menu: ${snapshot.error}',
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            final data = snapshot.data;
            if (data == null) {
              return const Center(
                child: Text('No se encontro informacion para este menu.'),
              );
            }

            final palette = data.palette;

            final cartItemCount = _cart.values.fold<int>(
              0,
              (sum, item) => sum + item,
            );
            final cartTotalUsd = data.products.fold<double>(
              0,
              (sum, product) =>
                  sum + ((_cart[product.id] ?? 0) * product.precio),
            );
            if (_searchController.text != _searchQuery) {
              _searchController.value = TextEditingValue(
                text: _searchQuery,
                selection: TextSelection.collapsed(offset: _searchQuery.length),
              );
            }

            final visibleSections = _buildVisibleSections(data);
            _syncActiveCategory(visibleSections);
            final activeCategoryId =
                visibleSections.any(
                  (section) => section.id == _activeCategoryId,
                )
                ? _activeCategoryId
                : (visibleSections.isEmpty ? null : visibleSections.first.id);

            return Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    palette.surfaceEnd.withValues(alpha: 0.98),
                    palette.surface.withValues(alpha: 0.98),
                    palette.surfaceAlt.withValues(alpha: 0.98),
                  ],
                ),
              ),
              child: Stack(
                children: [
                  RefreshIndicator(
                    color: palette.primary,
                    onRefresh: () async {
                      final future = _fetchMenuData();
                      setState(() => _menuFuture = future);
                      await future;
                    },
                    child: CustomScrollView(
                      controller: _scrollController,
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        SliverAppBar(
                          pinned: true,
                          floating: false,
                          elevation: 0,
                          expandedHeight: 172,
                          backgroundColor: palette.surface.withValues(
                            alpha: 0.96,
                          ),
                          foregroundColor: palette.onSurface,
                          title: Text(
                            data.comercioNombre,
                            style: GoogleFonts.manrope(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: palette.onSurface,
                            ),
                          ),
                          flexibleSpace: FlexibleSpaceBar(
                            collapseMode: CollapseMode.parallax,
                            background: Container(
                              padding: const EdgeInsets.fromLTRB(
                                16,
                                70,
                                16,
                                18,
                              ),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    palette.surfaceStart,
                                    palette.surfaceEnd,
                                  ],
                                ),
                              ),
                              child: Align(
                                alignment: Alignment.bottomLeft,
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (_isAssistedMode)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 12,
                                          vertical: 7,
                                        ),
                                        decoration: BoxDecoration(
                                          color: palette.primary.withValues(
                                            alpha: 0.18,
                                          ),
                                          borderRadius: BorderRadius.circular(
                                            999,
                                          ),
                                          border: Border.all(
                                            color: palette.primary.withValues(
                                              alpha: 0.32,
                                            ),
                                          ),
                                        ),
                                        child: Text(
                                          _entrySource == 'dashboard'
                                              ? 'Modo mesero · desde dashboard'
                                              : 'Modo mesero · selección rápida',
                                          style: GoogleFonts.manrope(
                                            color: palette.onSurface,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    if (_isAssistedMode)
                                      const SizedBox(height: 10),
                                    Text(
                                      data.comercioNombre,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.manrope(
                                        color: palette.onSurface,
                                        fontSize: 31,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      _isAssistedMode
                                          ? 'Toca cualquier producto para sumarlo al pedido al instante.'
                                          : 'Explora el menú y arma tu pedido a tu ritmo.',
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.manrope(
                                        color: palette.onSurfaceMuted,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        SliverPersistentHeader(
                          pinned: true,
                          delegate: _MenuHeaderDelegate(
                            minExtentValue: _stickyHeaderExtent,
                            maxExtentValue: _stickyHeaderExtent,
                            palette: palette,
                            searchController: _searchController,
                            searchQuery: _searchQuery,
                            activeCategoryId: activeCategoryId,
                            categories: visibleSections,
                            onSearchChanged: (value) {
                              setState(() => _searchQuery = value);
                            },
                            onSelectCategory: _scrollToCategory,
                          ),
                        ),
                        ...<Widget>[
                          visibleSections.isEmpty
                              ? SliverPadding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    16,
                                    16,
                                    0,
                                  ),
                                  sliver: SliverToBoxAdapter(
                                    child: Container(
                                      padding: const EdgeInsets.all(24),
                                      decoration: BoxDecoration(
                                        color: palette.surface,
                                        borderRadius: BorderRadius.circular(22),
                                        border: Border.all(
                                          color: palette.primary.withValues(
                                            alpha: 0.22,
                                          ),
                                        ),
                                      ),
                                      child: Text(
                                        _searchQuery.trim().isEmpty
                                            ? 'No hay productos disponibles en este momento.'
                                            : 'No encontramos productos con ese término.',
                                        textAlign: TextAlign.center,
                                        style: GoogleFonts.manrope(
                                          color: palette.onSurface,
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                              : SliverPadding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    16,
                                    16,
                                    0,
                                  ),
                                  sliver: SliverList.builder(
                                    itemCount: visibleSections.length,
                                    itemBuilder: (context, index) {
                                      final section = visibleSections[index];
                                      final sectionKey = _categorySectionKeys
                                          .putIfAbsent(
                                            section.id,
                                            GlobalKey.new,
                                          );
                                      return Container(
                                        key: sectionKey,
                                        margin: EdgeInsets.only(
                                          bottom:
                                              index ==
                                                  visibleSections.length - 1
                                              ? 0
                                              : 22,
                                        ),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Padding(
                                              padding: const EdgeInsets.only(
                                                bottom: 12,
                                              ),
                                              child: Text(
                                                section.title,
                                                style: GoogleFonts.manrope(
                                                  color: palette.onSurface,
                                                  fontSize: 20,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                            ),
                                            ...section.products.map(
                                              (product) => _ModernProductTile(
                                                product: product,
                                                quantity:
                                                    _cart[product.id] ?? 0,
                                                tasaCambioPesos:
                                                    data.tasaCambioPesos,
                                                palette: palette,
                                                fallbackImageUrl:
                                                    data.comercioLogoUrl,
                                                assistedMode: _isAssistedMode,
                                                onAdd: () => _incrementProduct(
                                                  product.id,
                                                ),
                                                onRemove: () =>
                                                    _decrementProduct(
                                                      product.id,
                                                    ),
                                                onTap: _isAssistedMode
                                                    ? () => _handleQuickAdd(
                                                        product,
                                                      )
                                                    : null,
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    },
                                  ),
                                ),
                        ],
                        const SliverToBoxAdapter(child: SizedBox(height: 110)),
                      ],
                    ),
                  ),
                  if (cartItemCount > 0)
                    Positioned(
                      right: 16,
                      left: 16,
                      bottom: 16,
                      child: FilledButton.icon(
                        onPressed: () => _openOrderSheet(data),
                        style: FilledButton.styleFrom(
                          backgroundColor: palette.primary,
                          foregroundColor: palette.onPrimary,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                        icon: const Icon(Icons.shopping_bag_outlined),
                        label: Text(
                          'Ver Pedido ($cartItemCount - ${_formatUsd(cartTotalUsd)})',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _MenuHeaderDelegate extends SliverPersistentHeaderDelegate {
  _MenuHeaderDelegate({
    required this.minExtentValue,
    required this.maxExtentValue,
    required this.palette,
    required this.categories,
    required this.activeCategoryId,
    required this.searchController,
    required this.searchQuery,
    required this.onSearchChanged,
    required this.onSelectCategory,
  });

  final double minExtentValue;
  final double maxExtentValue;
  final _PublicMenuPalette palette;
  final List<_CategorySection> categories;
  final String? activeCategoryId;
  final TextEditingController searchController;
  final String searchQuery;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onSelectCategory;

  @override
  double get minExtent => minExtentValue;

  @override
  double get maxExtent => maxExtentValue;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: palette.surface.withValues(alpha: 0.97),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      child: Column(
        children: [
          TextField(
            controller: searchController,
            onChanged: onSearchChanged,
            style: GoogleFonts.manrope(
              color: palette.onSurface,
              fontWeight: FontWeight.w600,
            ),
            decoration: InputDecoration(
              hintText: 'Buscar producto...',
              hintStyle: GoogleFonts.manrope(
                color: palette.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
              prefixIcon: Icon(
                Icons.search_rounded,
                color: palette.onSurfaceMuted,
              ),
              filled: true,
              fillColor: palette.surface,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(
                  color: palette.primary.withValues(alpha: 0.25),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: palette.primary),
              ),
            ),
          ),
          const SizedBox(height: 10),
          _CategoryBar(
            categories: categories,
            activeCategoryId: activeCategoryId,
            palette: palette,
            onSelectCategory: onSelectCategory,
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _MenuHeaderDelegate oldDelegate) {
    return oldDelegate.palette != palette ||
        oldDelegate.categories != categories ||
        oldDelegate.activeCategoryId != activeCategoryId ||
        oldDelegate.searchQuery != searchQuery;
  }
}

class _CategoryBar extends StatelessWidget {
  const _CategoryBar({
    required this.categories,
    required this.activeCategoryId,
    required this.palette,
    required this.onSelectCategory,
  });

  final List<_CategorySection> categories;
  final String? activeCategoryId;
  final _PublicMenuPalette palette;
  final ValueChanged<String> onSelectCategory;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final category = categories[index];
          final selected = category.id == activeCategoryId;
          return GestureDetector(
            onTap: () => onSelectCategory(category.id),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: selected ? palette.primary : palette.surfaceAlt,
                borderRadius: BorderRadius.circular(999),
                boxShadow: selected
                    ? [
                        BoxShadow(
                          color: palette.primary.withValues(alpha: 0.28),
                          blurRadius: 18,
                          offset: const Offset(0, 8),
                        ),
                      ]
                    : const [],
              ),
              child: Text(
                category.title,
                style: GoogleFonts.manrope(
                  color: selected ? palette.onPrimary : palette.onSurface,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ModernProductTile extends StatelessWidget {
  const _ModernProductTile({
    required this.product,
    required this.quantity,
    required this.tasaCambioPesos,
    required this.palette,
    required this.fallbackImageUrl,
    required this.assistedMode,
    required this.onAdd,
    required this.onRemove,
    this.onTap,
  });

  final _PublicProduct product;
  final int quantity;
  final double tasaCambioPesos;
  final _PublicMenuPalette palette;
  final String? fallbackImageUrl;
  final bool assistedMode;
  final VoidCallback onAdd;
  final VoidCallback onRemove;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final totalCop = product.precio * tasaCambioPesos;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: palette.primary.withValues(alpha: 0.16)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(26),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (assistedMode)
                        Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: palette.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            'Toque rápido',
                            style: GoogleFonts.manrope(
                              color: palette.primary,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      Text(
                        product.nombre,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.manrope(
                          color: palette.onSurface,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (product.descripcion.trim().isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            product.descripcion,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.manrope(
                              color: palette.onSurfaceMuted,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              height: 1.3,
                            ),
                          ),
                        ),
                      if (product.hasAiImageInProgress) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: palette.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            product.aiImageStatus == 'processing'
                                ? 'Generando imagen del producto...'
                                : 'Imagen del producto en cola...',
                            style: GoogleFonts.manrope(
                              color: palette.primary,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      Text(
                        '\$${product.precio.toStringAsFixed(2)}',
                        style: GoogleFonts.manrope(
                          color: palette.primary,
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (tasaCambioPesos > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            '${totalCop.toStringAsFixed(0)} COP',
                            style: GoogleFonts.manrope(
                              color: palette.onSurfaceMuted,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      const SizedBox(height: 14),
                      quantity == 0
                          ? FilledButton.icon(
                              onPressed: onAdd,
                              style: FilledButton.styleFrom(
                                backgroundColor: palette.primary,
                                foregroundColor: palette.onPrimary,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 13,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              icon: const Icon(Icons.add_rounded, size: 18),
                              label: Text(
                                assistedMode
                                    ? 'Agregar al instante'
                                    : 'Agregar',
                                style: GoogleFonts.manrope(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            )
                          : Container(
                              decoration: BoxDecoration(
                                color: palette.surfaceAlt,
                                borderRadius: BorderRadius.circular(18),
                              ),
                              padding: const EdgeInsets.all(4),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    onPressed: onRemove,
                                    icon: const Icon(Icons.remove_rounded),
                                    color: palette.primary,
                                  ),
                                  SizedBox(
                                    width: 28,
                                    child: Text(
                                      '$quantity',
                                      textAlign: TextAlign.center,
                                      style: GoogleFonts.manrope(
                                        color: palette.onSurface,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: onAdd,
                                    icon: const Icon(Icons.add_rounded),
                                    color: palette.primary,
                                  ),
                                ],
                              ),
                            ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                _ProductTileVisual(
                  productImageUrl: product.imageUrl,
                  fallbackImageUrl: fallbackImageUrl,
                  aiImageStatus: product.aiImageStatus,
                  isAiGeneratedImage: product.isAiGeneratedImage,
                  surfaceAlt: palette.surfaceAlt,
                  muted: palette.onSurfaceMuted,
                  defaultAssetPath: _PublicMenuViewState._defaultBrandLogoAsset,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PublicMenuData {
  const _PublicMenuData({
    required this.comercioId,
    required this.comercioNombre,
    required this.comercioLogoUrl,
    required this.whatsappNumber,
    required this.allowsDelivery,
    required this.comercioAddress,
    required this.businessLatitude,
    required this.businessLongitude,
    required this.tasaCambioPesos,
    required this.palette,
    required this.categories,
    required this.products,
  });

  final String comercioId;
  final String comercioNombre;
  final String? comercioLogoUrl;
  final String? whatsappNumber;
  final bool allowsDelivery;
  final String comercioAddress;
  final double? businessLatitude;
  final double? businessLongitude;
  final double tasaCambioPesos;
  final _PublicMenuPalette palette;
  final List<_PublicCategory> categories;
  final List<_PublicProduct> products;
}

class _CategorySection {
  const _CategorySection({
    required this.id,
    required this.title,
    required this.products,
  });

  final String id;
  final String title;
  final List<_PublicProduct> products;
}

class _DeliveryMapPick {
  const _DeliveryMapPick({
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  final String address;
  final double latitude;
  final double longitude;
}

class _ProductTileVisual extends StatelessWidget {
  const _ProductTileVisual({
    required this.productImageUrl,
    required this.fallbackImageUrl,
    required this.aiImageStatus,
    required this.isAiGeneratedImage,
    required this.surfaceAlt,
    required this.muted,
    required this.defaultAssetPath,
  });

  final String? productImageUrl;
  final String? fallbackImageUrl;
  final String aiImageStatus;
  final bool isAiGeneratedImage;
  final Color surfaceAlt;
  final Color muted;
  final String defaultAssetPath;

  @override
  Widget build(BuildContext context) {
    final productUrl = productImageUrl?.trim() ?? '';
    final businessLogoUrl = fallbackImageUrl?.trim() ?? '';
    final isAiPending =
        aiImageStatus == 'pending' || aiImageStatus == 'processing';
    final overlayIcon = isAiPending
        ? null
        : isAiGeneratedImage
        ? Icons.auto_awesome_rounded
        : null;

    return Container(
      width: 118,
      height: 118,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned.fill(
            child: productUrl.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: productUrl,
                    fit: BoxFit.cover,
                    fadeInDuration: const Duration(milliseconds: 180),
                    placeholder: (context, url) => _buildLoadingState(),
                    errorWidget: (context, url, error) {
                      return _buildLogoOrDefault(businessLogoUrl);
                    },
                  )
                : _buildLogoOrDefault(businessLogoUrl),
          ),
          if (isAiPending || overlayIcon != null)
            Positioned(
              right: 8,
              bottom: 8,
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.6),
                  shape: BoxShape.circle,
                ),
                child: isAiPending
                    ? const Padding(
                        padding: EdgeInsets.all(5),
                        child: CircularProgressIndicator(strokeWidth: 1.8),
                      )
                    : Icon(overlayIcon, size: 13, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildLogoOrDefault(String businessLogoUrl) {
    if (businessLogoUrl.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: businessLogoUrl,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 180),
        placeholder: (context, url) => _buildLoadingState(),
        errorWidget: (context, url, error) => _buildDefaultLogo(),
      );
    }

    return _buildDefaultLogo();
  }

  Widget _buildLoadingState() {
    return Container(
      color: surfaceAlt,
      alignment: Alignment.center,
      child: SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.2,
          valueColor: AlwaysStoppedAnimation<Color>(muted),
        ),
      ),
    );
  }

  Widget _buildDefaultLogo() {
    return Container(
      color: surfaceAlt,
      alignment: Alignment.center,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Image.asset(
          defaultAssetPath,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) =>
              Icon(Icons.storefront_rounded, size: 48, color: muted),
        ),
      ),
    );
  }
}

class _PublicMenuPalette {
  const _PublicMenuPalette({
    required this.surfaceStart,
    required this.surfaceEnd,
    required this.surface,
    required this.surfaceAlt,
    required this.primary,
    required this.onPrimary,
    required this.onSurface,
    required this.onSurfaceMuted,
  });

  final Color surfaceStart;
  final Color surfaceEnd;
  final Color surface;
  final Color surfaceAlt;
  final Color primary;
  final Color onPrimary;
  final Color onSurface;
  final Color onSurfaceMuted;

  static _PublicMenuPalette fromMenuPalette(
    String? rawPalette, {
    int? primaryArgb,
    int? accentArgb,
    int? surfaceArgb,
    int? textArgb,
  }) {
    if (primaryArgb != null && surfaceArgb != null && textArgb != null) {
      final primary = ColorArgbCodec.toColor(primaryArgb);
      final accent = ColorArgbCodec.toColor(accentArgb ?? primaryArgb);
      final surface = ColorArgbCodec.toColor(surfaceArgb);
      final onSurface = ColorArgbCodec.toColor(textArgb);
      final onPrimary = primary.computeLuminance() > 0.5
          ? const Color(0xFF1F2937)
          : Colors.white;
      return _PublicMenuPalette(
        surfaceStart: Color.lerp(surface, primary, 0.24) ?? surface,
        surfaceEnd: Color.lerp(surface, accent, 0.16) ?? surface,
        surface: Color.lerp(surface, Colors.white, 0.08) ?? surface,
        surfaceAlt: Color.lerp(surface, Colors.white, 0.16) ?? surface,
        primary: primary,
        onPrimary: onPrimary,
        onSurface: onSurface,
        onSurfaceMuted: onSurface.withValues(alpha: 0.78),
      );
    }

    switch ((rawPalette ?? '').trim().toLowerCase()) {
      case 'uva':
        return const _PublicMenuPalette(
          surfaceStart: Color(0xFF2B1455),
          surfaceEnd: Color(0xFF1A1030),
          surface: Color(0xFF2A174C),
          surfaceAlt: Color(0xFF3A2366),
          primary: Color(0xFF8B5CF6),
          onPrimary: Color(0xFF1A1030),
          onSurface: Color(0xFFF5F3FF),
          onSurfaceMuted: Color(0xFFD6CCF5),
        );
      case 'cafe':
        return const _PublicMenuPalette(
          surfaceStart: Color(0xFF332015),
          surfaceEnd: Color(0xFF1E150F),
          surface: Color(0xFF2E2018),
          surfaceAlt: Color(0xFF3B2A1F),
          primary: Color(0xFFF59E0B),
          onPrimary: Color(0xFF2B1708),
          onSurface: Color(0xFFFFF7ED),
          onSurfaceMuted: Color(0xFFF2D7B0),
        );
      case 'oliva':
        return const _PublicMenuPalette(
          surfaceStart: Color(0xFF203019),
          surfaceEnd: Color(0xFF152114),
          surface: Color(0xFF1C2A17),
          surfaceAlt: Color(0xFF273720),
          primary: Color(0xFFA3E635),
          onPrimary: Color(0xFF22330F),
          onSurface: Color(0xFFF7FEE7),
          onSurfaceMuted: Color(0xFFDCE8BE),
        );
      case 'oceano':
        return const _PublicMenuPalette(
          surfaceStart: Color(0xFF12314A),
          surfaceEnd: Color(0xFF0F2233),
          surface: Color(0xFF183349),
          surfaceAlt: Color(0xFF22435E),
          primary: Color(0xFF38BDF8),
          onPrimary: Color(0xFF062033),
          onSurface: Color(0xFFEFF9FF),
          onSurfaceMuted: Color(0xFFBCD9EE),
        );
      default:
        return const _PublicMenuPalette(
          surfaceStart: Color(0xFF2B1C11),
          surfaceEnd: Color(0xFF1B140E),
          surface: Color(0xFF241A13),
          surfaceAlt: Color(0xFF33251C),
          primary: Color(0xFFD65A1F),
          onPrimary: Colors.white,
          onSurface: Color(0xFFFFEACC),
          onSurfaceMuted: Color(0xFFD3BEA0),
        );
    }
  }
}

class _PublicCategory {
  const _PublicCategory({required this.id, required this.nombre});

  final String id;
  final String nombre;

  factory _PublicCategory.fromMap(Map<String, dynamic> map) {
    return _PublicCategory(
      id: map['id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? 'Categoria',
    );
  }
}

class _PublicProduct {
  const _PublicProduct({
    required this.id,
    required this.categoryId,
    required this.nombre,
    required this.descripcion,
    required this.precio,
    this.imageUrl,
    this.imageSourceType = 'manual',
    this.aiImageStatus = 'none',
    this.aiImageErrorMessage,
  });

  final String id;
  final String categoryId;
  final String nombre;
  final String descripcion;
  final double precio;
  final String? imageUrl;
  final String imageSourceType;
  final String aiImageStatus;
  final String? aiImageErrorMessage;

  bool get hasAiImageInProgress =>
      aiImageStatus == 'pending' || aiImageStatus == 'processing';

  bool get isAiGeneratedImage => imageSourceType == 'ai_generated';

  factory _PublicProduct.fromMap(Map<String, dynamic> map) {
    return _PublicProduct(
      id: map['id']?.toString() ?? '',
      categoryId: map['categoria_id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? 'Producto',
      descripcion: map['descripcion']?.toString() ?? '',
      precio: _parsePrice(map['precio']),
      imageUrl: _resolveImageUrl(map),
      imageSourceType: map['imagen_source_type']?.toString() ?? 'manual',
      aiImageStatus: map['ai_image_status']?.toString() ?? 'none',
      aiImageErrorMessage: map['ai_image_error_message']?.toString(),
    );
  }

  static double _parsePrice(dynamic value) {
    if (value is num) return value.toDouble();

    final normalized = '$value'.trim();
    if (normalized.isEmpty) return 0.0;

    return double.tryParse(normalized.replaceAll(',', '.')) ?? 0.0;
  }

  static String? _resolveImageUrl(Map<String, dynamic> map) {
    const candidates = [
      'imagen_url',
      'image_url',
      'foto_url',
      'imagen',
      'foto',
    ];

    for (final key in candidates) {
      final value = _normalizeImageUrl(map[key]);
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }

    return null;
  }

  static String? _normalizeImageUrl(dynamic value) {
    if (value == null) {
      return null;
    }

    if (value is Map) {
      final nested = value['data'];
      if (nested is Map && nested['publicUrl'] != null) {
        final url = nested['publicUrl'].toString().trim();
        return url.isEmpty ? null : url;
      }
      final direct = value['publicUrl']?.toString().trim() ?? '';
      return direct.isEmpty ? null : direct;
    }

    final raw = value.toString().trim();
    if (raw.isEmpty) {
      return null;
    }

    final publicUrlMatch = RegExp(
      r'"publicUrl"\s*:\s*"([^"]+)"',
    ).firstMatch(raw);
    if (publicUrlMatch != null) {
      final url = publicUrlMatch.group(1)?.trim() ?? '';
      return url.isEmpty ? null : url;
    }

    return raw;
  }
}

class _CartLine {
  const _CartLine({required this.product, required this.quantity});

  final _PublicProduct product;
  final int quantity;

  double get lineTotalUsd => quantity * product.precio;
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.labelColor,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? labelColor;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.manrope(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: labelColor ?? const Color(0xFF775B4E),
            ),
          ),
        ),
        Text(
          value,
          style: GoogleFonts.manrope(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: valueColor ?? const Color(0xFF24160F),
          ),
        ),
      ],
    );
  }
}
