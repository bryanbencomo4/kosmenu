/// <reference path="../_shared/edge-runtime.d.ts" />

type SupportedCurrency = 'USD' | 'VES' | 'COP' | 'EUR';

type ExchangeRateResult = {
  moneda_origen: 'USD';
  moneda_destino: SupportedCurrency;
  tasa_sugerida: number;
  mensaje: string;
  fuente: 'gemini';
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT =
  'Eres un asistente financiero para comercios que necesitan una tasa de referencia util para cobrar. ' +
  'Tu tarea es sugerir una tasa de cambio COMERCIAL aproximada desde USD hacia la moneda destino. ' +
  'No des una tasa oficial ni explicaciones largas. Debe ser una cifra util como punto de partida para configurar un negocio. ' +
  'Responde UNICAMENTE JSON valido con esta estructura exacta: ' +
  '{' +
  '"moneda_origen":"USD",' +
  '"moneda_destino":"USD"|"VES"|"COP"|"EUR",' +
  '"tasa_sugerida":number,' +
  '"mensaje":string,' +
  '"fuente":"gemini"' +
  '}. ' +
  'Reglas: tasa_sugerida debe ser un numero positivo. ' +
  'mensaje debe ser corto, en espanol, y dejar claro que el usuario puede ajustarla manualmente. ' +
  'No agregues otros campos.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const targetCurrency = normalizeCurrency(body.target_currency ?? body.targetCurrency);
    const promptUsuario = normalizeString(body.prompt_usuario ?? body.promptUsuario);

    if (!targetCurrency) {
      return jsonResponse({ error: 'Missing or invalid target_currency' }, 400);
    }

    if (targetCurrency === 'USD') {
      return jsonResponse(
        {
          moneda_origen: 'USD',
          moneda_destino: 'USD',
          tasa_sugerida: 1,
          mensaje: 'USD sobre USD no requiere conversion. Puedes dejarla en 1.',
          fuente: 'gemini',
        },
        200,
      );
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({ error: 'Missing env var GEMINI_API_KEY' }, 500);
    }

    const result = await suggestExchangeRateWithGemini({
      apiKey: geminiApiKey,
      targetCurrency,
      promptUsuario,
    });

    return jsonResponse(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

async function suggestExchangeRateWithGemini(params: {
  apiKey: string;
  targetCurrency: SupportedCurrency;
  promptUsuario: string;
}): Promise<ExchangeRateResult> {
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
          parts: [{ text: buildUserPrompt(params.targetCurrency, params.promptUsuario) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            moneda_origen: { type: 'string', enum: ['USD'] },
            moneda_destino: { type: 'string', enum: ['USD', 'VES', 'COP', 'EUR'] },
            tasa_sugerida: { type: 'number' },
            mensaje: { type: 'string' },
            fuente: { type: 'string', enum: ['gemini'] },
          },
          required: [
            'moneda_origen',
            'moneda_destino',
            'tasa_sugerida',
            'mensaje',
            'fuente',
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

  return normalizeExchangeRate(parseJson(text), params.targetCurrency);
}

function buildUserPrompt(targetCurrency: SupportedCurrency, promptUsuario: string): string {
  const context = promptUsuario
    ? `Contexto comercial adicional: ${promptUsuario}\n\n`
    : '';

  return (
    `${context}Sugiere una tasa de referencia comercial desde USD hacia ${targetCurrency}. ` +
    'La cifra debe ser util para configurar cobros en un comercio latinoamericano y no pretende ser una tasa oficial exacta.'
  );
}

function parseJson(rawText: string): unknown {
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Could not parse Gemini exchange rate JSON response');
  }
}

function normalizeExchangeRate(
  value: unknown,
  targetCurrency: SupportedCurrency,
): ExchangeRateResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Exchange rate payload must be an object');
  }

  const map = value as Record<string, unknown>;
  const rate = normalizePositiveNumber(map.tasa_sugerida);
  const message =
    normalizeString(map.mensaje) ||
    `Tasa sugerida por IA para ${targetCurrency}. Puedes ajustarla manualmente.`;

  if (rate <= 0) {
    throw new Error('Gemini returned an invalid tasa_sugerida');
  }

  return {
    moneda_origen: 'USD',
    moneda_destino: targetCurrency,
    tasa_sugerida: rate,
    mensaje: message,
    fuente: 'gemini',
  };
}

function normalizeCurrency(value: unknown): SupportedCurrency | null {
  const raw = normalizeString(value).toUpperCase();
  if (raw === 'USD' || raw === 'VES' || raw === 'COP' || raw === 'EUR') {
    return raw;
  }
  return null;
}

function normalizePositiveNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value : 0;
  }

  const parsed = Number.parseFloat(normalizeString(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Number(parsed.toFixed(parsed >= 100 ? 2 : 4));
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}