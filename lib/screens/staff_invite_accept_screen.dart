import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Minimal join screen for invited staff (mesero, etc.): locked email + password only.
class StaffInviteAcceptScreen extends StatefulWidget {
  const StaffInviteAcceptScreen({super.key, required this.token});

  final String token;

  @override
  State<StaffInviteAcceptScreen> createState() => _StaffInviteAcceptScreenState();
}

class _StaffInviteAcceptScreenState extends State<StaffInviteAcceptScreen> {
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _loading = true;
  bool _submitting = false;
  bool _obscure = true;
  String? _error;
  String? _email;
  String? _roleLabel;
  String? _comercioNombre;
  bool _existingAccount = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await http.get(
        ElmenuxfaApiConfig.uri('/api/business/staff-invite/lookup').replace(
          queryParameters: <String, String>{'token': widget.token},
        ),
        headers: const <String, String>{'Accept': 'application/json'},
      );
      final payload = jsonDecode(response.body);
      final map = payload is Map
          ? Map<String, dynamic>.from(payload)
          : const <String, dynamic>{};
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw (map['error'] ?? 'Invitación no disponible.').toString();
      }
      if (!mounted) return;
      setState(() {
        _email = (map['email'] ?? '').toString();
        _roleLabel = (map['roleLabel'] ?? map['role'] ?? 'Personal').toString();
        _comercioNombre =
            (map['comercioNombre'] ?? 'el restaurante').toString();
        _existingAccount = map['existingAccount'] == true;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  Future<void> _accept() async {
    final password = _passwordController.text;
    if (password.length < 8) {
      setState(() => _error = 'Usa al menos 8 caracteres.');
      return;
    }
    if (password != _confirmController.text) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final response = await http.post(
        ElmenuxfaApiConfig.uri('/api/business/staff-invite/accept'),
        headers: const <String, String>{
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(<String, String>{
          'token': widget.token,
          'password': password,
        }),
      );
      final payload = jsonDecode(response.body);
      final map = payload is Map
          ? Map<String, dynamic>.from(payload)
          : const <String, dynamic>{};
      if (response.statusCode == 409 && map['error'] == 'already_registered') {
        throw 'Este correo ya tiene cuenta. Inicia sesión en la app para unirte.';
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw (map['error'] ?? map['message'] ?? 'No se pudo completar el registro.')
            .toString();
      }

      final email = (map['email'] ?? _email ?? '').toString();
      await Supabase.instance.client.auth.signInWithPassword(
        email: email,
        password: password,
      );
      if (!mounted) return;
      Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F1F8),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFE4DDED)),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x160E0718),
                      blurRadius: 36,
                      offset: Offset(0, 16),
                    ),
                  ],
                ),
                child: _loading
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    : _error != null && _email == null
                        ? _buildBrokenInvite()
                        : _existingAccount
                            ? _buildExistingAccount()
                            : _buildForm(),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBrokenInvite() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.link_off_rounded, color: Color(0xFF6532A8), size: 32),
        const SizedBox(height: 16),
        Text(
          'Invitación no disponible',
          style: GoogleFonts.poppins(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF21172D),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _error ?? 'Pide un enlace nuevo al administrador del negocio.',
          style: const TextStyle(color: Color(0xFF716779), height: 1.5),
        ),
      ],
    );
  }

  Widget _buildExistingAccount() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.mark_email_read_outlined, color: Color(0xFF6532A8), size: 32),
        const SizedBox(height: 16),
        Text(
          'Ya tienes una cuenta',
          style: GoogleFonts.poppins(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF21172D),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Te invitaron a $_comercioNombre como $_roleLabel. '
          'Inicia sesión con $_email para unirte.',
          style: const TextStyle(color: Color(0xFF716779), height: 1.5),
        ),
        const SizedBox(height: 22),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () =>
                Navigator.of(context).pushNamedAndRemoveUntil('/', (_) => false),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF6D28D9),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Ir a iniciar sesión'),
          ),
        ),
      ],
    );
  }

  Widget _buildForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF3E8FF),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Invitación al equipo',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF6D28D9),
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Te invitaron a $_comercioNombre como $_roleLabel.',
                style: const TextStyle(
                  color: Color(0xFF4C1D95),
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        Text(
          'Crea tu contraseña',
          style: GoogleFonts.poppins(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF21172D),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Solo necesitas definir una contraseña para unirte. El correo de la invitación ya está asignado.',
          style: TextStyle(color: Color(0xFF716779), height: 1.5),
        ),
        const SizedBox(height: 20),
        InputDecorator(
          decoration: const InputDecoration(
            labelText: 'Correo',
            border: OutlineInputBorder(),
            filled: true,
            fillColor: Color(0xFFF7F5FA),
          ),
          child: Text(
            _email ?? '',
            style: const TextStyle(
              color: Color(0xFF334155),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _passwordController,
          obscureText: _obscure,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.newPassword],
          decoration: InputDecoration(
            labelText: 'Contraseña',
            border: const OutlineInputBorder(),
            suffixIcon: IconButton(
              onPressed: () => setState(() => _obscure = !_obscure),
              icon: Icon(
                _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _confirmController,
          obscureText: _obscure,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submitting ? null : _accept(),
          autofillHints: const [AutofillHints.newPassword],
          decoration: const InputDecoration(
            labelText: 'Confirmar contraseña',
            border: OutlineInputBorder(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C))),
        ],
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _submitting ? null : _accept,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF6D28D9),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: Text(_submitting ? 'Uniéndote…' : 'Aceptar e unirme'),
          ),
        ),
      ],
    );
  }
}
