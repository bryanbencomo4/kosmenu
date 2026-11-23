/**
 * Backfill missing product descriptions + images for Sushi Delivery via platform AI.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/backfill-sushidelivery-ai.mjs --dry-run
 *   node --env-file=.env.local scripts/backfill-sushidelivery-ai.mjs
 *   node --env-file=.env.local scripts/backfill-sushidelivery-ai.mjs --desc-only
 *   node --env-file=.env.local scripts/backfill-sushidelivery-ai.mjs --images-only
 */
import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');
const descOnly = process.argv.includes('--desc-only');
const imagesOnly = process.argv.includes('--images-only');
const SLUG = 'sushidelivery';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function invokeFunction(name, body, comercioId) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      'x-comercio-id': comercioId,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || json?.error || res.statusText;
    throw new Error(`${name} ${res.status}: ${msg}`);
  }
  return json;
}

async function main() {
  const { data: comercio, error: cErr } = await sb
    .from('comercios')
    .select('id,nombre,categoria,ai_enabled')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: products, error: pErr } = await sb
    .from('productos')
    .select('id,nombre,descripcion,imagen_url,categorias(nombre)')
    .eq('comercio_id', comercio.id)
    .order('nombre');
  if (pErr) throw pErr;

  const needDesc = products.filter(
    (p) => !p.descripcion || !String(p.descripcion).trim(),
  );
  const needImg = products.filter((p) => !p.imagen_url);

  console.log(
    `Products: ${products.length} | missing desc: ${needDesc.length} | missing img: ${needImg.length}`,
  );

  if (dryRun) {
    console.log('Desc:', needDesc.map((p) => p.nombre).join(', '));
    console.log('Img:', needImg.map((p) => p.nombre).join(', '));
    return;
  }

  // Top up credits for this backfill (descriptions + images).
  const needed = (imagesOnly ? 0 : needDesc.length) + (descOnly ? 0 : needImg.length) + 5;
  const { data: wallet } = await sb
    .from('ai_credits_wallet')
    .select('credits_balance')
    .eq('commerce_id', comercio.id)
    .maybeSingle();
  const balance = Number(wallet?.credits_balance || 0);
  if (balance < needed) {
    const add = needed - balance;
    const { error: addErr } = await sb.rpc('add_ai_credits', {
      p_commerce_id: comercio.id,
      p_amount: add,
      p_reason: 'sushidelivery_ai_backfill',
      p_metadata: { slug: SLUG },
    });
    if (addErr) {
      // Fallback: direct wallet bump (service role).
      console.warn('add_ai_credits RPC failed, updating wallet directly:', addErr.message);
      await sb
        .from('ai_credits_wallet')
        .update({
          credits_balance: balance + add,
          updated_at: new Date().toISOString(),
        })
        .eq('commerce_id', comercio.id);
    }
    console.log(`Credits topped up by ${add}`);
  }

  let descOk = 0;
  let descFail = 0;
  if (!imagesOnly) {
    for (const product of needDesc) {
      const cat = product.categorias?.nombre || '';
      process.stdout.write(`DESC ${product.nombre}... `);
      try {
        const result = await invokeFunction(
          'generate-product-description-gemini',
          {
            comercio_id: comercio.id,
            product_name: product.nombre,
            category_name: cat,
            business_name: comercio.nombre,
            business_category: comercio.categoria,
          },
          comercio.id,
        );
        const description = String(result.description || '').trim();
        if (!description) throw new Error('empty description');
        const { error: updErr } = await sb
          .from('productos')
          .update({ descripcion: description })
          .eq('id', product.id)
          .eq('comercio_id', comercio.id);
        if (updErr) throw updErr;
        descOk += 1;
        console.log('OK');
        // brief pause to avoid rate limits
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        descFail += 1;
        console.log(`FAIL ${err.message}`);
      }
    }
  }

  let imgEnqueued = 0;
  let imgFail = 0;
  if (!descOnly && needImg.length > 0) {
    // Refresh descriptions for image prompts
    const { data: fresh } = await sb
      .from('productos')
      .select('id,nombre,descripcion,imagen_url,categorias(nombre)')
      .eq('comercio_id', comercio.id)
      .in(
        'id',
        needImg.map((p) => p.id),
      );

    const items = (fresh || needImg).map((p) => ({
      type: 'product',
      id: p.id,
      name: p.nombre,
      description: (p.descripcion || '').trim(),
      category_name: p.categorias?.nombre || '',
    }));

    // Enqueue in small batches
    const chunkSize = 5;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      process.stdout.write(
        `IMG enqueue ${i + 1}-${i + chunk.length}/${items.length}... `,
      );
      try {
        const result = await invokeFunction(
          'generate-product-images-ai',
          {
            comercio_id: comercio.id,
            items: chunk,
          },
          comercio.id,
        );
        imgEnqueued += Number(result.enqueued_jobs || chunk.length);
        console.log(
          `OK jobs=${result.enqueued_jobs ?? '?'} batch=${result.batch_id || '-'}`,
        );
        // Kick worker if exposed
        try {
          await invokeFunction(
            'process-ai-image-jobs',
            { commerce_id: comercio.id, limit: chunk.length },
            comercio.id,
          );
          console.log('  worker kicked');
        } catch (workerErr) {
          console.log(`  worker: ${workerErr.message}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        imgFail += 1;
        console.log(`FAIL ${err.message}`);
      }
    }
  }

  const { data: after } = await sb
    .from('productos')
    .select('id,imagen_url,descripcion')
    .eq('comercio_id', comercio.id);
  const withDesc = after.filter((p) => (p.descripcion || '').trim()).length;
  const withImg = after.filter((p) => p.imagen_url).length;
  const { data: jobs } = await sb
    .from('ai_image_jobs')
    .select('status')
    .eq('commerce_id', comercio.id);

  const jobStats = {};
  for (const j of jobs || []) {
    jobStats[j.status] = (jobStats[j.status] || 0) + 1;
  }

  console.log('\n=== DONE ===');
  console.log(`Descriptions: ok=${descOk} fail=${descFail}`);
  console.log(`Images enqueued: ${imgEnqueued} failBatches=${imgFail}`);
  console.log(`Now with desc: ${withDesc}/${after.length}`);
  console.log(`Now with img: ${withImg}/${after.length}`);
  console.log('Image jobs:', jobStats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
