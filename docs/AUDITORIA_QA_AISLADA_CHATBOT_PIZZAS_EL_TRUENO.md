# AUDITORÍA QA AISLADA — Chatbot admin (Pizzas El Trueno clone)

**Fecha (UTC):** 2026-11-25  
**Rama:** `feature/business-admin-assistant` @ `b26f669`  
**Objetivo:** comprobar qué escrituras del asistente administrativo **funcionan de verdad** en un entorno aislado, sin tocar producción ni implementar features nuevas.

**Informe previo (solo lectura / prod):** `docs/AUDITORIA_PARIDAD_CHATBOT_PIZZAS_EL_TRUENO.md` (~42/100)

---

## A. Resumen ejecutivo

Se clonó Trueno en **Supabase Preview** (`gsfxqzvmyzjjgpigrste`), se ejecutaron las 4 AllowedOps con confirmación real, se verificó persistencia en DB, se midió aislamiento y se restauró el entorno.

| Resultado | Detalle |
|---|---|
| Staging | Preview listo; gate anti-prod activo |
| 4 writes API | **5/6** persistieron en la pasada principal; `set_availability_on` falló con frase “Activa X” y **sí** con “Marca X como disponible” |
| Tools faltantes | Categorías / pagos / delivery / promos / estados de pedido: **sin propuesta de write** |
| Aislamiento chat | Producto decoy de otro comercio **no mutado** (precio 99 intacto) |
| Fuzzy match | Pedir “Decoy Pizza” con scope del comercio principal → propone **Hamburguesa** del mismo comercio |
| UI multi-negocio | **Bloqueada**: chips/nombre no seleccionan comercio; loop “¿Con cuál seguimos?” |
| Flutter | No verificado (app ligada a prod); evidencia UI = web `/asistente-negocio` en Preview |
| Restore | Comercios QA eliminados; `remaining=[]` |

### Puntuación de utilidad (nueva, con writes reales)

| Dimensión | Peso | Score 0–100 | Ponderado |
|---|---:|---:|---:|
| Consultas y comprensión | 15% | 70 | 10.5 |
| Preparación de operaciones | 15% | 55 | 8.3 |
| Ejecución administrativa | 35% | 48 | 16.8 |
| Persistencia y verificación | 20% | 78 | 15.6 |
| Seguridad / aislamiento / permisos | 15% | 62 | 9.3 |
| **TOTAL** | 100% | — | **~60.5 / 100** |

**Delta vs informe 1:** +18.8 pts, casi todo por poder **aplicar y verificar** writes en Preview. Sigue lejos de sustituir el panel (faltan creates y la mayoría de módulos; UI multi-shop rota).

---

## B. Entorno QA aislado

| Ítem | Valor |
|---|---|
| Supabase target | `https://gsfxqzvmyzjjgpigrste.supabase.co` (**Preview**) |
| Prod (solo lectura fuente clone) | `qqhberaayhohxlbbhdyi` — **nunca writes** |
| Gate | `site/scripts/_lib/audit-prod-write-gate.mjs` + test `site/tests/audit-prod-write-gate.test.ts` (3/3 OK) |
| Next QA | `http://127.0.0.1:3024` con `.env.qa-isolated.local` |
| Caps externos | `BUSINESS_ASSISTANT_GEMINI=0`, `CHATBOT_SIMULATE_GEMINI=1`, `CHATBOT_BLOCK_ORDERS=1`, Gemini calls=0, cost=0 |
| Comercio QA | `QA_CHATBOT_2026 pizzas el trueno` · slug `qa-chatbot-2026-trueno` · id `61693934-f0f6-4a34-b751-0c954e6b7b7e` |
| Owner QA | `qa-chatbot-2026-trueno@elmenuxfa.test` · id `e0922871-39c2-4740-a886-6cf2df1fbc4d` |
| Catálogo | 36 productos + 3 categorías (clone sintético desde Trueno prod RO) · `en_linea=false` · `billing_exempt=true` · whatsapp/tel null |
| Decoy aislamiento | `QA_CHATBOT_2026 decoy isolation` · id `474542d6-…` · producto Decoy Pizza @ 99 |

Scripts:
- `site/scripts/_audit-qa-isolated-write-suite.mjs` (`setup` / `test` / `cleanup`)
- `site/scripts/_audit-qa-followup-probes.mjs`

Estado: `docs/audit/qa-isolated-state.json` (`cleaned: true`)

---

## C. Operaciones ejecutadas (API autenticada)

Base: `POST /api/asistente-negocio` con JWT password del owner QA y `comercioId` explícito.

Evidencia: `docs/audit/qa-isolated-write-evidence-2026-11-25T18-35-22-791Z.json`  
Follow-up: `docs/audit/qa-isolated-followup.json`

