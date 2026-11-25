# Unificación conversacional ElMenúXFA — cierre

**Rama:** `feature/conversational-ecosystem-unify`  
**Target:** Preview / QA aislado únicamente  
**Prod / Trueno real:** no tocados  
**Allowlist WA / `PLATFORM_WA_MASTER_PUBLIC`:** sin cambios  

---

## 1. Commit y rama

Ver `git log -1` en la rama `feature/conversational-ecosystem-unify`.

## 2. Rutas unificadas (conservadas)

| Ruta | Rol | Cambio |
|------|-----|--------|
| `/asistente` (Next discovery) | Consumidor discovery | Persistencia handoff en sessionStorage |
| `/v/{slug}?chatbot=1` | Pedidos comercio | Consume destino `commerce_chatbot` + saludo con ítems |
| `app…/asistente` (Flutter) | Negocio | Tokens visuales WA + continuidad post-login |
| `/asistente-negocio` | Fallback negocio | sessionStorage + `handoffHint` |
| `/panel/conversaciones/[id]` | Inbox negocio | Acción `issue_commerce_handoff` |
| `/admin/wa-control` | Inbox plataforma | Sin cambio de mute (ya correcto) |
| WA Master | Entrada 0422 | Payload enriquecido (summary/excerpt) |

**Kernel compartido:** [`conversation-context.ts`](site/app/api/_lib/conversation-context.ts) + destino `commerce_chatbot` en [`wa-handoff.ts`](site/app/api/_lib/wa-handoff.ts).

## 3. Funcionalidades que funcionan

- Handoff opaco con peek/consume atómico (TTL 5–15 min).
- Comercio: enlace `/v/{slug}?chatbot=1&h=CODE` con ítems → no pregunta “qué deseas pedir”.
- Inbox: “Enviar enlace al asistente” (copia URL; no auto-envía WA en QA).
- Discovery / business: summary + continuidad post-auth.
- Take/return IA existentes intactos.
- Flutter negocio alineado a tokens del kit chat (header, burbujas, composer verde, auth compacta).

## 4. Resultado de los 12 escenarios

Evidencia: `docs/audit/conversation-handoff-matrix-*.json` → **12/12 OK** + Preview RPC redeem OK.

| # | Escenario | Resultado |
|---|-----------|-----------|
| 1 | Cliente → enlace → asistente conserva pedido | ✅ |
| 2 | Nota de voz (excerpt) transferida | ✅ (si hay texto/transcripción) |
| 3 | WA central → menú/discovery handoff URL | ✅ |
| 4 | No re-pregunta el pedido | ✅ |
| 5 | Comerciante → enlace empresarial | ✅ |
| 6 | Login recupera solicitud | ✅ (hint/draft) |
| 7 | Enlace directo sin `h` = conversación nueva | ✅ |
| 8 | Expirado / destino manipulado | ✅ |
| 9 | Aislamiento entre comercios | ✅ |
| 10 | Operador toma → IA mute | ✅ (código existente) |
| 11 | Operador devuelve → IA | ✅ (código existente) |
| 12 | Reload / consume único | ✅ |

## 5. Problemas que realmente impiden uso pleno

1. **Voz inbound WA** no se transcribe en el webhook (solo web STT).  
2. **WA del restaurante** no alimenta `/api/chat`; el flujo soportado es botón de inbox.  
3. **No se envían WhatsApp reales en QA** (por diseño); el operador pega el enlace.  
4. Flutter doodle asset no empaquetado (tokens/colores sí; patrón visual Next completo en web Next).

## 6. URL exacta para tu prueba

Preview local (Next QA + chatbot):

`http://127.0.0.1:3024/v/{slug-qa}?chatbot=1`

Handoff de prueba: generar desde panel  
`/panel/conversaciones/{id}` → menú → **Enviar enlace al asistente**.

Asistente negocio (Next fallback):  
`http://127.0.0.1:3024/asistente-negocio`

Flutter release Preview (si sirve `:5000`):  
`http://127.0.0.1:5000/asistente`

## 7. Veredicto

### **GO** para piloto controlado en Preview

### **NO-GO** producción / WhatsApp real / ampliar allowlist

Sin deploy. Sin migraciones prod. Sin Trueno real.
