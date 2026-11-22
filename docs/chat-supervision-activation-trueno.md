# Activación piloto — supervisión humana (Pizzas El Trueno)

**No ejecutar sin autorización explícita.** Este documento es el kit de activación; no aplica migraciones ni despliega.

## Estado verificado (read-only)

| Check | Resultado |
| --- | --- |
| Prod `chat_conversations` / `chat_messages` / `chat_supervision_events` | **null** (migración no aplicada) |
| Preview mismas tablas | comprobar en el momento de activar |
| Trueno `id` | `0aa8c53b-07f1-446e-8b88-66c2b7ae89ea` |
| Trueno `whatsapp` público | `+584140821633` |
| `config_negocio.supervision_whatsapp` | **ausente** → el código caerá a `notify_whatsapp` / contactos / `comercios.whatsapp` |

Recomendación antes del piloto: fijar `branding_ia.config_negocio.supervision_whatsapp` al número autorizado para avisos (puede diferir del WhatsApp público del menú).

## Orden seguro

**Nota (evidencia read-only):** preview **no** sirve (sin `comercio_members`). Piloto = **prod** + flags Trueno.

1. Autorizar en el chat la frase exacta: `I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION`
2. Aplicar (script gated — no corre sin la frase):
   ```powershell
   $env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
   $env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
   node site/scripts/apply-chat-supervision-migration.mjs
   ```
   - Incluye tablas/RPC + publication Realtime.
   - RPC takeover usa `chat_user_can_supervise(p_user_id)` (compatible con service_role del panel).
3. Variables de entorno app (solo Trueno), **sin** MEMORY/E2E:
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
7. Preferir `config_negocio.supervision_whatsapp` dedicado antes del piloto:
   ```powershell
   $env:CHAT_SUPERVISION_WHATSAPP_CONFIRM='I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP'
   $env:CHAT_SUPERVISION_WHATSAPP_E164='+58XXXXXXXXXX'
   node site/scripts/set-trueno-supervision-whatsapp.mjs
   ```

## Deep links / panel comerciante

- WaSender puede apuntar a `https://elmenuxfa.com/panel/conversaciones/{id}` (Next) **o** `https://app.elmenuxfa.com/panel/conversaciones/{id}` (Flutter).
- En Flutter: Configuración → **Conversaciones del asistente** (bandeja nativa + Realtime postgres_changes).
- Deep link en host Flutter: tras login abre la conversación en la bandeja nativa.

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
