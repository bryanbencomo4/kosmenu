# Cierre de bloqueantes de producción — voz + RLS

**Fecha:** 2026-11-22  
**Gemini live en esta fase:** **0 llamadas** (solo sim + mocks + PGlite)  
**Deploy / migración prod:** **NO ejecutados**

---

## 1. Causa exacta del problema de voz

**No fue STT ni un path distinto voz≠texto.**

El transcript live era correcto. El fallo estaba en la **política de uso de herramientas** del modelo ante pedidos compuestos con un SKU faltante:

| Evidencia | Resultado |
|-----------|-----------|
| A/B `…Hawaianas Normal y Grande` | `propose_add` ×2 |
| A/B `…Hawaianas… y una Coca-Cola` | `propose_add` ×0 — busca bebidas / “no encuentro” |
| Voz cierre `r_f226…` | 5 HTTP, 0 propuestas |
| Turno enfocado “Coca-Cola no existe; prepara propuestas” | 2 propuestas OK |

El modelo gastaba rondas en el ítem inexistente **antes** de llamar `prepare_cart_line_proposal` para las pizzas disponibles.

---

## 2. Corrección aplicada

| Archivo | Cambio |
|---------|--------|
| `site/app/api/chat/_lib/prompt.ts` | Regla de cumplimiento parcial: proponer lo disponible primero; Coca-Cola/faltantes después; no inventar |
| `site/app/api/chat/_lib/tools.ts` | Descripción de `prepare_cart_line_proposal` alineada |
| `site/app/api/chat/_lib/gemini.ts` | Soft-recovery: en la última ronda ejecuta tools y **devuelve** `pendingActions` si existen (no 502 vacío) |
| `site/app/api/chat/_lib/simulate-gemini.ts` | Mismo utterance voz+Coke → 2 pizzas + nota de bebida inexistente |
| `site/app/api/orders/comprobantes/route.ts` | Rechazo **415** si no es `multipart/form-data` (evita hang de `formData()` con JSON) |
| `site/scripts/probe-orders-comprobantes.mjs` | Probe con `AbortController` timeout |

---

## 3. Evidencia de pruebas (sin Gemini)

- Unit: `tests/chatbot-voice-first-turn-blockers.test.ts` — transcript voz → 2 tamaños 3.50+8.75, Coke no inventada, soft-recovery mock
- E2E Playwright (simulate): utterance exacto de voz → 2 tarjetas → carrito 2 → checkout · **0 Gemini**
- Probe staging: orders **403** · comprobantes **403** · sin timeout

---

## 4. Migración de seguridad (preparada y probada en aislamiento)

**Tabla:** `public.pedidos`  
**Política:** `pedidos_emergency_anon_insert` — `INSERT` a `anon`+`authenticated` · `WITH CHECK (true)`

**SQL de aplicación (NO aplicado a prod):**  
`supabase/sql/apply-drop-pedidos-emergency-anon-insert.sql`

- `DROP POLICY`
- `REVOKE INSERT` de `anon` y `authenticated`
- Mantiene acceso `service_role`

**Prueba aislada (PGlite, 0 prod):**  
`node site/scripts/rls-isolated-pedidos-emergency-test.mjs` → **OK**

| Paso | Resultado |
|------|-----------|
| Insert con política de emergencia | permitido |
| Tras DROP | RLS deniega insert anon-like |
| Rol BYPASSRLS (service_role) | insert OK (checkout API) |
| Policy owner select | se conserva |

Artefacto: `site/.data/rls-isolated/report.json`

**Rollback:** recrear policy + `GRANT INSERT` (documentado en el SQL / report).

---

## 5. Impacto sobre pedidos tradicionales

**Ninguno esperado.**  
`POST /api/orders` inserta con **`getServiceSupabaseClient()` / service_role** (bypass RLS). Web y Flutter público ya pasan por esa API. No hay política INSERT de merchant; solo SELECT/UPDATE.

Validación servidor de precios/productos/comercio/disponibilidad: **sin cambios** (sigue en `orders/route.ts`).

---

## 6. Suites

| Suite | Resultado |
|-------|-----------|
| Vitest | **698 passed**, 1 skipped |
| `tsc --noEmit` | **OK** |
| Playwright `functionality-close-e2e.mjs` | **ALL CHECKS PASSED**, gemini=0 |
| PGlite RLS harness | **OK** |
| Probe orders/comprobantes | **403 / 403**, sin hang |

---

## 7. Pendientes en teléfonos reales

- iPhone/Safari: mic `audio/mp4`, teclado, checkout
- Android Chrome: mic, adjuntos, teclado, checkout  
Emulación Chromium ≠ prueba física Safari.

---

## 8. Presupuesto mínimo — última prueba live (requiere nueva auth)

Una sola conversación voz E2E (STT + 1 turno chat con tools + opcional confirm UI sin LLM):

| Concepto | Tope sugerido |
|----------|----------------|
| HTTP Gemini | **6** (1 STT + hasta 5 primary/tool) |
| Coste | **US$0,02** |
| Media | **1** call / **US$0,008** dentro del global |
| Rondas tools | 4 |
| Objetivo | Mismo audio → ≥2 `propose_add` en el **primer** turno chat · carrito tras confirm · checkout 12,25 · 0 pedidos |

**No ejecutar sin autorización.**

---

## 9. Checklist de producción (restringido)

Ver `docs/chatbot-production-checklist.md` (actualizado).

Orden seguro:

1. Auth owner para **aplicar** `apply-drop-pedidos-emergency-anon-insert.sql`
2. Re-auditoría RO: policy ausente
3. Smoke checkout tradicional (1 pedido real controlado o staging con service_role)
4. Auth owner para **live voice** con presupuesto §8
5. Solo entonces: env prod allowlist Trueno + `?chatbot=1` (sin cambiar `en_linea`)
6. Monitoreo coste/errores + kill-switch allowlist

---

## 10. Veredicto

| Ámbito | Estado |
|--------|--------|
| Código voz (parcial fulfill + soft-recovery) | Listo · falta smoke live |
| RLS remedición | SQL + prueba aislada listos · **prod intacta** |
| Piloto público | **NO-GO** hasta: (1) aplicar DROP en prod con auth, (2) live voice E2E autorizado |

---

**DETENTE.** Sin migración en producción. Sin publicar chatbot. Esperando autorización.
