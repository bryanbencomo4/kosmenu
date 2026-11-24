'use client';

import Link from 'next/link';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { logoutAdminAction } from '../_lib/admin-logout-action';
import { hasAdminPermission } from '../_lib/admin-permissions';

export function AdminTopbar({
  admin,
  onOpenMenu,
  onToggleSidebar,
  sidebarCollapsed,
  compact = false,
}: {
  admin: CurrentAdmin;
  onOpenMenu?: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  compact?: boolean;
}) {
  const canCreateBusiness = hasAdminPermission(admin.role, 'businesses.write');
  const [inboxDark, setInboxDark] = useState(true);

  useEffect(() => {
    if (!compact) return;
    const read = () => {
      try {
        const v = window.localStorage.getItem('elmenuxfa:wa-inbox-theme-v1');
        setInboxDark(v !== 'light');
      } catch {
        setInboxDark(true);
      }
    };
    read();
    window.addEventListener('storage', read);
    const id = window.setInterval(read, 800);
    return () => {
      window.removeEventListener('storage', read);
      window.clearInterval(id);
    };
  }, [compact]);

  if (compact) {
    const bg = inboxDark ? '#202c33' : '#f0f2f5';
    const border = inboxDark ? '#222d34' : 'rgba(0,0,0,0.08)';
    const fg = inboxDark ? '#e9edef' : '#111b21';
    const muted = inboxDark ? '#8696a0' : '#667781';
    const hover = inboxDark ? '#2a3942' : '#e9edef';
    return (
      <header
        className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5 sm:px-3"
        style={{ backgroundColor: bg, borderColor: border }}
      >
        {onOpenMenu ? (
          <button
            type="button"
            onClick={onOpenMenu}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full lg:hidden"
            style={{ color: fg }}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        {onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full lg:inline-flex"
            style={{ color: muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Plegar menu lateral'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" style={{ color: fg }}>
            Admin · WhatsApp
          </p>
        </div>
        <form action={logoutAdminAction}>
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full"
            style={{ color: muted }}
            aria-label="Cerrar sesion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
        {onOpenMenu ? (
          <button
            type="button"
            onClick={onOpenMenu}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}

        {onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:inline-flex"
            aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Plegar menu lateral'}
            title={sidebarCollapsed ? 'Expandir menu' : 'Plegar menu'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        ) : null}

        <div className="min-w-0 flex-1 lg:hidden">
          <p className="truncate text-sm font-black tracking-[-0.02em] text-slate-950">
            Admin ElMenuxFA
          </p>
          <p className="truncate text-[11px] text-slate-500">{admin.displayName}</p>
        </div>

        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="text-sm font-semibold text-slate-950">Panel admin</p>
          <p className="truncate text-xs text-slate-500">{admin.email}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canCreateBusiness ? (
            <Link
              href="/admin/negocios"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-black text-white sm:px-4 sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Negocios</span>
            </Link>
          ) : null}

          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0 max-w-[140px]">
              <p className="truncate text-xs font-semibold text-slate-950">
                {admin.displayName}
              </p>
              <p className="truncate text-[10px] text-slate-500">{admin.email}</p>
            </div>
          </div>

          <form action={logoutAdminAction}>
            <button
              type="submit"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
              aria-label="Cerrar sesion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
