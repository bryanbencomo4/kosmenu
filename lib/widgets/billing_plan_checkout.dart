import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl_phone_field/country_picker_dialog.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/models/kit_shipping_draft.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/utils/phone_national_normalize.dart';
import 'package:kosmenu_app/widgets/payment_method_mark.dart';

/// Default selection when Pago Móvil is available.
const String kCheckoutUiPagoMovil = 'pago_movil';

const double _kitExtraUnitUsd = 2.5;

/// Display titles — same as elmenuxfa.com (`--font-display` = Montserrat).
TextStyle _display({
  FontWeight fontWeight = FontWeight.w700,
  double fontSize = 16,
  Color? color,
  double? height,
  double? letterSpacing,
}) {
  return GoogleFonts.montserrat(
    fontWeight: fontWeight,
    fontSize: fontSize,
    color: color ?? AppColors.textStrong,
    height: height,
    letterSpacing: letterSpacing,
  );
}

/// Body copy — same as elmenuxfa.com (`--font-body` = Roboto).
TextStyle _body({
  FontWeight fontWeight = FontWeight.w500,
  double fontSize = 14,
  Color? color,
  double? height,
  double? letterSpacing,
}) {
  return GoogleFonts.roboto(
    fontWeight: fontWeight,
    fontSize: fontSize,
    color: color ?? AppColors.textSoft,
    height: height,
    letterSpacing: letterSpacing,
  );
}

class BillingPlanCheckoutView extends StatelessWidget {
  const BillingPlanCheckoutView({
    super.key,
    required this.checkout,
    required this.selectedCode,
    required this.planCode,
    required this.paying,
    required this.cancelling,
    required this.error,
    required this.shipping,
    required this.onShippingChanged,
    required this.onSelectMethod,
    required this.onSelectPlan,
    required this.onContinue,
    required this.onCancelPending,
    required this.onDashboard,
    required this.onHelp,
    required this.onRetryCrypto,
    this.onSaveShipping,
    this.onEditDelivery,
    this.showAppHeader = true,
  });

  final BillingCheckoutContext checkout;
  final String? selectedCode;
  final String planCode;
  final bool paying;
  final bool cancelling;
  final String? error;
  final KitShippingDraft shipping;
  final ValueChanged<KitShippingDraft> onShippingChanged;
  final ValueChanged<String> onSelectMethod;
  final ValueChanged<String> onSelectPlan;
  final VoidCallback onContinue;
  final VoidCallback onCancelPending;
  final VoidCallback onDashboard;
  final VoidCallback onHelp;
  final VoidCallback onRetryCrypto;
  final VoidCallback? onSaveShipping;
  final VoidCallback? onEditDelivery;
  final bool showAppHeader;

  /// When false, summary uses a local placeholder (golden/screenshot tests).
  static bool loadProductImage = true;

  bool get _isYearly => planCode == 'menu_yearly';

  double get _planUsd {
    if (_isYearly) return checkout.yearlyPlan?.priceAmount ?? 90;
    return checkout.monthlyPlan?.priceAmount ?? 10;
  }

  double get _extrasUsd => shipping.extrasQty * _kitExtraUnitUsd;
  double get _totalUsd => _planUsd + _extrasUsd;

  List<PaymentMethodCatalog> get _methods =>
      checkoutPaymentMethods(checkout.methods);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 960;
        final padH = wide ? 28.0 : 20.0;

