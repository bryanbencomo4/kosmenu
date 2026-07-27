# Zeno Bank billing (Phase 2) — local / preview only

## Scope

Self-service crypto checkout via Zeno Bank hosted pages (`pay.zenobank.io`).
Activation and renewal happen from signed webhooks — WhatsApp is support only.

**Not deployed to production in this phase.**

## Schema

Migrations:

- `supabase/migrations/20260727120000_zeno_billing_schema.sql`
- `supabase/migrations/20260727120100_zeno_billing_renewal_helpers.sql`

Tables: `plans`, `subscriptions`, `payments`, `payment_events`.

Publication flag remains `comercios.en_linea`.

Legacy: `comercios.billing_exempt = true` for rows present at migration time.
Those menus are **not** suspended for lacking a subscription. Later migration
can clear `billing_exempt` after merchants are notified.

## Edge Functions

| Function | JWT | Role |
|---|---|---|
| `create-zeno-checkout` | required | Authenticated owner; price from DB only |
| `zeno-webhook` | off | Svix signature; service role applies RPCs |

Shared code:

- `supabase/functions/_shared/payment-provider.ts`
- `supabase/functions/_shared/zeno-payment-provider.ts`

## Environment (Supabase secrets — never commit real values)

```env
ZENO_API_BASE_URL=https://api.zenobank.io/api/v1
ZENO_API_KEY=sk_...
ZENO_WEBHOOK_SECRET=whsec_...
ZENO_SUCCESS_REDIRECT_URL=https://app.elmenuxfa.com/payment/success
```

Also required (already present for Edge Functions):

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Set secrets locally / preview:

```bash
supabase secrets set ZENO_API_KEY=sk_... ZENO_WEBHOOK_SECRET=whsec_... ZENO_SUCCESS_REDIRECT_URL=https://app.elmenuxfa.com/payment/success
```

## Local apply (do not run against production)

```bash
# Prefer linked preview project
supabase db push   # or: supabase migration up --local

supabase functions serve create-zeno-checkout --env-file supabase/.env.local
supabase functions serve zeno-webhook --env-file supabase/.env.local
```

Deploy to **preview** only when ready (still not production):

```bash
supabase functions deploy create-zeno-checkout
supabase functions deploy zeno-webhook --no-verify-jwt
```

## Register webhook in Zeno Dashboard

1. Open https://dashboard.zenobank.io/developer
2. Add endpoint:
   `https://<project-ref>.supabase.co/functions/v1/zeno-webhook`
3. Subscribe to:
   - `checkout.completed`
   - `checkout.expired`
   - `checkout.partially_paid`
4. Copy Signing Secret (`whsec_...`) into Supabase secrets as `ZENO_WEBHOOK_SECRET`.

## Flutter

- Entry: Profile → **Plan y facturación**, Dashboard menu → same
- Routes: `/billing`, `/payment/success`
- Opens hosted `checkoutUrl` externally; no Zeno secrets in the app

## Renewal model

Zeno does not auto-debit wallets monthly. Scaffolding RPCs:

- `mark_subscriptions_past_due()`
- `suspend_subscriptions_after_grace()` — unpublishes only `billing_exempt = false`

Wire a cron / scheduled Edge Function in a later phase. Reminders (email/push) are out of scope here.

## Tests

```bash
# Deno unit tests (provider mapping / policies)
cd supabase/functions
deno test zeno-billing_test.ts

# Flutter unit tests
flutter test test/billing_service_test.dart
```

Manual checklist (preview):

- [ ] Create checkout as authenticated owner
- [ ] Sending `priceAmount` from Flutter is ignored (server uses plan row)
- [ ] Valid Svix webhook activates subscription + sets `en_linea=true`
- [ ] Invalid signature → 400
- [ ] Duplicate `svix-id` with `processed=true` → 200, no double renewal
- [ ] Duplicate `svix-id` with `processed=false` → reprocesses (failed attempt recovery)
- [ ] `checkout.expired` / `partially_paid` do not publish
- [ ] `paidAmount` < amount or wrong currency → processing error (no activate)
- [ ] Legacy `billing_exempt` commerce stays online without subscription
- [ ] RLS: user cannot select another owner's payments
- [ ] RLS: user cannot UPDATE subscription/payment to active/completed

## Rollback

1. Do not call suspend helpers in production until intentional.
2. Drop order (if fully reverting in a scratch DB):

```sql
drop function if exists public.suspend_subscriptions_after_grace(timestamptz);
drop function if exists public.mark_subscriptions_past_due(timestamptz);
drop function if exists public.apply_zeno_checkout_partially_paid(text, text, numeric);
drop function if exists public.apply_zeno_checkout_expired(text, text);
drop function if exists public.apply_zeno_checkout_completed(text, text, numeric, text, timestamptz);
drop table if exists public.payment_events;
drop table if exists public.payments;
drop table if exists public.subscriptions;
drop table if exists public.plans;
alter table public.comercios drop column if exists billing_exempt;
```

3. Remove Edge Functions from the project; unset Zeno secrets.
4. Existing `en_linea` values are left untouched by schema rollback (except if you had run suspend helper).

## Risks

- Webhook must be registered before real payments; otherwise paid checkouts won't activate.
- Partial payments credit Zeno balance but never auto-activate — ops process needed.
- Monthly renewal requires a new checkout + customer wallet approval each period.
- `billing_exempt` must be cleared deliberately before enforcing paywalls on legacy merchants.
