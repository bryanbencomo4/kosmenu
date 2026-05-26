/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AiUsageError,
  COST_IMAGE,
  addCredits,
  enforceAiLimits,
  recordAiImagesGenerated,
  recordGeminiUsage,
} from '../_shared/ai-usage.ts';
import { buildProductImagePrompt } from '../_shared/product-image-prompt.ts';

type JobRow = {
  id: string;
  commerce_id: string;
  product_id: string;
  catalog_id?: string | null;
  prompt: string;
  status: string;
  credits_charged?: number | null;
};

type ProductRow = {
  id: string;
  comercio_id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  imagen_url?: string | null;
  imagen_source_type?: string | null;
};

type CategoryRow = {
  id: string;
  nombre: string;
};

type CommerceRow = {
  id: string;
  nombre?: string | null;
  categoria?: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ai-image-worker-secret',
};

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_BUCKET = 'product-images';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'Missing env vars',
          message: 'GEMINI_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await authorizeRequest(req, supabase);

    const body = await req.json();
    const commerceId = normalizeString(body.commerce_id ?? body.comercio_id);
    const maxJobs = Math.min(5, Math.max(1, normalizeInteger(body.limit) || 2));

    let jobsQuery = supabase
      .from('ai_image_jobs')
      .select('id, commerce_id, product_id, catalog_id, prompt, status, credits_charged')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(maxJobs);

    if (commerceId) {
      jobsQuery = jobsQuery.eq('commerce_id', commerceId);
    }

    const { data: pendingRows, error: pendingError } = await jobsQuery;

    if (pendingError) {
      throw new Error(`Error loading AI image jobs: ${pendingError.message}`);
    }

    const jobs = ((pendingRows as JobRow[] | null) ?? []).map((row) => ({
      ...row,
      id: normalizeString(row.id),
      commerce_id: normalizeString(row.commerce_id),
      product_id: normalizeString(row.product_id),
      prompt: normalizeString(row.prompt),
      status: normalizeString(row.status),
      credits_charged: Number(row.credits_charged ?? COST_IMAGE),
    }));

    if (jobs.length === 0) {
      return jsonResponse(
        {
          ok: true,
          commerce_id: commerceId || null,
          processed: 0,
          completed: 0,
          failed: 0,
          message: 'No hay jobs pendientes para procesar.',
        },
        200,
      );
    }

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      const outcome = await processJob({
        supabase,
        geminiApiKey,
        job,
      });
      if (outcome === 'completed') {
        completed += 1;
      } else {
        failed += 1;
      }
    }

    return jsonResponse(
      {
        ok: true,
        commerce_id: commerceId || null,
        processed: jobs.length,
        completed,
        failed,
        credits_strategy:
          'Los creditos se reservan al encolar. Si una generacion falla, el worker reembolsa ese credito y marca el job como failed.',
      },
      200,
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'AI image job processing failed', message }, 500);
  }
});

