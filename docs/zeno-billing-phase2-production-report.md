# FASE 2 — RESULTADO PRODUCCIÓN (parcial — detenido por secretos Zeno)

```text
FASE 2 — RESULTADO PRODUCCIÓN

Fecha y hora: 2026-07-27 ~20:34 UTC
Commit SHA: ba33c21912d60062dc1ddd6ff578a261ded968b1
Tag: zeno-billing-pre-production-2026-07-27
Production project ref: qqhberaayhohxlbbhdyi (kosmenú)
Preview ref (no usado): gsfxqzvmyzjjgpigrste

Deploy landing: YES — dpl_Aaw1KBujMuDioYm3uJCPaFHvN5xd → elmenuxfa.com
Deploy Flutter: YES — dpl_6kYaTtLpB77WF7g9vEBhPRSHd2dm → app.elmenuxfa.com
  (SPA rewrites; /billing y /payment/success → HTTP 200)
Deploy create-zeno-checkout: YES ACTIVE v1 (JWT on; unauth → 401)
Deploy zeno-webhook: YES ACTIVE v1 (--no-verify-jwt)

Backup:
- ruta: backups/prod-zeno-pre-2026-07-27T20-19-20-443Z/ (gitignored)
- checksum comercios_snapshot: c3d0547b7ba5138d3feea2384d73207ed4733c1b94f0d267bdce4a27675fc986
- comercios antes: 3
- online antes: 3

Pruebas:
- Flutter billing: PASS 7/7
- Deno billing: PASS 8/8
- Build Flutter web: PASS (artifact scan: prod ref sí; preview/service_role/zeno secrets no)
- flutter test full suite: 6 fails preexistentes (faltan dart-defines API_BASE_URL en tests)
- Build landing: PASS (tsc + vercel)

Migraciones:
- aplicadas: 20260727120000 + 20260727120100 (solo esas, via db query --linked)
- RLS: policies creadas (plans/subscriptions/payments)
- RPCs: apply_zeno_* + mark/suspend helpers
- plan: menu_monthly = 10.00 USD active
- billing_exempt: 3/3 true
- en_linea fingerprint ANTES=DESPUÉS: 6bd6d2735ee33ef4c7687b163755bda2 (cero cambios)
- cron suspensión: no activo

Secretos:
- ZENO_API_BASE_URL: sí (público)
- ZENO_SUCCESS_REDIRECT_URL: sí (https://app.elmenuxfa.com/payment/success)
- ZENO_API_KEY: NO
- ZENO_WEBHOOK_SECRET: NO
- valores expuestos: no

Webhook Zeno producción:
- endpoint requerido:
  https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/zeno-webhook
- eventos: checkout.completed, checkout.expired, checkout.partially_paid
- firma real / completed / replay: PENDIENTE (falta registrar endpoint + whsec)

Prueba completa (registro→pago): DETENIDA
  Motivo: sin ZENO_API_KEY / ZENO_WEBHOOK_SECRET de producción.
  create-zeno-checkout devolvería error de configuración.
  zeno-webhook responde 500 "ZENO_WEBHOOK_SECRET is not configured" ante firma inválida
  (correcto hasta cargar secreto).

Legacy:
- 3 comercios, 3 online, 3 billing_exempt
- sin cambios en en_linea

Incidencias:
1. DETENER aquí hasta que el operador registre webhook PROD en Zeno (endpoint distinto al preview)
   y cargue secretos vía --env-file (nunca en chat).
2. Preview debe conservar su endpoint/whsec separado.

Riesgos pendientes:
- Completar secretos + smoke comercio dedicado + pago controlado + idempotencia.

Rollback preparado:
- Tag local zeno-billing-pre-production-2026-07-27
- Vercel Instant Rollback (web + kosmenu)
- Backup bajo backups/prod-zeno-pre-...
- No drops de tablas con pagos futuros

DECISIÓN: NO-GO (parcial)
  Migraciones + apps + funciones desplegadas.
  Bloqueado: secretos Zeno producción + smoke E2E + pago.
```

## Acción requerida del operador (fuera del chat)

1. En Zeno Developers, crear endpoint **de producción** (no reutilizar preview):

```text
https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/zeno-webhook
```

Eventos: `checkout.completed`, `checkout.expired`, `checkout.partially_paid`

2. Cargar secretos solo en producción:

```bash
umask 077
# editar archivo temporal fuera del repo con:
# ZENO_API_KEY=...
# ZENO_WEBHOOK_SECRET=...   # whsec del endpoint PRODUCCIÓN
# ZENO_API_BASE_URL=https://api.zenobank.io/api/v1
# ZENO_SUCCESS_REDIRECT_URL=https://app.elmenuxfa.com/payment/success

supabase secrets set --env-file /tmp/zeno-prod.env --project-ref qqhberaayhohxlbbhdyi
rm -f /tmp/zeno-prod.env
```

3. Avisar a Cursor para continuar: Testing webhook, smoke comercio `SMOKE ZENO PROD 2026-07-27`, checkout, y detenerse antes de firmar el pago.
