import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AccountSettingsScreen extends StatefulWidget {
  const AccountSettingsScreen({super.key});

  @override
  State<AccountSettingsScreen> createState() => _AccountSettingsScreenState();
}

class _AccountSettingsScreenState extends State<AccountSettingsScreen> {
  static const _purple = Color(0xFF6D28D9);
  static const _muted = Color(0xFF6B7280);
  static const _dark = Color(0xFF1F2937);

  String _email = '';

  @override
  void initState() {
    super.initState();
    _email = Supabase.instance.client.auth.currentUser?.email?.trim() ?? '';
  }

  void _refreshEmail() {
    final next = Supabase.instance.client.auth.currentUser?.email?.trim() ?? '';
    if (!mounted || next == _email) return;
    setState(() => _email = next);
  }

  Future<void> _openEmailSheet() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => const _ChangeEmailSheet(),
    );
    if (changed == true) _refreshEmail();
  }

  Future<void> _openPasswordSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => _ChangePasswordSheet(email: _email),
    );
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final horizontal = width >= 720 ? (width - 560) / 2 : 16.0;

    return Scaffold(
      backgroundColor: const Color(0xFFF8F7FC),
      appBar: AppBar(
        title: Text(
          'Cuenta',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          horizontal.clamp(16, 120),
          16,
          horizontal.clamp(16, 120),
          32,
        ),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFE8E5F2)),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3E8FF),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.person_outline_rounded, color: _purple),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Correo',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: _muted,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _email.isEmpty ? 'Sin correo' : _email,
                        style: GoogleFonts.poppins(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: _dark,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _AccountActionCard(
            icon: Icons.alternate_email_rounded,
            title: 'Cambiar correo',
            onTap: _email.isEmpty ? null : _openEmailSheet,
          ),
          const SizedBox(height: 10),
          _AccountActionCard(
            icon: Icons.lock_outline_rounded,
            title: 'Cambiar contraseña',
            onTap: _email.isEmpty ? null : _openPasswordSheet,
          ),
        ],
      ),
    );
  }
}

class _AccountActionCard extends StatelessWidget {
  const _AccountActionCard({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0xFFF3E8FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: const Color(0xFF6D28D9)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: onTap == null
                        ? const Color(0xFF9CA3AF)
                        : const Color(0xFF1F2937),
                  ),
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
            ],
          ),
        ),
      ),
    );
  }
}

String? _validateEmail(String value) {
  final email = value.trim();
  if (email.isEmpty) return 'Ingresa un correo.';
  final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email);
  if (!ok) return 'Correo no válido.';
  return null;
}

String _authErrorMessage(Object error) {
  final raw = error is AuthException ? error.message : '$error';
  final normalized = raw.toLowerCase();
  if (normalized.contains('invalid login credentials') ||
      normalized.contains('invalid credentials') ||
      normalized.contains('email not confirmed')) {
    return 'Contraseña actual incorrecta.';
  }
  if (normalized.contains('same password')) {
    return 'La nueva contraseña debe ser distinta.';
  }
  if (normalized.contains('weak password') ||
      normalized.contains('password should be at least')) {
    return 'Elige una contraseña más segura (mínimo 8 caracteres).';
  }
  if (normalized.contains('already been registered') ||
      normalized.contains('already registered') ||
      normalized.contains('user already exists') ||
      normalized.contains('email address is already')) {
    return 'Ese correo ya está en uso.';
  }
  if (normalized.contains('rate limit') || normalized.contains('too many')) {
    return 'Espera un momento e inténtalo de nuevo.';
  }
  if (normalized.contains('network') || normalized.contains('connection')) {
    return 'Revisa tu conexión e inténtalo de nuevo.';
  }
  return 'No se pudo completar el cambio.';
}

InputDecoration _fieldDecoration(String label, {Widget? suffix}) {
  return InputDecoration(
    labelText: label,
    filled: true,
    fillColor: const Color(0xFFF8F7FC),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFFE8E5F2)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFF6D28D9), width: 1.4),
    ),
    suffixIcon: suffix,
  );
}

