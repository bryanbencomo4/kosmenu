create or replace function public.subscribe_consumer_newsletter(
  p_email text,
  p_source text default 'consumer-home-footer',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_source text;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  v_source := nullif(btrim(coalesce(p_source, '')), '');

  if v_email = '' then
    raise exception 'EMAIL_REQUIRED' using errcode = '22023';
  end if;

  insert into public.consumer_newsletter_subscribers (
    email,
    source,
    status,
    metadata
  )
  values (
    v_email,
    coalesce(v_source, 'consumer-home-footer'),
    'active',
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (email) do update
  set
    source = excluded.source,
    status = 'active',
    metadata = coalesce(public.consumer_newsletter_subscribers.metadata, '{}'::jsonb)
      || coalesce(excluded.metadata, '{}'::jsonb);
end;
$$;

revoke all on function public.subscribe_consumer_newsletter(text, text, jsonb) from public;
grant execute on function public.subscribe_consumer_newsletter(text, text, jsonb) to anon, authenticated, service_role;