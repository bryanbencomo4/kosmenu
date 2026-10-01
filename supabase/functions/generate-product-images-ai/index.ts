/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AiUsageError,
  COST_IMAGE,
  MAX_AI_IMAGES_ONBOARDING,
  addCredits,
  deductCredits,
  enforceAiLimits,
  enforceAiImageOnboardingLimit,
  hasEnoughCredits,
} from '../_shared/ai-usage.ts';
import {
  buildProductImagePrompt,
  detectKnownBrandRecord,
} from '../_shared/product-image-prompt.ts';

type ImageGenerationItem = {
  type: 'product';
  id: string;
  name: string;
  description?: string;
  categoryName?: string;
  imagePrompt?: string;
};

type ProductRow = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria_id: string;
  imagen_url?: string | null;
  ai_image_status?: string | null;
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
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-comercio-id',
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
    const commerceId = normalizeString(body.commerce_id ?? body.comercio_id);
    const catalogId = normalizeString(body.catalog_id ?? body.catalogo_id);
    const manualRequest = Array.isArray(body.items) && body.items.length > 0;

    if (!commerceId) {
      return jsonResponse(
        {
          error: 'Missing commerce_id',
          message: 'commerce_id is required',
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'Missing env vars',
          message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await enforceAiLimits(supabase, commerceId);

    let state = null;
    if (!manualRequest) {
      try {
        state = await enforceAiImageOnboardingLimit(supabase, commerceId);
      } catch (error) {
        // Reimport / second opt-in during onboarding: menu import already
        // succeeded; do not fail the client with 429 for a one-shot image quota.
        if (error instanceof AiUsageError && error.status === 429) {
          return jsonResponse(
            {
              ok: true,
              mode: 'queue',
              commerce_id: commerceId,
              requested_items: 0,
              enqueued_jobs: 0,
              planned_credits_cost: 0,
              skipped_reason: 'onboarding_image_limit',
              message:
                'La generacion de imagenes IA ya se uso una vez en onboarding. El menu se importo bien; no se vuelven a encolar imagenes.',
            },
            200,
          );
        }
        throw error;
      }
    }

    const items = await resolveItems({
      supabase,
      commerceId,
      catalogId,
      rawItems: body.items,
    });

    if (items.length === 0) {
      return jsonResponse(
        {
          ok: true,
          mode: 'queue',
          commerce_id: commerceId,
          requested_items: 0,
          enqueued_jobs: 0,
          planned_credits_cost: 0,
          message: manualRequest
            ? 'No hay productos elegibles para generar imagen IA.'
            : 'No hay productos elegibles sin imagen para generar durante onboarding.',
        },
        200,
      );
    }

    if (
      state != null &&
      items.length + state.ai_images_generated_count > MAX_AI_IMAGES_ONBOARDING
    ) {
      return jsonResponse(
        {
          ok: true,
          mode: 'queue',
          commerce_id: commerceId,
          requested_items: items.length,
          enqueued_jobs: 0,
          planned_credits_cost: 0,
          skipped_reason: 'onboarding_image_quota',
          message:
            'Se alcanzo el tope de imagenes IA del onboarding. El menu se importo bien; no se encolaron imagenes adicionales.',
        },
        200,
      );
    }

    const activeProductIds = await loadActiveJobProductIds(
      supabase,
      items.map((item) => item.id),
    );
    const itemsToEnqueue = items.filter((item) => !activeProductIds.has(item.id));
    const waitForWorker = manualRequest && items.length === 1;
    const commerce = await loadCommerce(supabase, commerceId);
    const batchId = crypto.randomUUID();
    let plannedCreditsCost = 0;
    let creditsCharged = false;
    let triggerRequestId: number | null = null;
    let triggerWarning: string | null = null;

    try {
      if (itemsToEnqueue.length > 0) {
        plannedCreditsCost = itemsToEnqueue.length * COST_IMAGE;
        await hasEnoughCredits(supabase, commerceId, plannedCreditsCost);
        await deductCredits(
          supabase,
          commerceId,
          plannedCreditsCost,
          'ai_image_generation_queue',
          {
            function: 'generate-product-images-ai',
            batch_id: batchId,
            items: itemsToEnqueue.length,
          },
        );
        creditsCharged = true;

        const jobRows = itemsToEnqueue.map((item) => {
          const basePrompt = buildProductImagePrompt({
            productName: item.name,
            description: item.description,
            categoryName: item.categoryName,
            businessName: commerce?.nombre ?? undefined,
            businessCategory: commerce?.categoria ?? undefined,
          });
          const promptOverride = normalizeString(item.imagePrompt);
          const knownBrand = detectKnownBrandRecord(
            item.name,
            item.description,
            item.categoryName,
          );
          const brandGuard = knownBrand
            ? ` Marca detectada (${knownBrand.label}): NO dibujes logo ni texto de marca; el sistema superpone el logo oficial después.`
            : '';
          const prompt = promptOverride
            ? [
                'Sigue EXACTAMENTE la solicitud del cliente como instrucción principal.',
                `Solicitud del cliente (obligatoria): ${promptOverride}`,
                'Si hay conflicto, prioriza la solicitud del cliente sobre sugerencias automáticas.',
                'Restricciones mínimas: composición 1:1, alta calidad, sin texto legible, sin logos inventados.',
                brandGuard,
              ].join(' ')
            : basePrompt;

          return {
            batch_id: batchId,
            commerce_id: commerceId,
            catalog_id: catalogId || null,
            product_id: item.id,
            prompt,
            status: 'pending',
            provider: 'google',
            credits_charged: COST_IMAGE,
          };
        });

        const { error: insertJobsError } = await supabase.from('ai_image_jobs').insert(jobRows);
        if (insertJobsError) {
          throw new Error(`Error creating AI image jobs: ${insertJobsError.message}`);
        }

        const productIds = itemsToEnqueue.map((item) => item.id);
        const { error: updateProductsError } = await supabase
          .from('productos')
          .update({
            ai_image_status: 'pending',
            ai_image_error_message: null,
          })
          .in('id', productIds);

        if (updateProductsError) {
          throw new Error(`Error updating product AI image status: ${updateProductsError.message}`);
        }

        if (state != null) {
          await supabase
            .from('comercios')
            .update({ ai_image_generation_used: true })
            .eq('id', commerceId);
        }
      }

      const trigger = await invokeImageWorker({
        supabase,
        supabaseUrl,
        commerceId,
        limit: Math.min(2, items.length),
        waitForCompletion: waitForWorker,
      });
      triggerRequestId = trigger.triggerRequestId;
      triggerWarning = trigger.triggerWarning;
    } catch (error) {
      const productIds = itemsToEnqueue.map((item) => item.id);
      await supabase.from('ai_image_jobs').delete().eq('batch_id', batchId);
      if (productIds.length > 0) {
        await supabase
          .from('productos')
          .update({
            ai_image_status: 'none',
            ai_image_error_message: null,
          })
          .in('id', productIds);
      }
      if (state != null && itemsToEnqueue.length > 0) {
        await supabase
          .from('comercios')
          .update({ ai_image_generation_used: false })
          .eq('id', commerceId)
          .eq('onboarding_completed', false);
      }
      if (creditsCharged) {
        await addCredits(supabase, commerceId, plannedCreditsCost, 'ai_image_generation_queue_refund', {
          function: 'generate-product-images-ai',
          batch_id: batchId,
        });
      }
      throw error;
    }

    const snapshot = items.length === 1 ? await loadProductImageSnapshot(supabase, items[0].id) : null;
    const alreadyQueuedOnly = itemsToEnqueue.length === 0;

    return jsonResponse(
      {
        ok: true,
        mode: 'queue',
        batch_id: batchId,
        commerce_id: commerceId,
        requested_items: items.length,
        enqueued_jobs: itemsToEnqueue.length,
        already_queued_jobs: items.length - itemsToEnqueue.length,
        planned_credits_cost: plannedCreditsCost,
        request_scope: state == null ? 'manual' : 'onboarding',
        remaining_quota_before_generation:
          state == null
            ? null
            : MAX_AI_IMAGES_ONBOARDING - state.ai_images_generated_count,
        trigger_request_id: triggerRequestId,
        trigger_warning: triggerWarning,
        image_url: snapshot?.imagen_url ?? null,
        ai_image_status: snapshot?.ai_image_status ?? null,
        credits_strategy:
          'Los creditos se reservan al encolar. Si una generacion falla, el worker reembolsa ese credito y revierte el uso neto para dejar la wallet intacta.',
        message: alreadyQueuedOnly
          ? 'Esa imagen ya estaba en proceso. Reintentamos generarla sin cobrar otro crédito.'
          : state == null
            ? waitForWorker && normalizeString(snapshot?.ai_image_status) === 'completed'
              ? 'Imagen generada con IA.'
              : 'Se encoló la generación de imagen y el backend disparó el worker.'
            : 'Se encoló la generación de imágenes y el backend disparó el worker. El cron de respaldo volverá a intentar cada minuto si quedan jobs pendientes.',
        items,
      },
      200,
    );
  } catch (error) {
    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'Image generation failed', message }, 500);
  }
});

