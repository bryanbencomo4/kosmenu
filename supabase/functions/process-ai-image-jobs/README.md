# process-ai-image-jobs

Edge Function worker para procesar en background la cola `public.ai_image_jobs`.

## Responsabilidad

La app cliente no procesa la cola.

El flujo correcto es:

1. Flutter crea el comercio/menu.
2. Flutter llama `generate-product-images-ai` para encolar jobs.
3. El backend dispara el worker y, en generación manual de un producto, espera a que termine para devolver `image_url`.
4. `pg_cron` vuelve a disparar el worker cada minuto como respaldo (timeout 120s).
5. Flutter muestra loading sobre la imagen y consulta estado hasta `completed` o `failed`.

## Seguridad

Esta function debe desplegarse con `--no-verify-jwt`, pero no es publica:

- exige el header interno `x-ai-image-worker-secret`
- el secreto vive en `public.internal_worker_secrets`
- solo backend/service role puede leerlo o disparar `trigger_ai_image_job_processing(...)`

## Creditos

Modelo actual:

- `generate-product-images-ai` reserva creditos al encolar
- `process-ai-image-jobs` no vuelve a debitar al completar
- si la generacion falla, el worker reembolsa ese credito y marca el job `failed`

Esto evita doble cobro y deja trazabilidad consistente por job.

## Deploy recomendado

```bash
supabase functions deploy process-ai-image-jobs --no-verify-jwt
supabase functions deploy generate-product-images-ai
```

## Invocacion interna

La function no debe invocarse desde Flutter.

Se dispara desde:

- `public.trigger_ai_image_job_processing(...)`
- cron `process-ai-image-jobs-every-minute`

## Estados esperados

- `pending`
- `processing`
- `completed`
- `failed`
