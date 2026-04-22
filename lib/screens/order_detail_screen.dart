import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({
    super.key,
    required this.orderId,
    this.readOnlyView = false,
  });

  final String orderId;
  final bool readOnlyView;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen>
    with SingleTickerProviderStateMixin {
  static const Duration _rememberDeviceTtl = Duration(hours: 24);
  static const String _fallbackBusinessLogoAsset =
      'assets/branding/logotipo.png';
  static const Color _businessMarkerHeadColor = Color(0xFF8B5CF6);
  static const Color _businessMarkerStemColor = Color(0xFF9CA3AF);
  static const Color _deliveryFlagColor = Color(0xFF7C3AED);
  static const Color _deliveryFlagPoleColor = Color(0xFF94A3B8);
  static const Color _routeArcColor = Color(0xFF8B5CF6);

  late Future<_OrderViewData?> _orderFuture;
  late final AnimationController _successController;
  final TextEditingController _emailController = TextEditingController();
  bool _isUpdatingStatus = false;
  bool _showSuccessOverlay = false;
  bool _rememberDevice = false;
  bool _emailVerified = false;
  bool _checkingTrustedDevice = false;
  bool _trustRestoreRequested = false;
  bool _showTopBar = false;
  String? _pendingStatus;
  String? _overlayStatus;
  String? _verificationError;
  bool _loadingMarkerIcons = false;
  String? _markerIconsKey;
  BitmapDescriptor? _businessMarkerIcon;
  BitmapDescriptor? _deliveryMarkerIcon;
  bool _isMapInteractionEnabled = false;

  @override
  void initState() {
    super.initState();
    _orderFuture = _fetchOrder();
    _successController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _successController.dispose();
    super.dispose();
  }

  Future<_OrderViewData?> _fetchOrder() async {
    final client = Supabase.instance.client;
    final comercioId = _extractComercioId(widget.orderId);

    dynamic query = client.from('pedidos').select('*');

    if (comercioId != null) {
      query = query.eq('comercio_id', comercioId);
    }

    final pedidosRows = await query
        .order('created_at', ascending: false)
        .limit(200);
    final response = (data: pedidosRows as List<dynamic>);
    debugPrint('DEBUG: JSON CRUDO DE SUPABASE: ${response.data}');

    PedidoModel? foundPedido;
    Map<String, dynamic>? foundPedidoRaw;
    for (final row in response.data) {
      final rawMap = Map<String, dynamic>.from(row as Map);
      final pedido = PedidoModel.fromMap(rawMap);
      if (pedido.orderId == widget.orderId) {
        foundPedido = pedido;
        foundPedidoRaw = rawMap;
        break;
      }
    }

    if (foundPedido == null) return null;

    debugPrint(
      'DEBUG: Pedido Coords: ${foundPedido.deliveryLatitude}, ${foundPedido.deliveryLongitude}',
    );
    if (foundPedido.deliveryLatitude == null ||
        foundPedido.deliveryLongitude == null) {
      debugPrint('DEBUG: JSON Crudo de Supabase: $foundPedidoRaw');
    }

    String comercioNombre = 'Kosmenu';
    double? businessLatitude;
    double? businessLongitude;
    String? businessLogoUrl;
    if (foundPedido.comercioId.isNotEmpty) {
      final comercioRow = await client
          .from('comercios')
          .select('*')
          .eq('id', foundPedido.comercioId)
          .maybeSingle();

      final comercioMap = _asMap(comercioRow);
      final nombre = comercioMap['nombre']?.toString().trim() ?? '';
      if (nombre.isNotEmpty) {
        comercioNombre = nombre;
      }
      businessLatitude = _toDoubleOrNull(comercioMap['latitud']);
      businessLongitude = _toDoubleOrNull(comercioMap['longitud']);
      businessLogoUrl = _resolveComercioLogoUrl(comercioMap);
    }

    return _OrderViewData(
      pedido: foundPedido,
      comercioNombre: comercioNombre,
      businessLatitude: businessLatitude,
      businessLongitude: businessLongitude,
      businessLogoUrl: businessLogoUrl,
      history: _buildOrderHistory(
        pedidosRows,
        currentOrderId: widget.orderId,
        email: foundPedido.clienteEmail,
      ),
    );
  }

  List<_HistoryOrderViewData> _buildOrderHistory(
    List<dynamic> rows, {
    required String currentOrderId,
    required String? email,
  }) {
    final normalizedEmail = _normalizeEmail(email);
    if (normalizedEmail.isEmpty) {
      return const <_HistoryOrderViewData>[];
    }

    return rows
        .map(
          (row) => PedidoModel.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .where(
          (pedido) => _normalizeEmail(pedido.clienteEmail) == normalizedEmail,
        )
        .where((pedido) => (pedido.orderId ?? '').trim().isNotEmpty)
        .where((pedido) => (pedido.orderId ?? '').trim() != currentOrderId)
        .take(8)
        .map(
          (pedido) => _HistoryOrderViewData(
            orderId: (pedido.orderId ?? '').trim(),
            estado: pedido.estado?.trim().isNotEmpty == true
                ? pedido.estado!.trim()
                : 'pendiente',
            total: pedido.total ?? 0,
          ),
        )
        .toList();
  }

  String _normalizeEmail(String? value) => (value ?? '').trim().toLowerCase();

  String _maskEmail(String? email) {
    final normalized = _normalizeEmail(email);
    final parts = normalized.split('@');
    if (parts.length != 2 || parts.first.isEmpty || parts.last.isEmpty) {
      return 'correo registrado';
    }

    final localPart = parts.first;
    final visible = localPart.substring(0, localPart.length >= 2 ? 2 : 1);
    final hiddenCount = localPart.length - visible.length > 6
        ? localPart.length - visible.length
        : 6;
    return '$visible${'*' * hiddenCount}@${parts.last}';
  }

  String _trustKey(String comercioId, String email) {
    return 'order_access:${comercioId.trim()}:${_normalizeEmail(email)}';
  }

  Future<void> _restoreTrustedAccess(_OrderViewData? data) async {
    if (!widget.readOnlyView || data == null) {
      return;
    }

    final normalizedEmail = _normalizeEmail(data.pedido.clienteEmail);
    if (normalizedEmail.isEmpty) {
      if (mounted) {
        setState(() => _emailVerified = true);
      }
      return;
    }

    if (mounted) {
      setState(() => _checkingTrustedDevice = true);
    }

    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(
      _trustKey(data.pedido.comercioId, normalizedEmail),
    );
    final expiresAt = int.tryParse(raw ?? '');
    final isValid =
        expiresAt != null && expiresAt > DateTime.now().millisecondsSinceEpoch;

    if (!isValid && raw != null) {
      await prefs.remove(_trustKey(data.pedido.comercioId, normalizedEmail));
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _checkingTrustedDevice = false;
      _emailVerified = isValid;
      _trustRestoreRequested = true;
    });
  }

  Future<void> _verifyCustomerEmail(_OrderViewData data) async {
    final expectedEmail = _normalizeEmail(data.pedido.clienteEmail);
    if (expectedEmail.isEmpty) {
      setState(() {
        _verificationError = null;
        _emailVerified = true;
      });
      return;
    }

    if (_normalizeEmail(_emailController.text) != expectedEmail) {
      setState(() {
        _verificationError = 'El correo no coincide con este pedido.';
      });
      return;
    }

    if (_rememberDevice) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _trustKey(data.pedido.comercioId, expectedEmail),
        (DateTime.now().millisecondsSinceEpoch +
                _rememberDeviceTtl.inMilliseconds)
            .toString(),
      );
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _verificationError = null;
      _emailVerified = true;
    });
  }

  Future<void> _updateOrderStatus(String nextStatus) async {
    if (_isUpdatingStatus) return;

    final normalizedStatus = _normalizeStatusValue(nextStatus);
    setState(() {
      _isUpdatingStatus = true;
      _pendingStatus = normalizedStatus;
    });

    try {
      var updatedRows = await Supabase.instance.client
          .from('pedidos')
          .update({'estado': normalizedStatus})
          .contains('detalles', {'order_id': widget.orderId})
          .select('*')
          .limit(1);

      if ((updatedRows as List).isEmpty) {
        updatedRows = await Supabase.instance.client
            .from('pedidos')
            .update({'estado': normalizedStatus})
            .contains('detalles', {'codigo_orden': widget.orderId})
            .select('*')
            .limit(1);
      }

      if (!mounted) return;

      if ((updatedRows as List).isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo actualizar el pedido.')),
        );
        return;
      }

      setState(() {
        _orderFuture = _fetchOrder();
        _overlayStatus = normalizedStatus;
      });

      await _playSuccessOverlay();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Pedido marcado como ${_statusLabel(normalizedStatus).toLowerCase()}.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al actualizar pedido: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isUpdatingStatus = false;
          _pendingStatus = null;
        });
      }
    }
  }

  Future<bool> _confirmCancelOrder() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Cancelar pedido'),
          content: const Text(
            'Esta accion cancelara el pedido y no se puede deshacer. Deseas continuar?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Volver'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFE11D48),
                foregroundColor: Colors.white,
              ),
              child: const Text('Si, cancelar'),
            ),
          ],
        );
      },
    );

    return confirmed ?? false;
  }

  Future<void> _playSuccessOverlay() async {
    setState(() => _showSuccessOverlay = true);
    await _successController.forward(from: 0);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    setState(() => _showSuccessOverlay = false);
    _successController.reset();
  }

  Future<void> _openCustomerWhatsapp(
    String phone,
    String comercioNombre,
  ) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El pedido no tiene un WhatsApp valido.')),
      );
      return;
    }

    final text = Uri.encodeComponent(
      'Hola, te escribimos desde $comercioNombre por tu pedido ${widget.orderId}.',
    );
    final uri = Uri.parse('https://wa.me/$digits?text=$text');
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);

    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir WhatsApp.')),
      );
    }
  }

  Future<void> _openCustomerCall(String phone) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El pedido no tiene un telefono valido.')),
      );
      return;
    }

    final uri = Uri.parse('tel:$digits');
    final launched = await launchUrl(uri);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir la llamada.')),
      );
    }
  }

  Future<void> _openCustomerEmail(String email, String comercioNombre) async {
    final normalizedEmail = email.trim();
    if (normalizedEmail.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El pedido no tiene correo registrado.')),
      );
      return;
    }

    final subject = Uri.encodeComponent('Consulta de pedido ${widget.orderId}');
    final body = Uri.encodeComponent(
      'Hola, te escribimos desde $comercioNombre por tu pedido ${widget.orderId}.',
    );
    final uri = Uri.parse(
      'mailto:$normalizedEmail?subject=$subject&body=$body',
    );

    final launched = await launchUrl(uri);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir la app de correo.')),
      );
    }
  }

  String _normalizeStatusValue(String? estado) {
    final raw = (estado ?? '').trim().toLowerCase();
    if (raw.isEmpty) return 'pendiente';
    if (raw == 'confirmado' || raw == 'aceptado') return 'confirmado';
    if (raw == 'preparando' ||
        raw == 'preparacion' ||
        raw == 'preparación' ||
        raw == 'en_proceso' ||
        raw == 'en proceso' ||
        raw == 'listo') {
      return 'preparando';
    }
    if (raw == 'en_camino' || raw == 'en camino' || raw == 'despachado') {
      return 'en_camino';
    }
    if (raw == 'entregado' || raw == 'completado' || raw == 'finalizado') {
      return 'entregado';
    }
    if (raw == 'cancelado' || raw == 'anulado' || raw == 'rechazado') {
      return 'cancelado';
    }
    return 'pendiente';
  }

  List<_OrderStatusAction> _buildStatusActions({
    required bool isDelivery,
    required String currentStatus,
  }) {
    switch (currentStatus) {
      case 'pendiente':
        return const <_OrderStatusAction>[
          _OrderStatusAction(
            status: 'confirmado',
            label: 'Confirmar pedido',
            icon: Icons.thumb_up_alt_outlined,
            color: Color(0xFF2563EB),
          ),
          _OrderStatusAction(
            status: 'cancelado',
            label: 'Cancelar pedido',
            icon: Icons.cancel_rounded,
            color: Color(0xFFE11D48),
          ),
        ];
      case 'confirmado':
        return const <_OrderStatusAction>[
          _OrderStatusAction(
            status: 'preparando',
            label: 'Iniciar preparacion',
            icon: Icons.restaurant_rounded,
            color: Color(0xFFF59E0B),
          ),
          _OrderStatusAction(
            status: 'cancelado',
            label: 'Cancelar pedido',
            icon: Icons.cancel_rounded,
            color: Color(0xFFE11D48),
          ),
        ];
      case 'preparando':
        if (isDelivery) {
          return const <_OrderStatusAction>[
            _OrderStatusAction(
              status: 'en_camino',
              label: 'Marcar en camino',
              icon: Icons.delivery_dining_rounded,
              color: Color(0xFF0EA5E9),
            ),
            _OrderStatusAction(
              status: 'cancelado',
              label: 'Cancelar pedido',
              icon: Icons.cancel_rounded,
              color: Color(0xFFE11D48),
            ),
          ];
        }
        return const <_OrderStatusAction>[
          _OrderStatusAction(
            status: 'entregado',
            label: 'Marcar retirado',
            icon: Icons.check_circle_rounded,
            color: Color(0xFF16A34A),
          ),
          _OrderStatusAction(
            status: 'cancelado',
            label: 'Cancelar pedido',
            icon: Icons.cancel_rounded,
            color: Color(0xFFE11D48),
          ),
        ];
      case 'en_camino':
        return const <_OrderStatusAction>[
          _OrderStatusAction(
            status: 'entregado',
            label: 'Marcar entregado',
            icon: Icons.check_circle_rounded,
            color: Color(0xFF16A34A),
          ),
          _OrderStatusAction(
            status: 'cancelado',
            label: 'Cancelar pedido',
            icon: Icons.cancel_rounded,
            color: Color(0xFFE11D48),
          ),
        ];
      case 'entregado':
      case 'cancelado':
        return const <_OrderStatusAction>[];
      default:
        return const <_OrderStatusAction>[
          _OrderStatusAction(
            status: 'confirmado',
            label: 'Confirmar pedido',
            icon: Icons.thumb_up_alt_outlined,
            color: Color(0xFF2563EB),
          ),
          _OrderStatusAction(
            status: 'cancelado',
            label: 'Cancelar pedido',
            icon: Icons.cancel_rounded,
            color: Color(0xFFE11D48),
          ),
        ];
    }
  }

  String? _extractComercioId(String orderId) {
    final match = RegExp(r'^(.*)-(\d{10,})$').firstMatch(orderId);
    return match?.group(1);
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
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

  double? _toDoubleOrNull(dynamic value) {
    if (value is num) return value.toDouble();
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return null;
    return double.tryParse(raw.replaceAll(',', '.'));
  }

  LatLng _midpoint(LatLng a, LatLng b) {
    return LatLng(
      (a.latitude + b.latitude) / 2,
      (a.longitude + b.longitude) / 2,
    );
  }

  LatLngBounds _buildBounds(List<LatLng> points) {
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;

    for (final point in points.skip(1)) {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    }

    final latPadding = (maxLat - minLat).abs() < 0.0008 ? 0.0012 : 0.0;
    final lngPadding = (maxLng - minLng).abs() < 0.0008 ? 0.0012 : 0.0;

    return LatLngBounds(
      southwest: LatLng(minLat - latPadding, minLng - lngPadding),
      northeast: LatLng(maxLat + latPadding, maxLng + lngPadding),
    );
  }

  List<LatLng> _generateArcPath({
    required LatLng origin,
    required LatLng destination,
    int pointCount = 100,
    double lateralOffset = 0.02,
  }) {
    if (pointCount < 2) {
      return <LatLng>[origin, destination];
    }

    final control = _buildPerpendicularArcControlPoint(
      origin: origin,
      destination: destination,
      lateralOffset: lateralOffset,
    );

    final points = <LatLng>[];
    for (var i = 0; i < pointCount; i++) {
      final t = i / (pointCount - 1);
      final oneMinusT = 1 - t;
      final lat =
          (oneMinusT * oneMinusT * origin.latitude) +
          (2 * oneMinusT * t * control.latitude) +
          (t * t * destination.latitude);
      final lng =
          (oneMinusT * oneMinusT * origin.longitude) +
          (2 * oneMinusT * t * control.longitude) +
          (t * t * destination.longitude);
      points.add(LatLng(lat, lng));
    }

    return points;
  }

  LatLng _buildPerpendicularArcControlPoint({
    required LatLng origin,
    required LatLng destination,
    double lateralOffset = 0.02,
  }) {
    final mid = _midpoint(origin, destination);
    final deltaLng = destination.longitude - origin.longitude;
    final deltaLat = destination.latitude - origin.latitude;
    final length = math.sqrt((deltaLng * deltaLng) + (deltaLat * deltaLat));

    if (length == 0) {
      return mid;
    }

    final unitPerpLat = deltaLng / length;
    final unitPerpLng = -deltaLat / length;

    return LatLng(
      mid.latitude + (unitPerpLat * lateralOffset),
      mid.longitude + (unitPerpLng * lateralOffset),
    );
  }

  Future<void> _openExternalGoogleMapsNavigation({
    required LatLng origin,
    required LatLng destination,
  }) async {
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1'
      '&origin=${origin.latitude},${origin.longitude}'
      '&destination=${destination.latitude},${destination.longitude}'
      '&travelmode=driving',
    );

    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir Google Maps.')),
      );
    }
  }

  String _formatAmount(double value) {
    final isWhole = value == value.roundToDouble();
    return isWhole
        ? '\$${value.toStringAsFixed(0)}'
        : '\$${value.toStringAsFixed(2)}';
  }

  String _statusLabel(String? estado) {
    switch (_normalizeStatusValue(estado)) {
      case 'confirmado':
        return 'Confirmado';
      case 'preparando':
        return 'Preparando';
      case 'en_camino':
        return 'En camino';
      case 'entregado':
        return 'Entregado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return 'Pendiente';
    }
  }

  Color _statusColor(String? estado) {
    switch (_normalizeStatusValue(estado)) {
      case 'confirmado':
        return const Color(0xFF2563EB);
      case 'preparando':
        return const Color(0xFFF59E0B);
      case 'en_camino':
        return const Color(0xFF0EA5E9);
      case 'entregado':
        return const Color(0xFF27C46B);
      case 'cancelado':
        return const Color(0xFFE3645B);
      default:
        return const Color(0xFFD7A74D);
    }
  }

  String _deliveryModeLabel(String? mode) {
    switch ((mode ?? '').trim().toLowerCase()) {
      case 'delivery':
        return 'Delivery';
      case 'pickup':
        return 'Retiro en tienda';
      default:
        return 'Sin especificar';
    }
  }

  String _paymentMethodHint(String? method) {
    final normalized = (method ?? '').trim().toLowerCase();
    if (normalized.contains('pago movil')) {
      return 'Recibido por Pago Movil. Verifica referencia y banco antes de marcar entregado.';
    }
    if (normalized.contains('zelle')) {
      return 'Pago por Zelle. Confirma titular/memo y monto en USD.';
    }
    if (normalized.contains('efectivo')) {
      return 'Pago en efectivo al entregar o retirar. Confirma vuelto si aplica.';
    }
    if ((method ?? '').trim().isEmpty) {
      return 'El cliente no especifico metodo de pago en el checkout.';
    }
    return 'Metodo de pago seleccionado por el cliente.';
  }

  Future<void> _prepareMarkerIconsIfNeeded({String? businessLogoUrl}) async {
    final normalizedLogoUrl = (businessLogoUrl ?? '').trim();
    final key = normalizedLogoUrl;

    if (_markerIconsKey == key &&
        _businessMarkerIcon != null &&
        _deliveryMarkerIcon != null) {
      return;
    }

    if (_loadingMarkerIcons && _markerIconsKey == key) {
      return;
    }

    _loadingMarkerIcons = true;
    _markerIconsKey = key;

    try {
      final businessIcon = await _buildBusinessMarkerIcon(
        businessLogoUrl: normalizedLogoUrl,
      );
      final deliveryIcon = await _buildDeliveryMarkerIcon();

      if (!mounted || _markerIconsKey != key) {
        return;
      }

      setState(() {
        _businessMarkerIcon = businessIcon;
        _deliveryMarkerIcon = deliveryIcon;
      });
    } catch (_) {
      // If custom generation fails, map falls back to default marker hues.
    } finally {
      if (_markerIconsKey == key) {
        _loadingMarkerIcons = false;
      }
    }
  }

  Future<BitmapDescriptor> _buildBusinessMarkerIcon({
    required String businessLogoUrl,
  }) async {
    final logoBytes = await _resolveBusinessLogoBytes(businessLogoUrl);
    if (logoBytes == null) {
      return BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange);
    }

    final logo = await _decodeUiImage(logoBytes, size: 116);
    if (logo == null) {
      return BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange);
    }

    return _buildPinMarkerIcon(
      headColor: _businessMarkerHeadColor,
      stemColor: _businessMarkerStemColor,
      logo: logo,
    );
  }

  Future<BitmapDescriptor> _buildDeliveryMarkerIcon() async {
    return _buildFlagMarkerIcon(
      flagColor: _deliveryFlagColor,
      poleColor: _deliveryFlagPoleColor,
    );
  }

  Future<BitmapDescriptor> _buildPinMarkerIcon({
    required Color headColor,
    required Color stemColor,
    ui.Image? logo,
    IconData? iconData,
    Color iconColor = Colors.black,
  }) async {
    const double width = 64;
    const double height = 82;
    const Offset center = Offset(width / 2, 22);
    const double headRadius = 16;
    const double borderWidth = 2;
    const double stemWidth = 4;
    const double stemTop = 38;
    const double stemBottom = 70;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    final shadowPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.14)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawOval(
      Rect.fromCenter(
        center: const Offset(width / 2, 76),
        width: 14,
        height: 5,
      ),
      shadowPaint,
    );

    final stemPaint = Paint()..color = stemColor;
    final stemBorderPaint = Paint()
      ..color = stemColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = borderWidth;
    final headPaint = Paint()..color = headColor;
    final headBorderPaint = Paint()
      ..color = headColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = borderWidth;

    final stemRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        center.dx - (stemWidth / 2),
        stemTop,
        stemWidth,
        stemBottom - stemTop,
      ),
      const Radius.circular(3),
    );
    canvas.drawRRect(stemRect, stemPaint);
    canvas.drawRRect(stemRect, stemBorderPaint);

    canvas.drawCircle(center, headRadius, headPaint);
    canvas.drawCircle(center, headRadius, headBorderPaint);

    final contentRect = Rect.fromCircle(center: center, radius: 12);
    final clipPath = Path()..addOval(contentRect);
    canvas.save();
    canvas.clipPath(clipPath);
    if (logo != null) {
      paintImage(
        canvas: canvas,
        rect: contentRect,
        image: logo,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.high,
      );
    } else {
      canvas.drawCircle(center, 13.5, Paint()..color = headColor);
    }
    canvas.restore();

    if (iconData != null) {
      final textPainter = TextPainter(
        textDirection: TextDirection.ltr,
        text: TextSpan(
          text: String.fromCharCode(iconData.codePoint),
          style: TextStyle(
            fontSize: 15,
            color: iconColor,
            fontFamily: iconData.fontFamily,
            package: iconData.fontPackage,
          ),
        ),
      )..layout();

      final offset = Offset(
        center.dx - (textPainter.width / 2),
        center.dy - (textPainter.height / 2),
      );
      textPainter.paint(canvas, offset);
    }

    final image = await recorder.endRecording().toImage(
      width.toInt(),
      height.toInt(),
    );
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<BitmapDescriptor> _buildFlagMarkerIcon({
    required Color flagColor,
    required Color poleColor,
  }) async {
    const double width = 52;
    const double height = 72;
    const double poleWidth = 4;
    const double poleTop = 14;
    const double poleBottom = 62;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    final shadowPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.12)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);
    canvas.drawOval(
      Rect.fromCenter(
        center: const Offset(width / 2, 67),
        width: 12,
        height: 4,
      ),
      shadowPaint,
    );

    final poleRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        (width / 2) - (poleWidth / 2),
        poleTop,
        poleWidth,
        poleBottom - poleTop,
      ),
      const Radius.circular(2),
    );
    final polePaint = Paint()..color = poleColor;
    canvas.drawRRect(poleRect, polePaint);

    final flagPath = Path()
      ..moveTo((width / 2) + 1, 16)
      ..quadraticBezierTo(34, 13, 42, 18)
      ..quadraticBezierTo(37, 24, 42, 30)
      ..quadraticBezierTo(32, 26, (width / 2) + 1, 30)
      ..close();
    final flagPaint = Paint()..color = flagColor;
    canvas.drawPath(flagPath, flagPaint);

    final image = await recorder.endRecording().toImage(
      width.toInt(),
      height.toInt(),
    );
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<ui.Image?> _decodeUiImage(Uint8List bytes, {int size = 116}) async {
    try {
      final codec = await ui.instantiateImageCodec(
        bytes,
        targetWidth: size,
        targetHeight: size,
      );
      final frame = await codec.getNextFrame();
      return frame.image;
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List?> _resolveBusinessLogoBytes(String businessLogoUrl) async {
    if (businessLogoUrl.isNotEmpty) {
      final downloaded = await _downloadBytes(businessLogoUrl);
      if (downloaded != null && downloaded.isNotEmpty) {
        return downloaded;
      }
    }

    try {
      final data = await rootBundle.load(_fallbackBusinessLogoAsset);
      return data.buffer.asUint8List();
    } catch (_) {
      return null;
    }
  }

  Future<Uint8List?> _downloadBytes(String url) async {
    try {
      final uri = Uri.tryParse(url);
      if (uri == null || (!uri.isScheme('https') && !uri.isScheme('http'))) {
        return null;
      }

      final client = HttpClient();
      try {
        final request = await client.getUrl(uri);
        final response = await request.close();
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return null;
        }

        final bytesBuilder = BytesBuilder(copy: false);
        await for (final chunk in response) {
          bytesBuilder.add(chunk);
        }
        return bytesBuilder.takeBytes();
      } finally {
        client.close(force: true);
      }
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final bg = theme.scaffoldBackgroundColor;
    final surface = theme.cardColor;
    final surfaceAlt = colorScheme.surfaceContainerHighest;
    final text = colorScheme.onSurface;
    final muted = colorScheme.onSurfaceVariant;
    final accent = colorScheme.primary;
    const success = Color(0xFF16A34A);

    final overlayAnimation = CurvedAnimation(
      parent: _successController,
      curve: Curves.easeOutBack,
    );

    return Scaffold(
      backgroundColor: bg,
      appBar: _showTopBar
          ? AppBar(
              backgroundColor: bg,
              foregroundColor: text,
              title: Text(
                widget.readOnlyView
                    ? 'Estado de tu pedido'
                    : 'Detalle de pedido',
              ),
            )
          : null,
      body: Stack(
        children: [
          SafeArea(
            child: FutureBuilder<_OrderViewData?>(
              future: _orderFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  if (_showTopBar) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      setState(() => _showTopBar = false);
                    });
                  }
                  return const BrandedLoadingScreen();
                }

                if (!_showTopBar && !_checkingTrustedDevice) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    setState(() => _showTopBar = true);
                  });
                }

                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Error cargando pedido: ${snapshot.error}',
                        style: GoogleFonts.manrope(color: muted),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                final data = snapshot.data;
                if (data == null) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Tu pedido esta en proceso. Intenta de nuevo en unos segundos.\n\nORDER_ID: ${widget.orderId}',
                        style: GoogleFonts.manrope(color: muted),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                final pedido = data.pedido;
                final total = pedido.total ?? 0.0;
                final customerName = pedido.nombreCliente?.trim();
                final customerEmail = pedido.clienteEmail?.trim();
                final customerPhone = pedido.clientePhone?.trim();
                final paymentMethod = pedido.metodoPago?.trim();
                final deliveryMode = pedido.deliveryMode?.trim();
                final isDeliveryOrder =
                    (deliveryMode ?? '').trim().toLowerCase() == 'delivery';
                final currentStatus = _normalizeStatusValue(pedido.estado);
                final deliveryAddress = pedido.deliveryAddress?.trim();
                final deliveryReference = pedido.deliveryReference?.trim();
                final deliveryInstructions = pedido.deliveryInstructions
                    ?.trim();
                final deliveryLat = pedido.deliveryLatitude;
                final deliveryLng = pedido.deliveryLongitude;
                final orderNotes = pedido.orderNotes?.trim();
                final businessLogoUrl = data.businessLogoUrl?.trim();
                _prepareMarkerIconsIfNeeded(businessLogoUrl: businessLogoUrl);
                final hasDeliveryCoords =
                    deliveryLat != null && deliveryLng != null;
                final hasBusinessCoords =
                    data.businessLatitude != null &&
                    data.businessLongitude != null;
                final isReadOnly = widget.readOnlyView;
                final nextStatusActions = _buildStatusActions(
                  isDelivery: isDeliveryOrder,
                  currentStatus: currentStatus,
                );
                final statusActionsForBar =
                    List<_OrderStatusAction>.from(nextStatusActions)..sort((
                      a,
                      b,
                    ) {
                      if (a.status == 'cancelado' && b.status != 'cancelado') {
                        return -1;
                      }
                      if (b.status == 'cancelado' && a.status != 'cancelado') {
                        return 1;
                      }
                      return 0;
                    });
                String? primaryStatusForBar;
                for (final action in statusActionsForBar) {
                  if (action.status != 'cancelado') {
                    primaryStatusForBar = action.status;
                    break;
                  }
                }
                if (primaryStatusForBar == null &&
                    statusActionsForBar.isNotEmpty) {
                  primaryStatusForBar = statusActionsForBar.first.status;
                }
                final LatLng? deliveryPoint = hasDeliveryCoords
                    ? LatLng(deliveryLat, deliveryLng)
                    : null;
                final LatLng? businessPoint = hasBusinessCoords
                    ? LatLng(data.businessLatitude!, data.businessLongitude!)
                    : null;
                final LatLng? arcControlPoint =
                    hasBusinessCoords && hasDeliveryCoords
                    ? _buildPerpendicularArcControlPoint(
                        origin: businessPoint!,
                        destination: deliveryPoint!,
                      )
                    : null;
                final List<LatLng> arcRoutePoints =
                    hasBusinessCoords && hasDeliveryCoords
                    ? _generateArcPath(
                        origin: businessPoint!,
                        destination: deliveryPoint!,
                      )
                    : const <LatLng>[];
                final List<LatLng> arcShadowPoints =
                    hasBusinessCoords && hasDeliveryCoords
                    ? <LatLng>[businessPoint!, deliveryPoint!]
                    : const <LatLng>[];
                final LatLng? arcPeakPoint = arcRoutePoints.isNotEmpty
                    ? arcRoutePoints[arcRoutePoints.length ~/ 2]
                    : null;
                final Set<Marker> deliveryMarkers = <Marker>{
                  if (businessPoint != null)
                    Marker(
                      markerId: const MarkerId('business'),
                      position: businessPoint,
                      anchor: const Offset(0.5, 0.85),
                      icon:
                          _businessMarkerIcon ??
                          BitmapDescriptor.defaultMarkerWithHue(
                            BitmapDescriptor.hueOrange,
                          ),
                      infoWindow: InfoWindow(title: data.comercioNombre),
                    ),
                  if (deliveryPoint != null)
                    Marker(
                      markerId: const MarkerId('delivery'),
                      position: deliveryPoint,
                      anchor: const Offset(0.5, 0.85),
                      icon:
                          _deliveryMarkerIcon ??
                          BitmapDescriptor.defaultMarkerWithHue(
                            BitmapDescriptor.hueRed,
                          ),
                      infoWindow: const InfoWindow(title: 'Destino de Entrega'),
                    ),
                };
                final Set<Polyline> deliveryPolylines =
                    hasBusinessCoords && hasDeliveryCoords
                    ? <Polyline>{
                        Polyline(
                          polylineId: const PolylineId('route_shadow'),
                          color: Colors.grey.withValues(alpha: 0.3),
                          width: 2,
                          zIndex: 1,
                          points: arcShadowPoints,
                        ),
                        Polyline(
                          polylineId: const PolylineId('route_arc'),
                          color: _routeArcColor,
                          width: 4,
                          zIndex: 2,
                          points: arcRoutePoints,
                        ),
                      }
                    : const <Polyline>{};
                final List<LatLng> cameraPoints = <LatLng?>[
                  businessPoint,
                  deliveryPoint,
                  arcPeakPoint ?? arcControlPoint,
                ].whereType<LatLng>().toList();

                if (isReadOnly &&
                    !_emailVerified &&
                    !_checkingTrustedDevice &&
                    !_trustRestoreRequested) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _restoreTrustedAccess(data);
                  });
                }

                if (isReadOnly && _checkingTrustedDevice) {
                  if (_showTopBar) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      setState(() => _showTopBar = false);
                    });
                  }
                  return const BrandedLoadingScreen();
                }

                if (isReadOnly && !_emailVerified) {
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: surface,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: accent.withValues(alpha: 0.26),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Confirma tu correo',
                              style: GoogleFonts.manrope(
                                color: text,
                                fontSize: 26,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Para ver este pedido necesitamos verificar el correo con el que hiciste la compra.',
                              style: GoogleFonts.manrope(
                                color: muted,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 14),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: surfaceAlt,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Text(
                                'Pista: ${_maskEmail(customerEmail)}',
                                style: GoogleFonts.manrope(
                                  color: text,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            TextField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [AutofillHints.email],
                              style: GoogleFonts.manrope(color: Colors.white),
                              decoration: InputDecoration(
                                labelText: 'Correo del cliente',
                                labelStyle: GoogleFonts.manrope(color: muted),
                                filled: true,
                                fillColor: surfaceAlt,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide.none,
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            CheckboxListTile(
                              value: _rememberDevice,
                              onChanged: (value) {
                                setState(
                                  () => _rememberDevice = value ?? false,
                                );
                              },
                              contentPadding: EdgeInsets.zero,
                              controlAffinity: ListTileControlAffinity.leading,
                              title: Text(
                                'Recordar este dispositivo por 24 horas',
                                style: GoogleFonts.manrope(
                                  color: muted,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                            if (_verificationError != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                _verificationError!,
                                style: GoogleFonts.manrope(
                                  color: const Color(0xFFFF9E8F),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                            const SizedBox(height: 14),
                            SizedBox(
                              height: 54,
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: () => _verifyCustomerEmail(data),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF1AB15E),
                                  foregroundColor: Colors.white,
                                ),
                                child: const Text('Ver mi pedido'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                }

                return Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                        children: [
                          Container(
                            padding: const EdgeInsets.all(18),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  surface,
                                  Color.lerp(surface, surfaceAlt, 0.55) ??
                                      surface,
                                ],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: accent.withValues(alpha: 0.2),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.06),
                                  blurRadius: 16,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(14),
                                      child: SizedBox(
                                        width: 46,
                                        height: 46,
                                        child:
                                            (businessLogoUrl != null &&
                                                businessLogoUrl.isNotEmpty)
                                            ? Image.network(
                                                businessLogoUrl,
                                                fit: BoxFit.cover,
                                                errorBuilder:
                                                    (
                                                      context,
                                                      error,
                                                      stackTrace,
                                                    ) => Container(
                                                      color: surfaceAlt,
                                                      alignment:
                                                          Alignment.center,
                                                      child: Icon(
                                                        Icons
                                                            .storefront_rounded,
                                                        size: 20,
                                                        color: muted,
                                                      ),
                                                    ),
                                              )
                                            : Container(
                                                color: surfaceAlt,
                                                alignment: Alignment.center,
                                                child: Icon(
                                                  Icons.storefront_rounded,
                                                  size: 20,
                                                  color: muted,
                                                ),
                                              ),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          const SizedBox(height: 3),
                                          Text(
                                            data.comercioNombre,
                                            style: GoogleFonts.manrope(
                                              color: text,
                                              fontSize: 24,
                                              fontWeight: FontWeight.w800,
                                              height: 1.08,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: _statusColor(
                                          pedido.estado,
                                        ).withValues(alpha: 0.15),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: _statusColor(
                                            pedido.estado,
                                          ).withValues(alpha: 0.35),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.flag_rounded,
                                            size: 14,
                                            color: _statusColor(pedido.estado),
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            _statusLabel(pedido.estado),
                                            style: GoogleFonts.manrope(
                                              color: _statusColor(
                                                pedido.estado,
                                              ),
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 14),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: surfaceAlt.withValues(alpha: 0.75),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: accent.withValues(alpha: 0.15),
                                    ),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'ID DEL PEDIDO',
                                        style: GoogleFonts.manrope(
                                          color: muted,
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.45,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      SelectableText(
                                        pedido.orderId ?? widget.orderId,
                                        style: GoogleFonts.manrope(
                                          color: text,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          height: 1.2,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    if (paymentMethod != null &&
                                        paymentMethod.isNotEmpty)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 8,
                                        ),
                                        decoration: BoxDecoration(
                                          color: success.withValues(
                                            alpha: 0.14,
                                          ),
                                          borderRadius: BorderRadius.circular(
                                            999,
                                          ),
                                          border: Border.all(
                                            color: success.withValues(
                                              alpha: 0.35,
                                            ),
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Icon(
                                              Icons.payments_rounded,
                                              size: 14,
                                              color: success,
                                            ),
                                            const SizedBox(width: 6),
                                            Text(
                                              paymentMethod,
                                              style: GoogleFonts.manrope(
                                                color: success,
                                                fontSize: 12,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: accent.withValues(alpha: 0.14),
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                        border: Border.all(
                                          color: accent.withValues(alpha: 0.32),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.local_shipping_rounded,
                                            size: 14,
                                            color: accent,
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            _deliveryModeLabel(deliveryMode),
                                            style: GoogleFonts.manrope(
                                              color: accent,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: text.withValues(alpha: 0.06),
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                        border: Border.all(
                                          color: text.withValues(alpha: 0.12),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.receipt_long_rounded,
                                            size: 14,
                                            color: text.withValues(alpha: 0.78),
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            _formatAmount(total),
                                            style: GoogleFonts.manrope(
                                              color: text.withValues(
                                                alpha: 0.82,
                                              ),
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          if (hasDeliveryCoords) ...[
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: surface,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Mapa y ruta',
                                    style: GoogleFonts.manrope(
                                      color: text,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      color: surfaceAlt.withValues(alpha: 0.58),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: text.withValues(alpha: 0.1),
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 30,
                                          height: 30,
                                          decoration: BoxDecoration(
                                            color: accent.withValues(
                                              alpha: 0.14,
                                            ),
                                            borderRadius: BorderRadius.circular(
                                              9,
                                            ),
                                          ),
                                          child: Icon(
                                            _isMapInteractionEnabled
                                                ? Icons.pan_tool_alt_rounded
                                                : Icons.lock_outline_rounded,
                                            size: 17,
                                            color: accent,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                _isMapInteractionEnabled
                                                    ? 'Mover mapa: Activado'
                                                    : 'Mover mapa: Desactivado',
                                                style: GoogleFonts.manrope(
                                                  color: text,
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                _isMapInteractionEnabled
                                                    ? 'Puedes mover el mapa libremente.'
                                                    : 'Activalo solo si quieres explorar el mapa.',
                                                style: GoogleFonts.manrope(
                                                  color: muted,
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Switch.adaptive(
                                          value: _isMapInteractionEnabled,
                                          onChanged: (value) {
                                            setState(() {
                                              _isMapInteractionEnabled = value;
                                            });
                                          },
                                          activeThumbColor: accent,
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(14),
                                    child: SizedBox(
                                      height: 250,
                                      child: IgnorePointer(
                                        ignoring: !_isMapInteractionEnabled,
                                        child: GoogleMap(
                                          initialCameraPosition: CameraPosition(
                                            target: hasBusinessCoords
                                                ? _midpoint(
                                                    businessPoint!,
                                                    deliveryPoint!,
                                                  )
                                                : deliveryPoint!,
                                            zoom: hasBusinessCoords
                                                ? 13.8
                                                : 15.2,
                                          ),
                                          onMapCreated: (controller) async {
                                            if (cameraPoints.length < 2) {
                                              return;
                                            }
                                            await controller.animateCamera(
                                              CameraUpdate.newLatLngBounds(
                                                _buildBounds(cameraPoints),
                                                60,
                                              ),
                                            );
                                          },
                                          myLocationEnabled: false,
                                          myLocationButtonEnabled: false,
                                          zoomControlsEnabled: false,
                                          scrollGesturesEnabled:
                                              _isMapInteractionEnabled,
                                          zoomGesturesEnabled:
                                              _isMapInteractionEnabled,
                                          rotateGesturesEnabled:
                                              _isMapInteractionEnabled,
                                          tiltGesturesEnabled:
                                              _isMapInteractionEnabled,
                                          gestureRecognizers:
                                              _isMapInteractionEnabled
                                              ? <
                                                  Factory<
                                                    OneSequenceGestureRecognizer
                                                  >
                                                >{
                                                  Factory<
                                                    OneSequenceGestureRecognizer
                                                  >(
                                                    () =>
                                                        EagerGestureRecognizer(),
                                                  ),
                                                }
                                              : <
                                                  Factory<
                                                    OneSequenceGestureRecognizer
                                                  >
                                                >{},
                                          mapToolbarEnabled: false,
                                          markers: deliveryMarkers,
                                          polylines: deliveryPolylines,
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (hasBusinessCoords) ...[
                                    const SizedBox(height: 10),
                                    SizedBox(
                                      width: double.infinity,
                                      child: OutlinedButton.icon(
                                        onPressed: () =>
                                            _openExternalGoogleMapsNavigation(
                                              origin: businessPoint!,
                                              destination: deliveryPoint,
                                            ),
                                        icon: const Icon(
                                          Icons.navigation_rounded,
                                        ),
                                        label: const Text(
                                          'Navegar en Google Maps',
                                        ),
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: text,
                                          side: BorderSide(
                                            color: accent.withValues(
                                              alpha: 0.35,
                                            ),
                                          ),
                                          padding: const EdgeInsets.symmetric(
                                            vertical: 12,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ] else ...[
                                    const SizedBox(height: 10),
                                    Text(
                                      'Mostrando solo el destino. Configura latitud y longitud del comercio para visualizar la ruta y navegar.',
                                      style: GoogleFonts.manrope(
                                        color: muted,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),
                          ],
                          if (!isReadOnly) ...[
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    surface,
                                    Color.lerp(surface, surfaceAlt, 0.42) ??
                                        surface,
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                  color: accent.withValues(alpha: 0.18),
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.05),
                                    blurRadius: 14,
                                    offset: const Offset(0, 6),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        width: 40,
                                        height: 40,
                                        decoration: BoxDecoration(
                                          color: accent.withValues(alpha: 0.16),
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                        ),
                                        alignment: Alignment.center,
                                        child: Icon(
                                          Icons.person_rounded,
                                          color: accent,
                                          size: 22,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              'Cliente',
                                              style: GoogleFonts.manrope(
                                                color: text,
                                                fontSize: 18,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              'Contacto para coordinar entrega o retiro',
                                              style: GoogleFonts.manrope(
                                                color: muted,
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      color: surfaceAlt.withValues(alpha: 0.58),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: text.withValues(alpha: 0.1),
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  Icon(
                                                    Icons.person_rounded,
                                                    size: 16,
                                                    color: muted,
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Expanded(
                                                    child: Text(
                                                      (customerName != null &&
                                                              customerName
                                                                  .isNotEmpty)
                                                          ? customerName
                                                          : 'Cliente sin nombre registrado',
                                                      style:
                                                          GoogleFonts.manrope(
                                                            color: text,
                                                            fontSize: 13,
                                                            fontWeight:
                                                                FontWeight.w800,
                                                          ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 8),
                                              Row(
                                                children: [
                                                  Icon(
                                                    Icons
                                                        .alternate_email_rounded,
                                                    size: 16,
                                                    color: muted,
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Expanded(
                                                    child: Text(
                                                      (customerEmail != null &&
                                                              customerEmail
                                                                  .isNotEmpty)
                                                          ? customerEmail
                                                          : 'Cliente sin correo registrado',
                                                      style:
                                                          GoogleFonts.manrope(
                                                            color: text,
                                                            fontSize: 13,
                                                            fontWeight:
                                                                FontWeight.w700,
                                                          ),
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
                                  const SizedBox(height: 14),
                                  Column(
                                    children: [
                                      SizedBox(
                                        width: double.infinity,
                                        child: ElevatedButton.icon(
                                          onPressed:
                                              (customerPhone != null &&
                                                  customerPhone.isNotEmpty)
                                              ? () => _openCustomerWhatsapp(
                                                  customerPhone,
                                                  data.comercioNombre,
                                                )
                                              : null,
                                          icon: const FaIcon(
                                            FontAwesomeIcons.whatsapp,
                                            size: 17,
                                          ),
                                          label: const Text('Enviar WhatsApp'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: const Color(
                                              0xFF16A34A,
                                            ),
                                            foregroundColor: Colors.white,
                                            disabledBackgroundColor:
                                                const Color(0xFFDCFCE7),
                                            disabledForegroundColor:
                                                const Color(0xFF86EFAC),
                                            padding: const EdgeInsets.symmetric(
                                              vertical: 14,
                                              horizontal: 16,
                                            ),
                                            elevation: 0,
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            textStyle: GoogleFonts.manrope(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 14,
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      SizedBox(
                                        width: double.infinity,
                                        child: ElevatedButton.icon(
                                          onPressed:
                                              (customerPhone != null &&
                                                  customerPhone.isNotEmpty)
                                              ? () => _openCustomerCall(
                                                  customerPhone,
                                                )
                                              : null,
                                          icon: const Icon(
                                            Icons.call_rounded,
                                            size: 18,
                                          ),
                                          label: const Text('Llamar ahora'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: const Color(
                                              0xFF2563EB,
                                            ),
                                            foregroundColor: Colors.white,
                                            disabledBackgroundColor:
                                                const Color(0xFFDBEAFE),
                                            disabledForegroundColor:
                                                const Color(0xFF93C5FD),
                                            padding: const EdgeInsets.symmetric(
                                              vertical: 14,
                                              horizontal: 16,
                                            ),
                                            elevation: 0,
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            textStyle: GoogleFonts.manrope(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 14,
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      SizedBox(
                                        width: double.infinity,
                                        child: ElevatedButton.icon(
                                          onPressed:
                                              (customerEmail != null &&
                                                  customerEmail.isNotEmpty)
                                              ? () => _openCustomerEmail(
                                                  customerEmail,
                                                  data.comercioNombre,
                                                )
                                              : null,
                                          icon: const Icon(
                                            Icons.email_rounded,
                                            size: 18,
                                          ),
                                          label: const Text('Enviar email'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: const Color(
                                              0xFF7C3AED,
                                            ),
                                            foregroundColor: Colors.white,
                                            disabledBackgroundColor:
                                                const Color(0xFFEDE9FE),
                                            disabledForegroundColor:
                                                const Color(0xFFC4B5FD),
                                            padding: const EdgeInsets.symmetric(
                                              vertical: 14,
                                              horizontal: 16,
                                            ),
                                            elevation: 0,
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            textStyle: GoogleFonts.manrope(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 14,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),
                          ],
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: surface,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Resumen',
                                  style: GoogleFonts.manrope(
                                    color: text,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                if (pedido.items.isEmpty)
                                  Text(
                                    'No hay items disponibles todavía.',
                                    style: GoogleFonts.manrope(color: muted),
                                  )
                                else
                                  ...pedido.items.map(
                                    (item) => Container(
                                      margin: const EdgeInsets.only(bottom: 10),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 12,
                                      ),
                                      decoration: BoxDecoration(
                                        color: surfaceAlt,
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      child: Row(
                                        children: [
                                          ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              10,
                                            ),
                                            child: SizedBox(
                                              width: 44,
                                              height: 44,
                                              child:
                                                  (item.imageUrl
                                                          ?.trim()
                                                          .isNotEmpty ??
                                                      false)
                                                  ? Image.network(
                                                      item.imageUrl!.trim(),
                                                      fit: BoxFit.cover,
                                                      errorBuilder:
                                                          (
                                                            context,
                                                            error,
                                                            stackTrace,
                                                          ) => Container(
                                                            color: surface,
                                                            alignment: Alignment
                                                                .center,
                                                            child: Icon(
                                                              Icons
                                                                  .image_not_supported_rounded,
                                                              size: 18,
                                                              color: muted,
                                                            ),
                                                          ),
                                                    )
                                                  : (businessLogoUrl != null &&
                                                        businessLogoUrl
                                                            .isNotEmpty)
                                                  ? Image.network(
                                                      businessLogoUrl,
                                                      fit: BoxFit.cover,
                                                      errorBuilder:
                                                          (
                                                            context,
                                                            error,
                                                            stackTrace,
                                                          ) => Container(
                                                            color: surface,
                                                            alignment: Alignment
                                                                .center,
                                                            child: Icon(
                                                              Icons
                                                                  .storefront_rounded,
                                                              size: 18,
                                                              color: muted,
                                                            ),
                                                          ),
                                                    )
                                                  : Container(
                                                      color: surface,
                                                      alignment:
                                                          Alignment.center,
                                                      child: Icon(
                                                        Icons
                                                            .storefront_rounded,
                                                        size: 18,
                                                        color: muted,
                                                      ),
                                                    ),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              'x${item.cantidad} ${item.nombre}',
                                              style: GoogleFonts.manrope(
                                                color: text,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                          Text(
                                            _formatAmount(item.total),
                                            style: GoogleFonts.manrope(
                                              color: success,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    Text(
                                      'Total de la orden',
                                      style: GoogleFonts.manrope(
                                        color: muted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      _formatAmount(total),
                                      style: GoogleFonts.manrope(
                                        color: text,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: surface,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Metodo de pago',
                                  style: GoogleFonts.manrope(
                                    color: text,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  (paymentMethod != null &&
                                          paymentMethod.isNotEmpty)
                                      ? paymentMethod
                                      : 'Sin especificar',
                                  style: GoogleFonts.manrope(
                                    color: text,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _paymentMethodHint(paymentMethod),
                                  style: GoogleFonts.manrope(
                                    color: muted,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: surface,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Entrega',
                                  style: GoogleFonts.manrope(
                                    color: text,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Tipo: ${_deliveryModeLabel(deliveryMode)}',
                                  style: GoogleFonts.manrope(
                                    color: muted,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                if ((deliveryAddress ?? '').isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      'Direccion: $deliveryAddress',
                                      style: GoogleFonts.manrope(
                                        color: text,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                if ((deliveryReference ?? '').isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      'Referencia: $deliveryReference',
                                      style: GoogleFonts.manrope(
                                        color: muted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                if ((deliveryInstructions ?? '').isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      'Indicaciones: $deliveryInstructions',
                                      style: GoogleFonts.manrope(
                                        color: muted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                if (deliveryLat != null && deliveryLng != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(
                                      'Coordenadas: ${deliveryLat.toStringAsFixed(6)}, ${deliveryLng.toStringAsFixed(6)}',
                                      style: GoogleFonts.manrope(
                                        color: muted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          if ((orderNotes ?? '').isNotEmpty) ...[
                            const SizedBox(height: 14),
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: surface,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Notas del pedido',
                                    style: GoogleFonts.manrope(
                                      color: text,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    orderNotes!,
                                    style: GoogleFonts.manrope(
                                      color: muted,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          if (isReadOnly) ...[
                            const SizedBox(height: 18),
                            Text(
                              'El estado de este pedido solo puede ser actualizado por el vendedor.',
                              style: GoogleFonts.manrope(
                                color: muted,
                                fontSize: 13,
                              ),
                            ),
                            if (data.history.isNotEmpty) ...[
                              const SizedBox(height: 18),
                              Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: surface,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Tu historial reciente',
                                      style: GoogleFonts.manrope(
                                        color: text,
                                        fontSize: 18,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    ...data.history.map(
                                      (historyItem) => Container(
                                        margin: const EdgeInsets.only(
                                          bottom: 10,
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 14,
                                          vertical: 12,
                                        ),
                                        decoration: BoxDecoration(
                                          color: surfaceAlt,
                                          borderRadius: BorderRadius.circular(
                                            14,
                                          ),
                                        ),
                                        child: Row(
                                          children: [
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    historyItem.orderId,
                                                    style: GoogleFonts.manrope(
                                                      color: text,
                                                      fontWeight:
                                                          FontWeight.w700,
                                                    ),
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    historyItem.estado,
                                                    style: GoogleFonts.manrope(
                                                      color: muted,
                                                      fontSize: 12,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            Text(
                                              _formatAmount(historyItem.total),
                                              style: GoogleFonts.manrope(
                                                color: success,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ],
                      ),
                    ),
                    if (!isReadOnly)
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                          child: Container(
                            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                            decoration: BoxDecoration(
                              color: surface,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: accent.withValues(alpha: 0.18),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.1),
                                  blurRadius: 16,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Siguiente paso',
                                  style: GoogleFonts.manrope(
                                    color: text,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  nextStatusActions.isEmpty
                                      ? 'Este pedido ya esta finalizado.'
                                      : 'Selecciona la accion para continuar el pedido.',
                                  style: GoogleFonts.manrope(
                                    color: muted,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                if (statusActionsForBar.isEmpty)
                                  SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton.icon(
                                      onPressed: null,
                                      icon: const Icon(
                                        Icons.check_circle_outline_rounded,
                                      ),
                                      label: const Text(
                                        'Sin acciones pendientes',
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 12,
                                        ),
                                      ),
                                    ),
                                  )
                                else
                                  Row(
                                    children: [
                                      for (final entry
                                          in statusActionsForBar
                                              .asMap()
                                              .entries)
                                        Expanded(
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 4,
                                            ),
                                            child: Builder(
                                              builder: (context) {
                                                final action = entry.value;
                                                final isPrimary =
                                                    action.status ==
                                                    primaryStatusForBar;
                                                final isDisabled =
                                                    _isUpdatingStatus &&
                                                    _pendingStatus !=
                                                        action.status;
                                                final isLoading =
                                                    _isUpdatingStatus &&
                                                    _pendingStatus ==
                                                        action.status;

                                                if (isPrimary) {
                                                  return ElevatedButton.icon(
                                                    onPressed: isDisabled
                                                        ? null
                                                        : () async {
                                                            if (action.status ==
                                                                'cancelado') {
                                                              final confirmed =
                                                                  await _confirmCancelOrder();
                                                              if (!confirmed ||
                                                                  !mounted) {
                                                                return;
                                                              }
                                                            }
                                                            await _updateOrderStatus(
                                                              action.status,
                                                            );
                                                          },
                                                    icon: isLoading
                                                        ? const SizedBox(
                                                            width: 18,
                                                            height: 18,
                                                            child: CircularProgressIndicator(
                                                              strokeWidth: 2,
                                                              valueColor:
                                                                  AlwaysStoppedAnimation<
                                                                    Color
                                                                  >(
                                                                    Colors
                                                                        .white,
                                                                  ),
                                                            ),
                                                          )
                                                        : Icon(
                                                            action.icon,
                                                            size: 18,
                                                          ),
                                                    label: Text(
                                                      action.label,
                                                      style:
                                                          GoogleFonts.manrope(
                                                            fontWeight:
                                                                FontWeight.w800,
                                                            fontSize: 13,
                                                          ),
                                                      overflow:
                                                          TextOverflow.ellipsis,
                                                    ),
                                                    style: ElevatedButton.styleFrom(
                                                      backgroundColor:
                                                          action.color,
                                                      disabledBackgroundColor:
                                                          muted.withValues(
                                                            alpha: 0.22,
                                                          ),
                                                      disabledForegroundColor:
                                                          text.withValues(
                                                            alpha: 0.65,
                                                          ),
                                                      foregroundColor:
                                                          Colors.white,
                                                      padding:
                                                          const EdgeInsets.symmetric(
                                                            vertical: 12,
                                                          ),
                                                      shape: RoundedRectangleBorder(
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              14,
                                                            ),
                                                      ),
                                                      elevation: 1,
                                                    ),
                                                  );
                                                }

                                                return OutlinedButton.icon(
                                                  onPressed: isDisabled
                                                      ? null
                                                      : () async {
                                                          if (action.status ==
                                                              'cancelado') {
                                                            final confirmed =
                                                                await _confirmCancelOrder();
                                                            if (!confirmed ||
                                                                !mounted) {
                                                              return;
                                                            }
                                                          }
                                                          await _updateOrderStatus(
                                                            action.status,
                                                          );
                                                        },
                                                  icon: isLoading
                                                      ? SizedBox(
                                                          width: 18,
                                                          height: 18,
                                                          child: CircularProgressIndicator(
                                                            strokeWidth: 2,
                                                            valueColor:
                                                                AlwaysStoppedAnimation<
                                                                  Color
                                                                >(action.color),
                                                          ),
                                                        )
                                                      : Icon(
                                                          action.icon,
                                                          size: 18,
                                                        ),
                                                  label: Text(
                                                    action.label,
                                                    style: GoogleFonts.manrope(
                                                      fontWeight:
                                                          FontWeight.w800,
                                                      fontSize: 13,
                                                    ),
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                  style: OutlinedButton.styleFrom(
                                                    foregroundColor:
                                                        action.color,
                                                    side: BorderSide(
                                                      color: action.color
                                                          .withValues(
                                                            alpha: 0.55,
                                                          ),
                                                    ),
                                                    disabledForegroundColor:
                                                        text.withValues(
                                                          alpha: 0.45,
                                                        ),
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                          vertical: 12,
                                                        ),
                                                    shape: RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            14,
                                                          ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          if (_showSuccessOverlay)
            Positioned.fill(
              child: IgnorePointer(
                child: Container(
                  color: Colors.black.withValues(alpha: 0.45),
                  alignment: Alignment.center,
                  child: FadeTransition(
                    opacity: overlayAnimation,
                    child: ScaleTransition(
                      scale: overlayAnimation,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 28,
                          vertical: 24,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F2617),
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(color: const Color(0xFF27C46B)),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x5527C46B),
                              blurRadius: 24,
                              spreadRadius: 3,
                            ),
                          ],
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.check_circle_rounded,
                              size: 92,
                              color: Color(0xFF3CE17D),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _overlayStatus == null
                                  ? 'Pedido actualizado'
                                  : 'Pedido ${_statusLabel(_overlayStatus)}',
                              style: GoogleFonts.manrope(
                                color: Colors.white,
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _OrderViewData {
  const _OrderViewData({
    required this.pedido,
    required this.comercioNombre,
    this.businessLatitude,
    this.businessLongitude,
    this.businessLogoUrl,
    this.history = const <_HistoryOrderViewData>[],
  });

  final PedidoModel pedido;
  final String comercioNombre;
  final double? businessLatitude;
  final double? businessLongitude;
  final String? businessLogoUrl;
  final List<_HistoryOrderViewData> history;
}

class _HistoryOrderViewData {
  const _HistoryOrderViewData({
    required this.orderId,
    required this.estado,
    required this.total,
  });

  final String orderId;
  final String estado;
  final double total;
}

class _OrderStatusAction {
  const _OrderStatusAction({
    required this.status,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String status;
  final String label;
  final IconData icon;
  final Color color;
}
