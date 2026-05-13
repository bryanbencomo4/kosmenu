import Link from 'next/link';
import { Bell, LogOut, Plus, Search, ShieldCheck } from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { logoutAdminAction } from '../_lib/admin-auth';
import { hasAdminPermission } from '../_lib/admin-permissions';

export function AdminTopbar({ admin }: { admin: CurrentAdmin }) {
  const canCreateBusiness = hasAdminPermission(admin.role, 'businesses.write');

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/82 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3 rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)] lg:max-w-xl lg:flex-1">
          <Search className="h-4.5 w-4.5 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar negocios, pedidos, creditos o configuraciones"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-slate-200 bg-white text-slate-600 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)] transition hover:border-violet-300 hover:text-violet-700"
            aria-label="Notificaciones"
          >
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-violet-500" />
          </button>

          {canCreateBusiness ? (
            <Link
              href="/admin#businesses"
              className="inline-flex h-11 items-center gap-2 rounded-[1rem] bg-violet-600 px-4 text-sm font-black text-white shadow-[0_20px_40px_-28px_rgba(109,40,217,0.8)] transition hover:bg-violet-700"
            >
              <Plus className="h-4.5 w-4.5" />
              Crear negocio
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-11 items-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-100 px-4 text-sm font-bold text-slate-400"
            >
              <Plus className="h-4.5 w-4.5" />
              Crear negocio
            </button>
          )}

          <div className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-white px-4 py-2.5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{admin.displayName}</p>
              <p className="truncate text-xs text-slate-500">{admin.email}</p>
            </div>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Cerrar sesion"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}