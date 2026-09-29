# notify-order

Supabase Edge Function that receives webhook payloads from `pedidos` inserts and status updates, then sends Firebase Cloud Messaging push notifications to the commerce owner and merchant-side WhatsApp notifications when applicable. Customer communication starts from the checkout through a `wa.me` link.

## Expected webhook payload

The function accepts Supabase Database Webhook format (`record`) and direct record payloads.

Required values:
- `record.comercio_id` (or `comercio_id`)
- `record.id` and/or `record.detalles.order_id`

Supported events:
- `INSERT`: owner push notification + merchant WhatsApp to `comercios.whatsapp`
- `UPDATE`: no customer WhatsApp notification is sent when `estado` changes

## Required env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
Important:
- `FIREBASE_PRIVATE_KEY` must be stored in Supabase secrets and can include `\\n`; the function normalizes it to real line breaks.

## Deploy

`supabase/config.toml` sets `verify_jwt = false` for this function. The `pedidos` trigger posts through `pg_net` without an Authorization header, so JWT verification at the gateway would drop every WhatsApp and push notification.

```bash
supabase functions deploy notify-order --no-verify-jwt
```

Set Firebase secrets:

```bash
supabase secrets set \
  FIREBASE_PROJECT_ID=kosmenu-c0983 \
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@kosmenu-c0983.iam.gserviceaccount.com \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Database setup

Run:

```sql
-- supabase/sql/notify_order_setup.sql
```

## Configure Database Webhook (Supabase Dashboard)

1. Go to `Database` > `Webhooks` > `Create a new webhook`.
2. Name: `notify-order-events`.
3. Table: `pedidos`.
4. Events: `INSERT` and `UPDATE`.
5. URL: `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/notify-order`.
6. HTTP Method: `POST`.
7. Keep default payload (`record` included).
8. Add auth header if your project enforces JWT on function calls:
   - `Authorization: Bearer <SUPABASE_ANON_KEY>`
   - `apikey: <SUPABASE_ANON_KEY>`

## Notification payload sent to FCM

- Title: `💰 ¡Nuevo Pedido!`
- Body: `Has recibido un nuevo pedido en tu comercio.`
- Android sound: `cash_register`
- iOS sound: `cash_register.aiff`
- Data: `{ "orderId": "<detalles.order_id or pedido.id>" }`

## Customer WhatsApp flow

After the order is persisted, the public checkout opens `https://wa.me/<restaurant-number>?text=...`. This universal link opens the WhatsApp app on iOS and Android when available, or falls back to WhatsApp Web. Customer delivery-status messages are not queued through WASENDER.
