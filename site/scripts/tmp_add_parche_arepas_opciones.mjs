/**
 * Data-only: append missing proteína/contorno opciones on
 * el-parche-del-gato-arepas arepa products. Does not touch app code.
 *
 *   node --env-file=.env.local scripts/tmp_add_parche_arepas_opciones.mjs
 *   node --env-file=.env.local scripts/tmp_add_parche_arepas_opciones.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const DRY = process.argv.includes('--dry-run');
const CATEGORIA_AREPAS = '0269d8f2-97c9-4227-a610-7623aa36bf16';

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

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Canonical keys used only for matching existing labels. */
function matchKeys(name) {
  const n = norm(name);
  const extras = {
    strogonoff: ['estrogonof', 'estrogonoff', 'strogonoff', 'stroganoff'],
    estrogonof: ['estrogonof', 'estrogonoff', 'strogonoff', 'stroganoff'],
    'huevo cordorniz': [
      'huevos de codorniz',
      'huevo de codorniz',
      'huevo cordorniz',
      'huevos cordorniz',
    ],
    'huevos de codorniz': [
      'huevos de codorniz',
      'huevo de codorniz',
      'huevo cordorniz',
      'huevos cordorniz',
    ],
    'queso guallanes': ['queso guayanes', 'queso guallanes'],
    'queso guayanes': ['queso guayanes', 'queso guallanes'],
    'aguacate con pollo reina pepida': [
      'aguacate con pollo',
      'aguacate con pollo reina pepida',
      'aguacate con pollo reina pepiada',
    ],
    'aguacate con pollo': [
      'aguacate con pollo',
      'aguacate con pollo reina pepida',
      'aguacate con pollo reina pepiada',
    ],
    'charcutera queso y jamon': ['charcutera', 'charcutera queso y jamon'],
  };
  return new Set([n, ...(extras[n] || [])]);
}

function optionExists(opciones, desired) {
  const wanted = matchKeys(desired);
  return (opciones || []).some((o) => {
    const existing = matchKeys(o.nombre);
    for (const w of wanted) {
      if (existing.has(w)) return true;
    }
    const en = norm(o.nombre);
    for (const w of wanted) {
      if (en === w) return true;
      // soft: "aguacate con pollo" covers "... (reina pepiada)"
      if (en.startsWith('aguacate con pollo') && w.startsWith('aguacate con pollo')) {
        return true;
      }
    }
    return false;
  });
}

function isProteinGroup(name) {
  const n = norm(name);
  return n === 'proteina' || n === 'proteinas';
}

function isContornoGroup(name) {
  const n = norm(name);
  return n === 'contorno' || n === 'contornos';
}

/** Client list → display name to insert if missing. */
const WANT_PROTEINAS = [
  { match: 'Carne mechada', insert: 'Carne mechada' },
  { match: 'Pollo mechado', insert: 'Pollo mechado' },
  { match: 'Lengua', insert: 'Lengua' },
  { match: 'Mollejas', insert: 'Mollejas' },
  { match: 'Asado negro', insert: 'Asado negro' },
  { match: 'Ternerita', insert: 'Ternerita' },
  { match: 'Lomo ahumado', insert: 'Lomo ahumado' },
  // Already present as "Estrogonof" — treat as present, do not duplicate.
  { match: 'Strogonoff', insert: 'Strogonoff', aliasOf: 'Estrogonof' },
  { match: 'Camarones al ajillo', insert: 'Camarones al ajillo' },
  { match: 'Parrilla', insert: 'Parrilla' },
];

