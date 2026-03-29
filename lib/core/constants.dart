class SupabaseConfig {
  const SupabaseConfig._();

  static const String url = 'https://qqhberaayhohxlbbhdyi.supabase.co';
  static const String anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxaGJlcmFheWhvaHhsYmJoZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzE4MTQsImV4cCI6MjA5MDIwNzgxNH0.lkNtqj0_xPekAGuFg_sNHq4uWJOcYnhSX-RNBwAKk8A';
  static String _currentComercioId = '';

  static String get currentComercioId => _currentComercioId;

  static bool get hasCurrentComercioId => _currentComercioId.trim().isNotEmpty;

  static void setCurrentComercioId(String comercioId) {
    _currentComercioId = comercioId.trim();
  }

  static void clearCurrentComercioId() {
    _currentComercioId = '';
  }
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
}
