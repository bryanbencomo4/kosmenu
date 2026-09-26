/// <reference path="../_shared/edge-runtime.d.ts" />

import {
  assertSyncOrigins,
  constantTimeEqual,
  clearInvisibleCatalogReferences,
  PREVIEW_SUPABASE_URL,
  PRODUCTION_SUPABASE_URL,
  toPreviewCommerceRow,
} from './_shared.ts';

const PAGE_SIZE = 500;
const MAX_ROWS_PER_TABLE = 20_000;
const WRITE_BATCH_SIZE = 100;

type Row = Record<string, unknown>;
type MenuSnapshot = {
  commerce: Row;
  catalogs: Row[];
  categories: Row[];
  products: Row[];
  paymentMethods: Row[];
};

const COMMERCE_SELECT = [
  'id',
  'slug',
  'nombre',
  'logo_url',
  'whatsapp',
  'direccion',
  'latitud',
  'longitud',
  'permite_delivery',
  'recibe_pedidos_whatsapp',
  'en_linea',
  'menu_palette',
  'menu_palette_primary',
  'menu_palette_accent',
  'menu_palette_surface',
  'menu_palette_text',
  'menu_theme_mode',
  'color_principal',
  'menu_layout',
  'menu_footer',
  'menu_font',
  'moneda',
  'tasa_cambio_pesos',
  'exchange_rate_value',
  'exchange_rate_mode',
  'exchange_rate_source',
  'exchange_rate_quote_currency',
  'horarios',
  'categoria',
  'negocio_virtual',
  'mostrar_en_directorio_publico',
  'checkout_currencies:branding_ia->config_negocio->checkout_currencies',
  'exchange_rates:branding_ia->config_negocio->exchange_rates',
  'exchange_rate_modes:branding_ia->config_negocio->exchange_rate_modes',
  'exchange_rate_sources:branding_ia->config_negocio->exchange_rate_sources',
  'social_links:branding_ia->config_negocio->social_links',
].join(',');

const CHILD_TABLES = [
  'catalogos',
  'categorias',
  'productos',
  'metodos_pago',
] as const;

const CHILD_SELECTS: Record<(typeof CHILD_TABLES)[number], string> = {
  catalogos: 'id,comercio_id,nombre,activo,created_at,orden,updated_at',
  categorias:
    'id,comercio_id,nombre,orden,icono,opciones_menu,activo,catalogo_id,rol',
  productos:
    'id,comercio_id,categoria_id,nombre,descripcion,precio,imagen_url,disponible,upsell_badge,precio_comparacion,upsell_enabled,orden,opciones_menu',
  metodos_pago: 'id,comercio_id,nombre,tipo,descripcion,detalles',
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim() ?? '';
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function apiHeaders(key: string, extra?: HeadersInit) {
  return new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...Object.fromEntries(new Headers(extra).entries()),
  });
}

async function readRows(
  baseUrl: string,
  key: string,
  table: string,
  select: string,
  filters: Record<string, string> = {},
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset <= MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set('select', select);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    for (const [name, value] of Object.entries(filters)) {
      url.searchParams.set(name, value);
    }

    const response = await fetch(url, {
      headers: apiHeaders(key),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Source read failed for ${table} (HTTP ${response.status}).`);
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(`Source returned an invalid row set for ${table}.`);
    }
    rows.push(...page as Row[]);
    if (page.length < PAGE_SIZE) return rows;
  }

  throw new Error(`Source table ${table} exceeds the configured sync safety limit.`);
}

async function writeRows(
  baseUrl: string,
  serviceKey: string,
  table: string,
  rows: Row[],
  conflictColumn: string,
) {
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set('on_conflict', conflictColumn);
    const response = await fetch(url, {
      method: 'POST',
      headers: apiHeaders(serviceKey, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(rows.slice(offset, offset + WRITE_BATCH_SIZE)),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const detail = typeof failure?.code === 'string'
        ? failure.code
        : `HTTP ${response.status}`;
      throw new Error(`Preview upsert failed for ${table} (${detail}).`);
    }
  }
}

async function deleteIds(
  baseUrl: string,
  serviceKey: string,
  table: string,
  ids: string[],
) {
  for (let offset = 0; offset < ids.length; offset += WRITE_BATCH_SIZE) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set('id', `in.(${ids.slice(offset, offset + WRITE_BATCH_SIZE).join(',')})`);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: apiHeaders(serviceKey, { Prefer: 'return=minimal' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Preview prune failed for ${table} (HTTP ${response.status}).`);
    }
  }
}

