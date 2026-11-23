import 'server-only';

import { randomUUID } from 'crypto';

import { selectWithMissingColumnFallback } from './admin-safe-query';
import { getAdminSupabaseClient } from './admin-supabase';

export type AdminPlanOption = {
  code: string;
  name: string;
  priceAmount: number;
  priceCurrency: string;
  billingInterval: string;
};

export type AdminAiCreditsSummary = {
  balance: number;
  used: number;
  updatedAt: string | null;
  recent: Array<{
    id: string;
    type: string;
    amount: number;
    reason: string | null;
    createdAt: string | null;
    metadata: Record<string, unknown>;
  }>;
};

export type AdminMembershipSnapshot = {
  id: string;
  status: string;
  planCode: string | null;
  planName: string | null;
  provider: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  userId: string | null;
};

function asTrimmed(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function listActiveAdminPlans(): Promise<AdminPlanOption[]> {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('plans')
    .select('code,name,price_amount,price_currency,billing_interval,is_active')
    .eq('is_active', true)
    .order('price_amount', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const code = asTrimmed(row.code);
      const name = asTrimmed(row.name);
      if (!code || !name) return null;
      return {
        code,
        name,
        priceAmount: toFiniteNumber(row.price_amount),
        priceCurrency: asTrimmed(row.price_currency) ?? 'USD',
        billingInterval: asTrimmed(row.billing_interval) ?? 'month',
      };
    })
    .filter((row): row is AdminPlanOption => row != null);
}

