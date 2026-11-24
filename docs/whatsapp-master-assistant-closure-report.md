# elmenuxfa.com — Informe de cierre Asistente Maestro

**Rama:** `feature/wa-master-assistant`  
**Fecha:** 2026-11-24  
**Producción:** no tocada · flags OFF · sin WhatsApp real · sin Gemini facturable

---

## 1. Commits

| Commit | Tema |
|--------|------|
| `0460e93` | Arquitectura + draft SQL memoria |
| `0d088db` | Paquete 1 (identidad/memoria/orquestador) |
| *(este sprint)* | Paquetes 2–5: especialistas, discovery, auth gate, cuota, file/Preview stores, suite cierre |

## 2. Archivos principales

- `site/app/api/wa-master/_lib/` — orquestador, agent, quota, auth, discovery-bridge, memory(+file/supabase), specialists/{consumer,commercial,admin}
- `site/app/api/wa-entry/_lib/process.ts` — hook `PLATFORM_WA_MASTER` (default off)
- `supabase/preview-bootstrap/13-wa-master-assistant.sql` — Preview only
- `site/tests/wa-master-closure.test.ts` + `wa-master-orchestrator.test.ts`
- `docs/whatsapp-master-assistant-architecture.md`

## 3. Funciones terminadas (local / sim)

- Reconocimiento de coincidencia telefónica vs no-propiedad (`phone_match_is_not_ownership`)
- Señal de consumidor recurrente sin revelar pedidos
- Roles mixed + cambio de intención
- Memoria L1–L3 en memoria + **file store** (sobrevive reinicio) + cliente Supabase Preview
- Consumer: búsqueda con tools Discovery inyectables, zona persistida, “la segunda”, links menú
- Comercial: explicación, pricing link, draft de registro, deep-link panel (sin create-comercio)
- Admin lectura menú/tasa/disponibilidad; propuesta de precio/FX; auth gate (teléfono ≠ write)
- Soporte/reclamo + escalado humano + pausa
- Cuota exclusiva Master (memory) · Gemini live **rechazado** sin autorización
- Fallback router clásico si Master OFF
- Shadow mode

## 4. Pendientes y bloqueantes

| Función | Bloqueante exacto |
|---------|-------------------|
| Escritura admin (precio/producto/FX/delivery) vía WA | No hay API server segura WA; Flutter/RLS no es canal autorizado |
| Auth fuerte comerciante (OTP/magic link) | Flujo no implementado; solo `test_inject` / panel |
| Registro 100% conversacional (crear comercio) | No existe create-comercio tokenizado server-side |
| Gemini live Master | `live_gemini_not_authorized_this_sprint` + sin llamadas facturables |
| Cuota Postgres Master en Preview aplicada | SQL listo; **no aplicada** a ningún proyecto en este sprint |
| Identity loader service-role prod | No cableado a prod; tests usan catálogo inyectado |
| Historial pedidos privados | Intencionalmente no expuesto |

## 5. Gemini y cuotas

- Default: `PLATFORM_WA_MASTER_ALLOW_GEMINI=0`, `SIMULATE=1`
- Cuota propia `wa_master_quota*` (no Discovery)
- Live: reserva + refuse (sin HTTP a Google)

## 6. Memoria persistente

- L1 turns · L2 summary (zone, restaurants, signupDraft, pendingAdminProposal) · L3 profile
- File store verificado en test de reinicio
- Supabase Preview schema en bootstrap 13 (no prod)

## 7. Reconocimiento

- Match whatsapp/telefonos/supervision → `merchant_candidate` (no owner automático)
- Pedidos phone → signal only
- Multi-comercio → selección por nombre público

## 8. Búsqueda restaurantes

- `executeDiscovery` bridge + mocks verificables en cierre
- Enlaces `https://elmenuxfa.com/v/{slug}`
- No inventa locales

## 9. Registro conversacional

- Califica, recuerda nombre, deep-link `app.elmenuxfa.com/?tab=register`
- **No** crea comercio por WA

## 10. Administración por chat

- Lectura + propuesta + confirmación bloqueada sin auth
- Con auth de prueba: aún declara write API pendiente (honesto)

## 11. Tests

```
wa-master-orchestrator + wa-master-closure + wa-entry-router
→ 62 passed
```

## 12. Seguridad

- Teléfono ≠ autorización de escritura
- Aislamiento multi-comercio / sin owner_id en respuestas
- Pedidos privados no listados
- Dedupe/concurrencia wa-entry
- Kill/fallback router intacto
- No SQL desde Gemini

## 13. Ejemplos

**Nuevo:** “Hola, quiero información” → aclara menú digital vs pedir comida  
**Consumidor:** hamburguesas → pide zona → San Cristóbal → lista real (mock) → “la segunda” → link menú  
**Comerciante:** cambio precio Margarita → muestra actual + pide verificación / panel  
**Mixed:** dueño pide hamburguesas → consumer  
**Humano:** reclamo → persona → siguientes mensajes ignorados (pause)

## 14. Riesgos

- Identity catalog vacío en runtime real hasta cablear Preview reads
- File memory no multi-instancia (usar Supabase Preview para eso)
- NLU aún mayormente determinista (Gemini live no armado)
- Admin write sigue en panel

## 15. GO/NO-GO piloto limitado (+584140821633)

| Criterio | |
|----------|--|
| Código local + tests | **GO** |
| Flag default OFF / prod intacta | **GO** |
| Piloto allowlist con Master ON | **GO condicionado** a: (1) aplicar SQL Preview, (2) identity loader Preview, (3) tu autorización explícita, (4) sin ALLOW_GEMINI facturable hasta nueva auth |
| Escritura admin / registro full chat | **NO-GO** |
| Activar ELMENUXFA1 público Master | **NO-GO** |

**Decisión:** listo para revisión y piloto allowlist **después** de tu autorización. Detenido antes de producción.
