/**
 * Provision independent Arepas menu for El Parche del Gato.
 * - New commerce: same config, only Arepas + Bebidas
 * - Remove Arepas from the original menu (Bebidas stay)
 * - Bebidas duplicated so they appear on both menus
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-elparche-arepas-menu.mjs
 *   node --env-file=.env.local scripts/provision-elparche-arepas-menu.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SOURCE_SLUG = 'el-parche-del-gato';
const NEW_SLUG = 'el-parche-del-gato-arepas';
const NEW_NAME = 'El Parche del Gato — Arepas';
const dryRun = process.argv.includes('--dry-run');

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need Supabase env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cloneJson(value) {
  return value == null ? value : structuredClone(value);
}

async function main() {
  const { data: source, error: sErr } = await sb
    .from('comercios')
    .select('*')
    .eq('slug', SOURCE_SLUG)
    .single();
  if (sErr) throw sErr;

  const { data: existingNew } = await sb
    .from('comercios')
    .select('id,slug,nombre')
    .eq('slug', NEW_SLUG)
    .maybeSingle();
  if (existingNew) {
    throw new Error(
      `Slug ${NEW_SLUG} already exists (${existingNew.id}). Aborting.`,
    );
  }

  const { data: sourceCats } = await sb
    .from('categorias')
    .select('id,nombre,orden,activo,rol,icono,imagen_url,opciones_menu,catalogo_id')
    .eq('comercio_id', source.id);
  const arepasCat = sourceCats.find((c) => c.nombre === 'Arepas');
  const bebidasCat = sourceCats.find((c) => c.nombre === 'Bebidas');
  if (!arepasCat) throw new Error('Source Arepas category missing');
  if (!bebidasCat) throw new Error('Source Bebidas category missing');

  const { data: arepasProducts } = await sb
    .from('productos')
    .select('*')
    .eq('comercio_id', source.id)
    .eq('categoria_id', arepasCat.id)
    .eq('disponible', true)
    .order('orden');
  const { data: bebidasProducts } = await sb
    .from('productos')
    .select('*')
    .eq('comercio_id', source.id)
    .eq('categoria_id', bebidasCat.id)
    .eq('disponible', true)
    .order('orden');

  const { data: payments } = await sb
    .from('metodos_pago')
    .select('tipo,nombre,descripcion,detalles')
    .eq('comercio_id', source.id);

  console.log('Source', source.nombre, source.id);
  console.log('Arepas products', arepasProducts?.length);
  console.log('Bebidas products', bebidasProducts?.length);
  console.log('Payments', payments?.length);

  if (dryRun) {
    console.log('DRY RUN — would create', NEW_SLUG, NEW_NAME);
    console.log('Would deactivate Arepas on source menu');
    return;
  }

  const branding = cloneJson(source.branding_ia) || {};
  branding.config_negocio = branding.config_negocio || {};
  // Keep same home/delivery/social; clear nothing essential.
  const upsellConfig = {
    upselling: true,
    pre_checkout: {
      activo: true,
      tipos: ['bebida'],
      max_productos: 12,
      categorias: [],
      reglas: [],
    },
  };

  const insertComercio = {
    nombre: NEW_NAME,
    slug: NEW_SLUG,
    owner_id: source.owner_id,
    logo_url: source.logo_url,
    color_principal: source.color_principal,
    whatsapp: source.whatsapp,
    telefonos: source.telefonos,
    direccion: source.direccion,
    latitud: source.latitud,
    longitud: source.longitud,
    moneda: source.moneda,
    moneda_principal: source.moneda_principal,
    categoria: source.categoria || 'Comida rápida',
    en_linea: true,
    onboarding_completed: true,
    permite_delivery: source.permite_delivery,
    recibe_pedidos_whatsapp: source.recibe_pedidos_whatsapp,
    horarios: cloneJson(source.horarios),
    estados_operacion: cloneJson(source.estados_operacion),
    menu_layout: source.menu_layout,
    menu_palette: source.menu_palette,
    menu_font: source.menu_font,
    menu_footer: source.menu_footer,
    menu_palette_primary: source.menu_palette_primary,
    menu_palette_accent: source.menu_palette_accent,
    menu_palette_surface: source.menu_palette_surface,
    menu_palette_text: source.menu_palette_text,
    menu_theme_mode: source.menu_theme_mode,
    exchange_rate_mode: source.exchange_rate_mode,
    exchange_rate_source: source.exchange_rate_source,
    exchange_rate_value: source.exchange_rate_value,
    exchange_rate_quote_currency: source.exchange_rate_quote_currency,
    tasa_cambio_pesos: source.tasa_cambio_pesos,
    last_rate_update: source.last_rate_update,
    branding_ia: branding,
    upsell_config: upsellConfig,
    mostrar_en_directorio_publico: source.mostrar_en_directorio_publico === true,
    ai_enabled: source.ai_enabled === true,
    negocio_virtual: source.negocio_virtual === true,
  };

  const { data: created, error: createErr } = await sb
    .from('comercios')
    .insert(insertComercio)
    .select('id,slug,nombre')
    .single();
  if (createErr) throw createErr;
  console.log('Created commerce', created);

  const { data: catalog, error: catalogErr } = await sb
    .from('catalogos')
    .insert({
      comercio_id: created.id,
      nombre: 'Menú Arepas',
      activo: true,
      orden: 0,
    })
    .select('id')
    .single();
  if (catalogErr) throw catalogErr;

  const { data: newArepasCat, error: aErr } = await sb
    .from('categorias')
    .insert({
      comercio_id: created.id,
      catalogo_id: catalog.id,
      nombre: 'Arepas',
      orden: 0,
      activo: true,
      rol: arepasCat.rol || 'main',
      icono: arepasCat.icono,
      imagen_url: arepasCat.imagen_url,
      opciones_menu: cloneJson(arepasCat.opciones_menu),
    })
    .select('id')
    .single();
  if (aErr) throw aErr;

  const { data: newBebidasCat, error: bErr } = await sb
    .from('categorias')
    .insert({
      comercio_id: created.id,
      catalogo_id: catalog.id,
      nombre: 'Bebidas',
      orden: 1,
      activo: true,
      rol: bebidasCat.rol || 'main',
      icono: bebidasCat.icono,
      imagen_url: bebidasCat.imagen_url,
      opciones_menu: cloneJson(bebidasCat.opciones_menu),
    })
    .select('id')
    .single();
  if (bErr) throw bErr;

  // Wire upsell to bebidas category
  upsellConfig.pre_checkout.categorias = [
    { id: newBebidasCat.id, tipo: 'bebida' },
  ];
  upsellConfig.pre_checkout.reglas = [
    {
      categoria_id: newArepasCat.id,
      categoria_origen: 'Arepas',
      sugerir_tipos: ['bebida'],
    },
  ];
  await sb
    .from('comercios')
    .update({ upsell_config: upsellConfig })
    .eq('id', created.id);

  await sb.from('upsell_settings').upsert(
    {
      comercio_id: created.id,
      enabled: true,
      show_add_to_cart: true,
      show_cart: true,
      show_checkout: true,
      max_add_suggestions: 2,
      max_cart_suggestions: 3,
      max_checkout_suggestions: 2,
      free_delivery_order_types: ['delivery'],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'comercio_id' },
  );

  function productRow(p, categoriaId, orden) {
    return {
      comercio_id: created.id,
      categoria_id: categoriaId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      disponible: true,
      orden,
      imagen_url: p.imagen_url,
      imagen_source_type: p.imagen_source_type || 'manual',
      opciones_menu: cloneJson(p.opciones_menu),
    };
  }

  const arepaRows = (arepasProducts || []).map((p, i) =>
    productRow(p, newArepasCat.id, i),
  );
  const bebidaRows = (bebidasProducts || []).map((p, i) =>
    productRow(p, newBebidasCat.id, i),
  );

  if (arepaRows.length) {
    const { error } = await sb.from('productos').insert(arepaRows);
    if (error) throw error;
  }
  if (bebidaRows.length) {
    const { error } = await sb.from('productos').insert(bebidaRows);
    if (error) throw error;
  }
  console.log(
    `Inserted products arepas=${arepaRows.length} bebidas=${bebidaRows.length}`,
  );

  if (payments?.length) {
    const payRows = payments.map((p) => ({
      comercio_id: created.id,
      tipo: p.tipo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      detalles: p.detalles,
    }));
    const { error } = await sb.from('metodos_pago').insert(payRows);
    if (error) throw error;
    console.log('Payments copied', payRows.length);
  }

  // Client paid for the extra menu — grant 1 month aligned to source period end if possible.
  const orderId = `admin_manual:parche-arepas:${Date.now()}:${randomUUID().slice(0, 8)}`;
  const { data: grant, error: grantErr } = await sb.rpc(
    'grant_subscription_period',
    {
      p_business_id: created.id,
      p_plan_code: 'menu_monthly',
      p_months: 1,
      p_provider: 'admin_manual',
      p_order_id: orderId,
      p_amount: 10,
      p_currency: 'USD',
    },
  );
  if (grantErr) throw grantErr;
  console.log('Subscription', grant);

  // Remove Arepas from the original public menu (keep Bebidas).
  const { error: hideErr } = await sb
    .from('categorias')
    .update({ activo: false })
    .eq('id', arepasCat.id);
  if (hideErr) throw hideErr;
  // Also hide arepa products from any edge case that ignores category.activo
  const { error: hideProdErr } = await sb
    .from('productos')
    .update({ disponible: false })
    .eq('comercio_id', source.id)
    .eq('categoria_id', arepasCat.id);
  if (hideProdErr) throw hideProdErr;
  console.log('Hidden Arepas on source menu');

  console.log('\n=== DONE ===');
  console.log('New menu URL: https://elmenuxfa.com/v/' + NEW_SLUG);
  console.log('Original menu URL: https://elmenuxfa.com/v/' + SOURCE_SLUG);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
