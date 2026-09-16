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

export function parseAccountFields(value: unknown): PaymentAccountField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      label: String(item.label ?? '').trim(),
      value: String(item.value ?? '').trim(),
      copyable: item.copyable !== false,
    }))
    .filter((item) => item.label.length > 0 || item.value.length > 0);
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
