import type { ReactNode } from 'react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

export function AdminShell({
  admin,
  children,
}: {
  admin: CurrentAdmin;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f5ff_0%,#f2f4ff_45%,#eef2ff_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <AdminSidebar admin={admin} />

        <div className="min-w-0">
          <AdminTopbar admin={admin} />
          <main className="px-4 pb-8 pt-4 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}