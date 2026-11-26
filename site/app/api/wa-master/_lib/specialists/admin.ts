import type { WaHandoffStore } from '../../../_lib/wa-handoff';
import type { WaMasterAuthGate } from '../auth';
import { unauthorizedAdminMessage } from '../auth';
import type { WaMasterConfig } from '../config';
import { issueMasterHandoff } from '../handoff';
import { buildHandoffContextFromMemory } from '../knowledge/handoff-context';
import { buildPublicMenuLinks, formatMenuLinksReply } from '../menu-links';
import type {
  WaMasterAdminProposal,
  WaMasterIdentity,
  WaMasterMemory,
} from '../types';

export type WaMasterMenuSnapshot = {
  comercioId: string;
  publicName: string;
  currencyLabel: string | null;
  exchangeRate: string | null;
  products: Array<{
    id: string;
    nombre: string;
    precio: number | null;
    disponible: boolean | null;
    categoria: string | null;
  }>;
  openLabel: string | null;
  permiteDelivery: boolean | null;
};

export type AdminMenuLoader = (comercioId: string) => Promise<WaMasterMenuSnapshot | null>;

export type AdminSpecialistResult = {
  replies: string[];
  toolsUsed: string[];
  memoryPatch: Partial<WaMasterMemory['summary']>;
  escalateHuman?: boolean;
  skipGeminiPolish?: boolean;
};

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveComercioId(identity: WaMasterIdentity, memory: WaMasterMemory): string | null {
  if (memory.summary.selectedComercioId) return memory.summary.selectedComercioId;
  if (identity.comercios.length === 1) return identity.comercios[0].comercioId;
  return null;
}

function parsePriceIntent(text: string): { productHint: string; price: string } | null {
  const m = text.match(
    /(?:precio|pon|cambia(?:r)?|actualiza(?:r)?).*?(?:de\s+)?(.+?)\s+(?:a|en|=)\s*(\d+[.,]?\d*)\s*(?:usd|dolares?|\$)?/i,
  );
  if (!m) return null;
  return { productHint: m[1].trim().slice(0, 80), price: m[2].replace(',', '.') };
}

