import { notFound } from 'next/navigation';

import {
  allowsLocalOfflineChatbotCommerce,
  LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
} from '../../api/chat/_lib/commerce-auth';
import { loadPublicMenuByIdentifier } from '../../api/menu/_lib/load-public-menu';
import { DevChatbotTruenoClient } from './client';

export const dynamic = 'force-dynamic';

/**
 * Local-only Phase 3.1 visual shell for Pizzas El Trueno while `en_linea=false`.
 * Does not enable public orders. Production → 404.
 */
export default async function DevChatbotTruenoPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  if (
    !allowsLocalOfflineChatbotCommerce({
      commerceId: LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
    })
  ) {
    notFound();
  }

  const menu = await loadPublicMenuByIdentifier('pizzas-el-trueno');
  if (!menu) notFound();

  const comercio = menu.comercio as {
    nombre?: string;
    moneda?: string;
    logo_url?: string | null;
    slug?: string;
  };

  return (
    <DevChatbotTruenoClient
      commerceId={menu.resolvedComercioId}
      slug={String(comercio.slug || 'pizzas-el-trueno')}
      businessName={String(comercio.nombre || 'Pizzas El Trueno')}
      currency={String(comercio.moneda || 'USD')}
      logoUrl={(comercio.logo_url || '').trim() || null}
      products={(menu.productos || []).map((p: any) => ({
        id: String(p.id),
        nombre: String(p.nombre || ''),
        descripcion: (p.descripcion || '').toString(),
        precio: Number(p.precio) || 0,
        disponible: p.disponible !== false,
        opciones_menu: p.opciones_menu ?? null,
        imagen_url: (p.imagen_url || '').toString() || null,
        categoria_id: p.categoria_id ? String(p.categoria_id) : null,
      }))}
      categories={(menu.categorias || []).map((c: any) => ({
        id: String(c.id),
        nombre: String(c.nombre || ''),
        opciones_menu: c.opciones_menu ?? null,
      }))}
    />
  );
}
