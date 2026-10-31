'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Building2,
  FileText,
  LayoutDashboard,
  Layers3,
  Landmark,
  LineChart,
  Megaphone,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  Users2,
  WalletCards,
  X,
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
  bank: Landmark,
  credits: Sparkles,
  delivery: Truck,
  customers: Users2,
  analytics: LineChart,
  sectors: Layers3,
  android: Smartphone,
  settings: Settings2,
  security: ShieldCheck,
};

function isActiveItem(
  currentPathname: string,
  href: string,
  searchParams: URLSearchParams,
) {
  const [withoutHash] = href.split('#');
  const [basePath, query = ''] = withoutHash.split('?');
  const hrefParams = new URLSearchParams(query);

  if (basePath === '/admin') {
    return currentPathname === '/' || currentPathname === '/admin';
  }

  const onNestedPath =
    currentPathname === basePath || currentPathname.startsWith(`${basePath}/`);

  if (!onNestedPath) {
    return false;
  }

  if (hrefParams.has('promo')) {
    return (
      currentPathname === basePath &&
      searchParams.get('promo') === hrefParams.get('promo')
    );
  }
  if (basePath === '/admin/negocios') {
    return !searchParams.get('promo') || currentPathname !== basePath;
  }

  return true;
}

export function AdminSidebar({
  admin,
  onNavigate,
  className,
}: {
  admin: CurrentAdmin;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigation = adminNavigation.filter(
    (item) => !item.permission || admin.permissions.includes(item.permission),
  );

  return (
    <aside
      className={[
        'flex h-full flex-col border-r border-white/8 bg-[linear-gradient(180deg,#0f1024_0%,#141636_42%,#181b42_100%)] px-4 py-5 text-white lg:sticky lg:top-0 lg:h-screen lg:px-5 lg:py-7',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 rounded-[1.35rem] px-2 py-1"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-violet-500/20 text-violet-100 shadow-[0_12px_30px_-18px_rgba(139,92,246,0.65)]">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-200/70">
              Admin
            </p>
            <p className="truncate font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-white">
              ElMenuxFA
            </p>
          </div>
        </Link>
        {onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-violet-100 lg:hidden"
            aria-label="Cerrar menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-white/[0.06] p-3 lg:mt-5 lg:rounded-[1.35rem] lg:p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/65">
          Rol activo
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-white">
          {admin.role.replace(/_/g, ' ')}
        </p>
        <p className="mt-0.5 text-xs text-violet-100/68">
          {admin.permissions.length} permisos
        </p>
      </div>

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 lg:mt-6 lg:space-y-1.5">
        {navigation.map((item) => {
          const Icon = iconMap[item.icon];
          const active = isActiveItem(pathname, item.href, searchParams);

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={[
                'group flex items-center gap-3 rounded-[1rem] px-3 py-2.5 text-sm font-semibold transition lg:py-3',
                active
                  ? 'bg-violet-500/18 text-white shadow-[0_20px_40px_-28px_rgba(139,92,246,0.85)]'
                  : 'text-violet-100/72 hover:bg-white/[0.06] hover:text-white',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] transition',
                  active
                    ? 'bg-white/12 text-violet-100'
                    : 'bg-white/[0.05] text-violet-200/80 group-hover:bg-white/[0.09]',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 hidden rounded-[1.35rem] border border-violet-400/12 bg-violet-500/10 p-4 text-sm lg:mt-6 lg:block">
        <p className="font-semibold text-white">Panel operativo</p>
        <p className="mt-2 leading-6 text-violet-100/72">
          Pedidos, negocios y ranking en vivo con exclusiones de Ops.
        </p>
      </div>
    </aside>
  );
}
