-- PREVIEW BOOTSTRAP ONLY
-- DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove any public/open policies on this bucket if recreated by tooling
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        qual ilike '%comprobantes%'
        or with_check ilike '%comprobantes%'
        or policyname ilike '%comprobante%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- No anon/authenticated storage policies for comprobantes.
-- Uploads and signed URLs go through Next.js service_role only.
