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

## Post-cutover

| | Valor |
| --- | --- |
| Next (live) | **`dpl_HhHhyxdbQ1LnksqMKkDZeCTAckjK`** → elmenuxfa.com |
| Flutter (live) | **`dpl_BcSEFeDVt4N7mWwgLNNWjPTHvv9w`** → app.elmenuxfa.com |
| Git tip | `7e08233` (`feature/conversational-ecosystem-unify`) |
| Tag recovery | `recovery/pre-conversational-unify-20261126` |
| Flags | `CHAT_SUPERVISION_*=1` Trueno-only; `NEXT_PUBLIC_APP_SITE_URL=https://app.elmenuxfa.com` |

### Smoke manual Trueno

1. https://elmenuxfa.com/v/pizzas-el-trueno?chatbot=1 — chat cliente  
2. https://app.elmenuxfa.com/ — login `rest1@1xp.fr`  
3. https://app.elmenuxfa.com/panel/conversaciones — inbox  
4. https://app.elmenuxfa.com/asistente — bot negocio  

### Rollback (si falla)

```powershell
npx vercel rollback dpl_2ir7HPWbMgHV6Q6oLU9dh6owa5MQ --yes
npx vercel rollback dpl_4AA3TTJeYvHzYP1rV8rd4kiJehQg --yes
# + soft kill: CHAT_SUPERVISION_ENABLED=0 / HUMAN_TAKEOVER=0 / WASENDER=0
```
