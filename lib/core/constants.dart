class SupabaseConfig {
  const SupabaseConfig._();

  static const String url = 'https://qqhberaayhohxlbbhdyi.supabase.co';
  static const String anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxaGJlcmFheWhvaHhsYmJoZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzE4MTQsImV4cCI6MjA5MDIwNzgxNH0.lkNtqj0_xPekAGuFg_sNHq4uWJOcYnhSX-RNBwAKk8A';
  static const String currentComercioId =
      '1b920631-9aeb-43d2-9e0f-97fe5235693e';

  static bool get hasCurrentComercioId => currentComercioId.trim().isNotEmpty;
}
