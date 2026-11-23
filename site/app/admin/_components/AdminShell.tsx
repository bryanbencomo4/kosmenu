'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f5ff_0%,#f2f4ff_45%,#eef2ff_100%)] text-slate-900">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <AdminSidebar admin={admin} />
        </div>

        {/* Mobile drawer */}
        <div
          className={`fixed inset-0 z-50 lg:hidden ${mobileNavOpen ? '' : 'pointer-events-none'}`}
          aria-hidden={!mobileNavOpen}
        >
          <button
            type="button"
            aria-label="Cerrar menu"
            className={`absolute inset-0 bg-slate-950/50 transition-opacity ${
              mobileNavOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            className={`absolute inset-y-0 left-0 flex w-[min(86vw,300px)] transform transition-transform duration-200 ${
              mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <AdminSidebar
              admin={admin}
              onNavigate={() => setMobileNavOpen(false)}
              className="h-full w-full shadow-2xl"
            />
          </div>
        </div>

        <div className="min-w-0">
          <AdminTopbar
            admin={admin}
            onOpenMenu={() => setMobileNavOpen(true)}
          />
          <main className="px-3 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-4 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
