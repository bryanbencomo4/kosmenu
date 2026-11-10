export type PaymentMethodDisplayInput = {
  banco?: string | null;
  titular?: string | null;
  cedula?: string | null;
  telefono?: string | null;
  numero?: string | null;
  alias?: string | null;
  descripcion?: string | null;
  detalles?: string | null;
  nota?: string | null;
};

export type PaymentFieldKind = 'phone' | 'document' | 'text';

export type PaymentDisplayField = {
  label: string;
  value: string;
  /** Optional hint from Flutter transfer JSON (`telefono`, `cedula`, …). */
  type?: string;
  kind?: PaymentFieldKind;
};

function foldPaymentText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, '');
}

/**
 * Infer whether a payment field should be sanitized for bank paste.
 * Prefer explicit `type` from transfer JSON; fall back to label keywords.
 */
export function inferPaymentFieldKind(
  label: string,
  typeHint = '',
): PaymentFieldKind {
  const hay = foldPaymentText(`${label} ${typeHint}`);
  if (
    /\b(telf|tel\.?|telef|telefono|celular|whatsapp|phone|movil|mobile)\b/.test(hay) ||
    hay === 'tel'
  ) {
    return 'phone';
  }
  if (
    /\b(documento|cedula|rif|dni|nit|ci|identificacion|identification|doc)\b/.test(hay)
  ) {
    return 'document';
  }
  return 'text';
}

/**
 * Clipboard value for bank apps: display stays human-readable, copy is paste-safe.
 * - phone: digits only, strip common LatAm country codes (58, 57, …)
 * - document: digits only (drop V-/J-/E- prefixes)
 * - text: unchanged trim
 */
export function paymentClipboardValue(field: Pick<PaymentDisplayField, 'label' | 'value' | 'type' | 'kind'>): string {
  const raw = (field.value ?? '').trim();
  if (!raw) return '';

  const kind = field.kind ?? inferPaymentFieldKind(field.label, field.type ?? '');
  if (kind === 'text') return raw;

  const digits = digitsOnly(raw);
  if (!digits) return raw;

  if (kind === 'document') {
    return digits;
  }

  // phone
  return normalizePhoneForBankPaste(digits);
}

/**
 * Bank paste format for phones:
 * - strip 00 / country code when present
 * - Venezuela (58): national mobile becomes 04XXXXXXXXX (leading 0 required by banks)
 */
function normalizePhoneForBankPaste(digits: string) {
  let value = digits;

  // 00CC… international prefix
  if (value.startsWith('00') && value.length > 4) {
    value = value.slice(2);
  }

  if (value.startsWith('58') && value.length >= 12) {
    const national = value.slice(2);
    // 412… (10) or 0412… (11) after stripping +58
    if (/^0?4\d{9}$/.test(national)) {
      return national.startsWith('0') ? national : `0${national}`;
    }
    if (national.length >= 9 && national.length <= 11) {
      return national.startsWith('0') ? national : national;
    }
  }

  // Already local VE mobile without country code: 412… → 0412…
  if (/^4\d{9}$/.test(value)) {
    return `0${value}`;
  }
  if (/^04\d{9}$/.test(value)) {
    return value;
  }

  // Other LatAm country codes: digits only, no extra leading 0.
  const countryCodes = ['57', '56', '54', '51', '52', '55', '1'] as const;
  for (const code of countryCodes) {
    if (!value.startsWith(code)) continue;
    const national = value.slice(code.length);
    if (national.length >= 9 && national.length <= 11) {
      return national;
    }
  }

  return value;
}

const GENERIC_PAYMENT_DESCRIPTIONS = new Set([
  'cuenta de pago digital',
  'metodo de pago digital',
]);

function parseTransferAccountDetalles(raw: string): PaymentDisplayField[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const fieldsRaw = parsed.fields;
    if (!Array.isArray(fieldsRaw)) {
      return null;
    }

    const fields: PaymentDisplayField[] = [];
    for (const entry of fieldsRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const map = entry as Record<string, unknown>;
      const label = (map.label ?? map.name ?? '').toString().trim();
      const value = (map.value ?? '').toString().trim();
      if (!value) continue;
      const type = (map.type ?? '').toString().trim();
      const kind = inferPaymentFieldKind(label || 'Dato', type);
      fields.push({
        label: label || 'Dato',
        value,
        ...(type ? { type } : {}),
        kind,
      });
    }

    return fields.length > 0 ? fields : null;
  } catch {
    return null;
  }
}

