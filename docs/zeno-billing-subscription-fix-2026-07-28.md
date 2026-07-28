# Suscripción / webhook — fix 2026-07-28

## Causa
Zeno confirmó el pago en su UI y redirigió a `/payment/success`, pero **ningún webhook** llegó a producción (`payment_events` vacío). El pago quedó `open` y la suscripción `pending`. La app mostraba “éxito” solo por el redirect.

## donde-vladi (reparado)
- payment=`completed` (USD 10)
- subscription=`active` hasta 2026-08-28
- `en_linea=true`
- `billing_exempt=false`

## Fix permanente
1. Edge Function `reconcile-zeno-checkout` — consulta Zeno API y aplica `apply_zeno_checkout_completed` si el checkout está COMPLETED.
2. Flutter: success/pending/dashboard/AuthGate llaman reconcile; **no** muestran “Menú publicado” hasta `subscription=active`.
3. Deploy app: `dpl_AA8nkVtwNpg2Kv5adno2Up39TMxd` → app.elmenuxfa.com

## Acción operador (webhook)
Registrar/verificar endpoint PROD en Zeno (distinto al preview):
`https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/zeno-webhook`
Eventos: checkout.completed, checkout.expired, checkout.partially_paid
Whsec de producción (no reutilizar preview).

La reconciliación cubre webhooks faltantes; el webhook sigue siendo el camino principal.
