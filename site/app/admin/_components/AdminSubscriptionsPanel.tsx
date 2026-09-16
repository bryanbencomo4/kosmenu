'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Gift, RefreshCw, ShieldCheck, UserRound, WalletCards } from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import {
  canManageAdvisors,
  canManageBillingCatalog,
  canReviewPayments,
  isManualMethodReady,
  parseAccountFields,
  type PaymentAccountField,
} from '../_lib/admin-billing';

type TabId = 'cola' | 'metodos' | 'tarjetas' | 'asesores';

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  verification: 'automatic' | 'manual';
  kind: string;
  is_active: boolean;
  instructions: string | null;
  brand_color: string | null;
  account_fields: PaymentAccountField[] | unknown;
  requires_advisor_code: boolean;
  review_sla_minutes: number;
};

type Submission = {
  id: string;
  business_name: string;
  method_code: string;
  status: string;
  months: number;
  amount_usd: number;
  declared_amount: number | null;
  declared_currency: string | null;
  reference: string | null;
  payer_name: string | null;
  receipt_url: string | null;
  review_note: string | null;
  created_at: string;
  advisor_name: string | null;
  advisor_code: string | null;
};

type GiftCard = {
  id: string;
  code_hint: string;
  months: number;
  status: string;
  batch_label: string | null;
  expires_at: string | null;
  created_at: string;
};

