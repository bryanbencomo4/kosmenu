update public.productos
set imagen_url = regexp_replace(imagen_url, '^.*"publicUrl"\s*:\s*"([^"]+)".*$', '\1')
where coalesce(imagen_url, '') like '%publicUrl%';

update public.ai_image_jobs
set image_url = regexp_replace(image_url, '^.*"publicUrl"\s*:\s*"([^"]+)".*$', '\1')
where coalesce(image_url, '') like '%publicUrl%';