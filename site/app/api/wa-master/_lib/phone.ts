import { digitsOnly } from '../../wa-entry/_lib/contract';

/**
 * Canonical digit key for Master Assistant threads.
 * Prefer aligning with normalizePhoneToE164 when parsing free-form input;
 * inbound wa-entry already provides digits-only fromDigits.
 */
export function waMasterDigitsKey(value: string): string {
  return digitsOnly(value);
}

/** Compare two phone-ish strings after digit normalization. */
export function phonesMatchDigits(a: string, b: string): boolean {
  const da = waMasterDigitsKey(a);
  const db = waMasterDigitsKey(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // VE mobile: 58414… vs 0414… / 414…
  const strip58 = (d: string) => (d.startsWith('58') && d.length >= 12 ? d.slice(2) : d);
  const strip0 = (d: string) => (d.startsWith('0') && d.length >= 10 ? d.slice(1) : d);
  const na = strip0(strip58(da));
  const nb = strip0(strip58(db));
  return na.length >= 10 && nb.length >= 10 && na === nb;
}
