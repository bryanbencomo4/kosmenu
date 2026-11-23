# Cierre final staging — compra por voz + seguridad

**Fecha:** 2026-11-22  
**Presupuesto:** `site/.data/chatbot-live-budget-closure-final.json` (nuevo; prior preservado)  
**Staging:** `http://127.0.0.1:3001` · `CHATBOT_STAGING_MODE=1` · `CHATBOT_SIMULATE_GEMINI=0`  
**Veredicto piloto público:** **NO-GO**

---

## 1. Transcripción obtenida (STT live Gemini)

| Campo | Valor |
|-------|--------|
| Modo | `live` (no simulador) |
| Modelo | `gemini-3.1-flash-lite` |
| requestId | `r_ec30fc6ba2d941d0a302` |
| Tokens | in 290 / out 21 |
| **Transcript** | **«Buenas noches, quiero dos pizzas hawaianas, una grande y otra normal y una Coca-Cola.»** |

Audio: `site/.data/staging-closure/voice-closure.wav`

---

## 2. Conversación real generada por Gemini

### 2.1 Primer turno UI (audio → chat, live)

- STT correcto.
- El modelo respondió en vivo (requestId `r_f226e5446dc047739039`, 5 HTTP tool rounds).
- **No emitió `propose_add` estructurados** en ese turno (cards de propuesta = 0). Ofreció texto y chips de bebidas del catálogo; intentó mencionar Coca-Cola vía “Refresco en botella” (producto real) sin confirmar Coca-Cola como SKU inexistente de forma limpia en UI.

### 2.2 Turno enfocado API (live, indispensable para compra)

Mensaje: dos Hawaianas Normal + Grande; Coca-Cola no existe; ofrecer bebidas reales.

| Campo | Valor |
|-------|--------|
| requestId | `r_e414dc689c4e4df18477` |
| Modelo | `gemini-3.1-flash-lite` |
| HTTP Gemini | 2 |
| Tool calls | 2 (`search`/catálogo → `propose_add`) |
| Respuesta | «He preparado las dos pizzas Hawaianas… normal (3.5 USD) y la grande (8.75 USD). Confirma ambas… ¿bebidas?» |

Evidencia: `site/.data/staging-closure/api-proposals.json`

### 2.3 Confirmación UI + carrito

Con el presupuesto ya en 12/12, la UI confirmó las **mismas** `cart_actions` live (`r_e414…`) vía replay del payload capturado (sin nuevo gasto Gemini, sin simulador). El consumidor pulsó confirmar en ambas tarjetas.

---

## 3. Resultado de las propuestas

| Propuesta | product_id | Tamaño | Precio catálogo |
|-----------|------------|--------|-----------------|
| `add_mwrifisv_hjvcoy` | `be6a1bea-…` Hawaiana | Normal | **USD 3,50** |
| `add_mwrifisv_fxm4lb` | `be6a1bea-…` Hawaiana | Grande | **USD 8,75** |

Coca-Cola: no propuesta inventada en este turno; el asistente ofrece revisar categoría bebidas reales.

Bebida agregada: **no** (presupuesto agotado; paso 11 omitido a propósito).

---

## 4. Estado final del carrito

- `data-cart-count` = **2** tras confirmar.
- Persistencia menú ↔ chat: **cart=2**.
- Líneas checkout:
  - 1× Hawaiana — 3.5 USD  
  - 1× Hawaiana — 8.75 USD  

---

## 5. Capturas checkout

| Archivo | Contenido |
|---------|-----------|
| `screenshots/03-proposals-live-replay.png` | Tarjetas Normal/Grande |
| `screenshots/04-cart-confirmed.png` | Ambas «En el carrito», badge 2 |
| `screenshots/05-checkout-final.png` | **Subtotal 12.25 USD**, sin enviar pedido |
| `screenshots/06-menu-cart-persist.png` | Persistencia tras modo menú |

---

## 6–7. Llamadas HTTP, tokens y costo (cierre)

Presupuesto **closure-final** (no reinicia el prior de 28 llamadas):

