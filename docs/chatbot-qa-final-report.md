# El Menú XFA — Informe final de calidad del chatbot

**Fecha:** 2026-11-22  
**Rama:** `qa/chatbot-intelligence-v2`  
**Base:** `perf/prod-safe` @ `350bcc7`  
**Alcance:** consolidación Catalog Intelligence V2 + estrategia comercial + respuestas rápidas contextuales + auditoría verificable  
**Restricciones respetadas:** sin push a main/producción, sin migraciones, sin llamadas facturables a Gemini Live, sin pedidos reales en producción.

---

## 1. Estado del repositorio y commits

| Campo | Valor |
| --- | --- |
| Repo | `kosmenu_app` (workspace local) |
| Rama de trabajo | `qa/chatbot-intelligence-v2` |
| HEAD al iniciar QA | `350bcc7` — *Ship Trueno chatbot UX: order-mode entry, close-sale pay CTAs, and reliable checkout handoff.* |
| Commit de consolidación | `6e3c7b5a3b7590cdd857ac690fda31a2bb494d7c` |

### Archivos incluidos en la consolidación (código chatbot)

- `site/app/api/chat/_lib/catalog-search.ts` *(nuevo)*
- `site/app/api/chat/_lib/commercial-strategy.ts` *(nuevo)*
- `site/app/api/chat/_lib/tools.ts`
- `site/app/api/chat/_lib/cart-proposals.ts`
- `site/app/api/chat/_lib/prompt.ts`
- `site/app/_lib/search-text.ts`
- `site/app/v/[id]/_components/chat/chat-contact.ts`
- `site/app/v/[id]/_components/chat/chat-quick-replies.ts` *(nuevo)*
- `site/app/v/[id]/_components/chat/ChatSuggestedReplies.tsx`
- `site/app/v/[id]/_components/chat/ChatAssistantView.tsx`
- Tests de regresión asociados
- Este informe + protocolo de usabilidad comparativa

### Excluidos deliberadamente (no versionar)

- `.env*` / secretos / credenciales Supabase
- `site/scripts/_meal4fit_*`, `_flavor_imgs/`, `_parche_imgs/`, `_sushi_imgs/`
- `site/tmp_*`, `tmp_sushideliverycoro_*`
- `node_modules/.vite/`, `node_modules/.vitest-cache/`
- Audios privados / presupuestos con datos sensibles

`.gitignore` actualizado para ignorar esos artefactos de staging.

---

## 2. Funcionalidades presentes (verificadas en código + tests)

| Área | Estado | Evidencia |
| --- | --- | --- |
| Búsqueda inteligente (nombre/desc/categoría/opciones) | **Implementada** | `catalog-search.ts` + tests V2 |
| Indexación de sabores/tamaños | **Implementada** | options index + Coca-Cola → Refresco 2 Lt |
| Contacto del restaurante / reclamos | **Implementada** | `chat-contact.ts` + prompt aislamiento plataforma |
| Estrategia comercial determinista | **Implementada** | `commercial-strategy.ts` + tools `recommend_products` / `suggest_cheaper_alternatives` |
| Prompt anti-muletillas / playbook | **Implementada** | `prompt.ts` + `commercialPlaybookDigest()` |
| Respuestas rápidas contextuales | **Implementada** | `chat-quick-replies.ts` cableado en `ChatAssistantView` |
| Carruseles / catálogo sheet | **Presente** (previo) | tests catalog UX |
| Close-sale + checkout handoff | **Presente** (previo + chips) | close-sale chips + `checkout` action |
| Carrito con confirmación UI | **Presente** | proposals require confirmation |
| Voz (hold/lock/cancel) | **Presente** (previo) | `chatbot-voice-gestures.test.ts` |
| Respuestas citadas / swipe reply | **Presente** (previo) | gestos en bubble |
| Stickers / sonidos | **Presente** (previo) | tests sounds |
| Multimedia adjuntos | **Presente** (previo) | delivery-media-profile tests |

