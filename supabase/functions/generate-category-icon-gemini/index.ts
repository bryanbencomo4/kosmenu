/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AiUsageError,
  COST_CATEGORY_ICON,
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
const FALLBACK_EMOJI = '🏷️';

const EMOJI_RULES = [
  { emoji: '🍔', keywords: ['hamburguesa', 'hamburguesas', 'burger', 'burgers'] },
  { emoji: '🍕', keywords: ['pizza', 'pizzas'] },
  { emoji: '🍗', keywords: ['pollo', 'pollos', 'chicken'] },
  { emoji: '🥩', keywords: ['carnes', 'carne', 'parrilla', 'asado', 'asados', 'steak', 'bbq'] },
  { emoji: '🍣', keywords: ['sushi'] },
  { emoji: '🍝', keywords: ['pasta', 'pastas', 'spaghetti', 'lasagna', 'fideos'] },
  { emoji: '🌮', keywords: ['taco', 'tacos', 'mexicana', 'mexicano', 'mexican'] },
  { emoji: '🥗', keywords: ['ensalada', 'ensaladas', 'saludable', 'healthy', 'fit'] },
  { emoji: '🍰', keywords: ['postre', 'postres', 'torta', 'tortas', 'cake', 'cakes'] },
  { emoji: '🍦', keywords: ['helado', 'helados', 'ice cream', 'gelato'] },
  { emoji: '🥐', keywords: ['pan', 'panes', 'panaderia', 'panadería', 'bakery'] },
  { emoji: '☕', keywords: ['cafe', 'café', 'coffee'] },
  { emoji: '🥤', keywords: ['bebida', 'bebidas', 'refresco', 'refrescos', 'jugo', 'jugos', 'soda'] },
  { emoji: '🍺', keywords: ['cerveza', 'cervezas', 'bar'] },
  { emoji: '🍷', keywords: ['vino', 'vinos', 'wine'] },
  { emoji: '🎁', keywords: ['promocion', 'promoción', 'promociones', 'oferta', 'ofertas', 'descuento', 'descuentos', 'regalo', 'regalos'] },
  { emoji: '🛵', keywords: ['delivery', 'reparto', 'envio', 'envío', 'domicilio'] },
  { emoji: '🛍️', keywords: ['tienda', 'shop', 'store'] },
  { emoji: '💊', keywords: ['farmacia', 'salud', 'medicina', 'medicinas'] },
  { emoji: '💄', keywords: ['belleza', 'maquillaje', 'cosmetica', 'cosmética'] },
  { emoji: '👕', keywords: ['ropa', 'moda', 'camisa', 'camiseta', 'vestuario'] },
  { emoji: '💻', keywords: ['tecnologia', 'tecnología', 'electronica', 'electrónica', 'computador', 'computadora', 'laptop'] },
  { emoji: '🐶', keywords: ['mascota', 'mascotas', 'pet', 'pets', 'perro', 'perros'] },
  { emoji: '🧽', keywords: ['limpieza', 'aseo'] },
  { emoji: '🏠', keywords: ['hogar', 'casa', 'home'] },
  { emoji: '🛠️', keywords: ['ferreteria', 'ferretería', 'herramienta', 'herramientas', 'servicio', 'servicios', 'reparacion', 'reparación'] },
  { emoji: '🎓', keywords: ['educacion', 'educación', 'curso', 'cursos', 'academia', 'clases'] },
  { emoji: '🏋️', keywords: ['deporte', 'deportes', 'fitness', 'gym', 'gimnasio'] },
  { emoji: '🚗', keywords: ['auto', 'autos', 'carro', 'carros', 'repuesto', 'repuestos'] },
  { emoji: '🎵', keywords: ['musica', 'música', 'audio'] },
  { emoji: '🎮', keywords: ['juego', 'juegos', 'gaming', 'gamer'] },
  { emoji: '💎', keywords: ['premium', 'destacado', 'destacados', 'especial', 'especiales', 'deluxe', 'signature'] },
] as const;

const SYSTEM_PROMPT =
  'Eres un asistente experto en taxonomia comercial. ' +
  'Debes sugerir exactamente un solo emoji Unicode estilo WhatsApp para representar una categoria. ' +
  'No expliques de mas y no devuelvas texto fuera del JSON. ' +
  'Responde UNICAMENTE JSON valido con esta forma exacta: ' +
  '{"emoji": string, "reason": string, "confidence": number}. ' +
  'emoji debe ser un solo emoji Unicode visible y apropiado para la categoria. ' +
  'Si la categoria habla de hamburguesas usa 🍔, pizza 🍕, bebidas 🥤, postres 🍰, promociones 🎁, delivery 🛵, servicios 🛠️, mascotas 🐶, tecnologia 💻, belleza 💄. ' +
  'reason debe ser breve en espanol. confidence debe estar entre 0 y 1.';

