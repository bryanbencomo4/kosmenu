import type { AdminRole } from './admin-permissions';

export function canReviewPayments(role: AdminRole) {
  return role === 'super_admin' || role === 'finance' || role === 'support';
}

export function canManageBillingCatalog(role: AdminRole) {
  return role === 'super_admin' || role === 'finance';
}

export function canManageAdvisors(role: AdminRole) {
  return role === 'super_admin' || role === 'sales';
}

export type PaymentAccountField = {
  label: string;
  value: string;
  copyable: boolean;
};

export const PAGO_MOVIL_ACCOUNT_SLOTS = [
  { label: 'Banco', aliases: ['banco', 'bank'] },
  { label: 'Teléfono', aliases: ['telefono', 'teléfono', 'phone', 'celular'] },
  { label: 'Cédula / RIF', aliases: ['cedula', 'cédula', 'rif', 'ci', 'documento'] },
  { label: 'Titular', aliases: ['titular', 'nombre', 'beneficiario'] },
] as const;

function foldLabel(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseAccountFields(value: unknown): PaymentAccountField[] {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return parseAccountFields(JSON.parse(trimmed));
      } catch {
        return textToAccountFields(trimmed);
      }
    }
    return textToAccountFields(trimmed);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      label: String(item.label ?? item.name ?? '').trim(),
      value: String(item.value ?? '').trim(),
      copyable: item.copyable !== false,
    }))
    .filter((item) => item.label.length > 0 || item.value.length > 0);
}

export function accountFieldsToText(fields: PaymentAccountField[]) {
  return fields.map((field) => `${field.label}: ${field.value}`).join('\n');
}

export function textToAccountFields(value: string): PaymentAccountField[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:=]+)\s*[:\-–=]\s*(.+)$/);
      if (!match) return null;
      return {
        label: match[1].trim(),
        value: match[2].trim(),
        copyable: true,
      };
    })
    .filter((field): field is PaymentAccountField => Boolean(field?.label && field.value));
}

export function accountFieldValue(fields: PaymentAccountField[], aliases: readonly string[]) {
  const wanted = new Set(aliases.map(foldLabel));
  return fields.find((field) => wanted.has(foldLabel(field.label)))?.value ?? '';
}

export function buildPagoMovilAccountFields(input: {
  banco: string;
  telefono: string;
  cedula: string;
  titular: string;
}) {
  return normalizeAccountFields([
    { label: 'Banco', value: input.banco.trim(), copyable: true },
    { label: 'Teléfono', value: input.telefono.trim(), copyable: true },
    { label: 'Cédula / RIF', value: input.cedula.trim(), copyable: true },
    { label: 'Titular', value: input.titular.trim(), copyable: true },
  ]);
}

export function normalizeAccountFields(value: unknown): PaymentAccountField[] {
  return parseAccountFields(value).filter((item) => item.label.length > 0 && item.value.length > 0);
}

export function isManualMethodReady(input: {
  verification: string;
  requiresAdvisorCode: boolean;
  accountFields: PaymentAccountField[];
}) {
  if (input.verification !== 'manual') {
    return true;
  }
  if (input.requiresAdvisorCode) {
    return true;
  }
  return input.accountFields.some((field) => field.value.length > 0);
}
