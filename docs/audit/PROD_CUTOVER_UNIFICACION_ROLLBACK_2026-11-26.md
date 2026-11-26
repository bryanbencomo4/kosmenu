# Prod cutover — unificación conversacional + rollback

**Fecha:** 2026-11-26  
**Piloto:** Pizzas El Trueno (`0aa8c53b-07f1-446e-8b88-66c2b7ae89ea` / `pizzas-el-trueno`)  
**Rama:** `feature/conversational-ecosystem-unify`

## Baseline ANTES del cutover (rollback targets)

| Surface | Proyecto Vercel | Deployment activo (pre-cutover) | Alias |
| --- | --- | --- | --- |
| Next | `kosmenu` | **`dpl_2ir7HPWbMgHV6Q6oLU9dh6owa5MQ`** | elmenuxfa.com |
| Flutter | `web` | **`dpl_4AA3TTJeYvHzYP1rV8rd4kiJehQg`** | app.elmenuxfa.com |

Schema supervisión: **SCHEMA_READY** (no re-aplicar migración).

## Rollback inmediato (si algo falla)

### 1) Soft kill (segundos, sin redeploy)

En Vercel `kosmenu` → Production:

```env
CHAT_SUPERVISION_ENABLED=0
CHAT_SUPERVISION_WASENDER=0
CHAT_SUPERVISION_HUMAN_TAKEOVER=0
```

Opcional chatbot Trueno:

```env
CHATBOT_ENABLED=0
```

### 2) Instant Rollback código

```powershell
# Next → baseline pre-cutover
npx vercel rollback dpl_2ir7HPWbMgHV6Q6oLU9dh6owa5MQ --yes --cwd site

# Flutter → baseline pre-cutover (proyecto web)
npx vercel rollback dpl_4AA3TTJeYvHzYP1rV8rd4kiJehQg --yes
```

(Si el CLI pide confirmación interactiva: Dashboard → Deployments → Promote/Rollback esos `dpl_`.)

**No** dropear tablas `chat_*` / handoff (aditivas).

## Orden de cutover

1. Tag git recovery  
2. Commit login canónico + unificación tip  
3. Confirmar env Trueno  
4. `npx vercel --prod --yes` (site)  
5. `.\scripts\deploy_flutter_web.ps1`  
6. Smoke Trueno  

## Post-cutover — anotar aquí

| | Nuevo dpl_ |
| --- | --- |
| Next | _(pendiente)_ |
| Flutter | _(pendiente)_ |
| Git SHA | _(pendiente)_ |
