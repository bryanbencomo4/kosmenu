/**
 * Update El Parche refresco botella/lata images from local assets.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/tmp_update_parche_refresco_images.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';

const BOTTLE =
  'C:/Users/bryan/.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/image-8ffea41a-2557-451e-ab81-c87e7ce2ea9c.png';
const CAN =
  'C:/Users/bryan/.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/image-5df7e335-0793-4391-9909-b97ec65c38e0.png';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need Supabase env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: c, error: cErr } = await sb
  .from('comercios')
  .select('id,slug,nombre')
  .eq('slug', SLUG)
  .single();
if (cErr) throw cErr;

const { data: drinks, error: dErr } = await sb
  .from('productos')
  .select('id,nombre,imagen_url')
  .eq('comercio_id', c.id)
  .ilike('nombre', '%refresco%');
if (dErr) throw dErr;

const botella = drinks.find((p) => /botella/i.test(p.nombre));
const lata = drinks.find((p) => /lata/i.test(p.nombre));
if (!botella) throw new Error('Refresco botella not found');
if (!lata) throw new Error('Refresco lata not found');

async function uploadFor(product, localPath, label) {
  const raw = readFileSync(localPath);
  const jpeg = await sharp(raw).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const objectPath = `${c.id}/manual_${product.id}_${Date.now()}_${randomBytes(3).toString('hex')}.jpg`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(objectPath, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw upErr;
  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  const { error: updErr } = await sb
    .from('productos')
    .update({
      imagen_url: publicUrl,
      imagen_source_type: 'manual',
      ai_image_status: 'none',
      ai_image_error_message: null,
    })
    .eq('id', product.id);
  if (updErr) throw updErr;
  console.log('OK', label, product.nombre, publicUrl);
}

await uploadFor(botella, BOTTLE, 'botella');
await uploadFor(lata, CAN, 'lata');

const { data: after } = await sb
  .from('productos')
  .select('nombre,imagen_url,imagen_source_type')
  .in('id', [botella.id, lata.id]);
console.log(JSON.stringify(after, null, 2));
