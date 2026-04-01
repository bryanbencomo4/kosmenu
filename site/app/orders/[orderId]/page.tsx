// @ts-nocheck
'use client';

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  cliente_email?: string | null;
  estado?: string | null;
  total?: number | null;
  created_at?: string | null;
  detalles?: {
    order_id?: string;
    cliente_email?: string;
    items?: Array<{
      nombre?: string;
      cantidad?: number;
      precio?: number;
    }>;
    total?: number;
  } | null;
};

type ComercioRow = {
  id: string;
  nombre?: string | null;
};

type HistoryRow = {
  orderId: string;
  estado: string;
  total: number;
  createdAt: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TRUST_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function resolveOrderEmail(order: PedidoRow | null) {
  if (!order) {
    return '';
  }

  return normalizeEmail(order.cliente_email ?? order.detalles?.cliente_email);
}

function maskEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) {
    return 'correo registrado';
  }

  const visible = localPart.slice(0, 2);
  const hiddenCount = Math.max(6, localPart.length - visible.length);
  return `${visible}${'*'.repeat(hiddenCount)}@${domain}`;
}

function buildTrustKey(comercioId: string | null | undefined, email: string) {
  return `elmenuxfa-order-access:${(comercioId ?? 'global').trim()}:${normalizeEmail(email)}`;
}

function hasTrustedDevice(comercioId: string | null | undefined, email: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const key = buildTrustKey(comercioId, email);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { expiresAt?: number };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    window.localStorage.removeItem(key);
    return false;
  }
}

function rememberTrustedDevice(comercioId: string | null | undefined, email: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const key = buildTrustKey(comercioId, email);
  window.localStorage.setItem(
    key,
    JSON.stringify({ expiresAt: Date.now() + TRUST_TTL_MS }),
  );
}

function buildOrderHistory(rows: PedidoRow[], email: string, currentOrderId: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return [] as HistoryRow[];
  }

  return rows
    .filter((row) => normalizeEmail(row.cliente_email ?? row.detalles?.cliente_email) == normalizedEmail)
    .map((row) => ({
      orderId: row.detalles?.order_id?.toString().trim() ?? '',
      estado: (row.estado ?? 'pendiente').toString().trim(),
      total: typeof row.detalles?.total === 'number'
        ? row.detalles.total
        : (typeof row.total === 'number' ? row.total : 0),
      createdAt: row.created_at ?? null,
    }))
    .filter((row) => row.orderId && row.orderId !== currentOrderId)
    .slice(0, 8);
}

function formatCop(value: number | null | undefined) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeValue);
}

