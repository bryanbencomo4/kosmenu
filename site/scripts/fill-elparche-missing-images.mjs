/**
 * Fill missing El Parche product images:
 * 1) Copy from similar products in other comercios
 * 2) AI-generate anything still missing
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/fill-elparche-missing-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need Supabase env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Prefer these source slugs when scores tie */
const PREFERRED_SLUGS = new Set([
  'arroz-chino-maicol',
  'auto-pizzas-napoles',
  'la-tribu-cafe',
  'salsamentaria-pork-belly',
  'oregano-burger',
  'jalgrill',
  'elgranbebeeloriginal',
  'torobravo',
  'hamburgueseria-bladi-jaiper',
]);

/**
 * Manual preferred matches: target product name -> { slug?, nameContains[], preferExact? }
 */
const PREFER = {
  'Agua mineral': { nameExact: ['agua mineral', 'agua'], cats: ['bebidas'] },
  'Jugo del Valle 1.5 Litros': {
    nameContains: ['jugo del valle'],
    preferSlug: 'auto-pizzas-napoles',
  },
  'Jugo del Valle 500 ml': {
    nameContains: ['jugo del valle'],
    preferSlug: 'inversiones-doleto',
    preferNameContains: ['pequeno', 'pequeño', '500'],
  },
  'Jugos naturales': {
    nameExact: ['jugos naturales'],
    preferSlug: 'torobravo',
  },
  Lumpias: {
    nameContains: ['lumpia'],
    preferSlug: 'arroz-chino-maicol',
    preferNameContains: ['2'],
  },
  Malta: { nameExact: ['malta'], preferSlug: 'la-tribu-cafe' },
  Nuggets: {
    nameContains: ['nuggets'],
    preferSlug: 'oregano-burger',
    excludeContains: ['lenteja'],
  },
  Plastichip: {
    nameContains: ['plastichip'],
    preferSlug: 'salsamentaria-pork-belly',
  },
  'Refresco (botella)': {
    nameContains: ['refresco'],
    preferSlug: 'elgranbebeeloriginal',
    preferNameContains: ['250'],
  },
  'Refresco 1 Litro': {
    nameContains: ['refresco'],
    preferSlug: 'jalgrill',
  },
  'Refresco 1.25 Litros': {
    nameContains: ['refresco'],
    preferSlug: 'oregano-burger',
  },
  'Refresco 1.5 Litros': {
    nameContains: ['refresco'],
    preferSlug: 'elgranbebeeloriginal',
    preferNameContains: ['1.5', 'litro y medio'],
  },
  'Refresco 2 Litros': {
    nameContains: ['refresco'],
    preferSlug: 'nelsonburger',
    preferNameContains: ['dos litros', '2 litros', '2l'],
  },
};

function scoreCandidate(targetName, prefer, cand) {
  const n = fold(cand.nombre);
  const slug = cand.comercios?.slug || '';
  let score = 0;

  if (prefer.nameExact) {
    for (const ex of prefer.nameExact) {
      if (n === fold(ex)) score = Math.max(score, 100);
    }
  }
  if (prefer.nameContains) {
    for (const part of prefer.nameContains) {
      if (n.includes(fold(part))) score = Math.max(score, 80);
    }
  }
  if (!prefer.nameExact && !prefer.nameContains) {
    const t = fold(targetName);
    if (n === t) score = 100;
    else if (n.includes(t) || t.includes(n)) score = 80;
  }

  if (prefer.excludeContains) {
    for (const ex of prefer.excludeContains) {
      if (n.includes(fold(ex))) return 0;
    }
  }

  if (prefer.preferSlug && slug === prefer.preferSlug) score += 15;
  else if (PREFERRED_SLUGS.has(slug)) score += 5;

  if (prefer.preferNameContains) {
    for (const part of prefer.preferNameContains) {
      if (n.includes(fold(part))) score += 20;
    }
  }

  return score;
}

