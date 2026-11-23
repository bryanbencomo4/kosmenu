# Activación piloto — supervisión humana (Pizzas El Trueno)

**No ejecutar sin autorización explícita.** Este documento es el kit de activación; no aplica migraciones ni despliega.

## Estado verificado (read-only)

| Check | Resultado |
| --- | --- |
| Prod `chat_conversations` / `chat_messages` / `chat_supervision_events` | **null** (migración no aplicada) |
| Preview mismas tablas | comprobar en el momento de activar |
| Trueno `id` | `0aa8c53b-07f1-446e-8b88-66c2b7ae89ea` |
| Trueno `whatsapp` público | `+584140821633` |
| `config_negocio.supervision_whatsapp` | **ausente** → sin aviso WaSender hasta configurar (no se usa el WhatsApp público del menú) |

**Obligatorio antes del piloto con `CHAT_SUPERVISION_WASENDER=1`:** fijar `branding_ia.config_negocio.supervision_whatsapp` al número autorizado para avisos (puede diferir del WhatsApp público del menú). Sin esa preferencia (o `notify_whatsapp` / `whatsapp_avisos`), la notificación se marca `skipped` / `no_supervision_whatsapp`.

## Preflight (siempre primero)

```powershell
node site/scripts/chat-supervision-preflight.mjs
# opcional: sondear si el panel ya está desplegado
$env:BASE_URL='https://elmenuxfa.com'; node site/scripts/chat-supervision-preflight.mjs
```

## Orden seguro

**Nota (evidencia read-only 2026-11-22):** prod tiene `comercio_members` + WaSender RPC; `chat_*` = **null**. Preview **no** sirve (sin `comercio_members`). Piloto = **prod** + flags Trueno.  
`elmenuxfa.com/api/panel/conversaciones` aún **404** hasta merge/deploy de esta rama.  
HEAD de trabajo: `feature/chat-supervision-human` @ `64b37d7`+ (broadcast consumidor + remint).

1. Autorizar en el chat la frase exacta: `I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION`
2. (Recomendado) Activación one-shot schema + readiness:
   ```powershell
   $env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
   $env:CHAT_SUPERVISION_ACTIVATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_TRUENO_ACTIVATE'
   $env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
   node site/scripts/chat-supervision-activate-trueno.mjs
   ```
   O solo migración:
   ```powershell
   $env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
   $env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
   node site/scripts/apply-chat-supervision-migration.mjs
   ```
   - Incluye tablas/RPC + publication Realtime (SQL vía `-f`, compatible Windows).
   - RPC takeover usa `chat_user_can_supervise(p_user_id)` (compatible con service_role del panel).
3. Autorizar **deploy** de la rama (o merge) + variables de entorno app (solo Trueno), **sin** MEMORY/E2E:
   ```env
   CHAT_SUPERVISION_ENABLED=1
   CHAT_SUPERVISION_WASENDER=1
   CHAT_SUPERVISION_HUMAN_TAKEOVER=1
   CHAT_SUPERVISION_COMMERCE_IDS=0aa8c53b-07f1-446e-8b88-66c2b7ae89ea
   CHAT_SUPERVISION_SESSION_PEPPER=<pepper-no-commitear>
   ```
4. Smoke API contra tablas reales (gated):
   ```powershell
   $env:CHAT_SUPERVISION_SMOKE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_SMOKE'
   $env:BASE_URL='https://<app-with-flags>'
   $env:CHAT_SUPERVISION_SMOKE_BEARER='<merchant-jwt>'
   node site/scripts/chat-supervision-post-migration-smoke.mjs
   ```
5. Smoke dual UI (consumidor + panel login real) **sin** `CHAT_SUPERVISION_MEMORY`.
6. Confirmar **una** notificación WaSender al número de avisos (`CHAT_SUPERVISION_WASENDER=1`).
7. (Opcional staging) bench MEMORY previo: `node site/scripts/chat-supervision-memory-bench.mjs`.
7. Preferir `config_negocio.supervision_whatsapp` dedicado antes del piloto:
   ```powershell
   $env:CHAT_SUPERVISION_WHATSAPP_CONFIRM='I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP'
   $env:CHAT_SUPERVISION_WHATSAPP_E164='+58XXXXXXXXXX'
   node site/scripts/set-trueno-supervision-whatsapp.mjs
   ```

## Deep links / panel comerciante

- WaSender apunta a `https://elmenuxfa.com/panel/conversaciones/{id}` (`publicSiteUrl`) — mismo deploy Next que las APIs de chat/panel.
- En Flutter (tras deploy app): Configuración → **Conversaciones del asistente**, o deep link `app.elmenuxfa.com/panel/conversaciones/{id}` tras login.
- Criterio piloto: el enlace de WhatsApp debe abrir el panel Next autenticado sin depender del deploy Flutter.

Matriz de requisitos: `docs/chat-supervision-requirements-audit.md`.

## Rollback

```env
CHAT_SUPERVISION_ENABLED=0
CHAT_SUPERVISION_WASENDER=0
CHAT_SUPERVISION_HUMAN_TAKEOVER=0
```

Opcional (SQL DOWN al final de la migración). El chatbot consumidor sigue operando con flags off.

## Criterio GO

El comerciante de Trueno, con su sesión normal:

1. Recibe el WhatsApp con enlace `/panel/conversaciones/{id}`  
2. Abre, se autentica si hace falta, ve historial real  
3. Toma el control → Gemini deja de responder  
4. Escribe → el cliente lo ve sin recargar  
5. Devuelve al asistente → Gemini atiende de nuevo  

Hasta completar el paso 1–2 contra Supabase real (no memoria), el veredicto permanece **NO-GO**.
