'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  FileText,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Users2,
  WalletCards,
} from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { adminNavigation, type AdminNavIcon } from '../_lib/admin-routes';

const iconMap: Record<AdminNavIcon, typeof LayoutDashboard> = {
  home: LayoutDashboard,
  businesses: Building2,
  menus: FileText,
  orders: ShoppingCart,
  promoted: Megaphone,
  subscriptions: WalletCards,
  credits: Sparkles,
  delivery: Truck,
  customers: Users2,
  analytics: LineChart,
  settings: Settings2,
  security: ShieldCheck,
};

function isActiveItem(currentPathname: string, href: string) {
  const [basePath] = href.split('#');

  if (basePath === '/admin') {
    return currentPathname === '/' || currentPathname === '/admin';
  }

  return currentPathname === basePath;
}

export function AdminSidebar({ admin }: { admin: CurrentAdmin }) {
  const pathname = usePathname();
  const navigation = adminNavigation.filter(
    (item) => !item.permission || admin.permissions.includes(item.permission),
  );

  return (
    <aside className="border-r border-white/8 bg-[linear-gradient(180deg,#0f1024_0%,#141636_42%,#181b42_100%)] px-4 py-6 text-white lg:sticky lg:top-0 lg:h-screen lg:px-5 lg:py-7">
      <div className="flex h-full flex-col">
        <div className="space-y-5">
          <Link href="/admin" className="flex items-center gap-3 rounded-[1.35rem] px-2 py-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-violet-500/20 text-violet-100 shadow-[0_12px_30px_-18px_rgba(139,92,246,0.65)]">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-200/70">Admin</p>
              <p className="font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-white">
                ElMenuxFA
              </p>
            </div>
          </Link>

          <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.06] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/65">Rol activo</p>
            <p className="mt-2 text-sm font-semibold text-white">{admin.role.replace(/_/g, ' ')}</p>
            <p className="mt-1 text-xs text-violet-100/68">{admin.permissions.length} permisos visibles en esta fase.</p>
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {navigation.map((item) => {
            const Icon = iconMap[item.icon];
            const active = isActiveItem(pathname, item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={[
                  'group flex items-center gap-3 rounded-[1rem] px-3 py-3 text-sm font-semibold transition',
                  active
                    ? 'bg-violet-500/18 text-white shadow-[0_20px_40px_-28px_rgba(139,92,246,0.85)]'
                    : 'text-violet-100/72 hover:bg-white/[0.06] hover:text-white',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-[0.95rem] transition',
                    active ? 'bg-white/12 text-violet-100' : 'bg-white/[0.05] text-violet-200/80 group-hover:bg-white/[0.09]',
                  ].join(' ')}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-[1.35rem] border border-violet-400/12 bg-violet-500/10 p-4 text-sm">
          <p className="font-semibold text-white">Fase 1 lista para crecer</p>
          <p className="mt-2 leading-6 text-violet-100/72">
            Host dedicado, cookie httpOnly, RBAC minimo y auditoria inicial antes de abrir modulos operativos.
          </p>
        </div>
      </div>
    </aside>
  );
}