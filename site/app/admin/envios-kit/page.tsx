import type { Metadata } from 'next';

import { AdminKitShipmentsPanel } from '../_components/AdminKitShipmentsPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Envíos Kit',
};

export default async function AdminKitShipmentsPage() {
  const admin = await requireAdminPermission('subscriptions.read');
  return <AdminKitShipmentsPanel admin={admin} />;
}
