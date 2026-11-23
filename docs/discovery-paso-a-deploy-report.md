# Discovery Assistant — Paso A deploy report

**Fecha:** 2026-11-23  
**Autorización:** solo Paso A (código con discovery OFF)  
**Sin migraciones · sin Gemini facturable · sin Paso B/C**

## Publicado

| Campo | Valor |
| --- | --- |
| Commit | `41789d05b5eefd2cb20b8b755d6274ff8d4d8717` |
| Rama | `feature/discovery-assistant` (pushed origin) |
| Deployment ID | `dpl_4H1G41CmLBbca8MNXTNRBGbdWZKK` |
| URL deploy | https://kosmenu-a7n5vb0hx-bryanbencomo4s-projects.vercel.app |
| Alias | https://elmenuxfa.com |
| Vercel | **Ready** (Production) |
| Health version | `41789d05b5eefd2cb20b8b755d6274ff8d4d8717` |

### Prep vs producción previa

- Producción previa era ancestro de este HEAD (`bd4366c` ⊆ `41789d0`).
- Incluye covers Bebidas (`ced6869`) + discovery OFF.
- Supervisión / WaSender recipients (`cdd82dc`) presentes en el historial desplegado.
- Diff operativo vs prod previa: middleware `/asistente`, offset directory (default 0 = mismo comportamiento), hide WA en `/asistente`, UI/API discovery (apagadas), tests/docs.
- Sin secretos en el commit. Untracked locales no desplegados vía git junk scripts.

## Flags efectivos

No se reescribieron env vars de Vercel (bloqueo de `--force` en Production; innecesario).

| Flag | Efectivo en prod |
| --- | --- |
| `NEXT_PUBLIC_DISCOVERY_ASSISTANT` | unset → **off** (página “Asistente no disponible”) |
| `DISCOVERY_ASSISTANT_ENABLED` | unset → **false** |
| `DISCOVERY_ASSISTANT_ALLOW_GEMINI` | unset → **false** |
| `DISCOVERY_ASSISTANT_SIMULATE` | **false** (forzado off en production) |
| `quotaBackend` (GET `/api/asistente`) | **`none`** |
| `liveGemini` | **false** (`discovery_disabled`) |

Chatbot / supervisión existentes en Vercel **no** se modificaron (`CHATBOT_*`, `CHAT_SUPERVISION_*` intactos).

## Comprobaciones post-deploy

| # | Check | Resultado |
| --- | --- | --- |
| 1 | Vercel Ready | **OK** |
| 2 | Menú Trueno | **OK** 200 |
| 3 | Otro restaurante (`arroz-chino-maicol`) | **OK** 200 |
| 4 | Directory API | **OK** (12/15, offset=0, hasMore) |
| 5 | Búsqueda + paginación | **OK** (pizza total=2, overlap=0) |
| 6 | Checkout surface + health | **OK** (sin crear pedidos) |
| 7 | Panel login | **OK** 200 |
| 8 | Supervisión Trueno | **OK** GET chat `authorized:true`, quota postgres; feed 401 sin auth (esperado) |
| 9 | WaSender route `/api/send-order` | **OK** 405 en GET (ruta viva, sin envío) |
| 10 | `/asistente` público | **OK** “Asistente no disponible”, sin shell live |
| 11 | API asistente / Gemini | **OK** `enabled:false`, `liveGemini:false`, POST `discovery_disabled` |
| 12 | Health crítico | **OK** `supabase:healthy`, version=41789d0 |

## Confirmaciones

- Supervisión humana Trueno: API chat autorizada; rutas supervision presentes.
- Restaurantes: Trueno + al menos otro menú 200.
- Sin migraciones aplicadas en prod.
- Sin pedidos/pagos de prueba.

## Rollback (si hiciera falta)

Revertir únicamente el deployment de código en Vercel al `dpl_` anterior (`dpl_98Qu9xi5vadPiikppA11NQWSMYnv`). **No** tocar Supabase.

## GO / NO-GO Paso B

| | |
| --- | --- |
| Paso A | **GO completado** |
| Paso B (activar navegación `/asistente` sin Gemini) | **NO autorizado aquí** — pendiente de tu autorización explícita |
| Paso C (Gemini real) | **NO-GO** hasta migración prod + presupuesto + OK explícito |

Detenido tras Paso A.
