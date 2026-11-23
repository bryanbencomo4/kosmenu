/**
 * Replace placeholder Doleto product descriptions with production-ready copy.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/fix-doleto-descriptions.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

const COMERCIO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';

/** @type {Record<string, string>} */
const byName = {
  'Agua de botellón':
    'Agua potable en botellón, lista para el hogar o el negocio.',
  'Aguardiente Antioqueño':
    'Aguardiente colombiano Antioqueño, anisado y refrescante.',
  'Aguardiente Antioqueño pata':
    'Aguardiente Antioqueño en presentación pata, ideal para compartir.',
  'Arroz Primor tradicional':
    'Arroz Primor de grano tradicional, perfecto para el día a día.',
  'Bokas salado, ristra 12×25':
    'Snack Bokas salado en ristra; ideal para pasapalos y fiestas.',
  'Brice Ice':
    'Bebida Brice Ice, refrescante y lista para servir bien fría.',
  'Café Polar':
    'Café Polar tostado y molido, aroma intenso para preparar en casa.',
  'Calazán de pata':
    'Calazán en presentación pata, para acompañar reuniones y asados.',
  Carbón: 'Carbón vegetal para encender parrilla o fogón.',
  'Carbón premium':
    'Carbón premium de combustión limpia, ideal para asados prolongados.',
  'Cerveza Polar lata tercio':
    'Cerveza Polar en lata formato tercio, fresca y lista para servir.',
  'Cerveza Polar tercio':
    'Cerveza Polar en botella tercio, clásica y bien fría.',
  'Chicharrón Criollo 20×90':
    'Chicharrón Criollo crujiente en empaque familiar 20×90.',
  'Chicharrón Criollo 6×12':
    'Chicharrón Criollo crujiente en empaque 6×12, perfecto para picar.',
  Chimó: 'Chimó tradicional venezolano en presentación lista para consumo.',
  'Chiskesitos 10×450':
    'Chiskesitos crujientes en empaque 10×450, para compartir.',
  'Chiskesitos 12×12':
    'Chiskesitos en empaque 12×12, snack salado para cualquier momento.',
  'Chiskesitos 4×5, 145 g':
    'Chiskesitos en presentación 4×5 de 145 g, porción práctica.',
  Condones: 'Preservativos de uso personal, empaque discreto.',
  'Consul cigarrillos': 'Cigarrillos Consul en cajetilla regular.',
  'Harina P.A.N.':
    'Harina precocida de maíz P.A.N., base para arepas y panquecas.',
  'La Española':
    'Sangría o bebida La Española, afrutada y lista para servir fría.',
  'Licor Dragon':
    'Licor Dragon de sabor intenso, ideal con hielo o en cócteles.',
  'Lucky cigarrillos': 'Cigarrillos Lucky Strike en cajetilla regular.',
  'Mantequilla 250 g':
    'Mantequilla en presentación de 250 g, para cocina y mesa.',
  Maxi: 'Snack Maxi salado, crujiente y listo para picar.',
  'Mayonesa 1 kg':
    'Mayonesa en envase de 1 kg, rendimiento para hogar o negocio.',
  'Nevada gas':
    'Bebida Nevada con gas, refrescante para acompañar comidas.',
  'Pall Mall cigarrillos': 'Cigarrillos Pall Mall en cajetilla regular.',
  'Pasta Primor':
    'Pasta Primor de trigo, ideal para sopas y platos del día.',
  'Pepitonas Margarita':
    'Pepitonas Margarita en conserva, listas para ensaladas o picoteo.',
  'Ponche Crema':
    'Ponche Crema dulce y cremoso, clásico para celebraciones.',
  'Ron Pampero grande':
    'Ron Pampero en botella grande, suave y versátil para cócteles.',
  'Ron Santa Teresa 1 L':
    'Ron Santa Teresa en botella de 1 litro, tradición venezolana.',
  'Sangría La Que Manda':
    'Sangría La Que Manda, afrutada y lista para servir bien fría.',
  'Santa Teresa 1796 surtido':
    'Ron Santa Teresa 1796, edición premium para paladares exigentes.',
  'Sardina Margarita':
    'Sardinas Margarita en conserva, prácticas para la despensa.',
  'Tequila Chiapas':
    'Tequila Chiapas, ideal para tomar solo, con sal o en cócteles.',
  'Universal caja': 'Cigarrillos Universal en caja completa.',
  'Vinagre Mavesa':
    'Vinagre Mavesa para aderezos, escabeches y cocina diaria.',
  'Vino Alexander':
    'Vino Alexander, suave y equilibrado para la mesa.',
  'Vino Barroco': 'Vino Barroco, ideal para acompañar comidas y reuniones.',
  'Vino Gato Negro':
    'Vino Gato Negro, tinto de mesa con buena relación calidad-precio.',
  'Vino Lazo': 'Vino Lazo, presentación lista para compartir en la mesa.',
  'Vino Rosario': 'Vino Rosario, suave y agradable para el día a día.',
  'Vino Sagrada Familia':
    'Vino Sagrada Familia, clásico para celebraciones y sobremesa.',
  'Whisky Gran Lord':
    'Whisky Gran Lord, suave y equilibrado para disfrutar solo o con hielo.',
  'Whisky President':
    'Whisky President, presentación estándar para reuniones.',
  'Whisky Sir Albert':
    'Whisky Sir Albert, perfil suave ideal con hielo o refresco.',
};

