-- PREVIEW BOOTSTRAP ONLY — DO NOT APPLY TO PRODUCTION without explicit auth
-- Opaque one-time handoff codes (WhatsApp → web assistants). Own table only.

create table if not exists public.wa_handoff_codes (
  code text primary key,
  destination text not null,
  payload_json jsonb not null default '{}'::jsonb,
  from_digits_hash text null,
  expires_at_ms bigint not null,
  consumed_at_ms bigint null,
  revoked_at_ms bigint null,
  created_at_ms bigint not null
);

create index if not exists wa_handoff_codes_expires_idx
  on public.wa_handoff_codes (expires_at_ms);

alter table public.wa_handoff_codes enable row level security;
grant select, insert, update on public.wa_handoff_codes to service_role;

create or replace function public.wa_handoff_redeem(
  p_code text,
  p_destination text,
  p_now_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.wa_handoff_codes%rowtype;
begin
  select * into r from public.wa_handoff_codes where code = p_code for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.revoked_at_ms is not null then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if r.consumed_at_ms is not null then
    return jsonb_build_object('ok', false, 'error', 'consumed');
  end if;
  if r.expires_at_ms <= p_now_ms then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if p_destination is not null and p_destination <> '' and r.destination <> p_destination then
    return jsonb_build_object('ok', false, 'error', 'destination_mismatch');
  end if;

  update public.wa_handoff_codes
  set consumed_at_ms = p_now_ms
  where code = p_code
    and consumed_at_ms is null
    and revoked_at_ms is null
    and expires_at_ms > p_now_ms;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'race');
  end if;

  select * into r from public.wa_handoff_codes where code = p_code;
  return jsonb_build_object(
    'ok', true,
    'code', r.code,
    'destination', r.destination,
    'payload_json', r.payload_json,
    'from_digits_hash', r.from_digits_hash,
    'expires_at_ms', r.expires_at_ms,
    'consumed_at_ms', r.consumed_at_ms,
    'revoked_at_ms', r.revoked_at_ms,
    'created_at_ms', r.created_at_ms
  );
end;
$$;

grant execute on function public.wa_handoff_redeem(text, text, bigint) to service_role;
