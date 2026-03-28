# process-menu-ia

Supabase Edge Function to:
1. Receive an uploaded image URL from bucket `menu-scans`.
2. Analyze menu content with OpenAI Vision (`gpt-4o`).
3. Persist parsed categories and products into `categorias` and `productos`.

## Expected POST body

```json
{
  "image_url": "https://.../menu-scans/<comercio_id>/<file>.jpg",
  "comercio_id": "1b920631-9aeb-43d2-9e0f-97fe5235693e"
}
```

## Required environment variables

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Local invoke example

```bash
supabase functions serve process-menu-ia --env-file supabase/.env.local

curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-menu-ia' \
  --header 'Content-Type: application/json' \
  --data '{
    "image_url": "https://your-project.supabase.co/storage/v1/object/public/menu-scans/1b920631-9aeb-43d2-9e0f-97fe5235693e/1743111111111.jpg",
    "comercio_id": "1b920631-9aeb-43d2-9e0f-97fe5235693e"
  }'
```
