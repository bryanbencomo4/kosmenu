/// Ephemeral signed-URL holder for merchant comprobante preview.
/// Never persist; clear when the view closes.
class ComprobanteSignedUrlSession {
  String? _url;
  DateTime? _expiresAt;

  String? get url => _url;
  DateTime? get expiresAt => _expiresAt;

  bool get hasUsableUrl {
    final url = _url;
    final expiresAt = _expiresAt;
    if (url == null || url.isEmpty || expiresAt == null) return false;
    return DateTime.now().isBefore(
      expiresAt.subtract(const Duration(seconds: 30)),
    );
  }

  void store({required String url, required int expiresInSec}) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) {
      clear();
      return;
    }
    final ttl = expiresInSec <= 0 ? 300 : expiresInSec;
    // Cap client-side assumption at 5 minutes for safety checks.
    final bounded = ttl > 300 ? 300 : ttl;
    _url = trimmed;
    _expiresAt = DateTime.now().add(Duration(seconds: bounded));
  }

  void clear() {
    _url = null;
    _expiresAt = null;
  }
}
