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

type CatalogRecord = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  created: boolean;
};

class HttpResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'HttpResponseError';
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT =
  'Analiza este archivo de un menu de restaurante. Puede ser una imagen, un PDF, un CSV o texto exportado. ' +
  'Extrae todas las categorias y sus productos (nombre, descripcion, precio). ' +
  'Devuelve UNICAMENTE un JSON con este formato: ' +
  '{"categorias": [{"nombre": "...", "productos": [{"nombre": "...", "descripcion": "...", "precio": 0.0}]}]}';

const PROMPT_FROM_TEXT =
  'Analiza esta descripcion escrita de un menu de restaurante. ' +
  'Organiza el contenido en categorias y productos con nombre, descripcion y precio. ' +
  'No inventes categorias ni precios que no aparezcan o no puedan deducirse razonablemente del texto. ' +
  'Si una descripcion no existe, usa cadena vacia. Si un precio no aparece, usa 0.0. ' +
  'Devuelve UNICAMENTE un JSON con este formato: ' +
  '{"categorias": [{"nombre": "...", "productos": [{"nombre": "...", "descripcion": "...", "precio": 0.0}]}]}';

const GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_CATALOG_NAME = 'Menú Principal';
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const fileUrl: string | undefined = body.file_url ?? body.fileUrl ?? body.image_url ?? body.imageUrl;
    const promptTextRaw: unknown = body.prompt_text ?? body.promptText ?? body.menu_text ?? body.menuText;
    const promptText = typeof promptTextRaw === 'string' ? promptTextRaw.trim() : '';
    const comercioIdInput: unknown = body.comercio_id ?? body.comercioId;
    const comercioId =
      typeof comercioIdInput === 'string' ? comercioIdInput.trim() : '';
    const requestedCatalogName = normalizeCatalogName(body.catalog_name ?? body.nombre_catalogo);

    if ((!fileUrl && !promptText) || !comercioId) {
      return jsonResponse(
        { error: 'Missing required fields: (file_url or prompt_text) and comercio_id' },
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

    const parsedMenu = promptText
      ? await extractMenuFromPromptText(promptText, geminiApiKey)
      : await extractMenuWithGemini(fileUrl!, geminiApiKey);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: { persistSession: false },
      },
    );

    const catalog = await ensureCatalogForComercio(
      supabase,
      comercioId,
      requestedCatalogName,
    );

    let createdCategories = 0;
    let createdProducts = 0;

    for (let i = 0; i < parsedMenu.categorias.length; i++) {
      const category = parsedMenu.categorias[i];

      const { data: categoryData, error: categoryError } = await supabase
        .from('categorias')
        .insert({
          comercio_id: comercioId,
          catalogo_id: catalog.id,
          nombre: (category.nombre || 'Categoria').trim(),
          orden: i,
          creado_por_ia: true,
          confianza_ia: 0.9,
        })
        .select('id')
        .single();

      if (categoryError) {
        console.error('Error inserting categoria', {
          comercio_id: comercioId,
          catalogo_id: catalog.id,
          category_index: i,
          category_name: (category.nombre || 'Categoria').trim(),
          supabase_error: toSupabaseErrorLog(categoryError),
        });
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
          console.error('Error inserting productos', {
            comercio_id: comercioId,
            categoria_id: categoriaId,
            productos_count: productRows.length,
            first_producto: productRows[0],
            supabase_error: toSupabaseErrorLog(productsError),
          });
          throw new Error(`Error inserting productos: ${productsError.message}`);
        }

        createdProducts += productRows.length;
      }
    }

    return jsonResponse(
      {
        ok: true,
        comercio_id: comercioId,
        catalog_id: catalog.id,
        catalog_name: catalog.nombre,
        catalog_order: catalog.orden,
        catalog_active: catalog.activo,
        catalog_created: catalog.created,
        created_categories: createdCategories,
        created_products: createdProducts,
        parsed_menu: parsedMenu,
      },
      200,
    );
  } catch (error) {
    if (error instanceof HttpResponseError) {
      return jsonResponse(
        {
          error: error.message,
          retryable: error.retryable,
        },
        error.status,
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

async function extractMenuWithGemini(fileUrl: string, apiKey: string): Promise<ParsedMenu> {
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error(`Could not download file_url: ${fileResponse.status}`);
  }

  const contentType = normalizeContentType(fileResponse.headers.get('content-type'));
  const fileBytes = new Uint8Array(await fileResponse.arrayBuffer());

  return generateStructuredMenu(
    [buildGeminiRequestContent(contentType, fileBytes)],
    apiKey,
  );
}

async function extractMenuFromPromptText(promptText: string, apiKey: string): Promise<ParsedMenu> {
  return generateStructuredMenu(
    [
      {
        role: 'user',
        parts: [
          {
            text:
              `${PROMPT_FROM_TEXT}\n\n` +
              'Descripcion del negocio o del menu:\n' +
              promptText,
          },
        ],
      },
    ],
    apiKey,
  );
}

async function generateStructuredMenu(contents: Array<Record<string, unknown>>, apiKey: string): Promise<ParsedMenu> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetchGeminiWithRetry(url, contents);

  const completion = await response.json();
  const text = completion?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || typeof text !== 'string') {
    throw new HttpResponseError(
      'La IA no devolvio una respuesta valida para estructurar el menu.',
      502,
    );
  }

  return normalizeParsedMenu(parseMenuJson(text));
}

