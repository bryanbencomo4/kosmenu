import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/order_gate_handler.dart';
import 'package:url_launcher/url_launcher.dart';

class OrderGateScreen extends StatefulWidget {
  const OrderGateScreen({
    super.key,
    required this.orderId,
  });

  final String orderId;

  @override
  State<OrderGateScreen> createState() => _OrderGateScreenState();
}

class _OrderGateScreenState extends State<OrderGateScreen> {
  final OrderGateHandler _handler = const OrderGateHandler();

  bool _loading = true;
  String _title = 'Abriendo pedido';
  String _message = 'Validando acceso al pedido...';
  Uri? _fallbackUri;
  bool _showAccountMismatchNotice = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _processOrderLink();
    });
  }

  Future<void> _processOrderLink() async {
    try {
      final decision = await _handler.resolve(widget.orderId);
      if (!mounted) {
        return;
      }

      if (decision.target == OrderGateTarget.app) {
        Navigator.of(context).pushReplacementNamed(
          '/orders/view/${Uri.encodeComponent(decision.orderId)}',
        );
        return;
      }

      if (decision.target == OrderGateTarget.publicApp) {
        Navigator.of(context).pushReplacementNamed(
          '/orders/public/${Uri.encodeComponent(decision.orderId)}',
        );
        return;
      }

      if (decision.target == OrderGateTarget.deniedApp) {
        setState(() {
          _loading = false;
          _fallbackUri = decision.fallbackUri;
          _showAccountMismatchNotice = true;
          _title = 'Esta cuenta no puede gestionar este pedido';
          _message = 'Abriste un pedido que pertenece a otro negocio. Si solo quieres consultarlo, puedes entrar como cliente y verificar el correo del pedido.';
        });
        return;
      }

      final fallbackMessage = decision.reason == 'no-session'
          ? 'No hay sesión activa. Abriremos el pedido en el navegador.'
          : 'Este pedido se abrirá en la vista web por seguridad.';

      setState(() {
        _loading = false;
        _title = 'Abrir pedido en navegador';
        _fallbackUri = decision.fallbackUri;
        _showAccountMismatchNotice = false;
        _message = fallbackMessage;
      });

      _launchFallbackInBackground(decision.fallbackUri);
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loading = false;
        _title = 'No pudimos abrir el pedido en la app';
        _fallbackUri = Uri.tryParse(
          '${AppLinks.productionUrl}/orders/${Uri.encodeComponent(widget.orderId)}?view=web',
        );
        _showAccountMismatchNotice = false;
        _message = 'No se pudo validar el acceso en la app. Puedes abrir el pedido en el navegador.';
      });
    }
  }

  Future<void> _launchFallbackInBackground(Uri fallbackUri) async {
    final launched = await launchUrl(
      fallbackUri,
      mode: LaunchMode.externalApplication,
    );

    if (!mounted || launched) {
      return;
    }

    setState(() {
      _message = 'No se pudo abrir automáticamente en el navegador.';
    });
  }

  Future<void> _openFallbackManually() async {
    final fallbackUri = _fallbackUri;
    if (fallbackUri == null) {
      return;
    }
    await launchUrl(fallbackUri, mode: LaunchMode.externalApplication);
  }

  void _openPublicOrderView() {
    Navigator.of(context).pushReplacementNamed(
      '/orders/public/${Uri.encodeComponent(widget.orderId)}',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 420),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF1A140E),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: const Color(0x33FFB04A)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_loading) ...[
                  const SizedBox(
                    width: 30,
                    height: 30,
                    child: CircularProgressIndicator(strokeWidth: 2.6),
                  ),
                  const SizedBox(height: 18),
                ],
                Text(
                  _title,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _message,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFE3CCAE),
                    fontSize: 14,
                    height: 1.45,
                  ),
                ),
                if (_showAccountMismatchNotice) ...[
                  const SizedBox(height: 18),
                  Text(
                    'Si necesitas administrarlo, cierra sesión e ingresa con la cuenta del vendedor correcto.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                      color: const Color(0xFFBFA88B),
                      fontSize: 13,
                      height: 1.45,
                    ),
                  ),
                ],
                if (!_loading && _fallbackUri != null) ...[
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: _showAccountMismatchNotice
                        ? _openPublicOrderView
                        : _openFallbackManually,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFFF6B00),
                      foregroundColor: Colors.white,
                    ),
                    child: Text(
                      _showAccountMismatchNotice
                          ? 'Ver pedido como cliente'
                          : 'Abrir en navegador',
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}