create table if not exists public.consumer_newsletter_subscribers (
  email text primary key,
  status text not null default 'active',
  source text not null default 'consumer-home-footer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_subscribed_at timestamptz not null default now(),
  constraint consumer_newsletter_subscribers_email_not_empty
    check (length(btrim(email)) > 3),
  constraint consumer_newsletter_subscribers_email_normalized
    check (email = lower(btrim(email))),
  constraint consumer_newsletter_subscribers_status_check
    check (status in ('active', 'unsubscribed'))
);

create or replace function public.set_consumer_newsletter_subscriber_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.status = 'active' then
    new.last_subscribed_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consumer_newsletter_subscriber_timestamps on public.consumer_newsletter_subscribers;
create trigger trg_consumer_newsletter_subscriber_timestamps
before update on public.consumer_newsletter_subscribers
for each row execute function public.set_consumer_newsletter_subscriber_timestamps();

alter table public.consumer_newsletter_subscribers enable row level security;

revoke all on public.consumer_newsletter_subscribers from anon, authenticated;
grant select, insert, update on public.consumer_newsletter_subscribers to service_role;