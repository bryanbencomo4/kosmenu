import type { Metadata } from 'next';

import { AdminBusinessSectorsPanel } from '../_components/AdminBusinessSectorsPanel';
import { requireAdminPermission } from '../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sectores de negocio',
};

export default async function AdminBusinessSectorsPage() {
  const admin = await requireAdminPermission('settings.read');

  return <AdminBusinessSectorsPanel admin={admin} />;
}
