# Informe staging live + media live — Pizzas El Trueno

Fecha: 2026-11-22  
Piloto: `pizzas-el-trueno` (`0aa8c53b-07f1-446e-8b88-66c2b7ae89ea`)  
Entorno: Next.js local `:3001` + `.env.staging.local`  
**Sin deploy prod · sin migraciones prod · sin pedidos/pagos · sin cambiar `en_linea`**

## Veredicto

### GO — staging aislado (piloto técnico)
Aislamiento efectivo, media live, STT, propuestas duales Hawaiana con precios de catálogo, suites verdes, techo de coste respetado.

### NO-GO — producción / habilitación pública
Quedan flaky en pedido multi-ítem por voz (pizza+bebida inexistente), tope de llamadas agotado antes de cerrar el flujo checkout end-to-end en la misma sesión, y auditoría RLS completa pendiente de SQL editor. **No autorizar publicación** hasta re-smoke bajo nuevo presupuesto de llamadas y checklist prod.

---

## 1. Aislamiento

| Check | Resultado |
|-------|-----------|
| Preview Supabase (`gsfxqzv…`) tiene Trueno | **No** (0 filas) |
| Estrategia usada | Catálogo prod en **solo lectura** + `CHATBOT_STAGING_MODE=1` |
| Wrapper anti-escritura Supabase | `asReadOnlySupabaseClient` (bloquea insert/update/upsert/delete/upload/rpc mutantes) |
| Bloqueo pedidos **server-side** | `POST /api/orders` → **403** `orders_blocked_staging` |
| Bloqueo comprobantes | Igual flag staging |
| `en_linea` Trueno | **No modificado** |
| Allowlist | Solo UUID Trueno |
| Migraciones | **Ninguna** (media efímera en disco) |

Evidencia: `site/.data/staging-live/report.json` → `isolation.ordersBlocked=true`.

## 2. Costos y tarifas

Modelo: `gemini-3.1-flash-lite`  
Tarifas usadas (AI Studio / pricing 2026): texto/imagen **$0.25/1M in**, audio **$0.50/1M in**, out **$1.50/1M**.

| Cap autorizado | Consumo sesión |
|----------------|----------------|
| 28 HTTP | **28** (tope alcanzado → stop) |
| $0.10 global | **~$0.0157** estimado (tokens×tarifas) |
| 6 media / $0.03 | STT + imagen + PDF ejecutados (audio/imagen/PDF en `recentCalls`) |

**Honestidad:** `hardGuarantee: false`. El preflight + post-usage detienen; Gemini factura al aceptar la request, así que **no** se afirma un techo duro absoluto de $0.10 — sí control preventivo con headroom.

Archivo: `site/.data/chatbot-live-budget-staging.json`.

Excepción técnica documentada: `CHATBOT_MAX_TOOL_ROUNDS=4` (con 2 fallaba `tool_round_limit` en 2× Hawaiana; con 3 aún insufiente para voz multi-ítem).

## 3. Conversación Gemini real (extracto)

1. **Hola** → «¡Hola! Bienvenido. ¿Qué te gustaría pedir hoy?…» (breve; sin repetición excesiva en turnos siguientes).
2. **¿Qué pizzas…?** → lista real (Hawaiana, Margarita, etc.) + `product_cards` con precios catálogo.
3. **Recomendación 2 personas** → sugiere pizza grande; pide preferencia (no inventa combo).
4. **Dos Hawaianas Normal+Grande** (1ª pasada flaky; **retry OK**):
   - Reply: *He preparado las dos pizzas Hawaianas… normal por 3.50 USD y grande por 8.75 USD… confírmalas…*
   - Acciones: `1× Hawaiana (Normal)` **3.5**, `1× Hawaiana (Grande)` **8.75**.
5. Coca-Cola: el menú **no** tiene Coca-Cola → responde que no existe (correcto; no inventa).
6. Checkout: en sesión larga el carrito API iba vacío (propuestas no confirmadas vía UI en script puro API).

Evidencia: `site/.data/staging-live/report.json`, `retry-report.json`.

## 4. Multimedia

