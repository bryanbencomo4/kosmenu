# elmenuxfa.com — Informe final piloto Asistente Maestro

**Deployment ID:** `dpl_BSrmD1jNVcBniTvQdAVShiVTyMbE` (Ready, aliased `elmenuxfa.com`)  
**Commit base:** `6bd4228` · commits piloto: ver `git log --oneline 6bd4228..HEAD` en `feature/wa-master-assistant`  
**Fecha:** 2026-11-24  
**Pausa humana:** liberada 2026-11-24 (solo `584140821633`; auditoría en `backups/wa-master-clear-pause-20261124-013951/`)  

---

## 1. Deployment / commit

| | |
|--|--|
| Deploy armado | `dpl_BSrmD1jNVcBniTvQdAVShiVTyMbE` |
| Deploy previo Master OFF | `dpl_ARoY7XwkUtzguF7ftqiwHMy5wq7c` |
| Rama | `feature/wa-master-assistant` |

## 2. Gemini real

| | |
|--|--|
| Preview smoke (≤10 HTTP) | **OK** — 2 HTTP, 1025 in / 102 out, mode `gemini` |
| Piloto prod | **OK** — respuestas naturales en outbound |
| Cuota PG `2026-11` | requests **7**, tokens_in **5013**, tokens_out **401** |
| Costo est. (3.1 flash-lite) | ≈ **US$0.002** este piloto |
| Fallback | intacto (specialists si Gemini falla) |

## 3. Memoria persistente

**OK** en producción (`wa_master_threads` / `turns` / `profiles`).  
Resumen: zona `caracas`, `signupDraft.businessName = Pizza Nova Pilot`, `lastRestaurants` con TORO BRAVO/Alegría, `humanIntervened=true`.

## 4. Identity loader

**OK** (Supabase prod `comercios`/`pedidos`, sin Preview para datos del piloto).  
Reconocimiento comercial verificado (lectura menú *pizzas el trueno*). Teléfono ≠ autorización de escritura.

## 5. Conversaciones reales (webhook firmado → Wasender → +584140821633)

| # | Mensaje | Resultado |
|---|---------|-----------|
| 1 | Hola, quiero información | Aclara menú vs pedir (natural) |
| 2 | Quiero pedir hamburguesas | Pide zona |
| 3 | Caracas | TORO BRAVO + Alegría (links reales) |
| 4 | Muéstrame la segunda opción | Menú Alegría |
| 5 | Registrar restaurante | Flujo comercial, pide nombre |
| 6 | Se llama Pizza Nova Pilot | Guarda draft + link panel |
| 7 | ¿Recuerdas el nombre…? | Recuerda **Pizza Nova Pilot** |
| 8 | Cambiar precio pizza | Pide auth; **no ejecuta** cambio |
| 9 | Ver mis productos | Lectura pública / sin fingir escritura |
| 10 | Hablar con persona | Escalate → `human_handling` |

Latencia media webhook≈**1.7 s**.

## 6. Aislamiento allowlist

Outsider `584120019888` → router **clásico** (menú 1️⃣/2️⃣).  
Master **solo** `584140821633`.

## 7. Demás servicios

| Check | Estado |
|-------|--------|
| `/api/wa-entry/webhook` health | inbound/router/wasender/supabase OK |
| `/api/health` | supabase healthy |
| `/asistente` | 200 |
| directory | 200 |
| ELMENUXFA1 webhook/sesión/cola | **no tocados** |
| `wa_entry_*` | intactas tras SQL Master |

## 8. Pendientes (fuera de esta activación)

- Crear comercios completos desde WhatsApp  
- Modificar precios/productos/FX sin auth + API segura  
- Pedidos privados sin verificación  
- Apertura pública del Master  

## 9. GO / NO-GO

| | |
|--|--|
| **Piloto limitado 584140821633** | **GO** |
| Master a todo el público | **NO-GO** |
| Kill switch | `PLATFORM_WA_MASTER=0` (script `arm-wa-master-pilot-prod.mjs` PHASE=off) |

## 10. Confirmación allowlist

```
PLATFORM_WA_MASTER=1
PLATFORM_WA_MASTER_ALLOWLIST_DIGITS=584140821633
PLATFORM_WA_MASTER_ALLOW_GEMINI=1
PLATFORM_WA_MASTER_SIMULATE=0
PLATFORM_WA_MASTER_MAX_MONTHLY_REQUESTS=80
PLATFORM_WA_MASTER_MAX_GEMINI_HTTP_PER_TURN=2
```

**El Asistente Maestro quedó limitado exclusivamente a 584140821633.**
