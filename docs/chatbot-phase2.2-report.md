# El Menú XFA — Informe Fase 2.2

**Fecha:** 2026-11-22  
**Alcance:** actualización de modelos Gemini + validación del motor conversacional + refuerzo de cuotas  
**Restricciones respetadas:** sin `--authorize-live`; sin deploy; sin migraciones aplicadas a producción; sin Fase 3; sin tocar carrito/pedidos/WhatsApp/Flutter/fotos IA del panel.

**Línea base de tests:** 578 → **584 aprobados** (+6).

---

## 1. Modelo anterior y modelo nuevo

| Rol | Antes (2.1) | Ahora (2.2) |
|-----|-------------|-------------|
| Primario | `gemini-2.0-flash-lite` | **`gemini-3.1-flash-lite`** |
| Fallback | `gemini-2.5-flash` | **`gemini-2.5-flash-lite`** |

Variables de entorno (sin cambio de nombres):

- `CHATBOT_GEMINI_MODEL` (default nuevo: `gemini-3.1-flash-lite`)
- `CHATBOT_GEMINI_MODEL_FALLBACK` (default nuevo: `gemini-2.5-flash-lite`)

Los modelos de **fotos/portadas** del panel (`gemini-2.5-flash-image`, etc.) **no se modificaron**.

---

## 2. Justificación de la selección

Fuentes oficiales consultadas (2026-11-22):

