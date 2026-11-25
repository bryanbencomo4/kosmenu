import type { WaMasterConfig } from '../config';
import type {
  WaMasterDiscoveryCtx,
  WaMasterDiscoveryExecute,
} from '../discovery-bridge';
import { issueMasterHandoff } from '../handoff';
import type { WaHandoffStore } from '../../../_lib/wa-handoff';
import type { WaMasterMemory, WaMasterRestaurantRef } from '../types';

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function publicMenuUrl(slug: string): string {
  return `https://elmenuxfa.com/v/${encodeURIComponent(slug)}`;
}

const KNOWN_CITIES = [
  'san cristobal',
  'san cristóbal',
  'tachira',
  'táchira',
  'caracas',
  'maracaibo',
  'valencia',
  'barquisimeto',
  'merida',
  'mérida',
] as const;

/** User is correcting / rejecting a prior city — never treat as current zone. */
export function isZoneCorrection(text: string): boolean {
  const t = fold(text);
  return (
    /\b(no estoy|no vivo|no soy de|no estoy en|no es (mi )?(ciudad|zona)|otra (ciudad|zona)|cambio de (ciudad|zona)|me equivoque de (ciudad|zona)|me equivoqué de (ciudad|zona))\b/.test(
      t,
    ) || /\bno\s+(estoy|vivo|soy)\s+(en|de)\b/.test(t)
  );
}

/**
 * Extract zone only when the user asserts location in THIS message.
 * Ignores corrections ("no estoy en Caracas") and bare substring traps.
 */
export function extractZone(text: string): string | null {
  const t = fold(text);
  if (isZoneCorrection(t)) return null;

  const explicit =
    t.match(/\ben\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})\b/i) ||
    t.match(/\bzona\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})\b/i) ||
    t.match(/\bciudad\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})\b/i);
  if (explicit?.[1]) {
    const raw = explicit[1].trim().replace(/\s+/g, ' ');
    // Reject filler like "en general" / "en realidad"
    if (/^(general|realidad|serio|verdad|casa|linea|línea)$/.test(raw)) return null;
    const hit = KNOWN_CITIES.find((c) => fold(c) === fold(raw));
    return hit || raw;
  }

  for (const city of KNOWN_CITIES) {
    const c = fold(city);
    const re = new RegExp(`\\b${c.replace(/\s+/g, '\\s+')}\\b`);
    if (re.test(t)) return city;
  }
  return null;
}

function pickOrdinal(text: string, list: WaMasterRestaurantRef[]): WaMasterRestaurantRef | null {
  const t = fold(text);
  if (!list.length) return null;
  if (/\b(la )?primera\b|\bopcion 1\b/.test(t) || /(?:^|\s)1(?:\s|$)/.test(t)) return list[0] ?? null;
  if (/\b(la )?segunda\b|\bopcion 2\b/.test(t) || /(?:^|\s)2(?:\s|$)/.test(t)) return list[1] ?? null;
  if (/\b(la )?tercera\b/.test(t) || /(?:^|\s)3(?:\s|$)/.test(t)) return list[2] ?? null;
  if (/\b(esa|ese|ela)\b/.test(t) && list.length >= 1) return list[0];
  return null;
}

function foodQueryHint(text: string): string {
  const t = fold(text);
  if (/\bhamburg|burger/.test(t)) return 'hamburguesas';
  if (/\bpizza/.test(t)) return 'pizza';
  if (/\bsushi/.test(t)) return 'sushi';
  if (/\barepa/.test(t)) return 'arepas';
  if (/\bdelivery|domicilio\b/.test(t)) return 'delivery';
  return text.trim().slice(0, 80);
}

/** Clean public surfaces for ordering — prefer web assistant + directory over WA lists. */
export function formatConsumerOrderGuide(params: {
  assistantUrl: string;
  exploreUrl?: string;
  handoffUrl?: string | null;
  zone?: string | null;
  queryHint?: string | null;
}): string {
  let explore = (params.exploreUrl || 'https://elmenuxfa.com').trim().replace(/\/$/, '');
  if (!explore) explore = 'https://elmenuxfa.com';
  let assistantDisplay = (params.assistantUrl || 'https://elmenuxfa.com/asistente').trim();
  try {
    const u = new URL(assistantDisplay);
    assistantDisplay = `${u.origin}/asistente`;
  } catch {
    assistantDisplay = 'https://elmenuxfa.com/asistente';
  }
  const primary = (params.handoffUrl || params.assistantUrl || assistantDisplay).trim();
  const hint = params.queryHint?.trim();
  const what =
    hint && hint.toLowerCase() !== 'delivery'
      ? `buscar *${hint}*`
      : 'pedir delivery o explorar locales';
  const where = params.zone?.trim() ? ` en *${params.zone.trim()}*` : '';
  return [
    `¡Claro! 🛵 Para ${what}${where}, lo más fácil es hacerlo en *elmenuxfa.com*:`,
    '',
    '*Hablar con el asistente*',
    primary,
    '',
    '*Explorar restaurantes*',
    explore,
    '',
    'Ahí eliges zona, ves menús completos y pides con delivery cuando el local lo tenga activo.',
  ].join('\n');
}