async function resolveItems(params: {
  supabase: ReturnType<typeof createClient>;
  commerceId: string;
  catalogId: string;
  rawItems: unknown;
}): Promise<ImageGenerationItem[]> {
  const manualItems = normalizeItems(params.rawItems);
  if (manualItems.length > 0) {
    return manualItems.slice(0, MAX_AI_IMAGES_ONBOARDING);
  }

  if (!params.catalogId) {
    throw new AiUsageError(
      'Missing catalog_id or items',
      400,
      'Missing catalog_id',
    );
  }

  const { data: categoryRows, error: categoriesError } = await params.supabase
    .from('categorias')
    .select('id, nombre')
    .eq('comercio_id', params.commerceId)
    .eq('catalogo_id', params.catalogId)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });

  if (categoriesError) {
    throw new Error(`Error loading categorias for AI image queue: ${categoriesError.message}`);
  }

  const categories = ((categoryRows as CategoryRow[] | null) ?? []).map((row) => ({
    id: normalizeString(row.id),
    nombre: normalizeString(row.nombre) || 'Categoria',
  }));

  if (categories.length === 0) {
    return [];
  }

  const categoryIds = categories.map((row) => row.id);
  const categoryNameById = new Map(categories.map((row) => [row.id, row.nombre]));

  const { data: productRows, error: productsError } = await params.supabase
    .from('productos')
    .select('id, nombre, descripcion, categoria_id, imagen_url, ai_image_status')
    .eq('comercio_id', params.commerceId)
    .in('categoria_id', categoryIds)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });

  if (productsError) {
    throw new Error(`Error loading productos for AI image queue: ${productsError.message}`);
  }

  return (((productRows as ProductRow[] | null) ?? [])
    .filter((row) => (row.imagen_url ?? '').trim().length === 0)
    .filter((row) => normalizeString(row.ai_image_status) !== 'completed')
    .map((row) => ({
      type: 'product' as const,
      id: normalizeString(row.id),
      name: normalizeString(row.nombre) || 'Producto',
      description: normalizeString(row.descripcion),
      categoryName: categoryNameById.get(normalizeString(row.categoria_id)) ?? 'Categoria',
    }))
    .filter((row) => row.id.length > 0)
    .slice(0, MAX_AI_IMAGES_ONBOARDING));
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
    throw new Error(`Error loading comercio for AI image queue: ${error.message}`);
  }

  return (data as CommerceRow | null) ?? null;
}

