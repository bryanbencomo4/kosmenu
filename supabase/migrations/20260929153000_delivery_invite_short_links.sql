create table if not exists public.delivery_invite_short_links (
  code text primary key,
  invitation_id uuid not null references public.delivery_invitations(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint delivery_invite_short_links_code_format check (code ~ '^[A-Za-z0-9_-]{10}$'),
  constraint delivery_invite_short_links_invitation_uidx unique (invitation_id)
);

alter table public.delivery_invite_short_links enable row level security;

comment on table public.delivery_invite_short_links is
  'Opaque short links for delivery invitations. Service role only.';