type Advisor = {
  id: string;
  full_name: string;
  code: string;
  phone: string | null;
  is_active: boolean;
  note: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

export function AdminSubscriptionsPanel({ admin }: { admin: CurrentAdmin }) {
  const canReview = canReviewPayments(admin.role);
  const canCatalog = canManageBillingCatalog(admin.role);
  const canAdvisors = canManageAdvisors(admin.role);
  const [tab, setTab] = useState<TabId>(canReview ? 'cola' : canCatalog ? 'metodos' : 'asesores');

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.24),transparent_34%),linear-gradient(180deg,#101226_0%,#171a3d_100%)] px-6 py-7 text-white shadow-[0_30px_80px_-48px_rgba(15,23,42,0.9)] sm:px-8">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-200/70">Suscripciones</p>
        <h1 className="mt-2 font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] sm:text-4xl">
          Pagos del plan
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-violet-100/80">
          Revisa comprobantes, carga las cuentas de cada metodo, emite tarjetas de regalo y autoriza asesores de
          venta. Lo que configures aqui es lo que ve el comerciante en app.elmenuxfa.com.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {canReview || admin.role === 'sales' ? (
          <TabButton active={tab === 'cola'} onClick={() => setTab('cola')} icon={<ShieldCheck className="h-4 w-4" />}>
            Cola de revision
          </TabButton>
        ) : null}
        <TabButton active={tab === 'metodos'} onClick={() => setTab('metodos')} icon={<WalletCards className="h-4 w-4" />}>
          Metodos
        </TabButton>
        {canCatalog ? (
          <TabButton active={tab === 'tarjetas'} onClick={() => setTab('tarjetas')} icon={<Gift className="h-4 w-4" />}>
            Tarjetas de regalo
          </TabButton>
        ) : null}
        {canAdvisors || canReview ? (
          <TabButton active={tab === 'asesores'} onClick={() => setTab('asesores')} icon={<UserRound className="h-4 w-4" />}>
            Asesores
          </TabButton>
        ) : null}
      </div>

      {tab === 'cola' ? <QueueTab canReview={canReview} /> : null}
      {tab === 'metodos' ? <MethodsTab canEdit={canCatalog} /> : null}
      {tab === 'tarjetas' && canCatalog ? <GiftCardsTab /> : null}
      {tab === 'asesores' ? <AdvisorsTab canEdit={canAdvisors} /> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}

function QueueTab({ canReview }: { canReview: boolean }) {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/admin/api/billing/submissions?status=${status}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await readJson<{ ok: true; data: Submission[] }>(response);
      setRows(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la cola.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: 'approve' | 'reject') {
    if (!canReview) return;
    try {
      const response = await fetch('/admin/api/billing/submissions', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note: note[id] }),
      });
      await readJson(response);
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'No se pudo revisar.');
    }
  }

  return (
    <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-black">Cola de revision</h2>
          <p className="mt-1 text-sm text-slate-500">Aprueba solo si el comprobante y la referencia coinciden.</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', 'all'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider',
                status === value ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600',
              ].join(' ')}
            >
              {value}
            </button>
          ))}
          <button type="button" onClick={() => void load()} className="rounded-full border border-slate-200 p-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-5 space-y-4">
        {loading ? <p className="text-sm text-slate-500">Cargando…</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-slate-500">No hay solicitudes.</p> : null}
        {rows.map((row) => (
          <article key={row.id} className="rounded-[1.2rem] border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{row.business_name}</p>
                <p className="text-sm text-slate-500">
                  {row.method_code} · ${row.amount_usd} USD · {row.months} mes{row.months === 1 ? '' : 'es'} ·{' '}
                  {new Date(row.created_at).toLocaleString('es')}
                </p>
                {row.reference ? <p className="mt-1 text-sm">Ref: {row.reference}</p> : null}
                {row.payer_name ? <p className="text-sm">Pagador: {row.payer_name}</p> : null}
                {row.declared_amount != null ? (
                  <p className="text-sm">
                    Declaro {row.declared_amount} {row.declared_currency}
                  </p>
                ) : null}
                {row.advisor_name ? (
                  <p className="text-sm">
                    Asesor: {row.advisor_name} ({row.advisor_code})
                  </p>
                ) : null}
                {row.review_note ? <p className="mt-1 text-sm text-rose-700">{row.review_note}</p> : null}
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">{row.status}</span>
            </div>
            {row.receipt_url ? (
              <a
                href={row.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-sm font-semibold text-violet-700"
              >
                Ver comprobante
              </a>
            ) : null}
            {canReview && row.status === 'pending' ? (
              <div className="mt-4 space-y-2">
                <textarea
                  value={note[row.id] ?? ''}
                  onChange={(event) => setNote((current) => ({ ...current, [row.id]: event.target.value }))}
                  placeholder="Nota (obligatoria para rechazar)"
                  className="w-full rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void review(row.id, 'approve')}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Aprobar y activar
                  </button>
                  <button
                    type="button"
                    onClick={() => void review(row.id, 'reject')}
                    className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function MethodsTab({ canEdit }: { canEdit: boolean }) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/admin/api/billing/methods', { credentials: 'include', cache: 'no-store' });
      const payload = await readJson<{ ok: true; data: PaymentMethod[] }>(response);
      setMethods(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los metodos.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {methods.map((method) => (
        <MethodEditor
          key={method.id}
          method={method}
          canEdit={canEdit}
          saving={savingId === method.id}
          onSave={async (updates) => {
            setSavingId(method.id);
            setError(null);
            try {
              const response = await fetch('/admin/api/billing/methods', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: method.id, ...updates }),
              });
              const payload = await readJson<{ ok: true; data: PaymentMethod }>(response);
              setMethods((current) => current.map((item) => (item.id === method.id ? payload.data : item)));
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar.');
            } finally {
              setSavingId(null);
            }
          }}
        />
      ))}
    </section>
  );
}

function MethodEditor({
  method,
  canEdit,
  saving,
  onSave,
}: {
  method: PaymentMethod;
  canEdit: boolean;
  saving: boolean;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [instructions, setInstructions] = useState(method.instructions ?? '');
  const [tagline, setTagline] = useState(method.tagline ?? '');
  const [fieldsText, setFieldsText] = useState(() => fieldsToText(parseAccountFields(method.account_fields)));

  useEffect(() => {
    setInstructions(method.instructions ?? '');
    setTagline(method.tagline ?? '');
    setFieldsText(fieldsToText(parseAccountFields(method.account_fields)));
  }, [method]);

  const fields = useMemo(() => textToFields(fieldsText), [fieldsText]);
  const ready = isManualMethodReady({
    verification: method.verification,
    requiresAdvisorCode: method.requires_advisor_code,
    accountFields: fields,
  });

  return (
    <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            {method.verification === 'automatic' ? 'Automatica' : 'Manual'} · {method.code}
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{method.name}</h3>
          {!ready && method.verification === 'manual' ? (
            <p className="mt-1 text-sm text-amber-700">Faltan datos de la cuenta. El comerciante no vera este metodo.</p>
          ) : null}
        </div>
        <span
          className={[
            'rounded-full px-3 py-1 text-xs font-bold',
            method.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
          ].join(' ')}
        >
          {method.is_active ? 'Activo' : 'Oculto'}
        </span>
      </div>

      {canEdit ? (
        <div className="mt-4 grid gap-3">
          <input
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
            placeholder="Frase corta"
            className="rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
          />
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Instrucciones para el comerciante"
            className="min-h-24 rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
          />
          {method.verification === 'manual' && !method.requires_advisor_code ? (
            <textarea
              value={fieldsText}
              onChange={(event) => setFieldsText(event.target.value)}
              placeholder={'Banco: Bancolombia\nCuenta: 123456789\nTipo: Ahorros'}
              className="min-h-28 rounded-[1rem] border border-slate-200 px-3 py-2 font-mono text-sm"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void onSave({
                  tagline,
                  instructions,
                  account_fields: fields,
                })
              }
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Guardar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSave({ is_active: !method.is_active })}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold"
            >
              {method.is_active ? 'Ocultar en la app' : 'Mostrar en la app'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">{method.instructions}</p>
      )}
    </article>
  );
}

function GiftCardsTab() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [issued, setIssued] = useState<Array<{ id: string; code: string }>>([]);
  const [count, setCount] = useState('1');
  const [months, setMonths] = useState('1');
  const [batch, setBatch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/admin/api/billing/gift-cards', { credentials: 'include', cache: 'no-store' });
    const payload = await readJson<{ ok: true; data: GiftCard[] }>(response);
    setCards(payload.data);
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar.');
    });
  }, [load]);

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch('/admin/api/billing/gift-cards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: Number(count),
          months: Number(months),
          batch_label: batch || undefined,
        }),
      });
      const payload = await readJson<{ ok: true; data: Array<{ id: string; code: string }> }>(response);
      setIssued(payload.data);
      await load();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'No se pudieron emitir.');
    }
  }

  async function voidCard(id: string) {
    await fetch('/admin/api/billing/gift-cards', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <section className="space-y-4">
      <form onSubmit={(event) => void issue(event)} className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
        <h2 className="font-[var(--font-display)] text-xl font-black">Emitir tarjetas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Los codigos se muestran una sola vez. Copiaalos ahora; despues solo veras el final.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            placeholder="Cantidad"
            className="rounded-[1rem] border px-3 py-2"
          />
          <input
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            placeholder="Meses"
            className="rounded-[1rem] border px-3 py-2"
          />
          <input
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            placeholder="Lote (opcional)"
            className="rounded-[1rem] border px-3 py-2"
          />
        </div>
        <button type="submit" className="mt-4 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
          Emitir
        </button>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        {issued.length > 0 ? (
          <pre className="mt-4 overflow-x-auto rounded-[1rem] bg-slate-950 p-4 text-sm text-emerald-200">
            {issued.map((card) => card.code).join('\n')}
          </pre>
        ) : null}
      </form>
      <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
            <div>
              <p className="font-semibold">{card.code_hint}</p>
              <p className="text-sm text-slate-500">
                {card.months} mes{card.months === 1 ? '' : 'es'} · {card.status}
                {card.batch_label ? ` · ${card.batch_label}` : ''}
              </p>
            </div>
            {card.status === 'active' ? (
              <button type="button" onClick={() => void voidCard(card.id)} className="text-sm font-semibold text-rose-700">
                Anular
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdvisorsTab({ canEdit }: { canEdit: boolean }) {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/admin/api/billing/advisors', { credentials: 'include', cache: 'no-store' });
    const payload = await readJson<{ ok: true; data: Advisor[] }>(response);
    setAdvisors(payload.data);
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar.');
    });
  }, [load]);

  async function createAdvisor(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setError(null);
    try {
      const response = await fetch('/admin/api/billing/advisors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, code }),
      });
      await readJson(response);
      setName('');
      setCode('');
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear.');
    }
  }

  async function toggle(advisor: Advisor) {
    await fetch('/admin/api/billing/advisors', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: advisor.id, is_active: !advisor.is_active }),
    });
    await load();
  }

  return (
    <section className="space-y-4">
      {canEdit ? (
        <form onSubmit={(event) => void createAdvisor(event)} className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
          <h2 className="font-[var(--font-display)] text-xl font-black">Autorizar asesor</h2>
          <p className="mt-1 text-sm text-slate-500">
            El codigo es lo que el comerciante escribe para un pago en efectivo. No lo publiques.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre completo"
              className="rounded-[1rem] border px-3 py-2"
            />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Codigo (min. 4)"
              className="rounded-[1rem] border px-3 py-2"
            />
          </div>
          <button type="submit" className="mt-4 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
            Crear asesor
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
        {advisors.map((advisor) => (
          <div key={advisor.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
            <div>
              <p className="font-semibold">{advisor.full_name}</p>
              <p className="text-sm text-slate-500">
                {advisor.code}
                {advisor.is_active ? '' : ' · inactivo'}
              </p>
            </div>
            {canEdit ? (
              <button type="button" onClick={() => void toggle(advisor)} className="text-sm font-semibold text-violet-700">
                {advisor.is_active ? 'Desactivar' : 'Activar'}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function fieldsToText(fields: PaymentAccountField[]) {
  return fields.map((field) => `${field.label}: ${field.value}`).join('\n');
}

function textToFields(value: string): PaymentAccountField[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split(':');
      return {
        label: (label ?? '').trim(),
        value: rest.join(':').trim(),
        copyable: true,
      };
    })
    .filter((field) => field.label && field.value);
}
