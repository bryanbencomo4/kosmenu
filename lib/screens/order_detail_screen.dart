import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
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

    PedidoModel? foundPedido;
    for (final row in pedidosRows as List<dynamic>) {
      final pedido = PedidoModel.fromMap(Map<String, dynamic>.from(row as Map));
      if (pedido.orderId == widget.orderId) {
        foundPedido = pedido;
        break;
      }
    }

    if (foundPedido == null) return null;

    String comercioNombre = 'Kosmenu';
    if (foundPedido.comercioId.isNotEmpty) {
      final comercioRow = await client
          .from('comercios')
          .select('id,nombre')
          .eq('id', foundPedido.comercioId)
          .maybeSingle();

      final comercioMap = _asMap(comercioRow);
      final nombre = comercioMap['nombre']?.toString().trim() ?? '';
      if (nombre.isNotEmpty) {
        comercioNombre = nombre;
      }
    }

    return _OrderViewData(
      pedido: foundPedido,
      comercioNombre: comercioNombre,
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
      final updatedRows = await Supabase.instance.client
          .from('pedidos')
          .update({'estado': 'completado'})
          .contains('detalles', {'order_id': widget.orderId})
          .select('*')
          .limit(1);

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

  @override
  Widget build(BuildContext context) {
    final overlayAnimation = CurvedAnimation(
      parent: _successController,
      curve: Curves.easeOutBack,
    );

    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: _showTopBar
          ? AppBar(
              backgroundColor: const Color(0xFF0F0D0B),
              foregroundColor: const Color(0xFFF9F3EB),
              title: Text(
                widget.readOnlyView
                    ? 'Estado de tu pedido'
                    : 'Detalle de pedido',
              ),
            )
          : null,
      body: Stack(
        children: [
          FutureBuilder<_OrderViewData?>(
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
                      style: GoogleFonts.manrope(
                        color: const Color(0xFFE7D5BF),
                      ),
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
                      style: GoogleFonts.manrope(
                        color: const Color(0xFFE7D5BF),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }

              final pedido = data.pedido;
              final total = pedido.total ?? 0.0;
              final customerEmail = pedido.clienteEmail?.trim();
              final paymentMethod = pedido.metodoPago?.trim();
              final isReadOnly = widget.readOnlyView;

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
                        color: const Color(0xFF1A140E),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0x33D7A74D)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Confirma tu correo',
                            style: GoogleFonts.playfairDisplay(
                              color: const Color(0xFFFFF4E2),
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Para ver este pedido necesitamos verificar el correo con el que hiciste la compra.',
                            style: GoogleFonts.manrope(
                              color: const Color(0xFFD8C6AE),
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: const Color(0xFF120D08),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(
                              'Pista: ${_maskEmail(customerEmail)}',
                              style: GoogleFonts.manrope(
                                color: const Color(0xFFFFEACC),
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
                              labelStyle: GoogleFonts.manrope(
                                color: const Color(0xFFCFAF85),
                              ),
                              filled: true,
                              fillColor: const Color(0xFF120D08),
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
                              setState(() => _rememberDevice = value ?? false);
                            },
                            contentPadding: EdgeInsets.zero,
                            controlAffinity: ListTileControlAffinity.leading,
                            title: Text(
                              'Recordar este dispositivo por 24 horas',
                              style: GoogleFonts.manrope(
                                color: const Color(0xFFE7D5BF),
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
                      color: const Color(0xFF1A140E),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0x33D7A74D)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.comercioNombre,
                          style: GoogleFonts.playfairDisplay(
                            color: const Color(0xFFFFF4E2),
                            fontSize: 28,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'ORDER_ID: ${pedido.orderId ?? widget.orderId}',
                          style: GoogleFonts.manrope(
                            color: const Color(0xFFD8C6AE),
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
                                color: const Color(0xFF1AB15E),
                                icon: Icons.payments_rounded,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (!isReadOnly) ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF17120E),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Cliente',
                            style: GoogleFonts.manrope(
                              color: const Color(0xFFCFAF85),
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
                              color: const Color(0xFFFFEACC),
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
                                    onPressed: () => _copyEmail(customerEmail),
                                    icon: const Icon(Icons.copy_rounded),
                                    label: const Text('Copiar'),
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: const Color(0xFFFFEACC),
                                      side: const BorderSide(
                                        color: Color(0x55D7A74D),
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
                                      backgroundColor: const Color(0xFF2A1F14),
                                      foregroundColor: const Color(0xFFFFEACC),
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
                      color: const Color(0xFF17120E),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Resumen',
                          style: GoogleFonts.manrope(
                            color: const Color(0xFFFFEACC),
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (pedido.items.isEmpty)
                          Text(
                            'No hay items disponibles todavía.',
                            style: GoogleFonts.manrope(
                              color: const Color(0xFFD8C6AE),
                            ),
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
                                color: const Color(0xFF21170F),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: const Color(0x22D7A74D),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'x${item.cantidad} ${item.nombre}',
                                      style: GoogleFonts.manrope(
                                        color: const Color(0xFFFFEACC),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    _formatAmount(item.total),
                                    style: GoogleFonts.manrope(
                                      color: const Color(0xFF40D887),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFF120D08),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              Text(
                                'Total de la orden',
                                style: GoogleFonts.manrope(
                                  color: const Color(0xFFE7D5BF),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                _formatAmount(total),
                                style: GoogleFonts.manrope(
                                  color: const Color(0xFFFFE8C6),
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isReadOnly) ...[
                    const SizedBox(height: 18),
                    Text(
                      'El estado de este pedido solo puede ser actualizado por el vendedor.',
                      style: GoogleFonts.manrope(
                        color: const Color(0xFFD8C6AE),
                        fontSize: 13,
                      ),
                    ),
                    if (data.history.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF17120E),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Tu historial reciente',
                              style: GoogleFonts.manrope(
                                color: const Color(0xFFFFEACC),
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
                                  color: const Color(0xFF21170F),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: const Color(0x22D7A74D),
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
                                              color: const Color(0xFFFFEACC),
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            historyItem.estado,
                                            style: GoogleFonts.manrope(
                                              color: const Color(0xFFD8C6AE),
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Text(
                                      _formatAmount(historyItem.total),
                                      style: GoogleFonts.manrope(
                                        color: const Color(0xFF40D887),
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
                          backgroundColor: const Color(0xFF1AB15E),
                          disabledBackgroundColor: const Color(0xFF5A4A38),
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
    this.history = const <_HistoryOrderViewData>[],
  });

  final PedidoModel pedido;
  final String comercioNombre;
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
