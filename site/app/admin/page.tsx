import type { Metadata } from 'next';

import { AdminDashboardChart } from './_components/AdminDashboardChart';
import { AdminKpiCard } from './_components/AdminKpiCard';
import { AdminRecentActivity } from './_components/AdminRecentActivity';
import { getAdminDashboardData } from './_lib/admin-dashboard';
import { requireAdminPermission } from './_lib/admin-auth';

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

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
  const dashboard = await getAdminDashboardData(admin);

  return (
    <div className="space-y-6">
      <section
        id="overview"
        className="overflow-hidden rounded-[2rem] border border-violet-200/80 bg-[linear-gradient(135deg,#1b1140_0%,#31106a_45%,#5b21b6_100%)] p-6 text-white shadow-[0_30px_90px_-48px_rgba(91,33,182,0.7)] sm:p-8"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
              {dashboard.heroBadge}
            </span>
            <div className="space-y-2">
              <h1 className="font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Operacion central de admin.elmenuxfa.com
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-violet-100/82 sm:text-base">
                {dashboard.heroDescription}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100/72">Cobertura</p>
              <p className="mt-1 text-sm font-semibold text-white">{dashboard.coverageLabel}</p>
              <p className="text-xs text-violet-100/75">{dashboard.coverageHint}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <div id="analytics">
          <AdminDashboardChart data={dashboard.chartData} />
        </div>

        <div
          id="promoted"
          className="rounded-[1.8rem] border border-violet-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-500">Delivery operativo</p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                {dashboard.deliveryOverview.title}
              </h2>
            </div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold text-violet-700">
              {dashboard.deliveryOverview.badge}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Flujo delivery</p>
                  <p className="text-xs text-slate-500">{dashboard.deliveryOverview.description}</p>
                </div>
                <p className="text-sm font-bold text-violet-700">{dashboard.deliveryOverview.progressValue}%</p>
              </div>
              <div className="mt-3 h-2 rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-violet-600"
                  style={{ width: `${dashboard.deliveryOverview.progressValue}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-600">
                {dashboard.deliveryOverview.progressLabel}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {dashboard.deliveryOverview.stats.map((stat) => (
                <div key={stat.label} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-xl font-black text-slate-950">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
        <div
          id="businesses"
          className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Negocios destacados</p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Top operativo conectado al catalogo y pedidos recientes
              </h2>
            </div>
            <p className="text-sm text-slate-500">{dashboard.businessesUpdatedLabel}</p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  <th className="pb-3 pr-4">Negocio</th>
                  <th className="pb-3 pr-4">Categoria</th>
                  <th className="pb-3 pr-4">Canal</th>
                  <th className="pb-3 pr-4">Pedidos 7d</th>
                  <th className="pb-3">Catalogo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.featuredBusinesses.map((business) => (
                  <tr key={business.name} className="align-top">
                    <td className="py-4 pr-4">
                      <div>
                        <p className="font-semibold text-slate-950">{business.name}</p>
                        <p className="text-xs text-slate-500">{business.location}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{business.category}</td>
                    <td className="py-4 pr-4">
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
                        {business.channel}
                      </span>
                    </td>
                    <td className="py-4 pr-4 font-semibold text-slate-950">{business.orders}</td>
                    <td className="py-4 font-semibold text-emerald-600">{business.catalogSize}</td>
                  </tr>
                ))}
                {dashboard.featuredBusinesses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-sm text-slate-500">
                      Aun no hay comercios suficientes para poblar este bloque en vivo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div
          id="orders"
          className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Ultimos pedidos</p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Cola reciente leida desde pedidos
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">
              {dashboard.recentOrdersBadge}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {dashboard.recentOrders.map((order) => (
              <div
                key={order.code}
                className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{order.code}</p>
                    <p className="text-xs text-slate-500">
                      {order.business} · {order.customer} · {order.createdLabel}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${orderStatusClasses[order.statusTone]}`}
                  >
                    {order.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monto</span>
                  <span className="font-semibold text-slate-950">{currencyFormatter.format(order.amount)}</span>
                </div>
              </div>
            ))}
            {dashboard.recentOrders.length === 0 ? (
              <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                Aun no hay pedidos recientes para mostrar en el panel.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.moduleSnapshots.map((module) => (
          <article
            key={module.id}
            id={module.id}
            className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{module.label}</p>
            <p className="mt-3 font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] text-slate-950">
              {module.value}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{module.description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
        <div className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Cobertura operativa</p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Ratios resumidos desde el stack productivo
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
              Live data
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {dashboard.segmentCards.map((segment) => {
              const toneClass = segmentToneClasses[segment.tone];

              return (
                <div key={segment.id} className={`rounded-[1.35rem] border p-4 ${toneClass}`}>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em]">{segment.label}</p>
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