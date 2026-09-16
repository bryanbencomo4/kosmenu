import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/widgets/payment_method_mark.dart';

class BillingGiftCardScreen extends StatefulWidget {
  const BillingGiftCardScreen({super.key, required this.method});

  final PaymentMethodCatalog method;

  @override
  State<BillingGiftCardScreen> createState() => _BillingGiftCardScreenState();
}

class _BillingGiftCardScreenState extends State<BillingGiftCardScreen> {
  final _billing = const BillingService();
  final _controller = TextEditingController();
  bool _redeeming = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _redeem() async {
    if (_redeeming) return;
    final code = _controller.text.trim();
    if (!isPlausibleGiftCardCode(code)) {
      setState(() => _error = 'El codigo debe tener al menos 12 caracteres.');
      return;
    }

    setState(() {
      _redeeming = true;
      _error = null;
    });

    try {
      await _billing.redeemGiftCard(code: code);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error'.replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => _redeeming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          'Tarjeta de regalo',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(
                  children: [
                    PaymentMethodMark(method: widget.method, size: 56),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.method.name,
                            style: GoogleFonts.manrope(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            'Verificacion automatica',
                            style: GoogleFonts.manrope(
                              color: AppColors.success,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  widget.method.instructions ??
                      'Escribe el codigo. Se activa al instante.',
                  style: GoogleFonts.manrope(
                    color: AppColors.textSoft,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _controller,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9\- ]')),
                    LengthLimitingTextInputFormatter(28),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Codigo',
                    hintText: 'EMX-XXXX-XXXX-XXXX',
                    filled: true,
                    fillColor: Colors.white,
                  ),
                  onSubmitted: (_) => _redeem(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: GoogleFonts.manrope(
                      color: AppColors.danger,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _redeeming ? null : _redeem,
                  child: _redeeming
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          'Canjear y activar',
                          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
