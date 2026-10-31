import type { Metadata } from 'next';

import { AdminOpsPanel } from '../_components/AdminOpsPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operacion en vivo',
};

export default async function AdminOpsPage() {
  const admin = await requireAdminPermission('analytics.read');
  return <AdminOpsPanel admin={admin} />;
}