const WANT_CONTORNOS = [
  { match: 'Queso amarillo', insert: 'Queso amarillo' },
  { match: 'Queso blanco', insert: 'Queso blanco' },
  // Already present as "Queso guayanés"
  { match: 'Queso guallanes', insert: 'Queso guayanés', aliasOf: 'Queso guayanés' },
  {
    match: 'Charcutera (queso y jamón)',
    insert: 'Charcutera (queso y jamón)',
  },
  // Already present as "Huevos de codorniz"
  {
    match: 'Huevo cordorniz',
    insert: 'Huevos de codorniz',
    aliasOf: 'Huevos de codorniz',
  },
  { match: 'Salchicha', insert: 'Salchicha' },
  { match: 'Chorizo', insert: 'Chorizo' },
  { match: 'Ensalada rusa', insert: 'Ensalada rusa' },
  // Already present as "Aguacate con pollo"
  {
    match: 'Aguacate con pollo (reina pepiada)',
    insert: 'Aguacate con pollo',
    aliasOf: 'Aguacate con pollo',
  },
  { match: 'Caraotas', insert: 'Caraotas' },
];

function appendMissing(grupos, wants, kind) {
  const added = [];
  const already = [];
  for (const g of grupos) {
    const ok =
      kind === 'proteina' ? isProteinGroup(g.nombre) : isContornoGroup(g.nombre);
    if (!ok) continue;
    g.opciones = Array.isArray(g.opciones) ? g.opciones : [];
    for (const want of wants) {
      if (optionExists(g.opciones, want.match) || optionExists(g.opciones, want.insert)) {
        already.push(want.aliasOf ? `${want.match} (= ${want.aliasOf})` : want.match);
        continue;
      }
      g.opciones.push({
        id: rid('o'),
        activo: true,
        nombre: want.insert,
        precio: 0,
      });
      added.push(want.insert);
    }
  }
  return { added, already };
}

async function main() {
  const { data: prods, error } = await sb
    .from('productos')
    .select('id,nombre,opciones_menu')
    .eq('categoria_id', CATEGORIA_AREPAS);
  if (error) throw error;
  if (!prods?.length) throw new Error('No arepa products found');

  const summaryAdded = { proteinas: new Set(), contornos: new Set() };
  const summaryAlready = { proteinas: new Set(), contornos: new Set() };

  for (const p of prods) {
    const om = structuredClone(p.opciones_menu) || {
      activadas: true,
      grupos: [],
    };
    const grupos = om.grupos || [];
    const prot = appendMissing(grupos, WANT_PROTEINAS, 'proteina');
    const cont = appendMissing(grupos, WANT_CONTORNOS, 'contorno');
    for (const x of prot.added) summaryAdded.proteinas.add(x);
    for (const x of cont.added) summaryAdded.contornos.add(x);
    for (const x of prot.already) summaryAlready.proteinas.add(x);
    for (const x of cont.already) summaryAlready.contornos.add(x);

    console.log(`\n${p.nombre}`);
    console.log('  + proteínas:', prot.added.length ? prot.added.join(', ') : '(ninguna)');
    console.log('  + contornos:', cont.added.length ? cont.added.join(', ') : '(ninguna)');

    if (!prot.added.length && !cont.added.length) continue;
    if (DRY) {
      console.log('  (dry-run, no update)');
      continue;
    }
    const { error: upErr } = await sb
      .from('productos')
      .update({ opciones_menu: om })
      .eq('id', p.id);
    if (upErr) throw upErr;
    console.log('  updated ok');
  }

  console.log('\n=== RESUMEN ===');
  console.log(
    'Ya estaban (proteínas):',
    [...summaryAlready.proteinas].sort().join(' | ') || '(ninguna)',
  );
  console.log(
    'Ya estaban (contornos):',
    [...summaryAlready.contornos].sort().join(' | ') || '(ninguna)',
  );
  console.log(
    'Agregadas (proteínas):',
    [...summaryAdded.proteinas].sort().join(' | ') || '(ninguna)',
  );
  console.log(
    'Agregadas (contornos):',
    [...summaryAdded.contornos].sort().join(' | ') || '(ninguna)',
  );
  // Keep existing "Lomo de cerdo" untouched; note if present
  console.log(
    'Nota: "Lomo de cerdo" se deja como está; se agrega "Lomo ahumado" si faltaba.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
