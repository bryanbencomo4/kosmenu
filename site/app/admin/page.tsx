import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

import { AdminDashboardChart } from './_components/AdminDashboardChart';
import { AdminDashboardOpsRanking } from './_components/AdminDashboardOpsRanking';
import { AdminKpiCard } from './_components/AdminKpiCard';
import { AdminPageLoadError } from './_components/AdminPageLoadError';
import { AdminRecentActivity } from './_components/AdminRecentActivity';
import { requireAdminPermission } from './_lib/admin-auth';
import { getAdminDashboardData } from './_lib/admin-dashboard';
import {
  ADMIN_EXCLUSIONS_COOKIE,
  parseAdminExclusions,
} from './_lib/admin-exclusions';

export const dynamic = 'force-dynamic';

const segmentToneClasses = {
  violet: 'border-violet-100 bg-violet-50/80 text-violet-500',
  emerald: 'border-emerald-100 bg-emerald-50/80 text-emerald-600',
  amber: 'border-amber-100 bg-amber-50/80 text-amber-600',
} as const;

const orderStatusClasses = {
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
  info: 'bg-violet-100 text-violet-700',
} as const;

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function AdminDashboardPage() {
  const admin = await requireAdminPermission('dashboard.read');
  const cookieStore = await cookies();
  const exclusions = parseAdminExclusions(
    cookieStore.get(ADMIN_EXCLUSIONS_COOKIE)?.value
      ? decodeURIComponent(cookieStore.get(ADMIN_EXCLUSIONS_COOKIE)!.value)
      : null,
  );

  let dashboard: Awaited<ReturnType<typeof getAdminDashboardData>>;
  try {
    dashboard = await getAdminDashboardData(admin, { exclusions });
  } catch (error) {
    console.error('[admin/dashboard] load failed', error);
    return (
      <AdminPageLoadError
        title="No se pudo cargar el dashboard"
        message={
          error instanceof Error
            ? error.message
            : 'Error inesperado al cargar metricas del admin.'
        }
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section
        id="overview"
        className="overflow-hidden rounded-2xl border border-violet-200/80 bg-[linear-gradient(135deg,#1b1140_0%,#31106a_45%,#5b21b6_100%)] p-4 text-white shadow-[0_30px_90px_-48px_rgba(91,33,182,0.7)] sm:rounded-[2rem] sm:p-6 lg:p-8"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
          <div className="max-w-3xl space-y-2 sm:space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
              {dashboard.heroBadge}
            </span>
            <div className="space-y-1.5 sm:space-y-2">
              <h1 className="font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] sm:text-3xl lg:text-4xl">
                Operacion central
              </h1>
              <p className="max-w-2xl text-xs leading-5 text-violet-100/82 sm:text-sm sm:leading-7 lg:text-base">
                {dashboard.heroDescription}
              </p>
            </div>
          </div>

          <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100/72">Sesion</p>
              <p className="mt-1 text-sm font-semibold text-white">{admin.displayName}</p>
              <p className="text-xs text-violet-100/75">{admin.email}</p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100/72">Rol</p>
              <p className="mt-1 text-sm font-semibold text-white">{admin.role.replace(/_/g, ' ')}</p>
              <p className="text-xs text-violet-100/75">{admin.permissions.length} permisos activos</p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm sm:col-span-2 xl:col-span-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100/72">Cobertura</p>
              <p className="mt-1 text-sm font-semibold text-white">{dashboard.coverageLabel}</p>
              <p className="text-xs text-violet-100/75">{dashboard.coverageHint}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        {dashboard.kpis.map((kpi) => (
          <AdminKpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            delta={kpi.delta}
            hint={kpi.hint}
            tone={kpi.tone}
          />
        ))}
      </section>

      <section id="analytics">
        <AdminDashboardChart
          initialData={dashboard.chartData}
          initialCurrencies={dashboard.chartAvailableCurrencies}
        />
      </section>

      <section className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <AdminDashboardOpsRanking
          fallbackRows={dashboard.featuredBusinesses.map((business) => ({
            id: business.id,
            name: business.name,
            slug: business.slug,
            orders: business.orders,
          }))}
        />

        <div
          id="orders"
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem] sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Ultimos pedidos
              </p>
              <h2 className="mt-1 font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-slate-950 sm:mt-2 sm:text-xl">
                Cola reciente
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700 sm:inline-flex">
                {dashboard.recentOrdersBadge}
              </span>
              <Link
                href="/admin/pedidos"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-50"
              >
                Ver todos
              </Link>
            </div>
          </div>

          <div className="mt-4 max-h-[420px] space-y-2.5 overflow-y-auto overscroll-contain sm:mt-5 sm:max-h-none sm:space-y-3">
            {dashboard.recentOrders.slice(0, 6).map((order) => (
              <div
                key={`${order.code}-${order.businessId ?? 'x'}-${order.createdLabel}`}
                className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 sm:rounded-[1.35rem] sm:px-4 sm:py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-950">{order.code}</p>
                    <p className="truncate text-xs text-slate-500">
                      {order.businessId ? (
                        <Link
                          href={`/admin/negocios/${order.businessId}`}
                          className="font-semibold text-violet-700 hover:underline"
                        >
                          {order.business}
                        </Link>
                      ) : (
                        order.business
                      )}{' '}
                      · {order.createdLabel}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm sm:px-3 sm:text-xs ${orderStatusClasses[order.statusTone]}`}
                  >
                    {order.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{order.currency}</span>
                  <span className="font-semibold text-slate-950">{order.amountLabel}</span>
                </div>
              </div>
            ))}
            {dashboard.recentOrders.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                Aun no hay pedidos recientes para mostrar en el panel.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        {dashboard.moduleSnapshots.slice(0, 4).map((module) => (
          <article
            key={module.id}
            id={module.id}
            className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              {module.label}
            </p>
            <p className="mt-3 font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] text-slate-950">
              {module.value}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{module.description}</p>
          </article>
        ))}
      </section>

      <section className="hidden gap-6 xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
        <div className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Cobertura operativa
              </p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Ratios del stack
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
              Live
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {dashboard.segmentCards.map((segment) => {
              const toneClass = segmentToneClasses[segment.tone];

              return (
                <div key={segment.id} className={`rounded-[1.35rem] border p-4 ${toneClass}`}>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em]">
                    {segment.label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{segment.value}</p>
                  <p className="mt-2 text-sm text-slate-600">{segment.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        <AdminRecentActivity entries={dashboard.recentActivity} />
      </section>
    </div>
  );
}