-- Verify legacy exemption ended. Safe read-only checks + transactional guard.
begin;

do $$
declare
  v_exempt int;
  v_online_unpaid int;
begin
  select count(*) into v_exempt from public.comercios where billing_exempt = true;
  if v_exempt <> 0 then
    raise exception 'EXPECTED zero billing_exempt rows, got %', v_exempt;
  end if;

  select count(*) into v_online_unpaid
  from public.comercios c
  where c.en_linea = true
    and not exists (
      select 1 from public.subscriptions s
      where s.business_id = c.id and s.status = 'active'
    );
  if v_online_unpaid <> 0 then
    raise exception 'EXPECTED zero online unpaid commerces, got %', v_online_unpaid;
  end if;

  raise notice 'END_LEGACY_VERIFY_OK';
end $$;

rollback;
