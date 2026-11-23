/**
 * Deterministic discovery agent for tests / local — never calls Google.
 */

import type { DiscoveryRestaurantCard } from './tools';
import { executeDiscoveryTool, type DiscoveryToolContext } from './tools';

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export type SimulatedDiscoveryResult = {
  text: string;
  model: 'simulated';
  restaurants: DiscoveryRestaurantCard[];
  toolCalls: number;
  geminiHttpCalls: 0;
  skippedLlm: true;
  fallback?: boolean;
};

export async function runSimulatedDiscoveryAgent(params: {
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  ctx: DiscoveryToolContext;
}): Promise<SimulatedDiscoveryResult> {
  const last =
    [...params.messages].reverse().find((m) => m.role === 'user')?.text || '';
  const q = norm(last);

  // Geo ask — no coords provided
  if (
    (q.includes('cerca') || q.includes('cerca de mi') || q.includes('cerca de mí')) &&
    params.ctx.lat == null &&
    params.ctx.lng == null &&
    !params.ctx.region
  ) {
    return {
      text: 'Para buscar cerca de ti necesito tu ubicación o una región (por ejemplo Táchira).',
      model: 'simulated',
      restaurants: [],
      toolCalls: 0,
      geminiHttpCalls: 0,
      skippedLlm: true,
    };
  }

  let toolName = 'search_restaurants';
  let args: Record<string, unknown> = { limit: params.ctx.pageSize ?? 24, offset: 0 };

  if (q.includes('pizza')) {
    args = { ...args, category: 'pizzas', query: 'pizza' };
  } else if (q.includes('hamburg') || q.includes('burger')) {
    args = { ...args, category: 'hamburguesas', query: 'hamburguesa' };
  } else if (q.includes('pollo')) {
    args = { ...args, query: 'pollo' };
  } else if (q.includes('cerca')) {
    args = {
      ...args,
      lat: params.ctx.lat,
      lng: params.ctx.lng,
      region: params.ctx.region,
    };
  } else if (q.includes('abierto') || q.includes('open')) {
    toolName = 'filter_restaurants';
    args = { ...args, openOnly: true, query: last };
  } else if (
    q.includes('xyznoexiste') ||
    q.includes('sin resultados') ||
    q.includes('empty')
  ) {
    args = { ...args, query: 'xyznoexisterestaurant999' };
  } else if (last.trim()) {
    args = { ...args, query: last.trim().slice(0, 80) };
  }

  const result = await executeDiscoveryTool(toolName, args, params.ctx);
  const restaurants = result.restaurants ?? [];

  let text = result.text || '';
  if (restaurants.length === 0) {
    text =
      'No encontré restaurantes con eso. Prueba otra categoría (pizzas, hamburguesas, pollo) o una zona.';
  } else {
    const names = restaurants
      .slice(0, 5)
      .map((r) => r.nombre)
      .join(', ');
    text = `Encontré estas opciones: ${names}.${restaurants.length > 5 ? ' Hay más en el carrusel.' : ''}`;
  }

  return {
    text,
    model: 'simulated',
    restaurants,
    toolCalls: 1,
    geminiHttpCalls: 0,
    skippedLlm: true,
  };
}

/** Alias used by Vitest / Playwright harnesses. */
export const runSimulatedDiscovery = runSimulatedDiscoveryAgent;