function extractComercioId(orderId: string) {
  const match = orderId.match(/^(.*)-(\d{10,})$/);
  return match?.[1] ?? null;
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  if (typeof navigator.userAgentData?.mobile === 'boolean') {
    return navigator.userAgentData.mobile;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export default function OrderDetailsPage() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const orderId = decodeURIComponent(params?.orderId ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PedidoRow | null>(null);
  const [orderRows, setOrderRows] = useState<PedidoRow[]>([]);
  const [comercio, setComercio] = useState<ComercioRow | null>(null);
  const [smartRoutingActive, setSmartRoutingActive] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const derivedComercioId = useMemo(() => extractComercioId(orderId), [orderId]);
  const webViewRequested = searchParams.get('view') === 'web';
  const menuHref = derivedComercioId
    ? `/v/${encodeURIComponent(derivedComercioId)}${webViewRequested ? '?view=web' : ''}`
    : null;
  const expectedEmail = useMemo(() => resolveOrderEmail(order), [order]);
  const maskedEmail = useMemo(() => maskEmail(expectedEmail), [expectedEmail]);
  const orderHistory = useMemo(
    () => buildOrderHistory(orderRows, expectedEmail, orderId),
    [expectedEmail, orderId, orderRows],
  );

  useEffect(() => {
    if (!orderId || !isMobileDevice()) {
      return;
    }

    if (webViewRequested) {
      return;
    }

    const appUrl = `elmenuxfa://order/${encodeURIComponent(orderId)}`;
    let pageHidden = false;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pageHidden = true;
      }
    };

    const handlePageHide = () => {
      pageHidden = true;
    };

    setSmartRoutingActive(true);

    const timeoutId = window.setTimeout(() => {
      if (!pageHidden) {
        setSmartRoutingActive(false);
      }
    }, 2000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.location.assign(appUrl);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [orderId, webViewRequested]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      if (!supabaseUrl || !supabaseAnonKey) {
        setError('Faltan variables de entorno de Supabase en Vercel.');
        setLoading(false);
        return;
      }

      if (!orderId) {
        setError('ORDER_ID no valido.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });

        let pedidosQuery = supabase
          .from('pedidos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (derivedComercioId) {
          pedidosQuery = pedidosQuery.eq('comercio_id', derivedComercioId);
        }

        const { data: pedidosRows, error: pedidosError } = await pedidosQuery;
        if (pedidosError) throw new Error(pedidosError.message);

        if (!cancelled) {
          setOrderRows((pedidosRows ?? []) as PedidoRow[]);
        }

        const pedido = (pedidosRows ?? []).find((row) => {
          const detalles = row?.detalles ?? {};
          return detalles?.order_id === orderId;
        }) as PedidoRow | undefined;

        if (!pedido) {
          if (!cancelled) {
            setOrder(null);
            setComercio(null);
          }
          return;
        }

        if (!cancelled) {
          setOrder(pedido);
        }

        if (pedido.comercio_id) {
          const { data: comercioRow } = await supabase
            .from('comercios')
            .select('id,nombre')
            .eq('id', pedido.comercio_id)
            .maybeSingle<ComercioRow>();

          if (!cancelled) {
            setComercio(comercioRow ?? null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error cargando pedido';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOrder();

    return () => {
      cancelled = true;
    };
  }, [derivedComercioId, orderId]);

  useEffect(() => {
    if (!expectedEmail) {
      setEmailVerified(true);
      return;
    }

    setEmailVerified(hasTrustedDevice(order?.comercio_id, expectedEmail));
  }, [expectedEmail, order?.comercio_id]);

  function handleVerifyEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!expectedEmail) {
      setEmailVerified(true);
      return;
    }

    if (normalizeEmail(emailInput) !== expectedEmail) {
      setVerificationError('El correo no coincide con este pedido.');
      return;
    }

    if (rememberDevice) {
      rememberTrustedDevice(order?.comercio_id, expectedEmail);
    }

    setVerificationError(null);
    setEmailVerified(true);
  }

  const items = order?.detalles?.items ?? [];
  const total = order?.detalles?.total ?? order?.total ?? 0;
  const comercioNombre = (comercio?.nombre ?? 'elmenuxfa.com').trim();

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] text-[#F9F3EB]">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[#D7A74D]/50 border-t-[#D7A74D]" />
          <p className="mt-3 text-sm text-[#D8C6AE]">Buscando tu pedido...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] px-6 text-[#F9F3EB]">
        <p className="max-w-md text-center text-sm text-[#E7D5BF]">{error}</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] px-6 text-[#F9F3EB]">
        <section className="max-w-lg rounded-3xl border border-[#D7A74D]/25 bg-[#1A140E] p-8 text-center shadow-xl shadow-black/35">
          <p className="text-lg font-bold text-[#FFEACC]">Tu pedido está en proceso</p>
          <p className="mt-2 text-sm text-[#D8C6AE]">
            Recibimos tu solicitud. Si no ves los detalles aún, intenta recargar en unos segundos.
          </p>
          <p className="mt-4 text-xs tracking-wide text-[#CFAF85]">ORDER_ID: {orderId}</p>
          {menuHref ? (
            <Link
              href={menuHref}
              className="mt-5 inline-flex rounded-full bg-[#1AB15E] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#159650]"
            >
              Volver al menú
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  if (!emailVerified) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] px-4 py-10 text-[#F9F3EB] sm:px-6">
        <section className="w-full max-w-xl rounded-3xl border border-[#D7A74D]/25 bg-[#1A140E] p-6 shadow-2xl shadow-black/35">
          <img
            src="/branding/full_logo.png"
            alt="elmenuxfa.com"
            className="h-10 w-auto object-contain"
          />
          <p className="text-[10px] uppercase tracking-[0.35em] text-[#D7A74D]">Verificación del cliente</p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-[#FFF4E2]">Confirma tu correo</h1>
          <p className="mt-3 text-sm text-[#D8C6AE]">
            Para ver este pedido, escribe el correo con el que realizaste la compra.
          </p>
          <p className="mt-4 rounded-2xl bg-[#120D08] px-4 py-3 text-sm text-[#FFEACC]">
            Pista: {maskedEmail}
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleVerifyEmail}>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[#C9AB83]">
                Correo del cliente
              </span>
              <input
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="tu-correo@ejemplo.com"
                className="w-full rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] px-4 py-3 text-sm text-[#FFF4E2] outline-none placeholder:text-[#8E7D6C]"
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-[#D7A74D]/15 bg-[#120D08] px-4 py-3 text-sm text-[#E9D7C0]">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
                className="mt-1"
              />
              <span>Recordar este dispositivo por 24 horas para futuros pedidos con este correo.</span>
            </label>

            {verificationError ? (
              <p className="text-sm text-[#FF9E8F]">{verificationError}</p>
            ) : null}

            <button
              type="submit"
              className="inline-flex rounded-full bg-[#1AB15E] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#159650]"
            >
              Ver mi pedido
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0F0D0B] px-4 py-10 text-[#F9F3EB] sm:px-6">
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#D7A74D]/25 bg-[#1A140E] p-6 shadow-2xl shadow-black/35">
        <img
          src="/branding/full_logo.png"
          alt="elmenuxfa.com"
          className="h-10 w-auto object-contain"
        />
        {smartRoutingActive ? (
          <div className="mb-5 rounded-2xl border border-[#40D887]/20 bg-[#102116] px-4 py-3 text-sm text-[#DDF8E8]">
            Intentando abrir la app del vendedor. Si no está instalada, seguirás viendo este pedido aquí mismo.
          </div>
        ) : null}
        <p className="text-[10px] uppercase tracking-[0.35em] text-[#D7A74D]">Orden confirmada</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-[#FFF4E2]">{comercioNombre}</h1>
        <p className="mt-2 text-sm text-[#D8C6AE]">ORDER_ID: {orderId}</p>

        <div className="mt-6 rounded-2xl bg-[#120D08] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Estado</p>
          <p className="mt-1 text-lg font-extrabold text-[#FFE8C6]">{order.estado ?? 'pendiente'}</p>
        </div>

        <p className="mt-4 text-xs text-[#D8C6AE]">
          El estado de esta orden solo puede ser actualizado por el vendedor.
        </p>

        <div className="mt-6 space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.nombre ?? 'item'}-${index}`}
              className="flex items-start justify-between rounded-2xl border border-[#D7A74D]/15 bg-[#21170F] px-4 py-3"
            >
              <p className="text-sm font-semibold text-[#FFEACC]">
                x{item.cantidad ?? 1} {item.nombre ?? 'Producto'}
              </p>
              <p className="text-sm font-bold text-[#40D887]">
                {formatCop((item.precio ?? 0) * (item.cantidad ?? 1))}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#D7A74D]/20 bg-[#140F0A] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Total</p>
          <p className="text-xl font-black text-[#FFE5BC]">{formatCop(total)}</p>
        </div>

        {orderHistory.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-[#D7A74D]/20 bg-[#140F0A] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Tu historial reciente</p>
            <div className="mt-3 space-y-3">
              {orderHistory.map((historyItem) => (
                <Link
                  key={historyItem.orderId}
                  href={`/orders/${encodeURIComponent(historyItem.orderId)}${webViewRequested ? '?view=web' : ''}`}
                  className="flex items-center justify-between rounded-2xl border border-[#D7A74D]/10 bg-[#1B140E] px-4 py-3 transition hover:border-[#D7A74D]/30"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#FFF0DC]">{historyItem.orderId}</p>
                    <p className="text-xs text-[#CDB79C]">{historyItem.estado}</p>
                  </div>
                  <p className="text-sm font-bold text-[#40D887]">{formatCop(historyItem.total)}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {menuHref ? (
          <Link
            href={menuHref}
            className="mt-6 inline-flex rounded-full bg-[#1AB15E] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#159650]"
          >
            Seguir comprando
          </Link>
        ) : null}
      </section>
    </main>
  );
}
