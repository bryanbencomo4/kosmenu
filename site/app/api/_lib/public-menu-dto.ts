/**
 * Explicit public DTOs for menu surfaces.
 * Never include owner_id, private notes, tokens, or admin flags.
 */

const PUBLIC_COMERCIO_KEYS = [
  'id',
  'slug',
  'nombre',
  'logo_url',
  'whatsapp',
  'direccion',
  'latitud',
  'longitud',
  'permite_delivery',
  'en_linea',
  'menu_palette',
  'menu_palette_primary',
  'menu_palette_accent',
  'menu_palette_surface',
  'menu_palette_text',
  'menu_layout',
  'menu_footer',
  'menu_font',
  'moneda',
  'tasa_cambio_pesos',
  'exchange_rate_value',
  'exchange_rate_mode',
  'exchange_rate_source',
  'exchange_rate_quote_currency',
  'horario',
  'horarios',
] as const;

const PUBLIC_METODO_PAGO_KEYS = [
  'id',
  'comercio_id',
  'nombre',
  'tipo',
  'descripcion',
  'detalles',
] as const;

const SENSITIVE_COMERCIO_KEYS = [
  'owner_id',
  'email',
  'correo',
  'user_id',
  'branding_ia',
  'onboarding_completed',
  'creado_por_ia',
  'confianza_ia',
  'stripe_customer_id',
  'api_key',
  'token',
  'secret',
  'credentials',
  'notas_internas',
  'internal_notes',
  'rif',
  'nit',
  'documento_fiscal',
  'direccion_fiscal',
  'telefono_interno',
] as const;

const PRIVATE_METODO_PAGO_KEYS = [
  'notas',
  'notas_internas',
  'internal_notes',
  'owner_id',
  'verificado',
  'verification_status',
  'metadata',
  'admin_flags',
  'cuenta_completa',
  'banco_cuenta_privada',
] as const;

function pickKeys(source: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function omitKeys(source: Record<string, unknown>, keys: readonly string[]) {
  const blocked = new Set(keys.map((k) => k.toLowerCase()));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (blocked.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export function toPublicComercioDto(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  const picked = pickKeys(row, PUBLIC_COMERCIO_KEYS);
  // Defense in depth: strip known sensitive keys even if allow-list drifts.
  return omitKeys(picked, SENSITIVE_COMERCIO_KEYS);
}

export function toPublicMetodoPagoDto(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  if (row.visible_menu === false || row.activo === false) {
    return null;
  }
  const picked = pickKeys(row, PUBLIC_METODO_PAGO_KEYS);
  // Public menu needs payment labels; bank details stay available after method selection
  // via `detalles` / `descripcion` already shown in the web checkout. Strip private keys only.
  return omitKeys(picked, PRIVATE_METODO_PAGO_KEYS);
}

export function toPublicMetodosPagoDto(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => toPublicMetodoPagoDto((row ?? null) as Record<string, unknown>))
    .filter((row): row is Record<string, unknown> => row != null);
}

export function assertNoSensitivePublicComercioFields(dto: Record<string, unknown>) {
  for (const key of SENSITIVE_COMERCIO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(dto, key)) {
      throw new Error(`Public comercio DTO leaked field: ${key}`);
    }
  }
}

export const PUBLIC_MENU_DTO_META = {
  comercioPublicKeys: PUBLIC_COMERCIO_KEYS,
  metodoPagoPublicKeys: PUBLIC_METODO_PAGO_KEYS,
  comercioSensitiveKeys: SENSITIVE_COMERCIO_KEYS,
  metodoPagoPrivateKeys: PRIVATE_METODO_PAGO_KEYS,
} as const;
