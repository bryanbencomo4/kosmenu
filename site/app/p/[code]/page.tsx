import type { CSSProperties } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { extractComprobanteObjectPath } from '../../api/_lib/comprobante-path';
import {
  COMPROBANTE_SIGNED_URL_TTL_SEC,
  createComprobanteSignedUrl,
} from '../../api/_lib/comprobante-storage';
import { findOrderShortLink } from '../../api/_lib/order-short-links';
import { consumeRateLimit } from '../../api/_lib/rate-limit';
import { getServiceSupabaseClient } from '../../api/_lib/supabase-server';

export const dynamic = 'force-dynamic';

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  detalles?: {
    order_id?: string | null;
    comprobante_url?: string | null;
    [key: string]: unknown;
  } | null;
};

async function loadProof(code: string) {
  const headerStore = await headers();
  const ip =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerStore.get('x-real-ip')?.trim() ||
    'unknown';
  const limit = consumeRateLimit(`comprobante:public:${ip}`, 40, 60_000);
  if (limit.ok === false) {
    return { kind: 'rate' as const };
  }

  const supabase = getServiceSupabaseClient();
  const shortLink = await findOrderShortLink(supabase, code);
  if (!shortLink) return { kind: 'missing' as const };

  const { data: order, error } = await supabase
    .from('pedidos')
    .select('id,comercio_id,detalles')
    .eq('id', shortLink.pedido_id)
    .maybeSingle();
  if (error || !order) return { kind: 'missing' as const };

  const row = order as PedidoRow;
  if (row.comercio_id && row.comercio_id !== shortLink.comercio_id) {
    return { kind: 'missing' as const };
  }

  const storageRef = row.detalles?.comprobante_url ?? null;
  const objectPath = extractComprobanteObjectPath(storageRef);
  if (!objectPath) return { kind: 'missing' as const };
  if (!objectPath.startsWith(`${shortLink.comercio_id}/`)) {
    return { kind: 'missing' as const };
  }

  const expiresIn = Math.min(COMPROBANTE_SIGNED_URL_TTL_SEC, 5 * 60);
  const signedUrl = await createComprobanteSignedUrl(objectPath, expiresIn);
  if (!signedUrl) return { kind: 'unavailable' as const };

  const isPdf = /\.pdf($|\?)/i.test(objectPath) || objectPath.toLowerCase().includes('.pdf');
  return {
    kind: 'ok' as const,
    orderId: shortLink.order_id,
    signedUrl,
    isPdf,
  };
}

export default async function PublicComprobantePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  let code = '';
  try {
    code = decodeURIComponent(rawCode ?? '').trim();
  } catch {
    notFound();
  }

  const proof = await loadProof(code);
  if (proof.kind === 'rate') {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>Demasiadas solicitudes</h1>
        <p style={textStyle}>Espera un momento e intenta de nuevo.</p>
      </main>
    );
  }
  if (proof.kind === 'unavailable') {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>Comprobante no disponible</h1>
        <p style={textStyle}>Intenta más tarde.</p>
      </main>
    );
  }
  if (proof.kind === 'missing') notFound();

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13, fontWeight: 700 }}>
          Comprobante de pago
        </p>
        <h1 style={{ ...titleStyle, marginTop: 4 }}>{proof.orderId}</h1>
      </header>
      {proof.isPdf ? (
        <a href={proof.signedUrl} style={buttonStyle} rel="noopener noreferrer">
          Abrir comprobante PDF
        </a>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proof.signedUrl}
          alt={`Comprobante ${proof.orderId}`}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 720,
            height: 'auto',
            borderRadius: 16,
            background: '#fff',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
          }}
        />
      )}
      <p style={{ ...textStyle, marginTop: 18 }}>
        Este enlace es temporal. Si deja de verse, vuelve a abrirlo desde el mensaje.
      </p>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  margin: 0,
  padding: '24px 16px 40px',
  background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
  color: '#0f172a',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  boxSizing: 'border-box',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.02em',
};

const textStyle: CSSProperties = {
  margin: '8px 0 0',
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.5,
};

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 48,
  padding: '0 18px',
  borderRadius: 14,
  background: '#0f172a',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
};
