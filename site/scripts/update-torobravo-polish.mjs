/**
 * TORO BRAVO polish (data only):
 * - Hide payment methods on home
 * - Ensure ventas sugeridas (entradas + bebidas)
 * - Move description choices into opciones_menu where applicable
 * - AI-generate missing product images
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/update-torobravo-polish.mjs --dry-run
 *   node --env-file=.env.local scripts/update-torobravo-polish.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'torobravo';
const BATCH_LIMIT = 25;

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

function oid(prefix = 'g') {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function group({
  nombre,
  tipo = 'unica',
  obligatorio = true,
  min = 1,
  max = 1,
  opciones,
}) {
  return {
    id: oid('g'),
    nombre,
    tipo,
    obligatorio,
    min,
    max,
    opciones: opciones.map((o, i) => ({
      id: oid('o'),
      nombre: o.nombre,
      precio: Number(o.precio ?? 0),
      activo: true,
      ...(i === 0 && tipo === 'unica' && obligatorio ? { predeterminada: true } : {}),
    })),
  };
}

function withGroups(groups) {
  return { activadas: true, grupos: groups };
}

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
        image_prompt: p.imagePrompt,
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
      source: 'torobravo_polish_script',
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

function steakPrompt(name, category) {
  const base =
    'Photorealistic restaurant food photo, TORO BRAVO steakhouse terrace at night, dark burgundy and gold ambiance, appetizing plating, no text, no watermark, no logo. ';
  const n = name.toLowerCase();
  const c = (category || '').toLowerCase();
  if (/bollito/.test(n)) {
    return base + 'Venezuelan bollitos aliñados, golden fried corn dough balls, served with dipping sauce.';
  }
  if (/fajita/.test(n)) {
    return base + 'Chicken fajitas with sautéed peppers and onions on a sizzling platter.';
  }
  if (/pasta.*queso|4 quesos/.test(n)) {
    return base + 'Long pasta with creamy four-cheese sauce, plated as a side dish.';
  }
  if (/arroz blanco/.test(n)) {
    return base + 'Side of fluffy white rice in a small bowl.';
  }
  if (/arroz amarillo/.test(n)) {
    return base + 'Side of yellow seasoned rice in a small bowl.';
  }
  if (/papas colomb/.test(n)) {
    return base + 'Colombian-style fried potatoes, golden and crispy side portion.';
  }
  if (/ensalada c[eé]sar/.test(n)) {
    return base + 'Caesar salad side with romaine, dressing and parmesan.';
  }
  if (/ensalada mixt/.test(n)) {
    return base + 'Fresh mixed green salad side with tomato and onion.';
  }
  if (/ensalada rall/.test(n)) {
    return base + 'Shredded vegetable salad side, Venezuelan style.';
  }
  if (/cerveza|tobo/.test(n)) {
    return base + 'Bucket of ten cold beers with ice, restaurant patio setting, no readable brand labels.';
  }
  if (/tinto verano/.test(n)) {
    return base + 'Large pitcher of tinto de verano, red wine with soda and ice, citrus garnish.';
  }
  if (/mojito/.test(n)) {
    return base + 'Fresh passionfruit or lemon mojito cocktail with mint, restaurant bar lighting.';
  }
  if (/bebida|jugo|refresco|café|cafe|agua|whisky|ron|vino/.test(n) || /bebida/.test(c)) {
    return base + `${name}. Beverage for a steakhouse menu, elegant presentation.`;
  }
  if (/contorno|side/.test(c)) {
    return base + `${name}. Venezuelan steakhouse side dish, plated neatly.`;
  }
  return base + `${name}. Venezuelan steakhouse dish.`;
}

async function main() {
  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,slug,nombre,branding_ia,upsell_config')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: categories, error: catErr } = await supabase
    .from('categorias')
    .select('id,nombre,orden')
    .eq('comercio_id', comercio.id)
    .order('orden');
  if (catErr) throw catErr;
  const catByName = new Map(categories.map((c) => [c.nombre, c]));
  const entradasId = catByName.get('Entradas')?.id;
  const bebidasId = catByName.get('Bebidas')?.id;
  const carnesId = catByName.get('Carnes y Aves')?.id;
  const especialesId = catByName.get('Especiales')?.id;
  const contornosId = catByName.get('Contornos')?.id;

  const branding = structuredClone(comercio.branding_ia || {});
  const cfg = branding.config_negocio || (branding.config_negocio = {});
  cfg.inicio_menu = {
    ...(cfg.inicio_menu || {}),
    ver_metodos_pago: false,
  };

  const suggestionKinds = ['acompanamiento', 'bebida'];
  const upsell_config = {
    upselling: true,
    pre_checkout: {
      activo: true,
      tipos: suggestionKinds,
      max_productos: 12,
      categorias: [
        ...(entradasId ? [{ id: entradasId, tipo: 'acompanamiento' }] : []),
        ...(bebidasId ? [{ id: bebidasId, tipo: 'bebida' }] : []),
      ],
      reglas: categories.map((c) => ({
        categoria_id: c.id,
        categoria_origen: c.nombre,
        sugerir_tipos:
          c.nombre === 'Bebidas' || c.nombre === 'Contornos'
            ? ['acompanamiento']
            : suggestionKinds,
      })),
    },
  };
  cfg.upselling = true;

  console.log('inicio_menu.ver_metodos_pago → false');
  console.log('upsell categorias:', upsell_config.pre_checkout.categorias);

  const JUGO_SABORES = [
    'Naranja',
    'Parchita',
    'Lechosa',
    'Melón',
    'Patilla',
    'Fresa',
  ];
  const REFRESCO_SABORES = [
    'Coca-Cola',
    'Pepsi',
    'Frescolita',
    'Chinoto',
    'Naranja',
    'Uva',
  ];

  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,descripcion,precio,imagen_url,opciones_menu,categoria_id,orden')
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;

  const byName = new Map(products.map((p) => [p.nombre, p]));

  /** @type {Array<{id:string, patch: Record<string, unknown>, label:string}>} */
  const productPatches = [];

  // Clear choice lists from descriptions when options already exist / will exist
  const parrillaIndividual = byName.get('Parrilla Individual');
  if (parrillaIndividual) {
    productPatches.push({
      id: parrillaIndividual.id,
      label: 'Parrilla Individual: descripción limpia (opciones ya existen)',
      patch: {
        descripcion: 'Parrilla individual. Elige proteína y acompañante.',
      },
    });
  }

  // Parrilla Familiar inclusions stay as description (fixed plate, not choices)

  const jugos = byName.get('Jugos Naturales');
  if (jugos && !(jugos.opciones_menu?.grupos?.length > 0)) {
    productPatches.push({
      id: jugos.id,
      label: 'Jugos Naturales: sabores',
      patch: {
        opciones_menu: withGroups([
          group({
            nombre: 'Sabor',
            opciones: JUGO_SABORES.map((nombre) => ({ nombre })),
          }),
        ]),
        descripcion: null,
      },
    });
  }

  const refrescos = byName.get('Refrescos');
  if (refrescos && !(refrescos.opciones_menu?.grupos?.length > 0)) {
    productPatches.push({
      id: refrescos.id,
      label: 'Refrescos: sabores',
      patch: {
        opciones_menu: withGroups([
          group({
            nombre: 'Sabor',
            opciones: REFRESCO_SABORES.map((nombre) => ({ nombre })),
          }),
        ]),
        descripcion: null,
      },
    });
  }

  // Contornos: keep as menu info, clear repetitive description noise
  for (const p of products) {
    if (p.categoria_id === contornosId && (p.descripcion || '').includes('elige 2')) {
      productPatches.push({
        id: p.id,
        label: `${p.nombre}: descripción contorno`,
        patch: {
          descripcion: 'Incluido: elige 2 al pedir tu carne.',
        },
      });
    }
  }

  for (const row of productPatches) {
    console.log('  patch', row.label);
  }

  const missing = products
    .filter((p) => !(p.imagen_url || '').trim())
    .map((p) => {
      const categoryName =
        categories.find((c) => c.id === p.categoria_id)?.nombre || '';
      return {
        ...p,
        categoryName,
        imagePrompt: steakPrompt(p.nombre, categoryName),
      };
    });
  console.log(`Missing images: ${missing.length}`);
  for (const p of missing) console.log(`  · [${p.categoryName}] ${p.nombre}`);

  if (dryRun) {
    console.log('Dry run OK.');
    return;
  }

  const { error: brandErr } = await supabase
    .from('comercios')
    .update({
      branding_ia: branding,
      upsell_config,
      updated_at: new Date().toISOString(),
    })
    .eq('id', comercio.id);
  if (brandErr) throw brandErr;

  const { error: upsellErr } = await supabase.from('upsell_settings').upsert(
    {
      comercio_id: comercio.id,
      enabled: true,
      show_add_to_cart: true,
      show_cart: true,
      show_checkout: true,
      max_add_suggestions: 2,
      max_cart_suggestions: 3,
      max_checkout_suggestions: 2,
      free_delivery_order_types: ['delivery'],
    },
    { onConflict: 'comercio_id' },
  );
  if (upsellErr) throw upsellErr;
  console.log('Home payments hidden + ventas sugeridas refreshed');

  for (const row of productPatches) {
    const { error } = await supabase
      .from('productos')
      .update(row.patch)
      .eq('id', row.id)
      .eq('comercio_id', comercio.id);
    if (error) throw error;
  }
  console.log(`Product patches applied: ${productPatches.length}`);

  if (missing.length === 0) {
    console.log('No AI images needed.');
    return;
  }

  let wallet = await getWallet(comercio.id);
  let balance = Number(wallet?.credits_balance || 0);
  if (balance < missing.length) {
    const add = missing.length - Math.floor(balance);
    console.log(`Topping up ${add} AI credits (have ${balance})`);
    const { error: addErr } = await supabase
      .from('ai_credits_wallet')
      .update({
        credits_balance: Math.floor(balance) + add,
        updated_at: new Date().toISOString(),
      })
      .eq('commerce_id', comercio.id);
    if (addErr) throw addErr;
    wallet = await getWallet(comercio.id);
    balance = Number(wallet?.credits_balance || 0);
  }

  const batches = chunk(missing, BATCH_LIMIT);
  let enqueued = 0;
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    console.log(`Enqueue AI batch ${i + 1}/${batches.length} (${batch.length})…`);
    const result = await enqueueBatch(comercio.id, batch);
    console.log(
      `  enqueued=${result.enqueued_jobs} cost=${result.planned_credits_cost}`,
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
    .select('id,nombre,imagen_url,ai_image_status')
    .eq('comercio_id', comercio.id)
    .in(
      'id',
      missing.map((p) => p.id),
    );
  const done = (after ?? []).filter((p) => (p.imagen_url || '').trim());
  const failed = (after ?? []).filter((p) => (p.ai_image_status || '') === 'failed');
  const pending = (after ?? []).filter(
    (p) =>
      !(p.imagen_url || '').trim() &&
      ['pending', 'processing'].includes(p.ai_image_status || ''),
  );
  const walletAfter = await getWallet(comercio.id);
  console.log(
    `AI done. images=${done.length}/${missing.length} failed=${failed.length} pending=${pending.length}`,
  );
  console.log(`Wallet after: ${walletAfter?.credits_balance}`);
  if (failed.length) {
    console.log('Failed:');
    for (const p of failed) console.log(`  · ${p.nombre}`);
  }
  if (pending.length) {
    console.log('Still pending:');
    for (const p of pending) console.log(`  · ${p.nombre}`);
  }
  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
