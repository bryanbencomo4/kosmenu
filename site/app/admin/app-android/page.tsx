import type { Metadata } from 'next';

import { AdminAppAndroidPanel } from '../_components/AdminAppAndroidPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'App Android',
};

export default async function AdminAppAndroidPage() {
  const admin = await requireAdminPermission('settings.read');
  return <AdminAppAndroidPanel admin={admin} />;
}
