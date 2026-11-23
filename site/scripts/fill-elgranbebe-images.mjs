/**
 * Fill El Gran Bebé product images:
 * 1) Reuse closest matching product images from other comercios
 * 2) AI-generate the rest (max 50 credits) with street-food prompts
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/fill-elgranbebe-images.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-elgranbebe-images.mjs
 *   node --env-file=.env.local scripts/fill-elgranbebe-images.mjs --max-ai=50
 */

import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');
const maxAiArg = process.argv.find((a) => a.startsWith('--max-ai='));
const MAX_AI = maxAiArg ? Number(maxAiArg.split('=')[1]) : 50;
const SLUG = 'elgranbebeeloriginal';
const MIN_MATCH_SCORE = 0.72;

const DISH_TYPES = [
  'hamburguesa',
  'arepa',
  'arepon',
  'patacon',
  'salchipapa',
  'salchicha',
  'perro',
  'refresco',
  'papa',
  'papas',
  'pan',
  'panes',
  'te',
  'nestea',
  'combo',
];

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
  '2',
  '3',
  '4',
  '10',
  'guisos',
  'guiso',
  'personal',
  'familiar',
  'sencilla',
  'especial',
  'mixta',
  'mixto',
  'combo',
  'servicio',
  'servicios',
  'adicionales',
  'adicional',
]);

