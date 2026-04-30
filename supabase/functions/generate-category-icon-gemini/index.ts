/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AiUsageError,
  COST_CATEGORY_ICON,
  addCredits,
  deductCredits,
  enforceAiLimits,
  hasEnoughCredits,
  recordGeminiUsage,
} from '../_shared/ai-usage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-comercio-id',
};

const GEMINI_MODEL = 'gemini-2.5-flash';

const ICON_OPTIONS = [
  'restaurant',
  'fastfood',
  'lunch_dining',
  'dinner_dining',
  'ramen_dining',
  'local_pizza',
  'bakery_dining',
  'icecream',
  'cake',
  'emoji_food_beverage',
  'local_cafe',
  'local_bar',
  'wine_bar',
  'sports_bar',
  'brunch_dining',
  'egg_alt',
  'set_meal',
  'kebab_dining',
  'rice_bowl',
  'takeout_dining',
  'delivery_dining',
  'local_drink',
  'liquor',
  'tapas',
  'cookie',
  'breakfast_dining',
  'soup_kitchen',
  'outdoor_grill',
  'local_fire_department',
  'spa',
  'eco',
  'grass',
  'emoji_nature',
  'nutrition',
  'favorite',
  'celebration',
  'redeem',
  'storefront',
  'star',
  'diamond',
];

const GENERIC_ICON_KEYS = new Set([
  'restaurant',
  'fastfood',
  'emoji_food_beverage',
]);

