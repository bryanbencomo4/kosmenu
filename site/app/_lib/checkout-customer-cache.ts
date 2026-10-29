/** Persist last successful (or last completed "Tus datos") customer fields on-device. */

export const CHECKOUT_CUSTOMER_CACHE_KEY = 'elmenuxfa:checkout-customer-v2';
const LEGACY_CACHE_KEY = 'elmenuxfa:checkout-customer-v1';

export type CachedCheckoutCustomer = {
  clientName: string;
  clientWhatsapp: string;
  clientEmail: string;
  /** Preferencia de recibir resumen/calificación por correo. Default true si no existe. */
  wantOrderEmail: boolean;
  selectedCurrency?: string;
  savedAt?: string;
};

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readWantOrderEmail(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return true;
}

export function readCachedCheckoutCustomer(): CachedCheckoutCustomer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.localStorage.getItem(CHECKOUT_CUSTOMER_CACHE_KEY) ||
      window.localStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCheckoutCustomer>;
    const clientName = clean(parsed.clientName);
    const clientWhatsapp = clean(parsed.clientWhatsapp);
    const clientEmail = clean(parsed.clientEmail).toLowerCase();
    const wantOrderEmail = readWantOrderEmail(parsed.wantOrderEmail);
    // Preferencia "sin correo" puede guardarse sola; no descartar el cache.
    if (!clientName && !clientWhatsapp && !clientEmail && wantOrderEmail) return null;
    return {
      clientName,
      clientWhatsapp,
      clientEmail,
      wantOrderEmail,
      selectedCurrency: clean(parsed.selectedCurrency) || undefined,
      savedAt: clean(parsed.savedAt) || undefined,
    };
  } catch {
    return null;
  }
}

export function writeCachedCheckoutCustomer(input: {
  clientName: string;
  clientWhatsapp: string;
  clientEmail: string;
  wantOrderEmail?: boolean;
  selectedCurrency?: string;
}): void {
  if (typeof window === 'undefined') return;
  const payload: CachedCheckoutCustomer = {
    clientName: clean(input.clientName),
    clientWhatsapp: clean(input.clientWhatsapp),
    clientEmail: clean(input.clientEmail).toLowerCase(),
    wantOrderEmail: typeof input.wantOrderEmail === 'boolean' ? input.wantOrderEmail : true,
    selectedCurrency: clean(input.selectedCurrency) || undefined,
    savedAt: new Date().toISOString(),
  };
  // Permitir guardar solo la preferencia de correo (wantOrderEmail: false).
  if (!payload.clientName && !payload.clientWhatsapp && !payload.clientEmail && payload.wantOrderEmail) {
    return;
  }
  try {
    window.localStorage.setItem(CHECKOUT_CUSTOMER_CACHE_KEY, JSON.stringify(payload));
    // Keep legacy key in sync for older builds still reading v1.
    window.localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota — ignore.
  }
}