        return ColoredBox(
          color: const Color(0xFFFAF8FC),
          child: Column(
            children: [
              if (showAppHeader) _CheckoutHeader(onHelp: onHelp),
              Expanded(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1080),
                    child: wide
                        ? SingleChildScrollView(
                            padding: EdgeInsets.fromLTRB(padH, 16, padH, 32),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  flex: 58,
                                  child: _CheckoutFormColumn(
                                    checkout: checkout,
                                    methods: _methods,
                                    selectedCode: selectedCode,
                                    planCode: planCode,
                                    paying: paying,
                                    cancelling: cancelling,
                                    error: error,
                                    shipping: shipping,
                                    planUsd: _planUsd,
                                    totalUsd: _totalUsd,
                                    stickyCta: false,
                                    onShippingChanged: onShippingChanged,
                                    onSelectMethod: onSelectMethod,
                                    onSelectPlan: onSelectPlan,
                                    onContinue: onContinue,
                                    onCancelPending: onCancelPending,
                                    onDashboard: onDashboard,
                                    onRetryCrypto: onRetryCrypto,
                                    onSaveShipping: onSaveShipping,
                                    onEditDelivery: onEditDelivery,
                                  ),
                                ),
                                const SizedBox(width: 28),
                                Expanded(
                                  flex: 42,
                                  child: _OrderSummaryCard(
                                    planUsd: _planUsd,
                                    extrasQty: shipping.extrasQty,
                                    extrasUsd: _extrasUsd,
                                    totalUsd: _totalUsd,
                                    isYearly: _isYearly,
                                    deliveryLabel: shipping.deliverySummaryLabel,
                                    onEditDelivery: onEditDelivery,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : _CheckoutFormColumn(
                            checkout: checkout,
                            methods: _methods,
                            selectedCode: selectedCode,
                            planCode: planCode,
                            paying: paying,
                            cancelling: cancelling,
                            error: error,
                            shipping: shipping,
                            planUsd: _planUsd,
                            totalUsd: _totalUsd,
                            stickyCta: true,
                            showMobileSummary: true,
                            extrasUsd: _extrasUsd,
                            isYearly: _isYearly,
                            padding: EdgeInsets.fromLTRB(padH, 8, padH, 12),
                            onShippingChanged: onShippingChanged,
                            onSelectMethod: onSelectMethod,
                            onSelectPlan: onSelectPlan,
                            onContinue: onContinue,
                            onCancelPending: onCancelPending,
                            onDashboard: onDashboard,
                            onRetryCrypto: onRetryCrypto,
                            onSaveShipping: onSaveShipping,
                            onEditDelivery: onEditDelivery,
                          ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CheckoutHeader extends StatelessWidget {
  const _CheckoutHeader({required this.onHelp});

  final VoidCallback onHelp;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1080),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 16, 28, 8),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.asset(
                    'assets/branding/isotipo.png',
                    width: 36,
                    height: 36,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEE7FF),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.qr_code_2_rounded,
                        size: 20,
                        color: AppColors.accent,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  'elmenuxfa.com',
                  style: _display(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    color: AppColors.accent,
                    letterSpacing: -0.3,
                  ),
                ),
                const Spacer(),
                Material(
                  color: const Color(0xFFEEE7FF),
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    onTap: onHelp,
                    borderRadius: BorderRadius.circular(14),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.lock_rounded,
                            size: 16,
                            color: AppColors.accent,
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Checkout seguro',
                                style: _display(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12.5,
                                  color: AppColors.accent,
                                  height: 1.15,
                                ),
                              ),
                              Text(
                                'Tus datos están protegidos',
                                style: _body(
                                  fontWeight: FontWeight.w500,
                                  fontSize: 11,
                                  color: AppColors.textSoft,
                                  height: 1.2,
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
            ),
          ),
        ),
      ),
    );
  }
}

class _CheckoutFormColumn extends StatelessWidget {
  const _CheckoutFormColumn({
    required this.checkout,
    required this.methods,
    required this.selectedCode,
    required this.planCode,
    required this.paying,
    required this.cancelling,
    required this.error,
    required this.shipping,
    required this.planUsd,
    required this.totalUsd,
    required this.stickyCta,
    required this.onShippingChanged,
    required this.onSelectMethod,
    required this.onSelectPlan,
    required this.onContinue,
    required this.onCancelPending,
    required this.onDashboard,
    required this.onRetryCrypto,
    this.onSaveShipping,
    this.onEditDelivery,
    this.showMobileSummary = false,
    this.extrasUsd = 0,
    this.isYearly = false,
    this.padding = EdgeInsets.zero,
  });

