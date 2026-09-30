/**
 * Optional delivery tariff engine.
 * Missing or disabled config keeps today's checkout (costo_envio / client fee).
 */

export type DeliveryPricingType = 'fixed' | 'distance' | 'zones' | 'free';

export type DeliveryDistanceConfig = {
  basePrice: number;
  includedKm: number;
  extraPricePerKm: number;
};

export type DeliveryZone = {
  name: string;
  minDistance: number;
  maxDistance: number;
  price: number;
};

export type DeliveryConfig = {
  enabled: boolean;
  pricingType: DeliveryPricingType;
  fixedPrice: number;
  distance: DeliveryDistanceConfig;
  zones: DeliveryZone[];
  freeDelivery: { enabled: boolean; minimumOrder: number };
  minOrder: number;
  estimatedTimes: { preparationMinutes: number; deliveryMinutes: number };
  customMessage: string;
  version: 1;
};

export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  enabled: false,
  pricingType: 'fixed',
  fixedPrice: 0,
  distance: {
    basePrice: 0,
    includedKm: 0,
    extraPricePerKm: 0,
  },
  zones: [],
  freeDelivery: { enabled: false, minimumOrder: 0 },
  minOrder: 0,
  estimatedTimes: { preparationMinutes: 20, deliveryMinutes: 30 },
  customMessage: '',
  version: 1,
};

export type DeliveryQuote = {
  applied: boolean;
  fee: number;
  free: boolean;
  method: DeliveryPricingType | null;
  blocked: boolean;
  blockReason: string | null;
  distanceKm: number | null;
  snapshot: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readBool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function readNumber(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function readNonNegative(value: unknown, fallback: number) {
  return Math.max(0, readNumber(value, fallback));
}

function readPricingType(value: unknown): DeliveryPricingType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'distance' || raw === 'zones' || raw === 'free' || raw === 'fixed') {
    return raw;
  }
  return DEFAULT_DELIVERY_CONFIG.pricingType;
}

function parseDistance(raw: unknown): DeliveryDistanceConfig {
  const row = asRecord(raw) ?? {};
  return {
    basePrice: readNonNegative(row.base_price ?? row.basePrice, DEFAULT_DELIVERY_CONFIG.distance.basePrice),
    includedKm: readNonNegative(row.included_km ?? row.includedKm, DEFAULT_DELIVERY_CONFIG.distance.includedKm),
    extraPricePerKm: readNonNegative(
      row.extra_price_per_km ?? row.extraPricePerKm,
      DEFAULT_DELIVERY_CONFIG.distance.extraPricePerKm,
    ),
  };
}

function parseZones(raw: unknown): DeliveryZone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const name = String(row.name ?? '').trim() || 'Zona';
      const minDistance = readNonNegative(row.min_distance ?? row.minDistance, 0);
      const maxDistance = readNonNegative(row.max_distance ?? row.maxDistance, 0);
      const price = readNonNegative(row.price, 0);
      return { name, minDistance, maxDistance, price };
    })
    .filter((zone): zone is DeliveryZone => zone != null);
}

export function parseDeliveryConfig(raw: unknown): DeliveryConfig {
  const root = asRecord(raw);
  const nested =
    asRecord(root?.delivery_config) ??
    asRecord(root?.delivery_tarifas) ??
    asRecord(root?.tarifas_delivery) ??
    root;
  const source = nested ?? {};
  const times = asRecord(source.estimated_times) ?? asRecord(source.estimatedTimes) ?? {};
  const free = asRecord(source.free_delivery) ?? asRecord(source.freeDelivery) ?? {};

  return {
    enabled: readBool(source.enabled, DEFAULT_DELIVERY_CONFIG.enabled),
    pricingType: readPricingType(source.pricing_type ?? source.pricingType),
    fixedPrice: readNonNegative(source.fixed_price ?? source.fixedPrice, DEFAULT_DELIVERY_CONFIG.fixedPrice),
    distance: parseDistance(source.distance_config ?? source.distance),
    zones: parseZones(source.zones),
    freeDelivery: {
      enabled: readBool(free.enabled, false),
      minimumOrder: readNonNegative(free.minimum_order ?? free.minimumOrder, 0),
    },
    minOrder: readNonNegative(source.min_order ?? source.minOrder ?? source.minimum_order, 0),
    estimatedTimes: {
      preparationMinutes: Math.round(
        readNonNegative(
          times.preparation_minutes ?? times.preparationMinutes,
          DEFAULT_DELIVERY_CONFIG.estimatedTimes.preparationMinutes,
        ),
      ),
      deliveryMinutes: Math.round(
        readNonNegative(
          times.delivery_minutes ?? times.deliveryMinutes,
          DEFAULT_DELIVERY_CONFIG.estimatedTimes.deliveryMinutes,
        ),
      ),
    },
    customMessage: String(source.custom_message ?? source.customMessage ?? '').trim(),
    version: 1,
  };
}

export function deliveryConfigToJson(config: DeliveryConfig) {
  return {
    enabled: config.enabled,
    pricing_type: config.pricingType,
    fixed_price: config.fixedPrice,
    distance_config: {
      base_price: config.distance.basePrice,
      included_km: config.distance.includedKm,
      extra_price_per_km: config.distance.extraPricePerKm,
    },
    zones: config.zones.map((zone) => ({
      name: zone.name,
      min_distance: zone.minDistance,
      max_distance: zone.maxDistance,
      price: zone.price,
    })),
    free_delivery: {
      enabled: config.freeDelivery.enabled,
      minimum_order: config.freeDelivery.minimumOrder,
    },
    min_order: config.minOrder,
    estimated_times: {
      preparation_minutes: config.estimatedTimes.preparationMinutes,
      delivery_minutes: config.estimatedTimes.deliveryMinutes,
    },
    custom_message: config.customMessage,
    version: 1,
  };
}

