# Informe — supervisión humana del chatbot

**Rama:** `feature/chat-supervision-human`  
**Estado:** supervisión implementada en rama `feature/chat-supervision-human`; evidencias locales verdes (dual **19/19**, Vitest **19**, tsc 0). Hardening: allowlist dedicada, feed HMAC (token obligatorio fuera de MEMORY), no democión de `human_handling`, notify de atención en MEMORY, alt-contact versionado, purge solo cerradas.  
**Veredicto:** **NO-GO** publicar.  
**Desbloqueo schema:** `I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION` (+ opcional `I_AUTHORIZE_CHAT_SUPERVISION_TRUENO_ACTIVATE`).  
**Antes de WaSender=1:** `I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP` + E.164 (ya no se usa el WhatsApp público del menú para avisos).  
**Preflight:** `node site/scripts/chat-supervision-preflight.mjs` (read-only).  
**Luego:** deploy/merge + flags Trueno + smoke real. Matriz: `docs/chat-supervision-requirements-audit.md`.

## 1. Arquitectura existente (auditoría)

Ver `docs/chat-supervision-architecture-audit.md`.

Resumen: WaSender vía `enqueue_wasender_message`; historial chat consumidor era `sessionStorage`; panel comerciante Flutter + Bearer; Next `admin` es plataforma; patrón Realtime existente = `postgres_changes` en `pedidos` (Flutter).

## 2. Archivos creados / modificados (esta iteración)

### Nuevos
- `site/app/_lib/supabase-browser.ts` — cliente anon + sesión panel
- `site/app/panel/login/**` — login email/password + redirect `?next=`
- `site/app/panel/_lib/usePanelSession.ts` — sesión sin pegar Bearer
- `site/app/panel/_lib/useConversationRealtime.ts` — `postgres_changes` por conversación
- `site/app/api/chat/_lib/supervision-memory.ts` — store in-memory (E2E/local)
- `site/scripts/chat-supervision-dual-playwright.mjs` — dual context consumer+merchant
- `site/scripts/chat-supervision-retention-purge.mjs` — purge gated por retención
- Flutter: `lib/services/chat_supervision_service.dart`, `lib/screens/chat_conversations_screen.dart`

### Modificados
- Welcome chatbot: aviso de privacidad discreto (`CHATBOT_WELCOME_VERSION=6`)
- Panel bandeja/detalle: auth sesión + Realtime + recovery 20s
- APIs panel/feed: rama memoria + takeover/return/close
- Auth panel: E2E bearer solo fuera de prod + comercio pinneado
- Migración: nota de publicación Realtime (comentada)
- `ChatAssistantView`: feed staff con dedupe + visibility (8s recovery, no 1–5s)
- `site/middleware.ts`: excluir `/panel` del rewrite a `/v/...` (crítico para enlaces WaSender)

## 3. WaSender reutilizado

`sendWhatsappText` + cola existente + `dedupe_key` en `chat_supervision_events`.  
Destino: solo `config_negocio.supervision_whatsapp|notify_whatsapp|whatsapp_avisos` (sin fallback a WhatsApp público del menú); bloquea soporte plataforma. Contacto alternativo al consumidor sí puede usar el WhatsApp público.  
Enlace: `merchantConversationHref` → `publicSiteUrl` (`https://elmenuxfa.com/panel/conversaciones/{id}`) — mismo deploy que la API; Flutter inbox es entrada alternativa.  
Si el enqueue falla: evento `failed` con backoff 1m/5m/15m (máx. 3) y `retryFailedSupervisionNotifies` en turnos posteriores; la cola `wasender_message_queue` reintenta la entrega una vez encolado.  
En modo memoria E2E la notificación se marca `skipped` (no llama WaSender salvo `CHAT_SUPERVISION_MEMORY_SEND_WASENDER=1`).

## 4. Persistencia

Tablas (migración pendiente de auth): `chat_conversations`, `chat_messages`, `chat_supervision_events`.  
Hash HMAC de `sessionId` por comercio. Notificación solo en conversación nueva/reapertura cerrada.  
Modo `CHAT_SUPERVISION_MEMORY=1` permite probar sin migración.

## 5. Auth comerciante

1. Producción/piloto: login `/panel/login` → sesión Supabase browser → Bearer automático.
2. Deep link `/panel/conversaciones/[id]` → si no hay sesión, redirect login con `next=`.
3. API: `getUserFromBearerRequest` + owner/`comercio_members` (`administrador|caja|marketing`).
4. Sin secretos en URL. RLS member select en migración.

## 6. Realtime Broadcast / postgres_changes

- Merchant detalle: `useConversationRealtime` (`INSERT` en `chat_messages` filtrado por `conversation_id`).
- Merchant bandeja: canal inbox `chat_conversations` por `comercio_id`.
- Server: `publishConversationEvent` broadcast best-effort.
- Consumidor anónimo: feed REST session-scoped (HMAC); recovery 8s + visibility (no polling 1–5s).
- Requiere migración + `alter publication supabase_realtime add table …` (comentado en SQL).

## 7. Bandeja

`/panel/conversaciones` + detalle: estados, último mensaje, unread, takeover/devolver/cerrar/enviar.

## 8. Notificación una sola vez

`dedupe_key = chat_supervision:new:{conversationId}:v{attentionVersion}` (unique; reapertura tras cerrar usa nueva versión). Apertura de página / welcome no dispara persistencia. `closed` ya no pausa Gemini (solo `human_handling`).

