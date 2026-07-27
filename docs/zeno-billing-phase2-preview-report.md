# FASE 2 — RESULTADO PREVIEW

```text
FASE 2 — RESULTADO PREVIEW

Project ref: gsfxqzvmyzjjgpigrste (kosmenu-preview)
Commit SHA: bebdc26697b4785db8ceb31c619bfa74afe06716
  (working tree includes uncommitted Fase 2 billing files)
Fecha y hora: 2026-07-27 17:01:06 UTC

Pruebas Flutter: PASS (7/7) — flutter test test/billing_service_test.dart
Pruebas Deno: PASS (8/8) — deno test zeno-billing_test.ts
  (fix de import path ./_shared antes del gate)

Migraciones aplicadas:
- 20260727120000_zeno_billing_schema.sql (via supabase db query --linked)
- 20260727120100_zeno_billing_renewal_helpers.sql (via supabase db query --linked)
Nota: preview no tiene supabase_migrations.schema_migrations; no se usó db push
del historial completo (habría reaplicado 40+ migraciones).

Tablas verificadas: plans (menu_monthly $10 USD), subscriptions, payments, payment_events
RPCs verificadas: apply_zeno_checkout_{completed,expired,partially_paid},
  mark_subscriptions_past_due, suspend_subscriptions_after_grace
RLS verificada: owner lee propios payments; otro owner ve 0; PATCH status→active
  no cambia fila (0 rows / status_unchanged)

create-zeno-checkout:
- Deploy: ACTIVE v1 on gsfxqzvmyzjjgpigrste
- JWT: obligatorio (gateway 401 sin Authorization)

zeno-webhook:
- Deploy: ACTIVE v1 on gsfxqzvmyzjjgpigrste (--no-verify-jwt)
- JWT: deshabilitado (correcto para Zeno→Svix)
- Firma Svix: validada con ZENO_WEBHOOK_SECRET de prueba (generado localmente;
  NO es el secreto del dashboard de Zeno todavía)

Casos de integración:
1. No autenticado: PASS (401 UNAUTHORIZED_NO_AUTH_HEADER)
2. Precio desde DB: BLOCKED (falta ZENO_API_KEY de prueba + autorización live)
3. Reutilización: BLOCKED (depende de 2)
4. Firma inválida: PASS (400; payment permanece open)
5. Pago completo: PASS (completed + subscription active + en_linea true)
6. Duplicado: PASS (200 duplicate=true; sin doble renovación)
7. Reintento processed=false: PASS (reprocesa y marca processed)
8. Expirado: PASS (expired; no activa)
9. Parcial: PASS (partially_paid; no activa)
10. Monto/moneda incorrectos: PASS (500; payment open)
11. RLS: PASS
12. Legacy: PASS (2/2 billing_exempt=true; en_linea sin delta vs pre-migración)
13. Ruta payment/success: PASS (wire en lib/main.dart; reload runtime Flutter web
    no ejecutado en este entorno)

Comercios legacy antes: total=2, en_linea_true=2
Comercios legacy después: total=2, en_linea_true=2, billing_exempt_true=2
Cambios detectados en en_linea: 0 (vs snapshot pre-migración)

Incidencias:
- ZENO_API_KEY no está en el entorno ni en secretos de preview → no se pudo
  crear checkout real en pay.zenobank.io ni validar reutilización.
- Webhook aún no registrado en dashboard Zeno; el whsec de preview es de
  prueba local para firmar eventos sintéticos.
- CLI quedó linkeado a preview (gsfxqzvmyzjjgpigrste), no a producción.
- create-zeno-checkout fallará con "ZENO_API_KEY is not configured" hasta
  setear el secreto de prueba.

Riesgos pendientes:
- Sustituir ZENO_WEBHOOK_SECRET por el whsec_ del endpoint real en Zeno.
- Completar casos 2–3 con sk_ de prueba (sin claves productivas).
- No ejecutar cron de suspensión / no quitar billing_exempt.
- Commit de archivos Fase 2 aún no creado (working tree dirty).

Rollback verificado: documentado en docs/zeno-billing-phase2.md
  (no se ejecutó drop en preview; migraciones son aditivas).

DECISIÓN: NO-GO
  (preview parcial: schema + webhook path GO; checkout live + registro Zeno pendientes)
  Producción: NO-GO
```

## Unblock checklist

1. Proveer `ZENO_API_KEY` de **prueba** (nunca productiva) para setear en preview:
   `supabase secrets set --project-ref gsfxqzvmyzjjgpigrste ZENO_API_KEY=sk_...`
2. Registrar webhook en https://dashboard.zenobank.io/developer →
   `https://gsfxqzvmyzjjgpigrste.supabase.co/functions/v1/zeno-webhook`
   Eventos: `checkout.completed`, `checkout.expired`, `checkout.partially_paid`
3. Copiar Signing Secret del endpoint a preview (reemplaza el whsec de prueba).
4. Re-correr: `deno run -A supabase/functions/zeno-preview-integration.ts`
   con `ZENO_API_KEY` + `RUN_LIVE_ZENO_CHECKOUT=1` (sin pago real salvo autorización).
