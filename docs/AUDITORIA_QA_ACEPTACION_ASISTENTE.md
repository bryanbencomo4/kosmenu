# QA FINAL DE ACEPTACIÓN — Asistente del negocio

**Base fix:** `476212e` → este commit (último fix Flutter blank)  
**Rama:** `feature/business-admin-assistant`  
**Target:** Supabase Preview `gsfxqzvmyzjjgpigrste` únicamente  
**QA commerce:** `QA_CHATBOT_2026 pizzas el trueno` (clon aislado; Trueno real no tocado)  
**Flutter:** FVM `3.41.6` (`.fvmrc`) — release build `build/web-preview-qa` en `:5000`  
**API:** Next Preview `http://127.0.0.1:3024`  
**Snapshot/restore:** `docs/audit/qa-acceptance-snapshot.json` → **restaurado** al final  

---

## Resultado final

### **GO** para piloto controlado (Preview / staging interno)

**No es GO de producción.** Producción y Trueno real no se tocaron.

### Por qué pasa a GO (piloto)

1. **Flutter web blank resuelto** en Chrome real: release + CanvasKit local + shell que solo se oculta en `flutter-first-frame` (antes se ocultaba al montar `flutter-view` y dejaba púrpura vacío). Canvas en shadow DOM `929×917`; chat visible.
2. **E2E aislado** `http://127.0.0.1:5000/asistente` ↔ Preview: sesión QA → multi-negocio → API con `Origin: :5000` → propose/`apply` → persistencia.
3. **Fotos:** upload + `productos.imagen_url` OK en Preview (bucket disponible: `comprobantes`). Bucket `product-images` **ausente** en Preview. **IA** `generate-product-images-ai` → **404** (documentado; no provisionado).
4. **Pedidos:** actualización de estado vía chat confirmada (`pendiente` → `confirmado`); consulta por UUID/listado sigue frágil en Preview (mensaje “No pude…”), no bloqueante del piloto de escritura.
5. **Regresión:** precio + stock `apply` OK; shapes verify post-restore OK.
6. **Restore QA** ejecutado; Campesina vuelve a `6.8` / `disponible=true`; `en_linea=false`.

---

## Fix Flutter blank (este cierre)

| Cambio | Archivo | Efecto |
|---|---|---|
| Shell solo tras primer frame | `web/boot-fast.js` | Evita púrpura vacío al montar `flutter-view` antes de CanvasKit |
| `SystemChrome` solo mobile | `lib/main.dart` | Evita hangs innecesarios en web |
| Serve release Preview | `site/scripts/_run-flutter-web-preview.mjs` (`build`/`serve`) | Build release con CanvasKit local en `:5000` |

**Evidencia Chrome (CDP :9222):**  
- `docs/audit/acceptance-screenshots/flutter-web-asistente-chrome.png` — login/chat pinta  
- `docs/audit/acceptance-screenshots/flutter-asistente-authed.png` — multi-shop autenticado  
- `docs/audit/qa-acceptance-flutter-chrome-*.json`

---

## Operaciones re-validadas (último fix)

| Operación | Resultado | Evidencia |
|---|---|---|
| Flutter paint `/asistente` | ✅ Chrome real | screenshots + CDP |
| Multi-shop + select QA | ✅ | flutter-asistente-authed.png |
| Precio Campesina → 6.31 + apply | ✅ persistió | `qa-acceptance-ops-finish-*.json` |
| Stock agotar Campesina + apply | ✅ | mismo |
| Pedido → confirmado/preparación + apply | ✅ | `qa-acceptance-orders-*.json` |
| Upload foto + write `imagen_url` | ✅ (`comprobantes`) | ops-finish |
| IA generate-product-images-ai | ❌ 404 Preview | documentado |
| Restore snapshot | ✅ verify 36 productos, 2 pagos, 1 promo | `qa-acceptance-verify-*` |

---

## IA imágenes (estado)

- Edge function **no desplegada** en Preview → **404**.  
- Tablas/secrets AI no provisionados (fuera de este cierre; no abrir fase infra).  
- Camino soportado para piloto: **upload manual** + variants en código prod; en Preview solo bucket `comprobantes` disponible para la prueba de escritura.

---

## Criterio de aceptación vs evidencia

| Criterio | ¿Cumple? |
|---|---|
| Flutter FVM del proyecto | ✅ 3.41.6 |
| Build/run web → Preview only | ✅ dart-defines Preview + API `:3024` |
| E2E UI Flutter web en Chrome | ✅ paint + sesión + chat |
| Ops + persistencia Preview | ✅ precio, stock, pedido update |
| Reflejo shapes Flutter (DB) | ✅ verify post-restore |
| Permisos / confirm / aislamiento | ✅ (previo + re-test apply) |
| IA Preview | ❌ documentado |
| Restore QA | ✅ |
| Prod / Trueno real | ✅ no tocados |

---

## Piloto controlado (alcance)

1. Solo Preview / staging; flags del asistente fuera de producción.  
2. Superficies: Flutter `/asistente` (release) y/o Next `/asistente-negocio` contra Preview.  
3. No depender de IA generativa de fotos hasta provisionar Preview.  
4. Trueno real y prod: **fuera de alcance**.

---

## Veredicto

**GO para piloto controlado.**  
**NO-GO producción** hasta: bucket/product-images + decisión IA + smoke en host app real si aplica.
