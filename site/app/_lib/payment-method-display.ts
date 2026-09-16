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

type ParsedPaymentField = {
  label: string;
  value: string;
};

const GENERIC_PAYMENT_DESCRIPTIONS = new Set([
  'cuenta de pago digital',
  'metodo de pago digital',
]);

function parseTransferAccountDetalles(raw: string): ParsedPaymentField[] | null {
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

    const fields: ParsedPaymentField[] = [];
    for (const entry of fieldsRaw) {
      if (!entry || typeof entry !== 'object') continue;
      const map = entry as Record<string, unknown>;
      const label = (map.label ?? map.name ?? '').toString().trim();
      const value = (map.value ?? '').toString().trim();
      if (!value) continue;
      fields.push({ label, value });
    }

    return fields.length > 0 ? fields : null;
  } catch {
    return null;
  }
}

/** Human-readable payment destination lines for checkout and order summaries. */
export function formatPaymentMethodDetails(method: PaymentMethodDisplayInput): string[] {
  const details: string[] = [];

  if (method.banco?.trim()) details.push(`Banco: ${method.banco.trim()}`);
  if (method.titular?.trim()) details.push(`Titular: ${method.titular.trim()}`);
  if (method.cedula?.trim()) details.push(`Cedula: ${method.cedula.trim()}`);
  if (method.telefono?.trim()) details.push(`Telefono: ${method.telefono.trim()}`);
  if (method.numero?.trim()) details.push(`Numero: ${method.numero.trim()}`);
  if (method.alias?.trim()) details.push(`Alias: ${method.alias.trim()}`);

  const detallesRaw = (method.detalles ?? '').trim();
  const parsedFields = detallesRaw ? parseTransferAccountDetalles(detallesRaw) : null;

  if (parsedFields) {
    for (const field of parsedFields) {
      details.push(field.label ? `${field.label}: ${field.value}` : field.value);
    }
  } else if (detallesRaw && !detallesRaw.startsWith('{')) {
    details.push(detallesRaw);
  }

  const descripcion = (method.descripcion ?? '').trim();
  const nota = (method.nota ?? '').trim();
  const genericDescription = GENERIC_PAYMENT_DESCRIPTIONS.has(descripcion.toLowerCase());

  if (nota) {
    details.push(nota);
  } else if (descripcion && !genericDescription && details.length === 0) {
    details.push(descripcion);
  }

  return details;
}

export function paymentMethodLabelFromRow(input: {
  nombre?: string | null;
  tipo?: string | null;
  banco?: string | null;
}): string {
  return input.nombre?.trim() || input.tipo?.trim() || input.banco?.trim() || 'Metodo de pago';
}
