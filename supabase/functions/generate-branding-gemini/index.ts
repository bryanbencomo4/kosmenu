/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type BrandingStyle = 'rounded' | 'sharp' | 'pill';

type BrandingResult = {
  color_principal: string;
  color_secundario: string;
  fuente_titulos: string;
  fuente_cuerpo: string;
  estilo_botones: BrandingStyle;
  mood_tags: string[];
  descripcion_visual: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-comercio-id',
};

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT =
  'Eres un Director de Arte Senior especializado en branding para restaurantes. ' +
  'Tu trabajo es traducir el concepto del usuario en una identidad visual clara, coherente y utilizable en producto digital. ' +
  'Debes: ' +
  '1. Definir una paleta tecnica con colores HEX validos. ' +
  '2. Seleccionar dos fuentes de Google Fonts que contrasten bien entre si: una para titulos y una para cuerpo de texto. ' +
  '3. Elegir el estilo de botones mas adecuado entre: rounded, sharp o pill. ' +
  '4. Generar etiquetas de mood visual que ayuden a renderizar el estilo posteriormente. ' +
  '5. Redactar una descripcion visual breve, concreta y accionable para diseño de interfaz. ' +
  'Reglas estrictas: ' +
  'Responde UNICAMENTE JSON valido. ' +
  'No escribas texto fuera del JSON. ' +
  'Usa exactamente esta estructura: ' +
  '{' +
  '"color_principal": string,' +
  '"color_secundario": string,' +
  '"fuente_titulos": string,' +
  '"fuente_cuerpo": string,' +
  '"estilo_botones": "rounded" | "sharp" | "pill",' +
  '"mood_tags": string[],' +
  '"descripcion_visual": string' +
  '}. ' +
  'Los colores deben estar en formato HEX de 6 digitos, por ejemplo: #C84B31. ' +
  'Las fuentes deben ser nombres reales de Google Fonts. ' +
  'Use ONLY official Google Fonts names. If unsure, default to popular ones like Montserrat, Roboto, or Open Sans. ' +
  'mood_tags debe contener entre 3 y 6 tags cortos. ' +
  'descripcion_visual debe ser una sola frase o un parrafo breve, no una lista. ' +
  'No inventes campos extra.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const promptUsuario = normalizeString(body.prompt_usuario ?? body.promptUsuario);
    const imageUrl = normalizeString(body.image_url ?? body.imageUrl);
    const comercioId = resolveComercioId(req, body);

    if (!promptUsuario) {
      return jsonResponse({ error: 'Missing required field: prompt_usuario' }, 400);
    }

    if (!comercioId) {
      return jsonResponse(
        { error: 'Missing comercio_id. Provide it in x-comercio-id header or request body.' },
        400,
      );
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

    const branding = await generateBrandingWithGemini({
      promptUsuario,
      imageUrl,
      apiKey: geminiApiKey,
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: updatedComercio, error: updateError } = await supabase
      .from('comercios')
      .update({
        branding_ia: branding,
      })
      .eq('id', comercioId)
      .select('id, branding_ia')
      .maybeSingle();

    if (updateError) {
      throw new Error(`Error updating comercio branding_ia: ${updateError.message}`);
    }

    if (!updatedComercio?.id) {
      return jsonResponse({ error: 'Comercio not found.' }, 404);
    }

    return jsonResponse(
      {
        ok: true,
        comercio_id: comercioId,
        branding_ia: branding,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

async function generateBrandingWithGemini(params: {
  promptUsuario: string;
  imageUrl?: string;
  apiKey: string;
}): Promise<BrandingResult> {
  const parts: Array<Record<string, unknown>> = [
    {
      text: buildUserPrompt(params.promptUsuario, params.imageUrl),
    },
  ];

  if (params.imageUrl) {
    const imageInput = await toInlineImageData(params.imageUrl);
    parts.push({
      inline_data: imageInput,
    });
  }

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
          parts,
        },
      ],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            color_principal: { type: 'string' },
            color_secundario: { type: 'string' },
            fuente_titulos: { type: 'string' },
            fuente_cuerpo: { type: 'string' },
            estilo_botones: {
              type: 'string',
              enum: ['rounded', 'sharp', 'pill'],
            },
            mood_tags: {
              type: 'array',
              items: { type: 'string' },
            },
            descripcion_visual: { type: 'string' },
          },
          required: [
            'color_principal',
            'color_secundario',
            'fuente_titulos',
            'fuente_cuerpo',
            'estilo_botones',
            'mood_tags',
            'descripcion_visual',
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini error (${GEMINI_MODEL}): ${errorText}`);
  }

  const completion = await response.json();
  const text = completion?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || typeof text !== 'string') {
    throw new Error('Gemini response did not include text output');
  }

  const parsed = parseBrandingJson(text);

  try {
    return await normalizeBranding(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid branding payload';
    throw new Error(`Gemini returned invalid branding JSON: ${message}`);
  }
}

function resolveComercioId(req: Request, body: Record<string, unknown>): string {
  const fromHeader = normalizeString(req.headers.get('x-comercio-id'));
  if (fromHeader) {
    return fromHeader;
  }

  return normalizeString(body.comercio_id ?? body.comercioId);
}

function buildUserPrompt(promptUsuario: string, imageUrl?: string): string {
  if (imageUrl) {
    return (
      `Concepto del usuario: ${promptUsuario}\n\n` +
      'Usa tambien la imagen como referencia visual del local, su ambiente, materiales, iluminacion y estilo general. ' +
      'Genera la identidad visual siguiendo el esquema solicitado.'
    );
  }

  return (
    `Concepto del usuario: ${promptUsuario}\n\n` +
    'Genera la identidad visual siguiendo el esquema solicitado.'
  );
}

async function toInlineImageData(imageUrl: string): Promise<{ mime_type: string; data: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Could not download image_url: ${response.status}`);
  }

  const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
  const imageBytes = new Uint8Array(await response.arrayBuffer());
  return {
    mime_type: mimeType,
    data: toBase64(imageBytes),
  };
}