export type ConsumerSpecialistResult = {
  replies: string[];
  toolsUsed: string[];
  memoryPatch: Partial<WaMasterMemory['summary']>;
  /** When true, orchestrator should skip Gemini polish (handoff already final). */
  skipGeminiPolish?: boolean;
};

export async function runConsumerSpecialist(params: {
  text: string;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  discoveryCtx: WaMasterDiscoveryCtx;
  executeTool: WaMasterDiscoveryExecute;
  fromDigits?: string;
  handoffStore?: WaHandoffStore;
  nowMs?: number;
}): Promise<ConsumerSpecialistResult> {
  const { text, memory, config, discoveryCtx, executeTool } = params;
  const t = fold(text);
  const toolsUsed: string[] = [];
  // Only trust zone when the user said it in THIS message — never echo a
  // stale memory zone (e.g. old "caracas") into delivery CTAs.
  const zoneFromText = extractZone(text);
  const zone = zoneFromText;

  // Direct memory / simple answers — no link spam.
  if (
    /\b(recuerdas|recuerdas|como se llama|cómo se llama|nombre de mi (negocio|restaurante))\b/.test(
      t,
    )
  ) {
    const name = memory.summary.signupDraft?.businessName;
    if (name) {
      return {
        replies: [
          `¡Sí! 😊 Me comentaste que se llama *${name}*.\n\n¿Quieres que continuemos con su registro?`,
        ],
        toolsUsed: ['memory_recall'],
        memoryPatch: {},
        skipGeminiPolish: true,
      };
    }
  }

  const picked = pickOrdinal(text, memory.summary.lastRestaurants || []);
  if (
    picked &&
    (/\b(esa|ese|segunda|primera|tercera|opcion|men[uú]|manda|enviame|link)\b/.test(t) ||
      /\b(1|2|3)\b/.test(t))
  ) {
    toolsUsed.push('prepare_restaurant_links');
    const links = await executeTool(
      'prepare_restaurant_links',
      { slug: picked.slug, id: picked.id },
      discoveryCtx,
    );
    const menuUrl = links.menuUrl?.startsWith('http')
      ? links.menuUrl
      : publicMenuUrl(picked.slug);
    return {
      replies: [
        `Perfecto: *${picked.nombre}*.\n\nMenú: ${menuUrl}\n\nAhí puedes elegir y completar el pedido.`,
      ],
      toolsUsed,
      memoryPatch: zone ? { zone } : {},
      skipGeminiPolish: true,
    };
  }

  const looksMerchantEdit =
    /\b(precio|tasa|tarif|agotado|disponible|agregar|editar|modificar)\b/.test(t) ||
    /\b(cambia(?:r)?|actualiza(?:r)?|pon(?:er)?)\s+(el\s+)?precio\b/.test(t) ||
    /\bprecio de\b/.test(t);

  const foodSeek =
    !looksMerchantEdit &&
    /\b(pizza|hamburgues|burger|sushi|arepa|mexicana|pollo|pedir|comer|delivery|domicilio|cerca|restaurante)/.test(
      t,
    );

  // Ordering / discovery belongs on web (asistente + explorar), not a short WA list.
  if (foodSeek) {
    const query = foodQueryHint(text);
    const clearsZone = isZoneCorrection(text);
    const handoff = await issueMasterHandoff({
      store: params.handoffStore,
      config,
      destination: 'consumer_discovery',
      fromDigits: params.fromDigits || memory.profile.fromDigits,
      nowMs: params.nowMs,
      payload: {
        intent: 'consumer.search',
        query,
        zone: zone || null,
        conversationHint: `Buscar ${query}${zone ? ` en ${zone}` : ''}`,
        summary: `Cliente busca ${query}${zone ? ` en ${zone}` : ''} desde WhatsApp`,
        transcriptExcerpt: text.slice(0, 400),
        source: 'wa_platform',
        profile: 'consumer_discovery',
      },
    });
    const guide = formatConsumerOrderGuide({
      assistantUrl: config.consumerAssistantUrl,
      handoffUrl: handoff?.url ?? null,
      // Never echo zone on correction turns.
      zone: clearsZone ? null : zone || null,
      queryHint: query,
    });
    return {
      replies: [guide],
      toolsUsed: [...toolsUsed, handoff ? 'handoff_consumer' : 'consumer_explore_guide'],
      memoryPatch: {
        ...(zone ? { zone } : clearsZone ? { zone: null } : {}),
        // Drop stale WA restaurant lists — ordering is on web now.
        lastRestaurants: [],
        pendingQuestion: null,
        activeService: 'consumer',
        lastHandoffUrl: handoff?.url ?? memory.summary.lastHandoffUrl ?? null,
        lastHandoffAtMs: handoff ? params.nowMs ?? Date.now() : memory.summary.lastHandoffAtMs,
      },
      skipGeminiPolish: true,
    };
  }

  return {
    replies: [
      formatConsumerOrderGuide({
        assistantUrl: config.consumerAssistantUrl,
        zone: zone || null,
      }),
    ],
    toolsUsed: [...toolsUsed, 'consumer_explore_guide'],
    memoryPatch: {
      ...(zone ? { zone } : {}),
      activeService: 'consumer',
    },
    skipGeminiPolish: true,
  };
}