---

## 3. Funcionalidades pendientes / no verificadas en esta corrida

| Ítem | Motivo |
| --- | --- |
| Gemini Live E2E con catálogo Trueno real | Sin autorización de gasto; solo mocks/sim |
| Playwright visual 360/390/430/desktop | No hay suite Playwright tipada en `site/`; existen scripts mjs legacy no ejecutados aquí |
| Lighthouse / métricas de campo | No ejecutado en esta consolidación |
| Pruebas con consumidores reales | Protocolo entregado; sin panel de usuarios |
| Comparativa cronometrada vs WhatsApp humano | Protocolo entregado; sin inventar tiempos del competidor |
| Catálogos sintéticos 50/200/1000 en browser | No corridos; search unitario cubre ranking, no scroll UI a 1000 |
| Safari/iOS físico (gestos mic / scroll) | Solo tests unitarios de gestos; limitación de dispositivo documentada |
| Re-verificación RLS **en producción** de `pedidos_emergency_anon_insert` | Contrato SQL + test aislado OK; **no** se consultó el cluster prod |

---

## 4. Defectos encontrados

| ID | Sev | Defecto | Repro |
| --- | --- | --- | --- |
| D1 | P1 | Búsqueda “pizza campesina” / opciones no indexadas → falsos negativos (Coca-Cola como sabor) | Audit previo + tests V2 |
| D2 | P1 | Prompt cebaba ejemplo de Coca-Cola ausente | Prompt histórico |
| D3 | P1 | Contacto/reclamo podía filtrar número de plataforma | Prompt + intents débiles |
| D4 | P2 | Quick replies genéricos (no tamaño/sabor/cierre/reclamo) | UI previa |
| D5 | P2 | Muletillas comerciales / sin playbook de cierre | Prompt |
| D6 | P2 | Fuzzy `rest`→`res` podía devolver falso positivo inter-tenant en búsqueda | `chatbot-tools` tenant test |
| D7 | P3 | Tests desactualizados (formato moneda Intl; voice pending movido a `ChatVoiceNote`) | Suite chatbot |

---

## 5. Correcciones aplicadas

1. **Catalog Search V2** — tokenización con stopwords/category hints, índice de opciones, normalización `cocacola`/`dos litros`, ranking por campo, anti fuzzy corto.
2. **Tools** — `search_products` usa `searchCatalog`; tools `recommend_products` y `suggest_cheaper_alternatives`; `sorted_by` relevance/price_min.
3. **Cart proposals** — resolución vía `resolveCatalogProduct` + option match.
4. **Prompt** — sin ejemplo fijo de Coca-Cola faltante; aislamiento de contacto; playbook comercial; anti-muletillas.
5. **Contact intents** — reclamo/queja/pedido incompleto.
6. **Quick replies contextuales** — tamaño/sabor, close-sale, discovery, claim; anti doble-clic por `contextId`.
7. **Commercial strategy** — intents budget con números en palabras; human_support con `reclam\w*`.
8. **Tests de regresión** — `chatbot-catalog-intelligence-v2.test.ts` + ajustes de suite.

---

## 6. Casos de prueba (inteligencia prioritaria)

| Utterance | Resultado esperado | Resultado medido |
| --- | --- | --- |
| “Quiero una pizza Campesina” | Hit Campesina | PASS (unit) |
| “Tienes campesina?” | Hit Campesina | PASS |
| “Quiero una cocacola de dos litros” | Refresco 2 Lt + opción Coca-Cola | PASS |
| “Un refresco 2L sabor Coca-Cola” | Refresco 2 Lt | PASS |
| “Una pizza con maíz y pimentón” | Campesina | PASS |
| “Una pizza con bastante queso” | Hit con queso | PASS |
| “sushi espacial pluton” | 0 hits (no inventar) | PASS |
| “Me llevo la Campesina Grande” | intent `buy_intent` | PASS |
| “Tengo diez dólares” | intent `budget` | PASS |
| “Quiero reclamar mi pedido” | intent `human_support` + chips claim | PASS |
| Quick replies Normal/Grande | chips size_or_flavor | PASS |
| Close-sale pending | chips pagar + checkout | PASS |

