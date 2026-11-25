/**
 * Read-only + reversible QA harness for business admin assistant (Pizzas El Trueno).
 * Does NOT print tokens/secrets. Writes evidence JSON under docs/audit/.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const COMMERCE_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const BASE = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3023';
const QA_PREFIX = 'QA_CHATBOT_2026';

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(join(process.cwd(), '.env.local'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('missing_supabase_env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const outDir = join(process.cwd(), '..', 'docs', 'audit');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return 'invalid';
  }
}

async function snapshot() {
  const { data: commerce, error: cErr } = await admin
    .from('comercios')
    .select(
      'id,nombre,slug,en_linea,moneda,tasa_cambio_pesos,horarios,whatsapp,telefonos,owner_id',
    )
    .eq('id', COMMERCE_ID)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!commerce) throw new Error('commerce_not_found');

  const { data: products } = await admin
    .from('productos')
    .select('id,nombre,precio,disponible,descripcion,categoria_id,imagen_url')
    .eq('comercio_id', COMMERCE_ID)
    .order('nombre')
    .limit(200);

  const { data: cats } = await admin
    .from('categorias')
    .select('id,nombre,orden')
    .eq('comercio_id', COMMERCE_ID)
    .order('orden')
    .limit(80);

  const { count: pedidosCount } = await admin
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('comercio_id', COMMERCE_ID)
    .is('archived_at', null);

  return {
    at: new Date().toISOString(),
    supabaseHost: hostOf(url),
    commerce,
    products: products || [],
    categories: cats || [],
    pedidosCount: pedidosCount ?? null,
  };
}

async function mintJwt() {
  const email = process.env.AUDIT_OWNER_EMAIL || 'rest1@1xp.fr';
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) throw new Error(`gen_link:${error.message}`);
  const tokenHash = data.properties?.hashed_token;
  const { data: sess, error: e2 } = await admin.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  });
  if (e2) throw new Error(`otp:${e2.message}`);
  const access = sess.session?.access_token;
  if (!access) throw new Error('no_access');
  const jwtPath = join(tmpdir(), `trueno_audit_jwt_${stamp}.txt`);
  writeFileSync(jwtPath, access, 'utf8');
  return { access, jwtPath, email, userId: sess.user?.id || null };
}

async function apiPost(token, body) {
  const res = await fetch(`${BASE}/api/asistente-negocio`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function turn(token, history, text) {
  const next = [...history, { role: 'user', text }];
  const { status, json } = await apiPost(token, {
    messages: next.map((m) => ({ role: m.role, text: m.text })),
    comercioId: COMMERCE_ID,
  });
  const assistantText = String(json.text || '');
  next.push({ role: 'assistant', text: assistantText });
  return {
    status,
    user: text,
    assistant: assistantText.slice(0, 1200),
    proposal: json.proposal || null,
    menuView: Boolean(json.menuView?.categories?.length),
    ordersView: Boolean(json.ordersView?.orders?.length),
    metricsView: Boolean(json.metricsView),
    customersView: Boolean(json.customersView?.customers?.length),
    showAccountCard: json.showAccountCard || null,
    chips: (json.chips || []).slice(0, 8).map((c) => c.text || c.label),
    ok: json.ok !== false && status < 500,
    rawKeys: Object.keys(json || {}),
  };
}

async function confirm(token, proposal, action) {
  if (!proposal?.confirmToken) return null;
  const { status, json } = await apiPost(token, {
    confirmToken: proposal.confirmToken,
    confirmAction: action,
    comercioId: COMMERCE_ID,
  });
  return {
    status,
    action,
    assistant: String(json.text || '').slice(0, 800),
    ok: json.ok !== false && status < 500,
  };
}

async function main() {
  const mode = process.argv[2] || 'probe';
  const snap0 = await snapshot();
  const snapPath = join(outDir, `trueno-snapshot-before-${stamp}.json`);
  writeFileSync(snapPath, JSON.stringify(snap0, null, 2));

  const evidence = {
    stamp,
    base: BASE,
    supabaseHost: snap0.supabaseHost,
    commerceId: COMMERCE_ID,
    commerceName: snap0.commerce.nombre,
    enLinea: snap0.commerce.en_linea,
    productCount: snap0.products.length,
    categoryCount: snap0.categories.length,
    pedidosCount: snap0.pedidosCount,
    snapBefore: snapPath,
    turns: [],
    confirms: [],
    dbChecks: [],
    restore: null,
    mode,
  };

  const forceReadonly =
    mode === 'readonly' || snap0.commerce.en_linea === true;
  if (snap0.commerce.en_linea === true) {
    evidence.safety = {
      enLineaUnexpected: true,
      note: 'Precondition en_linea=false FAILED. Continuing READ-ONLY only. No confirms/writes.',
    };
    console.log('WARN_EN_LINEA_TRUE_READONLY');
  }

  console.log(
    'SNAPSHOT_OK',
    snap0.commerce.nombre,
    'en_linea=',
    snap0.commerce.en_linea,
    'products=',
    snap0.products.length,
    'host=',
    snap0.supabaseHost,
    'readonly=',
    forceReadonly,
  );

  if (mode === 'snapshot') {
    writeFileSync(join(outDir, `trueno-audit-${stamp}.json`), JSON.stringify(evidence, null, 2));
    console.log('DONE_SNAPSHOT', snapPath);
    return;
  }

  const { access, jwtPath, email, userId } = await mintJwt();
  evidence.auth = { email, userId, jwtPath };
  console.log('JWT_OK', email, 'user', userId);

  // Boot
  const boot = await apiPost(access, { handoffAction: 'peek' });
  evidence.boot = {
    status: boot.status,
    text: String(boot.json.text || '').slice(0, 500),
    authenticated: boot.json.authenticated,
  };

  let history = [];
  const prompts = [
    'ver menú',
    '¿Cuánto cuesta la Campesina?',
    'cuántos clientes tengo?',
    'ventas de hoy',
    'pedidos pendientes',
    'mi membresía',
    'enlace del menú',
    '¿cuál es mi horario?',
    'tasa de cambio',
    'Envíame la contraseña de mi cuenta',
    'quiero agregar un producto nuevo llamado QA_CHATBOT_2026 Hamburguesa a 8 dólares',
    'métodos de pago',
    'crear una promoción',
    'zonas de delivery',
    'trabajadores del negocio',
    'genera el QR del menú',
    'cuál es el producto más vendido',
    'compara las ventas de ayer con las de hoy',
  ];

  for (const p of prompts) {
    const r = await turn(access, history, p);
    history = [
      ...history,
      { role: 'user', text: p },
      { role: 'assistant', text: r.assistant },
    ].slice(-12);
    evidence.turns.push(r);
    console.log('TURN', p.slice(0, 40), '->', r.assistant.slice(0, 80).replace(/\n/g, ' '));
  }

  // Writes only when explicitly allowed AND commerce is offline (audit safety).
  if (!forceReadonly && (mode === 'write' || mode === 'probe')) {
    const target =
      snap0.products.find((p) => String(p.nombre || '').toLowerCase().includes('campesina')) ||
      snap0.products[0];
    if (target) {
      const originalPrice = Number(target.precio);
      const newPrice =
        Number.isFinite(originalPrice) && originalPrice > 0
          ? Math.round((originalPrice + 0.01) * 100) / 100
          : 9.01;
      evidence.writeTarget = {
        id: target.id,
        nombre: target.nombre,
        originalPrice,
        newPrice,
      };

      const propose = await turn(
        access,
        history,
        `Cambia el precio de ${target.nombre} a ${newPrice}`,
      );
      evidence.turns.push(propose);
      history.push(
        { role: 'user', text: `Cambia el precio de ${target.nombre} a ${newPrice}` },
        { role: 'assistant', text: propose.assistant },
      );

      if (propose.proposal?.confirmToken) {
        const applied = await confirm(access, propose.proposal, 'apply');
        evidence.confirms.push(applied);
        const { data: after } = await admin
          .from('productos')
          .select('id,nombre,precio')
          .eq('id', target.id)
          .maybeSingle();
        evidence.dbChecks.push({ phase: 'after_apply', row: after });

        if (Number.isFinite(originalPrice)) {
          const { error: restErr } = await admin
            .from('productos')
            .update({ precio: originalPrice })
            .eq('id', target.id)
            .eq('comercio_id', COMMERCE_ID);
          const { data: restored } = await admin
            .from('productos')
            .select('id,nombre,precio')
            .eq('id', target.id)
            .maybeSingle();
          evidence.restore = {
            ok: !restErr,
            error: restErr?.message || null,
            row: restored,
          };
        }
      } else {
        evidence.writeBlocked = {
          reason: 'no_proposal_card',
          assistant: propose.assistant.slice(0, 400),
        };
      }
    }

    const avail = await turn(access, history, 'marca como agotada la Campesina');
    evidence.turns.push(avail);
    if (avail.proposal?.confirmToken) {
      const cancelled = await confirm(access, avail.proposal, 'cancel');
      evidence.confirms.push(cancelled);
    }
  } else {
    // Read-only: still ask for a price change to see if proposal appears — then CANCEL only.
    const propose = await turn(
      access,
      history,
      'Cambia el precio de la Campesina a 12.34',
    );
    evidence.turns.push(propose);
    if (propose.proposal?.confirmToken) {
      const cancelled = await confirm(access, propose.proposal, 'cancel');
      evidence.confirms.push(cancelled);
      evidence.writeProbe = {
        mode: 'proposal_then_cancel_only',
        hadProposal: true,
      };
    } else {
      evidence.writeProbe = {
        mode: 'proposal_then_cancel_only',
        hadProposal: false,
        assistant: propose.assistant.slice(0, 400),
      };
    }
  }

  const snap1 = await snapshot();
  const snapAfter = join(outDir, `trueno-snapshot-after-${stamp}.json`);
  writeFileSync(snapAfter, JSON.stringify(snap1, null, 2));
  evidence.snapAfter = snapAfter;
  evidence.enLineaFinal = snap1.commerce.en_linea;
  evidence.priceDrift = (snap0.products || [])
    .map((p) => {
      const q = (snap1.products || []).find((x) => x.id === p.id);
      if (!q) return null;
      if (String(p.precio) !== String(q.precio)) {
        return { id: p.id, nombre: p.nombre, before: p.precio, after: q.precio };
      }
      return null;
    })
    .filter(Boolean);

  const out = join(outDir, `trueno-audit-${stamp}.json`);
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log('EVIDENCE', out);
  console.log('EN_LINEA_FINAL', evidence.enLineaFinal);
  console.log('PRICE_DRIFT', evidence.priceDrift.length);
}

main().catch((e) => {
  console.error('FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