  final BillingCheckoutContext checkout;
  final List<PaymentMethodCatalog> methods;
  final String? selectedCode;
  final String planCode;
  final bool paying;
  final bool cancelling;
  final String? error;
  final KitShippingDraft shipping;
  final double planUsd;
  final double totalUsd;
  final bool stickyCta;
  final ValueChanged<KitShippingDraft> onShippingChanged;
  final ValueChanged<String> onSelectMethod;
  final ValueChanged<String> onSelectPlan;
  final VoidCallback onContinue;
  final VoidCallback onCancelPending;
  final VoidCallback onDashboard;
  final VoidCallback onRetryCrypto;
  final VoidCallback? onSaveShipping;
  final VoidCallback? onEditDelivery;
  final bool showMobileSummary;
  final double extrasUsd;
  final bool isYearly;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final data = checkout.snapshot;
    final canPay =
        !data.hasActiveSubscription && checkout.pendingSubmission == null;
    final contactOk = shipping.isContactValid;
    final methodOk =
        selectedCode != null && methods.any((m) => m.code == selectedCode);
    final continueEnabled = canPay && contactOk && methodOk && !paying;

    final children = <Widget>[
      if (showMobileSummary) ...[
        _OrderSummaryCard(
          planUsd: planUsd,
          extrasQty: shipping.extrasQty,
          extrasUsd: extrasUsd,
          totalUsd: totalUsd,
          isYearly: isYearly,
          deliveryLabel: shipping.deliverySummaryLabel,
          onEditDelivery: onEditDelivery,
          compact: true,
        ),
        const SizedBox(height: 20),
      ],
      if (error != null) ...[
        _ErrorBanner(message: error!),
        const SizedBox(height: 14),
      ],
      if (checkout.pendingSubmission != null) ...[
        _PendingCard(
          submission: checkout.pendingSubmission!,
          cancelling: cancelling,
          onCancel: onCancelPending,
        ),
        const SizedBox(height: 14),
        if (onSaveShipping != null)
          TextButton(
            onPressed: paying ? null : onSaveShipping,
            child: Text(
              'Actualizar datos de envío Zoom',
              style: _display(fontWeight: FontWeight.w700, color: AppColors.accent),
            ),
          ),
      ] else if (checkout.latestSubmission?.isRejected == true) ...[
        _RejectedCard(submission: checkout.latestSubmission!),
        const SizedBox(height: 14),
      ],
      if (canPay) ...[
        _StepHeader(
          number: 1,
          title: 'Elige tu plan',
          subtitle: 'Activa tu menú digital y recibe tu kit físico.',
        ),
        const SizedBox(height: 14),
        _PlanCards(
          planCode: planCode,
          monthlyPrice: checkout.monthlyPlan?.priceAmount ?? 10,
          yearlyPrice: checkout.yearlyPlan?.priceAmount ?? 90,
          onSelect: onSelectPlan,
        ),
        const SizedBox(height: 12),
        const _IncludedBar(),
        const SizedBox(height: 28),
        _ExtrasRow(
          qty: shipping.extrasQty,
          onChanged: (q) => onShippingChanged(shipping.copyWith(extrasQty: q)),
        ),
        const SizedBox(height: 28),
        _StepHeader(
          number: 3,
          title: 'Tus datos',
          subtitle: 'Solo necesitamos algunos datos para tu pedido.',
        ),
        const SizedBox(height: 14),
        _ContactFields(shipping: shipping, onChanged: onShippingChanged),
        const SizedBox(height: 28),
        _StepHeader(
          number: 4,
          title: 'Método de pago',
          subtitle: 'Elige tu método de pago preferido.',
        ),
        const SizedBox(height: 14),
        _PaymentMethodCards(
          methods: methods,
          selectedCode: selectedCode,
          onSelect: onSelectMethod,
          totalUsd: totalUsd,
          bcvRate: checkout.bcvRate,
        ),
        if (!stickyCta) ...[
          const SizedBox(height: 24),
          _ContinueButton(
            enabled: continueEnabled,
            paying: paying,
            onPressed: onContinue,
          ),
          const SizedBox(height: 12),
          const _SecureNote(),
        ],
      ],
      if (data.hasActiveSubscription) ...[
        const SizedBox(height: 16),
        FilledButton(
          onPressed: onDashboard,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.accent,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: Text(
            'Ir al panel',
            style: _display(fontWeight: FontWeight.w700, color: Colors.white),
          ),
        ),
      ],
      if (data.requiresPaymentToPublish &&
          checkout.pendingSubmission == null) ...[
        TextButton(
          onPressed: onDashboard,
          child: Text(
            'Continuar editando borrador',
            style: _body(fontWeight: FontWeight.w700, color: AppColors.accent),
          ),
        ),
      ],
      if (data.latestPayment != null &&
          (data.latestPayment!.status == 'expired' ||
              data.latestPayment!.status == 'failed' ||
              data.latestPayment!.status == 'partially_paid'))
        TextButton(
          onPressed: paying ? null : onRetryCrypto,
          child: Text(
            'Generar nuevo checkout de Binance Pay',
            style: _body(fontWeight: FontWeight.w700, color: AppColors.accent),
          ),
        ),
    ];

