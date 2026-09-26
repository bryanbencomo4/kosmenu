export const PRODUCTION_SUPABASE_URL =
  'https://qqhberaayhohxlbbhdyi.supabase.co';
export const PREVIEW_SUPABASE_URL =
  'https://gsfxqzvmyzjjgpigrste.supabase.co';

const PUBLIC_COMMERCE_FIELDS = [
  'id',
  'slug',
  'nombre',
  'logo_url',
  'whatsapp',
  'direccion',
  'latitud',
  'longitud',
  'permite_delivery',
  'recibe_pedidos_whatsapp',
  'en_linea',
  'menu_palette',
  'menu_palette_primary',
  'menu_palette_accent',
  'menu_palette_surface',
  'menu_palette_text',
  'menu_theme_mode',
  'color_principal',
  'menu_layout',
  'menu_footer',
  'menu_font',
  'moneda',
  'tasa_cambio_pesos',
  'exchange_rate_value',
  'exchange_rate_mode',
  'exchange_rate_source',
  'exchange_rate_quote_currency',
  'horarios',
  'categoria',
  'negocio_virtual',
  'mostrar_en_directorio_publico',
] as const;

const PUBLIC_CHECKOUT_CONFIG_FIELDS = [
  'checkout_currencies',
  'exchange_rates',
  'exchange_rate_modes',
  'exchange_rate_sources',
] as const;

const PUBLIC_SOCIAL_NETWORKS = new Set([
  'instagram',
  'facebook',
  'youtube',
  'tiktok',
]);

export function assertSyncOrigins(sourceUrl: string, targetUrl: string) {
  if (new URL(sourceUrl).origin !== PRODUCTION_SUPABASE_URL) {
    throw new Error('Sync source must be the Production public API.');
  }
  if (new URL(targetUrl).origin !== PREVIEW_SUPABASE_URL) {
    throw new Error('Sync target must be the isolated Preview project.');
  }
}

export function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length || leftBytes.length === 0) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

export function toPreviewCommerceRow(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of PUBLIC_COMMERCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }

  const config: Record<string, unknown> = {};
  for (const field of PUBLIC_CHECKOUT_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      config[field] = source[field];
    }
  }

  const sourceSocialLinks = source.social_links;
  if (
    sourceSocialLinks &&
    typeof sourceSocialLinks === 'object' &&
    !Array.isArray(sourceSocialLinks)
  ) {
    const socialLinks = Object.fromEntries(
      Object.entries(sourceSocialLinks as Record<string, unknown>).filter(
        ([network, value]) =>
          PUBLIC_SOCIAL_NETWORKS.has(network) &&
          typeof value === 'string' &&
          value.trim().length > 0,
      ),
    );
    if (Object.keys(socialLinks).length > 0) {
      config.social_links = socialLinks;
    }
  }

  result.branding_ia = Object.keys(config).length > 0
    ? { config_negocio: config }
    : null;
  return result;
}

export function clearInvisibleCatalogReferences(
  catalogs: Array<Record<string, unknown>>,
  categories: Array<Record<string, unknown>>,
) {
  const visibleCatalogIds = new Set(
    catalogs.map((catalog) => String(catalog.id)),
  );
  return categories.map((category) => {
    const catalogId = category.catalogo_id?.toString();
    return catalogId && !visibleCatalogIds.has(catalogId)
      ? { ...category, catalogo_id: null }
      : category;
  });
}