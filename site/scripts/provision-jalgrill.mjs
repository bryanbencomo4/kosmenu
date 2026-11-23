/**
 * Provision "J'ALGRIL" (slug: jalgrill) as if registered from app.elmenuxfa.com.
 * - Currencies: COP + USD + VES (cash only)
 * - Delivery zones copied from Auto Pizzas Nápoles
 * - FX mirrors Inversiones Doleto (COP base; USD Google; VES P2P)
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-jalgrill.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-jalgrill.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'jalgrill';
const NOMBRE = "J'ALGRIL";
const EMAIL = 'jalgrill@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584147113892';
const INSTAGRAM = 'https://www.instagram.com/jalgrill/';
const DIRECCION =
  'Av. principal de Pueblo Nuevo, Táchira, Venezuela\nReferencia: más arriba de la panadería El Funchal, diagonal a la farmacia';
const COLOR = '#6B1E2E';
const CATEGORIA = 'Parrilla / Asados';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const DOLETO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';
/** From maps.app.goo.gl/8BrSNbnRuCTEFsMe8 → 7.781864, -72.206744 */
const LAT = 7.781864;
const LNG = -72.206744;
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-db0adac7-badc-436a-abdb-48d358d2f04c.jpg',
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

function brandingPayload({ delivery, rates, modes, sources }) {
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#111111',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['parrilla', 'asados', 'llanero', 'familiar'],
    descripcion_visual: "J'ALGRIL — asados y hervidos en Pueblo Nuevo.",
    layout_type: 'grid',
    colores_personalizados: {
      background: '#F7F1E8',
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
    },
  };
}

function paymentRows(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'efectivo__cop',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en pesos colombianos.',
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
    .eq('id', DOLETO_ID)
    .single();
  if (doletoErr) throw doletoErr;

  const delivery = structuredClone(
    napoles.branding_ia?.config_negocio?.delivery_config || {},
  );
  const doletoCfg = doleto.branding_ia?.config_negocio || {};
  const rates = structuredClone(doletoCfg.exchange_rates || {});
  const modes = structuredClone(doletoCfg.exchange_rate_modes || {});
  const sources = structuredClone(doletoCfg.exchange_rate_sources || {});

  console.log('Delivery zones from Napoles:', delivery?.zones?.length || 0);
  console.log('FX from Doleto:', { rates, modes, sources });
  console.log('Coords', LAT, LNG);

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG, NOMBRE);
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

  const branding = brandingPayload({ delivery, rates, modes, sources });
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
  console.log('Payment methods inserted (cash only COP/USD/VES)');

  const { data: issued, error: issueError } = await supabase.rpc(
    'issue_gift_cards',
    {
      p_count: 1,
      p_months: 1,
      p_batch_label: 'jalgrill-launch',
      p_expires_at: null,
      p_note: "Activación J'ALGRIL",
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
  console.log(`Delivery zones: ${delivery?.zones?.length || 0} (from Napoles)`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
