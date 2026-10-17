import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class StaffInviteNotifyResult {
  const StaffInviteNotifyResult({
    required this.ok,
    this.error,
    this.existingUser = false,
  });

  final bool ok;
  final String? error;
  final bool existingUser;
}

class StaffInviteNotifyService {
  const StaffInviteNotifyService._();

  static Future<StaffInviteNotifyResult> notify({
    required String comercioId,
    required String email,
    required String role,
  }) async {
    final accessToken =
        Supabase.instance.client.auth.currentSession?.accessToken.trim() ?? '';
    if (accessToken.isEmpty) {
      return const StaffInviteNotifyResult(
        ok: false,
        error: 'Sesión no disponible para enviar el correo.',
      );
    }

    try {
      final response = await http.post(
        ElmenuxfaApiConfig.uri('/api/business/staff-invite/notify'),
        headers: <String, String>{
          'Accept': 'application/json',
          'Authorization': 'Bearer $accessToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(<String, String>{
          'comercioId': comercioId.trim(),
          'email': email.trim().toLowerCase(),
          'role': role.trim().toLowerCase(),
        }),
      );

      final payload = jsonDecode(response.body);
      final map = payload is Map ? Map<String, dynamic>.from(payload) : const <String, dynamic>{};
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final error = (map['error'] ?? 'No se pudo enviar el correo.').toString();
        return StaffInviteNotifyResult(ok: false, error: error);
      }

      return StaffInviteNotifyResult(
        ok: true,
        existingUser: map['existingUser'] == true,
      );
    } catch (error) {
      return StaffInviteNotifyResult(ok: false, error: '$error');
    }
  }
}
