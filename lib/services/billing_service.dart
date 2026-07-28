import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class BillingPlan {
  const BillingPlan({
    required this.id,
    required this.code,
    required this.name,
    required this.description,
    required this.priceAmount,
    required this.priceCurrency,
    required this.billingInterval,
  });

  final String id;
  final String code;
  final String name;
  final String description;
  final double priceAmount;
  final String priceCurrency;
  final String billingInterval;

  factory BillingPlan.fromRow(Map<String, dynamic> row) {
    return BillingPlan(
      id: '${row['id'] ?? ''}',
      code: '${row['code'] ?? ''}',
      name: '${row['name'] ?? ''}',
      description: '${row['description'] ?? ''}',
      priceAmount: _asDouble(row['price_amount']),
      priceCurrency: '${row['price_currency'] ?? 'USD'}',
      billingInterval: '${row['billing_interval'] ?? 'month'}',
    );
  }

  String get priceLabel {
    final amount = priceAmount.toStringAsFixed(
      priceAmount.truncateToDouble() == priceAmount ? 0 : 2,
    );
    return '\$$amount $priceCurrency';
  }
}

class BillingSubscription {
  const BillingSubscription({
    required this.id,
    required this.status,
    required this.currentPeriodStart,
    required this.currentPeriodEnd,
    required this.gracePeriodEnd,
    required this.cancelAtPeriodEnd,
    required this.planId,
  });

  final String id;
  final String status;
  final DateTime? currentPeriodStart;
  final DateTime? currentPeriodEnd;
  final DateTime? gracePeriodEnd;
  final bool cancelAtPeriodEnd;
  final String planId;

  factory BillingSubscription.fromRow(Map<String, dynamic> row) {
    return BillingSubscription(
      id: '${row['id'] ?? ''}',
      status: '${row['status'] ?? 'pending'}',
      currentPeriodStart: _asDate(row['current_period_start']),
      currentPeriodEnd: _asDate(row['current_period_end']),
      gracePeriodEnd: _asDate(row['grace_period_end']),
      cancelAtPeriodEnd: row['cancel_at_period_end'] == true,
      planId: '${row['plan_id'] ?? ''}',
    );
  }

  bool get isActive => status == 'active';
  bool get needsPayment =>
      status == 'pending' ||
      status == 'past_due' ||
      status == 'suspended' ||
      status == 'cancelled';
}

class BillingPayment {
  const BillingPayment({
    required this.id,
    required this.orderId,
    required this.status,
    required this.amount,
    required this.currency,
    required this.paidAmount,
    required this.checkoutUrl,
    required this.expiresAt,
    required this.paidAt,
    required this.periodEnd,
  });

  final String id;
  final String orderId;
  final String status;
  final double amount;
  final String currency;
  final double? paidAmount;
  final String? checkoutUrl;
  final DateTime? expiresAt;
  final DateTime? paidAt;
  final DateTime? periodEnd;

  factory BillingPayment.fromRow(Map<String, dynamic> row) {
    return BillingPayment(
      id: '${row['id'] ?? ''}',
      orderId: '${row['order_id'] ?? ''}',
      status: '${row['status'] ?? 'open'}',
      amount: _asDouble(row['amount']),
      currency: '${row['currency'] ?? 'USD'}',
      paidAmount: row['paid_amount'] == null
          ? null
          : _asDouble(row['paid_amount']),
      checkoutUrl: row['checkout_url']?.toString(),
      expiresAt: _asDate(row['expires_at']),
      paidAt: _asDate(row['paid_at']),
      periodEnd: _asDate(row['period_end']),
    );
  }

  bool get isOpenReusable {
    if (status != 'open' || checkoutUrl == null || checkoutUrl!.isEmpty) {
      return false;
    }
    final exp = expiresAt;
    if (exp == null) return true;
    return exp.isAfter(DateTime.now());
  }
}

class BillingSnapshot {
  const BillingSnapshot({
    required this.plan,
    required this.subscription,
    required this.latestPayment,
    required this.billingExempt,
    required this.businessOnline,
  });

  final BillingPlan? plan;
  final BillingSubscription? subscription;
  final BillingPayment? latestPayment;
  final bool billingExempt;
  final bool businessOnline;

  bool get hasActiveSubscription => subscription?.isActive == true;

  /// Legacy menus stay usable without a Zeno subscription.
  bool get isGrandfathered =>
      billingExempt && !hasActiveSubscription && businessOnline;

  /// May publish / set en_linea=true (legacy exempt or paid).
  bool get canPublish => billingExempt || hasActiveSubscription;

  /// New commerce that still needs Zeno checkout to go public.
  bool get requiresPaymentToPublish => !canPublish;
}

/// Post-auth / post-email-confirm destination (pure; unit-tested).
enum PostAuthDestination { setup, billing, dashboard }

PostAuthDestination resolvePostAuthDestination({
  required bool hasCommerce,
  required bool hasCatalog,
  required bool billingExempt,
  required bool hasActiveSubscription,
}) {
  if (!hasCommerce || !hasCatalog) {
    return PostAuthDestination.setup;
  }
  if (billingExempt || hasActiveSubscription) {
    return PostAuthDestination.dashboard;
  }
  return PostAuthDestination.billing;
}

