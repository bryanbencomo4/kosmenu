# FASE 2 — RESULTADO PREVIEW

```text
FASE 2 — RESULTADO PREVIEW

Project ref: gsfxqzvmyzjjgpigrste (kosmenu-preview)
Commit SHA (código Fase 2): 159493baa8a3235ec39a406d5b3033f5d0559ddd
Commit SHA (informe previo): c254efae247dd137dabe76afcdb2024ab9444b5c
Fecha y hora (validación pago): 2026-07-27 ~18:19–18:36 UTC

Pruebas Flutter: PASS (7/7) — sesión anterior de gate
Pruebas Deno: PASS (8/8) — sesión anterior de gate

## Pago real controlado USD 10 (autorizado)

Checkout: ch_jvlQG… @ pay.zenobank.io
Order: km_1111111…
paid_at: 2026-07-27T18:19:04Z

1. Webhook real checkout.completed: PASS
   - svix msg_3H66o8x8… processed=true @ 18:19:04Z
   - (msg_3H63vOJC… = Testing order-12345 → processed=false / PAYMENT_NOT_FOUND; no afecta)

2. payment.status=completed: PASS (amount=10, currency=USD)

3. subscription.status=active: PASS

4. Periodos: PASS
   - current_period_start: 2026-07-27T18:00:05.922Z
   - current_period_end:   2026-08-27T18:00:05.922Z  (+1 mes)
   - payment.period_* alineados con la suscripción

5. en_linea del pagador: PASS (true)
   - Ambos comercios ya estaban online antes del pago; el RPC fija en_linea=true
     solo en business_id del payment (sin impacto colateral)

6. Legacy: PASS
   - 2/2 billing_exempt=true
   - 2/2 en_linea=true
   - sin cambios adversos vs baseline de esta validación

7. Idempotencia:
   - Re-aplicar apply_zeno_checkout_completed: PASS
     (rpc idempotent=true; period_end sin cambio; en_linea/billing_exempt sin cambio;
      payment_events count sin cambio)
   - Re-firma local del mismo svix-id: FAIL esperado (whsec local ≠ secreto del
     endpoint Zeno en Supabase) → no invalida el path real
   - Replay desde dashboard Zeno: NO OBSERVADO en ventana de 3 min
     (dashboard en /sign-in; requiere acción manual del operador)
   - Tras el poll: period_end estable, real_completed_event_count=2 estable,
     comercios sin cambio

8. Informe: este archivo

Secretos preview (nombres): ZENO_API_KEY, ZENO_WEBHOOK_SECRET,
  ZENO_API_BASE_URL, ZENO_SUCCESS_REDIRECT_URL = presentes

Producción: no tocada
Cron suspensión: no ejecutado
billing_exempt: no modificado

DECISIÓN PREVIEW: GO
  (checkout real + pago real + webhook real Zeno + activación + legacy OK +
   idempotencia RPC confirmada)

DECISIÓN PRODUCCIÓN: NO-GO
  (falta ventana controlada de prod, secretos prod, webhook prod, y
   autorización explícita aparte)

Residual operativo (no bloquea GO preview):
  - Pulsar Replay una vez en Zeno Developers sobre msg_3H66… para evidencia
    HTTP duplicate=true en logs del dashboard; el código ya trata processed
    + unique(provider, provider_event_id).
```

## Evidencia resumida

| Check | Resultado |
|---|---|
| Webhook Zeno real `checkout.completed` | PASS (`msg_3H66…`) |
| `payment=completed` / USD 10 | PASS |
| `subscription=active` | PASS |
| Periodo ~1 mes | PASS |
| Legacy 2 exempt + 2 online | PASS |
| RPC no doble-renueva | PASS |
| Dashboard Replay click | pendiente operador |

## Notas

- El evento Testing con `order-12345` permanece `processed=false` (PAYMENT_NOT_FOUND); correcto.
- No se imprimieron secretos, URLs completas de checkout ni hashes de tx.
