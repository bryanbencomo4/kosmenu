# Preview bootstrap (schema-only, secure-by-default)

```text
PREVIEW BOOTSTRAP ONLY
DO NOT APPLY TO PRODUCTION
```

| | Ref |
|---|---|
| **Allowed target** | `gsfxqzvmyzjjgpigrste` (`kosmenu-preview`) |
| **Forbidden** | `qqhberaayhohxlbbhdyi` (production) |

## Principle

Preview is empty. It must be born **already secure** — do **not** recreate public `USING true` / `WITH CHECK true` policies and then remove them.

Production still uses the additive → deploy → restrictive sequence. Preview does not.

## Apply order (only after human approval)

```bash
# Explicit Preview project — never use --linked unless project-ref is verified as Preview.
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/01-base-schema.sql
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/02-required-functions.sql
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/03-additive-security-structures.sql
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/04-safe-rls-and-grants.sql
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/05-private-storage.sql
# Seed only after Auth test user exists (see 06-preview-seed.sql header).
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/06-preview-seed.sql
# Add public-menu mirror fields + service-role-only sync manifest.
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/07-public-menu-sync.sql
# Add anon column grants and online-only commerce policy (menu tables only).
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/08-public-menu-api.sql
# Schedule the daily Production-public -> Preview menu sync after Vault secrets exist.
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/09-public-menu-sync-cron.sql
# Add Preview-only owner login reads and free, non-billing test plan.
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/10-preview-login-access.sql
# Add the minimal free Preview AI wallet used by the merchant dashboard.
npx supabase db query --project-ref gsfxqzvmyzjjgpigrste -f supabase/preview-bootstrap/11-preview-dashboard-ai-credits.sql
```

If `db query -f` is unavailable in your CLI version, pipe file contents with an explicit Preview connection (still never target production).

## Scripts

| File | Purpose |
|---|---|
| `01-base-schema.sql` | Extensions, enums, core + delivery + admin tables |
| `02-required-functions.sql` | Owner helpers + hardened delivery RPCs |
| `03-additive-security-structures.sql` | Tracking hash, idempotency, public views |
| `04-safe-rls-and-grants.sql` | Secure RLS + minimal grants (final state) |
| `05-private-storage.sql` | Private `comprobantes` bucket |
| `06-preview-seed.sql` | Synthetic test data only |

## Not included

- Auth users / passwords (create via Dashboard or Admin API)
- Production rows, Storage objects, Vault, Cron, Realtime pubs
- Insecure PUBLIC policies
- Emergency anon INSERT on `pedidos`

## Source of structure

Column shapes were inspected **read-only** from production metadata (`_meta_*.json`, gitignored). Policies and grants were **not** copied from production.
