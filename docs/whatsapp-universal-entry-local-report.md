# Acceso universal WhatsApp — reporte local (wa-entry)

**Rama:** `feature/wasender-universal-entry`  
**Fecha:** 2026-11-23  
**Autorización usada:** desarrollo local + simulación + pruebas WaSender aisladas que no alteren producción.  
**No autorizado / no hecho:** `vercel --prod`, merge a rama publicada, migraciones Supabase prod, cambio de webhooks activos, respuestas automáticas al público.

---

## GO / NO-GO

| Criterio | Resultado |
| --- | --- |
| Router + máquina de estados local | **GO** |
| Simulador local + Vitest A–R | **GO** (ejecutar `npm run test:wa-entry`) |
| Webhook path aislado (no enlazado a prod) | **GO** |
| Flags fail-closed por defecto | **GO** |
| Sin deploy / sin migraciones / sin swap de webhook | **GO** (evidencia abajo) |
| Prueba real WaSender sin tocar webhook activo | **NO-GO / bloqueado** — el proveedor solo se puede validar con captura real si se apunta un webhook; **no se redirigió** el webhook de ELMENUXFA1 |

**Veredicto de activación pública:** **NO-GO.** Listo para prueba personal local del propietario; no listo para publicar ni para responder al público.

---

## 1. Arquitectura

```
WhatsApp (futuro) → WaSender webhook
                 → POST /api/wa-entry/webhook  (auth secret/HMAC)
                 → processWaEntryEvent
                      ├─ kill switches
                      ├─ normalize payload
                      ├─ atomic tryClaimMessage (dedupe)
                      ├─ routeWaEntryEvent (FSM)
                      └─ WaEntrySender (sim | refused wasender)

Estado / dedupe / outbound sim → archivo local `.wa-entry-local/state.json`
                                 (o memoria en Vitest)
```

**Separación:** no usa `wasender_message_queue`, `sendWhatsappText`, ni `SUPABASE_SERVICE_ROLE_KEY`. El adaptador `wasender` real **rechaza** en esta fase.

---

## 2. Webhook entrante y validación

- Ruta: `site/app/api/wa-entry/webhook/route.ts`
- Auth: `X-Platform-Wa-Secret` o `X-Platform-Wa-Signature` (HMAC-SHA256 del body) vía `PLATFORM_WA_WEBHOOK_SECRET`
- Fail-closed sin secret (salvo `PLATFORM_WA_ALLOW_INSECURE_LOCAL=1` + adapter sim en dev/test)
- GET: health sin secretos

**Contrato inbound:** provisional (no había handler histórico). Fixtures en `site/tests/fixtures/wa-entry/`.

---

## 3. Máquina de estados

Estados: `initial` → `awaiting_audience` → (`consumer_link_sent` | `awaiting_business_action` → `business_link_sent`) | `human_handling` | `closed`

- `MENÚ` / `menu` / `inicio` → bienvenida
- `1`/`2` interpretados según estado
- Texto inesperado → ayuda breve
- `fromMe` → `human_handling` + TTL (`PLATFORM_WA_HUMAN_PAUSE_MS`)
- TTL de hilo: `PLATFORM_WA_THREAD_TTL_MS`

---

## 4. Mensajes finales

Ver `site/app/api/wa-entry/_lib/messages.ts` (copy alineado al brief).

---

## 5. Resolución de enlaces (centralizados en config)

| Destino | Default |
| --- | --- |
| Consumidor | `https://elmenuxfa.com/asistente?ref=wa` |
| Landing negocio | `https://business.elmenuxfa.com/` |
| Registro | `https://app.elmenuxfa.com/?tab=register` |
| Gestión | `https://app.elmenuxfa.com/` |

Overrides: `PLATFORM_WA_CONSUMER_URL`, `PLATFORM_WA_BUSINESS_*`.

---

## 6. Deduplicación

`WaEntryStore.tryClaimMessage(messageId)` atómico en memoria/archivo. Duplicados → ignore sin outbound.