class CreateCheckoutResult {
  const CreateCheckoutResult({
    required this.checkoutUrl,
    required this.checkoutId,
    required this.expiresAt,
    required this.reused,
    required this.orderId,
  });

  final String checkoutUrl;
  final String checkoutId;
  final DateTime? expiresAt;
  final bool reused;
  final String orderId;

  factory CreateCheckoutResult.fromMap(Map<String, dynamic> map) {
    return CreateCheckoutResult(
      checkoutUrl: '${map['checkoutUrl'] ?? ''}',
      checkoutId: '${map['checkoutId'] ?? ''}',
      expiresAt: _asDate(map['expiresAt']),
      reused: map['reused'] == true,
      orderId: '${map['orderId'] ?? ''}',
    );
  }
}

class BillingService {
  const BillingService();

  Future<BillingSnapshot> loadSnapshot({String? comercioId}) async {
    final client = Supabase.instance.client;
    final businessId = (comercioId ?? SupabaseConfig.currentComercioId).trim();
    if (businessId.isEmpty) {
      throw StateError('No hay comercio activo.');
    }

    final commerce = await client
        .from('comercios')
        .select('id, en_linea, billing_exempt')
        .eq('id', businessId)
        .maybeSingle();

    final planRow = await client
        .from('plans')
        .select()
        .eq('code', 'menu_monthly')
        .eq('is_active', true)
        .maybeSingle();

    final subscriptionRow = await client
        .from('subscriptions')
        .select()
        .eq('business_id', businessId)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle();

    Map<String, dynamic>? paymentRow;
    if (subscriptionRow != null) {
      paymentRow = await client
          .from('payments')
          .select()
          .eq('subscription_id', '${subscriptionRow['id']}')
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();
    }

    return BillingSnapshot(
      plan: planRow == null
          ? null
          : BillingPlan.fromRow(Map<String, dynamic>.from(planRow)),
      subscription: subscriptionRow == null
          ? null
          : BillingSubscription.fromRow(
              Map<String, dynamic>.from(subscriptionRow),
            ),
      latestPayment: paymentRow == null
          ? null
          : BillingPayment.fromRow(Map<String, dynamic>.from(paymentRow)),
      billingExempt: commerce?['billing_exempt'] == true,
      businessOnline: commerce?['en_linea'] == true,
    );
  }

  /// Creates a Zeno hosted checkout. Never send price from the client —
  /// the Edge Function loads the plan amount from the database.
  Future<CreateCheckoutResult> createCheckout({String? comercioId}) async {
    final client = Supabase.instance.client;
    final session = client.auth.currentSession;
    if (session == null) {
      throw StateError('Debes iniciar sesión para pagar.');
    }

    final businessId = (comercioId ?? SupabaseConfig.currentComercioId).trim();
    if (businessId.isEmpty) {
      throw StateError('No hay comercio activo.');
    }

    final response = await client.functions.invoke(
      'create-zeno-checkout',
      body: {
        'comercio_id': businessId,
        // Intentionally omit price — server rejects trusting client amounts.
      },
      headers: {
        'Authorization': 'Bearer ${session.accessToken}',
        'apikey': SupabaseConfig.anonKey,
        'x-comercio-id': businessId,
      },
    );

    final data = _asMap(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw StateError(
        '${data['message'] ?? data['error'] ?? 'No se pudo crear el checkout'} '
        '(${response.status})',
      );
    }

    final result = CreateCheckoutResult.fromMap(data);
    if (result.checkoutUrl.isEmpty) {
      throw StateError('El checkout no devolvió una URL válida.');
    }
    return result;
  }

  Future<bool> openCheckoutUrl(String checkoutUrl) async {
    final uri = Uri.tryParse(checkoutUrl.trim());
    if (uri == null || !(uri.isScheme('https') || uri.isScheme('http'))) {
      throw StateError('URL de checkout inválida.');
    }
    // Hosted Zeno page only — never embed API keys in the app.
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  /// Asks the server to verify open checkouts with Zeno and activate if paid.
  /// Returns true when subscription is active (or already was).
  Future<BillingSnapshot> reconcileCheckout({String? comercioId}) async {
    final client = Supabase.instance.client;
    final session = client.auth.currentSession;
    if (session == null) {
      throw StateError('Debes iniciar sesión para confirmar el pago.');
    }

    final businessId = (comercioId ?? SupabaseConfig.currentComercioId).trim();
    if (businessId.isEmpty) {
      throw StateError('No hay comercio activo.');
    }

    final response = await client.functions.invoke(
      'reconcile-zeno-checkout',
      body: {'comercio_id': businessId},
      headers: {
        'Authorization': 'Bearer ${session.accessToken}',
        'apikey': SupabaseConfig.anonKey,
        'x-comercio-id': businessId,
      },
    );

    final data = _asMap(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw StateError(
        '${data['message'] ?? data['error'] ?? 'No se pudo confirmar el pago'} '
        '(${response.status})',
      );
    }

    return loadSnapshot(comercioId: businessId);
  }
}

double _asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

DateTime? _asDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse('$value');
}

Map<String, dynamic> _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return <String, dynamic>{};
}