const KEYWORD_ICON_RULES = [
  { icon_key: 'diamond', keywords: ['premium', 'signature', 'deluxe', 'exclusive', 'gourmet'], reason: 'El titulo comunica una linea premium o signature.' },
  { icon_key: 'star', keywords: ['top', 'especial', 'especiales', 'destacado', 'favorito', 'premium plus'], reason: 'El titulo resalta una seleccion destacada.' },
  { icon_key: 'wine_bar', keywords: ['vino', 'vinos', 'wine', 'champagne', 'espumante', 'premium drink'], reason: 'El titulo apunta a vinos o bebidas premium.' },
  { icon_key: 'sports_bar', keywords: ['bebida', 'bebidas', 'coctel', 'cocteles', 'cocktail', 'tragos', 'trago', 'cerveza', 'cervezas', 'bar'], reason: 'El titulo se relaciona con bebidas o cocteleria.' },
  { icon_key: 'local_drink', keywords: ['jugo', 'jugos', 'smoothie', 'smoothies', 'refresco', 'refrescos', 'soda', 'limonada'], reason: 'El titulo se relaciona con bebidas frias o jugos.' },
  { icon_key: 'local_cafe', keywords: ['cafe', 'cafes', 'coffee', 'latte', 'capuccino', 'espresso', 'mocha'], reason: 'El titulo se relaciona con cafe o bebidas calientes.' },
  { icon_key: 'spa', keywords: ['te', 'tes', 'chai', 'infusion', 'infusiones'], reason: 'El titulo se relaciona con te o infusiones.' },
  { icon_key: 'local_pizza', keywords: ['pizza', 'pizzas'], reason: 'El titulo menciona pizza.' },
  { icon_key: 'lunch_dining', keywords: ['hamburguesa', 'hamburguesas', 'burger', 'burgers', 'smash'], reason: 'El titulo se relaciona con hamburguesas.' },
  { icon_key: 'ramen_dining', keywords: ['ramen', 'noodle', 'noodles', 'fideos'], reason: 'El titulo se relaciona con ramen o noodles.' },
  { icon_key: 'dinner_dining', keywords: ['plato', 'platos', 'fuerte', 'fuertes', 'almuerzo', 'cena', 'menu ejecutivo'], reason: 'El titulo se relaciona con platos fuertes.' },
  { icon_key: 'bakery_dining', keywords: ['pan', 'panes', 'panaderia', 'panadería', 'croissant', 'croissants', 'horneado', 'horneados'], reason: 'El titulo se relaciona con panaderia.' },
  { icon_key: 'icecream', keywords: ['helado', 'helados', 'gelato', 'sorbete'], reason: 'El titulo se relaciona con helados.' },
  { icon_key: 'cake', keywords: ['postre', 'postres', 'torta', 'tortas', 'cake', 'dulce', 'dulces'], reason: 'El titulo se relaciona con postres.' },
  { icon_key: 'cookie', keywords: ['galleta', 'galletas', 'cookie', 'cookies', 'biscuit'], reason: 'El titulo se relaciona con galletas.' },
  { icon_key: 'breakfast_dining', keywords: ['desayuno', 'desayunos', 'breakfast', 'brunch matutino'], reason: 'El titulo se relaciona con desayunos.' },
  { icon_key: 'brunch_dining', keywords: ['brunch'], reason: 'El titulo se relaciona con brunch.' },
  { icon_key: 'egg_alt', keywords: ['huevo', 'huevos', 'omelette', 'omelet'], reason: 'El titulo se relaciona con huevos.' },
  { icon_key: 'set_meal', keywords: ['combo', 'combos', 'promo combo', 'meal deal'], reason: 'El titulo se relaciona con combos.' },
  { icon_key: 'kebab_dining', keywords: ['parrilla', 'kebab', 'shawarma', 'brocheta'], reason: 'El titulo se relaciona con parrilla o kebab.' },
  { icon_key: 'rice_bowl', keywords: ['bowl', 'bowls', 'arroz', 'poke', 'poké'], reason: 'El titulo se relaciona con bowls o arroz.' },
  { icon_key: 'takeout_dining', keywords: ['para llevar', 'takeout', 'pickup'], reason: 'El titulo se relaciona con pedidos para llevar.' },
  { icon_key: 'delivery_dining', keywords: ['delivery', 'domicilio', 'envio', 'envío'], reason: 'El titulo se relaciona con delivery.' },
  { icon_key: 'liquor', keywords: ['licor', 'licores', 'whisky', 'ron', 'vodka', 'gin', 'tequila'], reason: 'El titulo se relaciona con licores.' },
  { icon_key: 'tapas', keywords: ['tapa', 'tapas', 'picada', 'picadas', 'aperitivo', 'aperitivos'], reason: 'El titulo se relaciona con tapas o aperitivos.' },
  { icon_key: 'soup_kitchen', keywords: ['sopa', 'sopas', 'caldo', 'caldos', 'crema'], reason: 'El titulo se relaciona con sopas.' },
  { icon_key: 'outdoor_grill', keywords: ['asado', 'asados', 'bbq', 'barbecue', 'grill', 'grilled'], reason: 'El titulo se relaciona con asados o grill.' },
  { icon_key: 'local_fire_department', keywords: ['picante', 'spicy', 'hot', 'fuego'], reason: 'El titulo comunica comida picante.' },
  { icon_key: 'eco', keywords: ['vegano', 'vegana', 'veggie', 'vegetariano', 'vegetariana'], reason: 'El titulo se relaciona con opciones veganas o vegetarianas.' },
  { icon_key: 'grass', keywords: ['ensalada', 'ensaladas', 'green', 'greens'], reason: 'El titulo se relaciona con ensaladas.' },
  { icon_key: 'emoji_nature', keywords: ['natural', 'organico', 'orgánico', 'fresh', 'fresco', 'fresco'], reason: 'El titulo comunica productos naturales.' },
  { icon_key: 'nutrition', keywords: ['fit', 'saludable', 'healthy', 'light', 'proteina', 'proteína'], reason: 'El titulo se relaciona con comida saludable.' },
  { icon_key: 'celebration', keywords: ['fiesta', 'party', 'celebracion', 'celebración', 'evento'], reason: 'El titulo comunica una linea festiva.' },
  { icon_key: 'redeem', keywords: ['promo', 'promos', 'oferta', 'ofertas', 'descuento', 'descuentos'], reason: 'El titulo comunica promociones u ofertas.' },
  { icon_key: 'storefront', keywords: ['casa', 'de la casa', 'house'], reason: 'El titulo comunica productos de la casa.' },
  { icon_key: 'favorite', keywords: ['favorito', 'favoritos', 'best seller', 'recomendado', 'recomendados'], reason: 'El titulo comunica favoritos o recomendados.' },
] as const;

