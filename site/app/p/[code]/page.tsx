import type { CSSProperties } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import {
  collectComprobanteStorageRefs,
  extractComprobanteObjectPath,
} from '../../api/_lib/comprobante-path';
import { buildPublicComprobanteMediaUrls } from '../../api/_lib/comprobante-media';
import { ComprobanteViewer } from './comprobante-viewer';
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
    comprobantes?: unknown;
    [key: string]: unknown;
  } | null;
};

type ProofItem = {
  index: number;
  label: string;
  fileUrl: string;
  previewUrl: string | null;
  downloadUrl: string;
  isPdf: boolean;
};

async function loadProofs(code: string) {
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

  const refs = collectComprobanteStorageRefs(row.detalles);
  const items: ProofItem[] = [];
  for (let index = 0; index < refs.length; index += 1) {
    const objectPath = extractComprobanteObjectPath(refs[index]);
    if (!objectPath) continue;
    if (!objectPath.startsWith(`${shortLink.comercio_id}/`)) continue;
    const media = buildPublicComprobanteMediaUrls(code, objectPath, index);
    items.push({
      index,
      label: refs.length > 1 ? `Comprobante ${index + 1}` : 'Comprobante de pago',
      fileUrl: media.fileUrl,
      previewUrl: media.previewUrl,
      downloadUrl: media.downloadUrl,
      isPdf: /\.pdf($|\?)/i.test(objectPath),
    });
  }
  if (items.length === 0) return { kind: 'missing' as const };

  return {
    kind: 'ok' as const,
    orderId: shortLink.order_id,
    items,
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

  const proof = await loadProofs(code);
  if (proof.kind === 'rate') {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>Demasiadas solicitudes</h1>
        <p style={textStyle}>Espera un momento e intenta de nuevo.</p>
      </main>
    );
  }
  if (proof.kind === 'missing') notFound();

  return (
    <main style={pageStyle}>
      <div style={columnStyle}>
        <header style={{ marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13, fontWeight: 700 }}>
            {proof.items.length > 1 ? 'Comprobantes de pago' : 'Comprobante de pago'}
          </p>
          <h1 style={{ ...titleStyle, marginTop: 4 }}>{proof.orderId}</h1>
        </header>
        <div style={{ display: 'grid', gap: 18 }}>
          {proof.items.map((item) => (
            <section key={`proof-${item.index}`}>
              {proof.items.length > 1 ? (
                <p
                  style={{
                    margin: '0 0 8px',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </p>
              ) : null}
              <ComprobanteViewer
                orderId={`${proof.orderId}-${item.index + 1}`}
                previewUrl={item.previewUrl}
                fileUrl={item.fileUrl}
                downloadUrl={item.downloadUrl}
                isPdf={item.isPdf}
              />
            </section>
          ))}
        </div>
        <p style={{ ...textStyle, marginTop: 18, textAlign: 'center' }}>
          Este enlace es temporal. Si deja de verse, vuelve a abrirlo desde el mensaje.
        </p>
      </div>
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

const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  margin: '0 auto',
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
