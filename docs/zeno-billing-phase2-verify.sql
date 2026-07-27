-- Manual verification queries for Phase 2 billing (run on local/preview only).
-- These are documentation-as-tests; not applied automatically.

-- 1) Seed plan exists
select code, price_amount, price_currency, is_active
from public.plans
where code = 'menu_monthly';

-- 2) Authenticated user cannot update payments to completed
-- (expect permission denied / 0 rows as authenticated)
-- set role authenticated; -- use SQL editor with user JWT in practice
-- update public.payments set status = 'completed' where true;

-- 3) Idempotency unique key
select conname
from pg_constraint
where conrelid = 'public.payment_events'::regclass
  and contype = 'u';

-- 4) Legacy exempt marker present
select count(*) as exempt_count
from public.comercios
where billing_exempt = true;

-- 5) Service-role apply helpers exist
select proname
from pg_proc
where proname like 'apply_zeno_%'
   or proname like 'mark_subscriptions_%'
   or proname like 'suspend_subscriptions_%';