type EmojiSuggestion = {
  emoji: string;
  reason: string;
  confidence: number;
};

type KeywordEmojiSuggestion = EmojiSuggestion & {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: 'Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await enforceAiLimits(supabase, comercioId);

    const localSuggestion = suggestEmojiByKeyword(categoryName, context);
    if (localSuggestion) {
      return jsonResponse(
        {
          emoji: localSuggestion.emoji,
          reason: localSuggestion.reason,
          confidence: localSuggestion.confidence,
          credits_charged: 0,
        },
        200,
      );
    }

    if (!geminiApiKey) {
      return jsonResponse(
        {
          emoji: FALLBACK_EMOJI,
          reason: 'No hubo match local y la IA no esta configurada.',
          confidence: 0.4,
          credits_charged: 0,
        },
        200,
      );
    }

    await hasEnoughCredits(supabase, comercioId, COST_CATEGORY_ICON);

    const aiSuggestion = await suggestEmojiWithGemini({
      apiKey: geminiApiKey,
      supabase,
      comercioId,
      categoryName,
      context,
    });

    await deductCredits(supabase, comercioId, COST_CATEGORY_ICON, 'category_emoji_suggestion', {
      function: 'generate-category-icon-gemini',
      category_name: categoryName,
      source: 'gemini',
      emoji: aiSuggestion.emoji,
    });

    return jsonResponse(
      {
        emoji: aiSuggestion.emoji,
        reason: aiSuggestion.reason,
        confidence: aiSuggestion.confidence,
        credits_charged: COST_CATEGORY_ICON,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(
      {
        emoji: FALLBACK_EMOJI,
        reason: message || 'No se pudo sugerir un emoji.',
        confidence: 0.35,
        credits_charged: 0,
      },
      200,
    );
  }
});

function suggestEmojiByKeyword(
  categoryName: string,
  context = '',
): KeywordEmojiSuggestion | null {
  const haystack = normalizeMatchText(`${categoryName} ${context}`);
  if (!haystack) {
    return null;
  }

  let bestRule: (typeof EMOJI_RULES)[number] | null = null;
  let bestScore = 0;
  let bestMatches: string[] = [];
  const normalizedCategory = normalizeMatchText(categoryName);

  for (const rule of EMOJI_RULES) {
    const matches: string[] = [];
    let score = 0;

    for (const keyword of rule.keywords) {
      const normalizedKeyword = normalizeMatchText(keyword);
      if (!normalizedKeyword || !haystack.includes(normalizedKeyword)) {
        continue;
      }

      matches.push(keyword);
      score += normalizedKeyword.includes(' ') ? 5 : 3;
      if (normalizedCategory.includes(normalizedKeyword)) {
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
    emoji: bestRule.emoji,
    reason: `Keywords detectadas: ${bestMatches.join(', ')}`,
    confidence: Math.min(0.82 + (bestScore * 0.02), 0.98),
    score: bestScore,
  };
}

async function suggestEmojiWithGemini(params: {
  apiKey: string;
  supabase: ReturnType<typeof createClient>;
  comercioId: string;
  categoryName: string;
  context: string;
}): Promise<EmojiSuggestion> {
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
                'Sugiere un solo emoji Unicode apropiado para representar la categoria.',
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            emoji: { type: 'string' },
            reason: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['emoji', 'reason', 'confidence'],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini error (${GEMINI_MODEL}): ${await response.text()}`);
  }

  const completion = await response.json();
  await recordGeminiUsage(params.supabase, params.comercioId, completion?.usageMetadata);

  const parsed = safeParseJson(extractText(completion));
  const emoji = normalizeEmoji(parsed?.emoji);

  return {
    emoji: emoji ?? FALLBACK_EMOJI,
    reason: normalizeString(parsed?.reason) || 'Emoji sugerido por IA.',
    confidence: normalizeConfidence(parsed?.confidence, emoji == null ? 0.45 : 0.78),
  };
}

function normalizeEmoji(value: unknown): string | null {
  const emoji = normalizeString(value);
  if (!emoji) {
    return null;
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = [...segmenter.segment(emoji)].map((segment) => segment.segment);
  if (graphemes.length !== 1) {
    return null;
  }

  return /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(emoji)
    ? emoji
    : null;
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

function normalizeConfidence(value: unknown, fallback = 0.7): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
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
