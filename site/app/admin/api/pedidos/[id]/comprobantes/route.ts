import { NextResponse } from 'next/server';
import { z } from 'zod';

import { publicSiteUrl } from '../../../../../_lib/public-site-config';
import {
  collectComprobanteStorageRefs,
  extractComprobanteObjectPath,
} from '../../../../../api/_lib/comprobante-path';
import { findOrderShortLinkByPedidoId } from '../../../../../api/_lib/order-short-links';
import {
  COMPROBANTE_SIGNED_URL_TTL_SEC,
  createComprobanteSignedUrl,
  planComprobanteView,
} from '../../../../../api/_lib/comprobante-storage';
import { getServiceSupabaseClient } from '../../../../../api/_lib/supabase-server';
import { requireAdminPermission } from '../../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PedidoDetalles = {
  order_id?: string | null;
  comprobante_url?: string | null;
  comprobante_public_url?: string | null;
  comprobantes?: unknown;
  [key: string]: unknown;
};

export async function GET(_request: Request, context: RouteContext) {
  await requireAdminPermission('orders.read');
  const { id } = await context.params;

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de pedido invalido.' }, { status: 400 });
  }

  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('pedidos')
      .select('id,comercio_id,detalles')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.id) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }

    const row = data as {
      id: string;
      comercio_id?: string | null;
      detalles?: PedidoDetalles | null;
    };
    const detalles = row.detalles ?? {};
    const comercioId = (row.comercio_id ?? '').trim();
    const publicOrderId =
      typeof detalles.order_id === 'string' ? detalles.order_id.trim() : row.id;

    const items: Array<{
      index: number;
      label: string;
      url: string;
      downloadUrl: string | null;
      isPdf: boolean;
    }> = [];

    const refs = collectComprobanteStorageRefs(detalles);
    for (let index = 0; index < refs.length; index += 1) {
      const objectPath = extractComprobanteObjectPath(refs[index]);
      if (!objectPath) continue;
      if (comercioId && !objectPath.startsWith(`${comercioId}/`)) continue;

      const plan = planComprobanteView(objectPath, publicOrderId);
      const [fileUrl, downloadUrl] = await Promise.all([
        createComprobanteSignedUrl(objectPath, COMPROBANTE_SIGNED_URL_TTL_SEC),
        createComprobanteSignedUrl(objectPath, COMPROBANTE_SIGNED_URL_TTL_SEC, {
          downloadName: plan.downloadName,
        }),
      ]);
      if (!fileUrl) continue;

      items.push({
        index,
        label: refs.length > 1 ? `Comprobante ${index + 1}` : 'Comprobante',
        url: fileUrl,
        downloadUrl,
        isPdf: /\.pdf($|\?)/i.test(objectPath),
      });
    }

    let publicUrl: string | null = null;
    const storedPublic =
      typeof detalles.comprobante_public_url === 'string'
        ? detalles.comprobante_public_url.trim()
        : '';
    if (storedPublic.startsWith('http')) {
      publicUrl = storedPublic;
    } else {
      try {
        const service = getServiceSupabaseClient();
        const shortLink = await findOrderShortLinkByPedidoId(service, row.id);
        if (shortLink?.code) {
          publicUrl = `${publicSiteUrl}/p/${encodeURIComponent(shortLink.code)}`;
        }
      } catch {
        publicUrl = null;
      }
    }

    // Legacy: direct http URL stored as comprobante_url (no storage ref).
    if (items.length === 0) {
      const legacy = typeof detalles.comprobante_url === 'string'
        ? detalles.comprobante_url.trim()
        : '';
      if (legacy.startsWith('http')) {
        items.push({
          index: 0,
          label: 'Comprobante',
          url: legacy,
          downloadUrl: legacy,
          isPdf: /\.pdf($|\?)/i.test(legacy),
        });
      }
    }

    if (items.length === 0 && !publicUrl) {
      return NextResponse.json(
        { error: 'Este pedido no tiene comprobante disponible.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        expiresInSec: COMPROBANTE_SIGNED_URL_TTL_SEC,
        publicUrl,
        items,
      },
    });
  } catch (error) {
    console.error('[admin comprobantes]', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo abrir el comprobante.',
      },
      { status: 500 },
    );
  }
}
