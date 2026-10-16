/// Resolves public Supabase Storage URLs to cold variants when possible,
/// with on-the-fly rendered WebP as fallback (same perceived performance).
class StorageImageUrl {
  const StorageImageUrl._();

  static const String _publicMarker = '/storage/v1/object/public/';
  static const String _renderMarker = '/storage/v1/render/image/public/';

  static String? coldVariant(
    String? imageUrl, {
    required String kind, // thumb | card | hero
    String format = 'webp',
  }) {
    final raw = imageUrl?.trim() ?? '';
    if (raw.isEmpty) return null;
    final uri = Uri.tryParse(raw);
    if (uri == null || !uri.hasScheme) return raw;
    if (!uri.path.contains(_publicMarker)) return null;
    if (uri.path.contains('/.variants/')) return raw;

    final after = uri.path.split(_publicMarker).last;
    final slash = after.indexOf('/');
    if (slash <= 0) return null;
    final bucket = after.substring(0, slash);
    if (bucket != 'product-images' && bucket != 'logos-comercios') return null;
    final objectPath = Uri.decodeComponent(after.substring(slash + 1));
    final lastSlash = objectPath.lastIndexOf('/');
    final directory = lastSlash >= 0 ? objectPath.substring(0, lastSlash) : '';
    final fileName =
        lastSlash >= 0 ? objectPath.substring(lastSlash + 1) : objectPath;
    final dot = fileName.lastIndexOf('.');
    final baseName = dot > 0 ? fileName.substring(0, dot) : fileName;
    if (baseName.isEmpty) return null;
    final folder = directory.isEmpty
        ? '.variants/$baseName'
        : '$directory/.variants/$baseName';
    final path = '$_publicMarker$bucket/$folder/$kind.$format';
    return uri.replace(path: path, queryParameters: const <String, String>{}).toString();
  }

  static String? optimize(
    String? imageUrl, {
    int width = 200,
    int quality = 70,
  }) {
    final raw = imageUrl?.trim() ?? '';
    if (raw.isEmpty) return null;

    final kind = width <= 200 ? 'thumb' : width <= 480 ? 'card' : 'hero';
    final cold = coldVariant(raw, kind: kind);
    // Prefer cold path in markup; Image widgets should still handle 404→hot if needed.
    if (cold != null) return cold;

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
      return raw;
    }

    final path = uri.path.replaceFirst(_publicMarker, _renderMarker);
    return uri.replace(path: path, queryParameters: params).toString();
  }

  static String? hot(
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
    if (!uri.path.contains(_publicMarker)) return raw;
    final path = uri.path.replaceFirst(_publicMarker, _renderMarker);
    return uri.replace(path: path, queryParameters: params).toString();
  }
}
