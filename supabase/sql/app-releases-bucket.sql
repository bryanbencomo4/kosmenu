-- Android APK release distribution for the merchant app.
-- Apply once in production Supabase (SQL editor or CLI).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-releases',
  'app-releases',
  false,
  104857600, -- 100 MB
  array[
    'application/vnd.android.package-archive',
    'application/octet-stream',
    'application/json'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No public policies: only the service role (admin API) reads/writes.
drop policy if exists "app_releases_no_public_select" on storage.objects;
drop policy if exists "app_releases_no_public_insert" on storage.objects;
drop policy if exists "app_releases_no_public_update" on storage.objects;
drop policy if exists "app_releases_no_public_delete" on storage.objects;
