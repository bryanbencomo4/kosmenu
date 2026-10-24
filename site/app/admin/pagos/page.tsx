import type { Metadata } from 'next';

import { AdminPaymentsPanel } from '../_components/AdminPaymentsPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pagos',
};

export default async function AdminPaymentsPage() {
  const admin = await requireAdminPermission('subscriptions.read');
  return <AdminPaymentsPanel admin={admin} />;
}
