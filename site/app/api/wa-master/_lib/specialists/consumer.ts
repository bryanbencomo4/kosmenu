import type { WaMasterConfig } from '../config';
import type {
  WaMasterDiscoveryCtx,
  WaMasterDiscoveryExecute,
  WaMasterDiscoveryCard,
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

function toRefs(cards: WaMasterDiscoveryCard[]): WaMasterRestaurantRef[] {
  return cards.slice(0, 5).map((r) => ({
    id: r.id,
    slug: r.slug,
    nombre: r.nombre,
    menuUrl: r.menuUrl?.startsWith('http') ? r.menuUrl : publicMenuUrl(r.slug),
    chatUrl: r.chatUrl ?? null,
  }));
}

function extractZone(text: string): string | null {
  const t = fold(text);
  const m =
    t.match(/\ben\s+([a-záéíóúñ\s]{3,40})$/i) ||
    t.match(/\bzona\s+([a-záéíóúñ\s]{3,40})/i) ||
    t.match(/\bciudad\s+([a-záéíóúñ\s]{3,40})/i);
  if (m?.[1]) return m[1].trim().replace(/\s+/g, ' ');
  for (const city of [
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
  ]) {
    if (t.includes(fold(city))) return city;
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
  return text.trim().slice(0, 80);
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
  const zoneFromText = extractZone(text);
  const zone = zoneFromText || memory.summary.zone;

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
      memoryPatch: { zone: zone ?? memory.summary.zone },
      skipGeminiPolish: true,
    };
  }

  const foodSeek =
    /\b(pizza|hamburgues|burger|sushi|arepa|mexicana|pollo|pedir|comer|delivery|cerca|restaurante)/.test(
      t,
    );

  // Receptionist: hand off multi-step search to Discovery with real context code.
  if (config.receptionistMode && foodSeek) {
    const query = foodQueryHint(text);
    if (!zone && discoveryCtx.lat == null && !discoveryCtx.region) {
      return {
        replies: [
          '¡Claro! 🍔 ¿En qué ciudad o zona buscas? Con eso te dejo la búsqueda lista en nuestro asistente.',
        ],
        toolsUsed,
        memoryPatch: { pendingQuestion: 'zone', activeService: 'consumer' },
        skipGeminiPolish: true,
      };
    }
    const handoff = await issueMasterHandoff({
      store: params.handoffStore,
      config,
      destination: 'consumer_discovery',
      fromDigits: params.fromDigits || memory.profile.fromDigits,
      nowMs: params.nowMs,
      payload: {
        intent: 'consumer.search',
        query,
        zone: zone || discoveryCtx.region || null,
        conversationHint: `Buscar ${query}${zone ? ` en ${zone}` : ''}`,
      },
    });
    if (handoff) {
      const where = zone ? ` en ${zone}` : '';
      return {
        replies: [
          `¡Claro! 🍔 Nuestro asistente te ayuda a encontrar ${query}${where} y comparar los restaurantes disponibles.\n\nTe dejo la búsqueda preparada para que continúes:\n${handoff.url}\n\n¡Ya puedes empezar! 😊`,
        ],
        toolsUsed: ['handoff_consumer'],
        memoryPatch: {
          zone: zone ?? memory.summary.zone,
          pendingQuestion: null,
          activeService: 'consumer',
          lastHandoffUrl: handoff.url,
          lastHandoffAtMs: params.nowMs ?? Date.now(),
        },
        skipGeminiPolish: true,
      };
    }
    // Honest fallback if handoff could not be issued
    return {
      replies: [
        `Puedes continuar la búsqueda en nuestro asistente:\n${config.consumerAssistantUrl}\n\n(Aún no pude preparar un enlace con contexto en este momento.)`,
      ],
      toolsUsed: ['handoff_consumer_fallback'],
      memoryPatch: { zone: zone ?? memory.summary.zone, activeService: 'consumer' },
      skipGeminiPolish: true,
    };
  }

  if (foodSeek && !zone && discoveryCtx.lat == null && !discoveryCtx.region) {
    return {
      replies: [
        '¡Vamos a buscar! 🍔 ¿En qué ciudad o zona quieres pedir? Así filtro opciones reales del directorio.',
      ],
      toolsUsed,
      memoryPatch: { pendingQuestion: 'zone', activeService: 'consumer' },
    };
  }

  let toolName = 'search_restaurants';
  const args: Record<string, unknown> = {
    limit: 5,
    offset: 0,
    region: zone || discoveryCtx.region,
  };

  if (/\bpizza/.test(t)) {
    args.category = 'pizzas';
    args.query = 'pizza';
  } else if (/\bhamburg|burger/.test(t)) {
    args.category = 'hamburguesas';
    args.query = 'hamburguesa';
  } else if (/\bmexican|taco/.test(t)) {
    args.category = 'tacos';
    args.query = 'mexicana';
  } else if (/\bsushi/.test(t)) {
    args.category = 'sushi';
    args.query = 'sushi';
  } else if (/\barepa/.test(t)) {
    args.category = 'arepas';
    args.query = 'arepa';
  } else if (text.trim()) {
    args.query = text.trim().slice(0, 80);
  }

  if (/\babierto|abiertos/.test(t)) {
    toolName = 'filter_restaurants';
    args.openOnly = true;
  }

  const result = await executeTool(toolName, args, discoveryCtx);
  toolsUsed.push(toolName);
  const restaurants = result.restaurants ?? [];
  const refs = toRefs(restaurants);

  if (!restaurants.length) {
    return {
      replies: [
        `No encontré restaurantes con eso en el directorio de elmenuxfa.com.${zone ? ` Zona: ${zone}.` : ''} Prueba en nuestro asistente: ${config.consumerAssistantUrl}`,
      ],
      toolsUsed,
      memoryPatch: {
        zone: zone ?? memory.summary.zone,
        lastRestaurants: [],
        pendingQuestion: null,
      },
    };
  }

  const lines = refs.map((r, i) => `${i + 1}. *${r.nombre}* — ${r.menuUrl}`).join('\n');
  const zoneNote = zone ? ` en ${zone}` : '';
  return {
    replies: [
      `Encontré estas opciones${zoneNote}:\n${lines}\n\nDime el número o “la segunda” y te paso el menú.`,
    ],
    toolsUsed,
    memoryPatch: {
      zone: zone ?? memory.summary.zone,
      lastRestaurants: refs,
      pendingQuestion: null,
      activeService: 'consumer',
    },
  };
}
