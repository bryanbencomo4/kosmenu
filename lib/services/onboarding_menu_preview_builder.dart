/// Builds an in-memory public-menu payload for onboarding preview.
///
/// Shape matches [PublicMenuApiService.fetchMenu] / [PublicMenuView] parsing:
/// `{ comercio, categorias, productos }` — without requiring a published slug.
class OnboardingMenuPreviewBuilder {
  const OnboardingMenuPreviewBuilder._();

  static Map<String, dynamic> build({
    required String comercioId,
    required String businessName,
    String? logoUrl,
    String? category,
    String? whatsapp,
    required bool allowsDelivery,
    String? address,
    double? latitude,
    double? longitude,
    required String menuPaletteId,
    required int? palettePrimaryArgb,
    required int? paletteAccentArgb,
    required int? paletteSurfaceArgb,
    required int? paletteTextArgb,
    required double exchangeRateValue,
    required List<Map<String, dynamic>> categories,
    required List<Map<String, dynamic>> products,
  }) {
    final name = businessName.trim().isEmpty ? 'Tu menu' : businessName.trim();
    final id = comercioId.trim().isEmpty ? 'preview' : comercioId.trim();

    return <String, dynamic>{
      'comercio': <String, dynamic>{
        'id': id,
        'nombre': name,
        'categoria': (category ?? '').trim(),
        'logo_url': (logoUrl ?? '').trim().isEmpty ? null : logoUrl!.trim(),
        'whatsapp': (whatsapp ?? '').trim().isEmpty ? null : whatsapp!.trim(),
        'permite_delivery': allowsDelivery,
        'direccion': (address ?? '').trim(),
        'latitud': latitude,
        'longitud': longitude,
        'menu_palette': menuPaletteId.trim().isEmpty
            ? 'smart'
            : menuPaletteId.trim(),
        'menu_palette_primary': palettePrimaryArgb,
        'menu_palette_accent': paletteAccentArgb,
        'menu_palette_surface': paletteSurfaceArgb,
        'menu_palette_text': paletteTextArgb,
        'exchange_rate_value': exchangeRateValue > 0 ? exchangeRateValue : null,
        'tasa_cambio_pesos': exchangeRateValue > 0 ? exchangeRateValue : null,
      },
      'categorias': categories,
      'productos': products,
    };
  }
}