const PLACEHOLDER_RE =
  /verificar|por confirmar|ejemplo|placeholder|TODO|datos de ejemplo|capacidad por|formato por|peso por|tamaño por|marca por|variedad por|volumen por|cantidad por|cepa y|tipo y formato|cajetilla por|edición o surtido/i;

const { data: products, error } = await sb
  .from('productos')
  .select('id,nombre,descripcion')
  .eq('comercio_id', COMERCIO_ID);
if (error) throw error;

const updates = [];
for (const product of products || []) {
  const name = (product.nombre || '').trim();
  const current = (product.descripcion || '').trim();
  const mapped = byName[name];
  if (mapped && mapped !== current) {
    updates.push({ id: product.id, nombre: name, descripcion: mapped });
    continue;
  }
  if (PLACEHOLDER_RE.test(current) || !current) {
    updates.push({
      id: product.id,
      nombre: name,
      descripcion: fallbackDescription(name),
    });
  }
}

function fallbackDescription(name) {
  const n = name.trim();
  if (/cigarrillo/i.test(n)) return `${n} en cajetilla, listo para venta.`;
  if (/cerveza/i.test(n)) return `${n}, fresca y lista para servir bien fría.`;
  if (/vino/i.test(n)) return `${n}, ideal para acompañar comidas y reuniones.`;
  if (/ron|whisky|tequila|aguardiente|licor|anis/i.test(n)) {
    return `${n}, listo para disfrutar solo, con hielo o en cócteles.`;
  }
  if (/agua|jugo|refresco|gaseosa|energ/i.test(n)) {
    return `${n}, refrescante y listo para servir.`;
  }
  return `${n}, producto de calidad disponible en tienda.`;
}

console.log(`Updating ${updates.length} descriptions…`);
let ok = 0;
for (const row of updates) {
  const { error: upErr } = await sb
    .from('productos')
    .update({
      descripcion: row.descripcion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('comercio_id', COMERCIO_ID);
  if (upErr) throw upErr;
  ok += 1;
  console.log(`  ✓ ${row.nombre}`);
}

const { data: left } = await sb
  .from('productos')
  .select('nombre,descripcion')
  .eq('comercio_id', COMERCIO_ID);
const remaining = (left || []).filter(
  (p) => PLACEHOLDER_RE.test(p.descripcion || '') || !(p.descripcion || '').trim(),
);
console.log(`Done. Updated ${ok}. Remaining placeholders: ${remaining.length}`);
if (remaining.length) {
  for (const p of remaining) {
    console.log('  !', p.nombre, '=>', p.descripcion);
  }
}