---

## 7. Integración cola WaSender

**No integrada en esta fase** (a propósito). Outbound de pedidos/supervisión intacto. Sender real: `createRefusingWasenderSender()`.

---

## 8. Feature flags

| Flag | Default | Efecto |
| --- | --- | --- |
| `PLATFORM_WA_INBOUND` | off | Kill inbound |
| `PLATFORM_WA_ROUTER` | off | Kill router |
| `PLATFORM_WA_ADAPTER` | `sim` | `sim` \| `wasender` |
| `PLATFORM_WA_ALLOW_REAL_WASENDER` | off | Obligatoria para adapter wasender |
| `PLATFORM_WA_WEBHOOK_SECRET` | vacío | Auth |

---

## 9–10. Pruebas

```bash
cd site
npm run test:wa-entry
npm run typecheck   # opcional / suite global
```

Escenarios cubiertos: bienvenida, consumidor, negocio register/manage, MENÚ, ayuda, dedupe, fromMe, grupo, status, snapshot restore, race, retry, human pause, kill switch, webhook auth, loop echo, aislamiento de imports.

---

## 11. Cómo probar localmente (propietario)

```bash
cd site
# Opcional: copiar docs/wa-entry-env.example → site/.env.wa-entry.local
# y cargar vars, o exportar PLATFORM_WA_* en la shell.
# El simulador UI fuerza flags ON vía /api/wa-entry/dev/sim.
npm run dev:wa-entry
```

Abrir: `http://localhost:3030/dev/wa-entry`

Webhook local (con secret): `POST http://localhost:3030/api/wa-entry/webhook`

---

## 12. Evidencia de no tocar producción

Durante este desarrollo:

- No se ejecutó `vercel --prod`.
- No se hizo push ni merge a rama publicada (commits solo locales en `feature/wasender-universal-entry`).
- No se cambiaron env Production.
- No se corrieron migraciones Supabase.
- No se modificó la suscripción webhook de ELMENUXFA1.
- Flags de Gemini Discovery / supervisión / menús públicos: no tocados por este módulo (archivos nuevos bajo `site/app/api/wa-entry/**` + sim UI + tests + docs).

**Nota:** la rama puede contener cambios previos de Discovery no relacionados; no forman parte de la activación de wa-entry y no deben desplegarse como parte de este entregable.

---

## 13. Costos y limitaciones

- Costo incremental en sim: ~0 (sin Gemini, sin WaSender API).
- Limitación: sin captura real del payload WaSender de ELMENUXFA1, el normalizer es provisional.
- Store archivo no es multi-instancia fuerte (suficiente para local; producción futura necesita Redis/Postgres aislado, no tablas de pedidos).

---

## 14. Riesgos de usar la sesión ELMENUXFA1 actual

- Un solo webhook típico → reemplazarlo rompería notificaciones/supervisión.
- Respuestas automáticas al público sin kill-switch = riesgo operacional.
- `fromMe` debe pausar automatización o habrá loops con operadores humanos.

---

## 15. Plan de activación gradual (futuro — requiere nueva autorización)

1. Preview aislado + dual-dispatch/proxy de webhook (sin cortar prod).
2. Allowlist de números de prueba.
3. Flags ON solo en Preview.
4. Shadow mode (log sin reply) → reply allowlist → % gradual.
5. Métrica de duplicados/errores antes de 100%.

---

## 16. Procedimiento de apagado

1. `PLATFORM_WA_INBOUND=0` y/o `PLATFORM_WA_ROUTER=0`
2. Confirmar GET webhook → `inboundEnabled: false`
3. No hace falta tocar cola outbound de pedidos

---

## 17. Prueba real aislada

**No realizada.** Motivo: requeriría cambiar o compartir el webhook activo de ELMENUXFA1, o un segundo endpoint no confirmado en el proveedor. Según autorización vigente, se detuvo sin comprometer producción. La simulación local cubre el recorrido funcional.