| Capacidad | Resultado |
|-----------|-----------|
| STT voz (WAV SAPI → Gemini) | **OK** transcript: *«Buenas noches, quiero dos pizzas hawaianas, una grande y otra normal y una Coca-Cola.»* |
| Comprensión post-STT → propuestas | **PARCIAL** — a veces no arma propuestas cuando el utterance incluye bebida inexistente; dual pizza sin bebida **OK** |
| Imagen live | **OK** — reconoce fondo sólido, no inventa menú |
| PDF live | **OK** — «pedido… Hawaiana… grande» |
| Ubicación → checkout | Implementado; E2E staging UI flaky en esta corrida (emoji overlay). Flujo ya validado en functionality-close previo |
| Emojis | Código OK; Playwright staging flaky (panel no visible tras click) |
| Retención | `.data/chat-media-staging/` privado + TTL 30 min; **no** buckets públicos |

## 5. Suites

| Suite | Resultado |
|-------|-----------|
| Vitest completo | **687 passed** / 1 skipped (94 files) |
| TypeScript `tsc --noEmit` | **OK** (corregidos 4 errores preexistentes en tests ajenos) |
| Staging guards unit | OK |
| Playwright staging UI | Flaky en esta sesión |
| Gemini HTTP tras tope | Abortado correctamente (`live_gemini_call_cap`) |

## 6. Seguridad

- Pedidos bloqueados en servidor (no solo Playwright).
- Precios desde catálogo/tools (3.50 / 8.75).
- Allowlist mono-comercio.
- Chat `order_actions: []` (no crea pedidos).
- RLS `pedidos_emergency_anon_insert`: **no mutada**. Probe SELECT ok; listing `pg_policies` requiere ejecutar a mano [`supabase/sql/read-only-audit-pedidos-emergency-anon-insert.sql`](../supabase/sql/read-only-audit-pedidos-emergency-anon-insert.sql) (PostgREST no expone `pg_policies`).

## 7. Problemas encontrados / corregidos

| Issue | Acción |
|-------|--------|
| Preview sin Trueno | Staging RO sobre prod + write block |
| Media live era 403 placeholder | Implementado `runMediaGemini` + budget |
| `CHATBOT_LIVE_BUDGET_RESET=1` en workers | Forzado `=0` tras boot |
| `tool_round_limit` @2 | Subido a **4** (doc) |
| 4 errores TS tests ajenos | Corregidos |
| PDF mínimo inválido | PDF válido regenerado |
| Tope 28 llamadas | Stop; coste aún ~$0.016 |

## 8. Limitaciones pendientes

1. Pedido hablado pizza+bebida inexistente → a veces 0 propuestas (debe proponer pizzas + aclarar bebida).
2. Confirmar propuestas → carrito → checkout en **una** sesión live UI bajo nuevo cupo de llamadas.
3. Emoji Playwright en staging flaky.
4. Auditoría SQL completa de `pedidos_emergency_anon_insert` en editor.
5. Cuota postgres + `chatbot_enabled` DB flag antes de prod.
6. Device real iPhone/Safari y Android: **no comprobados aquí** (solo Chromium).

## 9. Checklist producción / deploy / rollback

Ver [`docs/chatbot-production-checklist.md`](chatbot-production-checklist.md) (actualizado).

**Deploy plan (cuando autorices):**  
1) Backup + migraciones cuota postgres si faltan (solo tras auth).  
2) Env prod: allowlist Trueno, `CHATBOT_ALLOW_PRODUCTION=1`, hard caps, media live off o capped.  
3) Smoke Trueno.  
4) Habilitar `chatbot_enabled` solo Trueno.

**Rollback:** `CHATBOT_ENABLED=0` o quitar UUID allowlist / `chatbot_enabled=false` — sin redeploy de menú.

## 10. Artefactos

- `site/.data/staging-live/report.json`
- `site/.data/staging-live/retry-report.json`
- `site/.data/chatbot-live-budget-staging.json`
- `site/.data/staging-live/voice-order.wav`
- `site/.env.staging.local` (local; no commit secrets)

---

**Detente.** Esperando autorización explícita para: (a) nuevo cupo live de cierre voz+checkout, y/o (b) publicación piloto producción Trueno.
