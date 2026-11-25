import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessShop } from './auth';
import type { BusinessAllowedOp } from './config';
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

/** Apply extended ops. Throws on validation/DB errors. Returns null if op not handled here. */
export async function applyExtendedOp(params: {
  sb: SupabaseClient;
  shop: BusinessShop;
  op: BusinessAllowedOp;
  data: Record<string, unknown>;
}): Promise<ApplyOk | null> {
  const { sb, shop, op, data } = params;
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
    const patch: Record<string, unknown> = {
      exchange_rate_value: value,
      tasa_cambio_pesos: value,
      exchange_rate_mode: 'manual',
      last_rate_update: new Date().toISOString(),
    };
    if (data.quoteCurrency) patch.exchange_rate_quote_currency = String(data.quoteCurrency);
    const { data: updated, error } = await sb
      .from('comercios')
      .update(patch)
      .eq('id', cid)
      .select('id,nombre,exchange_rate_value,tasa_cambio_pesos')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error('comercio_not_found');
    return {
      text: `Tasa actualizada 💱 *${updated.exchange_rate_value ?? updated.tasa_cambio_pesos}* (manual)`,
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
    const { data: inserted, error } = await sb
      .from('metodos_pago')
      .insert({ comercio_id: cid, nombre, tipo, descripcion, detalles })
      .select('id,nombre')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error('insert_failed');
    return { text: `Método agregado 💳 *${inserted.nombre}*` };
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
    const prev =
      configNegocio.delivery_config && typeof configNegocio.delivery_config === 'object'
        ? ({ ...(configNegocio.delivery_config as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : { enabled: false, pricing_type: 'fixed', fixed_price: 0, version: 1 };
    if (data.enabled != null) prev.enabled = data.enabled === true;
    if (data.pricingType) prev.pricing_type = String(data.pricingType);
    if (data.fixedPrice != null) {
      const fp = Number(data.fixedPrice);
      if (!Number.isFinite(fp) || fp < 0) throw new Error('tarifa_invalida');
      prev.fixed_price = round2(fp);
      prev.pricing_type = prev.pricing_type || 'fixed';
    }
    if (data.minOrder != null) {
      const mo = Number(data.minOrder);
      if (!Number.isFinite(mo) || mo < 0) throw new Error('min_order_invalido');
      prev.min_order = round2(mo);
    }
    prev.version = 1;
    configNegocio.delivery_config = prev;
    branding.config_negocio = configNegocio;
    const patch: Record<string, unknown> = { branding_ia: branding };
    if (data.enabled != null) patch.permite_delivery = data.enabled === true;
    const { error } = await sb.from('comercios').update(patch).eq('id', cid);
    if (error) throw new Error(error.message);
    const on = prev.enabled === true;
    return {
      text: on
        ? `Delivery activo 🛵${
            prev.fixed_price != null ? ` · tarifa *${prev.fixed_price}*` : ''
          }`
        : `Delivery desactivado 🔴`,
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
    if (!email.includes('@')) throw new Error('email_invalido');
    const allowedRoles = new Set([
      'administrador',
      'caja',
      'cocina',
      'marketing',
      'mesero',
    ]);
    if (!allowedRoles.has(role)) throw new Error('rol_invalido');
    const { data: rpcData, error } = await sb.rpc('invite_comercio_member', {
      p_comercio_id: cid,
      p_email: email,
      p_role: role,
    });
    if (error) throw new Error(error.message);
    return {
      text: `Invitación enviada 👥 *${email}* como *${role}*${
        rpcData ? '' : ''
      }`,
    };
  }

  if (op === 'revoke_staff') {
    const memberId = data.memberId ? String(data.memberId) : null;
    const inviteId = data.inviteId ? String(data.inviteId) : null;
    if (!memberId && !inviteId) throw new Error('staff_id_missing');
    const { error } = await sb.rpc('revoke_comercio_member', {
      p_comercio_id: cid,
      p_member_id: memberId,
      p_invite_id: inviteId,
    });
    if (error) throw new Error(error.message);
    return { text: `Acceso revocado 👥` };
  }

  return null;
}
