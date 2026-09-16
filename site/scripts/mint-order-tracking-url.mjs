import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local env file.
  }
}

function generatePublicTrackingToken() {
  return randomBytes(32).toString('base64url');
}

function hashPublicTrackingToken(token) {
  return createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

loadEnvLocal();

const orderCode = (process.argv[2] ?? 'EMXFA-000001').trim();
const slug = (process.argv[3] ?? 'pizzas-el-trueno').trim();
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const publicSiteUrl = (
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ||
  process.env.PUBLIC_SITE_URL ||
  'https://elmenuxfa.com'
)
  .trim()
  .replace(/\/$/, '');

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const { data: row, error } = await supabase
  .from('pedidos')
  .select('id,detalles,comercio_id')
  .eq('detalles->>order_id', orderCode)
  .maybeSingle();

if (error) {
  console.error(error.message);
  process.exit(1);
}

if (!row) {
  console.error(`Order not found: ${orderCode}`);
  process.exit(1);
}

const token = generatePublicTrackingToken();
const tokenHash = hashPublicTrackingToken(token);
const trackingPath = `${publicSiteUrl}/v/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderCode)}`;
const trackingUrl = `${trackingPath}?t=${encodeURIComponent(token)}`;

const currentDetalles =
  row.detalles && typeof row.detalles === 'object' ? { ...row.detalles } : {};

const nextDetalles = {
  ...currentDetalles,
  tracking_url: trackingUrl,
  public_tracking_token_hash: tokenHash,
};

const { error: updateError } = await supabase
  .from('pedidos')
  .update({
    detalles: nextDetalles,
    public_tracking_token_hash: tokenHash,
  })
  .eq('id', row.id);

if (updateError) {
  console.error(updateError.message);
  process.exit(1);
}

console.log(trackingUrl);
