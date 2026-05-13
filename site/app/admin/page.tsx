import type { Metadata } from 'next';

import { AdminDashboardChart } from './_components/AdminDashboardChart';
import { AdminKpiCard } from './_components/AdminKpiCard';
import { AdminRecentActivity } from './_components/AdminRecentActivity';
import { requireAdminPermission } from './_lib/admin-auth';

type ChartPoint = {
  label: string;
  orders: number;
  revenue: number;
};

type ActivityEntry = {
  title: string;
  description: string;
  time: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const chartData: readonly ChartPoint[] = [
  { label: 'Lun', orders: 62, revenue: 3400000 },
  { label: 'Mar', orders: 70, revenue: 4100000 },
  { label: 'Mie', orders: 78, revenue: 4680000 },
  { label: 'Jue', orders: 74, revenue: 4360000 },
  { label: 'Vie', orders: 96, revenue: 5920000 },
  { label: 'Sab', orders: 128, revenue: 7480000 },
  { label: 'Dom', orders: 114, revenue: 6910000 },
];

const featuredBusinesses = [
  {
    name: 'Sazon Capital',
    city: 'Bogota',
    status: 'Activo',
    orders: 128,
    menuHealth: '98%',
    owner: 'Andrea Moreno',
  },
  {
    name: 'Pizza 24/7',
    city: 'Medellin',
    status: 'En revision',
    orders: 94,
    menuHealth: '87%',
    owner: 'Luis Rojas',
  },
  {
    name: 'Cafe Patio 8',
    city: 'Barranquilla',
    status: 'Promocionado',
    orders: 83,
    menuHealth: '92%',
    owner: 'Daniela Ruiz',
  },
  {
    name: 'La Arepera Norte',
    city: 'Cali',
    status: 'Activo',
    orders: 71,
    menuHealth: '95%',
    owner: 'Carlos Garcia',
  },
];

const recentOrders = [
  {
    code: '#EMX-8012',
    business: 'Sazon Capital',
    customer: 'Maria P.',
    amount: 94000,
    status: 'Preparando',
  },
  {
    code: '#EMX-8011',
    business: 'Pizza 24/7',
    customer: 'Jose A.',
    amount: 68000,
    status: 'Pendiente',
  },
  {
    code: '#EMX-8009',
    business: 'Cafe Patio 8',
    customer: 'Laura R.',
    amount: 52000,
    status: 'Entregado',
  },
  {
    code: '#EMX-8007',
    business: 'La Arepera Norte',
    customer: 'Nicolas S.',
    amount: 47000,
    status: 'En camino',
  },
];

const recentActivity: readonly ActivityEntry[] = [
  {
    title: 'Nuevo negocio validado para onboarding',
    description: 'Sazon Capital completo KYC, menu y metodos de pago.',
    time: 'Hace 12 min',
    tone: 'success',
  },
  {
    title: 'Campana promocionada aprobada',
    description: 'Cafe Patio 8 activo presupuesto especial para fin de semana.',
    time: 'Hace 28 min',
    tone: 'info',
  },
  {
    title: 'Intento de acceso sin permiso',
    description: 'Usuario support intento abrir modulo de seguridad.',
    time: 'Hace 41 min',
    tone: 'warning',
  },
  {
    title: 'Reabastecimiento de creditos IA',
    description: 'Pizza 24/7 recibio 250 creditos para imagenes de productos.',
    time: 'Hace 1 h',
    tone: 'success',
  },
  {
    title: 'Alerta operativa de delivery',
    description: '3 invitaciones de delivery pendientes por expirar.',
    time: 'Hace 1 h 12 min',
    tone: 'danger',
  },
];

const moduleSnapshots = [
  {
    id: 'menus',
    label: 'Menus pendientes',
    value: '18',
    description: 'Menus esperando verificacion editorial o imagen principal.',
  },
  {
    id: 'promoted',
    label: 'Campanas activas',
    value: '09',
    description: 'Promociones visibles en discovery con presupuesto disponible.',
  },
  {
    id: 'subscriptions',
    label: 'Suscripciones por renovar',
    value: '24',
    description: 'Cuentas con ventana de cobro en los proximos 7 dias.',
  },
  {
    id: 'ai-credits',
    label: 'Bolsas IA monitoreadas',
    value: '56',
    description: 'Comercios con creditos IA bajo umbral para soporte preventivo.',
  },
  {
    id: 'delivery',
    label: 'Couriers activos',
    value: '31',
    description: 'Personal delivery habilitado y visible para operaciones del dia.',
  },
  {
    id: 'customers',
    label: 'Clientes nuevos hoy',
    value: '143',
    description: 'Compradores primerizos detectados por tracking y newsletter.',
  },
  {
    id: 'settings',
    label: 'Cambios de configuracion',
    value: '07',
    description: 'Actualizaciones recientes de branding, tasas y parametros globales.',
  },
  {
    id: 'security',
    label: 'Eventos de seguridad',
    value: '04',
    description: 'Accesos denegados y revisiones de privilegios en las ultimas 24 horas.',
  },
];

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function AdminDashboardPage() {
  const admin = await requireAdminPermission('dashboard.read');

  return (
    <div className="space-y-6">
      <section
        id="overview"
        className="overflow-hidden rounded-[2rem] border border-violet-200/80 bg-[linear-gradient(135deg,#1b1140_0%,#31106a_45%,#5b21b6_100%)] p-6 text-white shadow-[0_30px_90px_-48px_rgba(91,33,182,0.7)] sm:p-8"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
              Base segura fase 1
            </span>
            <div className="space-y-2">
              <h1 className="font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Operacion central de admin.elmenuxfa.com
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-violet-100/82 sm:text-base">
                Panel maestro inicial con corte por hostname, RBAC minimo, auditoria y una capa server-side
                lista para crecer sin tocar el marketplace publico.
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
              <p className="mt-1 text-sm font-semibold text-white">Marketplace + business</p>
              <p className="text-xs text-violet-100/75">Sin exponer service role al cliente</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AdminKpiCard
          title="Negocios activos"
          value="248"
          delta="+12 esta semana"
          hint="18 onboarding en cola"
          tone="violet"
        />
        <AdminKpiCard
          title="Pedidos de hoy"
          value="621"
          delta="+8.3% vs ayer"
          hint="Pico entre 12:00 y 15:00"
          tone="indigo"
        />
        <AdminKpiCard
          title="Menus publicados"
          value="219"
          delta="94% saludables"
          hint="16 con imagen IA en procesamiento"
          tone="emerald"
        />
        <AdminKpiCard
          title="Ingresos del dia"
          value={currencyFormatter.format(28400000)}
          delta="+11.7%"
          hint="Tasa manual estable en 92 comercios"
          tone="amber"
        />
        <AdminKpiCard
          title="Conversion"
          value="6.8%"
          delta="+0.9 pts"
          hint="Marketplace y QR"
          tone="rose"
        />
        <AdminKpiCard
          title="Creditos IA restantes"
          value="3.480"
          delta="56 carteras monitoreadas"
          hint="4 wallets en umbral critico"
          tone="slate"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <div id="analytics">
          <AdminDashboardChart data={chartData} />
        </div>

        <div
          id="promoted"
          className="rounded-[1.8rem] border border-violet-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-500">Campanas promocionadas</p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Widget prioritario de crecimiento
              </h2>
            </div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold text-violet-700">
              3 activas
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Weekend Pizza Boost</p>
                  <p className="text-xs text-slate-500">Pizza 24/7 · Medellin</p>
                </div>
                <p className="text-sm font-bold text-violet-700">72%</p>
              </div>
              <div className="mt-3 h-2 rounded-full bg-violet-100">
                <div className="h-full w-[72%] rounded-full bg-violet-600" />
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-600">
                18.4k impresiones, 642 clics y costo proyectado bajo control para el cierre del domingo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">ROI esperado</p>
                <p className="mt-2 text-xl font-black text-slate-950">3.2x</p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Lead time</p>
                <p className="mt-2 text-xl font-black text-slate-950">14 min</p>
              </div>
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
                Tabla operativa mock para soporte y growth
              </h2>
            </div>
            <p className="text-sm text-slate-500">Ultima foto actualizada hace 9 minutos</p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  <th className="pb-3 pr-4">Negocio</th>
                  <th className="pb-3 pr-4">Owner</th>
                  <th className="pb-3 pr-4">Estado</th>
                  <th className="pb-3 pr-4">Pedidos</th>
                  <th className="pb-3">Salud menu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {featuredBusinesses.map((business) => (
                  <tr key={business.name} className="align-top">
                    <td className="py-4 pr-4">
                      <div>
                        <p className="font-semibold text-slate-950">{business.name}</p>
                        <p className="text-xs text-slate-500">{business.city}</p>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{business.owner}</td>
                    <td className="py-4 pr-4">
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
                        {business.status}
                      </span>
                    </td>
                    <td className="py-4 pr-4 font-semibold text-slate-950">{business.orders}</td>
                    <td className="py-4 font-semibold text-emerald-600">{business.menuHealth}</td>
                  </tr>
                ))}
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
                Cola de seguimiento del dia
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">
              4 activos
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.code}
                className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{order.code}</p>
                    <p className="text-xs text-slate-500">{order.business} · {order.customer}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-violet-700 shadow-sm">
                    {order.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Monto</span>
                  <span className="font-semibold text-slate-950">{currencyFormatter.format(order.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {moduleSnapshots.map((module) => (
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
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Clientes y analiticas</p>
              <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Segmentos que ameritan accion rapida
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
              Mock data
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/80 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">Retencion</p>
              <p className="mt-2 text-2xl font-black text-slate-950">38%</p>
              <p className="mt-2 text-sm text-slate-600">Clientes que repiten dentro de 30 dias.</p>
            </div>
            <div className="rounded-[1.35rem] border border-emerald-100 bg-emerald-50/80 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-600">QR conversion</p>
              <p className="mt-2 text-2xl font-black text-slate-950">11.4%</p>
              <p className="mt-2 text-sm text-slate-600">Sesiones que terminan en pedido desde QR fisico.</p>
            </div>
            <div className="rounded-[1.35rem] border border-amber-100 bg-amber-50/80 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-600">Recovery</p>
              <p className="mt-2 text-2xl font-black text-slate-950">19</p>
              <p className="mt-2 text-sm text-slate-600">Negocios para seguimiento por churn o pausa operativa.</p>
            </div>
          </div>
        </div>

        <AdminRecentActivity entries={recentActivity} />
      </section>
    </div>
  );
}