/**
 * Provision "Deli-Conos" (slug: deliconos).
 * - Menu + HD images from Menu_Deli_Productos_PCO_Imagenes_HD.xlsx
 * - Delivery zones copied from auto-pizzas-napoles
 * - FX mirrors inversiones-doleto (COP base)
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-deliconos.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-deliconos.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'deliconos';
const NOMBRE = 'Deli-Conos';
const EMAIL = 'deliconos@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584149794550';
const INSTAGRAM = 'https://www.instagram.com/delic.onos/';
const DIRECCION =
  'Palmira, calle 2, CC Mocati, Palmira, Táchira, Venezuela 5015';
const COLOR = '#E91E8C';
const CATEGORIA = 'Heladería / Postres';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const DOLETO_SLUG = 'inversiones-doleto';
/** From maps.app.goo.gl/qFLgVs3gww93VR3z6 */
const LAT = 7.838391;
const LNG = -72.228696;
const XLSX_PATH = resolve(
  process.env.USERPROFILE || '',
  'Downloads/Menu_Deli_Productos_PCO_Imagenes_HD.xlsx',
);
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-f0f7dc81-c8d0-4db1-b5b1-3c986b609c16.jpg',
);
const PRODUCT_BUCKET = 'product-images';
const LOGO_BUCKET = 'logos-comercios';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function buildHorarios() {
  const monWed = {
    open: true,
    ranges: [{ start: '14:00', end: '20:00' }],
  };
  const thuSun = {
    open: true,
    ranges: [{ start: '14:00', end: '21:00' }],
  };
  return {
    timezone: 'America/Caracas',
    days: {
      monday: monWed,
      tuesday: monWed,
      wednesday: monWed,
      thursday: thuSun,
      friday: thuSun,
      saturday: thuSun,
      sunday: thuSun,
    },
  };
}

function brandingPayload({ delivery, rates, modes, sources, adj }) {
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#FFFFFF',
    fuente_titulos: 'Poppins',
    fuente_cuerpo: 'Nunito',
    estilo_botones: 'rounded',
    mood_tags: ['helados', 'dulce', 'familiar', 'colorido'],
    descripcion_visual:
      'Deli-Conos — helados en barquilla y vaso en Palmira, Táchira.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#FFF5FB',
      card_surface: '#FFFFFF',
      text_on_primary: '#FFFFFF',
    },
    config_visual: {
      menu_sticky: true,
      show_images: true,
      items_per_row: 2,
    },
    config_negocio: {
      promovido: false,
      destacado_directorio: false,
      metodos_pago: ['efectivo'],
      social_links: { instagram: INSTAGRAM },
      order_management_mode: 'whatsapp_manual',
      whatsapp_order_format: 'detailed',
      checkout_currencies: ['COP', 'USD', 'VES'],
      moneda_default: 'COP',
      inicio_menu: {
        redes: true,
        catalogo: true,
        delivery: true,
        ver_menu: false,
        ubicacion: true,
        comer_aqui: true,
        para_llevar: true,
        calificacion: true,
        ver_metodos_pago: true,
      },
      delivery_config: delivery,
      exchange_rates: rates,
      exchange_rate_modes: modes,
      exchange_rate_sources: sources,
      exchange_rate_adjustments: adj || undefined,
    },
  };
}

function paymentRows(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'efectivo__cop',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en pesos colombianos (PCO).',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__usd',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en dólares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__ves',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en bolívares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
  ];
}

function parseMenu(filePath) {
  if (!existsSync(filePath)) throw new Error(`Excel not found: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Importar menú'] || wb.Sheets[wb.SheetNames[1]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIdx = rows.findIndex(
    (row) => String(row[0] || '').trim().toUpperCase() === 'SKU',
  );
  if (headerIdx < 0) throw new Error('SKU header not found in Importar menú');
  const products = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const sku = String(row[0] || '').trim();
    const categoria = String(row[1] || '').trim();
    const nombre = String(row[2] || '').trim();
    if (!sku || !nombre) continue;
    const priceRaw = row[3];
    const precio =
      typeof priceRaw === 'number'
        ? priceRaw
        : Number(String(priceRaw).replace(/[^0-9.]/g, ''));
    products.push({
      sku,
      categoria,
      nombre,
      precio: Number.isFinite(precio) ? precio : 0,
      descripcion: String(row[4] || '').trim(),
      orden: Number(row[7]) || products.length + 1,
    });
  }
  return products;
}

function extractProductImages(xlsxPath) {
  const extractRoot = join(tmpdir(), `deliconos_xlsx_${Date.now()}`);
  mkdirSync(extractRoot, { recursive: true });
  const zipPath = join(extractRoot, 'pack.zip');
  copyFileSync(xlsxPath, zipPath);

  // Prefer Expand-Archive on Windows; fall back to unzip if present.
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractRoot.replace(/'/g, "''")}\\out' -Force`,
      ],
      { stdio: 'pipe' },
    );
  } catch {
    execFileSync('unzip', ['-o', zipPath, '-d', join(extractRoot, 'out')], {
      stdio: 'pipe',
    });
  }

  const outDir = join(extractRoot, 'out');
  const drawing = readFileSync(
    join(outDir, 'xl/drawings/drawing1.xml'),
    'utf8',
  );
  const rels = readFileSync(
    join(outDir, 'xl/drawings/_rels/drawing1.xml.rels'),
    'utf8',
  );
  const idToTarget = {};
  for (const m of rels.matchAll(/Target="([^"]+)"\s+Id="([^"]+)"/g)) {
    idToTarget[m[2]] = m[1].replace(/^\//, '');
  }
  const anchors = [
    ...drawing.matchAll(
      /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"/g,
    ),
  ];
  // Catalog sheet: first product image sits on Excel row 5 (1-based) = zero-based 4.
  const byProductIndex = new Map();
  for (const a of anchors) {
    const zeroBasedRow = Number(a[1]);
    const productIndex = zeroBasedRow - 4; // 0..19
    const relPath = idToTarget[a[2]];
    if (!relPath || productIndex < 0) continue;
    byProductIndex.set(productIndex, join(outDir, relPath));
  }
  return { extractRoot, byProductIndex };
}