## 9–11. Takeover / staff / return

RPC atómicos (DB) o equivalentes memoria. Gemini gated por `human_handling`/`closed`. Respuestas IA en vuelo descartadas si `attention_version` cambió. Staff no llama Gemini ni WaSender como transporte.

**Fix crítico (migración):** `chat_take_conversation` / `chat_return_to_assistant` autorizan con `chat_user_can_supervise(comercio_id, p_user_id)` — el panel Next invoca RPC con **service_role**, donde `auth.uid()` es null; el diseño previo basado solo en `is_comercio_member()` habría fallado en Postgres real.

## 12. Multi-empleado

Primer `take` gana; segundo usuario → conflicto 409 (DB) / null (memoria). Assignee o `administrador` puede enviar.

## 13. Recuperación

`afterSeq` incremental; visibility + intervalo largo de recovery; IDs estables para dedupe.

## 14. Seguridad (evidencia local)

| Caso | Resultado |
| --- | --- |
| Deep link sin sesión | Redirect `/panel/login?next=…` |
| Otro comercio (E2E pin) | Bearer e2e rechaza otro `comercioId` |
| Otro `sessionId` en feed | No ve mensajes ajenos (Vitest + script) |
| Dedupe notificación | Unique / memory duplicate false |
| Takeover concurrente | Conflicto |
| Flags off | Chat sigue; supervisión no-op |

## 15. Rendimiento

Objetivo 1–2s en red controlada tras Realtime publicado. Medición de carga agresiva: **no ejecutada** (no prod). Script dual documentado para staging.

## 16. Vitest

Supervisión: **16 passed** (helpers, memoria, privacy, backoff notify, flags, reopen).

## 17. TypeScript

`npx tsc --noEmit` — **exit 0**. Site CI typecheck/test **SUCCESS** on `f1e315e`.

## 18. Playwright dual

`site/scripts/chat-supervision-dual-playwright.mjs` — dos contextos + UI panel.

**Ejecutado localmente** (`127.0.0.1:3010`, memoria E2E, WaSender off): **19/19 passed**  
incluye takeover UI, mensaje staff UI, feed consumidor, aislamiento de sesión, return/close, reopen, conflicto 409 dos empleados.  
**No corre contra producción.**

## 19. Migraciones

`20261123090000_chat_supervision_conversations.sql` — **NO aplicar sin autorización**.

## 20. Variables de entorno

| Variable | Rol |
| --- | --- |
| `CHAT_SUPERVISION_ENABLED` | master |
| `CHAT_SUPERVISION_WASENDER` | avisos WhatsApp |
| `CHAT_SUPERVISION_HUMAN_TAKEOVER` | pausar Gemini |
| `CHAT_SUPERVISION_COMMERCE_IDS` | allowlist piloto |
| `CHAT_SUPERVISION_SESSION_PEPPER` | HMAC |
| `CHAT_SUPERVISION_REOPEN_HOURS` | default 12 |
| `CHAT_SUPERVISION_MEMORY` | store local/E2E (nunca prod) |
| `CHAT_SUPERVISION_E2E_BEARER` | Bearer de prueba |
| `CHAT_SUPERVISION_E2E_COMERCIO_ID` | pin comercio E2E |
| `NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER` | panel UI E2E only |
| `WASENDER_API_KEY` | existente |

## 21. Costos operativos

- WaSender: 1 msg/conversación nueva (+ needs_attention ≤1/hora).
- DB: ~2 writes/turno.
- Realtime: eventos ligeros.

## 22. Activación / rollback

1. Autorizar migración + publication Realtime en staging.
2. Flags off → on solo Trueno (`CHAT_SUPERVISION_COMMERCE_IDS`).
3. Smoke dual + WhatsApp real a número de avisos.
4. Rollback: flags off; SQL DOWN opcional.

## 23. Veredicto

**NO-GO** publicar / merge a producción.

Criterio principal (abrir enlace → historial → intervenir → devolver) verificado en E2E local con store en memoria y flags. Aún bloquea GO:

1. Autorización para aplicar `20261123090000_chat_supervision_conversations.sql` (+ publication Realtime) — readiness read-only **SCHEMA_NOT_READY** (`chat_*` null, `take_rpc=false`; `comercio_members` + WaSender OK; Trueno `whatsapp=+584140821633`, sin `supervision_whatsapp`).
2. Autorización de **deploy/merge** de esta rama: `elmenuxfa.com/api/panel/conversaciones` hoy responde **404**.
3. Smoke con persistencia Supabase real (`chat-supervision-post-migration-smoke.mjs`: takeover → Gemini paused → staff → return → Gemini resumed → close).
4. Dual MEMORY local **19/19**. `HUMAN_TAKEOVER` gatea take/return/message (403 si off) en Next + Flutter.
5. Aviso WaSender real + preferir `supervision_whatsapp` dedicado.
6. Activación Trueno: `docs/chat-supervision-activation-trueno.md` + `chat-supervision-preflight.mjs`.

Readiness prod (2026-11-22, read-only): `chat_*` **null**, `take_rpc=false`, `comercio_members`+WaSender OK, Trueno `supervision_whatsapp` **MISSING**.

Sin esos pasos el comerciante no puede supervisar conversaciones reales.  
No hay merge ni deploy a producción sin tu autorización.  
Desbloqueo: `I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION`.
