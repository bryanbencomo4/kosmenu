import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/billing_service.dart';

/// Plan selection + pay with crypto (Zeno hosted checkout).
class BillingPlanScreen extends StatefulWidget {
  const BillingPlanScreen({super.key, this.initialSnapshot});

  final BillingSnapshot? initialSnapshot;

  @override
  State<BillingPlanScreen> createState() => _BillingPlanScreenState();
}

class _BillingPlanScreenState extends State<BillingPlanScreen> {
  final _billing = const BillingService();
  late Future<BillingSnapshot> _future;
  bool _paying = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = widget.initialSnapshot != null
        ? Future.value(widget.initialSnapshot!)
        : _billing.loadSnapshot();
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _future = _billing.loadSnapshot();
    });
  }

  Future<void> _pay(BillingSnapshot snapshot) async {
    if (_paying) return;
    setState(() {
      _paying = true;
      _error = null;
    });

    try {
      final checkout = await _billing.createCheckout();
      final opened = await _billing.openCheckoutUrl(checkout.checkoutUrl);
      if (!mounted) return;

      if (!opened) {
        setState(() => _error = 'No se pudo abrir el checkout de Zeno Bank.');
        return;
      }

      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => BillingPaymentPendingScreen(
            orderId: checkout.orderId,
            checkoutUrl: checkout.checkoutUrl,
            expiresAt: checkout.expiresAt,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          'Plan y facturación',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: FutureBuilder<BillingSnapshot>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return _ErrorState(
                    message: '${snapshot.error}',
                    onRetry: _reload,
                  );
                }

                final data = snapshot.data!;
                final plan = data.plan;
                final sub = data.subscription;
                final payment = data.latestPayment;

                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            plan?.name ?? 'Menú Digital',
                            style: GoogleFonts.manrope(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textStrong,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            plan?.description ??
                                'Publica tu menú con QR y panel de administración.',
                            style: GoogleFonts.manrope(
                              color: AppColors.textSoft,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            plan?.priceLabel ?? '\$10 USD',
                            style: GoogleFonts.manrope(
                              fontSize: 32,
                              fontWeight: FontWeight.w800,
                              color: colorScheme.primary,
                            ),
                          ),
                          Text(
                            '/ mes · pago con criptomonedas',
                            style: GoogleFonts.manrope(
                              color: AppColors.textSoft,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    _SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Estado de suscripción',
                            style: GoogleFonts.manrope(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _StatusChip(
                            label: _statusLabel(data),
                            tone: _statusTone(data),
                          ),
                          if (sub?.currentPeriodEnd != null) ...[
                            const SizedBox(height: 10),
                            Text(
                              'Próxima renovación: ${_formatDate(sub!.currentPeriodEnd!)}',
                              style: GoogleFonts.manrope(
                                color: AppColors.textSoft,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                          if (data.isGrandfathered) ...[
                            const SizedBox(height: 10),
                            Text(
                              'Tu menú actual sigue activo (plan legacy). '
                              'Puedes suscribirte cuando quieras para renovaciones automáticas.',
                              style: GoogleFonts.manrope(
                                color: AppColors.textSoft,
                                height: 1.35,
                              ),
                            ),
                          ],
                          if (payment?.status == 'partially_paid') ...[
                            const SizedBox(height: 10),
                            Text(
                              'Recibimos un pago parcial. Contacta soporte para completar la activación.',
                              style: GoogleFonts.manrope(
                                color: AppColors.warning,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _error!,
                          style: GoogleFonts.manrope(
                            color: AppColors.danger,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    FilledButton(
                      onPressed: _paying || plan == null
                          ? null
                          : () => _pay(data),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _paying
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              'Pagar ${plan?.priceLabel ?? '\$10'} con criptomonedas',
                              style: GoogleFonts.manrope(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                    ),
                    if (payment != null &&
                        (payment.status == 'expired' ||
                            payment.status == 'failed' ||
                            payment.status == 'partially_paid')) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _paying ? null : () => _pay(data),
                        child: Text(
                          'Generar nuevo checkout',
                          style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      'El pago se confirma automáticamente. WhatsApp es solo soporte.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        fontSize: 12,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// Shown after redirecting the user to pay.zenobank.io.
class BillingPaymentPendingScreen extends StatefulWidget {
  const BillingPaymentPendingScreen({
    super.key,
    required this.orderId,
    required this.checkoutUrl,
    this.expiresAt,
  });

  final String orderId;
  final String checkoutUrl;
  final DateTime? expiresAt;

  @override
  State<BillingPaymentPendingScreen> createState() =>
      _BillingPaymentPendingScreenState();
}

class _BillingPaymentPendingScreenState
    extends State<BillingPaymentPendingScreen> {
  final _billing = const BillingService();
  Timer? _poll;
  bool _opening = false;
  String _message = 'Esperando confirmación del pago…';

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(const Duration(seconds: 4), (_) => _checkStatus());
    _checkStatus();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _checkStatus() async {
    try {
      final snap = await _billing.loadSnapshot();
      final payment = snap.latestPayment;
      if (!mounted) return;

      if (snap.hasActiveSubscription || payment?.status == 'completed') {
        _poll?.cancel();
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => const BillingPaymentSuccessScreen(),
          ),
        );
        return;
      }

      if (payment?.status == 'partially_paid') {
        setState(() {
          _message =
              'Pago parcial recibido. Contacta soporte para completar la activación.';
        });
      } else if (payment?.status == 'expired') {
        setState(() {
          _message = 'El checkout venció. Genera uno nuevo desde Plan y facturación.';
        });
      } else {
        setState(() => _message = 'Esperando confirmación del pago…');
      }
    } catch (_) {
      // Keep polling; transient RLS/network errors are fine.
    }
  }

  Future<void> _reopenCheckout() async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      await _billing.openCheckoutUrl(widget.checkoutUrl);
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          'Pago pendiente',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 24),
                  Text(
                    _message,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textStrong,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Orden: ${widget.orderId}',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      color: AppColors.textSoft,
                      fontSize: 12,
                    ),
                  ),
                  if (widget.expiresAt != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Expira: ${_formatDate(widget.expiresAt!)}',
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        fontSize: 12,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  OutlinedButton(
                    onPressed: _opening ? null : _reopenCheckout,
                    child: Text(
                      'Reabrir checkout',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => const BillingPlanScreen(),
                        ),
                      );
                    },
                    child: Text(
                      'Volver a Plan y facturación',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class BillingPaymentSuccessScreen extends StatelessWidget {
  const BillingPaymentSuccessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          'Pago confirmado',
          style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    size: 72,
                    color: AppColors.success,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    '¡Tu menú está activo!',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'El pago se confirmó y tu suscripción quedó renovada automáticamente.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      color: AppColors.textSoft,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () {
                      Navigator.of(context).popUntil((route) => route.isFirst);
                    },
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: Text(
                      'Ir al panel',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderSubtle),
      ),
      child: child,
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: GoogleFonts.manrope(
          color: tone,
          fontWeight: FontWeight.w800,
          fontSize: 13,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.manrope(color: AppColors.danger),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Reintentar')),
        ],
      ),
    );
  }
}

String _statusLabel(BillingSnapshot data) {
  if (data.hasActiveSubscription) return 'Activa';
  if (data.isGrandfathered) return 'Legacy (sin suscripción Zeno)';
  switch (data.subscription?.status) {
    case 'pending':
      return 'Pendiente de pago';
    case 'past_due':
      return 'Vencida (período de gracia)';
    case 'suspended':
      return 'Suspendida';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Sin suscripción';
  }
}

Color _statusTone(BillingSnapshot data) {
  if (data.hasActiveSubscription) return AppColors.success;
  if (data.isGrandfathered) return AppColors.accent;
  switch (data.subscription?.status) {
    case 'past_due':
      return AppColors.warning;
    case 'suspended':
    case 'cancelled':
      return AppColors.danger;
    default:
      return AppColors.textSoft;
  }
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  final y = local.year.toString().padLeft(4, '0');
  final m = local.month.toString().padLeft(2, '0');
  final d = local.day.toString().padLeft(2, '0');
  return '$d/$m/$y';
}
