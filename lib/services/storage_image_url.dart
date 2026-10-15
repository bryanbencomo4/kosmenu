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

    final safeWidth = width < 1 ? 1 : width;
    final safeQuality = quality.clamp(40, 90);
    final params = <String, String>{
      ...uri.queryParameters,
      'width': '$safeWidth',
      'quality': '$safeQuality',
      'format': 'webp',
    };

    if (uri.path.contains(_renderMarker)) {
      return uri.replace(queryParameters: params).toString();
    }
    if (!uri.path.contains(_publicMarker)) {
      // External / non-Supabase — leave unchanged.
      return raw;
    }

    final path = uri.path.replaceFirst(_publicMarker, _renderMarker);
    return uri.replace(path: path, queryParameters: params).toString();
  }
}