async function getSourceSnapshot(sourceUrl: string, sourceKey: string) {
  const commerces = await readRows(
    sourceUrl,
    sourceKey,
    'comercios',
    COMMERCE_SELECT,
    { en_linea: 'eq.true' },
  );
  if (commerces.length === 0) {
    throw new Error('Source returned no online commerces; refusing to prune Preview.');
  }

  const snapshots: MenuSnapshot[] = [];
  for (const commerce of commerces) {
    const commerceId = String(commerce.id ?? '');
    if (!commerceId) throw new Error('Source commerce is missing its ID.');

    const childResults = await Promise.all(
      CHILD_TABLES.map((table) =>
        readRows(sourceUrl, sourceKey, table, CHILD_SELECTS[table], {
          comercio_id: `eq.${commerceId}`,
        })
      ),
    );
    snapshots.push({
      commerce: toPreviewCommerceRow(commerce),
      catalogs: childResults[0],
      categories: clearInvisibleCatalogReferences(childResults[0], childResults[1]),
      products: childResults[2],
      paymentMethods: childResults[3],
    });
  }

  const [marketRateRows] = await Promise.all([
    readRows(
      sourceUrl,
      sourceKey,
      'global_market_rates',
      'id,bcv_rate,p2p_binance_rate,payload,updated_at',
      { order: 'updated_at.desc', limit: '1' },
    ),
  ]);

  return { snapshots, marketRate: marketRateRows[0] ?? null };
}

async function pruneChildRows(
  previewUrl: string,
  serviceKey: string,
  table: (typeof CHILD_TABLES)[number],
  commerceId: string,
  sourceRows: Row[],
) {
  const existing = await readRows(previewUrl, serviceKey, table, 'id', {
    comercio_id: `eq.${commerceId}`,
  });
  const retainedIds = new Set(sourceRows.map((row) => String(row.id)));
  const staleIds = existing
    .map((row) => String(row.id))
    .filter((id) => !retainedIds.has(id));
  await deleteIds(previewUrl, serviceKey, table, staleIds);
  return staleIds.length;
}