| Métrica | Valor |
|---------|--------|
| HTTP Gemini | **12 / 12** |
| Tokens in / out | 27 471 / 564 |
| Costo estimado | **≈ US$0,0078** (tope US$0,03) |
| Media | 1 STT audio en `recentCalls` (`media_audio`); contador `mediaHttpCalls` quedó en 0 (bug de agregación — el evento sí está en historial) |
| Media tope | 2 / US$0,01 — no se usó segunda media |
| Fallos / reintentos | 0 fallos HTTP Gemini; 1 turno UI sin `propose_add` (no es reintento de red) |
| Prior preservado | `chatbot-live-budget-staging-prior.json` → 28 llamadas / ~US$0,016 |

Desglose reciente: 1 media STT + turnos primary `r_f226…` (5) + `r_a7fcd…` (2) + `r_e414…` (2) + último intento UI cart (2) = 12.

---

## 8. Auditoría SQL `pedidos_emergency_anon_insert`

**Ejecutada en producción** (`supabase db query --remote --read-only`). **Sin mutaciones.**

| Pregunta | Respuesta |
|----------|-----------|
| ¿Existe? | **Sí** |
| ¿Activa? | **Sí** (PERMISSIVE) |
| Permisos | `INSERT` a `{anon, authenticated}` |
| `WITH CHECK` | **`true`** (sin restricción) |
| Riesgo | **CRÍTICO** — insert arbitrario de pedidos con JWT anon público |
| Corrección (requiere nueva autorización) | `DROP POLICY` + revoke INSERT anon según `supabase/sql/proposed-drop-pedidos-emergency-anon-insert.sql`; re-auditar |

Evidencia: `site/.data/staging-closure/rls-emergency-audit.json`

---

## 9. Pruebas de dispositivos

| Prueba | Ejecutada físicamente | Cómo |
|--------|----------------------|------|
| Viewport móvil Chromium 390×844 | Sí (emulación) | Playwright staging + E2E |
| Mic UI visible / touch 44px | Sí (emulación) | E2E functionality-close |
| Adjuntos / ubicación → checkout | Sí (emulación) | E2E |
| Grabación MediaRecorder real | Parcial | WAV sintético/generado enviado a `/media` (no micrófono de hardware) |
| **iPhone / Safari real** | **No** | Requiere validación manual: permisos mic, `audio/mp4`, teclado, checkout |
| **Android Chrome real** | **No** | Requiere validación manual: mic, adjuntos, teclado, checkout |

**No** se presenta Chromium como prueba física de Safari.

---

## 10. Errores encontrados

1. Turno voz completo → sin `propose_add` en UI (flaky / tool budget en primer intento con Coca-Cola).
2. Contador `mediaHttpCalls` no incrementa pese a `kind: media_audio` en historial.
3. `POST /api/orders/comprobantes` en staging: timeout observado una vez (orders sí 403 estable).
4. Staging process aún carga `SUPABASE_SERVICE_ROLE_KEY`; mitigado por proxy RO + `CHATBOT_BLOCK_ORDERS`, pero la credencial está en memoria del proceso.

---

## 11. Ausencia de pedidos y escrituras

| Control | Resultado |
|---------|-----------|
| `POST /api/orders` | **403** `orders_blocked_staging` |
| Playwright route + server guard | Activos |
| Checkout preview | «No se envía ningún pedido» |
| Proxy Supabase RO | Mutaciones bloqueadas en staging |
| Escrituras a producción desde esta prueba | **Ninguna** (SQL solo lectura; orders bloqueados) |
| Datos Pizzas El Trueno | **No modificados** |
| Deploy / migraciones | **No ejecutados** |

---

## 12. Suites

| Suite | Resultado |
|-------|-----------|
| Vitest | **687 passed**, 1 skipped (94 files) |
| `tsc --noEmit` | **OK** |
| `functionality-close-e2e.mjs` | **ALL CHECKS PASSED** (simulate path, 0 Gemini billable) |

---

## Veredicto

| Ámbito | Resultado |
|--------|-----------|
| Staging — STT live + propuestas live + carrito + checkout 12,25 | **GO staging (funcional)** |
| Piloto público `?chatbot=1` | **NO-GO** |