async function downloadImage(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf)
    .rotate()
    .resize(900, 900, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function uploadForProduct(comercioId, productId, jpegBytes) {
  const objectPath = `${comercioId}/fill_${productId}_${Date.now()}.jpg`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(objectPath, jpegBytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function ensureCredits(commerceId, needed) {
  const { data: wallet } = await sb
    .from('ai_credits_wallet')
    .select('credits_balance')
    .eq('commerce_id', commerceId)
    .maybeSingle();
  const balance = Number(wallet?.credits_balance || 0);
  if (balance >= needed) return;
  const add = needed - balance + 5;
  const { error } = await sb.rpc('add_ai_credits', {
    p_commerce_id: commerceId,
    p_amount: add,
    p_reason: 'elparche_missing_images_backfill',
    p_metadata: { slug: SLUG },
  });
  if (error) {
    console.warn('add_ai_credits failed, direct bump:', error.message);
    await sb.rpc('ensure_ai_credits_wallet', {
      p_commerce_id: commerceId,
      p_initial_credits: 0,
    });
    await sb
      .from('ai_credits_wallet')
      .update({
        credits_balance: balance + add,
        updated_at: new Date().toISOString(),
      })
      .eq('commerce_id', commerceId);
  }
  console.log(`Credits topped up by ${add}`);
}

async function enqueueAi(commerceId, items) {
  const res = await fetch(`${url}/functions/v1/generate-product-images-ai`, {
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
        category_name: p.categorias?.nombre || '',
      })),
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `enqueue ${res.status}: ${payload.message || payload.error || JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function processWorker(commerceId, limit = 5) {
  const { data: secretRow, error } = await sb
    .from('internal_worker_secrets')
    .select('secret')
    .eq('worker_name', 'ai_image_jobs_worker')
    .maybeSingle();
  if (error) throw error;
  const secret = (secretRow?.secret || '').trim();
  if (!secret) throw new Error('Missing ai_image_jobs_worker secret');

  const res = await fetch(`${url}/functions/v1/process-ai-image-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-image-worker-secret': secret,
    },
    body: JSON.stringify({
      comercio_id: commerceId,
      limit,
      source: 'elparche_fill_missing_images',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `worker ${res.status}: ${payload.message || payload.error || JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function main() {
  const { data: comercio, error: cErr } = await sb
    .from('comercios')
    .select('id,nombre')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: products, error: pErr } = await sb
    .from('productos')
    .select('id,nombre,descripcion,imagen_url,categorias(nombre)')
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;

  const missing = (products || []).filter((p) => !(p.imagen_url || '').trim());
  console.log(`Missing images: ${missing.length}`);
  if (!missing.length) return;

  // Pool of images from other comercios
  const { data: pool, error: poolErr } = await sb
    .from('productos')
    .select(
      'id,nombre,imagen_url,comercio_id,comercios!inner(slug,nombre),categorias(nombre)',
    )
    .neq('comercio_id', comercio.id)
    .not('imagen_url', 'is', null)
    .limit(4000);
  if (poolErr) throw poolErr;
  const candidates = (pool || []).filter((p) => (p.imagen_url || '').trim());

  const copied = [];
  const stillMissing = [];

  for (const product of missing) {
    const prefer = PREFER[product.nombre] || {
      nameContains: [product.nombre],
    };
    let best = null;
    let bestScore = 0;
    for (const cand of candidates) {
      const score = scoreCandidate(product.nombre, prefer, cand);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (!best || bestScore < 60) {
      console.log(`NO MATCH  ${product.nombre}`);
      stillMissing.push(product);
      continue;
    }

    process.stdout.write(
      `COPY ${product.nombre} ← [${best.comercios?.slug}] ${best.nombre} (score ${bestScore})... `,
    );
    try {
      const jpeg = await downloadImage(best.imagen_url);
      const publicUrl = await uploadForProduct(comercio.id, product.id, jpeg);
      const { error: uErr } = await sb
        .from('productos')
        .update({
          imagen_url: publicUrl,
          imagen_source_type: 'manual',
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id)
        .eq('comercio_id', comercio.id);
      if (uErr) throw uErr;
      console.log('OK');
      copied.push(product.nombre);
    } catch (err) {
      console.log(`FAIL ${err.message}`);
      stillMissing.push(product);
    }
  }

  console.log(`\nCopied ${copied.length}. Remaining for AI: ${stillMissing.length}`);

  if (stillMissing.length) {
    await ensureCredits(comercio.id, stillMissing.length);
    // refresh rows
    const { data: fresh } = await sb
      .from('productos')
      .select('id,nombre,descripcion,imagen_url,categorias(nombre)')
      .in(
        'id',
        stillMissing.map((p) => p.id),
      );
    const need = (fresh || stillMissing).filter((p) => !(p.imagen_url || '').trim());

    for (let i = 0; i < need.length; i += 5) {
      const chunk = need.slice(i, i + 5);
      process.stdout.write(
        `AI enqueue ${i + 1}-${i + chunk.length}/${need.length}... `,
      );
      try {
        const result = await enqueueAi(comercio.id, chunk);
        console.log(`jobs=${result.enqueued_jobs ?? chunk.length}`);
      } catch (err) {
        console.log(`FAIL ${err.message}`);
      }
    }

    // Process until done or stalled
    for (let round = 1; round <= 12; round++) {
      const { data: pending } = await sb
        .from('ai_image_jobs')
        .select('id,status')
        .eq('commerce_id', comercio.id)
        .in('status', ['queued', 'processing', 'pending']);
      const left = pending?.length || 0;
      if (!left) {
        console.log('AI jobs drained');
        break;
      }
      process.stdout.write(`Worker round ${round} (pending ${left})... `);
      try {
        const w = await processWorker(comercio.id, Math.min(5, left));
        console.log(JSON.stringify(w.processed ?? w));
      } catch (err) {
        console.log(`FAIL ${err.message}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const { data: after } = await sb
    .from('productos')
    .select('id,nombre,imagen_url')
    .eq('comercio_id', comercio.id);
  const still = (after || []).filter((p) => !(p.imagen_url || '').trim());
  console.log(
    `\nDone. With images: ${(after || []).length - still.length}/${(after || []).length}`,
  );
  if (still.length) {
    console.log('Still missing:');
    for (const p of still) console.log(' -', p.nombre);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
