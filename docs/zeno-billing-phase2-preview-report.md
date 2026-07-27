# FASE 2 — RESULTADO PREVIEW

```text
FASE 2 — RESULTADO PREVIEW

Project ref: gsfxqzvmyzjjgpigrste (kosmenu-preview)
Commit SHA: 159493baa8a3235ec39a406d5b3033f5d0559ddd
Fecha y hora: 2026-07-27 ~17:10 UTC

Pruebas Flutter: PASS (7/7) — re-ejecutadas tras el commit
Pruebas Deno: PASS (8/8) — re-ejecutadas tras el commit

Migraciones aplicadas (preview, sesión anterior):
- 20260727120000_zeno_billing_schema.sql
- 20260727120100_zeno_billing_renewal_helpers.sql

Tablas verificadas: plans, subscriptions, payments, payment_events
RPCs verificadas: apply_zeno_* + mark/suspend helpers
RLS verificada: PASS (sesión anterior; sin re-break de legacy)

create-zeno-checkout:
- Deploy: ACTIVE on gsfxqzvmyzjjgpigrste
- JWT: obligatorio

zeno-webhook:
- Deploy: ACTIVE (--no-verify-jwt)
- JWT: off
- Firma Svix: whsec presente en secrets de preview, pero NO confirmado
  como el secreto del endpoint registrado en el dashboard de Zeno

Secretos preview (nombres solamente):
- ZENO_API_BASE_URL: presente
- ZENO_SUCCESS_REDIRECT_URL: presente
- ZENO_WEBHOOK_SECRET: presente (origen: prueba local previa; reemplazar
  con whsec del endpoint Zeno al registrar)
- ZENO_API_KEY: AUSENTE

Modo confirmado de la API key:
- Zeno NO ofrece sandbox/test mode separado (FAQ pública: "We don't offer
  a sandbox environment"; recomiendan montos pequeños en redes low-fee).
- Por política del gate: DETENER antes de pagos reales.
- Se requiere autorización explícita para una transacción real controlada.

Webhook dashboard Zeno:
- URL objetivo: https://gsfxqzvmyzjjgpigrste.supabase.co/functions/v1/zeno-webhook
- Registro en dashboard: NO CONFIRMADO desde este entorno
- Eventos (checkout.completed / expired / partially_paid): NO CONFIRMADOS

Casos de integración (cierre de gate):
1. No autenticado: PASS (sesión anterior)
2. Precio desde DB / checkout real pay.zenobank.io: NO EJECUTADO
   (falta ZENO_API_KEY; además no hay sandbox)
3. Reutilización: NO EJECUTADO (depende de 2)
4. Firma inválida: PASS (lógica interna, sesión anterior)
5. Pago completo vía webhook firmado LOCALMENTE: PASS interno — NO cuenta
   para GO E2E (requiere entrega real desde dashboard Zeno)
6. Duplicado firmado LOCALMENTE: PASS interno — NO cuenta para GO E2E
7. Reintento processed=false: PASS interno
8. Expirado: PASS interno
9. Parcial: PASS interno
10. Monto/moneda incorrectos: PASS interno
11. RLS: PASS
12. Legacy: PASS (2 exempt, 2 online, delta en_linea=0 vs pre-migración)
13. Ruta payment/success: PASS (código)

Checkout real creado: NO
Prueba de reutilización: NO
Webhook entregado realmente por Zeno: NO
Duplicado reproducido desde dashboard Zeno: NO
Pago sandbox: N/A — Zeno no tiene sandbox

Comercios legacy antes: 2 online
Comercios legacy después: 2 online, 2 billing_exempt=true
Cambios detectados en en_linea: 0

Incidencias:
1. Commit reproducible creado (SHA arriba); el SHA anterior bebdc26 ya no aplica.
2. ZENO_API_KEY aún no cargada en preview (cargar fuera del chat vía --env-file).
3. Zeno sin sandbox → no se ejecutó ni se intentó pago real.
4. Webhook dashboard no verificado desde Cursor.
5. whsec actual de preview es de prueba local; debe sustituirse por el del endpoint Zeno.

Riesgos pendientes:
- Sustituir secretos con valores del dashboard Zeno (sin pegarlos en chat).
- Autorizar por separado una transacción real controlada (monto mínimo) si
  se desea cerrar E2E sin sandbox.
- No tocar producción / billing_exempt / cron / menús legacy.

Rollback verificado: documentado en docs/zeno-billing-phase2.md (no ejecutado)

DECISIÓN: NO-GO
Motivo: faltan (a) ZENO_API_KEY en preview, (b) confirmación de webhook
registrado en Zeno con whsec alineado, (c) checkout real + reutilización,
(d) al menos un webhook emitido/reproducido desde el dashboard de Zeno.
Producción: NO-GO
```

## Cómo desbloquear (fuera del chat)

1. En Zeno Developers: registrar
   `https://gsfxqzvmyzjjgpigrste.supabase.co/functions/v1/zeno-webhook`
   con los 3 eventos; copiar el `whsec_` del endpoint.
2. Confirmar en dashboard que **no hay sandbox** (esperado) y decidir si
   autorizan una transacción real controlada (monto mínimo).
3. Cargar secretos **solo en preview** con archivo temporal fuera del repo:

```bash
umask 077
# editar /tmp/zeno-preview.env (nunca commit)
supabase secrets set --env-file /tmp/zeno-preview.env --project-ref gsfxqzvmyzjjgpigrste
supabase secrets list --project-ref gsfxqzvmyzjjgpigrste
rm -f /tmp/zeno-preview.env
```

4. Avisar a Cursor que los secretos y el webhook ya están listos **y**, si
   aplica, autorizar explícitamente la transacción real controlada.
5. Re-ejecutar el gate E2E (checkout + reuse + webhook dashboard + duplicate).

## Evidencia sandbox Zeno

Fuente pública (zenobank.io / FAQ API): *“We don't offer a sandbox environment.
For testing, we recommend using small amounts (like 0.001)…”*
