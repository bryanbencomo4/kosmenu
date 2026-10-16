/** Persist last successful (or last completed "Tus datos") customer fields on-device. */

export const CHECKOUT_CUSTOMER_CACHE_KEY = 'elmenuxfa:checkout-customer-v2';
const LEGACY_CACHE_KEY = 'elmenuxfa:checkout-customer-v1';

export type CachedCheckoutCustomer = {
  clientName: string;
  clientWhatsapp: string;
  clientEmail: string;
  selectedCurrency?: string;
  savedAt?: string;
};

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
    if (!clientName && !clientWhatsapp && !clientEmail) return null;
    return {
      clientName,
      clientWhatsapp,
      clientEmail,
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
  selectedCurrency?: string;
}): void {
  if (typeof window === 'undefined') return;
  const payload: CachedCheckoutCustomer = {
    clientName: clean(input.clientName),
    clientWhatsapp: clean(input.clientWhatsapp),
    clientEmail: clean(input.clientEmail).toLowerCase(),
    selectedCurrency: clean(input.selectedCurrency) || undefined,
    savedAt: new Date().toISOString(),
  };
  if (!payload.clientName && !payload.clientWhatsapp && !payload.clientEmail) return;
  try {
    window.localStorage.setItem(CHECKOUT_CUSTOMER_CACHE_KEY, JSON.stringify(payload));
    // Keep legacy key in sync for older builds still reading v1.
    window.localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota — ignore.
  }
}