function parseBrandingJson(rawText: string): unknown {
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Could not parse Gemini branding JSON response');
  }
}

async function normalizeBranding(value: unknown): Promise<BrandingResult> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Branding payload must be an object');
  }

  const map = value as Record<string, unknown>;
  const colorPrincipal = normalizeHexColor(map.color_principal);
  const colorSecundario = normalizeHexColor(map.color_secundario);
  const fuenteTitulos = await resolveGoogleFontOrFallback(
    normalizeString(map.fuente_titulos),
    'Montserrat',
  );
  const fuenteCuerpo = await resolveGoogleFontOrFallback(
    normalizeString(map.fuente_cuerpo),
    'Roboto',
  );
  const estiloBotones = normalizeButtonStyle(map.estilo_botones);
  const moodTags = normalizeMoodTags(map.mood_tags);
  const descripcionVisual = normalizeString(map.descripcion_visual);

  if (!colorPrincipal || !colorSecundario) {
    throw new Error('Gemini returned invalid HEX colors for branding_ia');
  }

  if (!descripcionVisual) {
    throw new Error('Gemini returned empty descripcion_visual for branding_ia');
  }

  return {
    color_principal: colorPrincipal,
    color_secundario: colorSecundario,
    fuente_titulos: fuenteTitulos,
    fuente_cuerpo: fuenteCuerpo,
    estilo_botones: estiloBotones,
    mood_tags: moodTags,
    descripcion_visual: descripcionVisual,
  };
}

function normalizeHexColor(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }

  const candidate = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(candidate) ? candidate.toUpperCase() : '';
}

function normalizeButtonStyle(value: unknown): BrandingStyle {
  const raw = normalizeString(value).toLowerCase();
  if (raw === 'sharp' || raw === 'pill') {
    return raw;
  }
  return 'rounded';
}

function normalizeMoodTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const tag = normalizeString(item).toLowerCase();
    if (tag) {
      unique.add(tag);
    }
  }

  return Array.from(unique).slice(0, 6);
}

function normalizeString(value: unknown): string {
  const raw = value?.toString().trim();
  return raw && raw.length > 0 ? raw : '';
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function resolveGoogleFontOrFallback(fontName: string, fallback: string): Promise<string> {
  const candidate = normalizeString(fontName);
  if (!isLikelyFontName(candidate)) {
    return fallback;
  }

  const exists = await googleFontExists(candidate);
  return exists ? candidate : fallback;
}

function isLikelyFontName(value: string): boolean {
  if (!value) {
    return false;
  }
  return /^[A-Za-z0-9][A-Za-z0-9\s\-+&.']{1,63}$/.test(value);
}

async function googleFontExists(fontName: string): Promise<boolean> {
  const encodedFamily = encodeURIComponent(fontName).replace(/%20/g, '+');
  const url = `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`;

  try {
    const response = await fetch(url, {
      headers: {
        // Google Fonts can be stricter without a browser-like UA.
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!response.ok) {
      return false;
    }

    const css = await response.text();
    return css.toLowerCase().includes('@font-face');
  } catch {
    return false;
  }
}