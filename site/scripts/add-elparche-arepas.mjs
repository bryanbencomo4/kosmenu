/**
 * Add Arepas category + combo products with opciones_menu for El Parche del Gato.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/add-elparche-arepas.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need Supabase env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function rid(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function unica(nombre, labels, { min = 1, max = 1 } = {}) {
  return {
    id: rid('g'),
    max,
    min,
    tipo: max > 1 ? 'multiple' : 'unica',
    nombre,
    obligatorio: true,
    opciones: labels.map((label) => ({
      id: rid('o'),
      activo: true,
      nombre: label,
      precio: 0,
    })),
  };
}

function opciones(...grupos) {
  return { activadas: true, grupos };
}

const PROTEINAS = [
  'Carne mechada',
  'Pollo mechado',
  'Estrogonof',
  'Lengua',
  'Mollejas',
  'Asado negro',
  'Lomo de cerdo',
  'Camarones al ajillo',
  'Ternerita',
];

const CONTORNOS = [
  'Huevos de codorniz',
  'Salchicha',
  'Chorizo',
  'Queso amarillo',
  'Queso guayanés',
  'Ensalada rusa',
  'Aguacate con pollo',
];

const BEBIDAS = ['Refresco', 'Jugo natural', 'Malta', 'Agua'];

const DESC_BASE =
  'Arepa con relleno a elección. Incluye una bebida gratis.';

function arepaOpciones({ proteinasMin, proteinasMax, contornosMin, contornosMax }) {
  const grupos = [];
  grupos.push(
    unica(
      proteinasMax > 1 ? 'Proteínas' : 'Proteína',
      PROTEINAS,
      { min: proteinasMin, max: proteinasMax },
    ),
  );
  grupos.push(
    unica(
      contornosMax > 1 ? 'Contornos' : 'Contorno',
      CONTORNOS,
      { min: contornosMin, max: contornosMax },
    ),
  );
  grupos.push(unica('Bebida incluida', BEBIDAS));
  return opciones(...grupos);
}

const PRODUCTS = [
  {
    nombre: '1 proteína + 2 contornos',
    precio: 12000,
    descripcion: `${DESC_BASE} Elige 1 proteína y 2 contornos.`,
    opciones_menu: arepaOpciones({
      proteinasMin: 1,
      proteinasMax: 1,
      contornosMin: 2,
      contornosMax: 2,
    }),
    imagePrefer: 'Arepa de carne mechada',
  },
  {
    nombre: '2 proteínas + 1 contorno',
    precio: 15000,
    descripcion: `${DESC_BASE} Elige 2 proteínas y 1 contorno.`,
    opciones_menu: arepaOpciones({
      proteinasMin: 2,
      proteinasMax: 2,
      contornosMin: 1,
      contornosMax: 1,
    }),
    imagePrefer: 'Arepa reina pepiada',
  },
];

async function copyImageFromPool(comercioId, productId, preferName) {
  const { data: pool } = await sb
    .from('productos')
    .select('nombre,imagen_url')
    .not('imagen_url', 'is', null)
    .ilike('nombre', '%arepa%')
    .limit(40);
  const prefer = (pool || []).find(
    (p) => (p.nombre || '').toLowerCase() === preferName.toLowerCase(),
  );
  const fallback = (pool || []).find((p) => (p.imagen_url || '').trim());
  const source = prefer || fallback;
  if (!source?.imagen_url) return null;

  const res = await fetch(source.imagen_url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(buf)
    .rotate()
    .resize(900, 900, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const objectPath = `${comercioId}/arepa_${productId}_${Date.now()}.jpg`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(objectPath, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function main() {
  const { data: comercio, error: cErr } = await sb
    .from('comercios')
    .select('id,nombre')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: catalog, error: catErr } = await sb
    .from('catalogos')
    .select('id')
    .eq('comercio_id', comercio.id)
    .eq('activo', true)
    .order('orden', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (catErr) throw catErr;
  if (!catalog) throw new Error('No active catalog');

  const { data: existingCat } = await sb
    .from('categorias')
    .select('id,nombre')
    .eq('comercio_id', comercio.id)
    .eq('nombre', 'Arepas')
    .maybeSingle();

  let categoryId = existingCat?.id;
  if (!categoryId) {
    const { data: maxOrdenRow } = await sb
      .from('categorias')
      .select('orden')
      .eq('comercio_id', comercio.id)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Insert before Bebidas if possible: after Arroz Chino (orden 7) / before Bebidas (8)
    const { data: bebidas } = await sb
      .from('categorias')
      .select('id,orden')
      .eq('comercio_id', comercio.id)
      .eq('nombre', 'Bebidas')
      .maybeSingle();
    const orden = bebidas ? Number(bebidas.orden) : Number(maxOrdenRow?.orden || 0) + 1;

    if (bebidas) {
      // shift Bebidas and anything at/after orden up by 1
      const { data: toShift } = await sb
        .from('categorias')
        .select('id,orden')
        .eq('comercio_id', comercio.id)
        .gte('orden', orden);
      for (const row of toShift || []) {
        await sb
          .from('categorias')
          .update({ orden: Number(row.orden) + 1 })
          .eq('id', row.id);
      }
    }

    const { data: created, error: createErr } = await sb
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre: 'Arepas',
        orden,
        activo: true,
        rol: 'main',
      })
      .select('id,orden')
      .single();
    if (createErr) throw createErr;
    categoryId = created.id;
    console.log('Created category Arepas orden=', created.orden);
  } else {
    console.log('Category Arepas exists', categoryId);
  }

  // Upsert products by name within category
  for (const [i, p] of PRODUCTS.entries()) {
    const { data: existing } = await sb
      .from('productos')
      .select('id')
      .eq('comercio_id', comercio.id)
      .eq('categoria_id', categoryId)
      .eq('nombre', p.nombre)
      .maybeSingle();

    const payload = {
      comercio_id: comercio.id,
      categoria_id: categoryId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      disponible: true,
      orden: i,
      opciones_menu: p.opciones_menu,
      updated_at: new Date().toISOString(),
    };

    let productId = existing?.id;
    if (productId) {
      const { error } = await sb
        .from('productos')
        .update(payload)
        .eq('id', productId);
      if (error) throw error;
      console.log('Updated product', p.nombre);
    } else {
      const { data: inserted, error } = await sb
        .from('productos')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      productId = inserted.id;
      console.log('Created product', p.nombre, p.precio);
    }

    try {
      const imgUrl = await copyImageFromPool(
        comercio.id,
        productId,
        p.imagePrefer,
      );
      if (imgUrl) {
        await sb
          .from('productos')
          .update({
            imagen_url: imgUrl,
            imagen_source_type: 'manual',
          })
          .eq('id', productId);
        console.log('  image OK ←', p.imagePrefer);
      } else {
        console.warn('  no arepa image found to copy');
      }
    } catch (err) {
      console.warn('  image failed:', err.message);
    }
  }

  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
