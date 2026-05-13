import 'server-only';

import { headers } from 'next/headers';

import { getAdminSupabaseClient } from './admin-supabase';

type HeaderBag = {
  get(name: string): string | null;
};

export type LogAdminActionParams = {
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
  metadata?: Record<string, unknown> | null;
  requestHeaders?: HeaderBag | null;
};

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toJsonValue(value: unknown) {
  if (value == null) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { value: String(value) };
  }
}

function getIpAddress(requestHeaders: HeaderBag) {
  const forwardedFor = requestHeaders.get('x-forwarded-for');

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  return normalizeText(requestHeaders.get('x-real-ip'));
}

export async function logAdminAction(params: LogAdminActionParams) {
  try {
    const requestHeaders = params.requestHeaders ?? (await headers());
    const supabase = getAdminSupabaseClient();
    const payload = {
      actor_user_id: normalizeText(params.actorUserId) || null,
      actor_email: normalizeText(params.actorEmail)?.toLowerCase() || null,
      action: params.action.trim(),
      entity_type: normalizeText(params.entityType),
      entity_id: normalizeText(params.entityId),
      old_data: toJsonValue(params.oldData),
      new_data: toJsonValue(params.newData),
      ip_address: getIpAddress(requestHeaders),
      user_agent: normalizeText(requestHeaders.get('user-agent')),
      metadata: toJsonValue(params.metadata ?? {}) ?? {},
    };

    const { error } = await supabase.from('admin_audit_logs').insert(payload);

    if (error) {
      console.error('admin audit log insert error', error);
    }
  } catch (error) {
    console.error('admin audit log failure', error);
  }
}