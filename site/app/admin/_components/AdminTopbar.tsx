'use client';

import Link from 'next/link';
import { LogOut, Menu, Plus, ShieldCheck } from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { logoutAdminAction } from '../_lib/admin-logout-action';
import { hasAdminPermission } from '../_lib/admin-permissions';

export function AdminTopbar({
  admin,
  onOpenMenu,
}: {
  admin: CurrentAdmin;
  onOpenMenu?: () => void;
}) {
  const canCreateBusiness = hasAdminPermission(admin.role, 'businesses.write');

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