async function syncMarketRate(
  previewUrl: string,
  serviceKey: string,
  sourceRate: Row | null,
) {
  if (!sourceRate) return 0;
  const existing = await readRows(
    previewUrl,
    serviceKey,
    'global_market_rates',
    'id',
    { order: 'id.asc' },
  );
  const payload = sourceRate.payload && typeof sourceRate.payload === 'object'
    ? sourceRate.payload as Record<string, unknown>
    : {};
  const safeRate = {
    bcv_rate: sourceRate.bcv_rate,
    p2p_binance_rate: sourceRate.p2p_binance_rate,
    provider: 'preview-public-menu-sync',
    updated_at: sourceRate.updated_at,
    payload: {
      google_rates: payload.google_rates ?? null,
      bcv_rates: payload.bcv_rates ?? null,
    },
  };

  if (existing.length === 0) {
    await writeRows(previewUrl, serviceKey, 'global_market_rates', [safeRate], 'id');
    return 1;
  }

  const keepId = String(existing[0].id);
  const updateUrl = new URL('/rest/v1/global_market_rates', previewUrl);
  updateUrl.searchParams.set('id', `eq.${keepId}`);
  const update = await fetch(updateUrl, {
    method: 'PATCH',
    headers: apiHeaders(serviceKey, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(safeRate),
    signal: AbortSignal.timeout(20_000),
  });
  if (!update.ok) throw new Error(`Preview market-rate update failed (HTTP ${update.status}).`);
  await deleteIds(
    previewUrl,
    serviceKey,
    'global_market_rates',
    existing.slice(1).map((row) => String(row.id)),
  );
  return 1;
}

async function performSync(
  previewUrl: string,
  serviceKey: string,
  sourceUrl: string,
  sourceKey: string,
  dryRun: boolean,
) {
  const { snapshots, marketRate } = await getSourceSnapshot(sourceUrl, sourceKey);
  const existingManifest = await readRows(
    previewUrl,
    serviceKey,
    'preview_menu_sync_manifest',
    'comercio_id,last_synced_at',
  );
  const currentIds = new Set(snapshots.map((snapshot) => String(snapshot.commerce.id)));
  const staleCommerceIds = existingManifest
    .map((row) => String(row.comercio_id))
    .filter((id) => !currentIds.has(id));

  const counts = {
    commerces: snapshots.length,
    catalogs: snapshots.reduce((sum, item) => sum + item.catalogs.length, 0),
    categories: snapshots.reduce((sum, item) => sum + item.categories.length, 0),
    products: snapshots.reduce((sum, item) => sum + item.products.length, 0),
    payment_methods: snapshots.reduce((sum, item) => sum + item.paymentMethods.length, 0),
    removed_offline_commerces: staleCommerceIds.length,
    market_rate: marketRate !== null,
  };

  if (dryRun) return { ok: true, dry_run: true, ...counts };

  await writeRows(
    previewUrl,
    serviceKey,
    'comercios',
    snapshots.map((snapshot) => snapshot.commerce),
    'id',
  );

  const staleChildren = { catalogs: 0, categories: 0, products: 0, payment_methods: 0 };
  for (const snapshot of snapshots) {
    const comercioId = String(snapshot.commerce.id);
    for (const table of CHILD_TABLES) {
      const sourceRows = table === 'catalogos'
        ? snapshot.catalogs
        : table === 'categorias'
        ? snapshot.categories
        : table === 'productos'
        ? snapshot.products
        : snapshot.paymentMethods;
      await writeRows(previewUrl, serviceKey, table, sourceRows, 'id');
      const removed = await pruneChildRows(
        previewUrl,
        serviceKey,
        table,
        comercioId,
        sourceRows,
      );
      if (table === 'catalogos') staleChildren.catalogs += removed;
      if (table === 'categorias') staleChildren.categories += removed;
      if (table === 'productos') staleChildren.products += removed;
      if (table === 'metodos_pago') staleChildren.payment_methods += removed;
    }
  }

  const syncedAt = new Date().toISOString();
  await writeRows(
    previewUrl,
    serviceKey,
    'preview_menu_sync_manifest',
    snapshots.map((snapshot) => ({
      comercio_id: snapshot.commerce.id,
      last_synced_at: syncedAt,
    })),
    'comercio_id',
  );
  await deleteIds(previewUrl, serviceKey, 'comercios', staleCommerceIds);
  if (staleCommerceIds.length > 0) {
    const manifestUrl = new URL('/rest/v1/preview_menu_sync_manifest', previewUrl);
    manifestUrl.searchParams.set('comercio_id', `in.(${staleCommerceIds.join(',')})`);
    const response = await fetch(manifestUrl, {
      method: 'DELETE',
      headers: apiHeaders(serviceKey, { Prefer: 'return=minimal' }),
    });
    if (!response.ok) throw new Error('Preview manifest cleanup failed.');
  }

  const marketRates = await syncMarketRate(previewUrl, serviceKey, marketRate);
  return { ok: true, dry_run: false, ...counts, stale_children_removed: staleChildren, market_rates_synced: marketRates };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }

  try {
    const sourceUrl = getRequiredEnv('PRODUCTION_PUBLIC_SUPABASE_URL');
    const sourceKey = getRequiredEnv('PRODUCTION_PUBLIC_SUPABASE_ANON_KEY');
    const previewUrl = getRequiredEnv('SUPABASE_URL');
    const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const syncSecret = getRequiredEnv('PREVIEW_MENU_SYNC_SECRET');
    assertSyncOrigins(sourceUrl, previewUrl);

    const suppliedSecret = request.headers.get('x-preview-menu-sync-secret') ?? '';
    if (!constantTimeEqual(suppliedSecret, syncSecret)) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const result = await performSync(
      previewUrl.replace(/\/$/, ''),
      serviceKey,
      sourceUrl.replace(/\/$/, ''),
      sourceKey,
      body?.dry_run === true,
    );
    return Response.json(result, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error.';
    console.error('Preview public menu sync failed:', detail);
    return Response.json(
      { error: 'Preview public menu sync failed.', detail },
      { status: 500 },
    );
  }
});