---

## 7. Resultado de inteligencia del catálogo

**Veredicto:** el motor determinista recupera SKUs reales por nombre, ingredientes y opciones; no inventa productos en queries absurdas.  
**Riesgo residual:** sinónimos regionales no listados, typos fuertes, y catálogos mal modelados (sabor como SKU suelto) siguen dependiendo de datos del restaurante.

---

## 8. Resultado de estrategia de venta

Playbook inyectado en system prompt + tools de recomendación/alternativas baratas. Close-sale previo + chips de pago.  
**No verificado en vivo:** que Gemini obedezca el playbook en 100 % de turnos (requiere simulación autorizada o staging con cuota).

---

## 9. Resultado de respuestas rápidas

Contexto gana sobre idle: tamaños, close-sale, reclamo, discovery. Acciones `checkout` y `configure_product` cableadas. Límite ~4 chips. Validación de contexto stale en pick.

---

## 10. Resultado de UX móvil

No se ejecutó captura visual multi-viewport en esta corrida. Componentes existentes (composer visualViewport, carruseles, sheets) permanecen; no se rediseñó UI aprobada.

---

## 11. Resultado de voz y gestos

Suite `chatbot-voice-gestures` / voice-scroll / sounds: **PASS** en unit.  
**Limitación:** no comprobado en iPhone Safari físico (permisos mic, contaminación de sonidos de chat en grabación).

---

## 12. Resultado de carrito y checkout

Proposals con confirmación; open checkout vía close-sale / chip / “listo para pagar” (código previo + chips).  
**No** se crean pedidos automáticamente desde el chat. Idempotencia de pedidos cubierta por tests de seguridad existentes.

---

## 13. Resultado de contactos

Prompt exige solo WhatsApp del local; intents de reclamo ampliados; chips “Contactar restaurante”.  
**Pendiente:** smoke staging Trueno con `get_business_information` real (sin Gemini Live) para confirmar `+584140821633` vs plataforma.

---

## 14. Rendimiento y accesibilidad

| Métrica | Objetivo | Medido |
| --- | --- | --- |
| Vitest chatbot suite | verde | **258 passed / 1 skipped** |
| TypeScript `tsc --noEmit` | 0 errores | **PASS** |
| Lighthouse LCP/INP | documentar | **No ejecutado** |
| A11y axe | 0 críticos | **No ejecutado** |
| Catálogo 1000 productos UI | fluidez | **No ejecutado** |

---

## 15. Métricas de esfuerzo del consumidor

Protocolo: `docs/chatbot-usability-vs-whatsapp-protocol.md`.  
**Sin usuarios reales en esta corrida** → no se declaran mejoras de tiempo/toques vs WhatsApp.

Estimación **interna** (agente, no consumidor) solo para referencia de fricción del bot:

| Tarea | Mensajes escritos | Toques chips (ideal) | Preguntas extra esperadas |
| --- | --- | --- | --- |
| A. Pizza por ingredientes | 1 | 0–1 | 0–1 (tamaño) |
| C. Bebida por sabor | 1 | 0–1 | 0 |
| G. Finalizar | 0–1 | 1 (Finalizar/Pagar) | 0 |

---

## 16. Resultado Vitest

```
Test Files  35 passed
Tests       258 passed | 1 skipped
Scope       tests/chatbot* + rls-pedidos-emergency-drop
```

Sin llamadas Gemini reales (mocks/sim).

---

## 17. Resultado TypeScript

`npx tsc --noEmit -p site/tsconfig.json` → **exit 0**.

---

## 18. Resultado E2E

