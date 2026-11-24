import type { WaMasterConfig } from '../config';
import type {
  WaMasterDiscoveryCtx,
  WaMasterDiscoveryExecute,
  WaMasterDiscoveryCard,
} from '../discovery-bridge';
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

export type ConsumerSpecialistResult = {
  replies: string[];
  toolsUsed: string[];
  memoryPatch: Partial<WaMasterMemory['summary']>;
};

export async function runConsumerSpecialist(params: {
  text: string;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  discoveryCtx: WaMasterDiscoveryCtx;
  executeTool: WaMasterDiscoveryExecute;
}): Promise<ConsumerSpecialistResult> {
  const { text, memory, config, discoveryCtx, executeTool } = params;
  const t = fold(text);
  const toolsUsed: string[] = [];
  const zoneFromText = extractZone(text);
  const zone = zoneFromText || memory.summary.zone;

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
    const chatLine = links.chatUrl
      ? `\nChat del restaurante: ${links.chatUrl.startsWith('http') ? links.chatUrl : `https://elmenuxfa.com${links.chatUrl}`}`
      : '';
    return {
      replies: [
        `Perfecto: *${picked.nombre}*.\n\nMenú: ${menuUrl}${chatLine}\n\nAhí puedes elegir productos y completar el pedido.`,
      ],
      toolsUsed,
      memoryPatch: { zone: zone ?? memory.summary.zone },
    };
  }

  const foodSeek =
    /\b(pizza|hamburgues|burger|sushi|arepa|mexicana|pollo|pedir|comer|delivery|cerca|restaurante)/.test(
      t,
    );
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

  if (/\beconomic|barat|barato|barata/.test(t)) {
    args.query = typeof args.query === 'string' ? `${args.query} economico` : 'economico';
  }

  const result = await executeTool(toolName, args, discoveryCtx);
  toolsUsed.push(toolName);
  const restaurants = result.restaurants ?? [];
  const refs = toRefs(restaurants);

  if (!restaurants.length) {
    return {
      replies: [
        `No encontré restaurantes con eso en el directorio de elmenuxfa.com.${zone ? ` Zona: ${zone}.` : ''} Prueba otra categoría o zona, o mira el asistente: ${config.consumerAssistantUrl}`,
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
      `Encontré estas opciones${zoneNote}:\n${lines}\n\nDime el número o “la segunda” y te paso el menú. No invento locales: esto sale del directorio real.`,
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
