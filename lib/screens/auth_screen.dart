import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/screens/admin_dashboard_screen.dart';
import 'package:kosmenu_app/screens/business_setup_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum _PostAuthTarget { dashboard, setup }

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  Future<_PostAuthTarget>? _targetFuture;
  String _targetUserId = '';

  Future<_PostAuthTarget> _resolveTargetForUser(String userId) async {
    final row = await Supabase.instance.client
        .from('comercios')
        .select('id, slug')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();

    if (row == null) {
      SupabaseConfig.clearCurrentComercioId();
      return _PostAuthTarget.setup;
    }

    final comercioId = row['id']?.toString().trim() ?? '';
    final comercioSlug = row['slug']?.toString().trim();
    if (comercioId.isEmpty) {
      SupabaseConfig.clearCurrentComercioId();
      return _PostAuthTarget.setup;
    }

    SupabaseConfig.setCurrentComercioId(comercioId, slug: comercioSlug);
    return _PostAuthTarget.dashboard;
  }

  Future<_PostAuthTarget> _targetFutureFor(String userId) {
    if (_targetFuture != null && _targetUserId == userId) {
      return _targetFuture!;
    }
    _targetUserId = userId;
    _targetFuture = _resolveTargetForUser(userId);
    return _targetFuture!;
  }

  void _resetTargetCache() {
    _targetFuture = null;
    _targetUserId = '';
  }

  @override
  Widget build(BuildContext context) {
    final supabase = Supabase.instance.client;

    return StreamBuilder<AuthState>(
      stream: supabase.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = snapshot.data?.session ?? supabase.auth.currentSession;

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.6),
              ),
            ),
          );
        }

        if (session == null) {
          SupabaseConfig.clearCurrentComercioId();
          _resetTargetCache();
          return const AuthScreen();
        }

        final userId = session.user.id;
        return FutureBuilder<_PostAuthTarget>(
          future: _targetFutureFor(userId),
          builder: (context, targetSnapshot) {
            if (targetSnapshot.connectionState == ConnectionState.waiting) {
              return const Scaffold(
                body: Center(
                  child: SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(strokeWidth: 2.6),
                  ),
                ),
              );
            }

            if (targetSnapshot.hasError) {
              return Scaffold(
                body: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'No se pudo validar el acceso: ${targetSnapshot.error}',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              );
            }

            if (targetSnapshot.data == _PostAuthTarget.dashboard) {
              return const AdminDashboardScreen();
            }

            return const BusinessSetupScreen();
          },
        );

      },
    );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  static const String _mobileOAuthRedirect = 'com.kosmenu.app://login-callback';

  final _loginFormKey = GlobalKey<FormState>();
  final _registerFormKey = GlobalKey<FormState>();

  final _loginEmailController = TextEditingController();
  final _loginPasswordController = TextEditingController();
  final _registerEmailController = TextEditingController();
  final _registerPasswordController = TextEditingController();

  bool _isLoginLoading = false;
  bool _isRegisterLoading = false;
  bool _isGoogleLoading = false;
  bool _isAppleLoading = false;

  bool get _isIOS => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  @override
  void dispose() {
    _loginEmailController.dispose();
    _loginPasswordController.dispose();
    _registerEmailController.dispose();
    _registerPasswordController.dispose();
    super.dispose();
  }

  String? _validateEmail(String? value) {
    final email = value?.trim() ?? '';
    const pattern = r'^[\w\-.]+@([\w\-]+\.)+[\w\-]{2,4}$';
    final regex = RegExp(pattern);

    if (email.isEmpty) {
      return 'Ingresa un correo.';
    }
    if (!regex.hasMatch(email)) {
      return 'Ingresa un correo válido.';
    }
    return null;
  }

  String? _validatePassword(String? value) {
    final password = value ?? '';
    if (password.isEmpty) {
      return 'Ingresa una contraseña.';
    }
    if (password.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    return null;
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFFB83D3D) : const Color(0xFF1C8F57),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _signIn() async {
    if (!_loginFormKey.currentState!.validate() || _isLoginLoading) return;

    setState(() => _isLoginLoading = true);
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: _loginEmailController.text.trim(),
        password: _loginPasswordController.text,
      );
    } on AuthException catch (error) {
      _showSnack(error.message, isError: true);
    } catch (_) {
      _showSnack('No se pudo iniciar sesión. Inténtalo nuevamente.', isError: true);
    } finally {
      if (mounted) {
        setState(() => _isLoginLoading = false);
      }
    }
  }

  Future<void> _register() async {
    if (!_registerFormKey.currentState!.validate() || _isRegisterLoading) return;

    setState(() => _isRegisterLoading = true);
    try {
      await Supabase.instance.client.auth.signUp(
        email: _registerEmailController.text.trim(),
        password: _registerPasswordController.text,
      );

      _showSnack('Cuenta creada. Revisa tu correo para confirmar tu acceso.');
    } on AuthException catch (error) {
      _showSnack(error.message, isError: true);
    } catch (_) {
      _showSnack('No se pudo registrar tu cuenta. Inténtalo nuevamente.', isError: true);
    } finally {
      if (mounted) {
        setState(() => _isRegisterLoading = false);
      }
    }
  }

  Future<void> _resetPassword() async {
    final email = _loginEmailController.text.trim();
    final emailError = _validateEmail(email);

    if (emailError != null) {
      _showSnack('Ingresa un correo válido para recuperar contraseña.', isError: true);
      return;
    }

    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(email);
      _showSnack('Te enviamos un correo para restablecer la contraseña.');
    } on AuthException catch (error) {
      _showSnack(error.message, isError: true);
    } catch (_) {
      _showSnack('No se pudo enviar el correo de recuperación.', isError: true);
    }
  }

  Future<void> _signInWithGoogle() async {
    if (_isGoogleLoading) return;

    setState(() => _isGoogleLoading = true);
    try {
      await Supabase.instance.client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: kIsWeb ? Uri.base.origin : _mobileOAuthRedirect,
      );
    } on AuthException catch (error) {
      _showSnack(error.message, isError: true);
    } catch (_) {
      _showSnack('No se pudo iniciar con Google.', isError: true);
    } finally {
      if (mounted) {
        setState(() => _isGoogleLoading = false);
      }
    }
  }

  Future<void> _signInWithApple() async {
    if (_isAppleLoading) return;

    setState(() => _isAppleLoading = true);
    try {
      await Supabase.instance.client.auth.signInWithOAuth(
        OAuthProvider.apple,
        redirectTo: kIsWeb ? Uri.base.origin : _mobileOAuthRedirect,
      );
    } on AuthException catch (error) {
      _showSnack(error.message, isError: true);
    } catch (_) {
      _showSnack('No se pudo iniciar con Apple.', isError: true);
    } finally {
      if (mounted) {
        setState(() => _isAppleLoading = false);
      }
    }
  }

  InputDecoration _inputDecoration({
    required String label,
    required IconData icon,
  }) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Color(0xFFC7B39A)),
      prefixIcon: Icon(icon, color: const Color(0xFFFFB04A)),
      filled: true,
      fillColor: const Color(0xFF1A140F),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0x22FFFFFF)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0x22FFFFFF)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0x99FFB04A), width: 1.4),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFB83D3D), width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFB83D3D), width: 1.2),
      ),
    );
  }

  Widget _buildLoginTab() {
    return Form(
      key: _loginFormKey,
      child: Column(
        children: [
          TextFormField(
            controller: _loginEmailController,
            keyboardType: TextInputType.emailAddress,
            validator: _validateEmail,
            style: const TextStyle(color: Colors.white),
            decoration: _inputDecoration(label: 'Correo electrónico', icon: Icons.mail_outline),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _loginPasswordController,
            obscureText: true,
            validator: _validatePassword,
            style: const TextStyle(color: Colors.white),
            decoration: _inputDecoration(label: 'Contraseña', icon: Icons.lock_outline),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: _resetPassword,
              child: const Text('Olvidé mi contraseña'),
            ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _isLoginLoading ? null : _signIn,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFFF6B00),
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _isLoginLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Iniciar Sesión'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRegisterTab() {
    return Form(
      key: _registerFormKey,
      child: Column(
        children: [
          TextFormField(
            controller: _registerEmailController,
            keyboardType: TextInputType.emailAddress,
            validator: _validateEmail,
            style: const TextStyle(color: Colors.white),
            decoration: _inputDecoration(label: 'Correo electrónico', icon: Icons.alternate_email),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _registerPasswordController,
            obscureText: true,
            validator: _validatePassword,
            style: const TextStyle(color: Colors.white),
            decoration: _inputDecoration(label: 'Contraseña (mínimo 6)', icon: Icons.lock_reset),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _isRegisterLoading ? null : _register,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF1F8A55),
                minimumSize: const Size.fromHeight(52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _isRegisterLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Registrarme'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOAuthSection() {
    return Column(
      children: [
        Row(
          children: const [
            Expanded(child: Divider(color: Color(0x22FFFFFF))),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 10),
              child: Text('o continuar con', style: TextStyle(color: Color(0xFF9E8D7B))),
            ),
            Expanded(child: Divider(color: Color(0x22FFFFFF))),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _isGoogleLoading ? null : _signInWithGoogle,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Color(0x33FFFFFF)),
              minimumSize: const Size.fromHeight(50),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              backgroundColor: const Color(0xFF17120E),
            ),
            icon: _isGoogleLoading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('G', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            label: const Text('Continuar con Google'),
          ),
        ),
        if (_isIOS) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _isAppleLoading ? null : _signInWithApple,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: Color(0x33FFFFFF)),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                backgroundColor: const Color(0xFF17120E),
              ),
              icon: _isAppleLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.apple, size: 20),
              label: const Text('Continuar con Apple'),
            ),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF100D0B), Color(0xFF1A130E), Color(0xFF100D0B)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      color: const Color(0xCC19130F),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: const Color(0x22FFFFFF)),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x33000000),
                          blurRadius: 30,
                          offset: Offset(0, 14),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 54,
                          height: 54,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [Color(0xFFFFB04A), Color(0xFFFF6B00)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                          ),
                          child: const Icon(Icons.restaurant_menu, color: Colors.white),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'Bienvenido a Kosmenú',
                          style: GoogleFonts.manrope(
                            color: Colors.white,
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            height: 1,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Gestiona tu menú digital con una experiencia premium.',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFD5BFA4),
                            fontSize: 13.5,
                          ),
                        ),
                        const SizedBox(height: 18),
                        Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF16110D),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const TabBar(
                            dividerColor: Colors.transparent,
                            indicatorSize: TabBarIndicatorSize.tab,
                            indicator: BoxDecoration(
                              color: Color(0xFFFF6B00),
                              borderRadius: BorderRadius.all(Radius.circular(12)),
                            ),
                            labelColor: Colors.white,
                            unselectedLabelColor: Color(0xFFD5BFA4),
                            tabs: [
                              Tab(text: 'Iniciar Sesión'),
                              Tab(text: 'Registrarse'),
                            ],
                          ),
                        ),
                        const SizedBox(height: 18),
                        SizedBox(
                          height: 300,
                          child: TabBarView(
                            children: [
                              _buildLoginTab(),
                              _buildRegisterTab(),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildOAuthSection(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
