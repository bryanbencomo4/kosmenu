# Cutover runbook — READY (awaiting literal approval)

**Status:** Prepared. **Production NOT started.**  
**Hard stop until message:** `Apruebo ejecutar la ventana de producción`

## Freeze map

| Item | Value |
|------|-------|
| Branch | `security/phase-2a-preview` |
| Flutter CI SHA (artifact) | `edb88b0f0344b93dc832d7ed0b755365be66adee` |
| CI run | https://github.com/bryanbencomo4/kosmenu/actions/runs/29853120445 |
| Docs HEAD | `afbbbaf` (docs-only after freeze; no app code drift) |
| Preview Supabase | `gsfxqzvmyzjjgpigrste` |
| Prod Supabase | `qqhberaayhohxlbbhdyi` (forbidden until approval) |
| Apex | `https://elmenuxfa.com` |

After freeze, only `docs/RELEASE_GATE_FREEZE.md` changed → app freeze remains `edb88b0`.

## Migration plan (production order)

### Additive (compatible with previous app)

Apply from `supabase/migrations/` in timestamp order:

1. `20260718190000_pedido_public_tracking_token.sql`
2. `20260718194000_order_idempotency_keys.sql`
3. `20260718193100_private_comprobantes_bucket.sql`
4. `20260718194300_public_menu_column_guard_views.sql`

Also ensure any missing helpers from Preview bootstrap exist (functions referenced by policies) — verify against prod before apply.

### Restrictive (same window, AFTER compatible deploy is live but BEFORE apex promote)

5. `20260718194100_harden_log_delivery_invitation_event.sql`
6. `20260718193200_harden_security_definer_execute.sql`
7. `20260718193000_sanitize_rls_and_grants.sql` (FORCE RLS pedidos, revoke anon, owner policies)
8. Storage policies from `supabase/sql/proposed-storage-comprobantes-policies.sql` if not already covered by `20260718193100_*`

Reference: `supabase/sql/preview-apply-order.md` Phase 3.

## Backup commands (run only after approval)

```powershell
# Link CLI to PRODUCTION only after approval — never confuse with Preview
npx supabase link --project-ref qqhberaayhohxlbbhdyi

# Dump
npx supabase db dump --linked -f backups/prod-$(Get-Date -Format yyyyMMdd-HHmmss).sql

# Schema-only + roles if available
npx supabase db dump --linked --schema-only -f backups/prod-schema-$(Get-Date -Format yyyyMMdd-HHmmss).sql
```

Also export via SQL (save outputs under `backups/`):

```sql
select * from pg_policies where schemaname in ('public','storage');
select id, name, public from storage.buckets;
select polname, polcmd from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='pedidos';
select relname, relrowsecurity, relforcerowsecurity from pg_class where relname='pedidos';
```

**Gate:** abort if dump file missing or size ~0.

## Vercel deploy (controlled — no apex until step 4)

```powershell
# After approval: deploy production SHA without promoting domain alias until RLS done
# Prefer Vercel dashboard promote, or:
npx vercel deploy --prod --prebuilt   # only if build matches freeze SHA
# Keep apex on previous deployment until restrictive smoke passes
```

Flutter production build (explicit defines — no defaults):

```text
flutter build web --release \
  --dart-define=API_BASE_URL=https://elmenuxfa.com \
  --dart-define=SUPABASE_URL=https://qqhberaayhohxlbbhdyi.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<PROD_ANON>
```

Scan artifact: must contain prod ref; must NOT contain Preview ref or `service_role`.

## Rollback

1. **Vercel:** Instant Rollback to previous Production deployment.
2. **DB restrictive:** restore policies from backup dump / re-apply previous policy snapshot (prefer not re-adding `USING true`).
3. **Keep additive columns/tables** if backward compatible.
4. Abort criteria: cross-tenant, public comprobante, wrong project ref, order outage, sustained 5xx.

## Env checklist (prod)

- [ ] `NEXT_PUBLIC_SUPABASE_URL` = prod
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = prod anon
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = prod service (server only)
- [ ] `NEXT_PUBLIC_SITE_URL` / `SITE_URL` = `https://elmenuxfa.com`
- [ ] No Preview refs in Production env
- [ ] Resend / WhatsApp as needed for prod only

## SEO after promote

- [ ] No `noindex` / `X-Robots-Tag: noindex`
- [ ] `robots.txt` allows `/` (not Disallow all)
- [ ] sitemap non-empty
- [ ] www → apex 308

## Smoke prod (after promote)

Landing, menu, order+idempotency, tracking ±token, comprobante upload+signed URL ±cross-tenant, merchant status, headers, rate limit.
