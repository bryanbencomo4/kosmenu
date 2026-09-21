import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/screens/admin_dashboard_screen.dart';
import 'package:kosmenu_app/screens/billing_gift_card_screen.dart';
import 'package:kosmenu_app/screens/billing_pago_movil_screen.dart';
import 'package:kosmenu_app/screens/qr_generator_screen.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/widgets/billing_plan_checkout.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_shell.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

/// Plan selection + pay with crypto (Zeno hosted checkout).
class BillingPlanScreen extends StatefulWidget {
  const BillingPlanScreen({super.key, this.initialSnapshot, this.embedded = false});

  final BillingSnapshot? initialSnapshot;
  final bool embedded;

  @override
  State<BillingPlanScreen> createState() => _BillingPlanScreenState();
}

class _BillingPlanScreenState extends State<BillingPlanScreen> {
  final _billing = const BillingService();
  late Future<BillingCheckoutContext> _future;
  bool _paying = false;
  bool _cancelling = false;
  String? _error;
  String? _selectedCode;
  Timer? _activationPoll;

  @override
  void initState() {
    super.initState();
    _future = _loadContext(initial: widget.initialSnapshot);
  }

  Future<BillingCheckoutContext> _loadContext({
    BillingSnapshot? initial,
  }) async {
    if (initial != null && !initial.requiresPaymentToPublish) {
      return _billing.loadCheckoutContext();
    }
    if (initial != null && initial.requiresPaymentToPublish) {
      try {
        await _billing.reconcileCheckout();
      } catch (_) {}
    } else {
      try {
        final snap = await _billing.loadSnapshot();
        if (snap.requiresPaymentToPublish) {
          await _billing.reconcileCheckout();
        }
      } catch (_) {}
    }
    return _billing.loadCheckoutContext();
  }

  @override
  void dispose() {
    _activationPoll?.cancel();
    super.dispose();
  }

  void _watchActivation(BillingCheckoutContext checkout) {
    final pending = checkout.pendingSubmission;
    final shouldPoll =
        pending != null &&
        pending.methodCode == 'pago_movil' &&
        checkout.snapshot.requiresPaymentToPublish;
    if (!shouldPoll) {
      _activationPoll?.cancel();
      _activationPoll = null;
      return;
    }
    if (_activationPoll != null) return;
    _activationPoll = Timer.periodic(const Duration(seconds: 4), (_) async {
      try {
        final next = await _billing.loadCheckoutContext();
        if (!mounted) return;
        if (next.snapshot.hasActiveSubscription) {
          _activationPoll?.cancel();
          await Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => const BillingPaymentSuccessScreen(),
            ),
          );
          return;
        }
        setState(() => _future = Future.value(next));
      } catch (_) {}
    });
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _future = _billing.loadCheckoutContext();
    });
  }

  Future<void> _openGiftCard(PaymentMethodCatalog method) async {
    final activated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => BillingGiftCardScreen(method: method)),
    );
    if (!mounted) return;
    if (activated == true) {
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const BillingPaymentSuccessScreen()),
      );
      return;
    }
    await _reload();
  }

  Future<void> _openPagoMovil(
    PaymentMethodCatalog method,
    BillingCheckoutContext contextData,
  ) async {
    final sent = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => BillingPagoMovilScreen(
          method: method,
          plan: contextData.snapshot.plan,
          bcvRate: contextData.bcvRate,
          hasPendingSubmission: contextData.pendingSubmission != null,
        ),
      ),
    );
    if (!mounted) return;
    if (sent == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Pago registrado. Estamos confirmándolo automáticamente.',
          ),
        ),
      );
    }
    await _reload();
  }

  Future<void> _continueWith(BillingCheckoutContext checkout) async {
    PaymentMethodCatalog? method;
    for (final item in checkoutPaymentMethods(checkout.methods)) {
      if (item.code == _selectedCode) {
        method = item;
        break;
      }
    }
    if (method == null) {
      setState(() => _error = 'Elige un método de pago para continuar.');
      return;
    }
    if (method.isCrypto) {
      await _pay(checkout.snapshot);
      return;
    }
    if (method.isGiftCard) {
      await _openGiftCard(method);
      return;
    }
    if (method.isPagoMovil) {
      if (checkout.bcvRate == null || checkout.bcvRate! <= 0) {
        setState(
          () =>
              _error = 'No pudimos leer la tasa BCV. Reintenta en un momento.',
        );
        return;
      }
      await _openPagoMovil(method, checkout);
    }
  }

  Future<void> _openHelp() async {
    final uri = Uri.parse(
      'https://wa.me/584148216433?text=${Uri.encodeComponent('Hola, necesito ayuda con Plan y facturación en elmenuxfa.com.')}',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _goToDashboard() {
    goToMerchantDashboard(context);
  }

  Future<void> _cancelPending(PaymentSubmission submission) async {
    if (_cancelling) return;
    setState(() => _cancelling = true);
    try {
      await _billing.cancelManualPayment(submission.id);
      if (!mounted) return;
      await _reload();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error'.replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
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
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: FutureBuilder<BillingCheckoutContext>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorState(message: '${snapshot.error}', onRetry: _reload);
          }

          final checkout = snapshot.data!;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _watchActivation(checkout);
          });

          return BillingPlanCheckoutView(
            checkout: checkout,
            showAppHeader: !widget.embedded,
            selectedCode: _selectedCode,
            paying: _paying,
            cancelling: _cancelling,
            error: _error,
            onSelectMethod: (code) {
              setState(() {
                _selectedCode = code;
                _error = null;
              });
            },
            onContinue: () => _continueWith(checkout),
            onCancelPending: () {
              final pending = checkout.pendingSubmission;
              if (pending != null) _cancelPending(pending);
            },
            onDashboard: _goToDashboard,
            onHelp: _openHelp,
            onRetryCrypto: () => _pay(checkout.snapshot),
          );
        },
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
      // Prefer server-side Zeno reconcile so missing webhooks still activate.
      final snap = await _billing.reconcileCheckout();
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
          _message =
              'El checkout venció. Genera uno nuevo desde Plan y facturación.';
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