/**
 * Structured payment destination fields (ID, teléfono, banco…) for checkout UI.
 * Notes / tips are returned separately so they are not treated as copy targets.
 */
export function parsePaymentMethodFields(method: PaymentMethodDisplayInput): {
  fields: PaymentDisplayField[];
  note: string | null;
} {
  const fields: PaymentDisplayField[] = [];

  if (method.banco?.trim()) {
    fields.push({ label: 'Banco', value: method.banco.trim(), kind: 'text' });
  }
  if (method.titular?.trim()) {
    fields.push({ label: 'Titular', value: method.titular.trim(), kind: 'text' });
  }
  if (method.cedula?.trim()) {
    fields.push({
      label: 'Cédula',
      value: method.cedula.trim(),
      type: 'cedula',
      kind: 'document',
    });
  }
  if (method.telefono?.trim()) {
    fields.push({
      label: 'Teléfono',
      value: method.telefono.trim(),
      type: 'telefono',
      kind: 'phone',
    });
  }
  if (method.numero?.trim()) {
    fields.push({ label: 'Número', value: method.numero.trim(), kind: 'text' });
  }
  if (method.alias?.trim()) {
    fields.push({ label: 'Alias', value: method.alias.trim(), kind: 'text' });
  }

  const detallesRaw = (method.detalles ?? '').trim();
  const parsedFields = detallesRaw ? parseTransferAccountDetalles(detallesRaw) : null;

  if (parsedFields) {
    fields.push(...parsedFields);
  } else if (detallesRaw && !detallesRaw.startsWith('{')) {
    fields.push({ label: 'Detalle', value: detallesRaw });
  }

  const descripcion = (method.descripcion ?? '').trim();
  const nota = (method.nota ?? '').trim();
  const genericDescription = GENERIC_PAYMENT_DESCRIPTIONS.has(descripcion.toLowerCase());

  let note: string | null = null;
  if (nota) {
    note = nota;
  } else if (descripcion && !genericDescription && fields.length === 0) {
    note = descripcion;
  }

  return { fields, note };
}

/** Human-readable payment destination lines for checkout and order summaries. */
export function formatPaymentMethodDetails(method: PaymentMethodDisplayInput): string[] {
  const { fields, note } = parsePaymentMethodFields(method);
  const details = fields.map((field) =>
    field.label ? `${field.label}: ${field.value}` : field.value,
  );
  if (note) details.push(note);
  return details;
}

/** Strip redundant "Pago digital:" prefix so UI shows just the method name. */
export function cleanPaymentMethodLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/^pago\s*digital\s*:\s*/i, '').trim() || trimmed;
}

export function paymentMethodLabelFromRow(input: {
  nombre?: string | null;
  tipo?: string | null;
  banco?: string | null;
}): string {
  const raw = input.nombre?.trim() || input.tipo?.trim() || input.banco?.trim() || 'Metodo de pago';
  return cleanPaymentMethodLabel(raw);
}

export function isCashPaymentMethodLabel(label: string) {
  return label.toLowerCase().includes('efectivo') || label.toLowerCase().includes('cash');
}

export type PaymentMethodIconKind =
  | 'cash'
  | 'pago_movil'
  | 'binance'
  | 'transfer'
  | 'wallet'
  | 'card';

export function paymentMethodIconKindFromText(
  ...parts: Array<string | null | undefined>
): PaymentMethodIconKind {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  if (hay.includes('efectivo') || hay.includes('cash')) return 'cash';
  if (hay.includes('binance')) return 'binance';
  if (hay.includes('móvil') || hay.includes('movil')) return 'pago_movil';
  if (
    hay.includes('transfer') ||
    hay.includes('cuenta') ||
    hay.includes('banco') ||
    hay.includes('bancolombia') ||
    hay.includes('bnc')
  ) {
    return 'transfer';
  }
  if (hay.includes('tarjeta') || hay.includes('card') || hay.includes('visa') || hay.includes('mastercard')) {
    return 'card';
  }
  if (hay.includes('digital') || hay.includes('wallet')) return 'wallet';
  return 'wallet';
}
