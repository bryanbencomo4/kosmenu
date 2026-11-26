import { randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  deliveryConfigToJson,
  parseDeliveryConfig,
  validateDeliveryConfig,
  type DeliveryConfig,
} from '../../../_lib/delivery-config';
import { parseProductMenuOptions } from '../../../_lib/menu-product-options';
import type { BusinessShop } from './auth';
import type { BusinessAllowedOp } from './config';
import { normalizeCurrency, rateSentence } from './fx';
import {
  canTransitionOrderStatus,
  normalizeOrderStatus,
  orderStatusLabel,
  type CanonicalOrderStatus,
} from './order-status';

export type ApplyOk = { text: string; data?: Record<string, unknown> };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function slugId(prefix: string) {
  return `${prefix}_${randomBytes(3).toString('hex')}`;
}

/** Flutter BusinessSetupScreen._syncPaymentMethods — update-by-tipo then prune managed. */
async function syncPaymentMethodsFlutter(
  sb: SupabaseClient,
  comercioId: string,
  rows: Array<Record<string, unknown>>,
): Promise<{ retained: number; deleted: number }> {
  if (!rows.length) throw new Error('payment_list_empty');

  const { data: existingRows, error: readErr } = await sb
    .from('metodos_pago')
    .select('id,tipo')
    .eq('comercio_id', comercioId);
  if (readErr) throw new Error(readErr.message);

  const existingByType = new Map<string, Array<{ id: string; tipo: string }>>();
  for (const raw of existingRows || []) {
    const type = String(raw.tipo || '')
      .trim()
      .toLowerCase();
    const id = String(raw.id || '').trim();
    if (!type || !id) continue;
    const list = existingByType.get(type) || [];
    list.push({ id, tipo: type });
    existingByType.set(type, list);
  }

  const retainedIds = new Set<string>();
  for (const row of rows) {
    const type = String(row.tipo || '')
      .trim()
      .toLowerCase();
    if (!type) throw new Error('payment_incomplete');
    const candidates = existingByType.get(type) || [];
    let existing: { id: string; tipo: string } | undefined;
    for (const candidate of candidates) {
      if (!retainedIds.has(candidate.id)) {
        existing = candidate;
        break;
      }
    }
    const payload = {
      comercio_id: comercioId,
      nombre: String(row.nombre || '').trim(),
      tipo: String(row.tipo || '').trim(),
      descripcion: row.descripcion != null ? String(row.descripcion) : null,
      detalles: row.detalles != null ? String(row.detalles) : null,
    };
    if (!payload.nombre) throw new Error('payment_incomplete');

    if (existing) {
      const { error } = await sb
        .from('metodos_pago')
        .update(payload)
        .eq('comercio_id', comercioId)
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      retainedIds.add(existing.id);
    } else {
      const { data: inserted, error } = await sb
        .from('metodos_pago')
        .insert(payload)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!inserted?.id) throw new Error('insert_failed');
      retainedIds.add(String(inserted.id));
    }
  }

  const obsoleteManagedIds: string[] = [];
  for (const [type, list] of existingByType.entries()) {
    if (!type.startsWith('efectivo__') && !type.startsWith('transferencia__')) continue;
    for (const row of list) {
      if (!retainedIds.has(row.id)) obsoleteManagedIds.push(row.id);
    }
  }
  if (obsoleteManagedIds.length) {
    const { error } = await sb
      .from('metodos_pago')
      .delete()
      .eq('comercio_id', comercioId)
      .in('id', obsoleteManagedIds);
    if (error) throw new Error(error.message);
  }
  return { retained: retainedIds.size, deleted: obsoleteManagedIds.length };
}

