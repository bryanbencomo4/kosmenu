# Discovery Assistant — informe listo para autorización (producción)

**Rama:** `feature/discovery-assistant`  
**Commit base revisado:** `900864c` (+ cierre prod en HEAD)  
**Destino público previsto:** `https://elmenuxfa.com/asistente`  
**Sin deploy / sin merge / sin migración en producción / sin Gemini facturable**

---

## 10. GO / NO-GO

| Decisión | Ámbito |
| --- | --- |
| **GO** | Autorizar **Paso A** (deploy código con flags OFF) cuando lo indiques |
| **GO** | Migración de cuotas **ya aplicada y probada en Supabase Preview** |
| **NO-GO** | Migración en **producción** hasta tu autorización explícita |
| **NO-GO** | Gemini real (`ALLOW_GEMINI`) hasta cuotas prod + presupuesto |
| **NO-GO** | Publicar experiencia simulada como IA real |

---

## 1. Resultado de migración en Preview

| Campo | Valor |
| --- | --- |
| Proyecto | `gsfxqzvmyzjjgpigrste` (`kosmenu-preview`) |
| Producción | **NO tocada** (`qqhberaayhohxlbbhdyi`) |
| SQL | `supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql` |
| Objetos | `ai_discovery_sessions`, `ai_discovery_usage`, `reserve_ai_discovery_quota`, `increment_ai_discovery_tokens` |
| RLS | habilitado en ambas tablas |

**Smoke Preview** (`site/scripts/discovery-quota-preview-smoke.mjs`) — **ok: true**

| Prueba | Resultado |
| --- | --- |
| Reserve básico | OK (session requests=1) |
| Tope por sesión | OK (`discovery session request limit`) |
| Tope mensual | OK (`discovery monthly request limit`) |
| Concurrencia 20→cap 5 | OK (`okCount=5`, `requests=5`, 15 rechazos) |
| Anon denegado | OK (RPC + INSERT + SELECT → permission denied) |
| Aislamiento `ai_chatbot_*` | OK (sin uso cruzado; tablas chatbot ausentes/intactas) |
| Increment tokens | OK |

---

## 2. Riesgos y permisos SQL

**Alcance SQL (seguro):** solo crea `ai_discovery_*` + RPCs. **No** altera pedidos, comercios, supervisión humana, `ai_chatbot_*`, Auth, pagos.

**Permisos:**
- RLS ON + **cero** policies → denegación por defecto
- `REVOKE ALL` tablas/RPC a `public` / `anon` / `authenticated`
- `GRANT` solo a `service_role`
- RPCs `SECURITY DEFINER` con `search_path = public`
- Atomicidad: `SELECT … FOR UPDATE` en la misma transacción (probado en concurrencia)

**Kill switches:**
- App: `DISCOVERY_ASSISTANT_ENABLED`, `ALLOW_PRODUCTION`, `ALLOW_GEMINI`, `POSTGRES_QUOTA_READY`
- DB opcional: `app.discovery_assistant_kill = on`

**Fail-closed Gemini:** error Postgres → `DiscoveryQuotaError` / `quota_unavailable` **antes** de llamar a Gemini; filesystem prohibido en `NODE_ENV=production`.

**Riesgos residuales:**
- Rate limit IP in-memory (no multi-instancia) → complementar WAF/Upstash en prod
- `GEMINI_API_KEY` compartida con chatbot; **contadores** aislados
- Preview no es réplica 1:1 de prod (chatbot quota tables pueden diferir); plan: re-smoke RPC en prod tras aplicar

---

## 3. Resultados completos de pruebas

| Suite | Resultado |
| --- | --- |
| Vitest | **127 files / 875 passed** (1 skipped) |
| Preview quota smoke | **ok** (concurrencia + caps + anon) |
| Playwright móvil | **ok** (`forceClicks: false`) |
| Playwright escritorio | **ok** (`forceClicks: false`) |

Pasos E2E (ambos viewports): abrir, pizzas, hamburguesas, nombre, ubicación, geo deny, resultados, carrusel, Ver más (24→40), menú `/v/`, chat CTA Trueno, fallo Gemini, búsqueda convencional post-fallo, vacío.

---

## 4. Estado de TypeScript

`npx tsc --noEmit` → **limpio** (exit 0).

---

## 5. Evidencia Playwright

