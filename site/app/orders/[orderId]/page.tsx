// @ts-nocheck
'use client';

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  estado?: string | null;
  total?: number | null;
  created_at?: string | null;
  detalles?: {
    order_id?: string;
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

export default function OrderDetailsPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = decodeURIComponent(params?.orderId ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PedidoRow | null>(null);
  const [comercio, setComercio] = useState<ComercioRow | null>(null);

  const derivedComercioId = useMemo(() => extractComercioId(orderId), [orderId]);

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

  const items = order?.detalles?.items ?? [];
  const total = order?.detalles?.total ?? order?.total ?? 0;
  const comercioNombre = (comercio?.nombre ?? 'Kosmenu').trim();

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
          {derivedComercioId ? (
            <Link
              href={`/v/${encodeURIComponent(derivedComercioId)}`}
              className="mt-5 inline-flex rounded-full bg-[#1AB15E] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#159650]"
            >
              Volver al menú
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0F0D0B] px-4 py-10 text-[#F9F3EB] sm:px-6">
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#D7A74D]/25 bg-[#1A140E] p-6 shadow-2xl shadow-black/35">
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

        {derivedComercioId ? (
          <Link
            href={`/v/${encodeURIComponent(derivedComercioId)}`}
            className="mt-6 inline-flex rounded-full bg-[#1AB15E] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#159650]"
          >
            Seguir comprando
          </Link>
        ) : null}
      </section>
    </main>
  );
}
