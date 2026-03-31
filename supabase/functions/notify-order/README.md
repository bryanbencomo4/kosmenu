# notify-order

Supabase Edge Function that receives a webhook payload from new `pedidos` inserts and sends Firebase Cloud Messaging push notifications to the commerce owner.

## Expected webhook payload

The function accepts Supabase Database Webhook format (`record`) and direct record payloads.

Required values:
- `record.comercio_id` (or `comercio_id`)
- `record.id` and/or `record.detalles.order_id`

## Required env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Important:
- `FIREBASE_PRIVATE_KEY` must be stored in Supabase secrets and can include `\\n`; the function normalizes it to real line breaks.

## Deploy

```bash
supabase functions deploy notify-order
```

Set secrets:

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
2. Name: `notify-order-on-insert`.
3. Table: `pedidos`.
4. Events: `INSERT` only.
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
