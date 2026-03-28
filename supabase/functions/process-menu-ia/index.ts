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

const SYSTEM_PROMPT =
  'Actuas como un experto en gastronomia y estructuracion de datos. ' +
  'Analiza la imagen del menu y responde SOLO JSON valido con la forma exacta: ' +
  '{"categorias":[{"nombre":"Nombre de Categoria","productos":[{"nombre":"Plato","descripcion":"Detalles","precio":10.99}]}]}. ' +
  'No agregues texto fuera del JSON. Si un precio no esta visible, usa 0.0.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const imageUrl: string | undefined = body.image_url ?? body.imageUrl;
    const comercioId: string | undefined = body.comercio_id ?? body.comercioId;

    if (!imageUrl || !comercioId) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: image_url and comercio_id',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!openAiKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error:
            'Missing env vars. Required: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const aiMenu = await extractMenuWithOpenAI(imageUrl, openAiKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let createdCategories = 0;
    let createdProducts = 0;

    for (let i = 0; i < aiMenu.categorias.length; i++) {
      const category = aiMenu.categorias[i];

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

      const rows = (category.productos || []).map((product) => ({
        comercio_id: comercioId,
        categoria_id: categoriaId,
        nombre: (product.nombre || 'Producto').trim(),
        descripcion: (product.descripcion || '').trim(),
        precio: normalizePrice(product.precio),
        creado_por_ia: true,
        confianza_ia: 0.9,
      }));

      if (rows.length > 0) {
        const { error: productError } = await supabase.from('productos').insert(rows);
        if (productError) {
          throw new Error(`Error inserting productos: ${productError.message}`);
        }
        createdProducts += rows.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        comercio_id: comercioId,
        created_categories: createdCategories,
        created_products: createdProducts,
        parsed_menu: aiMenu,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractMenuWithOpenAI(imageUrl: string, openAiKey: string): Promise<ParsedMenu> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'menu_schema',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              categorias: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    nombre: { type: 'string' },
                    productos: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          nombre: { type: 'string' },
                          descripcion: { type: 'string' },
                          precio: { type: 'number' },
                        },
                        required: ['nombre', 'descripcion', 'precio'],
                      },
                    },
                  },
                  required: ['nombre', 'productos'],
                },
              },
            },
            required: ['categorias'],
          },
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analiza esta imagen del menu y devuelve el JSON requerido.',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${errorText}`);
  }

  const completion = await response.json();
  const rawContent = completion?.choices?.[0]?.message?.content;

  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('OpenAI response did not include JSON content');
  }

  let parsed: ParsedMenu;
  try {
    parsed = JSON.parse(rawContent) as ParsedMenu;
  } catch {
    throw new Error('Could not parse OpenAI JSON response');
  }

  if (!Array.isArray(parsed.categorias)) {
    throw new Error('Invalid JSON shape: categorias must be an array');
  }

  parsed.categorias = parsed.categorias.map((cat) => ({
    nombre: (cat?.nombre || 'Categoria').toString(),
    productos: Array.isArray(cat?.productos)
      ? cat.productos.map((p) => ({
          nombre: (p?.nombre || 'Producto').toString(),
          descripcion: (p?.descripcion || '').toString(),
          precio: normalizePrice(p?.precio),
        }))
      : [],
  }));

  return parsed;
}

function normalizePrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replaceAll(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
