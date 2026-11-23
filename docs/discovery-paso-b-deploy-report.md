# Discovery Assistant — Paso B deploy report

**Fecha:** 2026-11-23  
**Autorización:** solo Paso B (navegación determinista, sin Gemini)  
**Sin migraciones · sin Gemini facturable · sin Paso C**

## Publicado

| Campo | Valor |
| --- | --- |
| Commit de código base | `f63d84a` (health) / rama `feature/discovery-assistant` |
| Deployment ID | `dpl_G3xi2R8zza249MmXCsu8GZ653CKz` |
| URL | https://kosmenu-pukiq47nc-bryanbencomo4s-projects.vercel.app |
| Alias | https://elmenuxfa.com |
| Vercel | **Ready** |
| Rollback previo | `dpl_4H1G41CmLBbca8MNXTNRBGbdWZKK` (Paso A) |

## Flags efectivos (Production)

| Flag | Valor |
| --- | --- |
| `NEXT_PUBLIC_DISCOVERY_ASSISTANT` | `1` |
| `DISCOVERY_ASSISTANT_ENABLED` | `1` |
| `DISCOVERY_ASSISTANT_ALLOW_GEMINI` | `0` |
| `DISCOVERY_ASSISTANT_SIMULATE` | `0` |
| `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION` | `0` |
| `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY` | `0` |

GET `/api/asistente` en vivo:

```json
{"ok":true,"enabled":true,"simulate":false,"liveGemini":false,"liveReason":"production_blocked","quotaBackend":"none","pageSize":24}
```

`CHATBOT_*` y `CHAT_SUPERVISION_*` **no** modificados.

## Comportamiento sin Gemini

- Chips / categorías → directory real.
- Texto libre → path determinista `directory-fallback` (`skippedLlm: true`), **no** se presenta como IA.
- Modelo efectivo: `directory-fallback` (búsqueda del directorio).
- 0 requests a `generativelanguage.googleapis.com` en Playwright prod.

## Verificación post-deploy

| # | Check | Resultado |
| --- | --- | --- |
| 1 | `/asistente` móvil | **OK** shell live |
| 2 | Botones / composer sin force | **OK** Playwright `forceClicks:false` |
| 3 | Búsqueda real | **OK** pizzas→Nápoles; napoles→1; hamburguesas→8+ |
| 4 | Paginación sin duplicados | **OK** API offset overlap=0 (11 hamburguesas) |
| 5 | Filtros / visibilidad directorio | **OK** (Trueno sigue excluido del directorio público — no es regresión) |
| 6 | Enlaces menú | **OK** `/v/auto-pizzas-napoles` hit-test |
| 7 | Gemini off | **OK** `liveGemini:false`, 0 HTTP Gemini |
| 8 | Menús tradicionales | **OK** Trueno + Maicol 200 |
| 9 | Checkout surface | **OK** (sin pedidos) |
| 10 | Supervisión Trueno | **OK** `authorized:true`, postgres |
| 11 | WaSender | **OK** `/api/send-order` 405 GET |
| 12 | Otros restaurantes | **OK** |

Evidencia: `docs/discovery-paso-b-screenshots/`, `docs/discovery-paso-b-postdeploy-checks.json`.

## GO / NO-GO

| | |
| --- | --- |
| Paso B | **GO completado** |
| Paso C (Gemini real) | **NO autorizado** — requiere migración prod + presupuesto + OK explícito |

Detenido tras Paso B.
