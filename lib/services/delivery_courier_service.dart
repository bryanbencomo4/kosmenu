import 'package:supabase_flutter/supabase_flutter.dart';

class DeliveryCourier {
  const DeliveryCourier({
    required this.id,
    required this.alias,
    required this.phoneE164,
    required this.normalizedPhone,
    required this.completedOrdersCount,
    this.lastUsedAt,
  });

  final String id;
  final String alias;
  final String phoneE164;
  final String normalizedPhone;
  final int completedOrdersCount;
  final DateTime? lastUsedAt;

  String get displayPhone {
    if (phoneE164.trim().isNotEmpty) return phoneE164.trim();
    if (normalizedPhone.isEmpty) return '';
    return '+$normalizedPhone';
  }

  factory DeliveryCourier.fromMap(Map<String, dynamic> map) {
    final completedRaw = map['completed_orders_count'];
    final completed = completedRaw is num
        ? completedRaw.toInt()
        : int.tryParse('${map['completed_orders_count']}') ?? 0;
    return DeliveryCourier(
      id: (map['id'] ?? '').toString().trim(),
      alias: (map['alias'] ?? '').toString().trim(),
      phoneE164: (map['phone_e164'] ?? '').toString().trim(),
      normalizedPhone: (map['normalized_phone'] ?? '').toString().trim(),
      completedOrdersCount: completed,
      lastUsedAt: DateTime.tryParse((map['last_used_at'] ?? '').toString()),
    );
  }
}

class DeliveryCourierSelection {
  const DeliveryCourierSelection({
    required this.phoneE164,
    required this.normalizedPhone,
    required this.alias,
    this.courierId,
    this.fromContacts = false,
  });

  final String? courierId;
  final String phoneE164;
  final String normalizedPhone;
  final String alias;
  final bool fromContacts;
}

class DeliveryCourierService {
  const DeliveryCourierService._();

  static String normalizeDigits(String value) {
    return value.replaceAll(RegExp(r'\D'), '');
  }

  static String normalizeToE164({required String digits, required String dialCode}) {
    final onlyDigits = normalizeDigits(digits);
    final onlyDial = normalizeDigits(dialCode);
    if (onlyDigits.isEmpty || onlyDial.isEmpty) return '';

    var local = onlyDigits;
    if (local.startsWith('0')) {
      local = local.replaceFirst(RegExp(r'^0+'), '');
    }
    if (local.startsWith(onlyDial)) {
      return '+$local';
    }
    return '+$onlyDial$local';
  }

  static Future<List<DeliveryCourier>> listByComercio({
    required String comercioId,
    String query = '',
    int limit = 20,
  }) async {
    final client = Supabase.instance.client;
    try {
      final response = await client.rpc(
        'list_delivery_couriers',
        params: {
          'p_comercio_id': comercioId,
          'p_query': query,
          'p_limit': limit,
        },
      );

      if (response is! List) return const <DeliveryCourier>[];
      return response
          .map((item) => DeliveryCourier.fromMap(Map<String, dynamic>.from(item as Map)))
          .where((courier) => courier.id.isNotEmpty)
          .toList(growable: false);
    } catch (_) {
      return const <DeliveryCourier>[];
    }
  }

  static Future<DeliveryCourier?> upsertCourier({
    required String comercioId,
    required String alias,
    required String phoneE164,
    required String normalizedPhone,
  }) async {
    final client = Supabase.instance.client;
    try {
      final response = await client.rpc(
        'upsert_delivery_courier',
        params: {
          'p_comercio_id': comercioId,
          'p_alias': alias,
          'p_phone_e164': phoneE164,
          'p_normalized_phone': normalizedPhone,
        },
      );

      if (response is! List || response.isEmpty) return null;
      return DeliveryCourier.fromMap(Map<String, dynamic>.from(response.first as Map));
    } catch (_) {
      return null;
    }
  }

  static Future<void> touchLastUsed(String courierId) async {
    if (courierId.trim().isEmpty) return;
    try {
      await Supabase.instance.client.rpc(
        'touch_delivery_courier_last_used',
        params: {'p_courier_id': courierId},
      );
    } catch (_) {
      // Best effort.
    }
  }

  static Future<bool> deactivateCourier(String courierId) async {
    if (courierId.trim().isEmpty) return false;
    try {
      final response = await Supabase.instance.client.rpc(
        'deactivate_delivery_courier',
        params: {'p_courier_id': courierId},
      );
      if (response is bool) return response;
      return true;
    } catch (_) {
      return false;
    }
  }
}