const SYSTEM_PROMPT =
  'Eres un experto en taxonomias visuales para menus de restaurantes. ' +
  'Debes elegir UN solo icono semantico para una categoria de menu usando exclusivamente una lista cerrada de claves permitidas. ' +
  'No inventes claves. No respondas texto libre. Responde UNICAMENTE JSON valido con esta forma exacta: ' +
  '{"icon_key": string, "reason": string, "confidence": number}. ' +
  'icon_key debe ser uno de estos valores: ' + ICON_OPTIONS.join(', ') + '. ' +
  'reason debe ser una frase breve en espanol. ' +
  'confidence debe ser un numero entre 0 y 1. ' +
  'Prioriza primero las palabras clave explicitas del titulo de la categoria. ' +
  'Si el titulo contiene palabras como premium, signature, vinos, cafe, pizza, hamburguesas, postres o promos, el icono debe reflejarlas directamente. ' +
  'Evita responder iconos demasiado genericos cuando el titulo ya da una pista clara. ' +
  'Prioriza precision semantica, claridad para vendedor y coherencia con comida/bebidas. ' +
  'Si la categoria es ambigua, elige un icono gastronomico neutral y util.';

type IconSuggestionResult = {
  icon_key: string;
  reason: string;
  confidence: number;
};

type KeywordSuggestion = IconSuggestionResult & {
  score: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const comercioId = resolveComercioId(req, body);
    const categoryName = normalizeString(body.category_name ?? body.categoryName ?? body.nombre_categoria);
    const context = normalizeString(body.context ?? body.descripcion ?? body.prompt);

    if (!comercioId) {
      return jsonResponse(
        { error: 'Missing comercio_id. Provide it in x-comercio-id header or request body.' },
        400,
      );
    }

    if (!categoryName) {
      return jsonResponse({ error: 'Missing required field: category_name' }, 400);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error:
            'Missing env vars. Required: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await enforceAiLimits(supabase, comercioId);
    await hasEnoughCredits(supabase, comercioId, COST_CATEGORY_ICON);

    const suggestion = await generateIconSuggestionWithGemini({
      apiKey: geminiApiKey,
      supabase,
      comercioId,
      categoryName,
      context,
    });

    let creditsCharged = false;

    try {
      await deductCredits(supabase, comercioId, COST_CATEGORY_ICON, 'category_icon_generation', {
        function: 'generate-category-icon-gemini',
        category_name: categoryName,
        icon_key: suggestion.icon_key,
      });
      creditsCharged = true;

      return jsonResponse(
        {
          ok: true,
          comercio_id: comercioId,
          category_name: categoryName,
          icon_key: suggestion.icon_key,
          reason: suggestion.reason,
          confidence: suggestion.confidence,
          credits_charged: COST_CATEGORY_ICON,
        },
        200,
      );
    } catch (error) {
      if (creditsCharged) {
        await addCredits(supabase, comercioId, COST_CATEGORY_ICON, 'category_icon_generation_refund', {
          function: 'generate-category-icon-gemini',
          category_name: categoryName,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

async function generateIconSuggestionWithGemini(params: {
  apiKey: string;
  supabase: ReturnType<typeof createClient>;
  comercioId: string;
  categoryName: string;
  context: string;
}): Promise<IconSuggestionResult> {
  const keywordSuggestion = suggestIconFromKeywords(
    params.categoryName,
    params.context,
  );

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(params.apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `Categoria: ${params.categoryName}. ` +
                (params.context ? `Contexto adicional: ${params.context}. ` : '') +
                (keywordSuggestion
                  ? `Palabras clave detectadas: ${keywordSuggestion.reason}. Icono recomendado por keywords: ${keywordSuggestion.icon_key}. `
                  : '') +
                'Devuelve el mejor icon_key posible para esta categoria.',
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            icon_key: {
              type: 'string',
              enum: ICON_OPTIONS,
            },
            reason: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['icon_key', 'reason', 'confidence'],
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini error (${GEMINI_MODEL}): ${errorText}`);
  }

  const completion = await response.json();
  await recordGeminiUsage(params.supabase, params.comercioId, completion?.usageMetadata);

  const text = extractText(completion);
  const parsed = safeParseJson(text);
  const iconKey = normalizeString(parsed?.icon_key);

  if (!ICON_OPTIONS.includes(iconKey)) {
    return keywordSuggestion ?? heuristicFallback(params.categoryName, params.context);
  }

  if (
    keywordSuggestion &&
    (GENERIC_ICON_KEYS.has(iconKey) || keywordSuggestion.score >= 8)
  ) {
    return {
      icon_key: keywordSuggestion.icon_key,
      reason: keywordSuggestion.reason,
      confidence: Math.max(
        keywordSuggestion.confidence,
        normalizeConfidence(parsed?.confidence),
      ),
    };
  }

  return {
    icon_key: iconKey,
    reason: normalizeString(parsed?.reason) || 'Icono sugerido por IA para esta categoria.',
    confidence: normalizeConfidence(parsed?.confidence),
  };
}

function extractText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error('Gemini response did not include text output');
  }

  for (const part of parts) {
    const text = normalizeString(part?.text);
    if (text) return text;
  }

  throw new Error('Gemini response did not include text output');
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function suggestIconFromKeywords(
  categoryName: string,
  context: string,
): KeywordSuggestion | null {
  const haystack = normalizeMatchText(`${categoryName} ${context}`);
  if (!haystack) {
    return null;
  }

  let bestRule: (typeof KEYWORD_ICON_RULES)[number] | null = null;
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const rule of KEYWORD_ICON_RULES) {
    const matches: string[] = [];
    let score = 0;

    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeMatchText(keyword);
      if (!normalizedKeyword) continue;
      if (!haystack.includes(normalizedKeyword)) continue;

      matches.push(keyword);
      score += normalizedKeyword.includes(' ') ? 5 : 3;
      if (normalizeMatchText(categoryName).includes(normalizedKeyword)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestRule = rule;
      bestScore = score;
      bestMatches = matches;
    }
  }

  if (!bestRule || bestScore < 3) {
    return null;
  }

  return {
    icon_key: bestRule.icon_key,
    reason: `Keywords detectadas: ${bestMatches.join(', ') || bestRule.icon_key}`,
    confidence: Math.min(0.74 + (bestScore * 0.025), 0.96),
    score: bestScore,
  };
}

function heuristicFallback(categoryName: string, context = ''): IconSuggestionResult {
  const keywordSuggestion = suggestIconFromKeywords(categoryName, context);
  if (keywordSuggestion) {
    return {
      icon_key: keywordSuggestion.icon_key,
      reason: keywordSuggestion.reason,
      confidence: keywordSuggestion.confidence,
    };
  }

  const normalized = normalizeMatchText(categoryName);
  if (normalized.includes('pizza')) return fixedResult('local_pizza');
  if (normalized.includes('cafe') || normalized.includes('bebida caliente')) return fixedResult('local_cafe');
  if (normalized.includes('bar') || normalized.includes('cerveza') || normalized.includes('trago')) return fixedResult('sports_bar');
  if (normalized.includes('postre') || normalized.includes('torta')) return fixedResult('cake');
  if (normalized.includes('helado')) return fixedResult('icecream');
  if (normalized.includes('hamburg')) return fixedResult('lunch_dining');
  if (normalized.includes('desayuno')) return fixedResult('breakfast_dining');
  if (normalized.includes('veg') || normalized.includes('ensalada')) return fixedResult('eco');
  if (normalized.includes('sopa')) return fixedResult('soup_kitchen');
  return fixedResult('restaurant');
}

function fixedResult(iconKey: string): IconSuggestionResult {
  return {
    icon_key: iconKey,
    reason: 'Icono sugerido por heuristica segura.',
    confidence: 0.65,
  };
}

function normalizeConfidence(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0.7;
  return Math.max(0, Math.min(1, parsed));
}

function resolveComercioId(req: Request, body: Record<string, unknown>): string {
  return normalizeString(
    body.comercio_id ?? body.comercioId ?? req.headers.get('x-comercio-id'),
  );
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeMatchText(value: string): string {
  return normalizeString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}