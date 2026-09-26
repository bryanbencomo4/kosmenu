-- PREVIEW BOOTSTRAP ONLY
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
-- Minimal AI credit wallet needed by the merchant dashboard in Preview.
-- Credits created here are free Preview test credits; no Production values copied.

create table if not exists public.ai_credits_wallet (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null unique references public.comercios(id) on delete cascade,
  credits_balance numeric not null default 0,
  credits_used numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_credits_transactions (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null references public.comercios(id) on delete cascade,
  type text not null check (type in ('credit', 'debit')),
  amount numeric not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_credits_wallet enable row level security;
alter table public.ai_credits_wallet force row level security;
alter table public.ai_credits_transactions enable row level security;
alter table public.ai_credits_transactions force row level security;
revoke all on public.ai_credits_wallet from public, anon, authenticated;
revoke all on public.ai_credits_transactions from public, anon, authenticated;
grant all on public.ai_credits_wallet to service_role;
grant all on public.ai_credits_transactions to service_role;

create or replace function public.ensure_ai_credits_wallet(
  p_commerce_id uuid,
  p_initial_credits numeric default 30
)
returns public.ai_credits_wallet
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_credits_wallet;
  v_initial numeric := greatest(coalesce(p_initial_credits, 0), 0);
begin
  insert into public.ai_credits_wallet (commerce_id, credits_balance, credits_used)
  values (p_commerce_id, v_initial, 0)
  on conflict (commerce_id) do nothing;

  if found and v_initial > 0 then
    insert into public.ai_credits_transactions (
      commerce_id, type, amount, reason, metadata
    ) values (
      p_commerce_id,
      'credit',
      v_initial,
      'preview_test_credits',
      jsonb_build_object('source', 'preview_dashboard')
    );
  end if;

  select * into v_row
  from public.ai_credits_wallet
  where commerce_id = p_commerce_id;

  if not found then
    raise exception 'Could not ensure Preview AI credits wallet';
  end if;
  return v_row;
end;
$$;

revoke all on function public.ensure_ai_credits_wallet(uuid, numeric) from public, anon, authenticated;
grant execute on function public.ensure_ai_credits_wallet(uuid, numeric) to service_role;