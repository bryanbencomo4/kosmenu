/**
 * Provision "Sushi Delivery" (slug: sushidelivery).
 * - Menu from Desktop PDF "sushi delivery menui.pdf"
 * - Delivery config copied from Alegría (Caracas)
 * - FX: BCV USD auto; checkout USD + VES; cash only
 * - WhatsApp from Instagram bio (@sushideliveryve): 412-3342983
 * - Coords from maps.app.goo.gl/KJRASKyhJ98tpjS76
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-sushidelivery.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-sushidelivery.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'sushidelivery';
const NOMBRE = 'Sushi Delivery';
const EMAIL = 'sushidelivery@1xp.fr';
const PASSWORD = '123456789';
/** Rest/Delivery from Instagram bio */
const WHATSAPP = '+584123342983';
const INSTAGRAM = 'https://www.instagram.com/sushideliveryve/';
const DIRECCION =
  'C. Páez, Caracas, Venezuela\nReferencia: Local 8, Residencias Mediterraneo PB, C. Páez';
const COLOR_HEX = '#0033A0';
const CATEGORIA = 'Sushi / Asiática';
const ALEGRIA_ID = '51a4be30-27b6-4e53-8761-9fddc9837790';
/** From maps.app.goo.gl/KJRASKyhJ98tpjS76 → place/sushidelivery */
const LAT = 10.494388;
const LNG = -66.8556212;
const PDF_PATH = resolve(
  process.env.USERPROFILE || '',
  'OneDrive/Desktop/sushi delivery menui.pdf',
);
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_sushi_delivery_logo-1fcbc05e-9d6f-4b31-bad5-50c36f963c16.jpg',
);

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Preferred category display order */
const CATEGORY_ORDER = [
  'Entradas',
  'Ensaladas',
  'Temakis',
  'Rolls',
  'Rolls especiales',
  'Rolls tempurizados',
  'Rolls sin arroz',
  'Rolls papel de soya',
  'Hosomaki',
  'Sushi niguiri',
  'Sashimi',
  'Combos',
  'Combos tempurizados',
  'Menú tempura',
  'Pokes',
  'Extras',
  'Postres',
  'Bebidas',
];

/** Only full section titles (not description lines that mention the word). */
const SECTION_MAP = [
  { match: /^men[uú]\s*tempura\s*$/i, cat: 'Menú tempura' },
  { match: /^extras\s*$/i, cat: 'Extras' },
  { match: /^postres\s*$/i, cat: 'Postres' },
  { match: /^bebidas\s*$/i, cat: 'Bebidas' },
  { match: /^forma\s+de\s+pago\b/i, cat: null },
  { match: /^entradas\s*$/i, cat: 'Entradas' },
  { match: /^ensaladas\s*$/i, cat: 'Ensaladas' },
  { match: /^temakis(\s+conos)?(\s*\([^)]*\))?\s*$/i, cat: 'Temakis' },
  { match: /^combos\s+tempurizados\s*$/i, cat: 'Combos tempurizados' },
  { match: /^combos\s*$/i, cat: 'Combos' },
  { match: /^hosomaki(\s*\([^)]*\))?\s*\.?\s*$/i, cat: 'Hosomaki' },
  { match: /^sashimi(\s*\([^)]*\))?\s*\.?\s*$/i, cat: 'Sashimi' },
  { match: /^sushi\s+niguiri(\s*\([^)]*\))?\s*\.?\s*$/i, cat: 'Sushi niguiri' },
  { match: /^rolls\s+especiales(\s*\([^)]*\))?\s*$/i, cat: 'Rolls especiales' },
  { match: /^rolls\s+sin\s+arroz(\s*\([^)]*\))?\s*$/i, cat: 'Rolls sin arroz' },
  { match: /^rolls\s+papel\s+de\s+soya(\s*\([^)]*\))?\s*$/i, cat: 'Rolls papel de soya' },
  { match: /^rolls\s+tempurizados(\s*\([^)]*\))?\s*$/i, cat: 'Rolls tempurizados' },
  { match: /^rolls(\s*\([^)]*\))?\s*$/i, cat: 'Rolls' },
  { match: /^pokes(\s*\([^)]*\))?\s*$/i, cat: 'Pokes' },
];

