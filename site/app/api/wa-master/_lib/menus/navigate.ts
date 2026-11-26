import type { WaHandoffPayload, WaHandoffStore } from '../../../_lib/wa-handoff';
import type { WaMasterConfig } from '../config';
import { issueMasterHandoff } from '../handoff';
import { buildPublicMenuLinks, formatMenuLinksReply } from '../menu-links';
import type {
  WaMasterIdentity,
  WaMasterIntent,
  WaMasterMemory,
  WaMasterSpecialist,
} from '../types';
import { formatConsumerOrderGuide } from '../specialists/consumer';
import { buildMenuText, invalidChoiceReply, rootMenuIdForProfile } from './copy';
import { resolveMenuProfile } from './profile';
import { WA_MENU_STALE_MS, type WaMenuId, type WaMenuProfile } from './types';

export type SmartMenuResult = {
  handled: boolean;
  replies: string[];
  memoryPatch: Partial<WaMasterMemory['summary']>;
  escalateHuman: boolean;
  specialist: WaMasterSpecialist;
  intents: WaMasterIntent[];
  toolsUsed: string[];
  skipGeminiPolish: boolean;
  /** Delegate remaining turn to an existing specialist after menu routing. */
  delegate?: {
    specialist: WaMasterSpecialist;
    intent: WaMasterIntent;
  };
};

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Parse leading menu digit 0–9 (also emoji digits). */
export function parseMenuDigit(text: string): number | null {
  const t = text.trim();
  const map: Record<string, number> = {
    '0️⃣': 0,
    '1️⃣': 1,
    '2️⃣': 2,
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
  };
  for (const [k, v] of Object.entries(map)) {
    if (t === k || t.startsWith(k)) return v;
  }
  const m = t.match(/^([0-9])(?:\b|[.)\-\s]|$)/);
  if (m) return Number(m[1]);
  return null;
}

export function isUniversalBack(text: string): boolean {
  const t = fold(text);
  return (
    /^(0|volver|atras|atrás|inicio|menu|menú|menu principal|menú principal|empezar de nuevo|otra opcion|otra opción)$/.test(
      t,
    ) || /\b(volver al (menu|menú)|ir al inicio)\b/.test(t)
  );
}

export function isUniversalHuman(text: string): boolean {
  const t = fold(text);
  return (
    /^(9)$/.test(t.trim()) ||
    /\b(hablar con (un |una )?(asesor|persona|humano|agente|alguien)|quiero (un )?humano|atencion humana|atención humana|necesito ayuda humana)\b/.test(
      t,
    ) ||
    t === 'humano' ||
    t === 'asesor'
  );
}

