/// Rewrites public Supabase Storage object URLs to on-the-fly rendered
/// thumbnails (WebP) when possible. Leaves external / already-rendered URLs alone.
class StorageImageUrl {
  const StorageImageUrl._();

  static const String _publicMarker = '/storage/v1/object/public/';
  static const String _renderMarker = '/storage/v1/render/image/public/';

  static String? optimize(
    String? imageUrl, {
    int width = 200,
    int quality = 70,
  }) {
    final raw = imageUrl?.trim() ?? '';
    if (raw.isEmpty) return null;

    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasScheme) return raw;
    if (!uri.path.contains(_publicMarker)) {
      // Already a render URL or non-Supabase — return as-is.
      return raw;
    }

    final path = uri.path.replaceFirst(_publicMarker, _renderMarker);
    final safeWidth = width < 1 ? 1 : width;
    final safeQuality = quality.clamp(40, 90);
    return uri
        .replace(
          path: path,
          queryParameters: <String, String>{
            ...uri.queryParameters,
            'width': '$safeWidth',
            'quality': '$safeQuality',
            'format': 'webp',
          },
        )
        .toString();
  }
}
