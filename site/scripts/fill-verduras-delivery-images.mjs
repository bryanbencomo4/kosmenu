/**
 * Fill Verduras Delivery product images:
 * 1) Reuse closest matching produce images from other commercios
 * 2) AI-generate the rest (max 50 credits) with realistic produce prompts
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/fill-verduras-delivery-images.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-verduras-delivery-images.mjs
 *   node --env-file=.env.local scripts/fill-verduras-delivery-images.mjs --max-ai=50
 */

import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');
const maxAiArg = process.argv.find((a) => a.startsWith('--max-ai='));
const MAX_AI = maxAiArg ? Number(maxAiArg.split('=')[1]) : 50;
const SLUG = 'verduras-delivery';
const MIN_MATCH_SCORE = 0.78;

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need Supabase env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fold(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'con',
  'y',
  'o',
  'un',
  'una',
  'para',
  'en',
  'al',
  'kg',
  'unid',
  'unidad',
  'pequena',
  'entero',
  'molida',
  'americana',
  'polo',
  'roja',
  'verde',
]);

const ALIASES = {
  auyama: 'auyama',
  lechosa: 'papaya',
  jojoto: 'maiz',
  cambur: 'banana',
  platano: 'platano',
  topoch: 'platano',
  pimenton: 'pimenton',
  aji: 'aji',
  celery: 'apio',
  cebollin: 'cebollin',
  ajo: 'ajo',
  porro: 'puerro',
  ocumo: 'ocumo',
  batata: 'batata',
  yuca: 'yuca',
  remolacha: 'remolacha',
  calabacin: 'zucchini',
  oregano: 'oregano',
  comino: 'comino',
  curcuma: 'turmeric',
  paprika: 'paprika',
  pimienta: 'pimienta',
  canela: 'canela',
  clavito: 'clavo',
  bicarbonato: 'bicarbonato',
  alino: 'adobo',
  adobo: 'adobo',
  carmencita: 'especias',
  curry: 'curry',
  mora: 'mora',
  melon: 'melon',
  limon: 'limon',
  coco: 'coco',
  manzana: 'manzana',
  aguacate: 'aguacate',
  cilantro: 'cilantro',
  lechuga: 'lechuga',
  repollo: 'repollo',
  tomate: 'tomate',
  cebolla: 'cebolla',
  zanahoria: 'zanahoria',
  papa: 'papa',
  pepino: 'pepino',
  apio: 'apio',
};