/** Public DTO: disabled shops only advertise { enabled: false }. */
export function toPublicDeliveryConfig(raw: unknown) {
  const config = parseDeliveryConfig(raw);
  if (!config.enabled) {
    return { enabled: false as const };
  }
  return deliveryConfigToJson(config);
}

export function validateDeliveryConfig(config: DeliveryConfig): string[] {
  const errors: string[] = [];
  if (config.fixedPrice < 0 || config.distance.basePrice < 0 || config.distance.extraPricePerKm < 0) {
    errors.push('Los precios no pueden ser negativos.');
  }
  if (config.distance.includedKm < 0) {
    errors.push('Los kilómetros incluidos no son válidos.');
  }
  if (config.pricingType === 'zones') {
    if (config.zones.length === 0) {
      errors.push('Agrega al menos una zona con precio.');
    }
    config.zones.forEach((zone, index) => {
      if (zone.maxDistance <= zone.minDistance) {
        errors.push(`La zona ${index + 1} tiene un rango inválido.`);
      }
      if (zone.price < 0) {
        errors.push(`La zona ${index + 1} no puede tener precio negativo.`);
      }
    });
  }
  if (config.freeDelivery.enabled && config.freeDelivery.minimumOrder <= 0) {
    errors.push('Indica el monto mínimo para delivery gratis.');
  }
  return errors;
}

export function haversineKm(
  origin: { lat: number; lng: number } | null | undefined,
  destination: { lat: number; lng: number } | null | undefined,
): number | null {
  if (
    !origin ||
    !destination ||
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(destination.lat) ||
    !Number.isFinite(destination.lng)
  ) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(destination.lat - origin.lat);
  const dLng = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(origin.lat)) * Math.cos(toRad(destination.lat)) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roundMoney(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function feeForDistance(config: DeliveryConfig, distanceKm: number) {
  const extraKm = Math.max(0, Math.ceil(distanceKm - config.distance.includedKm));
  return roundMoney(config.distance.basePrice + extraKm * config.distance.extraPricePerKm);
}

function feeForZones(config: DeliveryConfig, distanceKm: number): { fee: number | null; outOfRange: boolean } {
  const match = config.zones.find(
    (zone) => distanceKm >= zone.minDistance && distanceKm <= zone.maxDistance,
  );
  if (match) return { fee: roundMoney(match.price), outOfRange: false };
  return { fee: null, outOfRange: true };
}

export function quoteDeliveryFee(input: {
  config: unknown;
  isDelivery: boolean;
  subtotal: number;
  origin?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
  fallbackFee?: number;
}): DeliveryQuote {
  const config = parseDeliveryConfig(input.config);
  const fallback = Math.max(0, Number.isFinite(input.fallbackFee) ? Number(input.fallbackFee) : 0);
  const distanceKm = haversineKm(input.origin, input.destination);

  if (!config.enabled) {
    return {
      applied: false,
      fee: input.isDelivery ? roundMoney(fallback) : 0,
      free: false,
      method: null,
      blocked: false,
      blockReason: null,
      distanceKm,
      snapshot: null,
    };
  }

  const snapshot = deliveryConfigToJson(config);
  if (!input.isDelivery) {
    return {
      applied: true,
      fee: 0,
      free: false,
      method: config.pricingType,
      blocked: false,
      blockReason: null,
      distanceKm,
      snapshot,
    };
  }

  if (config.minOrder > 0 && input.subtotal < config.minOrder) {
    return {
      applied: true,
      fee: 0,
      free: false,
      method: config.pricingType,
      blocked: true,
      blockReason: `El delivery está disponible desde ${config.minOrder}.`,
      distanceKm,
      snapshot,
    };
  }

  let fee = 0;
  if (config.pricingType === 'free') {
    fee = 0;
  } else if (config.pricingType === 'fixed') {
    fee = roundMoney(config.fixedPrice);
  } else if (config.pricingType === 'distance') {
    fee = feeForDistance(config, distanceKm ?? 0);
  } else {
    if (config.zones.length === 0) {
      return {
        applied: true,
        fee: 0,
        free: false,
        method: config.pricingType,
        blocked: true,
        blockReason: 'Este negocio aún no configuró zonas de delivery.',
        distanceKm,
        snapshot,
      };
    }
    const zoned = feeForZones(config, distanceKm ?? 0);
    if (zoned.outOfRange || zoned.fee == null) {
      return {
        applied: true,
        fee: 0,
        free: false,
        method: config.pricingType,
        blocked: true,
        blockReason: 'Tu dirección está fuera de la zona de cobertura.',
        distanceKm,
        snapshot,
      };
    }
    fee = zoned.fee;
  }

  const free =
    config.pricingType === 'free' ||
    (config.freeDelivery.enabled && input.subtotal >= config.freeDelivery.minimumOrder && config.freeDelivery.minimumOrder > 0);

  return {
    applied: true,
    fee: free ? 0 : fee,
    free,
    method: config.pricingType,
    blocked: false,
    blockReason: null,
    distanceKm,
    snapshot,
  };
}