| Suite | Estado |
| --- | --- |
| Playwright tipado | **No disponible** en package |
| Scripts mjs legacy (`phase32-browser-e2e`, etc.) | **No ejecutados** en esta consolidación |
| Visual viewports 360/390/430/desktop | **Pendiente** |

---

## 19. Puntuación de calidad (fundamentada / 100)

| Dimensión | Peso | Score | Notas |
| --- | --- | --- | --- |
| Inteligencia y precisión | 30 | **24** | Unit PASS en casos prioritarios; sin Gemini Live |
| Experiencia de compra | 25 | **19** | Close-sale + chips; falta validación conversacional live |
| Interfaz y accesibilidad | 20 | **13** | Sin regresiones unitarias; sin a11y/visual matrix |
| Fiabilidad y seguridad | 15 | **11** | Contratos RLS/idempotencia OK; prod emergency policy no re-auditada en vivo |
| Rendimiento | 10 | **6** | Sin Lighthouse ni stress de catálogo grande |
| **Total** | **100** | **73** | |

**Bloqueantes críticos ocultos por el score:** ninguno demostrado en unit; el riesgo P0 de RLS prod sigue como **hipótesis no revalidada en cluster**.

---

## 20. Riesgos pendientes

1. **P0 potencial:** confirmar en producción que `pedidos_emergency_anon_insert` sigue dropeada (solo contrato local/SQL verificado).
2. Gemini puede ignorir playbook sin evals live.
3. Quick-reply parsing de “A o B” es heurístico (falsos positivos de texto libre).
4. Gestos de voz no validados en iOS Safari físico.
5. Artefactos de staging de otros restaurantes siguen en disco local (ahora ignorados por git).

---

## 21. GO / NO-GO para producción

### **NO-GO** para despliegue público / comercialización multi-restaurante

Motivos:

1. RLS emergency policy **no re-verificada en el cluster de producción** en esta auditoría.
2. Sin E2E browser / visual matrix / Lighthouse de esta rama.
3. Sin pruebas con consumidores ni comparativa WhatsApp con datos reales.
4. Sin autorización de smoke Gemini Live post-V2.

### Condicional **GO staging Trueno** (solo piloto controlado)

Si se autoriza deploy a staging/piloto **sin** merge a main/prod, tras:

- [ ] Verificar RLS pedidos en staging/prod (SELECT policies, no migrar desde aquí)
- [ ] Smoke contacto WhatsApp del local
- [ ] 10 turnos de compra manual en staging (Campesina + Coca-Cola opción + checkout)

---

## 22. Recomendaciones priorizadas antes de comercializar a otros restaurantes

1. **P0** — Auditoría RLS pedidos en prod (read-only) y evidencia firmada.
2. **P1** — Eval set Gemini (mock + N live autorizados) con golden transcripts Trueno.
3. **P1** — Playwright mínimo: search → option → add → checkout handoff en 390×844.
4. **P1** — Ejecutar protocolo usabilidad vs WhatsApp con ≥5 consumidores.
5. **P2** — Telemetría: tasa de search vacío, option miss, close-sale→checkout.
6. **P2** — Checklist de modelado de menú (sabores como opciones, no SKUs fantasma).
7. **P3** — Lighthouse + stress catálogo sintético 200/1000 en página de lab.

---

## Apéndice — Inventario “discutido vs implementado”

| Tema | ¿En código? |
| --- | --- |
| Búsqueda inteligente | Sí (V2) |
| Indexación opciones/sabores | Sí |
| Contactos restaurante | Sí |
| Estrategia comercial | Sí (determinista + prompt) |
| Recomendaciones | Sí (tool) |
| Quick replies contextuales | Sí |
| Carruseles | Sí (previo) |
| Catálogo completo sheet | Sí (previo) |
| Gestos de voz | Sí (previo; device pendiente) |
| Respuestas citadas | Sí (previo) |
| Stickers/emojis/sonidos | Sí (previo) |
| Multimedia | Sí (previo) |
| Carrito/checkout | Sí (previo + chips) |
