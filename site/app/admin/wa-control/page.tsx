import { requireAdminAnyPermission } from '../_lib/admin-auth';
import { WaControlClient } from './WaControlClient';

export const dynamic = 'force-dynamic';

export default async function AdminWaControlPage() {
  await requireAdminAnyPermission(['orders.write', 'businesses.write', 'security.write']);
  return <WaControlClient />;
}
