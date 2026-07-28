# FASE 2 — RESULTADO PRODUCCIÓN (onboarding + paywall cableado)

```text
FASE 2 — ONBOARDING + PAYWALL

Fecha: 2026-07-27
Production ref: qqhberaayhohxlbbhdyi

Migración aplicada:
- 20260727220000_zeno_billing_onboarding_paywall.sql
- billing_exempt default = false (sin cambiar filas)
- en_linea default = false (sin cambiar filas)
- trigger comercios_billing_guards
- helpers commerce_can_publish / commerce_has_active_subscription
- cron suspensión: NO habilitado

Legacy (ANTES = DESPUÉS):
- Pizzeria Napoles: en_linea=true, billing_exempt=true
- Somos Streaming Venezuela: en_linea=true, billing_exempt=true
- ElMenúXFA Demo: en_linea=true, billing_exempt=true
- Smoke: en_linea=false, billing_exempt=false (sin tocar pago)

Pruebas:
- flutter test billing_service_test.dart: PASS 15/15
- deno test zeno-billing_test.ts: PASS 8/8
- SQL verify (transaction rollback): PASS
  - nuevo comercio nace exempt=false, offline
  - cliente no puede set billing_exempt=true
  - cliente no puede set en_linea=true sin subscription active
- service_role puede publicar (webhook path)

Flutter cableado:
- AuthGate → setup | billing | dashboard
- onboarding save → BillingPlanScreen
- INSERT billing_exempt=false, en_linea=false
- dashboard banner + bloqueo en_linea
- CTA “Pagar con criptomonedas”
- success → URL + QR

DECISIÓN parcial: código + migración + Flutter deploy OK.
Deploy Flutter: dpl_EfP3fcYQbsjKW4Yi6noSBdeZU3v6 → https://app.elmenuxfa.com
  /billing y /payment/success → HTTP 200

Pendiente: smoke registro nuevo → menú → billing → pago (no crear checkout hasta que el operador inicie ese flujo).
```
