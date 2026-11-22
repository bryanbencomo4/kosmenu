/**
 * Isolated RLS proof for pedidos_emergency_anon_insert DROP.
 * Uses PGlite (in-process Postgres) — never touches production.
 *
 * Proves:
 * 1) With emergency policy → non-bypass role can insert.
 * 2) After DROP → that role is denied by RLS.
 * 3) BYPASSRLS role (service_role stand-in) can still insert.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'rls-isolated');
mkdirSync(outDir, { recursive: true });

const report = {
  mutatedProduction: false,
  engine: 'pglite',
  steps: [],
  ok: false,
};

function step(name, ok, detail) {
  report.steps.push({ name, ok: Boolean(ok), detail });
  console.log(`[rls-isolated] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
}

async function main() {
  const db = new PGlite();

  await db.exec(`
    create schema if not exists public;

    do $$ begin
      create role app_anon nologin nobypassrls;
    exception when duplicate_object then null;
    end $$;

    do $$ begin
      create role app_service nologin bypassrls;
    exception when duplicate_object then null;
    end $$;

    create table public.pedidos (
      id uuid primary key default gen_random_uuid(),
      comercio_id uuid not null,
      total numeric not null default 0,
      created_at timestamptz not null default now()
    );

    alter table public.pedidos enable row level security;
    alter table public.pedidos force row level security;

    grant select, insert on public.pedidos to app_anon;
    grant all on public.pedidos to app_service;

    -- Equivalent to pedidos_emergency_anon_insert (open INSERT)
    create policy pedidos_emergency_anon_insert
      on public.pedidos
      for insert
      to app_anon
      with check (true);

    create policy pedidos_owner_select
      on public.pedidos
      for select
      to app_anon
      using (true);
  `);

  await db.exec(`set role app_anon`);
  const before = await db.query(
    `insert into public.pedidos (comercio_id, total)
     values ('11111111-1111-4111-8111-111111111111', 1)
     returning id`,
  );
  step(
    'before_drop_insert_allowed',
    before.rows.length === 1,
    `inserted id=${before.rows[0]?.id}`,
  );
  await db.exec(`reset role`);

  const polBefore = await db.query(
    `select policyname from pg_policies
     where tablename='pedidos' and policyname='pedidos_emergency_anon_insert'`,
  );
  step(
    'policy_present_before',
    polBefore.rows.length === 1,
    `n=${polBefore.rows.length}`,
  );

  await db.exec(`
    begin;
    drop policy if exists pedidos_emergency_anon_insert on public.pedidos;
    revoke insert on table public.pedidos from app_anon;
    commit;
  `);

  const polAfter = await db.query(
    `select policyname from pg_policies
     where tablename='pedidos' and policyname='pedidos_emergency_anon_insert'`,
  );
  step(
    'policy_absent_after',
    polAfter.rows.length === 0,
    `n=${polAfter.rows.length}`,
  );

  // Re-grant table INSERT so failure is due to RLS (no policy), matching
  // "privilege may remain but RLS blocks" and "revoke" cases.
  await db.exec(`grant insert on public.pedidos to app_anon`);

  let anonBlocked = false;
  let anonErr = '';
  try {
    await db.exec(`set role app_anon`);
    await db.query(
      `insert into public.pedidos (comercio_id, total)
       values ('22222222-2222-4222-8222-222222222222', 2)
       returning id`,
    );
  } catch (e) {
    anonBlocked = true;
    anonErr = String(e?.message || e).slice(0, 240);
  } finally {
    try {
      await db.exec(`reset role`);
    } catch {
      /* ignore */
    }
  }
  step(
    'after_drop_insert_denied',
    anonBlocked,
    anonErr || 'unexpected success',
  );

  await db.exec(`set role app_service`);
  const svc = await db.query(
    `insert into public.pedidos (comercio_id, total)
     values ('33333333-3333-4333-8333-333333333333', 12.25)
     returning id, total`,
  );
  await db.exec(`reset role`);
  step(
    'service_bypass_insert_ok',
    svc.rows.length === 1 && Number(svc.rows[0].total) === 12.25,
    `id=${svc.rows[0]?.id} total=${svc.rows[0]?.total}`,
  );

  const ownerPol = await db.query(
    `select policyname from pg_policies
     where tablename='pedidos' and policyname='pedidos_owner_select'`,
  );
  step(
    'owner_select_policy_kept',
    ownerPol.rows.length === 1,
    `n=${ownerPol.rows.length}`,
  );

  report.ok = report.steps.every((s) => s.ok);
  report.conclusion = report.ok
    ? 'DROP removes open INSERT for anon-like role; service_role-style BYPASSRLS still inserts.'
    : 'Isolated proof failed — do not apply to production.';
  report.productionImpact =
    'POST /api/orders uses service_role (BYPASSRLS). Traditional checkout does not depend on pedidos_emergency_anon_insert.';
  report.applySql =
    'supabase/sql/apply-drop-pedidos-emergency-anon-insert.sql';
  report.rollback =
    'create policy pedidos_emergency_anon_insert on public.pedidos for insert to anon, authenticated with check (true); grant insert on public.pedidos to anon, authenticated;';

  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, out: join(outDir, 'report.json') }));
  await db.close();
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