- [Gemini 3.1 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite)
- [Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Notas de deprecación: `gemini-2.0-flash-lite` retirado (2026-06-01); `gemini-2.5-flash` deja de seleccionarse y desde 2026-12-01 redirige a tarifas de 3.5 Flash-Lite.

**Por qué `gemini-3.1-flash-lite` como primario**

1. Generación Flash-Lite vigente (post-2.0).
2. **Function calling** soportado (requerido por nuestras tools).
3. Más barato que `gemini-3.5-flash-lite` ($0.25/$1.50 vs $0.30/$2.50 por 1M).
4. Alineado con la prioridad pedida en el brief.

**Por qué `gemini-2.5-flash-lite` como fallback (no `gemini-2.5-flash`)**

1. Sigue servido y declara function calling.
2. **Más barato** que el primario ($0.10/$0.40) — cumple “no usar automáticamente un modelo más caro como fallback”.
3. `gemini-2.5-flash` está deprecado / se redirige a precios superiores.

Catálogo y guardas: `site/app/api/chat/_lib/models.ts` (`resolveChatbotModelPair`).

---

## 3. Tarifas verificadas (paid tier, USD / 1M tokens)

| Modelo | Input | Output |
|--------|------:|-------:|
| `gemini-3.1-flash-lite` | $0.25 | $1.50 |
| `gemini-2.5-flash-lite` | $0.10 | $0.40 |
| `gemini-3.5-flash-lite` (no default) | $0.30 | $2.50 |

Defaults de costo estimado en config: `CHATBOT_PRICE_INPUT_PER_1M=0.25`, `CHATBOT_PRICE_OUTPUT_PER_1M=1.50` (sobreescribibles).

---

## 4. Compatibilidad con function calling

Verificado en documentación oficial para **ambos** modelos del par: Function calling = Supported.

El cliente (`gemini.ts`) sigue enviando:

- `systemInstruction`
- `tools[].functionDeclarations` (tools de solo lectura del catálogo)
- bucle de tool rounds ≤ `CHATBOT_MAX_TOOL_ROUNDS`
- `thinkingConfig.thinkingBudget: 0` para limitar tokens de thinking facturados

Test nuevo: fallback 404 → `gemini-2.5-flash-lite` + 1 `search_products` + respuesta textual (`chatbot-runtime.test.ts`).

Contrato HTTP **sin cambios**: `POST /api/chat/[comercioId]`.

---

## 5. Archivos modificados / creados

### Creados

- `site/app/api/chat/_lib/models.ts`
- `site/tests/chatbot-models.test.ts`
- `supabase/migrations/20261122140000_ai_chatbot_reserve_quota_atomic.sql` (**no aplicada**)
- `docs/chatbot-phase2.2-report.md`

### Modificados

- `site/app/api/chat/_lib/config.ts` — defaults + resolución de modelos/precios
- `site/app/api/chat/_lib/gemini.ts` — thinkingBudget 0; fallback barato
- `site/app/api/chat/_lib/quota.ts` — RPC atómica preferida + fallback 2.1
- `site/app/api/chat/[comercioId]/route.ts` — GET expone `modelFallback`
- `site/scripts/chatbot-live-smoke.mjs` — prompts, techo de costo, solo localhost
- Tests: `chatbot-runtime.test.ts`, `chatbot-quota.test.ts`

---

## 6. Resultados de pruebas automatizadas

```text
584 passed (83 files)
```

Incluye: modelos, runtime/Gemini mock, tools, cuota filesystem, seguridad 2.1, snapshots Fase 0.

---

## 7. Typecheck

**Errores nuevos de chat: 0.**

Preexistentes ajenos (iguales):

1. `tests/dispatch-order-notification.test.ts`
2. `tests/notify-merchant-new-order.test.ts` (2 líneas)
3. `tests/payment-method-display.test.ts`

---

## 8. Estado del control de cuotas

### Comportamientos confirmados

| Escenario | Comportamiento |
|-----------|----------------|
| Concurrencia mensual/sesión (Postgres) | `FOR UPDATE` en fila de uso/sesión; no se supera el cupo |
| Gemini falla tras reservar | Request ya contabilizado; se registra `errors += 1` con 0 tokens; no hay rollback (anti-abuso) |
| Tokens de tool rounds | Se suman todos los `usageMetadata` del bucle; **1** request de cuota por mensaje de usuario |
| Solicitud interrumpida | Timeout → `gemini_timeout`; cuota de request ya reservada; error contabilizado |
| Doble conteo del mismo intento | Un `reserve` por POST; tokens con `p_requests: 0` en el record |
| Renovación mensual | Clave `period_month = YYYY-MM` UTC; mes nuevo = contadores nuevos |
| Soft overshoot de tokens | Reserva chequea tokens **antes**; una respuesta grande puede pasar el techo una vez; el siguiente `reserve` bloquea |

### Corrección 2.2 (local, no aplicada)

Antes: `reserve_ai_chatbot_session` + `increment_ai_chatbot_usage` en dos RPC → si el segundo fallaba, la sesión ya había incrementado.

Ahora: `reserve_ai_chatbot_quota` hace **sesión + mensual en una sola transacción**.  
`quota.ts` la llama primero; si la función no existe en el schema, cae al path 2.1.

Filesystem (dev): locks por archivo; producción sigue prohibida sin postgres.

---

## 9. Instrucciones para la prueba real (autorización explícita)

Desde `site/`:

```bash
# Dry-run (cero costo) — YA ejecutado en esta fase
node scripts/chatbot-live-smoke.mjs

# Live (SOLO con tu autorización y clave local)
# 1) GEMINI_API_KEY + CHATBOT_ENABLED=1 en .env.local
# 2) npm run dev  (p.ej. puerto 3001)
# 3) CHATBOT_QUOTA_BACKEND=filesystem recomendado
node --env-file=.env.local scripts/chatbot-live-smoke.mjs --authorize-live --slug=meal4fit --max-requests=6
```

Protecciones del script live:

- Exige `--authorize-live`
- Exige `CHATBOT_ENABLED=1` y `GEMINI_API_KEY`
- **Solo** `localhost` / `127.0.0.1`
- Tope `--max-requests` (default 6, máx 12)

**Costo esperado (techo rough):** ≈ **$0.0066 USD** para 6 turnos (~2k in + 400 out c/u) a tarifas 3.1 Flash-Lite.

Preguntas incluidas: menú, económicos, presupuesto $15, sin cebolla, delivery, precio.

**No se ejecutó `--authorize-live` en esta fase.**

---

## 10. Riesgos pendientes

1. Migraciones chatbot (`…120000`, `…123000`, `…140000`) **no aplicadas** en prod.
2. Acceso a `gemini-2.5-flash-lite` puede estar limitado en cuentas nuevas (Google); el primario 3.1 es el camino principal.
3. `thinkingConfig.thinkingBudget: 0` podría ser ignorado/rechazado en algún modelo; el fallback 400/404 mitiga.
4. Overshoot de tokens de una sola respuesta grande (aceptado y documentado).
5. `pedidos_emergency_anon_insert` sigue pendiente de auditoría SQL de solo lectura (sin cambios).
6. Prueba live real aún no autorizada.

---

## 11. Confirmación: pedidos y carrito

No se modificaron `POST /api/orders`, `order-item-snapshots`, carrito, checkout, WhatsApp, Flutter ni tools de compra. El chat sigue con `cart_actions: []` / `order_actions: []`.

---

## 12. Confirmación: sin deploy ni consumo no autorizado

- Sin deploy a producción.
- Smoke ejecutado **solo en dry-run** (`authorize-live: false`, sin clave).
- Sin llamadas facturables a Gemini en esta fase.

---

## Siguiente paso

Esperar autorización para:

1. Prueba live controlada (`--authorize-live`), y/o  
2. Fase 3 (ventas / carrito vía tools), y/o  
3. Aplicar migraciones SQL en un entorno no productivo primero.