| # | Op | Prompt / acción | Propuesta | Apply | DB after | Persistió |
|---|---|---|---|---|---|---|
| 1 | `set_price` | Campesina → 5.8 | Sí | 200 OK | 4.8 → **5.8** | **Sí** |
| 2 | `set_availability` off | “Marca como agotada Campesina” | Sí | 200 OK | `disponible=false` | **Sí** |
| 3 | `set_availability` on | “Activa Campesina” | **No** | — | quedó `false` | **No** (NLU) |
| 3b | `set_availability` on (reintento) | “Marca Campesina como disponible” | Sí | 200 OK | `disponible=true` | **Sí** |
| 4 | `set_hours` | horario Lun-Vie 11:00-21:00 | Sí | 200 OK | `horarios.note` actualizado (guarda el utterance completo) | **Sí** (calidad nota baja) |
| 5 | `set_en_linea` true | “Abre el negocio” | Sí | 200 OK | `en_linea=true` | **Sí** |
| 6 | `set_en_linea` false | “Cierra el negocio” | Sí | 200 OK | `en_linea=false` | **Sí** |

Al final de la suite se forzó de nuevo `en_linea=false`.

### Probes de tools inexistentes (sin write)

| Prompt | `hadProposal` | Respuesta típica |
|---|---|---|
| crea una categoría postres | false | vacío / no tool |
| agrega un método de pago Zelle… | false | malinterpretado como “nuevo plato” (texto de ayuda create) |
| crea una zona de delivery… | false | help genérico |
| crea una promoción 2x1 | false | help genérico |
| marca el pedido pendiente como entregado | false | help genérico |

**Conclusión:** no hay AllowedOps de create categoría/producto confirmable, pagos, delivery, promos ni cambio de estado de pedido.

---

## D. Aislamiento y permisos

| Prueba | Resultado |
|---|---|
| Chat scoped a comercio QA pidiendo precio de **Decoy Pizza** (otro comercio, mismo owner) | Decoy **sigue 99**. Propuesta incorrecta sobre **Hamburguesa** del comercio activo (fuzzy). |
| Update directo con JWT owner sobre producto decoy | **Permitido por RLS** (mismo `owner_id`) — esperado; el aislamiento chat ≠ aislamiento RLS entre locales del mismo dueño |
| Membership | Owner ve ambos comercios en UI |

---

## E. Verificación UI

### Web `/asistente-negocio` (Preview :3024)

Capturas en `docs/audit/screenshots-qa-isolated/`:

| Archivo | Qué muestra |
|---|---|
| `01-login.png` | Card Entrar / Registrarme en chat |
| `02-multi-shop.png` | Login OK → “Tienes varios negocios” + chips |
| `03-multi-shop-stuck.png` / `04-select-still-stuck.png` | Loop: nombre del comercio, comando de precio y “usar negocio …” **no rompen** la selección |

**Bug UI/NLU multi-shop (bloqueante en UI):**
1. El cliente **no envía `comercioId`** en el body.
2. `select_comercio` solo dispara con `\b(usar|seleccionar|negocio)\b`.
3. El match usa `nombre.includes(hint)` con `hint = raw` completo → **invertido / imposible** para frases tipo “usar negocio QA_…”.

Por eso la verificación de writes desde la interfaz web **falló por selección de comercio**, no por el path de confirm HMAC (que sí funciona vía API con `comercioId`).

### Flutter
No aplicable en este entorno: la app apunta a producción. No se hicieron writes ni logins contra Trueno real.

---

## F. Errores / bloqueos observados

1. **“Activa {producto}”** no propone `set_availability` (help genérico); sí con “Marca … como disponible”.
2. **Multi-shop UI stuck** (ver §E) — impide UAT manual cuando el owner tiene ≥2 comercios.
3. **Fuzzy product match** puede editar el producto equivocado del mismo comercio.
4. **`set_hours`** persiste el texto crudo del usuario como `horarios.note` (funciona, UX pobre).
5. **Create/payment/delivery/promo/order-status**: sin tools — el bot no escribe.
6. Intent “método de pago” cae en copy de “nuevo plato” sin herramienta real.

---

## G. Restore

```text
cleanup: ok
deletedComercios: [61693934-…, 474542d6-…]
verify remaining: []
```

Usuario auth QA se dejó (sin comercios asociados). Preview no tocó prod. Gate unit tests verdes.

---

## H. Comparación con informe 1

| | Informe 1 (prod Trueno) | Informe 2 (Preview QA) |
|---|---|---|
| Writes aplicados | 0 (`en_linea=true`) | 4 familias AllowedOps aplicadas + verificadas |
| Persistencia comprobada | No (solo propose→cancel) | Sí en Preview |
| Score utilidad | ~41.7 | **~60.5** |
| Bloqueo principal | política `en_linea` + tools faltantes | tools faltantes + multi-shop UI + NLU fringe |

---

## I. Qué no se implementó (como se pidió)

Ninguna feature nueva del asistente. Solo infraestructura de auditoría (gate, suite QA, env aislado, informe).

### Siguiente paso sugerido (fuera de esta auditoría)
Arreglar selección multi-comercio (chips → `comercioId` + match `hint.includes(nombre)`), endurecer resolución de productos, y solo entonces priorizar tools de create producto/categoría.