async function loadActiveJobProductIds(
  supabase: ReturnType<typeof createClient>,
  productIds: string[],
): Promise<Set<string>> {
  const ids = productIds.map((id) => normalizeString(id)).filter((id) => id.length > 0);
  if (ids.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('ai_image_jobs')
    .select('product_id')
    .in('product_id', ids)
    .in('status', ['pending', 'processing']);

  if (error) {
    throw new Error(`Error loading active AI image jobs: ${error.message}`);
  }

  return new Set(
    ((data as Array<{ product_id?: string }> | null) ?? [])
      .map((row) => normalizeString(row.product_id))
      .filter((id) => id.length > 0),
  );
}

async function loadProductImageSnapshot(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<{
  imagen_url?: string | null;
  ai_image_status?: string | null;
} | null> {
  const { data, error } = await supabase
    .from('productos')
    .select('imagen_url, ai_image_status')
    .eq('id', productId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading generated product image: ${error.message}`);
  }

  return (data as { imagen_url?: string | null; ai_image_status?: string | null } | null) ?? null;
}

async function invokeImageWorker(params: {
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  commerceId: string;
  limit: number;
  waitForCompletion: boolean;
}): Promise<{ triggerRequestId: number | null; triggerWarning: string | null }> {
  if (params.waitForCompletion) {
    try {
      const { data: secretRow, error: secretError } = await params.supabase
        .from('internal_worker_secrets')
        .select('secret')
        .eq('worker_name', 'ai_image_jobs_worker')
        .maybeSingle();

      if (secretError) {
        throw new Error(secretError.message);
      }

      const secret = normalizeString(secretRow?.secret);
      if (!secret) {
        throw new Error('Missing internal worker secret for ai_image_jobs_worker.');
      }

      const response = await fetch(`${params.supabaseUrl}/functions/v1/process-ai-image-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-image-worker-secret': secret,
        },
        body: JSON.stringify({
          comercio_id: params.commerceId,
          limit: params.limit,
          source: 'enqueue_wait',
        }),
        signal: AbortSignal.timeout(50_000),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Worker HTTP ${response.status}: ${body.slice(0, 180)}`);
      }

      return { triggerRequestId: null, triggerWarning: null };
    } catch (error) {
      const waitWarning = error instanceof Error
        ? `No se pudo esperar al worker: ${error.message}`
        : 'No se pudo esperar al worker.';
      const fallback = await triggerImageWorkerRpc(params.supabase, params.commerceId, params.limit);
      return {
        triggerRequestId: fallback.triggerRequestId,
        triggerWarning: [waitWarning, fallback.triggerWarning].filter(Boolean).join(' '),
      };
    }
  }

  return triggerImageWorkerRpc(params.supabase, params.commerceId, params.limit);
}

async function triggerImageWorkerRpc(
  supabase: ReturnType<typeof createClient>,
  commerceId: string,
  limit: number,
): Promise<{ triggerRequestId: number | null; triggerWarning: string | null }> {
  try {
    const { data: triggerData, error: triggerError } = await supabase.rpc(
      'trigger_ai_image_job_processing',
      {
        p_commerce_id: commerceId,
        p_limit: limit,
      },
    );

    if (triggerError) {
      return {
        triggerRequestId: null,
        triggerWarning: `No se pudo disparar el worker inmediato: ${triggerError.message}`,
      };
    }

    return {
      triggerRequestId: Number(triggerData ?? 0) || null,
      triggerWarning: null,
    };
  } catch (error) {
    return {
      triggerRequestId: null,
      triggerWarning: error instanceof Error
        ? `No se pudo disparar el worker inmediato: ${error.message}`
        : 'No se pudo disparar el worker inmediato.',
    };
  }
}

function normalizeItems(value: unknown): ImageGenerationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ImageGenerationItem[] = [];
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue;
    }

    const item = rawItem as Record<string, unknown>;
    const type = normalizeString(item.type);
    const id = normalizeString(item.id);
    const name = normalizeString(item.name);

    if (type !== 'product' || !id || !name) {
      continue;
    }

    items.push({
      type: 'product',
      id,
      name,
      description: normalizeString(item.description),
      categoryName: normalizeString(item.category_name ?? item.categoryName),
      imagePrompt: normalizeString(item.image_prompt ?? item.imagePrompt).slice(0, 500),
    });
  }

  return items;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
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