function oid(prefix = 'g') {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function uniqueGroup({ nombre, opciones, obligatorio = true }) {
  return {
    id: oid('g'),
    nombre,
    tipo: 'unica',
    obligatorio,
    min: 1,
    max: 1,
    opciones: opciones.map((o, i) => ({
      id: oid('o'),
      nombre: o.nombre,
      precio: Number(o.precio ?? 0),
      activo: true,
      ...(i === 0 ? { predeterminada: true } : {}),
    })),
  };
}

function withGroups(groups) {
  return { activadas: true, grupos: groups };
}

function prettyName(raw) {
  const cleaned = String(raw || '').replace(/\s+/g, ' ').trim();
  // Keep ALL-CAPS brand style from the printed menu.
  return cleaned
    .replace(/\bANGILA\b/gi, 'ANGUILA')
    .replace(/\s+\(\s+/g, ' (')
    .replace(/\s+\)/g, ')');
}

function parsePriceToken(token) {
  let t = String(token || '')
    .trim()
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '');
  // OCR: letter O as zero in "1O"
  t = t.replace(/O/gi, '0');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function looksLikeProductLine(line) {
  return /\.{2,}[\s.]*[\dO]+([.,]\d+)?(\s*\/\s*[\dO]+([.,]\d+)?)?\s*$/i.test(line);
}

function splitProductLine(line) {
  const m = line.match(/^(.*?)\.{2,}[\s.]*(.+?)\s*$/);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  const pricePart = m[2].replace(/^[\s.]+/, '').trim();
  if (!name) return null;
  if (/\//.test(pricePart)) {
    const [a, b] = pricePart.split('/').map((p) => parsePriceToken(p));
    if (a == null || b == null) return null;
    return { name, price: a, priceAlt: b };
  }
  const price = parsePriceToken(pricePart);
  if (price == null) return null;
  return { name, price };
}

function detectSection(line) {
  const cleaned = line.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  // Skip footer / noise
  if (/^escanear?me$/i.test(cleaned)) return null;
  if (/sushideliveryve|www\.sushidelivery|oku sushi|rif:/i.test(cleaned)) {
    return null;
  }
  if (/^\d+\s+of\s+\d+$/i.test(cleaned)) return null;
  if (looksLikeProductLine(cleaned)) return undefined;
  for (const rule of SECTION_MAP) {
    if (rule.match.test(cleaned)) return rule.cat;
  }
  return undefined;
}

async function extractPdfText(pdfPath) {
  if (!existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);
  const buf = readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return String(result.text || '');
  } finally {
    await parser.destroy?.();
  }
}

function parseMenuFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/\t/g, ' ').trim())
    .filter(Boolean)
    .filter((l) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l));

  /** @type {Array<{ categoria: string, nombre: string, precio: number, descripcion: string, opciones_menu?: object }>} */
  const items = [];
  let category = null;
  let current = null;

  const flush = () => {
    if (!current || !category) {
      current = null;
      return;
    }
    const desc = current.descParts.join(' ').replace(/\s+/g, ' ').trim();
    const product = {
      categoria: category,
      nombre: prettyName(current.name),
      precio: current.price,
      descripcion: desc,
    };
    if (current.priceAlt != null && category === 'Pokes') {
      product.opciones_menu = withGroups([
        uniqueGroup({
          nombre: 'Tamaño',
          opciones: [
            { nombre: '16 Oz', precio: 0 },
            { nombre: '24 Oz', precio: Number((current.priceAlt - current.price).toFixed(2)) },
          ],
        }),
      ]);
      product.descripcion = [
        desc,
        'Todos los poke incluyen 1 salsa de anguila, 1 salsa dragón y 1 salsa mayotrufa.',
      ]
        .filter(Boolean)
        .join(' ');
    }
    items.push(product);
    current = null;
  };

  for (const line of lines) {
    const section = detectSection(line);
    if (section !== undefined) {
      flush();
      category = section; // null = skip (FORMA DE PAGO)
      continue;
    }
    if (!category) continue;

    if (looksLikeProductLine(line)) {
      flush();
      const parsed = splitProductLine(line);
      if (!parsed) continue;
      // Skip poke note line if it somehow matches
      if (/todos los poke/i.test(parsed.name)) continue;
      current = {
        name: parsed.name,
        price: parsed.price,
        priceAlt: parsed.priceAlt ?? null,
        descParts: [],
      };
      continue;
    }

    // Description / continuation
    if (current) {
      if (/todos los poke incluyen/i.test(line)) continue;
      current.descParts.push(line);
    }
  }
  flush();

  // Deduplicate by category+name (keep first)
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = `${item.categoria}::${item.nombre.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function brandingPayload(alegria, rate) {
  const delivery = structuredClone(
    alegria.branding_ia?.config_negocio?.delivery_config || {},
  );
  return {
    schema_version: 2,
    color_principal: COLOR_HEX,
    color_secundario: '#F5C518',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['sushi', 'asiatico', 'delivery', 'fresco'],
    descripcion_visual: 'Sushi Delivery by OKU Group — rolls, poke y más en Caracas.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#F7F9FC',
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
      checkout_currencies: ['USD', 'VES'],
      moneda_default: 'USD',
      inicio_menu: {
        redes: true,
        catalogo: false,
        delivery: true,
        ver_menu: false,
        ubicacion: true,
        comer_aqui: true,
        para_llevar: true,
        calificacion: true,
        ver_metodos_pago: true,
      },
      delivery_config: delivery,
      exchange_rates: { VES: rate },
      exchange_rate_modes: { VES: 'auto' },
      exchange_rate_sources: { VES: 'bcv_usd' },
    },
  };
}

function paymentRows(comercioId) {
  return [
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

async function main() {
  const pdfText = await extractPdfText(PDF_PATH);
  const menuItems = parseMenuFromText(pdfText);
  const catsPresent = [...new Set(menuItems.map((p) => p.categoria))];
  const cats = [
    ...CATEGORY_ORDER.filter((c) => catsPresent.includes(c)),
    ...catsPresent.filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  console.log(`PDF products parsed: ${menuItems.length}`);
  console.log(
    'Categories:',
    cats.map((c) => `${c} (${menuItems.filter((p) => p.categoria === c).length})`).join(', '),
  );
  if (menuItems.length < 40) {
    throw new Error(`Menu parse too small (${menuItems.length}); aborting.`);
  }

  const { data: existing } = await supabase
    .from('comercios')
    .select('id,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.error(`Slug ${SLUG} already exists (${existing.id}). Aborting.`);
    process.exit(1);
  }

  const { data: alegria, error: alegriaErr } = await supabase
    .from('comercios')
    .select('branding_ia')
    .eq('id', ALEGRIA_ID)
    .single();
  if (alegriaErr) throw alegriaErr;

  const { data: usdRef } = await supabase
    .from('comercios')
    .select('exchange_rate_value,last_rate_update')
    .eq('exchange_rate_source', 'bcv_usd')
    .eq('exchange_rate_mode', 'auto')
    .gt('exchange_rate_value', 1)
    .order('last_rate_update', { ascending: false })
    .limit(1)
    .maybeSingle();

  const rate = Number(usdRef?.exchange_rate_value);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Could not resolve a live BCV USD rate');
  }

  const delivery = alegria.branding_ia?.config_negocio?.delivery_config || {};
  console.log(`BCV USD rate: ${rate} VES`);
  console.log('Delivery from Alegria:', {
    pricing_type: delivery.pricing_type,
    zones: delivery.zones?.length || 0,
    area_zones: delivery.area_zones?.length || 0,
  });
  console.log('Coords', LAT, LNG);
  console.log('Logo exists:', existsSync(LOGO_PATH));

  if (dryRun) {
    console.log('Dry run OK. Sample items:');
    for (const item of menuItems.slice(0, 12)) {
      console.log(`- [${item.categoria}] ${item.nombre} · US$ ${item.precio}`);
    }
    console.log('Would create', EMAIL, SLUG, NOMBRE);
    return;
  }

  let ownerId = null;
  const { data: listed } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existingUser = (listed?.users || []).find(
    (u) => (u.email || '').toLowerCase() === EMAIL.toLowerCase(),
  );
  if (existingUser) {
    ownerId = existingUser.id;
    const { error: pwError } = await supabase.auth.admin.updateUserById(ownerId, {
      password: PASSWORD,
      email_confirm: true,
    });
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

  const branding = brandingPayload(alegria, rate);
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .insert({
      owner_id: ownerId,
      nombre: NOMBRE,
      slug: SLUG,
      categoria: CATEGORIA,
      color_principal: COLOR_HEX,
      direccion: DIRECCION,
      latitud: LAT,
      longitud: LNG,
      whatsapp: WHATSAPP,
      telefonos: WHATSAPP,
      moneda: 'USD',
      moneda_principal: 'USD',
      exchange_rate_quote_currency: 'VES',
      exchange_rate_mode: 'auto',
      exchange_rate_source: 'bcv_usd',
      exchange_rate_value: rate,
      last_rate_update: usdRef?.last_rate_update || new Date().toISOString(),
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false,
      metodos_pago: ['Efectivo'],
      metodo_pago_predeterminado: 'Efectivo',
      estados_operacion: ['distrito-capital'],
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
      .from('logos-comercios')
      .upload(objectPath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (upErr) {
      console.warn('Logo upload failed:', upErr.message);
    } else {
      const logoUrl = supabase.storage
        .from('logos-comercios')
        .getPublicUrl(objectPath).data.publicUrl;
      await supabase.from('comercios').update({ logo_url: logoUrl }).eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
  } else {
    console.warn('Logo file not found:', LOGO_PATH);
  }

  const { error: payErr } = await supabase
    .from('metodos_pago')
    .insert(paymentRows(comercio.id));
  if (payErr) throw payErr;
  console.log('Payment methods inserted (cash USD/VES)');

  const { data: issued, error: issueError } = await supabase.rpc('issue_gift_cards', {
    p_count: 1,
    p_months: 1,
    p_batch_label: 'sushidelivery-launch',
    p_expires_at: null,
    p_note: 'Activación Sushi Delivery',
    p_plan_code: 'menu_monthly',
  });
  if (issueError) throw issueError;
  const card = issued?.cards?.[0];
  if (!card?.id || !card?.code) throw new Error('Gift card issue failed');
  console.log('Gift card code:', card.code);

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

  const { error: redeemMarkError } = await supabase
    .from('gift_cards')
    .update({
      status: 'redeemed',
      redeemed_by_business: comercio.id,
      redeemed_by_user: ownerId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', card.id);
  if (redeemMarkError) throw redeemMarkError;
  console.log('Subscription', grant);

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
  console.log('Catalog', catalog.id);

  const categoryIds = new Map();
  let ordenCat = 0;
  for (const nombre of cats) {
    const { data: category, error } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre,
        orden: ordenCat++,
        activo: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    categoryIds.set(nombre, category.id);
  }

  const byCatOrden = new Map();
  let inserted = 0;
  for (const item of menuItems) {
    const ord = byCatOrden.get(item.categoria) ?? 0;
    byCatOrden.set(item.categoria, ord + 1);
    const { error } = await supabase.from('productos').insert({
      comercio_id: comercio.id,
      categoria_id: categoryIds.get(item.categoria),
      nombre: item.nombre,
      descripcion: item.descripcion || null,
      precio: item.precio,
      disponible: true,
      orden: ord,
      imagen_source_type: 'manual',
      ...(item.opciones_menu ? { opciones_menu: item.opciones_menu } : {}),
    });
    if (error) throw error;
    inserted += 1;
  }
  console.log(`Inserted ${inserted} products`);

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
  console.log(`Products: ${inserted}`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
