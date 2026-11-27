/**
 * Delivery answers from the restaurant's REAL tariff config.
 * Pure helpers (+ one lazy DB loader) so the brain can quote "how much to my place?"
 * without inventing a number and without static server-only imports.
 */

import {
  deliveryConfigToJson,
  extractDeliveryConfigSource,
  haversineKm,
  parseDeliveryConfig,
  quoteDeliveryFee,
  type DeliveryConfig,
} from '../../../../_lib/delivery-config';

export type ShopDeliveryInfo = {
  id: string;
  nombre: string;
  slug: string;
  /** Shop base currency (menu). */
  currency: string;
  /** `permite_delivery` / `inicio_menu.delivery`; null = unknown. */
  deliveryFlag: boolean | null;
  origin: { lat: number; lng: number } | null;
  address: string | null;
  config: DeliveryConfig;
};

export type LoadShopDelivery = (comercioId: string) => Promise<ShopDeliveryInfo | null>;

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Beyond this straight-line distance no restaurant delivers: it is another city. */
export const MAX_SANE_DELIVERY_KM = 60;

/** Builds the info from a raw `comercios` row (also used by tests). */
export function shopDeliveryFromRow(row: Record<string, unknown>): ShopDeliveryInfo {
  const branding = (row.branding_ia ?? null) as { config_negocio?: { inicio_menu?: Record<string, unknown> } } | null;
  const inicio = branding?.config_negocio?.inicio_menu ?? {};
  const flag =
    row.permite_delivery === true || inicio.delivery === true
      ? true
      : row.permite_delivery === false
        ? false
        : null;
  const lat = num(row.latitud);
  const lng = num(row.longitud);
  const config = parseDeliveryConfig(extractDeliveryConfigSource(row));
  return {
    id: String(row.id ?? ''),
    nombre: String(row.nombre ?? ''),
    slug: String(row.slug ?? ''),
    currency: String(row.moneda || 'USD').trim().toUpperCase(),
    deliveryFlag: flag,
    origin: lat != null && lng != null && !(lat === 0 && lng === 0) ? { lat, lng } : null,
    address: row.direccion ? String(row.direccion) : null,
    config,
  };
}

/** Default loader: service-role read of the public delivery facts only. */
export const loadShopDeliveryFromDb: LoadShopDelivery = async (comercioId) => {
  const { getServiceSupabaseClient } = await import('../../../_lib/supabase-server');
  const client = getServiceSupabaseClient();
  const attempts = [
    'id,nombre,slug,moneda,permite_delivery,latitud,longitud,direccion,branding_ia',
    'id,nombre,slug,moneda,permite_delivery,branding_ia',
  ];
  for (const cols of attempts) {
    const { data, error } = await client.from('comercios').select(cols).eq('id', comercioId).maybeSingle();
    if (!error && data) return shopDeliveryFromRow(data as unknown as Record<string, unknown>);
  }
  return null;
};