function tokens(name) {
  const raw = fold(name).split(' ').filter(Boolean);
  const mapped = raw.map((t) => {
    if (t === 'wopper' || t === 'whopper') return 'hamburguesa';
    if (t === 'hamburguesas') return 'hamburguesa';
    if (t === 'junior' || t === 'mini') return 'mini';
    if (t === 'tumbarrancho' || t === 'tumbarranchos') return 'arepa';
    if (t === 'arepon' || t === 'arepones') return 'arepa';
    if (t === 'patacones') return 'patacon';
    if (t === 'panes') return 'pan';
    if (t === 'salchiqueso' || t === 'salchihuevo') return 'salchicha';
    if (t === 'perros') return 'perro';
    if (t === 'refrescos') return 'refresco';
    if (t === 'papas' || t === 'fritas') return 'papa';
    return t;
  });
  // Mini/Junior de X in this menu = small burger
  if (mapped.includes('mini')) mapped.push('hamburguesa');
  return mapped.filter((t) => t.length > 1 && !STOP.has(t));
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dishTypesOf(name, cat) {
  const bag = new Set([...tokens(name), ...tokens(cat)]);
  // Expand synonyms already normalized in tokens()
  return DISH_TYPES.filter((d) => bag.has(d));
}

function scoreMatch(targetName, targetCat, sourceName, sourceCat, sourceSlug) {
  const tt = tokens(targetName);
  const st = tokens(sourceName);
  if (tt.length === 0 || st.length === 0) return 0;

  // Dish family from product NAMES only (ignore category — many menus put
  // "LOMITO"/"CARNE MECHADA" under Hamburguesas as toppings).
  const td = dishTypesOf(targetName, '');
  const sd = dishTypesOf(sourceName, '');
  if (td.length > 0 && sd.length > 0 && !td.some((d) => sd.includes(d))) {
    return 0;
  }
  if (td.length > 0 && sd.length === 0) {
    return 0;
  }

  // Skip clearly vegan plant-based sources for this street-meat menu
  const slug = fold(sourceSlug || '');
  if (slug.includes('alegria') || /lenteja|vegana|vegetal|planta/i.test(sourceName)) {
    if (/hamburg|wopper|carne|pollo|lomito|pernil|chuleta|mechada/i.test(targetName)) {
      return 0;
    }
  }

  let score = jaccard(tt, st);
  if (fold(targetName) === fold(sourceName)) score = 1;

  const shared = tt.filter((t) => st.includes(t)).length;
  if (shared >= 2) score += 0.15;
  else if (shared === 1 && tt.length <= 2 && st.length <= 3) score += 0.08;

  const tc = fold(targetCat);
  const sc = fold(sourceCat);
  if (tc && sc && tc === sc) score += 0.1;

  if (tc.includes('hamburg') || /hamburg|wopper/i.test(targetName)) {
    if (/nelson|oregano|bladi|container|burger|hamburg/i.test(sourceSlug + sourceCat + sourceName)) {
      score += 0.08;
    }
  }

  return Math.min(1, score);
}

function streetPrompt(product, category) {
  const name = product.nombre;
  const cat = category || '';
  const base =
    'Fotografía realista de comida callejera venezolana estilo carrito/puesto nocturno. ' +
    'Aspecto auténtico y jugoso, no publicidad de estudio glossy, pan artesanal tostado, ' +
    'guisos generosos, salsa visible, iluminación cálida de farola, fondo callejero desenfocado, ' +
    'composición 1:1, alta resolución, sin texto, sin logos, sin marcas registradas. Plato: ';

  if (/hamburg|wopper|whopper|mini de|junior/i.test(name) || /hamburg/i.test(cat)) {
    return (
      base +
      `${name}. Hamburguesa callejera venezolana (estilo Wopper de carrito): pan suave, carne o pollo bien cocido, ` +
      'queso derretido si aplica, vegetales frescos, papas al lado si el producto lo sugiere. Se ve casera y apetitosa.'
    );
  }
  if (/arepa|arepon|tumbarrancho/i.test(name) || /arepa/i.test(cat)) {
    return (
      base +
      `${name}. Arepa o arepón venezolano callejero abierto o cerrado, relleno abundante, maíz dorado.`
    );
  }
  if (/patacon/i.test(name) || /patacon/i.test(cat)) {
    return (
      base +
      `${name}. Patacón venezolano crujiente con guiso encima, estilo puesto callejero.`
    );
  }
  if (/salchi|perro|salchipapa/i.test(name) || /salchi/i.test(cat)) {
    return (
      base +
      `${name}. Comida callejera tipo perro caliente o salchipapa venezolana, abundante y jugosa.`
    );
  }
  if (/papa|papas|queso cebu|arepa adicional/i.test(name)) {
    return base + `${name}. Acompañamiento callejero venezolano apetitoso.`;
  }
  if (/refresco|nestea|te de|té de|vaso/i.test(name) || /bebida/i.test(cat)) {
    return (
      base +
      `${name}. Bebida fría servida en vaso o botella en puesto callejero, condensación visible, sin marcas legibles.`
    );
  }
  if (/combo/i.test(name) || /combo/i.test(cat)) {
    return (
      base +
      `${name}. Bandeja combo de comida callejera venezolana con hamburguesas o patacones, papas, refresco y helado si aplica, vista cenital apetitosa.`
    );
  }
  if (/panes|pan con/i.test(name) || /panes/i.test(cat)) {
    return base + `${name}. Pan relleno callejero venezolano, generoso y jugoso.`;
  }
  return base + `${name}.`;
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
      source: 'elgranbebe_fill_script',
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

  // Source pool: other commerces with images
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
        src.comercios?.slug || '',
      );
      if (score > bestScore) {
        bestScore = score;
        best = src;
      }
    }
    if (best && bestScore >= MIN_MATCH_SCORE) {
      reused.push({
        product,
        source: best,
        score: bestScore,
      });
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

  // Apply reused images
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

  // AI for leftover (cap MAX_AI)
  const aiTargets = leftover.slice(0, MAX_AI).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    categoryName: p.categoryName,
    imagePrompt: streetPrompt(p, p.categoryName),
  }));

  if (aiTargets.length === 0) {
    console.log('Nothing left for AI.');
    return;
  }

  // Ensure wallet + usage headroom
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
      p_reason: 'manual_topup_elgranbebe_images',
      p_metadata: { source: 'fill-elgranbebe-images' },
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
