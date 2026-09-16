import type { Metadata } from 'next';

import { AdminSubscriptionsPanel } from '../_components/AdminSubscriptionsPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Suscripciones y pagos',
};

export default async function AdminSubscriptionsPage() {
  const admin = await requireAdminPermission('subscriptions.read');
  return <AdminSubscriptionsPanel admin={admin} />;
}