async function authorizeRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const providedSecret = normalizeString(req.headers.get('x-ai-image-worker-secret'));
  if (!providedSecret) {
    throw new HttpError('Unauthorized request. Missing AI image worker secret.', 401);
  }

  const { data, error } = await supabase
    .from('internal_worker_secrets')
    .select('secret')
    .eq('worker_name', 'ai_image_jobs_worker')
    .maybeSingle();

  if (error) {
    throw new HttpError(`Error loading worker secret: ${error.message}`, 500);
  }

  const expectedSecret = normalizeString(data?.secret);
  if (!expectedSecret) {
    throw new HttpError('Missing internal worker secret for ai_image_jobs_worker.', 500);
  }

  if (providedSecret !== expectedSecret) {
    throw new HttpError('Unauthorized request. Invalid AI image worker secret.', 401);
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function processJob(params: {
  supabase: ReturnType<typeof createClient>;
  geminiApiKey: string;
  job: JobRow;
}): Promise<'completed' | 'failed'> {
  const { supabase, geminiApiKey, job } = params;

  const { data: lockedJob, error: lockError } = await supabase
    .from('ai_image_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      error_message: null,
      model: IMAGE_MODEL,
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (lockError) {
    throw new Error(`Error locking AI image job ${job.id}: ${lockError.message}`);
  }

  if (!lockedJob?.id) {
    return 'failed';
  }

  await supabase
    .from('productos')
    .update({
      ai_image_status: 'processing',
      ai_image_error_message: null,
    })
    .eq('id', job.product_id);

  try {
    await enforceAiLimits(supabase, job.commerce_id);

    const product = await loadProduct(supabase, job.product_id);
    if (!product?.id) {
      throw new Error('Producto no encontrado para generar imagen IA.');
    }

    if (
      normalizeString(product.imagen_url).length > 0 &&
      normalizeString(product.imagen_source_type) === 'manual'
    ) {
      throw new Error('El producto ya tiene una imagen manual.');
    }

    const category = await loadCategory(supabase, product.categoria_id);
    const commerce = await loadCommerce(supabase, job.commerce_id);
    const prompt = job.prompt || buildPromptFromProduct(product, category, commerce);

    const generated = await generateImageWithGemini({
      apiKey: geminiApiKey,
      prompt,
      supabase,
      commerceId: job.commerce_id,
    });

    const objectPath = `${job.commerce_id}/ai_${job.product_id}_${job.id}.png`;
    const uploadBytes = base64ToBytes(generated.base64);

    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(objectPath, uploadBytes, {
        contentType: generated.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Error uploading generated image: ${uploadError.message}`);
    }

    const publicUrl = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(objectPath)
      .data.publicUrl;

    const { error: updateProductError } = await supabase
      .from('productos')
      .update({
        imagen_url: publicUrl,
        imagen_source_type: 'ai_generated',
        ai_image_status: 'completed',
        ai_image_error_message: null,
      })
      .eq('id', job.product_id);

    if (updateProductError) {
      throw new Error(`Error updating producto image: ${updateProductError.message}`);
    }

    const { error: completeJobError } = await supabase
      .from('ai_image_jobs')
      .update({
        status: 'completed',
        image_url: publicUrl,
        error_message: null,
        completed_at: new Date().toISOString(),
        model: IMAGE_MODEL,
      })
      .eq('id', job.id);

    if (completeJobError) {
      throw new Error(`Error completing AI image job: ${completeJobError.message}`);
    }

    await recordAiImagesGenerated(supabase, job.commerce_id, 1);
    return 'completed';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await addCredits(
      supabase,
      job.commerce_id,
      Number(job.credits_charged ?? COST_IMAGE),
      'ai_image_generation_refund',
      {
        function: 'process-ai-image-jobs',
        job_id: job.id,
        product_id: job.product_id,
        reason: message,
      },
    );

    await supabase
      .from('productos')
      .update({
        ai_image_status: 'failed',
        ai_image_error_message: message,
      })
      .eq('id', job.product_id);

    await supabase
      .from('ai_image_jobs')
      .update({
        status: 'failed',
        credits_charged: 0,
        error_message: message,
        completed_at: new Date().toISOString(),
        model: IMAGE_MODEL,
      })
      .eq('id', job.id);

    return 'failed';
  }
}

async function loadProduct(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('id, comercio_id, categoria_id, nombre, descripcion, imagen_url, imagen_source_type')
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading producto for AI image job: ${error.message}`);
  }

  return (data as ProductRow | null) ?? null;
}

async function loadCategory(
  supabase: ReturnType<typeof createClient>,
  categoryId: string,
): Promise<CategoryRow | null> {
  if (!categoryId) {
    return null;
  }

  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre')
    .eq('id', categoryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading categoria for AI image job: ${error.message}`);
  }

  return (data as CategoryRow | null) ?? null;
}

async function loadCommerce(
  supabase: ReturnType<typeof createClient>,
  commerceId: string,
): Promise<CommerceRow | null> {
  const { data, error } = await supabase
    .from('comercios')
    .select('id, nombre, categoria')
    .eq('id', commerceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading comercio for AI image job: ${error.message}`);
  }

  return (data as CommerceRow | null) ?? null;
}

function buildPromptFromProduct(
  product: ProductRow,
  category: CategoryRow | null,
  commerce: CommerceRow | null,
): string {
  return buildProductImagePrompt({
    productName: product.nombre,
    description: normalizeString(product.descripcion),
    categoryName: category?.nombre ?? undefined,
    businessName: commerce?.nombre ?? undefined,
    businessCategory: commerce?.categoria ?? undefined,
  });
}

async function generateImageWithGemini(params: {
  apiKey: string;
  prompt: string;
  supabase: ReturnType<typeof createClient>;
  commerceId: string;
}): Promise<{ base64: string; mimeType: string }> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent` +
    `?key=${encodeURIComponent(params.apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: params.prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: '1K',
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini image generation failed (${response.status}): ${errorText}`);
  }

  const completion = await response.json();
  await recordGeminiUsage(params.supabase, params.commerceId, completion?.usageMetadata);

  const parts = completion?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inlineData = part?.inlineData ?? part?.inline_data;
    const base64 = normalizeString(inlineData?.data);
    const mimeType = normalizeString(inlineData?.mimeType ?? inlineData?.mime_type) || 'image/png';
    if (base64.length > 0) {
      return {
        base64,
        mimeType,
      };
    }
  }

  throw new Error('Gemini no devolvio una imagen valida.');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  return Number.parseInt(String(value ?? '0'), 10) || 0;
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