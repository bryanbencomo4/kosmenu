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

**Nota (evidencia read-only):** el proyecto preview (`gsfxqzvmyzjjgpigrste`) **no** tiene `comercio_members` ni `is_comercio_member`. No es un entorno válido para este piloto hasta alinear el esquema. El piloto autorizado debe apuntar a **prod** (`qqhberaayhohxlbbhdyi`) con flags fail-closed solo Trueno.

1. **Autorizar** explícitamente la migración en el entorno elegido (recomendado: prod + flags Trueno).
2. Aplicar `supabase/migrations/20261123090000_chat_supervision_conversations.sql`.
   - Los RPC `chat_take_conversation` / `chat_return_to_assistant` autorizan por `p_user_id` (`chat_user_can_supervise`) porque el panel Next llama con **service_role** (`auth.uid()` sería null).
3. Publicar Realtime (si no está):
   ```sql
   alter publication supabase_realtime add table public.chat_conversations;
   alter publication supabase_realtime add table public.chat_messages;
   ```
4. Variables de entorno (solo Trueno):
   ```env
   CHAT_SUPERVISION_ENABLED=1
   CHAT_SUPERVISION_WASENDER=1
   CHAT_SUPERVISION_HUMAN_TAKEOVER=1
   CHAT_SUPERVISION_COMMERCE_IDS=0aa8c53b-07f1-446e-8b88-66c2b7ae89ea
   CHAT_SUPERVISION_SESSION_PEPPER=<pepper-no-commitear>
   # NO poner CHAT_SUPERVISION_MEMORY ni E2E_BEARER en staging/prod
   ```
5. Smoke dual (consumidor + panel login real).
6. Confirmar **una** notificación WaSender al número de avisos (no historial completo).
7. Preferir `config_negocio.supervision_whatsapp` dedicado antes del piloto.

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
