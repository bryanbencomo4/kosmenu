import 'package:kosmenu_app/models/comercio.dart';

class SupabaseConfig {
  const SupabaseConfig._();

  static const String url = 'https://qqhberaayhohxlbbhdyi.supabase.co';
  static const String anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxaGJlcmFheWhvaHhsYmJoZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzE4MTQsImV4cCI6MjA5MDIwNzgxNH0.lkNtqj0_xPekAGuFg_sNHq4uWJOcYnhSX-RNBwAKk8A';
    static const String googleMapsApiKey =
      'AIzaSyB9WNMyQma0-n4sMXN_lWJwYNxxkWDEmyQ';
  static String _currentComercioId = '';
  static String _currentComercioSlug = '';

  static String get currentComercioId => _currentComercioId;
  static String? get currentComercioSlug =>
      _currentComercioSlug.trim().isEmpty ? null : _currentComercioSlug.trim();

  static bool get hasCurrentComercioId => _currentComercioId.trim().isNotEmpty;

  static void setCurrentComercioId(String comercioId, {String? slug}) {
    _currentComercioId = comercioId.trim();
    _currentComercioSlug = (slug ?? '').trim();
  }

  static void setCurrentComercioSlug(String? slug) {
    _currentComercioSlug = (slug ?? '').trim();
  }

  static void clearCurrentComercioId() {
    _currentComercioId = '';
    _currentComercioSlug = '';
  }
}

String getPublicMenuUrl(ComercioModel comercio) {
  final slug = (comercio.slug ?? '').trim();
  final identifier = slug.isNotEmpty ? slug : comercio.id.trim();
  return AppLinks.publicMenuByComercio(identifier);
}

class AppLinks {
  const AppLinks._();

  // Keep base URL without trailing slash to avoid //v/... routes.
  static const String productionUrl = 'https://kosmenu.vercel.app';

  static String publicMenuByComercio(String comercioId) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedId = Uri.encodeComponent(comercioId.trim());
    return '$base/v/$encodedId';
  }

  static String publicMenuByIdentifier({
    required String comercioId,
    String? slug,
  }) {
    final identifier = (slug ?? '').trim().isNotEmpty
        ? slug!.trim()
        : comercioId.trim();
    return publicMenuByComercio(identifier);
  }

  static String orderDetailsById(String orderId, {bool forceWebView = false}) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedId = Uri.encodeComponent(orderId.trim());
    final suffix = forceWebView ? '?view=web' : '';
    return '$base/orders/$encodedId$suffix';
  }

  static String deliveryInviteByToken(String token) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedToken = Uri.encodeComponent(token.trim());
    return '$base/delivery/invite/$encodedToken';
  }
}
