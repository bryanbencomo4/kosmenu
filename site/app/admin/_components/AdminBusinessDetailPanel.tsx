'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Save,
  ShoppingCart,
  Store,
} from 'lucide-react';

import { describeAiCreditMovement } from '../_lib/admin-ai-credit-labels';
import type { CurrentAdmin } from '../_lib/admin-auth';

type BusinessDetail = {
  id: string;
  nombre: string;
  slug: string;
  categoria: string | null;
  direccion: string | null;
  whatsapp: string | null;
  moneda: string | null;
  exchangeRateMode: string | null;
  exchangeRateSource: string | null;
  exchangeRateValue: number | null;
  tasaCambioPesos: number | null;
  lastRateUpdate: string | null;
  en_linea: boolean;
  mostrar_en_directorio_publico: boolean;
  promovido: boolean;
  negocio_virtual: boolean;
  permiteDelivery: boolean;
  recibePedidosWhatsapp: boolean;
  ownerUserId: string | null;
  ownerEmail: string | null;
  correo: string | null;
  logoUrl: string | null;
  menuUrl: string;
  updated_at: string | null;
  created_at: string | null;
  subscription: {
    id: string;
    status: string;
    planCode: string | null;
    planName: string | null;
    provider: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    gracePeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    userId: string | null;
  } | null;
  plans: Array<{
    code: string;
    name: string;
    priceAmount: number;
    priceCurrency: string;
    billingInterval: string;
  }>;
  aiCredits: {
    balance: number;
    used: number;
    updatedAt: string | null;
    recent: Array<{
      id: string;
      type: string;
      amount: number;
      reason: string | null;
      createdAt: string | null;
      metadata?: Record<string, unknown>;
    }>;
  };
  stats: {
    productsActive: number;
    categoriesActive: number;
    orders7d: number;
    orders30d: number;
    revenue7dLabel: string;
    revenue30dLabel: string;
    currencyBuckets7d: Array<{
      currency: string;
      amount: number;
      count: number;
      label: string;
    }>;
  };
};

function toLocalDateInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type FormState = {
  nombre: string;
  categoria: string;
  direccion: string;
  whatsapp: string;
  moneda: string;
  exchange_rate_value: string;
  tasa_cambio_pesos: string;
  en_linea: boolean;
  mostrar_en_directorio_publico: boolean;
  promovido: boolean;
  permite_delivery: boolean;
  recibe_pedidos_whatsapp: boolean;
};

