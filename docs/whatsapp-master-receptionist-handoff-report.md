# elmenuxfa.com — Recepcionista WhatsApp + handoff a asistentes

**Rama:** `feature/wa-master-assistant`  
**Producción:** **NO desplegado / NO activado**  
**Piloto Master:** sigue limitado a `584140821633` (sin cambio de allowlist)

---

## 1. Arquitectura final de handoff

```
WhatsApp (+584220451906 / ELMENUXFA1)
  → wa-entry (router clásico | Master allowlist)
    → Master recepcionista (flag PLATFORM_WA_MASTER_RECEPTIONIST)
      → respuesta breve
      → emite código opaco wa_handoff_codes (TTL 5 min, un solo uso)
      → URL:
          consumidor:  elmenuxfa.com/asistente?ref=wa&h=<code>
          negocios:    elmenuxfa.com/asistente-negocio?h=<code>
                         (alias business.*/asistente)
                         (app.elmenuxfa.com/asistente → redirect Flutter, no desplegado)
```

El código **no** incluye teléfono ni credenciales. Payload: intent, query, zone, operación pendiente, comercio candidato, draft de nombre.

Validación: `POST /api/wa-handoff/redeem` (consumo atómico; reuso/expirado/revocado → error).

**El handoff no es sesión admin.** Escrituras requieren auth + permisos en destino.

---

## 2. Hosting `app.elmenuxfa.com/asistente`

| Hecho | Detalle |
|--------|---------|
| Runtime real | **Flutter Web** (deploy separado), no Next |
| Implementación viable | Next: `/asistente-negocio` en `site/` |
| Alias Preview | `business.elmenuxfa.com/asistente` → rewrite a `/asistente-negocio` |
| app host | Redirect en `scripts/deploy_flutter_web.ps1` → `elmenuxfa.com/asistente-negocio` (**no desplegado**) |
| Bloqueo | No se puede montar la página Next nativa en el host Flutter sin romper el SPA |

URL empresarial funcionando en código/Preview path: **`/asistente-negocio`** (flags UI/API).

---

## 3. Acceso firmado validado (tests)

Vitest `wa-handoff-receptionist.test.ts`:

- Emisión opaca + redeem OK  
- Reuso → `consumed`  
- Expirado → `expired`  
- Revocado → `revoked`  
- Destino incorrecto → `destination_mismatch`  
- Manipulado/inexistente → `not_found`  

---

## 4. Transferencia de contexto

- Consumidor: query + zona en payload → Discovery aplica seed tras redeem.  
- Negocios: intent / pendingOperation / businessNameDraft / conversationHint → saludo contextual (no “¿en qué puedo ayudarte?” genérico).  
- Solo se afirma “búsqueda preparada” si el handoff se emitió.

---

## 5. Autenticación y permisos

- Teléfono WhatsApp ≠ autorización de escritura.  
- Asistente de negocios: orienta y propone; cambios reales → panel autenticado.  
- API conversacional de escritura de productos/precios/FX: **no armada** (documentado; sin fingir).

---

## 6. Funciones empresariales realmente disponibles

| Función | Estado |
|---------|--------|
| Orientación / planes (links oficiales) | Sí |
| Handoff contextual desde WA | Sí (flag) |
| Registro conversacional completo create-comercio | **Pendiente** (panel register) |
| Lectura menú / propuesta de edición en WA | Legacy; recepcionista prefiere handoff |
| Ejecución auditada de precio/producto/FX vía chat | **Pendiente** API segura |

---

## 7. Adaptación Discovery

- Acepta `?h=`, `?q=`, `?zone=`  
- Detecta intención comercial/admin → CTA a asistente de negocios (sin operaciones admin en Discovery)

---

## 8. Resultado de pruebas

| Suite | Resultado |
|-------|-----------|
| `wa-handoff-receptionist` + Master orch/closure/e2e | **39/39** |
| Playwright móvil | No ejecutado este sprint (UI flags off en prod) |
| Typecheck puntual | Cubierto por Vitest + build types en rutas nuevas |

Flags por defecto **OFF**:

```
PLATFORM_WA_MASTER_RECEPTIONIST=0
NEXT_PUBLIC_BUSINESS_ASSISTANT=0
BUSINESS_ASSISTANT_ENABLED=0
```

---

## 9. Riesgos críticos

1. Activar recepcionista en prod sin handoff store Postgres → fallback sin contexto.  
2. Desplegar redirect Flutter sin Next `/asistente-negocio` live → 404.  
3. Confundir handoff con login admin.  
4. Abrir Master al público.

---

## 10. Pendientes

- Redirect Flutter a producción (autorización aparte)  
- Persistencia `wa_handoff_codes` en prod  
- APIs seguras de escritura conversacional + confirmación  
- Registro create-comercio 100% conversacional  
- Playwright móvil E2E  
- Sesión Supabase embebida en asistente-negocio (hoy orienta + panel)

---

## 11. GO / NO-GO

| | |
|--|--|
| Código + tests Preview path | **GO** para seguir en Preview |
| Piloto limitado con recepcionista en prod | **NO-GO** hasta auth de deploy + flags + SQL handoff |
| Master público | **NO-GO** |
| Sustituir panel Flutter | **NO-GO** (no intentado) |

**Master allowlist permanece `584140821633`. Sin deploy de producción en este entregable.**
