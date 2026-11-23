import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';
const src = path.resolve('scripts/_parche_imgs/user_batch5/pollo-broaster.jpg');
const out = path.resolve('scripts/_parche_imgs/user_batch5/pollo-broaster_ready.jpg');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

await sharp(src)
  .rotate()
  .resize(900, 900, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(out);
const bytes = fs.readFileSync(out);

const { data: c, error: cErr } = await sb
  .from('comercios')
  .select('id')
  .eq('slug', SLUG)
  .single();
if (cErr) throw cErr;

const { data: products, error: pErr } = await sb
  .from('productos')
  .select('id,nombre,categorias(nombre)')
  .eq('comercio_id', c.id);
if (pErr) throw pErr;

const targets = (products || []).filter(
  (p) => (p.categorias?.nombre || '') === 'Pollo Broaster',
);

for (const p of targets) {
  const objectPath = `${c.id}/broaster_${p.id}_${Date.now()}.jpg`;
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    console.error('upload', p.nombre, upErr.message);
    continue;
  }
  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(objectPath).data
    .publicUrl;
  const { error: uErr } = await sb
    .from('productos')
    .update({
      imagen_url: publicUrl,
      imagen_source_type: 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.id)
    .eq('comercio_id', c.id);
  if (uErr) {
    console.error('db', p.nombre, uErr.message);
    continue;
  }
  console.log('Updated', p.nombre);
}
