/**
 * Enqueue Peppa product AI images via generate-product-images-ai, then drive
 * process-ai-image-jobs until settled. Cap: min(50, floor(wallet balance)).
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/generate-peppa-ai-images.mjs --dry-run
 *   node --env-file=.env.local scripts/generate-peppa-ai-images.mjs
 *   node --env-file=.env.local scripts/generate-peppa-ai-images.mjs --max=29
 */

import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');
const maxArg = process.argv.find((a) => a.startsWith('--max='));
const maxCap = maxArg ? Number(maxArg.split('=')[1]) : 50;

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SLUG = 'peppa';
const BATCH_LIMIT = 25; // edge function slices manual items to MAX_AI_IMAGES_ONBOARDING
const COST_IMAGE = 1;

const CATEGORY_PRIORITY = [
  'Empanadas',
  'Desayunos',
  'Almuerzos',
  'Arepas',
  'Raciones',
  'Jugos naturales',
  'Merengadas',
  'Café',
  'Infusiones',
  'Adicionales',
];

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function getWallet(commerceId) {
  const { data, error } = await supabase.rpc('ensure_ai_credits_wallet', {
    p_commerce_id: commerceId,
    p_initial_credits: 0,
  });
  if (error) throw error;
  return data;
}

async function enqueueBatch(commerceId, items) {
  const response = await fetch(`${url}/functions/v1/generate-product-images-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey || serviceKey,
      'x-comercio-id': commerceId,
    },
    body: JSON.stringify({
      commerce_id: commerceId,
      items: items.map((p) => ({
        type: 'product',
        id: p.id,
        name: p.nombre,
        description: p.descripcion || '',
        category_name: p.categoryName || '',
      })),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `enqueue HTTP ${response.status}: ${payload.message || payload.error || JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function processWorker(commerceId, limit = 3) {
  const { data: secretRow, error } = await supabase
    .from('internal_worker_secrets')
    .select('secret')
    .eq('worker_name', 'ai_image_jobs_worker')
    .maybeSingle();
  if (error) throw error;
  const secret = (secretRow?.secret || '').trim();
  if (!secret) throw new Error('Missing ai_image_jobs_worker secret');

  const response = await fetch(`${url}/functions/v1/process-ai-image-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-image-worker-secret': secret,
    },
    body: JSON.stringify({
      comercio_id: commerceId,
      limit,
      source: 'peppa_seed_script',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `worker HTTP ${response.status}: ${payload.message || payload.error || JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function main() {
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .select('id,slug,nombre')
    .eq('slug', SLUG)
    .maybeSingle();
  if (comercioError) throw comercioError;
  if (!comercio) {
    console.error('Peppa not found');
    process.exit(1);
  }

  const wallet = await getWallet(comercio.id);
  const balance = Number(wallet?.credits_balance ?? 0);
  const budget = Math.min(
    Math.floor(maxCap),
    Math.floor(balance),
  );
  console.log(
    `Comercio ${comercio.nombre} · wallet=${balance} · budget=${budget} (cap ${maxCap})`,
  );
  if (budget < 1) {
    console.error('Not enough credits to generate images.');
    process.exit(1);
  }

  const { data: categories } = await supabase
    .from('categorias')
    .select('id,nombre,orden')
    .eq('comercio_id', comercio.id);
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));
  const catRank = new Map(
    CATEGORY_PRIORITY.map((name, index) => [name, index]),
  );

  const { data: products, error: productsError } = await supabase
    .from('productos')
    .select('id,nombre,descripcion,precio,imagen_url,ai_image_status,categoria_id,orden')
    .eq('comercio_id', comercio.id);
  if (productsError) throw productsError;

  const mapped = (products ?? [])
    .filter((p) => !(p.imagen_url || '').trim())
    .map((p) => ({
      ...p,
      categoryName: catById.get(p.categoria_id)?.nombre || '',
      categoryRank: catRank.get(catById.get(p.categoria_id)?.nombre || '') ?? 99,
      isConsultar:
        Number(p.precio) <= 0 ||
        (p.descripcion || '').toLowerCase().includes('a consultar'),
    }));

  const sortFn = (a, b) => {
    if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank;
    return (a.orden ?? 0) - (b.orden ?? 0);
  };

  // Prefer priced items, then "A consultar", within category priority.
  const priced = mapped.filter((p) => !p.isConsultar).sort(sortFn);
  const consultar = mapped.filter((p) => p.isConsultar).sort(sortFn);
  const candidates = [...priced, ...consultar].slice(0, budget);

  console.log(`Selected ${candidates.length} products (priced, no image):`);
  for (const p of candidates) {
    console.log(`  · [${p.categoryName}] ${p.nombre} ($${p.precio})`);
  }

  const remainingPriced = (products ?? []).filter(
    (p) => !(p.imagen_url || '').trim() && Number(p.precio) > 0,
  ).length;
  const consultarLeft = (products ?? []).filter(
    (p) =>
      !(p.imagen_url || '').trim() &&
      (Number(p.precio) <= 0 || (p.descripcion || '').includes('A consultar')),
  ).length;
  console.log(
    `Left without image after this run (expected): priced≈${Math.max(0, remainingPriced - candidates.length)}, a consultar=${consultarLeft}`,
  );

  if (dryRun) {
    console.log('Dry run OK. No enqueue.');
    return;
  }

  const batches = chunk(candidates, BATCH_LIMIT);
  let enqueued = 0;
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    console.log(`Enqueue batch ${i + 1}/${batches.length} (${batch.length} items)…`);
    const result = await enqueueBatch(comercio.id, batch);
    console.log(
      `  enqueued=${result.enqueued_jobs} cost=${result.planned_credits_cost} status=${result.message?.slice(0, 80)}`,
    );
    enqueued += Number(result.enqueued_jobs || 0);
  }

  console.log(`Total enqueued: ${enqueued}. Driving worker…`);

  const started = Date.now();
  const maxWaitMs = 45 * 60 * 1000;
  let idleRounds = 0;
  while (Date.now() - started < maxWaitMs) {
    const { data: jobs } = await supabase
      .from('ai_image_jobs')
      .select('id,status')
      .eq('commerce_id', comercio.id)
      .in('status', ['pending', 'processing']);
    const active = jobs?.length ?? 0;
    if (active === 0) {
      idleRounds += 1;
      if (idleRounds >= 2) break;
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    idleRounds = 0;
    console.log(`  active jobs=${active}; processing…`);
    try {
      const workerResult = await processWorker(comercio.id, 3);
      console.log(
        `  worker: processed=${workerResult.processed ?? workerResult.data?.processed ?? '?'} ` +
          `ok=${workerResult.succeeded ?? workerResult.data?.succeeded ?? '?'} ` +
          `fail=${workerResult.failed ?? workerResult.data?.failed ?? '?'}`,
      );
    } catch (error) {
      console.warn(`  worker warn: ${error.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const { data: after } = await supabase
    .from('productos')
    .select('id,nombre,imagen_url,ai_image_status,precio')
    .eq('comercio_id', comercio.id)
    .in(
      'id',
      candidates.map((p) => p.id),
    );
  const done = (after ?? []).filter((p) => (p.imagen_url || '').trim());
  const failed = (after ?? []).filter(
    (p) => (p.ai_image_status || '') === 'failed',
  );
  const pending = (after ?? []).filter(
    (p) =>
      !(p.imagen_url || '').trim() &&
      ['pending', 'processing'].includes(p.ai_image_status || ''),
  );

  const walletAfter = await getWallet(comercio.id);
  console.log(
    `Done. images=${done.length}/${candidates.length} failed=${failed.length} still_pending=${pending.length}`,
  );
  console.log(
    `Wallet after: ${walletAfter?.credits_balance} (used ${walletAfter?.credits_used})`,
  );
  if (failed.length) {
    console.log('Failed:');
    for (const p of failed) console.log(`  · ${p.nombre}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
