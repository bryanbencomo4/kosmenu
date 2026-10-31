import type { Metadata } from 'next';

import { AdminOrdersPanel } from '../_components/AdminOrdersPanel';
import { requireAdminPermission } from '../_lib/admin-auth';
import { getAdminSupabaseClient } from '../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pedidos',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asTrimmed(value: string | string[] | undefined) {
  return (first(value) ?? '').trim();
}

function parseIsoOrDate(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function loadBusinessOptions() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('comercios')
      .select('id,nombre')
      .order('nombre', { ascending: true })
      .limit(800);
    if (error) return [];
    return ((data ?? []) as Array<{ id?: string | null; nombre?: string | null }>)
      .map((row) => {
        const id = (row.id ?? '').trim();
        if (!id) return null;
        return {
          id,
          name: (row.nombre ?? '').trim() || 'Comercio',
        };
      })
      .filter((row): row is { id: string; name: string } => row != null);
  } catch {
    return [];
  }
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const admin = await requireAdminPermission('orders.read');
  const params = searchParams ? await searchParams : {};

  const businessIdRaw = asTrimmed(params.businessId);
  const businessId =
    businessIdRaw && /^[0-9a-f-]{36}$/i.test(businessIdRaw) ? businessIdRaw : null;

  const from = parseIsoOrDate(asTrimmed(params.from).slice(0, 40));
  const to = parseIsoOrDate(asTrimmed(params.to).slice(0, 40));
  const query = asTrimmed(params.q).slice(0, 80);
  const statusRaw = asTrimmed(params.status).toLowerCase() || 'all';
  const status = [
    'all',
    'pendiente',
    'confirmado',
    'preparando',
    'en_camino',
    'entregado',
    'cancelado',
  ].includes(statusRaw)
    ? statusRaw
    : 'all';
  const archivedRaw = asTrimmed(params.archived).toLowerCase() || 'active';
  const archived =
    archivedRaw === 'archived' || archivedRaw === 'all' || archivedRaw === 'active'
      ? archivedRaw
      : 'active';

  const businesses = await loadBusinessOptions();
  const businessName =
    businessId != null
      ? (businesses.find((row) => row.id === businessId)?.name ?? null)
      : null;

  return (
    <AdminOrdersPanel
      admin={admin}
      businesses={businesses}
      initialBusinessId={businessId}
      initialBusinessName={businessName}
      initialFrom={from}
      initialTo={to}
      initialQuery={query || null}
      initialStatus={status}
      initialArchived={archived}
    />
  );
}