export async function runAdminSpecialist(params: {
  text: string;
  intent: string;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  authGate: WaMasterAuthGate;
  loadMenu: AdminMenuLoader;
  nowMs: number;
  handoffStore?: WaHandoffStore;
}): Promise<AdminSpecialistResult> {
  const { text, intent, identity, memory, config, authGate, loadMenu, nowMs } = params;
  const t = fold(text);
  const toolsUsed: string[] = [];

  // Public menu links are safe to answer in WhatsApp (no admin privilege).
  const linkIntentEarly =
    intent === 'admin.menu_links' ||
    (/\b(enlace|link|url)\b/.test(t) && /\b(menu|menú|qr|delivery|pedido)\b/.test(t)) ||
    /\b(pasame|pásame|envia|envía|manda|necesito).*(enlace|link|menu|menú|qr|delivery)\b/.test(t) ||
    /\blos dos enlaces\b/.test(t);

  // Receptionist: never run admin writes in WhatsApp — hand off with context.
  // Exception: public menu/QR/delivery link requests (read-only URLs).
  if (
    config.receptionistMode &&
    !linkIntentEarly &&
    (intent.startsWith('admin') ||
      /\b(precio|tasa|producto|horarios|disponib|agregar|cambiar)\b/.test(t))
  ) {
    const candidate =
      memory.summary.selectedComercioId ||
      (identity.comercios.length === 1 ? identity.comercios[0].comercioId : null);
    const shopName =
      identity.comercios.find((c) => c.comercioId === candidate)?.publicName || null;
    const handoff = await issueMasterHandoff({
      store: params.handoffStore,
      config,
      destination: 'business_assistant',
      fromDigits: identity.fromDigits,
      nowMs,
      payload: buildHandoffContextFromMemory({
        memory,
        identity,
        text,
        intent: intent.startsWith('admin') ? intent : 'admin.edit_price',
        pendingOperation:
          intent === 'admin.edit_price' || /\bprecio\b/.test(t) ? 'edit_price' : 'admin_help',
        comercioId: candidate,
        profile: 'business',
        extra: {
          candidateComercioId: candidate,
          conversationHint: text.trim().slice(0, 160),
        },
      }),
    });
    if (handoff) {
      const known = shopName
        ? `Te ayudo con tu menú${shopName ? ` (*${shopName}*)` : ''}. 😊\n\n`
        : '¡Claro! 😊 ';
      return {
        replies: [
          `${known}Nuestro asistente para negocios puede continuar contigo. Al abrirlo verificaremos tu cuenta de forma segura:\n${handoff.url}`,
        ],
        toolsUsed: ['handoff_business'],
        memoryPatch: {
          selectedComercioId: candidate,
          activeService: 'admin',
          lastHandoffUrl: handoff.url,
          lastHandoffAtMs: nowMs,
        },
        skipGeminiPolish: true,
      };
    }
  }

  if (!identity.comercios.length) {
    return {
      replies: [
        `No tengo un negocio verificado ligado a este WhatsApp como dueño. El número público de un local no prueba propiedad.\n\nSi ya tienes cuenta: ${config.businessManageUrl}`,
      ],
      toolsUsed: ['admin_identity_gate'],
      memoryPatch: {},
      skipGeminiPolish: true,
    };
  }

  if (identity.comercios.length > 1 && !memory.summary.selectedComercioId) {
    const list = identity.comercios.map((c) => `• ${c.publicName}`).join('\n');
    return {
      replies: [
        `Hay varios negocios asociados a este número (coincidencia telefónica, no autorización):\n${list}\n\n¿Cuál quieres consultar?`,
      ],
      toolsUsed: ['admin_select_comercio'],
      memoryPatch: { pendingQuestion: 'comercio_select' },
    };
  }

  // Select by name
  let comercioId = resolveComercioId(identity, memory);
  if (!comercioId) {
    const hit = identity.comercios.find((c) => t.includes(fold(c.publicName)));
    if (hit) comercioId = hit.comercioId;
  }
  if (!comercioId) {
    return {
      replies: ['Dime el nombre del negocio para continuar.'],
      toolsUsed: [],
      memoryPatch: { pendingQuestion: 'comercio_select' },
    };
  }

  const shop = identity.comercios.find((c) => c.comercioId === comercioId)!;
  const memoryPatch: Partial<WaMasterMemory['summary']> = {
    selectedComercioId: comercioId,
    activeService: 'admin',
  };

  // Confirm pending proposal — require explicit confirmo (not loose dale/ok/sí).
  if (
    memory.summary.pendingAdminProposal &&
    /\b(confirmo|confirmado)\b/.test(t)
  ) {
    const proposal = memory.summary.pendingAdminProposal;
    const session = await authGate.getSession(identity.fromDigits, proposal.comercioId, nowMs);
    if (!session?.authorized) {
      return {
        replies: [unauthorizedAdminMessage(config.businessManageUrl)],
        toolsUsed: ['admin_auth_required'],
        memoryPatch: { ...memoryPatch, pendingAdminProposal: proposal },
      };
    }
    // Even with auth, write API is not armed in this sprint — honest pending.
    return {
      replies: [
        `Tienes verificación activa, pero la API segura de escritura por WhatsApp aún no está armada en Preview.\n\nPropuesta pendiente: ${proposal.label}\nActual: ${proposal.currentValue ?? '—'}\nNuevo: ${proposal.proposedValue}\n\nComplétalo en el panel: ${config.businessManageUrl}`,
      ],
      toolsUsed: ['admin_write_pending_backend'],
      memoryPatch: { ...memoryPatch, pendingAdminProposal: null, proposedAction: 'write_api_pending' },
    };
  }

  const snapshot = await loadMenu(comercioId);
  toolsUsed.push('admin_read_menu');

  if (!snapshot) {
    return {
      replies: [
        `No pude cargar el menú público de *${shop.publicName}* ahora. Prueba el panel: ${config.businessManageUrl}`,
      ],
      toolsUsed,
      memoryPatch,
    };
  }

  // Public menu / QR / delivery links (never app.elmenuxfa.com admin URLs).
  const wantsLinks =
    intent === 'admin.menu_links' ||
    /\b(enlace|link|url)\b/.test(t) &&
      /\b(menu|menú|qr|delivery|pedido|pedidos)\b/.test(t) ||
    /\b(pasame|pásame|envia|envía|manda|necesito).*(enlace|link|menu|menú|qr|delivery)\b/.test(t) ||
    /\blos dos enlaces\b/.test(t) ||
    /\benlace(s)? de mi (menu|menú)\b/.test(t);

  if (wantsLinks && shop.slug) {
    const links = buildPublicMenuLinks({
      slug: shop.slug,
      permiteDelivery: snapshot.permiteDelivery,
    });
    const which =
      /\bqr\b/.test(t) && !/\bdelivery\b/.test(t) && !/\bpedido/.test(t)
        ? 'qr'
        : /\b(delivery|pedido)/.test(t) && !/\bqr\b/.test(t)
          ? 'orders'
          : /\b(dos|ambos|los enlaces)\b/.test(t)
            ? 'both'
            : /\bqr\b/.test(t) && /\b(delivery|pedido)/.test(t)
              ? 'both'
              : 'both';
    return {
      replies: [
        formatMenuLinksReply({
          businessName: shop.publicName,
          links,
          which: which as 'qr' | 'orders' | 'both' | 'menu',
        }),
      ],
      toolsUsed: [...toolsUsed, 'admin_public_menu_links'],
      memoryPatch,
      skipGeminiPolish: true,
    };
  }

  if (wantsLinks && !shop.slug) {
    return {
      replies: [
        `Tengo *${shop.publicName}* ligado, pero aún no confirmo su slug público. Revisa el panel: ${config.businessManageUrl}`,
      ],
      toolsUsed,
      memoryPatch,
      skipGeminiPolish: true,
    };
  }

  // How to upload products — guide + optional business assistant handoff.
  if (/\b(subo|subir|cargar|agregar).*(producto|productos|menu|menú)\b/.test(t) || /\bcomo (hago|hago para) subir\b/.test(t)) {
    const handoff = await issueMasterHandoff({
      store: params.handoffStore,
      config,
      destination: 'business_assistant',
      fromDigits: identity.fromDigits,
      nowMs,
      payload: buildHandoffContextFromMemory({
        memory,
        identity,
        text,
        intent: 'admin.edit_product',
        pendingOperation: 'edit_products',
        comercioId,
        profile: 'business',
        extra: {
          candidateComercioId: comercioId,
          conversationHint: text.trim().slice(0, 160),
        },
      }),
    });
    const base =
      `Para subir productos de *${shop.publicName}* entra al panel de elmenuxfa.com, abre tu negocio y usa la gestión de productos del menú.\n\nPanel: ${config.businessManageUrl}`;
    if (handoff) {
      return {
        replies: [
          `${base}\n\nTambién puedes continuar con el asistente para negocios (verificaremos tu cuenta):\n${handoff.url}`,
        ],
        toolsUsed: [...toolsUsed, 'handoff_business', 'admin_upload_guide'],
        memoryPatch: {
          ...memoryPatch,
          lastHandoffUrl: handoff.url,
          lastHandoffAtMs: nowMs,
        },
        skipGeminiPolish: true,
      };
    }
    return {
      replies: [base],
      toolsUsed: [...toolsUsed, 'admin_upload_guide'],
      memoryPatch,
      skipGeminiPolish: true,
    };
  }

  // Price change propose (before FX — "6 dólares" is not an FX update)
  const priceIntent = parsePriceIntent(text);
  if (intent === 'admin.edit_price' || priceIntent) {
    const hint = fold(priceIntent?.productHint || text);
    const product =
      snapshot.products.find((p) => fold(p.nombre).includes(hint.split(/\s+/)[0] || '')) ||
      snapshot.products.find((p) => hint.includes(fold(p.nombre))) ||
      null;
    const current = product ? String(product.precio ?? '—') : null;
    const proposed = priceIntent?.price || '?';
    const proposal: WaMasterAdminProposal = {
      comercioId,
      action: 'edit_price',
      label: product ? `Precio de ${product.nombre}` : 'Cambio de precio',
      currentValue: current,
      proposedValue: proposed,
      requiresAuth: true,
    };
    const session = await authGate.getSession(identity.fromDigits, comercioId, nowMs);
    if (!session?.authorized) {
      return {
        replies: [
          product
            ? `*${product.nombre}* está en ${current}.\n\n¿Quieres proponer ${proposed}? Aun así: ${unauthorizedAdminMessage(config.businessManageUrl)}`
            : `No ubiqué el producto en el menú público. ${unauthorizedAdminMessage(config.businessManageUrl)}`,
        ],
        toolsUsed: [...toolsUsed, 'admin_price_propose'],
        memoryPatch: { ...memoryPatch, pendingAdminProposal: proposal },
      };
    }
    return {
      replies: [
        product
          ? `Propuesta: *${product.nombre}* de ${current} → ${proposed}. Responde *confirmo* para intentar el cambio seguro (si la API de escritura está armada).`
          : 'Indica el nombre exacto del producto y el nuevo precio.',
      ],
      toolsUsed: [...toolsUsed, 'admin_price_propose'],
      memoryPatch: { ...memoryPatch, pendingAdminProposal: proposal },
    };
  }

  // FX consult
  if (
    intent === 'admin.fx' ||
    (/\b(tasa|bcv|cambio)\b/.test(t) && !/\b\d+[.,]?\d*\s*dolares?\b/.test(t)) ||
    (/\bdolar\b/.test(t) && /\b(tasa|cambio|bcv)\b/.test(t))
  ) {
    const wantsChange = /\b(actualiza|cambia|pon|modifica)\b/.test(t);
    if (wantsChange) {
      const proposal: WaMasterAdminProposal = {
        comercioId,
        action: 'set_fx',
        label: 'Actualizar tasa de cambio',
        currentValue: snapshot.exchangeRate,
        proposedValue: 'valor indicado por el usuario (pendiente parseo seguro)',
        requiresAuth: true,
      };
      const session = await authGate.getSession(identity.fromDigits, comercioId, nowMs);
      if (!session?.authorized) {
        return {
          replies: [
            `Tasa configurada actual: ${snapshot.exchangeRate ?? 'no publicada en menú público'}.\n\nPara modificarla: ${unauthorizedAdminMessage(config.businessManageUrl)}`,
          ],
          toolsUsed: [...toolsUsed, 'admin_fx_propose'],
          memoryPatch: { ...memoryPatch, pendingAdminProposal: proposal },
        };
      }
      return {
        replies: [
          `Tasa actual: ${snapshot.exchangeRate ?? '—'}. Confirma el valor exacto y dime *confirmo* — la escritura segura aún se completa en panel si la API WA no está armada.`,
        ],
        toolsUsed: [...toolsUsed, 'admin_fx_propose'],
        memoryPatch: { ...memoryPatch, pendingAdminProposal: proposal },
      };
    }
    return {
      replies: [
        `*${snapshot.publicName}*\nMoneda/tasa visible: ${snapshot.exchangeRate ?? snapshot.currencyLabel ?? 'no confirmada en menú público'}.\nNo invento tasas de mercado.`,
      ],
      toolsUsed,
      memoryPatch,
    };
  }

  // Availability / delivery
  if (intent === 'admin.availability' || intent === 'admin.delivery') {
    return {
      replies: [
        `*${snapshot.publicName}*\nDelivery (dato público): ${snapshot.permiteDelivery == null ? 'no confirmado' : snapshot.permiteDelivery ? 'activo' : 'inactivo'}.\nProductos agotados (disponible=false): ${
          snapshot.products.filter((p) => p.disponible === false).length
        }.\n\nPara cambiarlo con seguridad: ${config.businessManageUrl}`,
      ],
      toolsUsed,
      memoryPatch,
    };
  }

  // Default view menu
  const sample = snapshot.products.slice(0, 8)
    .map((p) => `• ${p.nombre}${p.precio != null ? ` — ${p.precio}` : ''}${p.disponible === false ? ' (agotado)' : ''}`)
    .join('\n');
  return {
    replies: [
      `Menú de *${snapshot.publicName}* (lectura pública):\n${sample || 'Sin productos visibles.'}\n\nHorario: ${snapshot.openLabel ?? 'no confirmado'}.\nCambios: ${config.businessManageUrl}`,
    ],
    toolsUsed,
    memoryPatch,
  };
}
