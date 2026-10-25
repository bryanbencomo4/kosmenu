/**
 * Provision "Arroz Chino Maicol" (slug: arroz-chino-maicol) using the same
 * comercio / branding / payment / gift-card fields the admin app persists.
 * Delivery zones copied from Alegría; FX = BCV USD (auto).
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-arroz-chino-maicol.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-arroz-chino-maicol.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'arroz-chino-maicol';
const NOMBRE = 'Arroz Chino Maicol';
const EMAIL = 'arroz-chino-maicol@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584126710905';
const INSTAGRAM = 'https://www.instagram.com/arrozchinomaicol_flor/';
const DIRECCION =
  'Flor Amarillo, Carabobo, Venezuela\nReferencia: Arroz Chino Maicol — Único sabor arroz chino';
const COLOR = '#C41E1E';
const CATEGORIA = 'Comida china';
const ALEGRIA_ID = '51a4be30-27b6-4e53-8761-9fddc9837790';
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-a710218c-d798-4ed2-ac83-f72f1000a179.jpg',
);

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const mapsKey = (
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  ''
).trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function digital(name, fields) {
  return JSON.stringify({ name, fields });
}

function brandingPayload(alegria, rate) {
  const delivery = structuredClone(
    alegria.branding_ia?.config_negocio?.delivery_config || {},
  );
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#111111',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['chino', 'arroz', 'familiar', 'cercano'],
    descripcion_visual: 'Único sabor arroz chino — Arroz Chino Maicol.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#FFFFFF',
      card_surface: '#F7F7F7',
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
      metodos_pago: ['efectivo', 'transferencia'],
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
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__1',
      nombre: 'Pago digital: Binance',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Binance', [
        { type: 'texto', label: 'ID', value: '1225317379' },
        { type: 'texto', label: 'Usuario', value: 'Maicol-666' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Pago Móvil', [
        { type: 'telefono', label: 'Telf', value: '+584126712282' },
        { type: 'id', label: 'Documento', value: 'E-85005166' },
        { type: 'texto', label: 'Titular', value: 'xiaoyun' },
        { type: 'texto', label: 'Banco', value: '0102 Banco de Venezuela' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__2',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Pago Móvil', [
        { type: 'telefono', label: 'Telf', value: '+584126710905' },
        { type: 'id', label: 'Documento', value: 'E-82270440' },
        { type: 'texto', label: 'Titular', value: 'MAICOL' },
        { type: 'texto', label: 'Banco', value: '0108 Provincial' },
      ]),
    },
  ];
}

async function geocode(address) {
  if (!mapsKey) return { lat: 10.1569, lng: -67.9972 };
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set('address', address);
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) return { lat: 10.1569, lng: -67.9972 };
  return { lat: loc.lat, lng: loc.lng };
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
  console.log(`BCV USD rate: ${rate} VES`);
  console.log(
    'Delivery zones from Alegria:',
    alegria.branding_ia?.config_negocio?.delivery_config?.zones?.length || 0,
  );

  const coords = await geocode('Flor Amarillo, Carabobo, Venezuela');
  console.log('Geocode', coords);

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG);
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

  const branding = brandingPayload(alegria, rate);
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .insert({
      owner_id: ownerId,
      nombre: NOMBRE,
      slug: SLUG,
      categoria: CATEGORIA,
      color_principal: COLOR,
      direccion: DIRECCION,
      latitud: coords.lat,
      longitud: coords.lng,
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
      metodos_pago: ['Efectivo', 'Transferencia'],
      metodo_pago_predeterminado: 'Efectivo',
      estados_operacion: ['carabobo'],
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
      await supabase
        .from('comercios')
        .update({ logo_url: logoUrl })
        .eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
  } else {
    console.warn('Logo file not found:', LOGO_PATH);
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
      p_batch_label: 'arroz-chino-maicol-launch',
      p_expires_at: null,
      p_note: 'Activación Arroz Chino Maicol',
      p_plan_code: 'menu_monthly',
    },
  );
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
  console.log(`Rate: ${rate} (bcv_usd)`);
  console.log(
    `Delivery zones: ${branding.config_negocio.delivery_config?.zones?.length || 0}`,
  );
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