class BillingPaymentSuccessScreen extends StatefulWidget {
  const BillingPaymentSuccessScreen({super.key});

  @override
  State<BillingPaymentSuccessScreen> createState() =>
      _BillingPaymentSuccessScreenState();
}

class _BillingPaymentSuccessScreenState
    extends State<BillingPaymentSuccessScreen> {
  final _billing = const BillingService();
  Timer? _poll;
  String? _menuUrl;
  ComercioModel? _comercio;
  bool _activated = false;
  bool _checking = true;
  String _message = 'Confirmando tu pago con Zeno…';
  String? _error;
  int _attempts = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_confirmPayment());
    _poll = Timer.periodic(const Duration(seconds: 3), (_) {
      unawaited(_confirmPayment());
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _confirmPayment() async {
    if (_activated || !mounted) return;
    _attempts += 1;
    try {
      final snap = await _billing.reconcileCheckout();
      if (!mounted) return;

      if (snap.hasActiveSubscription || snap.canPublish) {
        _poll?.cancel();
        await _loadMenu();
        setState(() {
          _activated = true;
          _checking = false;
          _error = null;
          _message = '¡Menú publicado!';
        });
        return;
      }

      setState(() {
        _checking = false;
        _message = _attempts > 8
            ? 'El pago aún no se refleja. Si ya pagaste, espera unos segundos o pulsa reintentar.'
            : 'Confirmando tu pago con Zeno…';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _error = '$error';
        _message = 'No se pudo confirmar el pago todavía.';
      });
    }
  }

  Future<void> _loadMenu() async {
    final id = SupabaseConfig.currentComercioId.trim();
    if (id.isEmpty) return;
    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('id, slug, nombre, logo_url, en_linea')
          .eq('id', id)
          .maybeSingle();
      if (!mounted || row == null) return;
      final comercio = ComercioModel.fromMap(Map<String, dynamic>.from(row));
      setState(() {
        _comercio = comercio;
        _menuUrl = getPublicMenuUrl(comercio);
      });
    } catch (_) {
      // Keep UI even if URL lookup fails.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(
          _activated ? 'Menú publicado' : 'Confirmando pago',
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
                  if (_checking && !_activated)
                    const CircularProgressIndicator()
                  else
                    Icon(
                      _activated
                          ? Icons.check_circle_rounded
                          : Icons.hourglass_top_rounded,
                      size: 72,
                      color: _activated ? AppColors.success : AppColors.warning,
                    ),
                  const SizedBox(height: 16),
                  Text(
                    _message,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.manrope(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: AppColors.danger,
                        height: 1.35,
                      ),
                    ),
                  ],
                  if (!_activated) ...[
                    const SizedBox(height: 8),
                    Text(
                      'No mostramos el menú como publicado hasta confirmar el pago en Zeno.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _checking ? null : _confirmPayment,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: Text(
                        'Reintentar confirmación',
                        style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        final scope = MerchantShellScope.maybeOf(context);
                        if (scope != null) {
                          scope.onSelect(MerchantNavDestination.plan);
                          scope.onResetContent();
                          return;
                        }
                        Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
                          MaterialPageRoute(
                            builder: (_) => const BillingPlanScreen(),
                          ),
                          (route) => false,
                        );
                      },
                      child: Text(
                        'Volver a Plan y facturación',
                        style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                  if (_activated) ...[
                    const SizedBox(height: 8),
                    Text(
                      'El pago se confirmó y tu menú ya está en línea.',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        height: 1.4,
                      ),
                    ),
                    if (_menuUrl != null) ...[
                      const SizedBox(height: 16),
                      SelectableText(
                        _menuUrl!,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.manrope(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textStrong,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(
                            ClipboardData(text: _menuUrl!),
                          );
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('URL copiada al portapapeles.'),
                            ),
                          );
                        },
                        icon: const Icon(Icons.copy_rounded, size: 18),
                        label: Text(
                          'Copiar URL',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (_comercio != null)
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) =>
                                  QrGeneratorScreen(comercio: _comercio!),
                            ),
                          );
                        },
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                        ),
                        icon: const Icon(Icons.qr_code_2_rounded),
                        label: Text(
                          'Ver código QR',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    if (_menuUrl != null) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () async {
                          await launchUrl(
                            Uri.parse(_menuUrl!),
                            mode: LaunchMode.externalApplication,
                          );
                        },
                        child: Text(
                          'Abrir menú público',
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        goToMerchantDashboard(context);
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
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  final y = local.year.toString().padLeft(4, '0');
  final m = local.month.toString().padLeft(2, '0');
  final d = local.day.toString().padLeft(2, '0');
  return '$d/$m/$y';
}
