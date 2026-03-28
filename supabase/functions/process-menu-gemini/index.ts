/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Product = {
  nombre: string;
  descripcion: string;
  precio: number;
};

type Category = {
  nombre: string;
  productos: Product[];
};

type ParsedMenu = {
  categorias: Category[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT =
  'Analiza esta imagen de un menu de restaurante. Extrae todas las categorias y sus productos (nombre, descripcion, precio). ' +
  'Devuelve UNICAMENTE un JSON con este formato: ' +
  '{"categorias": [{"nombre": "...", "productos": [{"nombre": "...", "descripcion": "...", "precio": 0.0}]}]}';

const GEMINI_MODEL = 'gemini-2.5-flash';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const imageUrl: string | undefined = body.image_url ?? body.imageUrl;
    const comercioId: string | undefined = body.comercio_id ?? body.comercioId;

    if (!imageUrl || !comercioId) {
      return jsonResponse(
        { error: 'Missing required fields: image_url and comercio_id' },
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

    const parsedMenu = await extractMenuWithGemini(imageUrl, geminiApiKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let createdCategories = 0;
    let createdProducts = 0;

    for (let i = 0; i < parsedMenu.categorias.length; i++) {
      const category = parsedMenu.categorias[i];

      const { data: categoryData, error: categoryError } = await supabase
        .from('categorias')
        .insert({
          comercio_id: comercioId,
          nombre: (category.nombre || 'Categoria').trim(),
          orden: i,
          creado_por_ia: true,
          confianza_ia: 0.9,
        })
        .select('id')
        .single();

      if (categoryError) {
        throw new Error(`Error inserting categoria: ${categoryError.message}`);
      }

      createdCategories += 1;
      const categoriaId = categoryData.id as string;

      const productRows = (category.productos || []).map((product) => ({
        comercio_id: comercioId,
        categoria_id: categoriaId,
        nombre: (product.nombre || 'Producto').trim(),
        descripcion: (product.descripcion || '').trim(),
        precio: normalizePrice(product.precio),
        creado_por_ia: true,
        confianza_ia: 0.9,
      }));

      if (productRows.length > 0) {
        const { error: productsError } = await supabase.from('productos').insert(productRows);
        if (productsError) {
          throw new Error(`Error inserting productos: ${productsError.message}`);
        }

        createdProducts += productRows.length;
      }
    }

    return jsonResponse(
      {
        ok: true,
        comercio_id: comercioId,
        created_categories: createdCategories,
        created_products: createdProducts,
        parsed_menu: parsedMenu,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

async function extractMenuWithGemini(imageUrl: string, apiKey: string): Promise<ParsedMenu> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Could not download image_url: ${imageResponse.status}`);
  }

  const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
  const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
  const imageBase64 = toBase64(imageBytes);

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPT },
            {
              inline_data: {
                mime_type: contentType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
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

  const parsed = parseMenuJson(text);

  if (!Array.isArray(parsed.categorias)) {
    throw new Error('Invalid JSON shape: categorias must be an array');
  }

  parsed.categorias = parsed.categorias.map((category) => ({
    nombre: (category?.nombre || 'Categoria').toString(),
    productos: dedupeProducts(
      Array.isArray(category?.productos)
        ? category.productos.map((product) => ({
            nombre: (product?.nombre || 'Producto').toString(),
            descripcion: (product?.descripcion || '').toString(),
            precio: normalizePrice(product?.precio),
          }))
        : [],
    ),
  }));

  return parsed;
}

function parseMenuJson(rawText: string): ParsedMenu {
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as ParsedMenu;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = cleaned.slice(start, end + 1);
      return JSON.parse(candidate) as ParsedMenu;
    }
    throw new Error('Could not parse Gemini JSON response');
  }
}

function normalizePrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const normalized = value.trim().replaceAll(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0.0;
  }

  return 0.0;
}

function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  const unique: Product[] = [];

  for (const product of products) {
    const normalizedName = product.nombre.trim().toLowerCase();
    const normalizedDescription = product.descripcion.trim().toLowerCase();
    const key = `${normalizedName}|${normalizedDescription}|${normalizePrice(product.precio)}`;

    if (!normalizedName || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(product);
  }

  return unique;
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