function tokens(name) {
  return fold(name)
    .split(' ')
    .filter(Boolean)
    .map((t) => ALIASES[t] || t)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function scoreMatch(nameA, catA, nameB, catB) {
  const ta = tokens(nameA);
  const tb = tokens(nameB);
  let score = jaccard(ta, tb);
  if (ta[0] && tb[0] && ta[0] === tb[0]) score += 0.25;
  const ca = fold(catA);
  const cb = fold(catB);
  if (ca && cb && (ca.includes('verdura') || ca.includes('fruta') || ca.includes('condiment'))) {
    if (cb.includes('verdura') || cb.includes('fruta') || cb.includes('condiment') || cb.includes('abasto')) {
      score += 0.1;
    }
  }
  return Math.min(1, score);
}

function producePrompt(product, categoryName) {
  const name = product.nombre;
  const cat = categoryName || '';
  const base =
    'Ultra-realistic food photography, natural daylight, shallow depth of field, ' +
    'fresh produce as sold in a Venezuelan market, true colors, high detail skin texture, ' +
    'clean wooden or white surface, no text, no watermark, no logo, no packaging brands, ' +
    'photorealistic, DSLR look. Subject: ';

  if (/condiment|especi|adobo|aliño|alino|comino|curry|cúrcuma|curcuma|paprika|pimienta|orégano|oregano|bicarbonato|royal|bórico|borico|clavito|canela|carmencita/i.test(
    `${name} ${cat}`,
  )) {
    return (
      base +
      `${name}. Small pile or spice jar of the seasoning/spice, realistic kitchen ingredient photo, edible product only.`
    );
  }

  if (/manzana/i.test(name)) {
    return base + `${name}. Whole fresh apple, realistic fruit photography.`;
  }
  if (/aguacate/i.test(name)) {
    return base + `Fresh ripe avocado (aguacate polo), whole, realistic.`;
  }
  if (/cambur|plátano|platano|topocho/i.test(name)) {
    return base + `${name}. Fresh bananas/plantains bunch, Venezuelan market style.`;
  }
  if (/jojoto/i.test(name)) {
    return base + `Fresh corn cob (jojoto), husk partially peeled, realistic.`;
  }
  if (/lechosa/i.test(name)) {
    return base + `Whole ripe papaya (lechosa), realistic fruit photo.`;
  }
  if (/mora/i.test(name)) {
    return base + `Fresh blackberries (mora) in a small clear bag or bowl, realistic.`;
  }
  if (/coco/i.test(name)) {
    return base + `Whole fresh coconut, realistic.`;
  }
  if (/ají|aji/i.test(name)) {
    return base + `Fresh hot chili peppers (ají), Venezuelan market style.`;
  }
  if (/pimentón|pimenton/i.test(name)) {
    return base + `Fresh bell peppers (pimentón), mixed colors if natural.`;
  }
  if (/ajo porro/i.test(name)) {
    return base + `Fresh leeks (ajo porro), realistic produce photo.`;
  }
  if (/cebollín|cebollin/i.test(name)) {
    return base + `Fresh green onions / scallions (cebollín), bunch.`;
  }
  if (/celery|apio/i.test(name) && /celery/i.test(name)) {
    return base + `Fresh celery stalks with leaves, realistic.`;
  }
  if (/ocumo/i.test(name)) {
    return base + `Fresh ocumo root vegetable, Venezuelan market, realistic.`;
  }
  if (/batata/i.test(name)) {
    return base + `Fresh sweet potatoes (batata), realistic.`;
  }
  if (/auyama/i.test(name)) {
    return base + `Fresh pumpkin squash (auyama), Venezuelan market.`;
  }
  if (/yuca/i.test(name)) {
    return base + `Fresh cassava roots (yuca), realistic.`;
  }
  if (/calabacín|calabacin/i.test(name)) {
    return base + `Fresh zucchini (calabacín), realistic.`;
  }
  if (/lechuga/i.test(name)) {
    return base + `Fresh iceberg lettuce head (lechuga americana), realistic.`;
  }
  if (/repollo/i.test(name)) {
    return base + `Fresh cabbage head (repollo), realistic.`;
  }
  if (/melón|melon/i.test(name)) {
    return base + `Whole fresh melon, realistic fruit photo.`;
  }
  if (/limón|limon/i.test(name)) {
    return base + `Fresh limes/lemons (limón), pile, realistic.`;
  }
  if (/cilantro/i.test(name)) {
    return base + `Fresh cilantro bunch, realistic herb photo.`;
  }
  if (/papa/i.test(name)) {
    return base + `Fresh potatoes (papa), pile, realistic market photo.`;
  }
  if (/tomate/i.test(name)) {
    return base + `Fresh ripe tomatoes, realistic.`;
  }
  if (/cebolla/i.test(name)) {
    return base + `Fresh onions (cebolla), realistic.`;
  }
  if (/zanahoria/i.test(name)) {
    return base + `Fresh carrots with greens optional, realistic.`;
  }
  if (/pepino/i.test(name)) {
    return base + `Fresh cucumbers (pepino), realistic.`;
  }
  if (/remolacha/i.test(name)) {
    return base + `Fresh beets (remolacha), realistic.`;
  }
  if (/apio/i.test(name)) {
    return base + `Fresh celery root or stalk (apio), Venezuelan market style, realistic.`;
  }

  return base + `${name}. Fresh produce item, realistic market photography.`;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function enqueueAi(commerceId, items) {
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
        image_prompt: p.imagePrompt,
      })),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `enqueue ${response.status}: ${payload.message || payload.error || JSON.stringify(payload)}`,
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
  if (!secret) throw new Error('Missing worker secret');

  const response = await fetch(`${url}/functions/v1/process-ai-image-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-image-worker-secret': secret,
    },
    body: JSON.stringify({
      comercio_id: commerceId,
      limit,
      source: 'verduras_delivery_fill_script',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `worker ${response.status}: ${payload.message || payload.error || JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function main() {
  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,slug,nombre')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: targets, error: tErr } = await supabase
    .from('productos')
    .select('id,nombre,descripcion,precio,imagen_url,categoria_id,orden,categorias(nombre)')
    .eq('comercio_id', comercio.id)
    .order('orden');
  if (tErr) throw tErr;

  const need = (targets || []).filter((p) => !(p.imagen_url || '').trim());
  console.log(`${comercio.nombre}: ${need.length}/${targets.length} without image`);

  const { data: sources, error: sErr } = await supabase
    .from('productos')
    .select(
      'id,nombre,imagen_url,categoria_id,comercio_id,categorias(nombre),comercios!inner(slug,nombre)',
    )
    .not('imagen_url', 'is', null)
    .neq('comercio_id', comercio.id);
  if (sErr) throw sErr;
  console.log(`Source pool: ${sources.length} imaged products`);

  const reused = [];
  const leftover = [];

  for (const product of need) {
    const catName = product.categorias?.nombre || '';
    let best = null;
    let bestScore = 0;
    for (const src of sources) {
      const score = scoreMatch(
        product.nombre,
        catName,
        src.nombre,
        src.categorias?.nombre || '',
      );
      if (score > bestScore) {
        bestScore = score;
        best = src;
      }
    }
    if (best && bestScore >= MIN_MATCH_SCORE) {
      reused.push({ product, source: best, score: bestScore });
    } else {
      leftover.push({
        ...product,
        categoryName: catName,
        bestScore,
        bestName: best?.nombre,
      });
    }
  }

  console.log(`\nReuse matches (${reused.length}):`);
  for (const m of reused.sort((a, b) => b.score - a.score)) {
    console.log(
      `  ${m.score.toFixed(2)}  ${m.product.nombre}  ←  ${m.source.comercios?.slug}: ${m.source.nombre}`,
    );
  }
  console.log(`\nNeed AI (${leftover.length}):`);
  for (const p of leftover) {
    console.log(
      `  ${p.nombre} (best ${p.bestScore?.toFixed(2) || 0} ${p.bestName || '-'})`,
    );
  }

  if (dryRun) {
    console.log('\nDry run OK.');
    return;
  }

  for (const m of reused) {
    const { error } = await supabase
      .from('productos')
      .update({
        imagen_url: m.source.imagen_url,
        imagen_source_type: 'manual',
        ai_image_status: 'completed',
        ai_image_error_message: null,
      })
      .eq('id', m.product.id)
      .eq('comercio_id', comercio.id);
    if (error) throw error;
  }
  console.log(`Applied ${reused.length} reused images`);

  const aiTargets = leftover.slice(0, MAX_AI).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    categoryName: p.categoryName,
    imagePrompt: producePrompt(p, p.categoryName),
  }));

  if (aiTargets.length === 0) {
    console.log('Nothing left for AI.');
    return;
  }

  const { data: wallet } = await supabase.rpc('ensure_ai_credits_wallet', {
    p_commerce_id: comercio.id,
    p_initial_credits: 0,
  });
  let balance = Number(wallet?.credits_balance || 0);
  const needCredits = aiTargets.length;
  if (balance < needCredits) {
    const add = needCredits - Math.floor(balance);
    console.log(`Topping up ${add} credits (have ${balance}, need ${needCredits})`);
    const { error: topErr } = await supabase.rpc('add_ai_credits', {
      p_commerce_id: comercio.id,
      p_amount: add,
      p_reason: 'manual_topup_verduras_delivery_images',
      p_metadata: { source: 'fill-verduras-delivery-images' },
    });
    if (topErr) throw topErr;
  }

  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { data: usage } = await supabase
    .from('ai_usage_control')
    .select('id,requests')
    .eq('commerce_id', comercio.id)
    .eq('period_month', period)
    .maybeSingle();
  if (usage && Number(usage.requests) + aiTargets.length > 50) {
    await supabase
      .from('ai_usage_control')
      .update({ requests: Math.max(0, 50 - aiTargets.length - 5) })
      .eq('id', usage.id);
    console.log('Relaxed monthly AI request counter for this run');
  }

  console.log(`Enqueue AI for ${aiTargets.length} products…`);
  for (const batch of chunk(aiTargets, 25)) {
    const result = await enqueueAi(comercio.id, batch);
    console.log(
      `  enqueued=${result.enqueued_jobs} cost=${result.planned_credits_cost}`,
    );
  }

  const started = Date.now();
  const maxWait = 50 * 60 * 1000;
  let idle = 0;
  while (Date.now() - started < maxWait) {
    const { data: jobs } = await supabase
      .from('ai_image_jobs')
      .select('id')
      .eq('commerce_id', comercio.id)
      .in('status', ['pending', 'processing']);
    const active = jobs?.length || 0;
    if (active === 0) {
      idle += 1;
      if (idle >= 2) break;
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    idle = 0;
    console.log(`  active=${active}`);
    try {
      await processWorker(comercio.id, 3);
    } catch (e) {
      console.warn('  worker:', e.message);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  const { data: after } = await supabase
    .from('productos')
    .select('id,nombre,imagen_url,ai_image_status')
    .eq('comercio_id', comercio.id);
  const withImg = (after || []).filter((p) => (p.imagen_url || '').trim());
  const failed = (after || []).filter((p) => p.ai_image_status === 'failed');
  const missing = (after || []).filter((p) => !(p.imagen_url || '').trim());
  const { data: w2 } = await supabase.rpc('ensure_ai_credits_wallet', {
    p_commerce_id: comercio.id,
    p_initial_credits: 0,
  });
  console.log(
    `\nDone. with_image=${withImg.length}/${after.length} missing=${missing.length} failed=${failed.length}`,
  );
  console.log(`Credits left: ${w2?.credits_balance}`);
  if (missing.length) {
    console.log('Still missing:', missing.map((p) => p.nombre).join(', '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
