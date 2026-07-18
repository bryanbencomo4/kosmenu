-- PROPOSAL ONLY — review after RLS verification results. Do NOT apply blindly.
-- Goal: private `comprobantes` bucket + no anon enumeration + signed URL reads.

-- 1) Harden bucket
update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'comprobantes';

-- 2) Drop permissive legacy policies (names may differ — verify with RLS SQL first)
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname = 'storage' and tablename = 'objects';

-- drop policy if exists "Public Access" on storage.objects;
-- drop policy if exists "comprobantes public read" on storage.objects;
-- drop policy if exists "comprobantes anon upload" on storage.objects;
-- drop policy if exists "Allow public uploads" on storage.objects;
-- drop policy if exists "Allow public read" on storage.objects;

-- 3) No anon/authenticated direct object access.
-- Uploads go through Next.js /api/orders/comprobantes (service role).
-- Reads go through createSignedUrl from privileged server paths (merchant/admin).

-- Optional: if you must allow authenticated merchant reads via Storage API,
-- scope by folder = comercio_id and membership (example — adjust to your membership table):
--
-- create policy "comprobantes_merchant_select"
-- on storage.objects for select to authenticated
-- using (
--   bucket_id = 'comprobantes'
--   and (storage.foldername(name))[1] in (
--     select c.id::text from public.comercios c
--     where c.owner_user_id = auth.uid()  -- REPLACE with real membership relation
--   )
-- );

-- 4) After apply: existing public URLs stop working; clients must use storage refs
--    (`storage://comprobantes/...`) + signed URLs.
