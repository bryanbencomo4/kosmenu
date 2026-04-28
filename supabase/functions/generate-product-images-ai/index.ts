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

type ImageGenerationItem = {
  type: 'product';
  id: string;
  name: string;
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const state = manualRequest
      ? null
      : await enforceAiImageOnboardingLimit(supabase, commerceId);

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
          error: 'AI image limit reached',
          message: 'AI image generation is only available once during onboarding',
        },
        429,
      );
    }

    const plannedCreditsCost = items.length * COST_IMAGE;
    await hasEnoughCredits(supabase, commerceId, plannedCreditsCost);

    const batchId = crypto.randomUUID();
    let creditsCharged = false;
    let triggerRequestId: number | null = null;
    let triggerWarning: string | null = null;

    try {
      await deductCredits(
        supabase,
        commerceId,
        plannedCreditsCost,
        'ai_image_generation_queue',
        {
          function: 'generate-product-images-ai',
          batch_id: batchId,
          items: items.length,
        },
      );
      creditsCharged = true;

      const jobRows = items.map((item) => ({
        batch_id: batchId,
        commerce_id: commerceId,
        catalog_id: catalogId || null,
        product_id: item.id,
        prompt: buildProductImagePrompt(item),
        status: 'pending',
        provider: 'google',
        credits_charged: COST_IMAGE,
      }));

      const { error: insertJobsError } = await supabase.from('ai_image_jobs').insert(jobRows);
      if (insertJobsError) {
        throw new Error(`Error creating AI image jobs: ${insertJobsError.message}`);
      }

      const productIds = items.map((item) => item.id);
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

      try {
        const { data: triggerData, error: triggerError } = await supabase.rpc(
          'trigger_ai_image_job_processing',
          {
            p_commerce_id: commerceId,
            p_limit: Math.min(2, items.length),
          },
        );

        if (triggerError) {
          triggerWarning = `No se pudo disparar el worker inmediato: ${triggerError.message}`;
        } else {
          triggerRequestId = Number(triggerData ?? 0) || null;
        }
      } catch (error) {
        triggerWarning = error instanceof Error
            ? `No se pudo disparar el worker inmediato: ${error.message}`
            : 'No se pudo disparar el worker inmediato.';
      }
    } catch (error) {
      const productIds = items.map((item) => item.id);
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
      if (state != null) {
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

    return jsonResponse(
      {
        ok: true,
        mode: 'queue',
        batch_id: batchId,
        commerce_id: commerceId,
        requested_items: items.length,
        enqueued_jobs: items.length,
        planned_credits_cost: plannedCreditsCost,
        request_scope: state == null ? 'manual' : 'onboarding',
        remaining_quota_before_generation:
          state == null
            ? null
            : MAX_AI_IMAGES_ONBOARDING - state.ai_images_generated_count,
        trigger_request_id: triggerRequestId,
        trigger_warning: triggerWarning,
        credits_strategy:
          'Los creditos se reservan al encolar. Si una generacion falla, el worker reembolsa ese credito y revierte el uso neto para dejar la wallet intacta.',
        message:
          state == null
            ? 'Se encolo la generacion de imagen y el backend disparo el worker server-side.'
            : 'Se encolo la generacion de imagenes y el backend disparo el worker server-side. El cron de respaldo volvera a intentar cada minuto si quedan jobs pendientes.',
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

function normalizeItems(value: unknown): Array<ImageGenerationItem & { description?: string; categoryName?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: Array<ImageGenerationItem & { description?: string; categoryName?: string }> = [];
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
    });
  }

  return items;
}

function buildProductImagePrompt(
  item: ImageGenerationItem & { description?: string; categoryName?: string },
): string {
  const details = [
    `Producto: ${item.name}.`,
    item.categoryName ? `Categoria: ${item.categoryName}.` : '',
    item.description ? `Descripcion: ${item.description}.` : '',
    'Genera una fotografia gastronomica profesional, realista y apetecible del producto listo para ecommerce.',
    'Sin texto, sin manos, sin logos, sin platos duplicados y sin collage.',
    'Fondo limpio, iluminacion de estudio suave, encuadre cercano 1:1, enfoque nitido en el alimento.',
  ];

  return details.filter((part) => part.length > 0).join(' ');
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