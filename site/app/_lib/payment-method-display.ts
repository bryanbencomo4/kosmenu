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

export type PaymentDisplayField = {
  label: string;
  value: string;
};

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
      fields.push({ label: label || 'Dato', value });
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

  if (method.banco?.trim()) fields.push({ label: 'Banco', value: method.banco.trim() });
  if (method.titular?.trim()) fields.push({ label: 'Titular', value: method.titular.trim() });
  if (method.cedula?.trim()) fields.push({ label: 'Cédula', value: method.cedula.trim() });
  if (method.telefono?.trim()) fields.push({ label: 'Teléfono', value: method.telefono.trim() });
  if (method.numero?.trim()) fields.push({ label: 'Número', value: method.numero.trim() });
  if (method.alias?.trim()) fields.push({ label: 'Alias', value: method.alias.trim() });

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

export function paymentMethodLabelFromRow(input: {
  nombre?: string | null;
  tipo?: string | null;
  banco?: string | null;
}): string {
  return input.nombre?.trim() || input.tipo?.trim() || input.banco?.trim() || 'Metodo de pago';
}
