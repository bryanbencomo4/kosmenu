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

export function matchPaymentIntent(text: string | null | undefined): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return false;
  const norm = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return false;
  if (norm.split(' ').length > 10) return false;
  return PAYMENT_INTENT_RE.test(norm);
}

function currencyOf(row: PaymentRowLike, fallback: string): string | null {
  const c = (
    row.moneda_codigo ||
    row.currency ||
    row.moneda ||
    fallback ||
    ''
  )
    .toString()
    .trim()
    .toUpperCase();
  return c || null;
}

function summaryOf(row: PaymentRowLike): string | null {
  const { fields } = parsePaymentMethodFields(row);
  if (fields.length === 0) {
    const bits = [row.banco, row.telefono || row.numero, row.titular]
      .map((v) => (v ?? '').toString().trim())
      .filter(Boolean);
    return bits.length ? bits.slice(0, 2).join(' · ') : null;
  }
  return fields
    .slice(0, 2)
    .map((f) => f.value)
    .join(' · ');
}

/** Slim payment methods for chat UI (no secrets beyond what checkout already shows). */
export function toChatPaymentMethods(
  rows: PaymentRowLike[] | null | undefined,
  fallbackCurrency = 'USD',
): ChatPaymentMethod[] {
  if (!rows?.length) return [];
  return rows.map((row) => {
    const label = paymentMethodLabelFromRow(row);
    return {
      id: row.id,
      label,
      kind: paymentMethodIconKindFromText(row.nombre, row.tipo, row.banco, label),
      currency: currencyOf(row, fallbackCurrency),
      summary: summaryOf(row),
    };
  });
}
