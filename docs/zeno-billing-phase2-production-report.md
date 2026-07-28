# FASE 2 — RESULTADO PRODUCCIÓN (parcial — listo para pago smoke)

```text
FASE 2 — RESULTADO PRODUCCIÓN

Fecha y hora: 2026-07-27 ~20:52 UTC
Commit SHA: ba33c21912d60062dc1ddd6ff578a261ded968b1
Tag: zeno-billing-pre-production-2026-07-27
Production project ref: qqhberaayhohxlbbhdyi (kosmenú)
Preview ref (no usado): gsfxqzvmyzjjgpigrste

Deploy landing: YES — elmenuxfa.com
Deploy Flutter: YES — app.elmenuxfa.com
Deploy create-zeno-checkout: YES (JWT on; unauth → 401)
Deploy zeno-webhook: YES (--no-verify-jwt; firma inválida → 400 Svix)

Backup:
- ruta: backups/prod-zeno-pre-2026-07-27T20-19-20-443Z/ (gitignored)
- comercios legacy: 3 online, 3 billing_exempt

Migraciones:
- aplicadas: 20260727120000 + 20260727120100
- plan: menu_monthly = 10.00 USD active
- cron suspensión: no activo

Secretos (dashboard Edge Functions → Secrets, 2026-07-27 ~20:42 UTC):
- ZENO_API_BASE_URL: sí
- ZENO_SUCCESS_REDIRECT_URL: sí
- ZENO_API_KEY: sí
- ZENO_WEBHOOK_SECRET: sí
- valores expuestos: no

Webhook Zeno producción:
- endpoint requerido:
  https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/zeno-webhook
- eventos: checkout.completed, checkout.expired, checkout.partially_paid
- registro endpoint en Zeno Developers: CONFIRMAR OPERADOR
- firma inválida post-secretos: 400 (Svix) — secreto cargado

Smoke checkout (SIN PAGO):
- comercio: SMOKE ZENO PROD 2026-07-27
- business_id: 9a844710-eba4-443f-8879-8646d9665637
- en_linea=false, billing_exempt=false
- create-zeno-checkout #1: HTTP 200, reused=false
- create-zeno-checkout #2: HTTP 200, reused=true (mismo checkoutId)
- precio DB: 10.00 USD (client priceAmount/amount ignorados)
- payment=open, subscription=pending, open_count=1
- host: pay.zenobank.io
- checkout: https://pay.zenobank.io/ch_K1uIfqJUygXCmlFer
- expires_at: 2026-07-27T21:52:05Z
- legacy 3/3 unchanged (en_linea + billing_exempt)

Legacy:
- 3 comercios, 3 online, 3 billing_exempt — sin cambios tras smoke

Próximo paso:
1. Confirmar endpoint webhook PROD registrado en Zeno (distinto al preview).
2. Operador paga USD 10 desde wallet en el checkout smoke.
3. Validar webhook checkout.completed → smoke en_linea=true, subscription=active.
4. Replay idempotencia + regresión legacy → GO/NO-GO final.

DECISIÓN: NO-GO (parcial)
  Secretos + smoke checkout OK. Falta pago real + webhook completed + idempotencia.
```

## Acción requerida del operador

1. En Zeno Developers, verificar endpoint **producción** (no preview):

```text
https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/zeno-webhook
```

2. Pagar el checkout smoke (expira ~21:52 UTC):

```text
https://pay.zenobank.io/ch_K1uIfqJUygXCmlFer
```

3. Avisar a Cursor cuando el pago esté firmado/confirmado para validar webhook + idempotencia.
