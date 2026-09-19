import type { Metadata } from 'next';

import { AdminBdvPaymentsPanel } from '../_components/AdminBdvPaymentsPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pagos BDV',
};

export default async function AdminBdvPaymentsPage() {
  const admin = await requireAdminPermission('subscriptions.read');
  return <AdminBdvPaymentsPanel admin={admin} />;
}