- Reporte: `docs/discovery-assistant-screenshots/playwright-report.json` (`ok: true`, `forceClicks: false`, `geminiBillable: false`)
- Capturas: `01-welcome` … `07-menu-nav` en `docs/discovery-assistant-screenshots/`
- Widget WhatsApp: **0** en `/asistente` (no intercepta Enviar)

---

## 6. Flags necesarios

### Paso A — Deploy código OFF (recomendado primero)

```
NEXT_PUBLIC_DISCOVERY_ASSISTANT=0
DISCOVERY_ASSISTANT_ENABLED=0
DISCOVERY_ASSISTANT_ALLOW_PRODUCTION=0
DISCOVERY_ASSISTANT_ALLOW_GEMINI=0
DISCOVERY_ASSISTANT_SIMULATE=0
DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=0
```

### Paso B — Navegación determinista (sin Gemini)

```
NEXT_PUBLIC_DISCOVERY_ASSISTANT=1
DISCOVERY_ASSISTANT_ENABLED=1
DISCOVERY_ASSISTANT_ALLOW_PRODUCTION=1
DISCOVERY_ASSISTANT_ALLOW_GEMINI=0
DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres   # tras migración prod
DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=0   # Gemini sigue off
```

### Paso C — Gemini real (solo con autorización + presupuesto)

```
DISCOVERY_ASSISTANT_ALLOW_GEMINI=1
DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1
DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres
DISCOVERY_ASSISTANT_MAX_REQUESTS_PER_SESSION=40
DISCOVERY_ASSISTANT_MAX_MONTHLY_REQUESTS=<presupuesto>
DISCOVERY_ASSISTANT_MAX_MONTHLY_TOKENS=<presupuesto>
```

Defaults del código: flags OFF; prod `quotaBackend=none` hasta override.

---

## 7. Requisitos para Gemini real

1. Autorizar y aplicar la misma migración en **producción**
2. Smoke `reserve_ai_discovery_quota` con service_role en prod
3. Confirmar **cero** incremento en `ai_chatbot_usage` por tráfico discovery
4. Caps mensuales + monitoreo `estimated_cost`
5. Rate limit perimetral (WAF/Upstash)
6. `ALLOW_GEMINI=1` + `POSTGRES_QUOTA_READY=1` solo entonces
7. No publicar `SIMULATE` en producción (ya forzado off)

---

## 8. Procedimiento de despliegue

**Paso A — Deploy flags OFF**
1. Merge/deploy de `feature/discovery-assistant` (cuando autorices)
2. Verificar menús `/v/*`, pedidos, Trueno chatbot, supervisión
3. `/asistente` debe responder shell soft-unavailable o 404 de producto según flag UI

**Paso B — Activar navegación**
1. Flags Paso B en Vercel
2. Probar `https://elmenuxfa.com/asistente` en teléfonos reales
3. Confirmar chips, paginación, CTAs menú/chat según allowlist

**Paso C — Gemini**
1. Aplicar migración prod (autorización separada)
2. Caps + `POSTGRES_QUOTA_READY` + `ALLOW_GEMINI`
3. Monitorear `ai_discovery_usage` diariamente la primera semana

---

## 9. Plan de rollback

| Capa | Acción |
| --- | --- |
| UX pública | `NEXT_PUBLIC_DISCOVERY_ASSISTANT=0` |
| API | `DISCOVERY_ASSISTANT_ENABLED=0` |
| Gemini | `ALLOW_GEMINI=0` o `POSTGRES_QUOTA_READY=0` |
| Kill DB | `ALTER DATABASE … SET app.discovery_assistant_kill = 'on'` |
| Deploy | Revert del deploy Vercel al commit anterior |
| Datos | Tablas `ai_discovery_*` son aditivas; no requieren drop de emergencia |

Rollback **no** toca pedidos, pagos, chatbot de restaurantes ni supervisión.

---

## Revisión de rama (protección)

Cambios acotados a `/asistente`, API discovery, offset directory, hide WA widget, tests, docs, migración discovery.  
Sin cambios de pedidos, checkout, Auth, WaSender, Flutter, suscripciones.  
Ajustes menores en asserts de tests chatbot (copy welcome) — sin lógica de runtime.  
Sin credenciales en commits.

---

## Esperando tu autorización para

1. **Migración producción** del SQL de cuotas discovery  
2. **Deploy Paso A** (flags OFF)  
3. Más adelante: Paso B / Paso C
