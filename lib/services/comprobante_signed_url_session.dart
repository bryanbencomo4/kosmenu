/// Ephemeral signed-URL holder for merchant comprobante preview.
/// Never persist; clear when the view closes.
class ComprobanteSignedUrlSession {
  String? _url;
  String? _previewUrl;
  String? _downloadUrl;
  DateTime? _expiresAt;

  String? get url => _url;
  String? get previewUrl => _previewUrl;
  String? get downloadUrl => _downloadUrl;
  DateTime? get expiresAt => _expiresAt;

  bool get hasUsableUrl {
    final url = _url;
    final expiresAt = _expiresAt;
    if (url == null || url.isEmpty || expiresAt == null) return false;
    return DateTime.now().isBefore(
      expiresAt.subtract(const Duration(seconds: 30)),
    );
  }

  void store({
    required String url,
    required int expiresInSec,
    String? previewUrl,
    String? downloadUrl,
  }) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) {
      clear();
      return;
    }
    final ttl = expiresInSec <= 0 ? 300 : expiresInSec;
    // Cap client-side assumption at 5 minutes for safety checks.
    final bounded = ttl > 300 ? 300 : ttl;
    _url = trimmed;
    _previewUrl = _optionalHttpUrl(previewUrl);
    _downloadUrl = _optionalHttpUrl(downloadUrl);
    _expiresAt = DateTime.now().add(Duration(seconds: bounded));
  }

  void clear() {
    _url = null;
    _previewUrl = null;
    _downloadUrl = null;
    _expiresAt = null;
  }
}

String? _optionalHttpUrl(String? value) {
  final text = value?.trim() ?? '';
  if (text.isEmpty) return null;
  if (text.startsWith('https://') || text.startsWith('http://')) return text;
  return null;
}