function trimNumber(n: number): string {
  const r = Math.round(n * 100) / 100;
  const [int, dec] = String(Math.abs(r)).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${r < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

export function formatMoney(amount: number, currency: string): string {
  const code = (currency || '').toUpperCase();
  if (code === 'USD') return `$${trimNumber(amount)}`;
  return code ? `${trimNumber(amount)} ${code}` : trimNumber(amount);
}

export type DeliveryAnswer = {
  /** Facts, in order; the brain joins them in prose. */
  lines: string[];
  /** True when the exact fee depends on where the person is and we don't have it yet. */
  needsLocation: boolean;
  /** False when the restaurant has no delivery at all. */
  delivers: boolean;
};

export function describeDelivery(
  info: ShopDeliveryInfo,
  dest: { lat: number; lng: number; label?: string | null } | null,
): DeliveryAnswer {
  const { config } = info;
  const name = `*${info.nombre}*`;
  const cur = (config.currency || info.currency || '').toUpperCase();

  if (!config.enabled && info.deliveryFlag !== true) {
    return {
      delivers: false,
      needsLocation: false,
      lines: [`Por lo que tiene publicado, ${name} no tiene delivery activo; se pide para retirar o comer en el local.`],
    };
  }

  if (!config.enabled) {
    return {
      delivers: true,
      needsLocation: false,
      lines: [
        `Sí, ${name} hace delivery, pero no tiene una tarifa automática publicada, así que no te voy a inventar un precio.`,
        'El costo lo ves al elegir *delivery* en su menú antes de confirmar el pedido.',
      ],
    };
  }

  const extras: string[] = [];
  if (config.minOrder > 0) extras.push(`Pedido mínimo para delivery: ${formatMoney(config.minOrder, cur)}.`);
  if (config.freeDelivery.enabled && config.freeDelivery.minimumOrder > 0) {
    extras.push(`El delivery es gratis desde ${formatMoney(config.freeDelivery.minimumOrder, cur)} en pedido.`);
  }
  const { preparationMinutes: prep, deliveryMinutes: ride } = config.estimatedTimes;
  if (prep || ride) extras.push(`Tiempo estimado: unos ${prep + ride} min (${prep} de preparación + ${ride} de camino).`);
  if (config.customMessage) extras.push(config.customMessage.slice(0, 220));

  const done = (lines: string[], needsLocation = false): DeliveryAnswer => ({
    delivers: true,
    needsLocation,
    lines: [...lines, ...extras],
  });

  switch (config.pricingType) {
    case 'free':
      return done([`Sí, ${name} hace delivery y es *gratis* 🛵`]);
    case 'fixed':
      return done([`Sí, ${name} hace delivery con tarifa fija de *${formatMoney(config.fixedPrice, cur)}* 🛵`]);
    default:
      break;
  }

  const rule = (() => {
    if (config.pricingType === 'distance') {
      return `su tarifa es de ${formatMoney(config.distance.basePrice, cur)} (incluye ${config.distance.includedKm} km) más ${formatMoney(config.distance.extraPricePerKm, cur)} por cada km extra`;
    }
    if (config.pricingType === 'zones') {
      const sorted = [...config.zones].sort((a, b) => a.minDistance - b.minDistance);
      const lo = sorted[0];
      const hi = sorted[sorted.length - 1];
      if (!lo || !hi) return 'cobra según tu distancia';
      return `cobra según la distancia a su local, de ${formatMoney(lo.price, cur)} a ${formatMoney(hi.price, cur)}, y solo llega hasta ${hi.maxDistance} km a la redonda`;
    }
    const parts = config.areaZones.slice(0, 5).map((z) => `${z.name}: ${formatMoney(z.price, cur)}`);
    return parts.length ? `cobra por zonas (${parts.join(' · ')})` : 'cobra según tu zona';
  })();

  if (!dest) {
    // Without the person's place we can NOT say it reaches them: the tariff depends on distance
    // and zones are limited. Never lead with "sí" and never quote a single price as if it applied.
    const firstLine = info.address?.split('\n')[0]?.trim();
    const local = firstLine ? ` Su local queda en ${firstLine}.` : '';
    return done([`${name} hace delivery, pero con cobertura limitada: ${rule}.${local}`], true);
  }

  const needsOrigin = config.pricingType !== 'area_zones';
  if (needsOrigin && !info.origin) {
    return done([
      `Sí, ${name} hace delivery y ${rule}.`,
      'No tengo su punto exacto en el mapa, así que no puedo calcular tu tarifa desde aquí; el sistema la calcula con tu ubicación cuando eliges delivery en el menú.',
    ]);
  }

  const straightKm = haversineKm(info.origin, dest);
  if (straightKm != null && straightKm > MAX_SANE_DELIVERY_KM) {
    const where2 = dest.label ? `hasta *${dest.label}*` : 'hasta donde estás';
    return {
      delivers: false,
      needsLocation: false,
      lines: [
        `${name} no te llega ${where2}: queda a unos ${trimNumber(straightKm)} km en línea recta de su local${info.address ? ` (${info.address.split('\n')[0]})` : ''}, demasiado lejos para un delivery.`,
      ],
    };
  }

  // Quote the plain tariff: the "free over X" rule is stated separately in the extras.
  const quote = quoteDeliveryFee({
    config: deliveryConfigToJson({ ...config, freeDelivery: { enabled: false, minimumOrder: 0 } }),
    isDelivery: true,
    subtotal: config.minOrder,
    origin: info.origin,
    destination: dest,
  });
  const km = quote.distanceKm ?? haversineKm(info.origin, dest);
  const where = dest.label ? `hasta *${dest.label}*` : 'hasta donde estás';
  const away = km != null ? ` (a unos ${trimNumber(km)} km en línea recta)` : '';

  if (quote.blocked) {
    return done([
      `${name} hace delivery, pero ${where}${away} no llega: ${quote.blockReason || 'queda fuera de su zona de cobertura'}.`,
    ]);
  }
  if (quote.outOfZone) {
    return done([
      `${name} hace delivery, pero ${where} queda fuera de sus zonas con tarifa; ahí el costo se acuerda directamente con el negocio.`,
    ]);
  }
  if (quote.free || quote.fee === 0) {
    return done([`Sí, ${name} te lleva ${where}${away} y el delivery te sale *gratis* 🛵`]);
  }
  return done([`Sí, ${name} te lleva ${where}${away}. El delivery te costaría *${formatMoney(quote.fee, cur)}* 🛵`]);
}

// ---------------------------------------------------------------------------
// Numeric quote (used to add the delivery to an order total)
// ---------------------------------------------------------------------------

export type ShopDeliveryQuote =
  | { kind: 'none' }
  | { kind: 'no_tariff' }
  | { kind: 'needs_location' }
  | { kind: 'no_origin' }
  | { kind: 'currency_mismatch'; tariffCurrency: string; baseCurrency: string }
  | { kind: 'blocked'; reason: string; distanceKm: number | null }
  | { kind: 'agreed'; distanceKm: number | null }
  | {
      kind: 'fee';
      /** In the shop's base (menu) currency. */
      fee: number;
      free: boolean;
      currency: string;
      distanceKm: number | null;
      etaMinutes: number | null;
      minOrder: number;
    };

/** tariff-currency → base-currency converter; null when there is no verifiable rate. */
export type CurrencyConverter = (amount: number, from: string, to: string) => number | null;

/**
 * Delivery fee for an order of `subtotal` (menu currency) to `dest`, from the restaurant's own
 * tariff. Never guesses: anything it cannot verify comes back as an explicit non-fee kind.
 */
export function quoteShopDelivery(
  info: ShopDeliveryInfo,
  dest: { lat: number; lng: number } | null,
  subtotal: number,
  convert?: CurrencyConverter,
): ShopDeliveryQuote {
  const { config } = info;
  if (!config.enabled && info.deliveryFlag !== true) return { kind: 'none' };
  if (!config.enabled) return { kind: 'no_tariff' };

  const baseCur = (info.currency || config.currency || '').toUpperCase();
  const tariffCur = (config.currency || info.currency || '').toUpperCase();
  const needsOrigin = config.pricingType !== 'area_zones' && config.pricingType !== 'free' && config.pricingType !== 'fixed';
  if (!dest && config.pricingType !== 'free' && config.pricingType !== 'fixed') return { kind: 'needs_location' };
  if (needsOrigin && !info.origin) return { kind: 'no_origin' };

  const km = haversineKm(info.origin, dest);
  if (km != null && km > MAX_SANE_DELIVERY_KM) {
    return {
      kind: 'blocked',
      distanceKm: km,
      reason: `queda a unos ${trimNumber(km)} km en línea recta de su local, demasiado lejos para un delivery`,
    };
  }

  let convertToBase: ((n: number) => number) | undefined;
  if (tariffCur && baseCur && tariffCur !== baseCur) {
    const probe = convert ? convert(1, tariffCur, baseCur) : null;
    if (probe == null || !Number.isFinite(probe) || probe <= 0 || !convert) {
      return { kind: 'currency_mismatch', tariffCurrency: tariffCur, baseCurrency: baseCur };
    }
    convertToBase = (n) => convert(n, tariffCur, baseCur) ?? n;
  }

  const quote = quoteDeliveryFee({
    config: deliveryConfigToJson(config),
    isDelivery: true,
    subtotal,
    origin: info.origin,
    destination: dest,
    convertToBase,
  });
  const eta = config.estimatedTimes.preparationMinutes + config.estimatedTimes.deliveryMinutes;
  if (quote.blocked) {
    return { kind: 'blocked', distanceKm: quote.distanceKm ?? km, reason: quote.blockReason || 'queda fuera de su zona de cobertura' };
  }
  if (quote.outOfZone) return { kind: 'agreed', distanceKm: quote.distanceKm ?? km };
  return {
    kind: 'fee',
    fee: quote.fee,
    free: quote.free || quote.fee === 0,
    currency: baseCur,
    distanceKm: quote.distanceKm ?? km,
    etaMinutes: eta > 0 ? eta : null,
    minOrder: config.minOrder,
  };
}
