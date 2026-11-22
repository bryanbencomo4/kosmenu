# Informe — supervisión humana del chatbot

**Rama:** `feature/chat-supervision-human`  
**Estado:** implementación base lista para revisión; **NO-GO** publicar sin migración autorizada + smoke dual navegador.

## 1. Arquitectura existente (auditoría)

Ver `docs/chat-supervision-architecture-audit.md`.

Resumen: WaSender vía `enqueue_wasender_message`; historial chat solo `sessionStorage`; panel comerciante Flutter + Bearer; Next `admin` es plataforma; Realtime casi ausente en chat.

## 2. Archivos creados / modificados

### Nuevos
- `supabase/migrations/20261123090000_chat_supervision_conversations.sql` (no aplicada)
- `site/app/api/chat/_lib/supervision-config.ts`
- `site/app/api/chat/_lib/supervision-shared.ts`
- `site/app/api/chat/_lib/supervision.ts`
- `site/app/api/panel/conversaciones/**`
- `site/app/api/chat/[comercioId]/supervision-feed/route.ts`
- `site/app/panel/**` (bandeja web piloto)
- `site/tests/chatbot-supervision.test.ts`
- docs de auditoría e informe

### Modificados
- `site/app/api/chat/[comercioId]/route.ts` — persistencia + gate humano (best-effort)
- `site/app/v/[id]/_components/chat/ChatAssistantView.tsx` — feed staff en modo humano

## 3. WaSender reutilizado

`sendWhatsappText` + cola `wasender_message_queue` + `dedupe_key` en `chat_supervision_events`.  
Destino: `config_negocio.supervision_whatsapp|notify_whatsapp` → fallback `comercios.whatsapp` / owner; bloquea dígitos de soporte elmenuxfa.

## 4. Persistencia

Tablas: `chat_conversations`, `chat_messages`, `chat_supervision_events`.  
Hash HMAC de `sessionId` por comercio. Notificación solo en primera apertura/reapertura.

## 5. Auth comerciante

Bearer Supabase (`getUserFromBearerRequest`) + owner/`comercio_members` roles `administrador|caja|marketing`.  
Enlace `/panel/conversaciones/[id]` exige token; sin secretos en URL.

## 6. Realtime

Broadcast best-effort post-escritura; DB es fuente de verdad.  
Consumidor: feed recovery 8s solo en modo humano.  
Panel: refresh al volver a la pestaña.  
Pendiente: canales privados Realtime Authorization en Supabase (migración/config).

## 7–11. Bandeja / takeover / mensaje / devolver

APIs POST `take|return|close|message` + RPC atómicos `chat_take_conversation` / `chat_return_to_assistant`.  
Gemini se omite si `human_handling`/`closed` y flag takeover.  
Respuestas Gemini en vuelo se descartan si `attention_version` cambió.

## 12–15. Multi-empleado / reconexión / seguridad / rendimiento

Takeover atómico (conflicto 409).  
Reconexión vía `afterSeq`.  
RLS member select; consumidor solo por hash de sesión.  
Rendimiento Playwright dual / carga: **pendiente** (requiere migración + auth).

## 16–18. Suites

- Vitest helpers supervisión: incluidos.
- Suite completa / Playwright 2 browsers: ejecutar tras aplicar migración en entorno de prueba.
- TypeScript: verificar en commit.

## 19. Migraciones

`20261123090000_chat_supervision_conversations.sql` — **no ejecutar en prod sin autorización**. Rollback documentado al final del SQL.

## 20. Variables de entorno

| Variable | Rol |
| --- | --- |
| `CHAT_SUPERVISION_ENABLED` | master |
| `CHAT_SUPERVISION_WASENDER` | avisos WhatsApp |
| `CHAT_SUPERVISION_HUMAN_TAKEOVER` | pausar Gemini |
| `CHAT_SUPERVISION_COMMERCE_IDS` | allowlist (piloto Trueno) |
| `CHAT_SUPERVISION_SESSION_PEPPER` | HMAC sesiones |
| `CHAT_SUPERVISION_REOPEN_HOURS` | default 12 |
| `WASENDER_API_KEY` | existente |

## 21. Costos operativos

- WaSender: 1 msg/conversación nueva (+ hourly needs_attention).
- DB: ~2 writes/turno + índices.
- Realtime: eventos ligeros; sin historial completo en broadcast.

## 22. Activación / rollback

1. Autorizar migración en staging.
2. Flags off → on solo Trueno.
3. Smoke dual navegador.
4. Rollback: flags off; opcional DROP tablas (SQL down).

## 23. Veredicto

**NO-GO publicar.** Base sólida reutilizando WaSender/auth/cola; falta:
1. Aplicar migración en entorno de prueba.
2. Completar auth web del panel (hoy Bearer manual de piloto).
3. Realtime privado end-to-end.
4. Playwright dual + Vitest completo post-migración.
5. Aviso de privacidad discreto en UI consumidor.
6. Confirmación WhatsApp de avisos de Trueno (`supervision_whatsapp`).

**Criterio principal** (abrir enlace → ver historial → intervenir → devolver) queda implementado a nivel API/UI piloto, pero **no verificado E2E** hasta migración + tokens reales.