class _ChangeEmailSheet extends StatefulWidget {
  const _ChangeEmailSheet();

  @override
  State<_ChangeEmailSheet> createState() => _ChangeEmailSheetState();
}

class _ChangeEmailSheetState extends State<_ChangeEmailSheet> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final current = Supabase.instance.client.auth.currentUser?.email?.trim() ?? '';
    final next = _email.text.trim().toLowerCase();
    final emailError = _validateEmail(next);
    if (emailError != null) {
      setState(() => _error = emailError);
      return;
    }
    if (next == current.toLowerCase()) {
      setState(() => _error = 'Escribe un correo distinto al actual.');
      return;
    }
    if (_password.text.isEmpty) {
      setState(() => _error = 'Ingresa tu contraseña actual.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    final client = Supabase.instance.client;
    try {
      await client.auth.signInWithPassword(
        email: current,
        password: _password.text,
      );
      await client.auth.updateUser(
        UserAttributes(email: next),
        emailRedirectTo: kIsWeb
            ? Uri.base.origin
            : '${AppLinks.merchantAppUrl}/?source=email-change',
      );
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Revisa el correo nuevo para confirmar el cambio.'),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _authErrorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD8D4E8),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Cambiar correo',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: const Color(0xFF1F2937),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              decoration: _fieldDecoration('Correo nuevo'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _saving ? null : _save(),
              decoration: _fieldDecoration(
                'Contraseña actual',
                suffix: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(
                    _obscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: GoogleFonts.poppins(
                  color: const Color(0xFFB91C1C),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6D28D9),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: _saving
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      'Guardar',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet({required this.email});

  final String email;

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _saving = false;
  bool _sendingReset = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final current = _current.text;
    final next = _next.text;
    final confirm = _confirm.text;
    if (current.isEmpty) {
      setState(() => _error = 'Ingresa tu contraseña actual.');
      return;
    }
    if (next.length < 8) {
      setState(() => _error = 'La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (next != confirm) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }
    if (next == current) {
      setState(() => _error = 'La nueva contraseña debe ser distinta.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    final client = Supabase.instance.client;
    try {
      await client.auth.signInWithPassword(
        email: widget.email,
        password: current,
      );
      await client.auth.updateUser(UserAttributes(password: next));
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(
        const SnackBar(content: Text('Contraseña actualizada.')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _authErrorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _forgotPassword() async {
    final email = widget.email.trim();
    if (email.isEmpty) {
      setState(() => _error = 'No hay un correo asociado a esta cuenta.');
      return;
    }
    setState(() {
      _sendingReset = true;
      _error = null;
    });
    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(
        email,
        redirectTo: AppLinks.passwordRecoveryRedirectUri(
          isWeb: kIsWeb,
          currentUri: Uri.base,
        ).toString(),
      );
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(
        SnackBar(content: Text('Te enviamos un enlace a $email')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _authErrorMessage(error));
    } finally {
      if (mounted) setState(() => _sendingReset = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final busy = _saving || _sendingReset;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD8D4E8),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Cambiar contraseña',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: const Color(0xFF1F2937),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _current,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.password],
              textInputAction: TextInputAction.next,
              decoration: _fieldDecoration(
                'Contraseña actual',
                suffix: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(
                    _obscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _next,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.newPassword],
              textInputAction: TextInputAction.next,
              decoration: _fieldDecoration('Nueva contraseña'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _confirm,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.newPassword],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => busy ? null : _save(),
              decoration: _fieldDecoration('Confirmar contraseña'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: GoogleFonts.poppins(
                  color: const Color(0xFFB91C1C),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 18),
            FilledButton(
              onPressed: busy ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6D28D9),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: _saving
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      'Guardar',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                    ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: busy ? null : _forgotPassword,
              child: _sendingReset
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      'Olvidé mi contraseña',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF6D28D9),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