async function fetchGeminiWithRetry(
  url: string,
  contents: Array<Record<string, unknown>>,
): Promise<Response> {
  let lastErrorText = '';
  let lastStatus = 503;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (response.ok) {
      return response;
    }

    lastStatus = response.status;
    lastErrorText = await response.text();

    if (
      GEMINI_RETRYABLE_STATUS_CODES.has(response.status) &&
      attempt < GEMINI_MAX_ATTEMPTS
    ) {
      console.warn('Gemini transient error, retrying request', {
        model: GEMINI_MODEL,
        attempt,
        status: response.status,
        body: lastErrorText,
      });
      await delayMs(500 * attempt);
      continue;
    }

    if (GEMINI_RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new HttpResponseError(
        'El servicio de IA esta temporalmente saturado. Intenta de nuevo en unos segundos.',
        503,
        true,
      );
    }

    console.error('Gemini non-retryable error', {
      model: GEMINI_MODEL,
      status: response.status,
      body: lastErrorText,
    });
    throw new HttpResponseError(
      'La IA no pudo procesar el menu en este momento.',
      502,
    );
  }

  throw new HttpResponseError(
    `La IA no pudo procesar el menu tras varios intentos (status ${lastStatus}). ${lastErrorText}`,
    503,
    true,
  );
}

function normalizeParsedMenu(parsed: ParsedMenu): ParsedMenu {
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

function buildGeminiRequestContent(contentType: string, fileBytes: Uint8Array) {
  if (contentType.startsWith('text/') || contentType === 'application/csv') {
    const rawText = new TextDecoder().decode(fileBytes).trim();
    if (!rawText) {
      throw new Error('The uploaded text file is empty');
    }

    return {
      role: 'user',
      parts: [
        {
          text:
            `${PROMPT}\n\n` +
            `El contenido fuente se entrega como texto (${contentType}). ` +
            'Respeta categorias y precios tal como aparezcan en el archivo.\n\n' +
            rawText,
        },
      ],
    };
  }

  return {
    role: 'user',
    parts: [
      { text: PROMPT },
      {
        inline_data: {
          mime_type: contentType,
          data: toBase64(fileBytes),
        },
      },
    ],
  };
}

function normalizeContentType(value: string | null): string {
  const normalized = ((value ?? '').split(';')[0] ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'image/jpeg';
  }
  if (normalized === 'application/vnd.ms-excel') {
    return 'text/csv';
  }
  return normalized;
}

async function ensureCatalogForComercio(
  supabase: ReturnType<typeof createClient>,
  comercioId: string,
  requestedName?: string,
): Promise<CatalogRecord> {
  const catalogName = normalizeCatalogName(requestedName);
  const { data: existingCatalog, error: existingCatalogError } = await supabase
    .from('catalogos')
    .select('id, nombre, orden, activo')
    .eq('comercio_id', comercioId)
    .eq('nombre', catalogName)
    .limit(1)
    .maybeSingle();

  if (existingCatalogError) {
    throw new Error(`Error loading catalogo: ${existingCatalogError.message}`);
  }

  if (existingCatalog?.id) {
    return {
      id: existingCatalog.id as string,
      nombre: (existingCatalog.nombre || catalogName).toString(),
      orden: parseOrderValue(existingCatalog.orden),
      activo: existingCatalog.activo !== false,
      created: false,
    };
  }

  const { data: orderRows, error: orderError } = await supabase
    .from('catalogos')
    .select('orden')
    .eq('comercio_id', comercioId);

  if (orderError) {
    throw new Error(`Error loading catalogos order: ${orderError.message}`);
  }

  let nextOrder = 0;
  for (const row of orderRows || []) {
    const parsed = parseOrderValue((row as { orden?: unknown }).orden);
    if (parsed >= nextOrder) {
      nextOrder = parsed + 1;
    }
  }

  const { data: createdCatalog, error: createdCatalogError } = await supabase
    .from('catalogos')
    .insert({
      comercio_id: comercioId,
      nombre: catalogName,
      orden: nextOrder,
      activo: true,
    })
    .select('id, nombre, orden, activo')
    .single();

  if (createdCatalogError || !createdCatalog?.id) {
    throw new Error(
      `Error creating catalogo: ${createdCatalogError?.message || 'missing catalog id'}`,
    );
  }

  return {
    id: createdCatalog.id as string,
    nombre: (createdCatalog.nombre || catalogName).toString(),
    orden: parseOrderValue(createdCatalog.orden),
    activo: createdCatalog.activo !== false,
    created: true,
  };
}

function normalizeCatalogName(value: unknown): string {
  const raw = value?.toString().trim();
  return raw != null && raw.length > 0 ? raw : DEFAULT_CATALOG_NAME;
}

function parseOrderValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  return 0;
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

function delayMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toSupabaseErrorLog(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { raw_error: error };
  }

  const supabaseError = error as Record<string, unknown>;
  return {
    message: supabaseError.message ?? null,
    code: supabaseError.code ?? null,
    details: supabaseError.details ?? null,
    hint: supabaseError.hint ?? null,
  };
}
