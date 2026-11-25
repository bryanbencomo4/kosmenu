# QA FINAL DE ACEPTACIÓN — Asistente del negocio

**Base:** `25e63a9` (+ fix compile `const _ChatMsg`)  
**Rama:** `feature/business-admin-assistant`  
**Target:** Supabase Preview `gsfxqzvmyzjjgpigrste` únicamente  
**QA commerce:** `QA_CHATBOT_2026 pizzas el trueno` (clon aislado; Trueno real no tocado)  
**Flutter:** FVM `3.41.6` (`.fvmrc`)  
**Snapshot/restore:** `docs/audit/qa-acceptance-snapshot.json` → restaurado al final  

---

## Resultado final

### **NO-GO** para comenzar uso real en producción

### **GO CONDICIONAL** para despliegue controlado en Preview / piloto interno del chat web

**Por qué no es GO absoluto**

1. **Flutter web UI** compila y sirve en `http://127.0.0.1:5000/asistente` contra Preview, pero en el navegador de automatización el canvas queda en blanco (AppBar sí; cuerpo sin escena/`flt-scene-host`). No se pudo completar la matriz E2E *dentro* de Flutter web ni “recargar el panel Flutter” visualmente.
2. **IA de fotos** (`generate-product-images-ai`): **404** en Preview — función no desplegada; faltan tablas `ai_credits*` / `ai_image_jobs` y secret `GEMINI_API_KEY` en Preview. No se corrigió (infra amplia; riesgo de abrir otra fase). Variants WebP tras upload sí existen en código.

**Qué sí quedó demostrado**

- Chat real en UI Next `/asistente-negocio` (misma API que Flutter `BusinessAssistantScreen`): login QA → multi-negocio → selección aislada → propose → **Confirmar** → persistencia Preview.
- Matriz de operaciones + shapes legibles por Flutter (DB) + restore de snapshot.

---

## Operaciones aprobadas

| Operación | Chat (API/UI) | Persistió Preview | Shape Flutter |
|---|---|---|---|
| Precio | ✅ UI Next + Confirmar | ✅ `6.25` Campesina | ✅ `productos.precio` |
| Stock on/off | ✅ | ✅ | ✅ `disponible` |
| Variaciones / tamaños | ✅ | ✅ | ✅ `opciones_menu.tamanos` |
| Crear categoría | ✅ | ✅ | ✅ `categorias` |
| Crear producto | ✅ (nombre strip `QA Plato X`→`QA X`) | ✅ | ✅ |
| Horario | ✅ | ✅ | ✅ `horarios.days` |
| Abrir / cerrar | ✅ | ✅ | ✅ `en_linea` |
| Delivery zonas | ✅ | ✅ | ✅ `delivery_config.zones` |
| Delivery polígonos | ✅ | ✅ | ✅ `area_zones.polygon` |
| Pagos sync Flutter tipo | ✅ | ✅ | ✅ `transferencia__usd__N` |
| Tasa | ✅ | ✅ | ✅ `exchange_rate_*` |
| Promoción CRUD | ✅ (tras cooldown rate-limit) | ✅ `upsell_rules` | ✅ |
| Invite / revoke staff | ✅ | ✅ `comercio_member_invites` | ✅ |
| Cancelar sin write | ✅ | ✅ precio intacto | — |
| Ambigüedad pide aclaración | ✅ | — | — |
| Aislamiento decoy | ✅ | decoy sin cambio | — |
| Multi-shop UI | ✅ chips QA vs decoy | — | — |

Evidencia:  
- `docs/audit/qa-acceptance-ui-e2e-*.json`  
- `docs/audit/qa-acceptance-retry-*.json`  
- `docs/audit/acceptance-screenshots/` (login, multishop, confirm precio)

---

## Operaciones fallidas / incompletas

| Ítem | Estado | Motivo |
|---|---|---|
| E2E completo en **Flutter web** | Fallido | Canvas en blanco en browser de prueba; sin inputs/DOM usable |
| Recarga visual panel Flutter tras cada write | No ejecutada | Bloqueada por UI Flutter web vacía |
| Fotos IA `generate-product-images-ai` | Fallido | 404 Preview + schema AI + `GEMINI_API_KEY` ausentes |
| Fotos (upload + variants) | Parcial | Pipeline variants en upload; no ejercido E2E UI en esta pasada |
| Pedidos / estado pedido | No re-ejercido en UI chat esta pasada | Cubierto en regresión previa; no bloqueante de este informe |

**Nota:** el “false confirm” de `create_product` en la primera suite fue **falso positivo de verificación** (producto sí guardado como `QA be59`). Criterio “nunca confirmar sin guardar” **OK** en UI (Confirmar → DB 6.25).

---

## Evidencia de persistencia

- Precio UI: Confirm → `productos.precio = 6.25` (Campesina).  
- Suite matriz: 12/16 primera pasada + 3/3 retry (promo/invite/revoke) = **core completo**.  
- Contrato Flutter post-ops: `horarios.days`, `delivery_config`, `opciones_menu`, `metodos_pago.tipo`, invites, upsell.  
- Snapshot restaurado: productos 37→36, pagos 3→2, promos 2→1; `en_linea=false`.

---

## Problemas de seguridad

| Hallazgo | Severidad | Notas |
|---|---|---|
| Escrituras solo Preview | OK | Gate anti-prod activo |
| Trueno real | OK | No tocado |
| Confirmación destructiva | OK | Cancel no escribe; Confirmar sí |
| Aislamiento multi-comercio | OK | UI pide elegir; decoy no mutado |
| Rate-limit agresivo | Bajo | Suites largas reciben “vas muy rápido” (no bypass) |
| Secretos prod | OK | No modificados |
| Flutter web en blanco | Medio (UX) | Impide validar panel merchant web Flutter en este entorno |

---

## IA imágenes (punto 9)

**Bloqueo Preview real:** función no listada en `supabase functions list` Preview; invoke → **404**. Tablas wallet/jobs ausentes; sin `GEMINI_API_KEY` en secrets Preview.  
**No desplegado** en esta pasada (implica schema + secrets + worker = fase infra).  
Upload + `ensureImageVariants` permanece como camino soportado sin IA generativa.

---

## Criterio de aceptación vs evidencia

| Criterio | ¿Cumple? |
|---|---|
| Flutter FVM del proyecto | ✅ 3.41.6 |
| Build/run web → Preview only | ✅ dart-defines Preview + API `:3024` |
| E2E desde UI real del asistente | ⚠️ **Next UI sí** / Flutter web **no** |
| Todas las ops + persistencia | ✅ core (API+DB+UI Next precio) |
| Reflejo en Flutter tras reload | ⚠️ shapes DB sí / UI Flutter no |
| Permisos, confirm, aislamiento, ambigüedad | ✅ |
| Nunca confirmar sin guardar | ✅ |
| IA Preview | ❌ |
| Regresión | ✅ (matriz + restore) |

---

## Despliegue controlado (si se acepta GO CONDICIONAL)

1. No producción.  
2. Mantener flags del asistente solo en Preview/staging.  
3. Piloto interno sobre `/asistente-negocio` + API Preview.  
4. Antes de uso real: validar Flutter web en Chrome real (o app móvil) + decidir si se provisiona IA en Preview.

---

## Commit sugerido

Incluir fix compile Flutter (`const _ChatMsg`) + este informe + scripts de acceptance. **Sin deploy prod.**
