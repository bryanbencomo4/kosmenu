/**
 * Apply El Parche del Gato catalog requests (data only).
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/update-elparche-catalog-requests.mjs
 *   node --env-file=.env.local scripts/update-elparche-catalog-requests.mjs --skip-images
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const SLUG = 'el-parche-del-gato';
const skipImages = process.argv.includes('--skip-images');
const TIKTOK = 'https://www.tiktok.com/@elparchedelgato_';
const EMPAQUE = { surcharge: 1000, surcharge_label: 'Empaque' };

const JUGO_SABORES = ['Mora', 'Fresa', 'Parchita', 'Guanábana'];
const REFRESCO_SABORES = [
  'Coca-Cola',
  'Chinoto',
  'Frescolita',
  'Fanta de toronja',
];

const CATEGORY_ORDER = [
  'Entradas',
  'Hamburguesas',
  'Perros Calientes',
  'Salchipapas',
  'Pollo Broaster',
  'Arepas',
  'Bebidas',
];

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

function rid(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function unica(nombre, labels, { min = 1, max = 1, obligatorio = true } = {}) {
  return {
    id: rid('g'),
    max,
    min,
    tipo: max > 1 ? 'multiple' : 'unica',
    nombre,
    obligatorio,
    opciones: labels.map((label) => ({
      id: rid('o'),
      activo: true,
      nombre: label,
      precio: 0,
    })),
  };
}

function withDelivery(menu) {
  const base =
    menu && typeof menu === 'object' && !Array.isArray(menu)
      ? structuredClone(menu)
      : {};
  base.delivery = { ...(base.delivery || {}), ...EMPAQUE, exclude: false };
  return base;
}

function jugoOptions() {
  return {
    activadas: true,
    grupos: [
      unica('Sabor', JUGO_SABORES),
      {
        id: rid('g'),
        max: 1,
        min: 0,
        tipo: 'unica',
        nombre: 'Leche',
        obligatorio: false,
        pregunta_activada: true,
        pregunta: '¿Quieres agregarle leche?',
        opciones: [
          {
            id: rid('o'),
            activo: true,
            nombre: 'Agregar leche',
            precio: 1000,
          },
        ],
      },
    ],
    delivery: { ...EMPAQUE, exclude: false },
  };
}

function refrescoOptions() {
  return {
    activadas: true,
    grupos: [unica('Sabor', REFRESCO_SABORES)],
    delivery: { ...EMPAQUE, exclude: false },
  };
}

async function ensureCredits(commerceId, needed) {
  const { data: wallet } = await sb
    .from('ai_credits_wallet')
    .select('credits_balance')
    .eq('commerce_id', commerceId)
    .maybeSingle();
  const balance = Number(wallet?.credits_balance || 0);
  if (balance >= needed) return balance;
  const add = needed - balance + 5;
  const { error } = await sb.rpc('add_ai_credits', {
    p_commerce_id: commerceId,
    p_amount: add,
    p_reason: 'elparche_catalog_ai_images',
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
  return balance + add;
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
        category_name: p.categoryName || '',
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
      source: 'elparche_catalog_requests',
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
    .select('id,nombre,branding_ia')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: cats, error: catErr } = await sb
    .from('categorias')
    .select('id,nombre,orden,activo,catalogo_id')
    .eq('comercio_id', comercio.id);
  if (catErr) throw catErr;

  const byName = new Map(cats.map((c) => [fold(c.nombre), c]));
  const need = (name) => {
    const c = byName.get(fold(name));
    if (!c) throw new Error(`Missing category: ${name}`);
    return c;
  };

  const hamburguesas = need('Hamburguesas');
  const woper = need('Woper');
  const alitas = need('Alitas');
  const broaster = need('Pollo Broaster');
  const arroz = need('Arroz Chino');
  const perros = need('Perros Calientes');
  const bebidas = need('Bebidas');

  const { data: products, error: pErr } = await sb
    .from('productos')
    .select(
      'id,nombre,precio,categoria_id,disponible,descripcion,imagen_url,opciones_menu,orden',
    )
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;

  const logs = [];

  // 01–02: Woper → Hamburguesas, disable Woper
  const woperProducts = products.filter((p) => p.categoria_id === woper.id);
  for (const p of woperProducts) {
    const { error } = await sb
      .from('productos')
      .update({ categoria_id: hamburguesas.id })
      .eq('id', p.id);
    if (error) throw error;
    logs.push(`Moved ${p.nombre} → Hamburguesas`);
  }
  {
    const { error } = await sb
      .from('categorias')
      .update({ activo: false })
      .eq('id', woper.id);
    if (error) throw error;
    logs.push('Disabled category Woper');
  }

  // 08: Alitas → Pollo Broaster
  const alitasProducts = products.filter((p) => p.categoria_id === alitas.id);
  for (const p of alitasProducts) {
    const { error } = await sb
      .from('productos')
      .update({ categoria_id: broaster.id })
      .eq('id', p.id);
    if (error) throw error;
    logs.push(`Moved ${p.nombre} → Pollo Broaster`);
  }
  {
    const { error } = await sb
      .from('categorias')
      .update({ activo: false })
      .eq('id', alitas.id);
    if (error) throw error;
    logs.push('Disabled category Alitas');
  }

  // 05: Disable Arroz Chino + products
  const arrozProducts = products.filter((p) => p.categoria_id === arroz.id);
  for (const p of arrozProducts) {
    const { error } = await sb
      .from('productos')
      .update({ disponible: false })
      .eq('id', p.id);
    if (error) throw error;
    logs.push(`Disabled product ${p.nombre}`);
  }
  {
    const { error } = await sb
      .from('categorias')
      .update({ activo: false })
      .eq('id', arroz.id);
    if (error) throw error;
    logs.push('Disabled category Arroz Chino');
  }

  // 06, 09, 13: disable specific products
  const disableNames = [
    'Salchiqueso',
    'Chorifrito',
    'Merengadas',
    'Jugo del Valle 1.5 Litros',
    'Jugo del Valle 500 ml',
    'Jugo Del Valle',
    'Jugo del Valle',
  ];
  for (const p of products) {
    const n = fold(p.nombre);
    const hit = disableNames.some((name) => {
      const f = fold(name);
      return n === f || n.includes(f);
    });
    // Avoid disabling "Jugos naturales"
    if (n.includes('jugos naturales')) continue;
    if (!hit) continue;
    // Only disable Valle / listed items
    if (n.includes('jugo') && !n.includes('valle') && n !== fold('Merengadas')) {
      if (!['salchiqueso', 'chorifrito', 'merengadas'].includes(n)) continue;
    }
    const { error } = await sb
      .from('productos')
      .update({ disponible: false })
      .eq('id', p.id);
    if (error) throw error;
    logs.push(`Disabled product ${p.nombre}`);
  }

  // 04: category order (keep Arepas + Pollo Broaster before Bebidas)
  for (let i = 0; i < CATEGORY_ORDER.length; i++) {
    const cat = byName.get(fold(CATEGORY_ORDER[i]));
    if (!cat) continue;
    const { error } = await sb
      .from('categorias')
      .update({ orden: i, activo: true })
      .eq('id', cat.id);
    if (error) throw error;
  }
  logs.push(`Category order: ${CATEGORY_ORDER.join(' → ')}`);

  // Refresh products after moves
  const { data: fresh, error: freshErr } = await sb
    .from('productos')
    .select(
      'id,nombre,precio,categoria_id,disponible,descripcion,imagen_url,opciones_menu,orden',
    )
    .eq('comercio_id', comercio.id);
  if (freshErr) throw freshErr;

  const catName = (id) => cats.find((c) => c.id === id)?.nombre || '';

  // 10: Jugos naturales options
  const jugos = fresh.find(
    (p) => fold(p.nombre) === fold('Jugos naturales') && p.disponible !== false,
  );
  if (jugos) {
    const { error } = await sb
      .from('productos')
      .update({ opciones_menu: jugoOptions() })
      .eq('id', jugos.id);
    if (error) throw error;
    logs.push('Updated Jugos naturales options (sabores + leche +1000)');
  } else {
    logs.push('WARN: Jugos naturales not found');
  }

  // 12: Refresco sabores on all refresco products (except new lata handled below)
  const refrescoTargets = fresh.filter((p) => {
    if (p.disponible === false) return false;
    const n = fold(p.nombre);
    return n.includes('refresco');
  });
  for (const p of refrescoTargets) {
    const { error } = await sb
      .from('productos')
      .update({ opciones_menu: refrescoOptions() })
      .eq('id', p.id);
    if (error) throw error;
    logs.push(`Updated refresco sabores: ${p.nombre}`);
  }

  // 07: Empaque 1000 on all still-available products (merge delivery)
  for (const p of fresh) {
    if (p.disponible === false) continue;
    // Skip products we just fully replaced opciones for; they already have delivery
    const n = fold(p.nombre);
    if (n === fold('Jugos naturales') || n.includes('refresco')) continue;
    const menu = withDelivery(p.opciones_menu);
    const { error } = await sb
      .from('productos')
      .update({ opciones_menu: menu })
      .eq('id', p.id);
    if (error) throw error;
  }
  logs.push('Applied Empaque delivery surcharge 1000 COP to available products');

  // 14: Agua con Gas + Refresco de Lata
  const maxBebidaOrden = Math.max(
    0,
    ...fresh
      .filter((p) => p.categoria_id === bebidas.id)
      .map((p) => Number(p.orden) || 0),
  );

  async function upsertDrink(nombre, precio, opciones_menu, orden) {
    const existing = fresh.find((p) => fold(p.nombre) === fold(nombre));
    if (existing) {
      const { error } = await sb
        .from('productos')
        .update({
          disponible: true,
          precio,
          categoria_id: bebidas.id,
          opciones_menu,
          orden,
        })
        .eq('id', existing.id);
      if (error) throw error;
      logs.push(`Updated existing drink ${nombre}`);
      return existing.id;
    }
    const { data, error } = await sb
      .from('productos')
      .insert({
        comercio_id: comercio.id,
        categoria_id: bebidas.id,
        nombre,
        descripcion: '',
        precio,
        disponible: true,
        orden,
        opciones_menu,
      })
      .select('id')
      .single();
    if (error) throw error;
    logs.push(`Created drink ${nombre}`);
    return data.id;
  }

  await upsertDrink(
    'Agua con Gas',
    3500,
    withDelivery(null),
    maxBebidaOrden + 1,
  );
  await upsertDrink(
    'Refresco de Lata',
    3500,
    refrescoOptions(),
    maxBebidaOrden + 2,
  );

  // 11: TikTok social link
  const branding = structuredClone(comercio.branding_ia || {});
  branding.config_negocio = branding.config_negocio || {};
  branding.config_negocio.social_links = {
    ...(branding.config_negocio.social_links || {}),
    tiktok: TIKTOK,
  };
  // Keep redes visible on home
  branding.config_negocio.inicio_menu = {
    ...(branding.config_negocio.inicio_menu || {}),
    redes: true,
  };
  {
    const { error } = await sb
      .from('comercios')
      .update({
        branding_ia: branding,
        updated_at: new Date().toISOString(),
      })
      .eq('id', comercio.id);
    if (error) throw error;
    logs.push(`TikTok set to ${TIKTOK}`);
  }

  console.log('\n=== CATALOG UPDATES ===');
  for (const line of logs) console.log('•', line);

  // Verify snapshot
  const { data: cats2 } = await sb
    .from('categorias')
    .select('id,nombre,orden,activo')
    .eq('comercio_id', comercio.id)
    .order('orden');
  const { data: prods2 } = await sb
    .from('productos')
    .select(
      'id,nombre,precio,categoria_id,disponible,opciones_menu,descripcion,imagen_url',
    )
    .eq('comercio_id', comercio.id)
    .eq('disponible', true);

  console.log('\n=== ACTIVE CATEGORIES ===');
  for (const c of cats2.filter((c) => c.activo !== false)) {
    console.log(`${c.orden}. ${c.nombre}`);
  }
  console.log('\n=== AVAILABLE PRODUCTS ===');
  for (const p of prods2.sort((a, b) => {
    const ao = cats2.find((c) => c.id === a.categoria_id)?.orden ?? 99;
    const bo = cats2.find((c) => c.id === b.categoria_id)?.orden ?? 99;
    return ao - bo || a.nombre.localeCompare(b.nombre);
  })) {
    const cat = cats2.find((c) => c.id === p.categoria_id)?.nombre;
    const del = p.opciones_menu?.delivery;
    const grupos = (p.opciones_menu?.grupos || [])
      .map((g) => g.nombre)
      .join('|');
    console.log(
      `${cat} | ${p.precio} | ${p.nombre} | emp=${del?.surcharge ?? '-'} | ${grupos}`,
    );
  }

  if (skipImages) {
    console.log('\nSkipped AI images (--skip-images)');
    return;
  }

  // 03: Replace all images with AI for available products
  const imageTargets = prods2.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion || '',
    categoryName: cats2.find((c) => c.id === p.categoria_id)?.nombre || '',
  }));
  console.log(`\n=== AI IMAGES (${imageTargets.length}) ===`);
  await ensureCredits(comercio.id, imageTargets.length);

  const chunkSize = 5;
  for (let i = 0; i < imageTargets.length; i += chunkSize) {
    const chunk = imageTargets.slice(i, i + chunkSize);
    process.stdout.write(
      `Enqueue ${i + 1}-${i + chunk.length}/${imageTargets.length}... `,
    );
    try {
      const result = await enqueueAi(comercio.id, chunk);
      console.log(
        `OK jobs=${result.enqueued_jobs ?? '?'} batch=${result.batch_id || '-'}`,
      );
    } catch (err) {
      console.log(`FAIL ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  // Drive worker until settled or timeout
  const started = Date.now();
  const maxMs = 25 * 60 * 1000;
  while (Date.now() - started < maxMs) {
    const { data: jobs } = await sb
      .from('ai_image_jobs')
      .select('id,status')
      .eq('commerce_id', comercio.id)
      .in('status', ['queued', 'processing', 'pending']);
    const pending = jobs?.length || 0;
    if (pending === 0) {
      console.log('AI jobs settled');
      break;
    }
    process.stdout.write(`Worker pending=${pending}... `);
    try {
      const result = await processWorker(comercio.id, 5);
      console.log(JSON.stringify(result?.processed ?? result?.stats ?? result));
    } catch (err) {
      console.log(`err ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const { data: afterImgs } = await sb
    .from('productos')
    .select('id,nombre,imagen_url')
    .eq('comercio_id', comercio.id)
    .eq('disponible', true);
  const withImg = (afterImgs || []).filter((p) => (p.imagen_url || '').trim());
  console.log(`Images present: ${withImg.length}/${afterImgs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
