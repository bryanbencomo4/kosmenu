import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/widgets/payment_method_mark.dart';

class BillingPlanCheckoutView extends StatelessWidget {
  const BillingPlanCheckoutView({
    super.key,
    required this.checkout,
    required this.selectedCode,
    required this.paying,
    required this.cancelling,
    required this.error,
    required this.onSelectMethod,
    required this.onContinue,
    required this.onCancelPending,
    required this.onDashboard,
    required this.onHelp,
    required this.onRetryCrypto,
    this.showAppHeader = true,
  });

  final BillingCheckoutContext checkout;
  final String? selectedCode;
  final bool paying;
  final bool cancelling;
  final String? error;
  final ValueChanged<String> onSelectMethod;
  final VoidCallback onContinue;
  final VoidCallback onCancelPending;
  final VoidCallback onDashboard;
  final VoidCallback onHelp;
  final VoidCallback onRetryCrypto;
  final bool showAppHeader;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 980;
        final compact = constraints.maxWidth < 720;
        final padding = wide ? 28.0 : (compact ? 16.0 : 22.0);

        return Column(
          children: [
            if (showAppHeader) _CheckoutHeader(compact: compact, onHelp: onHelp),
            Expanded(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1180),
                  child: wide
                      ? SingleChildScrollView(
                          padding: const EdgeInsets.only(bottom: 24),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(width: 8),
                              const SizedBox(
                                width: 360,
                                child: Padding(
                                  padding: EdgeInsets.fromLTRB(8, 4, 20, 24),
                                  child: _PromoPanel(),
                                ),
                              ),
                              Expanded(
                                child: _CheckoutScroll(
                                  padding: EdgeInsets.fromLTRB(
                                    8,
                                    4,
                                    padding,
                                    24,
                                  ),
                                  checkout: checkout,
                                  selectedCode: selectedCode,
                                  paying: paying,
                                  cancelling: cancelling,
                                  error: error,
                                  compact: false,
                                  stickyCta: false,
                                  onSelectMethod: onSelectMethod,
                                  onContinue: onContinue,
                                  onCancelPending: onCancelPending,
                                  onDashboard: onDashboard,
                                  onRetryCrypto: onRetryCrypto,
                                ),
                              ),
                            ],
                          ),
                        )
                      : _CheckoutScroll(
                          padding: EdgeInsets.fromLTRB(padding, 4, padding, 8),
                          checkout: checkout,
                          selectedCode: selectedCode,
                          paying: paying,
                          cancelling: cancelling,
                          error: error,
                          compact: compact,
                          stickyCta: true,
                          onSelectMethod: onSelectMethod,
                          onContinue: onContinue,
                          onCancelPending: onCancelPending,
                          onDashboard: onDashboard,
                          onRetryCrypto: onRetryCrypto,
                        ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CheckoutHeader extends StatelessWidget {
  const _CheckoutHeader({required this.compact, required this.onHelp});

  final bool compact;
  final VoidCallback onHelp;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(compact ? 8 : 20, 4, compact ? 12 : 20, 8),
        child: Row(
          children: [
            IconButton(
              tooltip: 'Volver',
              onPressed: () {
                if (Navigator.of(context).canPop()) {
                  Navigator.of(context).maybePop();
                }
              },
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Plan y facturación',
                    style: GoogleFonts.manrope(
                      fontWeight: FontWeight.w800,
                      fontSize: compact ? 18 : 22,
                      color: AppColors.textStrong,
                    ),
                  ),
                  if (!compact)
                    Text(
                      'Gestiona tu plan, método de pago y el estado de tu suscripción.',
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        fontSize: 13,
                        height: 1.3,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            _HelpChip(compact: compact, onTap: onHelp),
          ],
        ),
      ),
    );
  }
}