async function main() {
  const { data: existing } = await supabase
    .from('comercios')
    .select('id,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.error(`Slug ${SLUG} already exists (${existing.id}). Aborting.`);
    process.exit(1);
  }

  const products = parseMenu(XLSX_PATH);
  console.log(`Menu products: ${products.length}`);
  const cats = [...new Set(products.map((p) => p.categoria))];
  console.log('Categories:', cats.join(', '));

  const { data: napoles, error: napolesErr } = await supabase
    .from('comercios')
    .select('branding_ia')
    .eq('id', NAPOLES_ID)
    .single();
  if (napolesErr) throw napolesErr;

  const { data: doleto, error: doletoErr } = await supabase
    .from('comercios')
    .select(
      'branding_ia,exchange_rate_mode,exchange_rate_source,exchange_rate_value,tasa_cambio_pesos,last_rate_update',
    )
    .eq('slug', DOLETO_SLUG)
    .single();
  if (doletoErr) throw doletoErr;

  const delivery = structuredClone(
    napoles.branding_ia?.config_negocio?.delivery_config || {},
  );
  const doletoCfg = doleto.branding_ia?.config_negocio || {};
  const rates = structuredClone(doletoCfg.exchange_rates || {});
  const modes = structuredClone(doletoCfg.exchange_rate_modes || {});
  const sources = structuredClone(doletoCfg.exchange_rate_sources || {});
  const adj = structuredClone(doletoCfg.exchange_rate_adjustments || {});

  console.log('Delivery zones from Napoles:', delivery?.zones?.length || 0);
  console.log('FX from Doleto:', { rates, modes, sources });
  console.log('Coords', LAT, LNG);
  console.log('Logo exists:', existsSync(LOGO_PATH));

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG, NOMBRE);
    console.log(
      'Sample products:',
      products.slice(0, 3).map((p) => `${p.nombre} ${p.precio}`),
    );
    return;
  }

  let ownerId = null;
  const { data: listed } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  const existingUser = (listed?.users || []).find(
    (u) => (u.email || '').toLowerCase() === EMAIL.toLowerCase(),
  );
  if (existingUser) {
    ownerId = existingUser.id;
    const { error: pwError } = await supabase.auth.admin.updateUserById(
      ownerId,
      { password: PASSWORD, email_confirm: true },
    );
    if (pwError) throw pwError;
    console.log('Owner reused', ownerId, EMAIL);
  } else {
    const { data: createdUser, error: userError } =
      await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: NOMBRE, commerce_slug: SLUG },
      });
    if (userError) throw userError;
    ownerId = createdUser.user.id;
    console.log('Owner created', ownerId, EMAIL);
  }

  const branding = brandingPayload({
    delivery,
    rates,
    modes,
    sources,
    adj,
  });
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .insert({
      owner_id: ownerId,
      nombre: NOMBRE,
      slug: SLUG,
      categoria: CATEGORIA,
      color_principal: COLOR,
      direccion: DIRECCION,
      latitud: LAT,
      longitud: LNG,
      whatsapp: WHATSAPP,
      telefonos: WHATSAPP,
      moneda: 'COP',
      moneda_principal: 'COP',
      exchange_rate_quote_currency: 'VES',
      exchange_rate_mode: doleto.exchange_rate_mode || 'auto',
      exchange_rate_source: doleto.exchange_rate_source || 'p2p_binance',
      exchange_rate_value: doleto.exchange_rate_value,
      tasa_cambio_pesos: doleto.tasa_cambio_pesos,
      last_rate_update: doleto.last_rate_update || new Date().toISOString(),
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false,
      metodos_pago: ['Efectivo'],
      metodo_pago_predeterminado: 'Efectivo',
      estados_operacion: ['tachira'],
      horarios: buildHorarios(),
      branding_ia: branding,
    })
    .select('id,slug,nombre')
    .single();
  if (comercioError) throw comercioError;
  console.log('Comercio', comercio.id);

  if (existsSync(LOGO_PATH)) {
    const bytes = readFileSync(LOGO_PATH);
    const objectPath = `${ownerId}/${SLUG}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      console.warn('Logo upload failed:', upErr.message);
    } else {
      const logoUrl = supabase.storage
        .from(LOGO_BUCKET)
        .getPublicUrl(objectPath).data.publicUrl;
      await supabase
        .from('comercios')
        .update({ logo_url: logoUrl })
        .eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
  }

  const { error: payErr } = await supabase
    .from('metodos_pago')
    .insert(paymentRows(comercio.id));
  if (payErr) throw payErr;
  console.log('Payment methods inserted');

  const { data: issued, error: issueError } = await supabase.rpc(
    'issue_gift_cards',
    {
      p_count: 1,
      p_months: 1,
      p_batch_label: 'deliconos-launch',
      p_expires_at: null,
      p_note: 'Activación Deli-Conos',
      p_plan_code: 'menu_monthly',
    },
  );
  if (issueError) throw issueError;
  const card = issued?.cards?.[0];
  if (!card?.id || !card?.code) throw new Error('Gift card issue failed');

  const { data: grant, error: grantError } = await supabase.rpc(
    'grant_subscription_period',
    {
      p_business_id: comercio.id,
      p_plan_code: 'menu_monthly',
      p_months: 1,
      p_provider: 'gift_card',
      p_order_id: `gift:${card.id}`,
      p_amount: 0,
      p_currency: 'USD',
    },
  );
  if (grantError) throw grantError;
  await supabase
    .from('gift_cards')
    .update({
      status: 'redeemed',
      redeemed_by_business: comercio.id,
      redeemed_by_user: ownerId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', card.id);
  console.log('Subscription', grant, 'gift', card.code);

  const { data: catalog, error: catalogError } = await supabase
    .from('catalogos')
    .insert({
      comercio_id: comercio.id,
      nombre: 'Menú principal',
      activo: true,
      orden: 0,
    })
    .select('id')
    .single();
  if (catalogError) throw catalogError;

  const categoryIds = new Map();
  let catOrden = 0;
  for (const catName of cats) {
    const { data: cat, error: catErr } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre: catName,
        orden: catOrden++,
        activo: true,
      })
      .select('id,nombre')
      .single();
    if (catErr) throw catErr;
    categoryIds.set(catName, cat.id);
    console.log('Category', cat.nombre, cat.id);
  }

  let extractRoot = null;
  try {
    const extracted = extractProductImages(XLSX_PATH);
    extractRoot = extracted.extractRoot;
    console.log('Embedded images:', extracted.byProductIndex.size);

    let productOrden = 0;
    for (let i = 0; i < products.length; i += 1) {
      const item = products[i];
      const categoriaId = categoryIds.get(item.categoria);
      if (!categoriaId) {
        console.warn('Skip (no category):', item.nombre);
        continue;
      }

      let imagenUrl = null;
      const localImage = extracted.byProductIndex.get(i);
      if (localImage && existsSync(localImage)) {
        const bytes = readFileSync(localImage);
        const objectPath = `${comercio.id}/deli_${item.sku.toLowerCase()}_${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(PRODUCT_BUCKET)
          .upload(objectPath, bytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });
        if (upErr) {
          console.warn('Image upload failed', item.sku, upErr.message);
        } else {
          imagenUrl = supabase.storage
            .from(PRODUCT_BUCKET)
            .getPublicUrl(objectPath).data.publicUrl;
        }
      } else {
        console.warn('No embedded image for', item.sku, item.nombre);
      }

      const { error: prodErr } = await supabase.from('productos').insert({
        comercio_id: comercio.id,
        categoria_id: categoriaId,
        nombre: item.nombre,
        descripcion: item.descripcion || null,
        precio: item.precio,
        orden: productOrden++,
        disponible: true,
        imagen_url: imagenUrl,
        imagen_source_type: imagenUrl ? 'manual' : null,
      });
      if (prodErr) throw prodErr;
      console.log(
        `Product ${item.sku} ${item.nombre} ${item.precio} PCO${imagenUrl ? ' +img' : ''}`,
      );
    }
  } finally {
    if (extractRoot) {
      try {
        rmSync(extractRoot, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }
  }

  await supabase
    .from('comercios')
    .update({ en_linea: true, onboarding_completed: true })
    .eq('id', comercio.id);

  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Admin: https://app.elmenuxfa.com`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`WhatsApp: ${WHATSAPP}`);
  console.log(`Instagram: ${INSTAGRAM}`);
  console.log(`Address: ${DIRECCION}`);
  console.log(`Hours: Lun-Mié 14:00-20:00 | Jue-Dom 14:00-21:00`);
  console.log(`Delivery zones: ${delivery?.zones?.length || 0} (from Napoles)`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