export async function loadAdminMembership(
  businessId: string,
): Promise<AdminMembershipSnapshot | null> {
  const supabase = getAdminSupabaseClient();
  try {
    const { data } = await selectWithMissingColumnFallback(
      (select) =>
        supabase
          .from('subscriptions')
          .select(select)
          .eq('business_id', businessId)
          .order('current_period_end', { ascending: false })
          .limit(1)
          .maybeSingle(),
      'id,status,provider,current_period_start,current_period_end,grace_period_end,cancel_at_period_end,user_id,plan:plans(code,name)',
    );

    if (!data) return null;

    const row = data as {
      id?: string | null;
      status?: string | null;
      provider?: string | null;
      current_period_start?: string | null;
      current_period_end?: string | null;
      grace_period_end?: string | null;
      cancel_at_period_end?: boolean | null;
      user_id?: string | null;
      plan?: { code?: string | null; name?: string | null } | null;
    };

    const id = asTrimmed(row.id);
    if (!id) return null;

    return {
      id,
      status: asTrimmed(row.status) ?? 'unknown',
      planCode: asTrimmed(row.plan?.code),
      planName: asTrimmed(row.plan?.name),
      provider: asTrimmed(row.provider),
      currentPeriodStart: row.current_period_start ?? null,
      currentPeriodEnd: row.current_period_end ?? null,
      gracePeriodEnd: row.grace_period_end ?? null,
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      userId: asTrimmed(row.user_id),
    };
  } catch (error) {
    console.error(
      'admin membership load',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function loadAdminAiCredits(
  businessId: string,
): Promise<AdminAiCreditsSummary> {
  const supabase = getAdminSupabaseClient();
  await supabase.rpc('ensure_ai_credits_wallet', {
    p_commerce_id: businessId,
    p_initial_credits: 30,
  });

  const [walletResult, txResult] = await Promise.all([
    supabase
      .from('ai_credits_wallet')
      .select('credits_balance,credits_used,updated_at')
      .eq('commerce_id', businessId)
      .maybeSingle(),
    supabase
      .from('ai_credits_transactions')
      .select('id,type,amount,reason,created_at,metadata')
      .eq('commerce_id', businessId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  if (walletResult.error) throw new Error(walletResult.error.message);
  if (txResult.error) throw new Error(txResult.error.message);

  const wallet = walletResult.data as {
    credits_balance?: number | string | null;
    credits_used?: number | string | null;
    updated_at?: string | null;
  } | null;

  return {
    balance: toFiniteNumber(wallet?.credits_balance),
    used: toFiniteNumber(wallet?.credits_used),
    updatedAt: wallet?.updated_at ?? null,
    recent: ((txResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asTrimmed(row.id) ?? randomUUID(),
      type: asTrimmed(row.type) ?? 'credit',
      amount: toFiniteNumber(row.amount),
      reason: asTrimmed(row.reason),
      createdAt: asTrimmed(row.created_at),
      metadata:
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
    })),
  };
}

export async function adminGrantMembershipPeriod(input: {
  businessId: string;
  planCode: string;
  months: number;
  note?: string | null;
}) {
  const months = Math.floor(input.months);
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    throw new Error('Los meses deben estar entre 1 y 24.');
  }

  const planCode = input.planCode.trim();
  if (!planCode) throw new Error('Indica un plan.');

  const supabase = getAdminSupabaseClient();
  const orderId = `admin_manual:${input.businessId.slice(0, 8)}:${Date.now()}:${randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase.rpc('grant_subscription_period', {
    p_business_id: input.businessId,
    p_plan_code: planCode,
    p_months: months,
    p_provider: 'admin_manual',
    p_order_id: orderId,
    p_amount: 0,
    p_currency: 'USD',
  });

  if (error) throw new Error(error.message);

  return {
    orderId,
    note: input.note?.trim() || null,
    grant: data as Record<string, unknown> | null,
  };
}

export async function adminSetMembershipPeriodEnd(input: {
  businessId: string;
  periodEndIso: string;
  reactivate?: boolean;
}) {
  const periodEnd = new Date(input.periodEndIso);
  if (Number.isNaN(periodEnd.getTime())) {
    throw new Error('Fecha de corte invalida.');
  }

  // Guardrails: not more than 3 years out, not before year 2020.
  const min = new Date('2020-01-01T00:00:00.000Z').getTime();
  const max = Date.now() + 3 * 365 * 24 * 60 * 60 * 1000;
  if (periodEnd.getTime() < min || periodEnd.getTime() > max) {
    throw new Error('La fecha de corte esta fuera del rango permitido.');
  }

  const membership = await loadAdminMembership(input.businessId);
  if (!membership) {
    throw new Error('Este negocio no tiene suscripcion. Renueva primero con un plan.');
  }

  const supabase = getAdminSupabaseClient();
  const now = Date.now();
  const shouldActivate =
    input.reactivate !== false && periodEnd.getTime() > now;

  const updates: Record<string, unknown> = {
    current_period_end: periodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (shouldActivate) {
    updates.status = 'active';
    updates.grace_period_end = null;
    updates.cancel_at_period_end = false;
    if (!membership.currentPeriodStart) {
      updates.current_period_start = new Date().toISOString();
    }
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', membership.id);

  if (error) throw new Error(error.message);

  if (shouldActivate) {
    const { error: commerceError } = await supabase
      .from('comercios')
      .update({ en_linea: true, updated_at: new Date().toISOString() })
      .eq('id', input.businessId);
    if (commerceError) throw new Error(commerceError.message);
  }

  return {
    subscriptionId: membership.id,
    periodEnd: periodEnd.toISOString(),
    status: shouldActivate ? 'active' : membership.status,
  };
}

export async function adminSetMembershipStatus(input: {
  businessId: string;
  status: 'active' | 'suspended' | 'cancelled';
  takeOffline?: boolean;
}) {
  const membership = await loadAdminMembership(input.businessId);
  if (!membership) {
    throw new Error('Este negocio no tiene suscripcion.');
  }

  if (
    input.status === 'active' &&
    membership.currentPeriodEnd &&
    new Date(membership.currentPeriodEnd).getTime() <= Date.now()
  ) {
    throw new Error(
      'No se puede activar: la fecha de corte ya paso. Extiende el periodo o renueva meses.',
    );
  }

  const supabase = getAdminSupabaseClient();
  const updates: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };

  if (input.status === 'active') {
    updates.grace_period_end = null;
    updates.cancel_at_period_end = false;
  }
  if (input.status === 'cancelled') {
    updates.cancel_at_period_end = true;
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', membership.id);

  if (error) throw new Error(error.message);

  const takeOffline =
    input.takeOffline ?? (input.status === 'suspended' || input.status === 'cancelled');

  if (takeOffline || input.status === 'active') {
    const { error: commerceError } = await supabase
      .from('comercios')
      .update({
        en_linea: input.status === 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.businessId);
    if (commerceError) throw new Error(commerceError.message);
  }

  return {
    subscriptionId: membership.id,
    status: input.status,
    enLinea: input.status === 'active',
  };
}

export async function adminGrantAiCredits(input: {
  businessId: string;
  amount: number;
  reason?: string | null;
}) {
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 10_000) {
    throw new Error('La recarga debe ser entre 1 y 10000 creditos.');
  }

  const reason = (input.reason ?? 'admin_topup').trim().slice(0, 120) || 'admin_topup';
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.rpc('add_ai_credits', {
    p_commerce_id: input.businessId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: { source: 'admin_panel' },
  });

  if (error) throw new Error(error.message);

  const wallet = data as {
    credits_balance?: number | string | null;
    credits_used?: number | string | null;
  } | null;

  return {
    amount,
    reason,
    balance: toFiniteNumber(wallet?.credits_balance),
    used: toFiniteNumber(wallet?.credits_used),
  };
}