/** Apply extended ops. Throws on validation/DB errors. Returns null if op not handled here. */
export async function applyExtendedOp(params: {
  sb: SupabaseClient;
  shop: BusinessShop;
  op: BusinessAllowedOp;
  data: Record<string, unknown>;
  userId?: string;
}): Promise<ApplyOk | null> {
  const { sb, shop, op, data, userId } = params;
  const cid = shop.comercioId;

  if (op === 'create_product') {
    const nombre = String(data.nombre || '').trim();
    const precio = Number(data.precio);
    const categoriaId = data.categoriaId ? String(data.categoriaId) : null;
    const descripcion = data.descripcion != null ? String(data.descripcion) : null;
    if (nombre.length < 2) throw new Error('nombre_corto');
    if (!Number.isFinite(precio) || precio < 0) throw new Error('precio_invalido');
    let orden = 0;
    const { data: maxRow } = await sb
      .from('productos')
      .select('orden')
      .eq('comercio_id', cid)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRow?.orden != null && Number.isFinite(Number(maxRow.orden))) {
      orden = Number(maxRow.orden) + 1;
    }
    const row: Record<string, unknown> = {
      comercio_id: cid,
      nombre,
      precio: round2(precio),
      disponible: true,
      orden,
    };
    if (categoriaId) row.categoria_id = categoriaId;
    if (descripcion) row.descripcion = descripcion;
    const { data: inserted, error } = await sb
      .from('productos')
      .insert(row)
      .select('id,nombre,precio')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error('insert_failed');
    return {
      text: `¡Producto creado! ✅ *${inserted.nombre}* a *${inserted.precio}*${
        shop.moneda ? ` ${shop.moneda}` : ''
      }`,
      data: { productId: inserted.id },
    };
  }

  if (op === 'update_product') {
    const productId = String(data.productId || '');
    if (!productId) throw new Error('product_id_missing');
    const patch: Record<string, unknown> = {};
    if (data.nombre != null) {
      const n = String(data.nombre).trim();
      if (n.length < 2) throw new Error('nombre_corto');
      patch.nombre = n;
    }
    if (data.descripcion != null) patch.descripcion = String(data.descripcion);
    if (data.precio != null) {
      const p = Number(data.precio);
      if (!Number.isFinite(p) || p < 0) throw new Error('precio_invalido');
      patch.precio = round2(p);
    }
    if (data.categoriaId != null) patch.categoria_id = String(data.categoriaId) || null;
    if (data.disponible != null) patch.disponible = data.disponible === true;
    if (!Object.keys(patch).length) throw new Error('nothing_to_update');
    const { data: updated, error } = await sb
      .from('productos')
      .update(patch)
      .eq('id', productId)
      .eq('comercio_id', cid)
      .select('id,nombre,precio,disponible')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('product_not_found');
    return { text: `¡Actualizado! ✅ *${updated.nombre}*` };
  }

  if (op === 'delete_product') {
    const productId = String(data.productId || '');
    const name = String(data.productName || 'producto');
    if (!productId) throw new Error('product_id_missing');
    const { error, data: deleted } = await sb
      .from('productos')
      .delete()
      .eq('id', productId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error('product_not_found');
    return { text: `Eliminado 🗑️ *${deleted.nombre || name}*` };
  }

  if (op === 'create_category') {
    const nombre = String(data.nombre || '').trim();
    if (nombre.length < 2) throw new Error('nombre_corto');
    let catalogoId = data.catalogoId ? String(data.catalogoId) : null;
    if (!catalogoId) {
      const { data: cats } = await sb
        .from('catalogos')
        .select('id')
        .eq('comercio_id', cid)
        .order('orden', { ascending: true })
        .limit(1);
      catalogoId = cats?.[0]?.id ? String(cats[0].id) : null;
      if (!catalogoId) {
        const { data: created, error: cErr } = await sb
          .from('catalogos')
          .insert({ comercio_id: cid, nombre: 'Menú', orden: 0 })
          .select('id')
          .maybeSingle();
        if (cErr) throw new Error(cErr.message);
        catalogoId = created?.id ? String(created.id) : null;
      }
    }
    let orden = 0;
    const { data: maxCat } = await sb
      .from('categorias')
      .select('orden')
      .eq('comercio_id', cid)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxCat?.orden != null) orden = Number(maxCat.orden) + 1;
    const row: Record<string, unknown> = {
      comercio_id: cid,
      nombre,
      orden,
      activo: true,
    };
    if (catalogoId) row.catalogo_id = catalogoId;
    if (data.rol) row.rol = String(data.rol);
    const { data: inserted, error } = await sb
      .from('categorias')
      .insert(row)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error('insert_failed');
    return { text: `Categoría creada ✅ *${inserted.nombre}*` };
  }

  if (op === 'update_category') {
    const categoryId = String(data.categoryId || '');
    if (!categoryId) throw new Error('category_id_missing');
    const patch: Record<string, unknown> = {};
    if (data.nombre != null) {
      const n = String(data.nombre).trim();
      if (n.length < 2) throw new Error('nombre_corto');
      patch.nombre = n;
    }
    if (data.activo != null) patch.activo = data.activo === true;
    if (data.rol != null) patch.rol = String(data.rol);
    if (!Object.keys(patch).length) throw new Error('nothing_to_update');
    const { data: updated, error } = await sb
      .from('categorias')
      .update(patch)
      .eq('id', categoryId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('category_not_found');
    return { text: `Categoría actualizada ✅ *${updated.nombre}*` };
  }

  if (op === 'delete_category') {
    const categoryId = String(data.categoryId || '');
    if (!categoryId) throw new Error('category_id_missing');
    const { count } = await sb
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('comercio_id', cid)
      .eq('categoria_id', categoryId);
    if ((count || 0) > 0) throw new Error('category_has_products');
    const { data: deleted, error } = await sb
      .from('categorias')
      .delete()
      .eq('id', categoryId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error('category_not_found');
    return { text: `Categoría eliminada 🗑️ *${deleted.nombre}*` };
  }

  if (op === 'set_upsell_badge') {
    const productId = String(data.productId || '');
    const badge = data.badge == null || data.badge === '' ? null : String(data.badge);
    const allowed = new Set(['mas_pedido', 'mejor_valor', 'ahorra', null]);
    if (!allowed.has(badge as string | null)) throw new Error('badge_invalido');
    const { data: updated, error } = await sb
      .from('productos')
      .update({ upsell_badge: badge, upsell_enabled: badge != null })
      .eq('id', productId)
      .eq('comercio_id', cid)
      .select('id,nombre,upsell_badge')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('product_not_found');
    return {
      text: badge
        ? `Destacado ✅ *${updated.nombre}* → *${badge}*`
        : `Quité el destacado de *${updated.nombre}*`,
    };
  }

  if (op === 'set_product_image') {
    const productId = String(data.productId || '');
    const imageUrl = String(data.imageUrl || '').trim();
    if (!productId || !imageUrl.startsWith('http')) throw new Error('image_invalid');
    const { data: updated, error } = await sb
      .from('productos')
      .update({
        imagen_url: imageUrl,
        imagen_source_type: 'upload',
        ai_image_status: null,
        ai_image_error_message: null,
      })
      .eq('id', productId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) {
      // Some preview schemas may miss AI columns — retry minimal patch.
      const retry = await sb
        .from('productos')
        .update({ imagen_url: imageUrl })
        .eq('id', productId)
        .eq('comercio_id', cid)
        .select('id,nombre')
        .maybeSingle();
      if (retry.error) throw new Error(retry.error.message);
      if (!retry.data) throw new Error('product_not_found');
      return { text: `Foto actualizada 🖼️ *${retry.data.nombre}*` };
    }
    if (!updated) throw new Error('product_not_found');
    return { text: `Foto actualizada 🖼️ *${updated.nombre}*` };
  }

  if (op === 'clear_product_image') {
    const productId = String(data.productId || '');
    const { data: updated, error } = await sb
      .from('productos')
      .update({ imagen_url: null })
      .eq('id', productId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('product_not_found');
    return { text: `Foto quitada de *${updated.nombre}*` };
  }

  if (op === 'set_tasa') {
    const value = Number(data.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('tasa_invalida');
    const { data: row, error: readErr } = await sb
      .from('comercios')
      .select('moneda,exchange_rate_quote_currency,branding_ia')
      .eq('id', cid)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error('comercio_not_found');
    const primary = normalizeCurrency(row.moneda) || 'USD';
    const currency =
      normalizeCurrency(data.currency ?? data.quoteCurrency) ||
      normalizeCurrency(row.exchange_rate_quote_currency) ||
      'COP';
    if (currency === primary) throw new Error('tasa_moneda_invalida');
    const quoteNow = normalizeCurrency(row.exchange_rate_quote_currency);

    const branding =
      row.branding_ia && typeof row.branding_ia === 'object'
        ? (JSON.parse(JSON.stringify(row.branding_ia)) as Record<string, unknown>)
        : {};
    const cfgNegocio =
      branding.config_negocio && typeof branding.config_negocio === 'object'
        ? ({ ...(branding.config_negocio as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const rates = { ...((cfgNegocio.exchange_rates as Record<string, unknown>) || {}) };
    const modes = { ...((cfgNegocio.exchange_rate_modes as Record<string, unknown>) || {}) };
    rates[currency] = value;
    modes[currency] = 'manual';
    cfgNegocio.exchange_rates = rates;
    cfgNegocio.exchange_rate_modes = modes;
    branding.config_negocio = cfgNegocio;

    const patch: Record<string, unknown> = {
      branding_ia: branding,
      last_rate_update: new Date().toISOString(),
    };
    // Row-level rate follows the quoted currency (or becomes it when none is set).
    if (!quoteNow || quoteNow === currency) {
      patch.exchange_rate_value = value;
      patch.exchange_rate_mode = 'manual';
      patch.exchange_rate_quote_currency = currency;
    }
    // Legacy COP rate (used by admin tooling and old menus).
    if (currency === 'COP') patch.tasa_cambio_pesos = value;

    const { data: updated, error } = await sb
      .from('comercios')
      .update(patch)
      .eq('id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('comercio_not_found');
    return {
      text: `Tasa actualizada 💱 *${rateSentence(primary, currency, value)}* (manual). Ya se ve en tu menú y checkout ✅`,
      data: { currency, value },
    };
  }

  if (op === 'set_order_status') {
    const orderId = String(data.orderId || '');
    const next = normalizeOrderStatus(String(data.nextStatus || ''));
    if (!orderId) throw new Error('order_id_missing');
    const { data: current, error: readErr } = await sb
      .from('pedidos')
      .select('id,estado,nombre_cliente,cliente_nombre,detalles')
      .eq('id', orderId)
      .eq('comercio_id', cid)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error('order_not_found');
    const from = normalizeOrderStatus(String(current.estado || ''));
    if (!canTransitionOrderStatus(from, next)) {
      throw new Error(`transicion_invalida:${from}->${next}`);
    }
    const { data: updated, error } = await sb
      .from('pedidos')
      .update({ estado: next })
      .eq('id', orderId)
      .eq('comercio_id', cid)
      .neq('estado', 'cancelado')
      .select('id,estado,nombre_cliente,cliente_nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('order_update_blocked');
    const who = String(
      updated.nombre_cliente || updated.cliente_nombre || 'pedido',
    );
    return {
      text: `Pedido *${who}* → *${orderStatusLabel(updated.estado as CanonicalOrderStatus)}* ✅`,
    };
  }

  if (op === 'upsert_payment_method') {
    const nombre = String(data.nombre || '').trim();
    const tipo = String(data.tipo || '').trim();
    const descripcion = data.descripcion != null ? String(data.descripcion) : null;
    const detalles = data.detalles != null ? String(data.detalles) : null;
    if (!nombre || !tipo) throw new Error('payment_incomplete');
    const methodId = data.methodId ? String(data.methodId) : null;
    if (methodId) {
      const { data: updated, error } = await sb
        .from('metodos_pago')
        .update({ nombre, tipo, descripcion, detalles })
        .eq('id', methodId)
        .eq('comercio_id', cid)
        .select('id,nombre')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error('payment_not_found');
      return { text: `Método actualizado 💳 *${updated.nombre}*` };
    }
    // Flutter parity: upsert by tipo (efectivo__usd / transferencia__usd__N).
    const result = await syncPaymentMethodsFlutter(sb, cid, [
      { nombre, tipo, descripcion, detalles },
    ]);
    return {
      text: `Método sincronizado 💳 *${nombre}*`,
      data: { retained: result.retained, deleted: result.deleted },
    };
  }

  if (op === 'sync_payment_methods') {
    const rows = Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : [];
    const result = await syncPaymentMethodsFlutter(sb, cid, rows);
    return {
      text: `Métodos de pago sincronizados 💳 (${result.retained} activos)`,
      data: result,
    };
  }

  if (op === 'delete_payment_method') {
    const methodId = String(data.methodId || '');
    if (!methodId) throw new Error('method_id_missing');
    const { data: deleted, error } = await sb
      .from('metodos_pago')
      .delete()
      .eq('id', methodId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error('payment_not_found');
    return { text: `Método eliminado 💳 *${deleted.nombre}*` };
  }

  if (op === 'set_delivery_config') {
    const { data: row, error: readErr } = await sb
      .from('comercios')
      .select('branding_ia,permite_delivery')
      .eq('id', cid)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const branding =
      row?.branding_ia && typeof row.branding_ia === 'object'
        ? (JSON.parse(JSON.stringify(row.branding_ia)) as Record<string, unknown>)
        : {};
    const configNegocio =
      branding.config_negocio && typeof branding.config_negocio === 'object'
        ? ({ ...(branding.config_negocio as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const prevRaw =
      configNegocio.delivery_config && typeof configNegocio.delivery_config === 'object'
        ? configNegocio.delivery_config
        : { enabled: false, pricing_type: 'fixed', fixed_price: 0, version: 1 };

    // Merge patch into Flutter DeliveryConfig shape, then validate.
    const base = parseDeliveryConfig(prevRaw);
    const next: DeliveryConfig = {
      ...base,
      enabled: data.enabled != null ? data.enabled === true : base.enabled,
      pricingType: data.pricingType
        ? (String(data.pricingType) as DeliveryConfig['pricingType'])
        : base.pricingType,
      fixedPrice:
        data.fixedPrice != null && Number.isFinite(Number(data.fixedPrice))
          ? round2(Number(data.fixedPrice))
          : base.fixedPrice,
      minOrder:
        data.minOrder != null && Number.isFinite(Number(data.minOrder))
          ? round2(Number(data.minOrder))
          : base.minOrder,
      currency: data.currency != null ? String(data.currency).toUpperCase() : base.currency,
      customMessage:
        data.customMessage != null ? String(data.customMessage).slice(0, 280) : base.customMessage,
    };

    if (data.distance && typeof data.distance === 'object') {
      const d = data.distance as Record<string, unknown>;
      next.distance = {
        basePrice: round2(Number(d.basePrice ?? d.base_price ?? next.distance.basePrice) || 0),
        includedKm: Number(d.includedKm ?? d.included_km ?? next.distance.includedKm) || 0,
        extraPricePerKm: round2(
          Number(d.extraPricePerKm ?? d.extra_price_per_km ?? next.distance.extraPricePerKm) || 0,
        ),
      };
    }
    if (Array.isArray(data.zones)) {
      next.zones = (data.zones as Array<Record<string, unknown>>).map((z, i) => ({
        name: String(z.name || `Zona ${i + 1}`),
        minDistance: Number(z.minDistance ?? z.min_distance) || 0,
        maxDistance: Number(z.maxDistance ?? z.max_distance) || 0,
        price: round2(Number(z.price) || 0),
      }));
    }
    if (Array.isArray(data.areaZones)) {
      next.areaZones = (data.areaZones as Array<Record<string, unknown>>).map((z, i) => {
        const polyRaw = Array.isArray(z.polygon) ? z.polygon : [];
        const polygon: Array<[number, number]> = [];
        for (const pt of polyRaw) {
          if (!Array.isArray(pt) || pt.length < 2) continue;
          const lat = Number(pt[0]);
          const lng = Number(pt[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
          polygon.push([lat, lng]);
        }
        return {
          id: String(z.id || slugId('z')),
          name: String(z.name || `Zona ${i + 1}`),
          price: round2(Number(z.price) || 0),
          polygon,
        };
      });
    }
    if (data.areaZonesFallback && typeof data.areaZonesFallback === 'object') {
      const f = data.areaZonesFallback as Record<string, unknown>;
      next.areaZonesFallback = {
        enabled: f.enabled === true,
        price: 0,
      };
    }
    if (data.freeDelivery && typeof data.freeDelivery === 'object') {
      const f = data.freeDelivery as Record<string, unknown>;
      next.freeDelivery = {
        enabled: f.enabled === true,
        minimumOrder: round2(Number(f.minimumOrder ?? f.minimum_order) || 0),
      };
    }

    const errors = validateDeliveryConfig(next);
    if (errors.length) throw new Error(`delivery_invalid:${errors[0]}`);

    const json = deliveryConfigToJson(next);
    configNegocio.delivery_config = json;
    delete configNegocio.delivery_tarifas;
    branding.config_negocio = configNegocio;
    const patch: Record<string, unknown> = { branding_ia: branding };
    patch.permite_delivery = next.enabled === true;
    const { error } = await sb.from('comercios').update(patch).eq('id', cid);
    if (error) throw new Error(error.message);
    const mode = next.pricingType;
    const detail =
      mode === 'zones'
        ? ` · ${next.zones.length} intervalos`
        : mode === 'area_zones'
          ? ` · ${next.areaZones.length} polígonos`
          : mode === 'distance'
            ? ` · por km`
            : next.fixedPrice != null
              ? ` · tarifa *${next.fixedPrice}*`
              : '';
    return {
      text: next.enabled
        ? `Delivery activo 🛵 (${mode})${detail}`
        : `Delivery desactivado 🔴`,
      data: { pricingType: mode },
    };
  }

  if (op === 'set_product_options') {
    const productId = String(data.productId || '');
    if (!productId) throw new Error('product_id_missing');
    const incoming =
      data.opcionesMenu && typeof data.opcionesMenu === 'object'
        ? (data.opcionesMenu as Record<string, unknown>)
        : null;
    if (!incoming) throw new Error('opciones_missing');

    const { data: current, error: readErr } = await sb
      .from('productos')
      .select('id,nombre,opciones_menu')
      .eq('id', productId)
      .eq('comercio_id', cid)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error('product_not_found');

    const prev =
      current.opciones_menu && typeof current.opciones_menu === 'object'
        ? ({ ...(current.opciones_menu as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    // Merge Flutter-shaped keys only; validate with shared parser.
    if (Array.isArray(incoming.tamanos)) prev.tamanos = incoming.tamanos;
    if (Array.isArray(incoming.ajustes)) prev.ajustes = incoming.ajustes;
    if (Array.isArray(incoming.grupos)) {
      prev.grupos = incoming.grupos;
      prev.activadas = incoming.activadas === false ? false : true;
    } else if (incoming.activadas != null) {
      prev.activadas = incoming.activadas === true;
    }
    if (incoming.personalizacion && typeof incoming.personalizacion === 'object') {
      prev.personalizacion = incoming.personalizacion;
    }
    if (incoming.venta_por_peso && typeof incoming.venta_por_peso === 'object') {
      prev.venta_por_peso = incoming.venta_por_peso;
    }
    if (incoming.delivery && typeof incoming.delivery === 'object') {
      prev.delivery = incoming.delivery;
    }

    const parsed = parseProductMenuOptions(prev);
    if (!parsed) throw new Error('opciones_invalidas');

    // Persist original Flutter JSON shape (activadas + grupos + legacy tamanos/ajustes).
    const { data: updated, error } = await sb
      .from('productos')
      .update({ opciones_menu: prev })
      .eq('id', productId)
      .eq('comercio_id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('product_not_found');
    const bits: string[] = [];
    if (parsed.tamanos?.length) bits.push(`${parsed.tamanos.length} tamaños`);
    if (parsed.ajustes?.length) bits.push(`${parsed.ajustes.length} extras`);
    if (parsed.grupos?.length) bits.push(`${parsed.grupos.length} grupos`);
    return {
      text: `Opciones de *${updated.nombre}* actualizadas 🧩${
        bits.length ? ` (${bits.join(', ')})` : ''
      }`,
      data: { productId: updated.id },
    };
  }

  if (op === 'upsert_promo_rule') {
    const name = String(data.name || '').trim();
    if (name.length < 2) throw new Error('nombre_corto');
    const ruleId = data.ruleId ? String(data.ruleId) : null;
    const payload: Record<string, unknown> = {
      comercio_id: cid,
      name,
      enabled: data.enabled !== false,
      trigger_type: String(data.triggerType || 'cart'),
      surface: String(data.surface || 'cart'),
      priority: String(data.priority || 'normal'),
    };
    if (data.triggerProductId) payload.trigger_product_id = String(data.triggerProductId);
    if (data.triggerCategoryId) payload.trigger_category_id = String(data.triggerCategoryId);
    if (data.triggerMinQty != null) payload.trigger_min_qty = Number(data.triggerMinQty) || 1;
    if (data.maxSuggestions != null) payload.max_suggestions = Number(data.maxSuggestions) || 3;

    // Probe Flutter contract tables; Preview may lack marketing schema.
    const probe = await sb.from('upsell_rules').select('id').limit(1);
    if (probe.error) {
      throw new Error(
        'promo_schema_missing: faltan tablas upsell_rules/upsell_settings en este entorno (sí existen en el contrato Flutter de producción)',
      );
    }

    if (ruleId) {
      const { data: updated, error } = await sb
        .from('upsell_rules')
        .update(payload)
        .eq('id', ruleId)
        .eq('comercio_id', cid)
        .select('id,name')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error('rule_not_found');
      return { text: `Promoción actualizada 🏷️ *${updated.name}*` };
    }
    const { data: inserted, error } = await sb
      .from('upsell_rules')
      .insert(payload)
      .select('id,name')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error('insert_failed');
    await sb.from('upsell_settings').upsert(
      {
        comercio_id: cid,
        enabled: true,
        show_cart: true,
        show_checkout: true,
        show_add_to_cart: true,
      },
      { onConflict: 'comercio_id' },
    );
    return { text: `Promoción creada 🏷️ *${inserted.name}*` };
  }

  if (op === 'toggle_promo_rule') {
    const ruleId = String(data.ruleId || '');
    const enabled = data.enabled === true;
    const { data: updated, error } = await sb
      .from('upsell_rules')
      .update({ enabled })
      .eq('id', ruleId)
      .eq('comercio_id', cid)
      .select('id,name,enabled')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('rule_not_found');
    return {
      text: updated.enabled
        ? `Promoción activa 🟢 *${updated.name}*`
        : `Promoción pausada ⏸️ *${updated.name}*`,
    };
  }

  if (op === 'delete_promo_rule') {
    const ruleId = String(data.ruleId || '');
    await sb.from('upsell_rule_targets').delete().eq('rule_id', ruleId);
    const { data: deleted, error } = await sb
      .from('upsell_rules')
      .delete()
      .eq('id', ruleId)
      .eq('comercio_id', cid)
      .select('id,name')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error('rule_not_found');
    return { text: `Promoción eliminada 🗑️ *${deleted.name}*` };
  }

  if (op === 'update_business_profile') {
    const patch: Record<string, unknown> = {};
    if (data.nombre != null) {
      const n = String(data.nombre).trim();
      if (n.length < 2) throw new Error('nombre_corto');
      patch.nombre = n;
    }
    if (data.whatsapp != null) patch.whatsapp = String(data.whatsapp).trim() || null;
    if (data.direccion != null) patch.direccion = String(data.direccion).trim() || null;
    if (data.logoUrl != null) {
      const u = String(data.logoUrl).trim();
      if (u && !u.startsWith('http')) throw new Error('logo_invalid');
      patch.logo_url = u || null;
    }
    if (data.descripcionVisual != null) {
      const { data: row } = await sb
        .from('comercios')
        .select('branding_ia')
        .eq('id', cid)
        .maybeSingle();
      const branding =
        row?.branding_ia && typeof row.branding_ia === 'object'
          ? (JSON.parse(JSON.stringify(row.branding_ia)) as Record<string, unknown>)
          : {};
      branding.descripcion_visual = String(data.descripcionVisual).slice(0, 500);
      patch.branding_ia = branding;
    }
    if (!Object.keys(patch).length) throw new Error('nothing_to_update');
    const { data: updated, error } = await sb
      .from('comercios')
      .update(patch)
      .eq('id', cid)
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('comercio_not_found');
    return { text: `Perfil actualizado ✅ *${updated.nombre}*` };
  }

  if (op === 'invite_staff') {
    const email = String(data.email || '')
      .trim()
      .toLowerCase();
    const role = String(data.role || 'caja').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email_invalido');
    const allowedRoles = new Set([
      'administrador',
      'caja',
      'cocina',
      'marketing',
      'mesero',
    ]);
    if (!allowedRoles.has(role)) throw new Error('rol_invalido');

    // Prefer Flutter RPC when available (authenticated path). Service-role
    // assistant falls back to the same table writes the RPC performs.
    const { data: rpcData, error: rpcErr } = await sb.rpc('invite_comercio_member', {
      p_comercio_id: cid,
      p_email: email,
      p_role: role,
    });
    if (!rpcErr) {
      return {
        text: `Invitación enviada 👥 *${email}* como *${role}*`,
        data: rpcData && typeof rpcData === 'object' ? (rpcData as Record<string, unknown>) : undefined,
      };
    }

    const token = randomBytes(24).toString('hex');
    const { data: existingInvite } = await sb
      .from('comercio_member_invites')
      .select('id')
      .eq('comercio_id', cid)
      .eq('status', 'pending')
      .ilike('email', email)
      .maybeSingle();

    if (existingInvite?.id) {
      const { error } = await sb
        .from('comercio_member_invites')
        .update({
          role,
          token,
          status: 'pending',
          invited_by: userId || null,
          accepted_at: null,
        })
        .eq('id', existingInvite.id)
        .eq('comercio_id', cid);
      if (error) throw new Error(error.message);
      return {
        text: `Invitación actualizada 👥 *${email}* como *${role}*`,
        data: { inviteId: existingInvite.id, status: 'pending' },
      };
    }

    const { data: inserted, error } = await sb
      .from('comercio_member_invites')
      .insert({
        comercio_id: cid,
        email,
        role,
        token,
        invited_by: userId || null,
        status: 'pending',
      })
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error('invite_failed');
    return {
      text: `Invitación enviada 👥 *${email}* como *${role}*`,
      data: { inviteId: inserted.id, status: 'pending' },
    };
  }

  if (op === 'revoke_staff') {
    const memberId = data.memberId ? String(data.memberId) : null;
    const inviteId = data.inviteId ? String(data.inviteId) : null;
    if (!memberId && !inviteId) throw new Error('staff_id_missing');

    const { error: rpcErr } = await sb.rpc('revoke_comercio_member', {
      p_comercio_id: cid,
      p_member_id: memberId,
      p_invite_id: inviteId,
    });
    if (!rpcErr) return { text: `Acceso revocado 👥` };

    if (memberId) {
      const { error } = await sb
        .from('comercio_members')
        .update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('id', memberId)
        .eq('comercio_id', cid);
      if (error) throw new Error(error.message);
    }
    if (inviteId) {
      const { error } = await sb
        .from('comercio_member_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
        .eq('comercio_id', cid)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
    }
    return { text: `Acceso revocado 👥` };
  }

  return null;
}
