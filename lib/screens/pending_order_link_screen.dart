import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/same_tab_navigation.dart';

/// Opens a public order tracker in the same tab. Never uses a popup.
class PendingOrderLinkScreen extends StatefulWidget {
  const PendingOrderLinkScreen({
    super.key,
    required this.orderId,
    this.fallbackUri,
  });

  final String orderId;
  final Uri? fallbackUri;

  @override
  State<PendingOrderLinkScreen> createState() => _PendingOrderLinkScreenState();
}

class _PendingOrderLinkScreenState extends State<PendingOrderLinkScreen> {
  late final Uri _targetUri;
  bool _opening = true;

  @override
  void initState() {
    super.initState();
    _targetUri = widget.fallbackUri ??
        Uri.parse(
          AppLinks.orderDetailsById(widget.orderId, forceWebView: true),
        );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _open();
    });
  }

  Future<void> _open() async {
    final opened = await openUriWithoutPopup(_targetUri);
    if (!mounted) return;
    setState(() => _opening = !opened);
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
                if (_opening) ...[
                  const SizedBox(
                    width: 30,
                    height: 30,
                    child: CircularProgressIndicator(strokeWidth: 2.6),
                  ),
                  const SizedBox(height: 18),
                ],
                Text(
                  'Abriendo tu pedido',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.manrope(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Pedido ${widget.orderId}. Si no continúa, pulsa el botón.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFE3CCAE),
                    fontSize: 14,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _open,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFFF6B00),
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Ver pedido'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
