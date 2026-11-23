/**
 * Toro Bravo delivery intervals:
 * - 0–5 km → $1
 * - after 5 km → +$2 per km
 * - max coverage 60 km
 *
 *   node --env-file=.env.local scripts/update-torobravo-delivery.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { quoteDeliveryFee } from '../app/_lib/delivery-config.ts';

const COMERCIO = '42bbabaa-3844-4271-aaf6-b74d9f5954a2';
const EXTRA_PER_KM = 2;
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const zones = [
  { name: '0 a 5 km', min_distance: 0, max_distance: 5, price: 1 },
];
for (let from = 5; from < 60; from += 1) {
  const to = from + 1;
  const extraKm = to - 5;
  const price = 1 + extraKm * EXTRA_PER_KM;
  zones.push({
    name: `${from} a ${to} km`,
    min_distance: from,
    max_distance: to,
    price,
  });
}

const delivery_config = {
  enabled: true,
  version: 1,
  currency: 'USD',
  min_order: 0,
  fixed_price: 0,
  pricing_type: 'zones',
  zones,
  area_zones: [],
  area_zones_fallback: { enabled: false, price: 0 },
  free_delivery: { enabled: false, minimum_order: 0 },
  custom_message:
    'Hasta 5 km: $1. Luego $2 por cada km adicional. Máximo 60 km.',
  distance_config: {
    base_price: 1,
    included_km: 5,
    extra_price_per_km: EXTRA_PER_KM,
  },
  estimated_times: {
    preparation_minutes: 20,
    delivery_minutes: 30,
  },
};

function quoteAtKm(km) {
  return quoteDeliveryFee({
    config: delivery_config,
    isDelivery: true,
    subtotal: 20,
    origin: { lat: 0, lng: 0 },
    destination: { lat: km / 111.32, lng: 0 },
  });
}

const samples = [0, 2.5, 5, 5.1, 6, 10, 60, 60.5].map((km) => {
  const q = quoteAtKm(km);
  return {
    km,
    fee: q.fee,
    blocked: q.blocked,
    dist: q.distanceKm?.toFixed(2),
  };
});
console.log('samples', samples);
console.log('zones', zones.length, 'last', zones[zones.length - 1]);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: current, error: curErr } = await supabase
  .from('comercios')
  .select('branding_ia')
  .eq('id', COMERCIO)
  .single();
if (curErr) {
  console.error(curErr);
  process.exit(1);
}

const branding = { ...(current.branding_ia || {}) };
const config = { ...(branding.config_negocio || {}) };
config.delivery_config = delivery_config;
branding.config_negocio = config;

const { error } = await supabase
  .from('comercios')
  .update({ branding_ia: branding })
  .eq('id', COMERCIO);
if (error) {
  console.error(error);
  process.exit(1);
}
console.log('OK torobravo delivery updated');
