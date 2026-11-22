import {
  parsePaymentMethodFields,
  paymentMethodIconKindFromText,
  paymentMethodLabelFromRow,
  type PaymentMethodIconKind,
} from '../../../../_lib/payment-method-display';

export type ChatPaymentMethod = {
  id: string;
  label: string;
  kind: PaymentMethodIconKind;
  /** Explicit currency only — never a menu-wide fallback (avoids labeling everything USD). */
  currency: string | null;
  /** Short line under the label (banco · teléfono…), already clamped. */
  summary: string | null;
};

type PaymentRowLike = {
  id: string;
  nombre?: string | null;
  tipo?: string | null;
  banco?: string | null;
  titular?: string | null;
  cedula?: string | null;
  telefono?: string | null;
  numero?: string | null;
  alias?: string | null;
  descripcion?: string | null;
  detalles?: string | null;
  nota?: string | null;
  moneda?: string | null;
  currency?: string | null;
  moneda_codigo?: string | null;
};

/** "cómo pago", "métodos de pago", "formas de pago", "pago móvil"… */
export const PAYMENT_INTENT_RE =
  /como (pago|pagar)|metodos?( de pago)?|formas?( de pago)?|medios?( de pago)?|pago movil|transferencia|con que pago|aceptan (pago|transfer|efectivo|tarjeta)/i;

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPaymentIntent(text: string | null | undefined): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return false;
  const norm = fold(raw)
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return false;
  if (norm.split(' ').length > 10) return false;
  return PAYMENT_INTENT_RE.test(norm);
}

/** Only return a currency when the method itself declares one (no USD fallback). */
export function currencyOfPaymentRow(row: PaymentRowLike): string | null {
  const explicit = (row.moneda_codigo || row.currency || row.moneda || '')
    .toString()
    .trim();
  if (explicit) return explicit.toUpperCase();

  const tipo = (row.tipo ?? '').toString().trim().toLowerCase();
  // tipo sometimes encodes currency (e.g. "transfer_ves", "usd_cash").
  const tipoMatch = tipo.match(/\b(usd|ves|cop|eur|pen|mxn|ars|brl|clp)\b/i);
  if (tipoMatch?.[1]) return tipoMatch[1].toUpperCase();

  const detalles = (row.detalles ?? '').toString().trim();
  if (detalles.startsWith('{')) {
    try {
      const parsed = JSON.parse(detalles) as Record<string, unknown>;
      const detailCurrency = (
        parsed.currency ??
        parsed.moneda ??
        parsed.currency_code ??
        parsed.moneda_codigo ??
        ''
      )
        .toString()
        .trim();
      if (detailCurrency) return detailCurrency.toUpperCase();
    } catch {
      /* ignore */
    }
  }
  return null;
}

function summaryOf(row: PaymentRowLike): string | null {
  const { fields, note } = parsePaymentMethodFields(row);
  if (fields.length > 0) {
    return fields
      .slice(0, 2)
      .map((f) => f.value)
      .join(' · ');
  }
  // Cash tips live in `nota` / `descripcion` — keep them so duplicates still match.
  if (note) return note;
  const bits = [row.banco, row.telefono || row.numero, row.titular]
    .map((v) => (v ?? '').toString().trim())
    .filter(Boolean);
  return bits.length ? bits.slice(0, 2).join(' · ') : null;
}

/**
 * Collapse identical payment rows (e.g. 3× "Efectivo" with the same tip).
 * Fingerprint: kind + label + summary + currency (when known).
 */
export function dedupeChatPaymentMethods(
  methods: ChatPaymentMethod[],
): ChatPaymentMethod[] {
  const seen = new Set<string>();
  const out: ChatPaymentMethod[] = [];
  for (const m of methods) {
    const key = [
      m.kind,
      fold(m.label),
      fold(m.summary || ''),
      (m.currency || '').toUpperCase(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Slim payment methods for chat UI.
 * Currency badges only appear when the method declares a currency — never
 * inherit the menu base currency (that made everything look like USD).
 */
export function toChatPaymentMethods(
  rows: PaymentRowLike[] | null | undefined,
  _fallbackCurrency = 'USD',
): ChatPaymentMethod[] {
  if (!rows?.length) return [];
  const mapped = rows.map((row) => {
    const label = paymentMethodLabelFromRow(row);
    return {
      id: row.id,
      label,
      kind: paymentMethodIconKindFromText(row.nombre, row.tipo, row.banco, label),
      currency: currencyOfPaymentRow(row),
      summary: summaryOf(row),
    };
  });
  return dedupeChatPaymentMethods(mapped);
}
