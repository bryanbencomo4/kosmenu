# notify-order

Supabase Edge Function that receives webhook payloads from `pedidos` inserts and status updates, then sends Firebase Cloud Messaging push notifications to the commerce owner and WhatsApp notifications to the customer.

## Expected webhook payload

The function accepts Supabase Database Webhook format (`record`) and direct record payloads.

Required values:
- `record.comercio_id` (or `comercio_id`)
- `record.id` and/or `record.detalles.order_id`

Supported events:
- `INSERT`: owner push notification + customer WhatsApp notification
- `UPDATE`: customer WhatsApp notification only when `estado` actually changes

## Required env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `WASENDER_API_KEY`
- Optional: `WASENDER_API_ENDPOINT`

Important:
- `FIREBASE_PRIVATE_KEY` must be stored in Supabase secrets and can include `\\n`; the function normalizes it to real line breaks.
- `WASENDER_API_KEY` must exist in Supabase secrets if you want WhatsApp notifications on status changes triggered from the mobile admin.

## Deploy

```bash
supabase functions deploy notify-order --no-verify-jwt
```

`--no-verify-jwt` is required when invoking this function from a Supabase Database Webhook.

Set secrets:

```bash
supabase secrets set \
  FIREBASE_PROJECT_ID=kosmenu-c0983 \
  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@kosmenu-c0983.iam.gserviceaccount.com \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
  WASENDER_API_KEY="your_wasender_key"
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

## WhatsApp payload sent to WASender

- Recipient: customer phone normalized to E.164
- Message: branded copy with business name, status-specific message, business URL, and direct tracking URL
