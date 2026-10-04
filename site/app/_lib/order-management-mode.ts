export type OrderManagementMode = 'platform' | 'whatsapp_manual';

export function normalizeOrderManagementMode(value: unknown): OrderManagementMode {
  return value === 'whatsapp_manual' ? 'whatsapp_manual' : 'platform';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function resolveCommerceManagementMode(commerce: unknown): OrderManagementMode {
  try {
    const row = record(commerce);
    const config = record(row.config_negocio ?? record(row.branding_ia).config_negocio);
    return normalizeOrderManagementMode(config.order_management_mode);
  } catch {
    return 'platform';
  }
}

export function resolveOrderManagementMode(details: unknown): OrderManagementMode {
  try {
    return normalizeOrderManagementMode(record(details).management_mode);
  } catch {
    return 'platform';
  }
}

export function isWhatsappManualOrder(details: unknown) {
  return resolveOrderManagementMode(details) === 'whatsapp_manual';
}