**Bloqueante principal:** política RLS crítica `pedidos_emergency_anon_insert` activa en producción.

**Bloqueantes menores / follow-up:** validación manual iPhone/Android; corregir contador media; preferir anon-only en proceso staging; opcional re-smoke bebida si se autoriza presupuesto extra.

---

## Procedimiento de publicación (NO ejecutar — esperar autorización)

Objetivo exclusivo:  
`https://elmenuxfa.com/v/pizzas-el-trueno?chatbot=1`

### A. Antes de activar

1. Autorización escrita del owner (este informe + DROP RLS).
2. Aplicar (solo tras auth) el DROP de `pedidos_emergency_anon_insert` y re-correr la auditoría RO hasta `exists=false`.
3. Confirmar checkout producción usa solo `service_role` vía `POST /api/orders`.
4. Smoke manual iPhone Safari + Android Chrome (mic, teclado, checkout).

### B. Variables de producción (host)

```
CHATBOT_ENABLED=1
CHATBOT_SIMULATE_GEMINI=0
CHATBOT_MEDIA_LIVE=0          # subir a 1 solo con presupuesto media
CHATBOT_VOICE_STT=1           # si media live autorizado
CHATBOT_STAGING_MODE=0
CHATBOT_BLOCK_ORDERS=0        # solo en prod real
CHATBOT_ALLOWED_COMMERCE_IDS=<uuid Pizzas El Trueno>
CHATBOT_OWNER_LIVE_CONFIRM=<token acordado>
CHATBOT_QUOTA_BACKEND=filesystem|supabase   # persistente, no memoria
CHATBOT_LIVE_HARD_CAPS=1
CHATBOT_LIVE_MAX_GEMINI_CALLS=<cuota piloto>
CHATBOT_LIVE_MAX_COST_USD=<usd piloto>
CHATBOT_LIVE_MAX_MEDIA_CALLS=<n>
CHATBOT_LIVE_MAX_MEDIA_COST_USD=<usd>
CHATBOT_LIVE_BUDGET_FILE=<path persistente en volumen>
CHATBOT_MAX_TOOL_ROUNDS=4
CHATBOT_MAX_OUTPUT_TOKENS=256
GEMINI_API_KEY=<secret>
```

- No poner `GEMINI_API_KEY` en `NEXT_PUBLIC_*`.
- Allowlist **solo** Trueno en el piloto.
- Multimedia: gate server-side; si `CHATBOT_MEDIA_LIVE=0`, `/api/chat/.../media` debe 403/disabled.

### C. Activación

1. Deploy del build ya validado (sin migraciones de menú).
2. Set env + reinicio.
3. Abrir URL con `?chatbot=1` (flag de UI); comercio debe estar allowlisted.
4. Smoke: welcome → 1 propuesta → confirm → checkout abierto → **no** forzar pedido de prueba en horario real sin acuerdo.
5. Monitoreo: `live-budget` counters, logs `requestId`, 5xx en `/api/chat`, coste USD.

### D. Protección multimedia

- Cap media independiente dentro del global.
- Ephemeral disk only (no bucket público).
- Preflight coste: abortar si excede presupuesto.

### E. Rollback (< 2 min)

1. Quitar comercio de `CHATBOT_ALLOWED_COMMERCE_IDS` **o** `CHATBOT_ENABLED=0`.
2. Opcional: `CHATBOT_SIMULATE_GEMINI` no reactivar en prod; mejor apagar allowlist.
3. `CHATBOT_MEDIA_LIVE=0`.
4. Redeploy no necesario si env hot-reload / restart basta.
5. Verificar `https://elmenuxfa.com/v/pizzas-el-trueno?chatbot=1` ya no habla con Gemini live.

### F. Fuera de alcance de este cierre

- No deploy ahora.
- No activar públicamente.
- No mutar datos Trueno.
- No migraciones prod.
- No DROP de la política de emergencia sin nueva autorización.

---

**DETENTE.** Esperando autorización final de producción del owner.
