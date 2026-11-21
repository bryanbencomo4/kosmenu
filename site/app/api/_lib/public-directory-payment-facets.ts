/**
 * Public discovery facets: currencies, payment channels, VES@BCV.
 * Pure helpers — safe for unit tests (no server-only imports).
 */

import { extractPublicCheckoutExchange } from './checkout-exchange-config';

const KNOWN_CURRENCIES = new Set(['USD', 'VES', 'COP']);

function normalizeCurrencyCode(value: unknown) {
  const code = (value ?? '').toString().trim().toUpperCase();
  if (!code || code === 'SIN MONEDA') return '';
  return code;
}

export function isBcvExchangeSource(source: unknown) {
  const normalized = (source ?? '').toString().trim().toLowerCase();
  return normalized === 'bcv' || normalized === 'bcv_usd' || normalized === 'bcv_eur';
}

function foldLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Map merchant payment labels to stable public channel chips. */
export function normalizePaymentChannelLabel(raw: string): string | null {
  const text = (raw ?? '').toString().trim();
  if (!text) return null;
  const folded = foldLabel(text);
  const withoutDigital = folded.replace(/^pago digital:\s*/, '');

  if (withoutDigital.includes('pago movil') || withoutDigital === 'pago móvil') {
    return 'Pago Móvil';
  }
  if (withoutDigital === 'efectivo' || folded === 'efectivo') {
    return 'Efectivo';
  }
  if (
    withoutDigital === 'transferencia' ||
    withoutDigital.startsWith('transferencia bancaria')
  ) {
    return 'Transferencia';
  }
  if (withoutDigital.includes('zelle')) return 'Zelle';
  if (withoutDigital.includes('binance')) return 'Binance';
  if (withoutDigital.includes('nequi')) return 'Nequi';
  if (withoutDigital.includes('bancolombia')) return 'Bancolombia';
  if (withoutDigital.includes('paypal')) return 'PayPal';
  if (withoutDigital.includes('bnc')) return 'BNC';

  // "Pago digital: Foo" → Foo
  const digitalMatch = text.match(/^pago digital:\s*(.+)$/i);
  if (digitalMatch?.[1]) {
    const name = digitalMatch[1].trim();
    return name || null;
  }

  // Generic transferencia / efectivo already handled; skip noise
  if (withoutDigital.length < 2) return null;
  // Title-case unknown digital names carefully
  if (folded.startsWith('pago digital:')) return null;
  return text;
}

export function channelsFromMetodosPagoColumn(metodosPago: unknown): string[] {
  const out = new Set<string>();
  if (!Array.isArray(metodosPago)) return [];
  for (const item of metodosPago) {
    const label = normalizePaymentChannelLabel((item ?? '').toString());
    if (label) out.add(label);
  }
  return [...out];
}

export function channelsFromMetodosPagoRows(
  rows: Array<{ nombre?: string | null; tipo?: string | null }>,
): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const fromName = normalizePaymentChannelLabel((row.nombre ?? '').toString());
    if (fromName) out.add(fromName);
    const tipo = (row.tipo ?? '').toString().toLowerCase();
    if (tipo.startsWith('efectivo')) out.add('Efectivo');
    if (tipo.startsWith('transferencia')) {
      // Umbrella channel + specific digital label (Zelle, Nequi, …).
      out.add('Transferencia');
      if (fromName && fromName !== 'Transferencia' && fromName !== 'Efectivo') {
        out.add(fromName);
      }
    }
  }
  return [...out];
}

export type DirectoryPaymentFacets = {
  currencies: string[];
  paymentChannels: string[];
  acceptsVesBcv: boolean;
};

export function deriveDirectoryPaymentFacets(input: {
  brandingIa: unknown;
  moneda?: string | null;
  metodosPagoColumn?: unknown;
  metodosPagoRows?: Array<{ nombre?: string | null; tipo?: string | null }>;
  exchangeRateSource?: string | null;
}): DirectoryPaymentFacets {
  const checkout = extractPublicCheckoutExchange(input.brandingIa);
  const currencies = new Set<string>();
  for (const code of checkout.currencies) {
    const normalized = normalizeCurrencyCode(code);
    if (normalized && KNOWN_CURRENCIES.has(normalized)) currencies.add(normalized);
  }
  const fallbackMoneda = normalizeCurrencyCode(input.moneda);
  if (fallbackMoneda && KNOWN_CURRENCIES.has(fallbackMoneda)) {
    currencies.add(fallbackMoneda);
  }
  if (currencies.size === 0 && fallbackMoneda) {
    currencies.add(fallbackMoneda === 'PCO' ? 'COP' : fallbackMoneda);
  }

  const channels = new Set<string>();
  for (const label of channelsFromMetodosPagoColumn(input.metodosPagoColumn)) {
    channels.add(label);
  }
  for (const label of channelsFromMetodosPagoRows(input.metodosPagoRows ?? [])) {
    channels.add(label);
  }

  const vesSource =
    (checkout.exchangeRateSources.VES ?? '').toString().trim().toLowerCase() ||
    (input.exchangeRateSource ?? '').toString().trim().toLowerCase();
  const acceptsVes = currencies.has('VES');
  const acceptsVesBcv = acceptsVes && isBcvExchangeSource(vesSource);

  return {
    currencies: [...currencies].sort(),
    paymentChannels: [...channels].sort((a, b) => a.localeCompare(b, 'es')),
    acceptsVesBcv,
  };
}