    final body = stickyCta
        ? SingleChildScrollView(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          );

    if (!stickyCta || !canPay) return body;

    return Column(
      children: [
        Expanded(child: body),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
            decoration: const BoxDecoration(
              color: Color(0xFFFAF8FC),
              border: Border(top: BorderSide(color: Color(0xFFEDE6F8))),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ContinueButton(
                  enabled: continueEnabled,
                  paying: paying,
                  onPressed: onContinue,
                ),
                const SizedBox(height: 10),
                const _SecureNote(),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({
    required this.number,
    required this.title,
    required this.subtitle,
  });

  final int number;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.accent,
            shape: BoxShape.circle,
          ),
          child: Text(
            '$number',
            style: _display(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: _display(
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: _body(fontSize: 14, height: 1.35),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PlanCards extends StatelessWidget {
  const _PlanCards({
    required this.planCode,
    required this.monthlyPrice,
    required this.yearlyPrice,
    required this.onSelect,
  });

  final String planCode;
  final double monthlyPrice;
  final double yearlyPrice;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _PlanCard(
            selected: planCode == 'menu_monthly',
            title: 'Mensual',
            price: '\$${monthlyPrice.toStringAsFixed(0)} USD / mes',
            description: 'Todo lo que necesitas para empezar, sin permanencia.',
            onTap: () => onSelect('menu_monthly'),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: _PlanCard(
            selected: planCode == 'menu_yearly',
            title: 'Anual',
            price: '\$${yearlyPrice.toStringAsFixed(0)} USD / año',
            description: 'Ahorra 25% y disfruta todo el año por menos.',
            badge: 'Mejor valor',
            onTap: () => onSelect('menu_yearly'),
          ),
        ),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.selected,
    required this.title,
    required this.price,
    required this.description,
    required this.onTap,
    this.badge,
  });

  final bool selected;
  final String title;
  final String price;
  final String description;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? const Color(0xFFF3EEFF) : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AppColors.accent : const Color(0xFFE6DFF3),
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    size: 20,
                    color: selected ? AppColors.accent : const Color(0xFF9B8FB5),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      title,
                      style: _display(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                  ),
                  if (badge != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        badge!,
                        style: _display(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: const Color(0xFFB45309),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                price,
                style: _display(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                description,
                style: _body(fontSize: 13, height: 1.35),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IncludedBar extends StatelessWidget {
  const _IncludedBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF3EEFF),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.card_giftcard_rounded, size: 18, color: AppColors.accent),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Plataforma + kit inicial incluidos en todos los planes.',
              style: _body(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: AppColors.accent,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExtrasRow extends StatelessWidget {
  const _ExtrasRow({required this.qty, required this.onChanged});

  final int qty;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _StepHeader(
            number: 2,
            title: 'Portamenús extra',
            subtitle:
                'Tu kit incluye 4 portamenús físicos tamaño 4x6 pulgadas. Agrega extras para más mesas.',
          ),
        ),
        const SizedBox(width: 12),
        Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE6DFF3)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _StepperBtn(
                    icon: Icons.remove,
                    onTap: qty > 0 ? () => onChanged(qty - 1) : null,
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: Text(
                      '$qty',
                      style: _display(fontWeight: FontWeight.w800, fontSize: 18),
                    ),
                  ),
                  _StepperBtn(
                    icon: Icons.add,
                    onTap: qty < 50 ? () => onChanged(qty + 1) : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '+\$${_kitExtraUnitUsd.toStringAsFixed(2)} USD c/u',
              style: _body(fontSize: 12.5, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ],
    );
  }
}

class _StepperBtn extends StatelessWidget {
  const _StepperBtn({required this.icon, this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF3EEFF),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(
            icon,
            size: 18,
            color: onTap == null ? const Color(0xFFB7A9D4) : AppColors.accent,
          ),
        ),
      ),
    );
  }
}

class _ContactFields extends StatefulWidget {
  const _ContactFields({required this.shipping, required this.onChanged});

  final KitShippingDraft shipping;
  final ValueChanged<KitShippingDraft> onChanged;

  @override
  State<_ContactFields> createState() => _ContactFieldsState();
}

class _ContactFieldsState extends State<_ContactFields> {
  late final TextEditingController _phoneController;
  late String _phoneIso;
  /// Skip controller sync for the update that originated from this field.
  bool _phoneChangeFromField = false;

  @override
  void initState() {
    super.initState();
    _phoneIso = _isoOf(widget.shipping);
    _phoneController = TextEditingController(
      text: nationalDigitsFromStoredPhone(
        widget.shipping.phone,
        iso: _phoneIso,
      ),
    );
  }

  @override
  void didUpdateWidget(covariant _ContactFields oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nextIso = _isoOf(widget.shipping);
    final nextNational = nationalDigitsFromStoredPhone(
      widget.shipping.phone,
      iso: nextIso,
    );
    if (nextIso != _phoneIso) {
      _phoneIso = nextIso;
    }
    if (_phoneChangeFromField) {
      _phoneChangeFromField = false;
      return;
    }
    // Prefill / external updates only — never push dial-only "58" back in.
    if (nextNational != _phoneController.text &&
        (oldWidget.shipping.phone != widget.shipping.phone ||
            oldWidget.shipping.phoneCountryIso !=
                widget.shipping.phoneCountryIso)) {
      _phoneController.value = TextEditingValue(
        text: nextNational,
        selection: TextSelection.collapsed(offset: nextNational.length),
      );
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  static String _isoOf(KitShippingDraft shipping) {
    final iso = shipping.phoneCountryIso.trim();
    return iso.isEmpty ? 'VE' : iso.toUpperCase();
  }

  InputDecoration _dec(String label, {IconData? icon, String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: icon == null
          ? null
          : Icon(icon, size: 20, color: const Color(0xFF9B8FB5)),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE6DFF3)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
      ),
      labelStyle: _body(fontSize: 14, fontWeight: FontWeight.w500),
      hintStyle: _body(fontSize: 14, color: const Color(0xFFB0A4C7)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shipping = widget.shipping;
    final onChanged = widget.onChanged;
    final iso = _phoneIso;

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: TextFormField(
                initialValue: shipping.recipientName,
                textCapitalization: TextCapitalization.words,
                style: _body(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textStrong,
                ),
                decoration: _dec(
                  'Nombre completo',
                  icon: Icons.person_outline_rounded,
                  hint: 'Ej. María González',
                ),
                onChanged: (v) =>
                    onChanged(shipping.copyWith(recipientName: v)),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: TextFormField(
                initialValue: shipping.email,
                keyboardType: TextInputType.emailAddress,
                style: _body(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textStrong,
                ),
                decoration: _dec(
                  'Correo electrónico',
                  icon: Icons.mail_outline_rounded,
                  hint: 'Ej. tu@correo.com',
                ),
                onChanged: (v) => onChanged(shipping.copyWith(email: v)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        IntlPhoneField(
          key: ValueKey('checkout-phone-$iso'),
          controller: _phoneController,
          initialCountryCode: iso,
          languageCode: 'es',
          style: _body(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.textStrong,
          ),
          dropdownTextStyle: _body(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.textStrong,
          ),
          pickerDialogStyle: PickerDialogStyle(
            backgroundColor: Colors.white,
            countryNameStyle: _body(
              fontWeight: FontWeight.w700,
              color: AppColors.textStrong,
            ),
            countryCodeStyle: _body(color: AppColors.textSoft),
            searchFieldInputDecoration: InputDecoration(
              labelText: 'Buscar país',
              hintText: 'Ej. Venezuela, Colombia',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          invalidNumberMessage: 'Número inválido para ese país.',
          // Custom validator must own length+format; package length-only check
          // accepts any 10 digits (e.g. 0061680315 for VE).
          disableLengthCheck: true,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          inputFormatters: <TextInputFormatter>[
            FilteringTextInputFormatter.digitsOnly,
            // Soft normalize while typing (trunk 0 / pasted dial) — does not
            // rewrite the controller from parent state.
            NormalizeNationalPhoneFormatter(
              iso: iso,
              maxNationalLength: 10,
            ),
          ],
          decoration: _dec(
            'Número de teléfono / WhatsApp',
            hint: 'Ej. 4141234567',
          ),
          validator: (phone) {
            final code = (phone?.countryISOCode ?? iso).toUpperCase();
            return phoneValidationMessage(
              nationalDigits: phone?.number ?? '',
              iso: code,
            );
          },
          onCountryChanged: (country) {
            _phoneIso = country.code;
            // New country → clear so the customer retypes a valid local number.
            _phoneController.clear();
            _phoneChangeFromField = true;
            onChanged(
              shipping.copyWith(
                phone: '',
                phoneCountryIso: country.code,
              ),
            );
          },
          onChanged: (phone) {
            // phone.completeNumber is "+58" / "58" when the national part is
            // empty — never persist that, or clearing re-fills the field with 58.
            final national = nationalDigitsFromStoredPhone(
              phone.number,
              iso: phone.countryISOCode,
            );
            final dial = phone.countryCode.replaceAll(RegExp(r'\D'), '');
            final stored = national.isEmpty ? '' : '+$dial$national';
            _phoneChangeFromField = true;
            onChanged(
              shipping.copyWith(
                phone: stored,
                phoneCountryIso: phone.countryISOCode,
              ),
            );
          },
        ),
      ],
    );
  }
}

class _PaymentMethodCards extends StatelessWidget {
  const _PaymentMethodCards({
    required this.methods,
    required this.selectedCode,
    required this.onSelect,
    required this.totalUsd,
    this.bcvRate,
  });

  final List<PaymentMethodCatalog> methods;
  final String? selectedCode;
  final ValueChanged<String> onSelect;
  final double totalUsd;
  final double? bcvRate;

  @override
  Widget build(BuildContext context) {
    if (methods.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF2F2),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFECACA)),
        ),
        child: Text(
          'No hay métodos de pago disponibles ahora. Contacta soporte.',
          style: _body(
            color: AppColors.danger,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    return Column(
      children: [
        for (var i = 0; i < methods.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          _PayCard(
            method: methods[i],
            selected: selectedCode == methods[i].code,
            onTap: () => onSelect(methods[i].code),
            totalUsd: totalUsd,
            bcvRate: bcvRate,
          ),
        ],
      ],
    );
  }
}

String _paymentMethodSubtitle(PaymentMethodCatalog method) {
  if (method.code == 'crypto_usdt') {
    return 'Transfiere USDT · se activa al confirmar la red';
  }
  if (method.tagline.isNotEmpty) return method.tagline;
  return method.instructions ?? '';
}

class _PayCard extends StatelessWidget {
  const _PayCard({
    required this.method,
    required this.selected,
    required this.onTap,
    required this.totalUsd,
    this.bcvRate,
  });

  final PaymentMethodCatalog method;
  final bool selected;
  final VoidCallback onTap;
  final double totalUsd;
  final double? bcvRate;

  @override
  Widget build(BuildContext context) {
    final rate = bcvRate;
    final vesTotal = method.isPagoMovil
        ? vesAmountFromUsd(usd: totalUsd, bcvRate: rate)
        : null;

    return Material(
      color: selected ? const Color(0xFFF3EEFF) : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          constraints: const BoxConstraints(minHeight: 92),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AppColors.accent : const Color(0xFFE6DFF3),
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PaymentMethodMark(method: method, size: 56),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            method.name,
                            style: _display(
                              fontWeight: FontWeight.w800,
                              fontSize: 15.5,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          selected
                              ? Icons.radio_button_checked
                              : Icons.radio_button_off,
                          color: selected
                              ? AppColors.accent
                              : const Color(0xFFB0A4C7),
                          size: 22,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _paymentMethodSubtitle(method),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: _body(fontSize: 12.5, height: 1.35),
                    ),
                    if (vesTotal != null && rate != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                        decoration: BoxDecoration(
                          color: selected
                              ? Colors.white
                              : const Color(0xFFF7F4FC),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFE6DFF3)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Total a pagar: ${formatBolivares(vesTotal)}',
                              style: _display(
                                fontWeight: FontWeight.w800,
                                fontSize: 13.5,
                                color: AppColors.accent,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Tasa BCV: ${formatBolivares(rate)} / USD',
                              style: _body(fontSize: 12, height: 1.3),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ContinueButton extends StatelessWidget {
  const _ContinueButton({
    required this.enabled,
    required this.paying,
    required this.onPressed,
  });

  final bool enabled;
  final bool paying;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          colors: enabled
              ? const [Color(0xFF7C3AED), Color(0xFF5B21B6)]
              : [const Color(0xFFC4B5FD), const Color(0xFFA78BFA)],
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled && !paying ? onPressed : null,
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            height: 52,
            width: double.infinity,
            child: Center(
              child: paying
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      'Continuar al pago →',
                      style: _display(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SecureNote extends StatelessWidget {
  const _SecureNote();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.lock_outline_rounded, size: 14, color: Color(0xFF9B8FB5)),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            'Proceso seguro y encriptado. Tu información está protegida.',
            textAlign: TextAlign.center,
            style: _body(fontSize: 12.5),
          ),
        ),
      ],
    );
  }
}

class _OrderSummaryCard extends StatelessWidget {
  const _OrderSummaryCard({
    required this.planUsd,
    required this.extrasQty,
    required this.extrasUsd,
    required this.totalUsd,
    required this.isYearly,
    this.deliveryLabel = 'Zoom Venezuela · flete al retirar',
    this.onEditDelivery,
    this.compact = false,
  });

  final double planUsd;
  final int extrasQty;
  final double extrasUsd;
  final double totalUsd;
  final bool isYearly;
  final String deliveryLabel;
  final VoidCallback? onEditDelivery;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final features = const [
      'Menú digital con QR',
      'Pedidos por WhatsApp',
      'Panel de administración',
      'Soporte técnico',
      '4 portamenús físicos 4x6 pulgadas incluidos',
      'QR personalizado',
    ];

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(compact ? 16 : 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE6DFF3)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF5B21B6).withValues(alpha: 0.07),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  color: Color(0xFFF3EEFF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.shopping_cart_outlined,
                  size: 18,
                  color: AppColors.accent,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Resumen de tu compra',
                      style: _display(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Revisa los detalles de tu pedido antes de continuar.',
                      style: _body(fontSize: 13, height: 1.3),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.auto_awesome, size: 16, color: Color(0xFFF59E0B)),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: compact ? 96 : 120,
                height: compact ? 140 : 176,
                child: BillingPlanCheckoutView.loadProductImage
                    ? Image.asset(
                        'assets/branding/table_tent.png',
                        fit: BoxFit.contain,
                        errorBuilder: (context, error, stackTrace) =>
                            const _ProductImageFallback(),
                      )
                    : const _ProductImageFallback(),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Menú Inteligente',
                      style: _display(fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                    Text(
                      'Tu restaurante en la palma de la mano.',
                      style: _body(fontSize: 12.5, height: 1.3),
                    ),
                    const SizedBox(height: 10),
                    for (final item in features)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 1),
                              child: Icon(
                                Icons.check_circle_rounded,
                                size: 15,
                                color: AppColors.accent,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                item,
                                style: _body(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                  height: 1.3,
                                  color: AppColors.textStrong,
                                ),
                              ),
                            ),
                          ],
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.straighten_rounded, size: 16, color: Color(0xFFB45309)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      style: _body(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: const Color(0xFF92400E),
                      ),
                      children: [
                        const TextSpan(text: 'Los portamenús incluidos son de '),
                        TextSpan(
                          text: '4x6 pulgadas.',
                          style: _display(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: const Color(0xFF92400E),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Divider(height: 1, color: Color(0xFFEDE6F8)),
          const SizedBox(height: 14),
          _MoneyRow(
            label: isYearly ? 'Plan anual' : 'Plan mensual',
            value: '\$${planUsd.toStringAsFixed(0)} USD',
          ),
          _MoneyRow(
            label: 'Portamenús extra ($extrasQty x \$2.50)',
            value: '\$${extrasUsd.toStringAsFixed(extrasUsd == 0 ? 0 : 2)} USD',
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: const Color(0xFFF3EEFF),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Total a pagar hoy',
                    style: _display(fontWeight: FontWeight.w800, fontSize: 14),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '\$${totalUsd.toStringAsFixed(totalUsd % 1 == 0 ? 0 : 2)} USD',
                  style: _display(
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                    color: AppColors.accent,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Material(
            color: const Color(0xFFFAF8FC),
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              onTap: onEditDelivery,
              borderRadius: BorderRadius.circular(14),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE6DFF3)),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.local_shipping_rounded,
                      size: 20,
                      color: AppColors.accent,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Entrega del kit',
                            style: _display(
                              fontWeight: FontWeight.w800,
                              fontSize: 13.5,
                            ),
                          ),
                          Text(
                            deliveryLabel,
                            style: _body(fontSize: 12.5),
                          ),
                        ],
                      ),
                    ),
                    if (onEditDelivery != null) ...[
                      const SizedBox(width: 8),
                      Text(
                        'Cambiar',
                        style: _display(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: AppColors.accent,
                        ),
                      ),
                      const SizedBox(width: 2),
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: 20,
                        color: AppColors.accent,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductImageFallback extends StatelessWidget {
  const _ProductImageFallback();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        color: Color(0xFFF3EEFF),
        borderRadius: BorderRadius.all(Radius.circular(10)),
      ),
      child: Center(
        child: Icon(Icons.qr_code_2_rounded, color: AppColors.accent, size: 40),
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: _body(fontSize: 13.5)),
          ),
          Text(
            value,
            style: _display(fontSize: 13.5, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Text(
        message,
        style: _body(
          color: AppColors.danger,
          fontWeight: FontWeight.w700,
          fontSize: 13.5,
        ),
      ),
    );
  }
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({
    required this.submission,
    required this.cancelling,
    required this.onCancel,
  });

  final PaymentSubmission submission;
  final bool cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Pago en revisión',
            style: _display(fontWeight: FontWeight.w800, color: AppColors.warning),
          ),
          const SizedBox(height: 6),
          Text(
            'Recibimos tu pago (\$${submission.amountUsd.toStringAsFixed(0)} USD). Te avisamos por correo cuando lo verifiquemos.',
            style: _body(fontSize: 13.5, height: 1.4),
          ),
          TextButton(
            onPressed: cancelling ? null : onCancel,
            child: Text(
              cancelling ? 'Cancelando…' : 'Cancelar esta solicitud',
              style: _display(fontWeight: FontWeight.w800, color: AppColors.accent),
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
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Text(
        'Tu pago anterior fue rechazado${(submission.reviewNote ?? '').isEmpty ? '.' : ': ${submission.reviewNote}'}. Puedes intentar de nuevo.',
        style: _body(
          color: AppColors.danger,
          fontWeight: FontWeight.w700,
          fontSize: 13.5,
          height: 1.4,
        ),
      ),
    );
  }
}
