'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

const SIDEBAR_COLLAPSED_KEY = 'elmenuxfa:admin-sidebar-collapsed';

export function AdminShell({
  admin,
  children,
}: {
  admin: CurrentAdmin;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isWaInbox =
    pathname === '/admin/wa-control' ||
    pathname === '/wa-control' ||
    pathname.endsWith('/wa-control');

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      // Inbox WhatsApp: start collapsed like WA Web icon rail unless user expanded.
      if (isWaInbox) {
        const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        setSidebarCollapsed(stored !== '0');
        return;
      }
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, [isWaInbox]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div
      className={[
        'min-h-dvh text-slate-900',
        isWaInbox
          ? 'bg-[#111b21]'
          : 'bg-[linear-gradient(180deg,#f7f5ff_0%,#f2f4ff_45%,#eef2ff_100%)]',
      ].join(' ')}
    >
      <div
        className={[
          'lg:grid lg:min-h-dvh',
          sidebarCollapsed
            ? 'lg:grid-cols-[72px_minmax(0,1fr)]'
            : 'lg:grid-cols-[280px_minmax(0,1fr)]',
        ].join(' ')}
      >
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <AdminSidebar
            admin={admin}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
          />
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

        <div
          className={[
            'min-w-0',
            isWaInbox ? 'flex h-dvh flex-col overflow-hidden lg:h-screen' : '',
          ].join(' ')}
        >
          <AdminTopbar
            admin={admin}
            onOpenMenu={() => setMobileNavOpen(true)}
            onToggleSidebar={toggleSidebarCollapsed}
            sidebarCollapsed={sidebarCollapsed}
            compact={isWaInbox}
          />
          <main
            className={
              isWaInbox
                ? 'min-h-0 flex-1 overflow-hidden p-0'
                : 'px-3 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-4 lg:px-8'
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
