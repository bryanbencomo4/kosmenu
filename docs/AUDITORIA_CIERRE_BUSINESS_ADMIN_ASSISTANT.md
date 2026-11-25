# CIERRE TÉCNICO — Business Admin Assistant

**Fecha (UTC):** 2026-11-25  
**Rama:** `feature/business-admin-assistant`  
**Alcance:** corregir bloqueos de las auditorías Trueno / QA aislada. Sin módulos nuevos. Sin writes a producción.

---

## Errores corregidos

| Prioridad | Problema | Fix |
|---|---|---|
| P1 | Chips multi-negocio no seleccionaban; cliente no enviaba `comercioId`; match invertido | Chips con `comercioId` / `shop:{id}`; cliente persiste y envía siempre `comercioId`; `resolveShopByName`; saludo al seleccionar |
| P2 | Fuzzy peligrosos (Decoy → Hamburguesa) | `resolveProductMatch` exacto/contención segura; ambiguos piden nombre; sin sustitución |
| P3 | “Activa X” no activaba; pagos/delivery/promos → add_product | Sinónimos availability; intent `unsupported` por tema |
| P4 | Horario solo como `note` crudo | Parser → shape Flutter `{timezone, days.{monday…}}` + resumen antes de confirmar |

---

## Pruebas (Preview `gsfxqzvmyzjjgpigrste`)

**Unit:** `business-assistant-closure.test.ts` + intelligence/data-probes — OK  

**Suite writes QA** (`qa-isolated-write-evidence-2026-11-25T18-50-42-657Z.json`):

| Op | Persistió |
|---|---|
| set_price | sí |
| set_availability off / on (“Activa …”) | sí / sí |
| set_hours (Flutter days Lun–Vie 11:00–21:00) | sí (`flutterCompatible: true`) |
| set_en_linea true / false | sí / sí |

**Aislamiento:** Decoy @ 99 intacto; sin propuesta; Hamburguesa no tocada (`safe: true`).  

**Multi-shop probe:** chips con id; selección por nombre y por chip+`comercioId`; precio con scope OK.  

**Restore:** comercios QA eliminados. Prod Trueno no tocado.

---

## Puntuación actualizada

| Dimensión | Antes (QA) | Ahora |
|---|---:|---:|
| Consultas | 70 | 74 |
| Preparación | 55 | 72 |
| Ejecución | 48 | 70 |
| Persistencia | 78 | 88 |
| Seguridad / aislamiento | 62 | 82 |
| **TOTAL** | **~60.5** | **~76 / 100** |

---

## Todavía no disponible (fuera de esta pasada)

Crear producto/categoría real, pagos, delivery, promociones, staff, cambio de estado de pedidos, foto con adjunto, tasa write, Flutter UAT directo (app → prod). El chat ya **clasifica** esos temas y responde “aún no / usa el panel” sin fingir writes.
