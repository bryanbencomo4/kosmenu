-- LOCAL ONLY — do NOT apply remotely until Preview review.
-- Creates private Storage bucket `comprobantes` for payment proofs.
-- Uploads: Next.js /api/orders/comprobantes (service_role).
-- Reads: short-lived signed URLs via authenticated merchant endpoint.
-- No public SELECT/INSERT policies on this bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove any accidental public policies on this bucket (idempotent by name).
drop policy if exists "comprobantes public read" on storage.objects;
drop policy if exists "comprobantes anon upload" on storage.objects;
drop policy if exists "comprobantes public upload" on storage.objects;
drop policy if exists "Allow public uploads comprobantes" on storage.objects;

-- Intentionally no policies for anon/authenticated on storage.objects for this bucket.
-- service_role bypasses RLS for server uploads and signed URL generation.

-- Rollback contingency:
--   update storage.buckets set public = true where id = 'comprobantes';
--   (not recommended — prefer keeping private and fixing the app)
;