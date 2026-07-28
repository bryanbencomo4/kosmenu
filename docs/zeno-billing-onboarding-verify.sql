-- Transactional paywall verification. Ends with ROLLBACK.
-- Apply migration 20260727220000 first.
-- Uses an existing auth user as owner (FK), rolled back.

begin;

do $$
declare
  v_exempt_default text;
  v_online_default text;
  v_legacy int;
  v_id uuid;
  v_owner uuid;
begin
  select column_default into v_exempt_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'comercios' and column_name = 'billing_exempt';

  select column_default into v_online_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'comercios' and column_name = 'en_linea';

  if position('false' in coalesce(v_exempt_default, '')) = 0 then
    raise exception 'EXPECTED billing_exempt default false, got %', v_exempt_default;
  end if;
  if position('false' in coalesce(v_online_default, '')) = 0 then
    raise exception 'EXPECTED en_linea default false, got %', v_online_default;
  end if;

  select count(*) into v_legacy from public.comercios where billing_exempt = true;
  if v_legacy < 1 then
    raise exception 'EXPECTED at least one billing_exempt legacy commerce';
  end if;

  select id into v_owner from auth.users order by created_at desc limit 1;
  if v_owner is null then
    raise exception 'No auth.users available for FK owner_id';
  end if;

  -- Simulate authenticated client JWT role for trigger guards.
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.comercios (nombre, owner_id, onboarding_completed)
  values ('PAYWALL TEST TEMP', v_owner, true)
  returning id into v_id;

  if (select billing_exempt from public.comercios where id = v_id) is not false then
    raise exception 'NEW commerce must have billing_exempt=false';
  end if;
  if (select en_linea from public.comercios where id = v_id) is not false then
    raise exception 'NEW commerce must have en_linea=false';
  end if;

  begin
    update public.comercios set billing_exempt = true where id = v_id;
    raise exception 'EXPECTED billing_exempt update to fail';
  exception
    when others then
      if sqlstate = 'P0001' and sqlerrm like '%EXPECTED billing_exempt%' then
        raise;
      end if;
      if sqlerrm not like '%BILLING_EXEMPT%' and sqlerrm not like '%billing_exempt%' then
        raise;
      end if;
  end;

  begin
    update public.comercios set en_linea = true where id = v_id;
    raise exception 'EXPECTED en_linea=true without payment to fail';
  exception
    when others then
      if sqlstate = 'P0001' and sqlerrm like '%EXPECTED en_linea%' then
        raise;
      end if;
      if sqlerrm not like '%PAYMENT_REQUIRED%' and sqlerrm not like '%subscription%' then
        raise;
      end if;
  end;

  if (select en_linea from public.comercios where id = v_id) is not false then
    raise exception 'Commerce must remain offline after blocked publish';
  end if;

  if (select count(*) from public.comercios where billing_exempt = true) < v_legacy then
    raise exception 'Legacy exempt count must not decrease';
  end if;

  raise notice 'PAYWALL_VERIFY_OK legacy_exempt=% new_id=%', v_legacy, v_id;
end $$;

rollback;