export function isUniversalSupport(text: string): boolean {
  const t = fold(text);
  if (/^(8)$/.test(t.trim())) return true;
  if (
    /\b(reportar (un )?problema|tengo un problema|no me funciona|soporte|incidencia)\b/.test(t)
  ) {
    return true;
  }
  // Bare "ayuda" must not steal food/register intents ("necesito ayuda para pedir pizza").
  if (/\b(necesito ayuda|ayuda)\b/.test(t)) {
    if (
      /\b(pedir|delivery|domicilio|pizza|hamburg|sushi|arepa|restaurante|registrar|crear.*(menu|menú)|negocio|precio|menu|menú)\b/.test(
        t,
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function navFromSummary(memory: WaMasterMemory, profile: WaMenuProfile, nowMs: number) {
  const menuId = (memory.summary.menuId as WaMenuId | null | undefined) ?? null;
  const menuProfile = (memory.summary.menuProfile as WaMenuProfile | undefined) || profile;
  const menuUpdatedAtMs = memory.summary.menuUpdatedAtMs || 0;
  const stale = !menuId || nowMs - menuUpdatedAtMs > WA_MENU_STALE_MS;
  return {
    menuId: stale ? null : menuId,
    menuProfile: stale ? profile : menuProfile,
    misunderstandCount: memory.summary.misunderstandCount || 0,
    supportIssueText: memory.summary.supportIssueText ?? null,
    stale,
  };
}

function patchMenu(
  menuId: WaMenuId,
  profile: WaMenuProfile,
  nowMs: number,
  extra?: Partial<WaMasterMemory['summary']>,
): Partial<WaMasterMemory['summary']> {
  return {
    menuId,
    menuProfile: profile,
    menuUpdatedAtMs: nowMs,
    misunderstandCount: 0,
    ...extra,
  };
}

async function businessHandoff(
  config: WaMasterConfig,
  fromDigits: string,
  handoffStore: WaHandoffStore | undefined,
  nowMs: number,
  payload: WaHandoffPayload,
  label: string,
): Promise<string> {
  const fallback = config.businessAssistantUrl || 'https://app.elmenuxfa.com/asistente';
  const issued = await issueMasterHandoff({
    store: handoffStore,
    config,
    fromDigits,
    destination: 'business_assistant',
    payload,
    nowMs,
  });
  if (!issued?.url) {
    return `${label}\n\nContinúa aquí (inicia sesión si te lo pide):\n${fallback}`;
  }
  return `${label}\n\n${issued.url}`;
}

async function consumerHandoff(
  config: WaMasterConfig,
  fromDigits: string,
  handoffStore: WaHandoffStore | undefined,
  nowMs: number,
  payload: WaHandoffPayload,
  label: string,
): Promise<string> {
  void label;
  const fallback =
    config.consumerAssistantUrl || 'https://elmenuxfa.com/asistente?ref=wa';
  const issued = await issueMasterHandoff({
    store: handoffStore,
    config,
    fromDigits,
    destination: 'consumer_discovery',
    payload,
    nowMs,
  });
  return formatConsumerOrderGuide({
    assistantUrl: fallback,
    handoffUrl: issued?.url ?? null,
    zone: typeof payload.zone === 'string' ? payload.zone : null,
    queryHint: typeof payload.query === 'string' ? payload.query : null,
  });
}

function primaryComercio(identity: WaMasterIdentity, memory: WaMasterMemory) {
  const selected = memory.summary.selectedComercioId;
  if (selected) {
    const hit = identity.comercios.find((c) => c.comercioId === selected);
    if (hit) return hit;
  }
  return identity.comercios[0] || null;
}

/**
 * Smart menu layer — runs before specialists when it can resolve the turn.
 */
export async function tryHandleSmartMenu(params: {
  text: string;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  nowMs: number;
  fromDigits: string;
  handoffStore?: WaHandoffStore;
  /** When true, coverage copy uses "En unos momentos". */
  fastHumanCoverage?: boolean;
}): Promise<SmartMenuResult> {
  const { text, identity, memory, config, nowMs, fromDigits } = params;
  const profile = resolveMenuProfile(identity, memory);
  const nav = navFromSummary(memory, profile, nowMs);
  const comercio = primaryComercio(identity, memory);
  const businessName = comercio?.publicName || memory.summary.signupDraft?.businessName || null;
  const digit = parseMenuDigit(text);
  const t = fold(text);

  const showRoot = (p: WaMenuProfile = profile): SmartMenuResult => {
    const menuId = rootMenuIdForProfile(p);
    return {
      handled: true,
      replies: [buildMenuText(menuId, { businessName })],
      memoryPatch: patchMenu(menuId, p, nowMs, {
        pendingQuestion: null,
        supportIssueText: null,
      }),
      escalateHuman: false,
      specialist: 'orchestrator',
      intents: ['greeting'],
      toolsUsed: ['smart_menu'],
      skipGeminiPolish: true,
    };
  };

  // --- Universal free-text / digits (even during pending questions) ---
  if (isUniversalHuman(text) || digit === 9) {
    // Copy is decided AFTER durable/inbox registration in process.ts.
    return {
      handled: true,
      replies: [],
      memoryPatch: {
        ...patchMenu(nav.menuId || rootMenuIdForProfile(profile), profile, nowMs),
        pendingQuestion: null,
        humanIntervened: true,
      },
      escalateHuman: true,
      specialist: 'support',
      intents: ['support.human'],
      toolsUsed: ['smart_menu', 'escalate_human'],
      skipGeminiPolish: true,
    };
  }

  if (isUniversalSupport(text) || digit === 8) {
    // If they already described a problem, keep the text and open support menu lightly.
    const issueHint =
      digit === 8 || /^(8|reportar)/i.test(text.trim())
        ? nav.supportIssueText
        : text.trim().slice(0, 400);
    return {
      handled: true,
      replies: [buildMenuText('support_issue')],
      memoryPatch: patchMenu('support_issue', profile, nowMs, {
        supportIssueText: issueHint || nav.supportIssueText,
        pendingQuestion: null,
      }),
      escalateHuman: false,
      specialist: 'support',
      intents: ['support.issue'],
      toolsUsed: ['smart_menu', 'support_menu'],
      skipGeminiPolish: true,
    };
  }

  if (isUniversalBack(text) || digit === 0) {
    return showRoot(profile);
  }

  // Greeting-only / "menú" / empty → re-open profile root (even if menuId set).
  // Keep this STRICT: "hola, quiero delivery" must reach consumer CTAs, not root.
  // Bare hi: prefer registered welcome when a shop is phone-linked (don't stick on
  // a previous consumer search greeting).
  if (
    digit === null &&
    (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi|hello)([!?.\s]*)$/.test(t) ||
      t === 'menu' ||
      t === 'menú' ||
      !t)
  ) {
    const greetProfile =
      (identity.comercios?.length || 0) > 0 && profile === 'consumer' ? 'registered' : profile;
    return showRoot(greetProfile);
  }

  // Stale digit: do not apply old menu meaning — show current root.
  if (digit !== null && nav.stale) {
    return {
      handled: true,
      replies: [
        'Retomemos desde el menú actual 😊\n\n' +
          buildMenuText(rootMenuIdForProfile(profile), { businessName }),
      ],
      memoryPatch: patchMenu(rootMenuIdForProfile(profile), profile, nowMs),
      escalateHuman: false,
      specialist: 'orchestrator',
      intents: ['greeting'],
      toolsUsed: ['smart_menu', 'stale_menu_reset'],
      skipGeminiPolish: true,
    };
  }

  // Free-text clear intents without forcing the root walk.
  if (digit === null && !nav.menuId) {
    const looksMerchantEdit =
      /\b(precio|tasa|tarif|agotado|disponible|agregar|editar|modificar)\b/.test(t) ||
      /\b(cambia(?:r)?|actualiza(?:r)?|pon(?:er)?)\s+(el\s+)?precio\b/.test(t) ||
      /\bprecio de\b/.test(t);
    const looksRegister =
      /\b(registrar|crear.*(menu|menú)|poner mi negocio|planes|precios del servicio|mi (propio )?restaurante)\b/.test(
        t,
      ) || /\bregistrar\b.*\b(restaurante|negocio|menu|menú)\b/.test(t);
    // Commercial first — "registrar mi restaurante" must not become consumer.search.
    if (looksRegister) {
      return {
        handled: true,
        replies: [],
        memoryPatch: patchMenu('root_prospect', 'prospect', nowMs),
        escalateHuman: false,
        specialist: 'commercial',
        intents: [/\bplanes|precio/.test(t) ? 'commercial.pricing' : 'commercial.register'],
        toolsUsed: ['smart_menu', 'intent_shortcut'],
        skipGeminiPolish: false,
        delegate: {
          specialist: 'commercial',
          intent: /\bplanes|precio/.test(t) ? 'commercial.pricing' : 'commercial.register',
        },
      };
    }
    if (
      !looksMerchantEdit &&
      (/\b(pedir|comida|delivery|domicilio|hamburguesa|pizza|arepa|restaurantes)\b/.test(t) ||
        /\b(buscar|busco|quiero|pido|necesito).{0,24}restaurante\b/.test(t))
    ) {
      return {
        handled: true,
        replies: [],
        memoryPatch: patchMenu('root_consumer', 'consumer', nowMs, {
          zone: null,
          lastRestaurants: [],
        }),
        escalateHuman: false,
        specialist: 'consumer',
        intents: ['consumer.search'],
        toolsUsed: ['smart_menu', 'intent_shortcut'],
        skipGeminiPolish: false,
        delegate: { specialist: 'consumer', intent: 'consumer.search' },
      };
    }
  }

  const menuId = nav.menuId;
  if (digit === null || !menuId) {
    // Ambiguous while in a menu: one clarify + current options (avoid "no entendí" loops).
    if (menuId && text.trim().length > 0 && text.trim().length < 120) {
      const count = (nav.misunderstandCount || 0) + 1;
      if (count >= 3) {
        return {
          handled: true,
          replies: [
            'No quiero que te quedes trabado 🙏\n\nPuedes escribir *8* para reportar el problema o *9* para hablar con un asesor.\n\n' +
              buildMenuText(menuId, { businessName }),
          ],
          memoryPatch: {
            ...patchMenu(menuId, profile, nowMs),
            misunderstandCount: count,
          },
          escalateHuman: false,
          specialist: 'orchestrator',
          intents: ['unknown'],
          toolsUsed: ['smart_menu', 'clarify'],
          skipGeminiPolish: true,
        };
      }
      // Let Gemini / specialists try free questions; do not hard-handle.
      return {
        handled: false,
        replies: [],
        memoryPatch: { misunderstandCount: count, menuUpdatedAtMs: nowMs },
        escalateHuman: false,
        specialist: 'orchestrator',
        intents: ['unknown'],
        toolsUsed: [],
        skipGeminiPolish: false,
      };
    }
    return {
      handled: false,
      replies: [],
      memoryPatch: {},
      escalateHuman: false,
      specialist: 'orchestrator',
      intents: ['unknown'],
      toolsUsed: [],
      skipGeminiPolish: false,
    };
  }

  // --- Digit selection on active menu ---
  const choose = async (): Promise<SmartMenuResult> => {
    switch (menuId) {
      case 'root_unknown': {
        if (digit === 1) {
          return {
            handled: true,
            replies: [buildMenuText('root_consumer')],
            memoryPatch: patchMenu('root_consumer', 'consumer', nowMs),
            escalateHuman: false,
            specialist: 'consumer',
            intents: ['consumer.search'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 2) {
          return {
            handled: true,
            replies: [buildMenuText('root_prospect')],
            memoryPatch: patchMenu('root_prospect', 'prospect', nowMs),
            escalateHuman: false,
            specialist: 'commercial',
            intents: ['commercial.register'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 3) {
          return {
            handled: true,
            replies: [buildMenuText('root_registered', { businessName })],
            memoryPatch: patchMenu('root_registered', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.view_menu'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 4) {
          return {
            handled: true,
            replies: [],
            memoryPatch: patchMenu('root_prospect', 'prospect', nowMs),
            escalateHuman: false,
            specialist: 'commercial',
            intents: ['commercial.info'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: false,
            delegate: { specialist: 'commercial', intent: 'commercial.info' },
          };
        }
        break;
      }
      case 'root_consumer': {
        if (digit === 1 || digit === 2 || digit === 3 || digit === 5) {
          const label =
            digit === 3
              ? 'Busquemos restaurantes cerca de ti 📍'
              : digit === 5
                ? 'Dime qué comida buscas 🍽️'
                : 'Vamos a buscar opciones para pedir 🛵';
          const reply = await consumerHandoff(
            config,
            fromDigits,
            params.handoffStore,
            nowMs,
            {
              intent: digit === 5 ? 'product_search' : 'restaurant_search',
              // Do not pass stale memory.zone — web assistant asks for location.
              zone: null,
              query: digit === 5 ? text : null,
            },
            label,
          );
          return {
            handled: true,
            replies: [
              reply +
                '\n\n0️⃣ Menú principal · 8️⃣ Reportar problema · 9️⃣ Hablar con asesor',
            ],
            memoryPatch: patchMenu('root_consumer', 'consumer', nowMs, {
              lastHandoffAtMs: nowMs,
            }),
            escalateHuman: false,
            specialist: 'consumer',
            intents: ['consumer.search'],
            toolsUsed: ['smart_menu', 'consumer_handoff'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 4) {
          return {
            handled: true,
            replies: [
              'Cuéntame el detalle del pedido (número, restaurante o qué falló) y te ayudo. 😊\n\nTambién puedes escribir *9* si prefieres un asesor.',
            ],
            memoryPatch: patchMenu('root_consumer', 'consumer', nowMs, {
              pendingQuestion: 'order_help',
            }),
            escalateHuman: false,
            specialist: 'support',
            intents: ['consumer.order_help'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        break;
      }
      case 'root_prospect': {
        if (digit === 1 || digit === 2) {
          return {
            handled: true,
            replies: [],
            memoryPatch: patchMenu('root_prospect', 'prospect', nowMs),
            escalateHuman: false,
            specialist: 'commercial',
            intents: [digit === 2 ? 'commercial.pricing' : 'commercial.info'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: false,
            delegate: {
              specialist: 'commercial',
              intent: digit === 2 ? 'commercial.pricing' : 'commercial.info',
            },
          };
        }
        if (digit === 3 || digit === 4 || digit === 5) {
          return {
            handled: true,
            replies: [],
            memoryPatch: patchMenu('root_prospect', 'prospect', nowMs),
            escalateHuman: false,
            specialist: 'commercial',
            intents: [
              digit === 5 ? 'commercial.resume_signup' : 'commercial.register',
            ],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: false,
            delegate: {
              specialist: 'commercial',
              intent: digit === 5 ? 'commercial.resume_signup' : 'commercial.register',
            },
          };
        }
        break;
      }
      case 'root_registered': {
        if (digit === 1) {
          return {
            handled: true,
            replies: [buildMenuText('biz_links')],
            memoryPatch: patchMenu('biz_links', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.menu_links'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 2) {
          return {
            handled: true,
            replies: [buildMenuText('biz_products')],
            memoryPatch: patchMenu('biz_products', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.edit_product'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 3) {
          return {
            handled: true,
            replies: [buildMenuText('biz_pricing')],
            memoryPatch: patchMenu('biz_pricing', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.fx'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 4) {
          return {
            handled: true,
            replies: [buildMenuText('biz_orders')],
            memoryPatch: patchMenu('biz_orders', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.delivery'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 5) {
          return {
            handled: true,
            replies: [buildMenuText('biz_config')],
            memoryPatch: patchMenu('biz_config', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.settings'],
            toolsUsed: ['smart_menu'],
            skipGeminiPolish: true,
          };
        }
        break;
      }
      case 'biz_links': {
        if (!comercio?.slug) {
          const reply = await businessHandoff(
            config,
            fromDigits,
            params.handoffStore,
            nowMs,
            { intent: 'menu_links', pendingOperation: 'links' },
            'Para mostrarte los enlaces correctos, abre el asistente empresarial (con tu sesión):',
          );
          return {
            handled: true,
            replies: [reply],
            memoryPatch: patchMenu('biz_links', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.menu_links'],
            toolsUsed: ['smart_menu', 'business_handoff'],
            skipGeminiPolish: true,
          };
        }
        const links = buildPublicMenuLinks({ slug: comercio.slug });
        if (digit === 1) {
          return {
            handled: true,
            replies: [
              formatMenuLinksReply({ businessName, links, which: 'qr' }) +
                '\n\n0️⃣ Menú · 8️⃣ Problema · 9️⃣ Asesor',
            ],
            memoryPatch: patchMenu('biz_links', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.menu_links'],
            toolsUsed: ['smart_menu', 'menu_links'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 2) {
          return {
            handled: true,
            replies: [
              formatMenuLinksReply({ businessName, links, which: 'orders' }) +
                '\n\n0️⃣ Menú · 8️⃣ Problema · 9️⃣ Asesor',
            ],
            memoryPatch: patchMenu('biz_links', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.menu_links'],
            toolsUsed: ['smart_menu', 'menu_links'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 3) {
          return {
            handled: true,
            replies: [
              formatMenuLinksReply({ businessName, links, which: 'menu' }) +
                '\n\n0️⃣ Menú · 8️⃣ Problema · 9️⃣ Asesor',
            ],
            memoryPatch: patchMenu('biz_links', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.menu_links'],
            toolsUsed: ['smart_menu', 'menu_links'],
            skipGeminiPolish: true,
          };
        }
        if (digit === 4) {
          const reply = await businessHandoff(
            config,
            fromDigits,
            params.handoffStore,
            nowMs,
            {
              intent: 'manage_menu',
              candidateComercioId: comercio.comercioId,
            },
            'Para gestionar el menú con tu sesión:',
          );
          return {
            handled: true,
            replies: [reply],
            memoryPatch: patchMenu('biz_links', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.view_menu'],
            toolsUsed: ['smart_menu', 'business_handoff'],
            skipGeminiPolish: true,
          };
        }
        break;
      }
      case 'biz_products':
      case 'biz_pricing':
      case 'biz_config': {
        const op =
          menuId === 'biz_products'
            ? 'products'
            : menuId === 'biz_pricing'
              ? 'pricing_fx'
              : 'settings';
        const reply = await businessHandoff(
          config,
          fromDigits,
          params.handoffStore,
          nowMs,
          {
            intent: op,
            candidateComercioId: comercio?.comercioId || null,
            pendingOperation: String(digit),
          },
          'Esta gestión requiere tu sesión en el asistente empresarial (no modificamos datos solo por WhatsApp):',
        );
        return {
          handled: true,
          replies: [
            reply + '\n\n0️⃣ Menú principal · 8️⃣ Reportar problema · 9️⃣ Hablar con asesor',
          ],
          memoryPatch: patchMenu(menuId, 'registered', nowMs),
          escalateHuman: false,
          specialist: 'admin',
          intents: ['admin.settings'],
          toolsUsed: ['smart_menu', 'business_handoff'],
          skipGeminiPolish: true,
        };
      }
      case 'biz_orders': {
        if (digit === 2 && comercio?.slug) {
          const links = buildPublicMenuLinks({ slug: comercio.slug });
          return {
            handled: true,
            replies: [
              formatMenuLinksReply({ businessName, links, which: 'orders' }) +
                '\n\n0️⃣ Menú · 8️⃣ Problema · 9️⃣ Asesor',
            ],
            memoryPatch: patchMenu('biz_orders', 'registered', nowMs),
            escalateHuman: false,
            specialist: 'admin',
            intents: ['admin.delivery'],
            toolsUsed: ['smart_menu', 'menu_links'],
            skipGeminiPolish: true,
          };
        }
        const reply = await businessHandoff(
          config,
          fromDigits,
          params.handoffStore,
          nowMs,
          {
            intent: 'delivery_orders',
            candidateComercioId: comercio?.comercioId || null,
          },
          'Para revisar delivery y pedidos con datos reales de tu negocio:',
        );
        return {
          handled: true,
          replies: [reply],
          memoryPatch: patchMenu('biz_orders', 'registered', nowMs),
          escalateHuman: false,
          specialist: 'admin',
          intents: ['admin.delivery'],
          toolsUsed: ['smart_menu', 'business_handoff'],
          skipGeminiPolish: true,
        };
      }
      case 'support_issue': {
        if (digit === 1 || digit === 2 || digit === 3 || digit === 4 || digit === 5) {
          const labels: Record<number, string> = {
            1: 'acceso a la cuenta',
            2: 'problema con el menú',
            3: 'problema con un pedido',
            4: 'pagos o suscripción',
            5: 'otro problema',
          };
          const kind = labels[digit!] || 'otro problema';
          const prior = nav.supportIssueText;
          return {
            handled: true,
            replies: [
              prior
                ? `Registré tu caso sobre *${kind}*. 😊\n\nYa tenía tu descripción; un asesor puede retomarlo con *9*, o escribe más detalle si quieres.\n\n0️⃣ Menú principal`
                : `Entendido: *${kind}*. 😊 Cuéntame un poco más (qué ves en pantalla o qué falló) y te oriento.\n\nSi prefieres persona: *9*.\n0️⃣ Menú principal`,
            ],
            memoryPatch: patchMenu('support_issue', profile, nowMs, {
              supportIssueText: prior || kind,
              goal: `support:${kind}`,
              pendingQuestion: prior ? null : 'support_detail',
            }),
            escalateHuman: false,
            specialist: 'support',
            intents: ['support.issue'],
            toolsUsed: ['smart_menu', 'support_case'],
            skipGeminiPolish: true,
          };
        }
        break;
      }
      default:
        break;
    }

    return {
      handled: true,
      replies: [invalidChoiceReply(menuId, { businessName })],
      memoryPatch: {
        ...patchMenu(menuId, profile, nowMs),
        misunderstandCount: (nav.misunderstandCount || 0) + 1,
      },
      escalateHuman: false,
      specialist: 'orchestrator',
      intents: ['unknown'],
      toolsUsed: ['smart_menu', 'invalid_choice'],
      skipGeminiPolish: true,
    };
  };

  return choose();
}
