import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  late Future<_OrderViewData?> _orderFuture;
  late final AnimationController _successController;
  final TextEditingController _emailController = TextEditingController();
  bool _isCompleting = false;
  bool _showSuccessOverlay = false;
  bool _rememberDevice = false;
  bool _emailVerified = false;
  bool _checkingTrustedDevice = false;
  bool _trustRestoreRequested = false;
  bool _showTopBar = false;
  String? _verificationError;
  bool _loadingMarkerIcons = false;
  String? _markerIconsKey;
  BitmapDescriptor? _businessMarkerIcon;
  BitmapDescriptor? _deliveryMarkerIcon;

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

  Future<void> _markAsCompleted() async {
    if (_isCompleting) return;
    setState(() => _isCompleting = true);

    try {
      var updatedRows = await Supabase.instance.client
          .from('pedidos')
          .update({'estado': 'completado'})
          .contains('detalles', {'order_id': widget.orderId})
          .select('*')
          .limit(1);

      if ((updatedRows as List).isEmpty) {
        updatedRows = await Supabase.instance.client
            .from('pedidos')
            .update({'estado': 'completado'})
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
      });

      await _playSuccessOverlay();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pedido marcado como completado.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al actualizar pedido: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isCompleting = false);
      }
    }
  }

  Future<void> _playSuccessOverlay() async {
    setState(() => _showSuccessOverlay = true);
    await _successController.forward(from: 0);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    setState(() => _showSuccessOverlay = false);
    _successController.reset();
  }

  Future<void> _copyEmail(String email) async {
    await Clipboard.setData(ClipboardData(text: email));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Correo copiado al portapapeles.')),
    );
  }

  Future<void> _emailCustomer(String email, String comercioNombre) async {
    final subject = Uri.encodeComponent('Pedido en $comercioNombre');
    final body = Uri.encodeComponent(
      'Hola, te escribimos desde $comercioNombre por tu pedido.',
    );
    final uri = Uri.parse('mailto:$email?subject=$subject&body=$body');
    final launched = await launchUrl(uri);

    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir el cliente de correo.')),
      );
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
    switch ((estado ?? 'pendiente').trim().toLowerCase()) {
      case 'completado':
        return 'Completado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return 'Pendiente';
    }
  }

  Color _statusColor(String? estado) {
    switch ((estado ?? 'pendiente').trim().toLowerCase()) {
      case 'completado':
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
      return 'Recibido por Pago Movil. Verifica referencia y banco antes de marcar completado.';
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

    const double width = 118;
    const double height = 146;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    final pinPaint = Paint()..color = Colors.white;
    final borderPaint = Paint()
      ..color = const Color(0xFF1C2431)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;

    final outer = Rect.fromLTWH(11, 10, 96, 96);
    canvas.drawOval(outer, pinPaint);
    canvas.drawOval(outer, borderPaint);

    final clipPath = Path()..addOval(Rect.fromLTWH(17, 16, 84, 84));
    canvas.save();
    canvas.clipPath(clipPath);
    paintImage(
      canvas: canvas,
      rect: const Rect.fromLTWH(17, 16, 84, 84),
      image: logo,
      fit: BoxFit.cover,
      filterQuality: FilterQuality.high,
    );
    canvas.restore();

    final pointerPath = Path()
      ..moveTo(59, 141)
      ..lineTo(44, 94)
      ..lineTo(74, 94)
      ..close();
    canvas.drawPath(pointerPath, pinPaint);
    canvas.drawPath(pointerPath, borderPaint);

    final image = await recorder.endRecording().toImage(
      width.toInt(),
      height.toInt(),
    );
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<BitmapDescriptor> _buildDeliveryMarkerIcon() async {
    const double size = 118;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    final shadowPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.16)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawCircle(const Offset(59, 102), 15, shadowPaint);

    final outerPaint = Paint()..color = const Color(0xFFEF4444);
    final outerBorderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    final innerPaint = Paint()..color = Colors.white;
    final innerBorderPaint = Paint()
      ..color = const Color(0xFFEF4444)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;

    canvas.drawCircle(const Offset(59, 48), 28, outerPaint);
    canvas.drawCircle(const Offset(59, 48), 28, outerBorderPaint);
    canvas.drawCircle(const Offset(59, 48), 15, innerPaint);
    canvas.drawCircle(const Offset(59, 48), 15, innerBorderPaint);

    final pointerPath = Path()
      ..moveTo(59, 104)
      ..lineTo(45, 72)
      ..lineTo(73, 72)
      ..close();
    canvas.drawPath(pointerPath, outerPaint);
    canvas.drawPath(pointerPath, outerBorderPaint);

    final textPainter = TextPainter(
      textDirection: TextDirection.ltr,
      text: TextSpan(
        text: String.fromCharCode(Icons.flag_rounded.codePoint),
        style: TextStyle(
          fontSize: 24,
          color: const Color(0xFFB91C1C),
          fontFamily: Icons.flag_rounded.fontFamily,
          package: Icons.flag_rounded.fontPackage,
        ),
      ),
    )..layout();

    final offset = Offset((size - textPainter.width) / 2, 36);
    textPainter.paint(canvas, offset);

    final image = await recorder.endRecording().toImage(
      size.toInt(),
      size.toInt(),
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
                        'Tu pedido está en proceso. Intenta de nuevo en unos segundos.\n\nORDER_ID: ${widget.orderId}',
                        style: GoogleFonts.manrope(color: muted),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                final pedido = data.pedido;
                final total = pedido.total ?? 0.0;
                final customerEmail = pedido.clienteEmail?.trim();
                final paymentMethod = pedido.metodoPago?.trim();
                final deliveryMode = pedido.deliveryMode?.trim();
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
                          color: Colors.purple,
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

                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
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
                            data.comercioNombre,
                            style: GoogleFonts.manrope(
                              color: text,
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'ORDER_ID: ${pedido.orderId ?? widget.orderId}',
                            style: GoogleFonts.manrope(
                              color: muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: [
                              _BadgeChip(
                                label: _statusLabel(pedido.estado),
                                color: _statusColor(pedido.estado),
                                icon: Icons.flag_rounded,
                              ),
                              if (paymentMethod != null &&
                                  paymentMethod.isNotEmpty)
                                _BadgeChip(
                                  label: paymentMethod,
                                  color: success,
                                  icon: Icons.payments_rounded,
                                ),
                              _BadgeChip(
                                label: _deliveryModeLabel(deliveryMode),
                                color: accent,
                                icon: Icons.local_shipping_rounded,
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
                            ClipRRect(
                              borderRadius: BorderRadius.circular(14),
                              child: SizedBox(
                                height: 250,
                                child: GoogleMap(
                                  initialCameraPosition: CameraPosition(
                                    target: hasBusinessCoords
                                        ? _midpoint(
                                            businessPoint!,
                                            deliveryPoint!,
                                          )
                                        : deliveryPoint!,
                                    zoom: hasBusinessCoords ? 13.8 : 15.2,
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
                                  mapToolbarEnabled: false,
                                  markers: deliveryMarkers,
                                  polylines: deliveryPolylines,
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
                                  icon: const Icon(Icons.navigation_rounded),
                                  label: const Text('Navegar en Google Maps'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: text,
                                    side: BorderSide(
                                      color: accent.withValues(alpha: 0.35),
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
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: surface,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Cliente',
                              style: GoogleFonts.manrope(
                                color: muted,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              customerEmail != null && customerEmail.isNotEmpty
                                  ? customerEmail
                                  : 'Sin correo registrado',
                              style: GoogleFonts.manrope(
                                color: text,
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (customerEmail != null &&
                                customerEmail.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: () =>
                                          _copyEmail(customerEmail),
                                      icon: const Icon(Icons.copy_rounded),
                                      label: const Text('Copiar'),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: text,
                                        side: BorderSide(
                                          color: accent.withValues(alpha: 0.35),
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 14,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: ElevatedButton.icon(
                                      onPressed: () => _emailCustomer(
                                        customerEmail,
                                        data.comercioNombre,
                                      ),
                                      icon: const Icon(Icons.email_outlined),
                                      label: const Text('Enviar Email'),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: surfaceAlt,
                                        foregroundColor: text,
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 14,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
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
                                      borderRadius: BorderRadius.circular(10),
                                      child: SizedBox(
                                        width: 44,
                                        height: 44,
                                        child:
                                            (item.imageUrl?.trim().isNotEmpty ??
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
                                                      alignment:
                                                          Alignment.center,
                                                      child: Icon(
                                                        Icons
                                                            .image_not_supported_rounded,
                                                        size: 18,
                                                        color: muted,
                                                      ),
                                                    ),
                                              )
                                            : (businessLogoUrl != null &&
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
                                              )
                                            : Container(
                                                color: surface,
                                                alignment: Alignment.center,
                                                child: Icon(
                                                  Icons.storefront_rounded,
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
                            (paymentMethod != null && paymentMethod.isNotEmpty)
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
                        style: GoogleFonts.manrope(color: muted, fontSize: 13),
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
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              historyItem.orderId,
                                              style: GoogleFonts.manrope(
                                                color: text,
                                                fontWeight: FontWeight.w700,
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
                    ] else ...[
                      const SizedBox(height: 18),
                      SizedBox(
                        height: 56,
                        child: ElevatedButton.icon(
                          onPressed:
                              _isCompleting || pedido.estado == 'completado'
                              ? null
                              : _markAsCompleted,
                          icon: _isCompleting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white,
                                    ),
                                  ),
                                )
                              : const Icon(Icons.check_circle_outline_rounded),
                          label: Text(
                            pedido.estado == 'completado'
                                ? 'Pedido completado'
                                : 'Marcar como Completado',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: success,
                            disabledBackgroundColor: muted.withValues(
                              alpha: 0.4,
                            ),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                      ),
                    ],
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
                              'Pedido Completado',
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

class _BadgeChip extends StatelessWidget {
  const _BadgeChip({
    required this.label,
    required this.color,
    required this.icon,
  });

  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Text(
            label,
            style: GoogleFonts.manrope(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