class _HelpChip extends StatelessWidget {
  const _HelpChip({required this.compact, required this.onTap});

  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            compact ? 10 : 12,
            8,
            compact ? 10 : 14,
            8,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.help_outline_rounded,
                  size: 16,
                  color: AppColors.accent,
                ),
              ),
              if (!compact) ...[
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '¿Necesitas ayuda?',
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                    Text(
                      'Estamos aquí para ti',
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right_rounded, size: 18),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PromoPanel extends StatelessWidget {
  const _PromoPanel();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(28, 32, 28, 28),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(32),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFF4ECFF), Color(0xFFE8DEFF), Color(0xFFD9C7FF)],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.7)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF5B21B6).withValues(alpha: 0.08),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ElMenúXFA',
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w800,
              color: AppColors.accent,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Tu restaurante más cerca de tus clientes',
            style: GoogleFonts.manrope(
              fontSize: 28,
              height: 1.15,
              fontWeight: FontWeight.w800,
              color: AppColors.textStrong,
            ),
          ),
          const SizedBox(height: 18),
          const _PromoBullet(text: 'Menú digital con QR'),
          const _PromoBullet(text: 'Pedidos por WhatsApp'),
          const _PromoBullet(text: 'Panel de administración'),
          const SizedBox(height: 28),
          Center(
            child: Container(
              width: 210,
              height: 360,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF111827),
                borderRadius: BorderRadius.circular(36),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 24,
                    offset: const Offset(0, 16),
                  ),
                ],
              ),
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
                decoration: BoxDecoration(
                  color: const Color(0xFF1F1635),
                  borderRadius: BorderRadius.circular(26),
                ),
                child: Column(
                  children: [
                    Text(
                      'La Buena Mesa',
                      style: GoogleFonts.manrope(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Cocina que conecta',
                      style: GoogleFonts.manrope(
                        color: Colors.white70,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Expanded(
                      child: GridView.count(
                        crossAxisCount: 2,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 1.05,
                        physics: const NeverScrollableScrollPhysics(),
                        children: const [
                          _MenuTile(label: 'Entradas'),
                          _MenuTile(label: 'Platos fuertes'),
                          _MenuTile(label: 'Bebidas'),
                          _MenuTile(label: 'Postres'),
                        ],
                      ),
                    ),
                    Container(
                      width: double.infinity,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.accent,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text(
                        'Ver Menú',
                        style: GoogleFonts.manrope(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 22),
          Center(
            child: Text(
              '“Tu sabor, en cada mesa”',
              style: GoogleFonts.manrope(
                color: AppColors.textSoft,
                fontStyle: FontStyle.italic,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PromoBullet extends StatelessWidget {
  const _PromoBullet({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          const Icon(
            Icons.check_circle_rounded,
            color: AppColors.success,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w700,
                color: AppColors.textStrong,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: GoogleFonts.manrope(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _CheckoutScroll extends StatelessWidget {
  const _CheckoutScroll({
    required this.padding,
    required this.checkout,
    required this.selectedCode,
    required this.paying,
    required this.cancelling,
    required this.error,
    required this.compact,
    required this.stickyCta,
    required this.onSelectMethod,
    required this.onContinue,
    required this.onCancelPending,
    required this.onDashboard,
    required this.onRetryCrypto,
  });

  final EdgeInsets padding;
  final BillingCheckoutContext checkout;
  final String? selectedCode;
  final bool paying;
  final bool cancelling;
  final String? error;
  final bool compact;
  final bool stickyCta;
  final ValueChanged<String> onSelectMethod;
  final VoidCallback onContinue;
  final VoidCallback onCancelPending;
  final VoidCallback onDashboard;
  final VoidCallback onRetryCrypto;

  @override
  Widget build(BuildContext context) {
    final data = checkout.snapshot;
    final methods = checkoutPaymentMethods(checkout.methods);
    final selected = methods
        .where((item) => item.code == selectedCode)
        .toList();
    final selectedMethod = selected.isEmpty ? null : selected.first;
    final usd = data.plan?.priceAmount ?? 10;
    final ves = checkout.vesAmountForUsd(usd);
    final canPay =
        !data.hasActiveSubscription && checkout.pendingSubmission == null;
    final continueEnabled =
        canPay &&
        selectedMethod != null &&
        !paying &&
        (selectedMethod.isPagoMovil ? ves != null : true);

    String continueLabel = 'Continuar con el pago';
    if (selectedMethod?.isPagoMovil == true && ves != null) {
      continueLabel = 'Pagar ${formatBolivares(ves)}';
    } else if (selectedMethod?.isGiftCard == true) {
      continueLabel = 'Canjear tarjeta de regalo';
    } else if (selectedMethod?.isCrypto == true) {
      continueLabel = 'Pagar con Binance Pay';
    }

    final children = <Widget>[
      _PlanCard(plan: data.plan, compact: compact),
      const SizedBox(height: 14),
      _StatusCard(data: data),
      if (error != null) ...[
        const SizedBox(height: 12),
        Text(
          error!,
          style: GoogleFonts.manrope(
            color: AppColors.danger,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
      if (checkout.pendingSubmission != null) ...[
        const SizedBox(height: 14),
        _PendingCard(
          submission: checkout.pendingSubmission!,
          methods: checkout.methods,
          cancelling: cancelling,
          onCancel: onCancelPending,
        ),
      ] else if (checkout.latestSubmission?.isRejected == true) ...[
        const SizedBox(height: 14),
        _RejectedCard(submission: checkout.latestSubmission!),
      ],
      if (canPay) ...[
        const SizedBox(height: 14),
        _MethodsCard(
          methods: methods,
          selectedCode: selectedCode,
          ves: ves,
          bcvRate: checkout.bcvRate,
          compact: compact,
          onSelect: onSelectMethod,
        ),
      ],
      if (!stickyCta && canPay) ...[
        const SizedBox(height: 16),
        _ContinueButton(
          enabled: continueEnabled,
          paying: paying,
          label: continueLabel,
          onPressed: onContinue,
        ),
        const SizedBox(height: 10),
        const _SecureNote(),
      ],
      if (data.hasActiveSubscription) ...[
        const SizedBox(height: 16),
        FilledButton(
          onPressed: onDashboard,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: Text(
            'Ir al panel',
            style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
          ),
        ),
      ],
      if (data.requiresPaymentToPublish) ...[
        const SizedBox(height: 10),
        TextButton(
          onPressed: onDashboard,
          child: Text(
            'Continuar editando borrador',
            style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
          ),
        ),
      ],
      if (data.latestPayment != null &&
          (data.latestPayment!.status == 'expired' ||
              data.latestPayment!.status == 'failed' ||
              data.latestPayment!.status == 'partially_paid')) ...[
        TextButton(
          onPressed: paying ? null : onRetryCrypto,
          child: Text(
            'Generar nuevo checkout de Binance Pay',
            style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
          ),
        ),
      ],
      if (stickyCta) const SizedBox(height: 8),
    ];

    final scrollable = stickyCta
        ? ListView(padding: padding, children: children)
        : Padding(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          );

    if (!stickyCta || !canPay) return scrollable;

    return Column(
      children: [
        Expanded(child: scrollable),
        SafeArea(
          top: false,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            decoration: BoxDecoration(
              color: AppColors.canvas.withValues(alpha: 0.96),
              border: const Border(
                top: BorderSide(color: AppColors.borderSubtle),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ContinueButton(
                  enabled: continueEnabled,
                  paying: paying,
                  label: continueLabel,
                  onPressed: onContinue,
                ),
                const SizedBox(height: 8),
                const _SecureNote(),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.compact});

  final BillingPlan? plan;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (compact) ...[
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.workspace_premium_rounded,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Tu plan actual',
                        style: GoogleFonts.manrope(
                          color: AppColors.textSoft,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        plan?.name ?? 'Menú Digital',
                        style: GoogleFonts.manrope(
                          fontWeight: FontWeight.w800,
                          fontSize: 20,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              plan?.priceLabel ?? '\$10 USD',
              style: GoogleFonts.manrope(
                fontWeight: FontWeight.w800,
                fontSize: 28,
                color: AppColors.textStrong,
                height: 1,
              ),
            ),
            Text(
              '/ mes',
              style: GoogleFonts.manrope(
                color: AppColors.textSoft,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              plan?.description ??
                  'Menú digital con QR, pedidos y panel de administración.',
              style: GoogleFonts.manrope(
                color: AppColors.textSoft,
                height: 1.35,
              ),
            ),
          ] else
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.workspace_premium_rounded,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Tu plan actual',
                        style: GoogleFonts.manrope(
                          color: AppColors.textSoft,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        plan?.name ?? 'Menú Digital',
                        style: GoogleFonts.manrope(
                          fontWeight: FontWeight.w800,
                          fontSize: 24,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        plan?.description ??
                            'Menú digital con QR, pedidos y panel de administración.',
                        style: GoogleFonts.manrope(
                          color: AppColors.textSoft,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      plan?.priceLabel ?? '\$10 USD',
                      style: GoogleFonts.manrope(
                        fontWeight: FontWeight.w800,
                        fontSize: 28,
                        color: AppColors.textStrong,
                      ),
                    ),
                    Text(
                      '/ mes',
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _FeatureChip(
                icon: Icons.qr_code_2_rounded,
                label: compact ? 'Menú QR' : 'Menú con QR personalizado',
              ),
              _FeatureChip(
                icon: Icons.chat_rounded,
                label: compact ? 'WhatsApp' : 'Pedidos por WhatsApp',
              ),
              _FeatureChip(
                icon: Icons.bar_chart_rounded,
                label: compact ? 'Panel' : 'Panel de administración',
              ),
              _FeatureChip(
                icon: Icons.support_agent_rounded,
                label: compact ? 'Soporte' : 'Soporte técnico',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FeatureChip extends StatelessWidget {
  const _FeatureChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.accent),
          const SizedBox(width: 6),
          Text(
            label,
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.data});

  final BillingSnapshot data;

  @override
  Widget build(BuildContext context) {
    final active = data.hasActiveSubscription;
    final tone = billingStatusTone(data);
    return _SurfaceCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              active ? Icons.play_arrow_rounded : Icons.pause_rounded,
              color: tone,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      'Estado de suscripción',
                      style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                    ),
                    _Pill(label: billingStatusLabel(data), tone: tone),
                  ],
                ),
                if (data.subscription?.currentPeriodEnd != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Próxima renovación: ${formatBillingDate(data.subscription!.currentPeriodEnd!)}',
                    style: GoogleFonts.manrope(
                      color: AppColors.textSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                if (data.requiresPaymentToPublish) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Tu menú está deshabilitado hasta que actives el plan. Elige un método de pago y completa la verificación.',
                    style: GoogleFonts.manrope(
                      color: AppColors.textSoft,
                      height: 1.4,
                    ),
                  ),
                ],
                if (data.latestPayment?.status == 'partially_paid') ...[
                  const SizedBox(height: 8),
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
        ],
      ),
    );
  }
}

class _MethodsCard extends StatelessWidget {
  const _MethodsCard({
    required this.methods,
    required this.selectedCode,
    required this.ves,
    required this.bcvRate,
    required this.compact,
    required this.onSelect,
  });

  final List<PaymentMethodCatalog> methods;
  final String? selectedCode;
  final double? ves;
  final double? bcvRate;
  final bool compact;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Elige tu método de pago',
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w800,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Activa tu plan de forma rápida y segura.',
            style: GoogleFonts.manrope(color: AppColors.textSoft),
          ),
          const SizedBox(height: 14),
          if (methods.isEmpty)
            Text(
              'No hay métodos automáticos disponibles ahora.',
              style: GoogleFonts.manrope(color: AppColors.textSoft),
            )
          else
            ...methods.map((method) {
              final selected = method.code == selectedCode;
              String subtitle = method.tagline;
              String? badge;
              Color? badgeTone;
              if (method.isCrypto) {
                badge = 'Recomendado';
                badgeTone = const Color(0xFFBE185D);
              } else if (method.isPagoMovil) {
                badge = 'Nuevo';
                badgeTone = AppColors.success;
                subtitle = ves == null
                    ? 'Paga desde tu banco de Venezuela. Confirmación automática.'
                    : 'Transfiere ${formatBolivares(ves!)} · tasa BCV'
                          '${bcvRate == null ? '' : ' ${bcvRate!.toStringAsFixed(2)}'}';
              }
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _MethodChoice(
                  method: method,
                  subtitle: subtitle,
                  selected: selected,
                  compact: compact,
                  badge: badge,
                  badgeTone: badgeTone,
                  onTap: () => onSelect(method.code),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _MethodChoice extends StatelessWidget {
  const _MethodChoice({
    required this.method,
    required this.subtitle,
    required this.selected,
    required this.compact,
    required this.onTap,
    this.badge,
    this.badgeTone,
  });

  final PaymentMethodCatalog method;
  final String subtitle;
  final bool selected;
  final bool compact;
  final VoidCallback onTap;
  final String? badge;
  final Color? badgeTone;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? const Color(0xFFF5F0FF) : AppColors.surfaceMuted,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 12 : 14,
            vertical: compact ? 12 : 14,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected ? AppColors.accent : Colors.transparent,
              width: 1.6,
            ),
          ),
          child: Row(
            children: [
              PaymentMethodMark(method: method, size: compact ? 44 : 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          method.name,
                          style: GoogleFonts.manrope(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                        if (badge != null)
                          _Pill(
                            label: badge!,
                            tone: badgeTone ?? AppColors.accent,
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.manrope(
                        color: AppColors.textSoft,
                        fontSize: 12,
                        height: 1.35,
                        fontWeight: method.isPagoMovil
                            ? FontWeight.w700
                            : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.chevron_right_rounded,
                color: selected ? AppColors.accent : AppColors.textSoft,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({
    required this.submission,
    required this.methods,
    required this.cancelling,
    required this.onCancel,
  });

  final PaymentSubmission submission;
  final List<PaymentMethodCatalog> methods;
  final bool cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    PaymentMethodCatalog? method;
    for (final item in methods) {
      if (item.code == submission.methodCode) {
        method = item;
        break;
      }
    }
    final auto = method?.isPagoMovil == true || method?.isAutomatic == true;
    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            auto ? 'Confirmando tu pago' : 'Pago en revisión',
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w800,
              color: auto ? AppColors.success : AppColors.warning,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            auto
                ? 'Registramos ${method?.name ?? submission.methodCode}. Estamos confirmándolo automáticamente. No envíes otro pago.'
                : 'Enviamos ${method?.name ?? submission.methodCode} '
                      '(\$${submission.amountUsd.toStringAsFixed(0)} USD). '
                      'Un administrador lo confirma.',
            style: GoogleFonts.manrope(color: AppColors.textSoft, height: 1.4),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: cancelling ? null : onCancel,
            child: Text(
              cancelling ? 'Cancelando…' : 'Cancelar esta solicitud',
              style: GoogleFonts.manrope(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _RejectedCard extends StatelessWidget {
  const _RejectedCard({required this.submission});

  final PaymentSubmission submission;

  @override
  Widget build(BuildContext context) {
    return _SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'El último pago fue rechazado',
            style: GoogleFonts.manrope(
              fontWeight: FontWeight.w800,
              color: AppColors.danger,
            ),
          ),
          if (submission.reviewNote != null) ...[
            const SizedBox(height: 6),
            Text(
              submission.reviewNote!,
              style: GoogleFonts.manrope(
                color: AppColors.textSoft,
                height: 1.4,
              ),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            'Puedes enviar otro pago con los datos correctos.',
            style: GoogleFonts.manrope(color: AppColors.textSoft),
          ),
        ],
      ),
    );
  }
}

class _ContinueButton extends StatelessWidget {
  const _ContinueButton({
    required this.enabled,
    required this.paying,
    required this.label,
    required this.onPressed,
  });

  final bool enabled;
  final bool paying;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: enabled ? onPressed : null,
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        disabledBackgroundColor: const Color(0xFFD6D3DE),
        disabledForegroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      child: paying
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: Colors.white,
              ),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_rounded, size: 18),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.manrope(fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.arrow_forward_rounded, size: 18),
              ],
            ),
    );
  }
}

class _SecureNote extends StatelessWidget {
  const _SecureNote();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(Icons.verified_user_outlined, size: 16, color: AppColors.textSoft),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            'Tus pagos son procesados de forma segura',
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.manrope(
              color: AppColors.textSoft,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _SurfaceCard extends StatelessWidget {
  const _SurfaceCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.borderSubtle),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF5B21B6).withValues(alpha: 0.04),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.tone});

  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: GoogleFonts.manrope(
          color: tone,
          fontWeight: FontWeight.w800,
          fontSize: 11,
        ),
      ),
    );
  }
}

String billingStatusLabel(BillingSnapshot data) {
  if (data.hasActiveSubscription) return 'Activa';
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

Color billingStatusTone(BillingSnapshot data) {
  if (data.hasActiveSubscription) return AppColors.success;
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

String formatBillingDate(DateTime value) {
  final local = value.toLocal();
  final y = local.year.toString().padLeft(4, '0');
  final m = local.month.toString().padLeft(2, '0');
  final d = local.day.toString().padLeft(2, '0');
  return '$d/$m/$y';
}