type AdminBusinessDetailPanelProps = {
  admin: CurrentAdmin;
  businessId: string;
  initialDetail: BusinessDetail;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

function toForm(detail: BusinessDetail): FormState {
  return {
    nombre: detail.nombre,
    categoria: detail.categoria ?? '',
    direccion: detail.direccion ?? '',
    whatsapp: detail.whatsapp ?? '',
    moneda: detail.moneda ?? 'USD',
    exchange_rate_value:
      detail.exchangeRateValue != null ? String(detail.exchangeRateValue) : '',
    tasa_cambio_pesos:
      detail.tasaCambioPesos != null ? String(detail.tasaCambioPesos) : '',
    en_linea: detail.en_linea,
    mostrar_en_directorio_publico: detail.mostrar_en_directorio_publico,
    promovido: detail.promovido,
    permite_delivery: detail.permiteDelivery,
    recibe_pedidos_whatsapp: detail.recibePedidosWhatsapp,
  };
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminBusinessDetailPanel({
  admin,
  businessId,
  initialDetail,
}: AdminBusinessDetailPanelProps) {
  const canWrite = admin.permissions.includes('businesses.write');
  const canMembership = admin.permissions.includes('subscriptions.write');
  const canAiCredits = admin.permissions.includes('ai_credits.write');
  const [detail, setDetail] = useState(initialDetail);
  const [form, setForm] = useState<FormState>(() => toForm(initialDetail));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opsWorking, setOpsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [renewPlan, setRenewPlan] = useState(
    () => initialDetail.subscription?.planCode || initialDetail.plans[0]?.code || 'menu_monthly',
  );
  const [renewMonths, setRenewMonths] = useState(1);
  const [periodEndInput, setPeriodEndInput] = useState(
    () => toLocalDateInput(initialDetail.subscription?.currentPeriodEnd ?? null),
  );
  const [creditAmount, setCreditAmount] = useState('50');
  const [creditReason, setCreditReason] = useState('Recarga manual soporte');

  const dirty = useMemo(() => {
    const baseline = toForm(detail);
    return JSON.stringify(baseline) !== JSON.stringify(form);
  }, [detail, form]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/admin/api/negocios/${businessId}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await readJson<{ ok: true; data: BusinessDetail }>(response);
      setDetail(payload.data);
      setForm(toForm(payload.data));
      setStatusMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recargar.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    setDetail(initialDetail);
    setForm(toForm(initialDetail));
    setRenewPlan(
      initialDetail.subscription?.planCode || initialDetail.plans[0]?.code || 'menu_monthly',
    );
    setPeriodEndInput(toLocalDateInput(initialDetail.subscription?.currentPeriodEnd ?? null));
  }, [initialDetail]);

  useEffect(() => {
    setPeriodEndInput(toLocalDateInput(detail.subscription?.currentPeriodEnd ?? null));
    if (detail.subscription?.planCode) {
      setRenewPlan(detail.subscription.planCode);
    }
  }, [detail.subscription]);

  async function runMembership(body: Record<string, unknown>, successMessage: string) {
    if (!canMembership || opsWorking) return;
    setOpsWorking(true);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/admin/api/negocios/${businessId}/membership`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await readJson<{ ok: true; data: BusinessDetail }>(response);
      setDetail(result.data);
      setForm(toForm(result.data));
      setStatusMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la membresia.');
    } finally {
      setOpsWorking(false);
    }
  }

  async function renewMembership() {
    if (
      !window.confirm(
        `Renovar ${renewMonths} mes(es) con plan ${renewPlan}? Se usa el mismo flujo seguro de pago (grant_subscription_period).`,
      )
    ) {
      return;
    }
    await runMembership(
      { action: 'renew', planCode: renewPlan, months: renewMonths },
      `Membresia renovada: +${renewMonths} mes(es).`,
    );
  }

  async function savePeriodEnd() {
    const iso = localDateInputToIso(periodEndInput);
    if (!iso) {
      setError('Indica una fecha de corte valida.');
      return;
    }
    if (
      !window.confirm(
        `Cambiar la fecha de corte a ${formatDate(iso)}? Si la fecha es futura, se reactiva la membresia.`,
      )
    ) {
      return;
    }
    await runMembership(
      { action: 'set_period_end', periodEnd: iso, reactivate: true },
      'Fecha de corte actualizada.',
    );
  }

  async function setMembershipStatus(status: 'active' | 'suspended' | 'cancelled') {
    const labels = {
      active: 'Activar membresia (y poner en linea)',
      suspended: 'Suspender membresia (y quitar de linea)',
      cancelled: 'Cancelar membresia (y quitar de linea)',
    } as const;
    if (!window.confirm(`${labels[status]}?`)) return;
    await runMembership(
      { action: 'set_status', status },
      status === 'active'
        ? 'Membresia activada.'
        : status === 'suspended'
          ? 'Membresia suspendida.'
          : 'Membresia cancelada.',
    );
  }

  async function grantCredits() {
    if (!canAiCredits || opsWorking) return;
    const amount = Math.floor(Number(creditAmount));
    if (!Number.isFinite(amount) || amount < 1) {
      setError('Indica una cantidad valida de creditos.');
      return;
    }
    if (!window.confirm(`Recargar ${amount} creditos de IA a este negocio?`)) return;

    setOpsWorking(true);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/admin/api/negocios/${businessId}/ai-credits`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          reason: creditReason.trim() || 'admin_manual_topup',
        }),
      });
      const result = await readJson<{ ok: true; data: BusinessDetail }>(response);
      setDetail(result.data);
      setForm(toForm(result.data));
      setStatusMessage(`Se recargaron ${amount} creditos de IA.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron recargar creditos.');
    } finally {
      setOpsWorking(false);
    }
  }

  async function save() {
    if (!canWrite || !dirty) return;
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    const payload: Record<string, unknown> = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || null,
      direccion: form.direccion.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      moneda: form.moneda || null,
      en_linea: form.en_linea,
      mostrar_en_directorio_publico: form.mostrar_en_directorio_publico,
      promovido: form.promovido,
      permite_delivery: form.permite_delivery,
      recibe_pedidos_whatsapp: form.recibe_pedidos_whatsapp,
    };

    const rate = form.exchange_rate_value.trim();
    payload.exchange_rate_value = rate ? Number(rate) : null;
    const tasa = form.tasa_cambio_pesos.trim();
    payload.tasa_cambio_pesos = tasa ? Number(tasa) : null;

    try {
      const response = await fetch(`/admin/api/negocios/${businessId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await readJson<{ ok: true; data: BusinessDetail }>(response);
      setDetail(result.data);
      setForm(toForm(result.data));
      setStatusMessage('Cambios guardados. Quedaron registrados en la bitacora admin.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-900/10 bg-[linear-gradient(135deg,#111827_0%,#1e1b4b_50%,#4c1d95_100%)] p-4 text-white sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/admin/negocios"
              className="inline-flex items-center gap-1 text-xs font-bold text-violet-200/80 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Negocios
            </Link>
            <div className="mt-2 flex items-start gap-3 sm:mt-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 sm:h-12 sm:w-12 sm:rounded-[1.1rem]">
                {detail.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-5 w-5 text-violet-100" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-[var(--font-display)] text-xl font-black tracking-[-0.04em] sm:text-3xl">
                  {detail.nombre}
                </h1>
                <p className="mt-0.5 truncate text-xs text-violet-100/80 sm:text-sm">
                  /{detail.slug}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Link
              href={detail.menuUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 sm:w-auto sm:gap-2 sm:px-4"
              aria-label="Menu publico"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline text-sm font-bold">Menu</span>
            </Link>
            <Link
              href={`/admin/pedidos?businessId=${detail.id}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 sm:w-auto sm:gap-2 sm:px-4"
              aria-label="Pedidos"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline text-sm font-bold">Pedidos</span>
            </Link>
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15"
              aria-label="Recargar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Pedidos 7d', String(detail.stats.orders7d)],
          ['Ingresos 7d', detail.stats.revenue7dLabel],
          ['Pedidos 30d', String(detail.stats.orders30d)],
          ['Catalogo', `${detail.stats.productsActive} prod · ${detail.stats.categoriesActive} cat`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.4)]"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {detail.stats.currencyBuckets7d.length > 0 ? (
        <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
          <p className="font-bold">Desglose 7d por moneda de checkout</p>
          <p className="mt-1 text-amber-900/80">
            {detail.stats.currencyBuckets7d
              .map((bucket) => `${bucket.label} (${bucket.count} pedidos)`)
              .join(' · ')}
          </p>
        </section>
      ) : null}

      {(error || statusMessage) && (
        <div
          className={[
            'rounded-[1.35rem] border px-4 py-3 text-sm font-medium',
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {error ?? statusMessage}
        </div>
      )}

      {!canWrite ? (
        <section className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu rol puede consultar la ficha. Editar datos requiere permiso de escritura.
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Datos del negocio
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Edicion controlada. El slug no se modifica desde aqui.
              </p>
            </div>
            <button
              type="button"
              disabled={!canWrite || !dirty || saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-[1rem] bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <input
                value={form.nombre}
                disabled={!canWrite || saving}
                onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
              />
            </Field>
            <Field label="Categoria">
              <input
                value={form.categoria}
                disabled={!canWrite || saving}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, categoria: event.target.value }))
                }
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
              />
            </Field>
            <Field label="WhatsApp">
              <input
                value={form.whatsapp}
                disabled={!canWrite || saving}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, whatsapp: event.target.value }))
                }
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
              />
            </Field>
            <Field label="Email del dueño">
              <input
                value={detail.ownerEmail || ''}
                disabled
                readOnly
                className="w-full rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 opacity-90"
                placeholder="Sin email en la cuenta"
              />
              {detail.correo && detail.correo !== detail.ownerEmail ? (
                <p className="mt-1 text-xs text-slate-500">
                  Correo en ficha del negocio: {detail.correo}
                </p>
              ) : null}
            </Field>
            <Field label="Moneda base del menu">
              <select
                value={form.moneda}
                disabled={!canWrite || saving}
                onChange={(event) => setForm((prev) => ({ ...prev, moneda: event.target.value }))}
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
              >
                <option value="USD">USD</option>
                <option value="COP">COP</option>
                <option value="VES">VES</option>
              </select>
            </Field>
            <Field label="Direccion" className="sm:col-span-2">
              <input
                value={form.direccion}
                disabled={!canWrite || saving}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, direccion: event.target.value }))
                }
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
              />
            </Field>
            <Field label="Tasa (exchange_rate_value)">
              <input
                value={form.exchange_rate_value}
                disabled={!canWrite || saving}
                inputMode="decimal"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, exchange_rate_value: event.target.value }))
                }
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
                placeholder="Ej. 38.5"
              />
            </Field>
            <Field label="Tasa COP (tasa_cambio_pesos)">
              <input
                value={form.tasa_cambio_pesos}
                disabled={!canWrite || saving}
                inputMode="decimal"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tasa_cambio_pesos: event.target.value }))
                }
                className="w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 disabled:bg-slate-50 disabled:opacity-80"
                placeholder="Opcional"
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                ['en_linea', 'En linea', form.en_linea],
                ['mostrar_en_directorio_publico', 'En directorio', form.mostrar_en_directorio_publico],
                ['promovido', 'Promocionado', form.promovido],
                ['permite_delivery', 'Delivery', form.permite_delivery],
                ['recibe_pedidos_whatsapp', 'WhatsApp pedidos', form.recibe_pedidos_whatsapp],
              ] as const
            ).map(([key, label, active]) => (
              <button
                key={key}
                type="button"
                disabled={!canWrite || saving}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    [key]: !prev[key],
                  }))
                }
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold disabled:opacity-50 ${
                  active
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Resumen membresia
            </p>
            {detail.subscription ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-lg font-black text-slate-950">
                  {detail.subscription.status}
                </p>
                <p className="text-slate-600">
                  {detail.subscription.planName || detail.subscription.planCode || 'Sin plan'}
                </p>
                <p className="text-slate-600">
                  Corte: {formatDate(detail.subscription.currentPeriodEnd)}
                </p>
                <p className="text-xs text-slate-500">
                  Creditos IA: {detail.aiCredits.balance}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Sin suscripcion registrada.</p>
            )}
          </article>

          <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Identidad tecnica
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="ID" value={detail.id} />
              <Row label="Email dueño" value={detail.ownerEmail || '—'} />
              <Row label="Owner user" value={detail.ownerUserId || '—'} />
              <Row
                label="Tasa modo"
                value={
                  [detail.exchangeRateMode, detail.exchangeRateSource]
                    .filter(Boolean)
                    .join(' / ') || '—'
                }
              />
              <Row label="Ultima tasa" value={formatDate(detail.lastRateUpdate)} />
              <Row label="Actualizado" value={formatDate(detail.updated_at)} />
              <Row label="Creado" value={formatDate(detail.created_at)} />
            </dl>
          </article>

          <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Ingresos 30d
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {detail.stats.revenue30dLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Totales separados por moneda; no se asumen dolares.
            </p>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Membresia
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Renovar, suspender o ajustar la fecha de corte sin tocar otros flujos de pago.
              </p>
            </div>
            <Link
              href="/admin/suscripciones"
              className="text-xs font-bold text-violet-700 hover:underline"
            >
              Cola de pagos
            </Link>
          </div>

          {detail.subscription ? (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Estado" value={detail.subscription.status} />
              <Row
                label="Plan"
                value={
                  detail.subscription.planName
                    ? `${detail.subscription.planName} (${detail.subscription.planCode})`
                    : detail.subscription.planCode || '—'
                }
              />
              <Row label="Inicio periodo" value={formatDate(detail.subscription.currentPeriodStart)} />
              <Row label="Fecha de corte" value={formatDate(detail.subscription.currentPeriodEnd)} />
              <Row label="Gracia" value={formatDate(detail.subscription.gracePeriodEnd)} />
              <Row label="Proveedor" value={detail.subscription.provider || '—'} />
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Aun no hay suscripcion. Puedes crear una renovando con un plan.
            </p>
          )}

          {!canMembership ? (
            <p className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Tu rol puede ver la membresia, pero no modificarla.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_100px_auto]">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Plan
                  </span>
                  <select
                    value={renewPlan}
                    disabled={opsWorking}
                    onChange={(event) => setRenewPlan(event.target.value)}
                    className="w-full rounded-[1rem] border border-slate-200 px-3 py-2.5 text-sm outline-none ring-violet-200 focus:ring-4"
                  >
                    {(detail.plans.length > 0
                      ? detail.plans
                      : [{ code: 'menu_monthly', name: 'Menu mensual', priceAmount: 0, priceCurrency: 'USD', billingInterval: 'month' }]
                    ).map((plan) => (
                      <option key={plan.code} value={plan.code}>
                        {plan.name} ({plan.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Meses
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={renewMonths}
                    disabled={opsWorking}
                    onChange={(event) => setRenewMonths(Number(event.target.value) || 1)}
                    className="w-full rounded-[1rem] border border-slate-200 px-3 py-2.5 text-sm outline-none ring-violet-200 focus:ring-4"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={opsWorking}
                    onClick={() => void renewMembership()}
                    className="w-full rounded-[1rem] bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    Renovar
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Fecha de corte
                  </span>
                  <input
                    type="datetime-local"
                    value={periodEndInput}
                    disabled={opsWorking}
                    onChange={(event) => setPeriodEndInput(event.target.value)}
                    className="w-full rounded-[1rem] border border-slate-200 px-3 py-2.5 text-sm outline-none ring-violet-200 focus:ring-4"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={opsWorking || !periodEndInput}
                    onClick={() => void savePeriodEnd()}
                    className="rounded-[1rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Guardar corte
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={opsWorking}
                  onClick={() => void setMembershipStatus('active')}
                  className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  Activar
                </button>
                <button
                  type="button"
                  disabled={opsWorking}
                  onClick={() => void setMembershipStatus('suspended')}
                  className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  Suspender
                </button>
                <button
                  type="button"
                  disabled={opsWorking}
                  onClick={() => void setMembershipStatus('cancelled')}
                  className="rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </article>

        <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div>
            <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
              Creditos IA
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Saldo para generacion de imagenes y demas usos de IA del negocio.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-violet-100 bg-violet-50/70 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-violet-700">
                Saldo
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {detail.aiCredits.balance}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                Usados
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {detail.aiCredits.used}
              </p>
            </div>
          </div>

          {!canAiCredits ? (
            <p className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Tu rol puede consultar el saldo, pero no recargar.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)_auto]">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Cantidad
                </span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={creditAmount}
                  disabled={opsWorking}
                  onChange={(event) => setCreditAmount(event.target.value)}
                  className="w-full rounded-[1rem] border border-slate-200 px-3 py-2.5 text-sm outline-none ring-violet-200 focus:ring-4"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Motivo
                </span>
                <input
                  value={creditReason}
                  disabled={opsWorking}
                  onChange={(event) => setCreditReason(event.target.value)}
                  className="w-full rounded-[1rem] border border-slate-200 px-3 py-2.5 text-sm outline-none ring-violet-200 focus:ring-4"
                  placeholder="Recarga manual soporte"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={opsWorking}
                  onClick={() => void grantCredits()}
                  className="w-full rounded-[1rem] bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Recargar
                </button>
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              Movimientos recientes
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Incluye usos desde app.elmenuxfa.com y recargas de soporte.
            </p>
            <ul className="mt-2 divide-y divide-slate-100 rounded-[1.1rem] border border-slate-200">
              {detail.aiCredits.recent.length === 0 ? (
                <li className="px-3 py-3 text-sm text-slate-500">Sin movimientos.</li>
              ) : (
                detail.aiCredits.recent.map((row) => {
                  const label = describeAiCreditMovement({
                    type: row.type,
                    reason: row.reason,
                    metadata: row.metadata,
                  });
                  const amountLabel = `${label.isCredit || row.type === 'credit' ? '+' : '−'}${row.amount}`;
                  return (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{label.title}</p>
                        {label.detail ? (
                          <p className="text-xs text-slate-500">{label.detail}</p>
                        ) : null}
                        <p className="text-xs text-slate-400">{formatDate(row.createdAt)}</p>
                      </div>
                      <p
                        className={[
                          'shrink-0 text-sm font-black tabular-nums',
                          row.type === 'debit' ? 'text-amber-700' : 'text-emerald-700',
                        ].join(' ')}
                      >
                        {amountLabel}{' '}
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          cr
                        </span>
                      </p>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </article>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={['block space-y-1.5', className].filter(Boolean).join(' ')}>
      <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[60%] break-all text-right font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
