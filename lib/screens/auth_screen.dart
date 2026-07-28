import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/screens/admin_dashboard_screen.dart';
import 'package:kosmenu_app/screens/billing_plan_screen.dart';
import 'package:kosmenu_app/screens/business_setup_screen.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  static const String _setupDraftKeyPrefix = 'business_setup_draft_v2';
  Future<PostAuthDestination>? _targetFuture;
  String _targetUserId = '';

  Future<PostAuthDestination> _resolveTargetForUser(String userId) async {
    Future<PostAuthDestination> resolveOnce() async {
      final row = await Supabase.instance.client
          .from('comercios')
          .select('id, slug, billing_exempt')
          .eq('owner_id', userId)
          .limit(1)
          .maybeSingle();

      if (row == null) {
        SupabaseConfig.clearCurrentComercioId();
        return resolvePostAuthDestination(
          hasCommerce: false,
          hasCatalog: false,
          billingExempt: false,
          hasActiveSubscription: false,
        );
      }

      final comercioId = row['id']?.toString().trim() ?? '';
      final comercioSlug = row['slug']?.toString().trim();
      final billingExempt = row['billing_exempt'] == true;
      if (comercioId.isEmpty) {
        SupabaseConfig.clearCurrentComercioId();
        return resolvePostAuthDestination(
          hasCommerce: false,
          hasCatalog: false,
          billingExempt: false,
          hasActiveSubscription: false,
        );
      }

      final firstCatalog = await Supabase.instance.client
          .from('catalogos')
          .select('id')
          .eq('comercio_id', comercioId)
          .limit(1)
          .maybeSingle();
      if (firstCatalog == null) {
        SupabaseConfig.setCurrentComercioId(comercioId, slug: comercioSlug);
        return resolvePostAuthDestination(
          hasCommerce: true,
          hasCatalog: false,
          billingExempt: billingExempt,
          hasActiveSubscription: false,
        );
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('$_setupDraftKeyPrefix:$userId');

      SupabaseConfig.setCurrentComercioId(comercioId, slug: comercioSlug);

      var hasActiveSubscription = false;
      if (!billingExempt) {
        final sub = await Supabase.instance.client
            .from('subscriptions')
            .select('id, status')
            .eq('business_id', comercioId)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        hasActiveSubscription = sub != null;

        // If still unpaid locally, ask server to reconcile with Zeno (missing webhooks).
        if (!hasActiveSubscription) {
          try {
            final snap = await const BillingService().reconcileCheckout(
              comercioId: comercioId,
            );
            hasActiveSubscription = snap.hasActiveSubscription;
          } catch (_) {
            // Continue with local state.
          }
        }
      }

      return resolvePostAuthDestination(
        hasCommerce: true,
        hasCatalog: true,
        billingExempt: billingExempt,
        hasActiveSubscription: hasActiveSubscription,
      );
    }

    try {
      return await resolveOnce();
    } catch (_) {
      await Future<void>.delayed(const Duration(milliseconds: 320));
      return resolveOnce();
    }
  }

  Future<PostAuthDestination> _targetFutureFor(String userId) {
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
          return const BrandedLoadingScreen(withScaffold: true);
        }

        if (session == null) {
          SupabaseConfig.clearCurrentComercioId();
          _resetTargetCache();
          return const AuthScreen();
        }

        final userId = session.user.id;
        return FutureBuilder<PostAuthDestination>(
          future: _targetFutureFor(userId),
          builder: (context, targetSnapshot) {
            if (targetSnapshot.connectionState == ConnectionState.waiting) {
              return const BrandedLoadingScreen(withScaffold: true);
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

            switch (targetSnapshot.data) {
              case PostAuthDestination.dashboard:
                return const AdminDashboardScreen();
              case PostAuthDestination.billing:
                return const BillingPlanScreen();
              case PostAuthDestination.setup:
              case null:
                return const BusinessSetupScreen();
            }
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
  static const String _fullLogoAsset = 'assets/branding/full_logo.png';
  static const String _termsUrl = '${AppLinks.productionUrl}/terminos';
  static const String _privacyUrl = '${AppLinks.productionUrl}/privacidad';

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
  bool _obscureLoginPassword = true;
  bool _obscureRegisterPassword = true;
  bool _acceptedTerms = false;
  bool _acceptedPrivacy = false;

  bool get _isIOS => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  String get _registerEmailRedirect {
    if (kIsWeb) {
      return Uri.base.origin;
    }

    return '${AppLinks.productionUrl}/?source=email-confirmation';
  }

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
        backgroundColor: isError
            ? const Color(0xFFB83D3D)
            : const Color(0xFF1C8F57),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  String _translateAuthError(String message) {
    final normalized = message.trim().toLowerCase();
    if (normalized.isEmpty) {
      return 'No se pudo completar la solicitud. Intentalo nuevamente.';
    }
    if (normalized.contains('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (normalized.contains('invalid email')) {
      return 'Ingresa un correo valido.';
    }
    if (normalized.contains('email address') &&
        normalized.contains('invalid')) {
      return 'Ingresa un correo valido.';
    }
    if (normalized.contains('email not confirmed')) {
      return 'Tu correo aun no esta confirmado. Revisa tu bandeja de entrada.';
    }
    if (normalized.contains('signup requires a valid password')) {
      return 'Debes usar una contraseña valida para crear tu cuenta.';
    }
    if (normalized.contains('user already registered')) {
      return 'Este correo ya esta registrado. Intenta iniciar sesion.';
    }
    if (normalized.contains('signups not allowed') ||
        normalized.contains('signup is disabled')) {
      return 'El registro de nuevas cuentas no esta disponible en este momento.';
    }
    if (normalized.contains('provider is not enabled')) {
      return 'Este metodo de acceso no esta disponible en este momento.';
    }
    if (normalized.contains('password should be at least')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (normalized.contains('weak password')) {
      return 'La contraseña es demasiado debil. Usa una combinacion mas segura.';
    }
    if (normalized.contains('network')) {
      return 'Problema de red. Verifica tu conexion e intentalo otra vez.';
    }
    if (normalized.contains('too many requests')) {
      return 'Demasiados intentos. Espera un momento e intentalo de nuevo.';
    }
    if (normalized.contains('unexpected failure')) {
      return 'Ocurrio un error inesperado. Intentalo nuevamente.';
    }
    if (normalized.contains('jwt') || normalized.contains('token')) {
      return 'Tu sesion no pudo validarse. Intentalo nuevamente.';
    }
    return 'No se pudo completar la solicitud. Intentalo nuevamente.';
  }

  Future<void> _openLegalLink(String rawUrl) async {
    final uri = Uri.parse(rawUrl);
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened) {
      _showSnack('No se pudo abrir el enlace.', isError: true);
    }
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
      _showSnack(_translateAuthError(error.message), isError: true);
    } catch (_) {
      _showSnack(
        'No se pudo iniciar sesión. Inténtalo nuevamente.',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() => _isLoginLoading = false);
      }
    }
  }

  Future<void> _register() async {
    if (!_registerFormKey.currentState!.validate() || _isRegisterLoading) {
      return;
    }

    if (!_acceptedTerms || !_acceptedPrivacy) {
      _showSnack(
        'Debes aceptar terminos y privacidad para crear tu cuenta.',
        isError: true,
      );
      return;
    }

    setState(() => _isRegisterLoading = true);
    try {
      await Supabase.instance.client.auth.signUp(
        email: _registerEmailController.text.trim(),
        password: _registerPasswordController.text,
        emailRedirectTo: _registerEmailRedirect,
      );

      _showSnack(
        'Cuenta creada. Revisa tu correo de elmenuxfa.com para confirmar tu acceso.',
      );
    } on AuthException catch (error) {
      _showSnack(_translateAuthError(error.message), isError: true);
    } catch (_) {
      _showSnack(
        'No se pudo registrar tu cuenta. Inténtalo nuevamente.',
        isError: true,
      );
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
      _showSnack(
        'Ingresa un correo válido para recuperar contraseña.',
        isError: true,
      );
      return;
    }

    try {
      await Supabase.instance.client.auth.resetPasswordForEmail(email);
      _showSnack('Te enviamos un correo para restablecer la contraseña.');
    } on AuthException catch (error) {
      _showSnack(_translateAuthError(error.message), isError: true);
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
      _showSnack(_translateAuthError(error.message), isError: true);
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
      _showSnack(_translateAuthError(error.message), isError: true);
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
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      hintText: label,
      hintStyle: const TextStyle(color: AppColors.textSoft),
      floatingLabelBehavior: FloatingLabelBehavior.never,
      prefixIcon: Icon(icon, color: AppColors.accent),
      suffixIcon: suffixIcon,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.borderSubtle),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.borderSubtle),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.4),
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

  Widget _buildPrimaryButton({
    required VoidCallback? onPressed,
    required bool isLoading,
    required String text,
    Color? backgroundColor,
  }) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: backgroundColor ?? AppColors.accent,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Colors.white,
                ),
              )
            : Text(text),
      ),
    );
  }

  Widget _buildLoginTab({required bool compact}) {
    return Form(
      key: _loginFormKey,
      child: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.only(bottom: compact ? 12 : 20),
              child: Column(
                children: [
                  TextFormField(
                    controller: _loginEmailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    validator: _validateEmail,
                    style: const TextStyle(color: AppColors.textStrong),
                    decoration: _inputDecoration(
                      label: 'Correo electrónico',
                      icon: Icons.alternate_email,
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _loginPasswordController,
                    obscureText: _obscureLoginPassword,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _signIn(),
                    validator: _validatePassword,
                    style: const TextStyle(color: AppColors.textStrong),
                    decoration: _inputDecoration(
                      label: 'Contraseña',
                      icon: Icons.lock_reset,
                      suffixIcon: IconButton(
                        tooltip: _obscureLoginPassword
                            ? 'Mostrar contraseña'
                            : 'Ocultar contraseña',
                        onPressed: () => setState(
                          () => _obscureLoginPassword = !_obscureLoginPassword,
                        ),
                        icon: Icon(
                          _obscureLoginPassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: AppColors.textSoft,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: _resetPassword,
                      child: const Text('Olvidé mi contraseña'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          _buildPrimaryButton(
            onPressed: _isLoginLoading ? null : _signIn,
            isLoading: _isLoginLoading,
            text: 'Iniciar Sesión',
          ),
        ],
      ),
    );
  }

  Widget _buildRegisterTab({required bool compact}) {
    return Form(
      key: _registerFormKey,
      child: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.only(bottom: compact ? 12 : 20),
              child: Column(
                children: [
                  TextFormField(
                    controller: _registerEmailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    validator: _validateEmail,
                    style: const TextStyle(color: AppColors.textStrong),
                    decoration: _inputDecoration(
                      label: 'Correo electrónico',
                      icon: Icons.alternate_email,
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _registerPasswordController,
                    obscureText: _obscureRegisterPassword,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _register(),
                    validator: _validatePassword,
                    style: const TextStyle(color: AppColors.textStrong),
                    decoration: _inputDecoration(
                      label: 'Contraseña (mínimo 6)',
                      icon: Icons.lock_reset,
                      suffixIcon: IconButton(
                        tooltip: _obscureRegisterPassword
                            ? 'Mostrar contraseña'
                            : 'Ocultar contraseña',
                        onPressed: () => setState(
                          () => _obscureRegisterPassword =
                              !_obscureRegisterPassword,
                        ),
                        icon: Icon(
                          _obscureRegisterPassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          color: AppColors.textSoft,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  CheckboxListTile(
                    value: _acceptedTerms,
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    visualDensity: const VisualDensity(
                      horizontal: -4,
                      vertical: -4,
                    ),
                    onChanged: (value) =>
                        setState(() => _acceptedTerms = value ?? false),
                    title: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 4,
                      runSpacing: 2,
                      children: [
                        const Text(
                          'Acepto los',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSoft,
                          ),
                        ),
                        InkWell(
                          onTap: () => _openLegalLink(_termsUrl),
                          child: const Text(
                            'terminos y condiciones',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: AppColors.accent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  CheckboxListTile(
                    value: _acceptedPrivacy,
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                    visualDensity: const VisualDensity(
                      horizontal: -4,
                      vertical: -4,
                    ),
                    onChanged: (value) =>
                        setState(() => _acceptedPrivacy = value ?? false),
                    title: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 4,
                      runSpacing: 2,
                      children: [
                        const Text(
                          'Acepto la',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSoft,
                          ),
                        ),
                        InkWell(
                          onTap: () => _openLegalLink(_privacyUrl),
                          child: const Text(
                            'politica de privacidad',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: AppColors.accent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          _buildPrimaryButton(
            onPressed: _isRegisterLoading ? null : _register,
            isLoading: _isRegisterLoading,
            text: 'Registrarme',
            backgroundColor: const Color(0xFF6D28D9),
          ),
        ],
      ),
    );
  }

  Widget _buildOAuthSection({required bool compact}) {
    return Column(
      children: [
        if (!compact) ...[
          Row(
            children: const [
              Expanded(child: Divider(color: Color(0x22FFFFFF))),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 10),
                child: Text(
                  'o continuar con',
                  style: TextStyle(color: AppColors.textSoft),
                ),
              ),
              Expanded(child: Divider(color: Color(0x22FFFFFF))),
            ],
          ),
          const SizedBox(height: 12),
        ],
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: _isGoogleLoading ? null : _signInWithGoogle,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.textStrong,
              side: const BorderSide(color: AppColors.borderSubtle),
              minimumSize: Size.fromHeight(compact ? 46 : 50),
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            icon: _isGoogleLoading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'G',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                  ),
            label: Text(compact ? 'Google' : 'Continuar con Google'),
          ),
        ),
        if (_isIOS) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _isAppleLoading ? null : _signInWithApple,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.textStrong,
                side: const BorderSide(color: AppColors.borderSubtle),
                minimumSize: Size.fromHeight(compact ? 46 : 50),
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: _isAppleLoading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.apple, size: 20),
              label: Text(compact ? 'Apple' : 'Continuar con Apple'),
            ),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final isKeyboardVisible = mediaQuery.viewInsets.bottom > 0;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: DefaultTabController(
        length: 2,
        initialIndex: () {
          if (!kIsWeb) return 0;
          final tab = Uri.base.queryParameters['tab']?.trim().toLowerCase();
          if (tab == 'register' || tab == 'signup' || tab == 'registrarse') {
            return 1;
          }
          return 0;
        }(),
        child: Scaffold(
          resizeToAvoidBottomInset: true,
          body: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Color(0xFF2B1455),
                  Color(0xFF5B21B6),
                  Color(0xFF2B1455),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final cardHorizontalPadding = constraints.maxWidth < 560
                      ? 16.0
                      : 24.0;
                  final cardVerticalPadding = isKeyboardVisible ? 12.0 : 20.0;
                  final headerSpacing = isKeyboardVisible ? 10.0 : 18.0;

                  return Center(
                    child: AnimatedPadding(
                      duration: const Duration(milliseconds: 220),
                      curve: Curves.easeOut,
                      padding: EdgeInsets.fromLTRB(
                        cardHorizontalPadding,
                        cardVerticalPadding,
                        cardHorizontalPadding,
                        cardVerticalPadding,
                      ),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: 460,
                          maxHeight: constraints.maxHeight,
                        ),
                        child: Container(
                          padding: EdgeInsets.fromLTRB(
                            20,
                            isKeyboardVisible ? 16 : 22,
                            20,
                            isKeyboardVisible ? 16 : 22,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xF8FFFFFF),
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFDDD6FE)),
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
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 180),
                                child: isKeyboardVisible
                                    ? const SizedBox.shrink()
                                    : Column(
                                        key: const ValueKey('auth-header-full'),
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Center(
                                            child: Image.asset(
                                              _fullLogoAsset,
                                              height: 52,
                                              fit: BoxFit.contain,
                                            ),
                                          ),
                                          const SizedBox(height: 14),
                                          Text(
                                            'Bienvenido a elmenuxfa.com',
                                            style: GoogleFonts.manrope(
                                              color: AppColors.textStrong,
                                              fontSize: 30,
                                              fontWeight: FontWeight.w800,
                                              height: 1,
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            'Crea, publica y vende con tu menu digital en minutos.',
                                            style: GoogleFonts.poppins(
                                              color: AppColors.textSoft,
                                              fontSize: 13.5,
                                            ),
                                          ),
                                        ],
                                      ),
                              ),
                              SizedBox(height: headerSpacing),
                              Container(
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF1EAFE),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const TabBar(
                                  dividerColor: Colors.transparent,
                                  indicatorSize: TabBarIndicatorSize.tab,
                                  indicator: BoxDecoration(
                                    color: AppColors.accent,
                                    borderRadius: BorderRadius.all(
                                      Radius.circular(12),
                                    ),
                                  ),
                                  labelColor: Colors.white,
                                  unselectedLabelColor: AppColors.textSoft,
                                  tabs: [
                                    Tab(text: 'Iniciar Sesión'),
                                    Tab(text: 'Registrarse'),
                                  ],
                                ),
                              ),
                              SizedBox(height: isKeyboardVisible ? 12 : 18),
                              Expanded(
                                child: TabBarView(
                                  children: [
                                    _buildLoginTab(compact: isKeyboardVisible),
                                    _buildRegisterTab(
                                      compact: isKeyboardVisible,
                                    ),
                                  ],
                                ),
                              ),
                              SizedBox(height: isKeyboardVisible ? 10 : 12),
                              _buildOAuthSection(compact: isKeyboardVisible),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}
