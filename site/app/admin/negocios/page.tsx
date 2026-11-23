import type { Metadata } from 'next';

import { AdminBusinessesPanel } from '../_components/AdminBusinessesPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Negocios',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function resolveFilter(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'promoted' || raw === 'directory' || raw === 'offline') return raw;
  return 'all' as const;
}

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const admin = await requireAdminPermission('businesses.read');
  const params = searchParams ? await searchParams : {};
  const initialFilter = resolveFilter(params.filter ?? params.promo);

  return (
    <AdminBusinessesPanel
      admin={admin}
      initialFilter={params.promo === '1' || params.promo === 'true' ? 'promoted' : initialFilter}
    />
  );
}
