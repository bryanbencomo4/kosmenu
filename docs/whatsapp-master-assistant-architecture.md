# elmenuxfa.com — Asistente Maestro de WhatsApp

**Marca:** elmenuxfa.com  
**Canal:** +584220451906 · sesión ELMENUXFA1  
**Rama:** `feature/wa-master-assistant`  
**Estado:** diseño + Paquete 1 local · **flags OFF** · **NO activar en producción**

---

## 1. Arquitectura

```
WaSender webhook
    → wa-entry (auth, claim, fromMe/human, allowlist, rate, send lock)
        → [PLATFORM_WA_MASTER=0] router texto/poll actual (PRODUCCIÓN HOY)
        → [PLATFORM_WA_MASTER=1] Orquestador Maestro
              ├─ Identidad (roles verificados / inferidos / confirmados)
              ├─ Memoria L1 inmediata · L2 resumen · L3 perfil
              ├─ Intenciones (determinista + Gemini opcional)
              ├─ Especialistas: consumer | commercial | admin | support
              ├─ Herramientas autorizadas (schemas + permisos)
              └─ Respuesta natural → cola WaSender existente
```

Principios:

- Reutilizar contratos wa-entry; no segundo webhook.
- Gemini no escribe en Supabase ni genera SQL ejecutable.
- Identidad telefónica = señal, no autorización de mutación.
- Fallback determinista si Gemini/cuota falla.
- Kill switch independiente: `PLATFORM_WA_MASTER`.

---

## 2. Inventario reutilizable

### REUSE NOW

| Dominio | Qué |
|---------|-----|
| Inbound | `processWaEntryEvent`, claim, echo, human pause, allowlist |
| Outbound | `sendWhatsappText` / cola / reintentos |
| Teléfonos | `normalizePhoneToE164`, `digitsOnly` |
| Discovery | `listClientDirectory`, tools `/api/asistente/_lib/tools` |
| Menú público | `GET /api/menu/[comercioId]` |
| Contactos comercio | `resolveMerchantContacts`, `comercios.whatsapp` |
| Supervisión patrón | `human_handling` + chat supervision status |
| Gemini patrón | cliente + quota discovery/chatbot (como plantilla) |

### NEEDS WRAPPER

| Dominio | Qué |
|---------|-----|
| Identidad WA→comercio | Match normalizado whatsapp/telefonos/config_negocio/owner auth |
| Pedidos por teléfono | Lectura acotada `pedidos.telefono_cliente` |
| Discovery vía WA | Misma tool API sin sesión web |
| Handoff humano | Unificar wa-entry pause ↔ panel |

### MISSING SAFE API (no fingir)

| Dominio | Qué |
|---------|-----|
| Mutar productos/precios/FX/delivery desde WA | No existe endpoint server seguro |
| Crear comercio desde WA | Solo Flutter `auth.signUp` + insert RLS |
| Historial de pedidos privados sin verificación | No exponer |
| Cuota Gemini dedicada Master | Tablas propias pendientes (no compartir discovery a ciegas) |

---

## 3. Identificación comerciantes / consumidores

### Señales (ordenadas por confianza)

1. **verified_db** — dígitos normalizados coinciden con `comercios.whatsapp` / `telefonos` / `branding_ia.config_negocio.supervision_whatsapp|notify_whatsapp` (lectura service_role, resultado público mínimo: id, nombre público, slug).
2. **verified_db_weak** — `auth.users.phone` / metadata del `owner_id` (no usar como permiso de escritura).
3. **inferred_orders** — aparece en `pedidos.telefono_cliente` (solo flag “posible cliente recurrente”; **sin** listar pedidos hasta verificación).
4. **confirmed_user** — el usuario afirmó en chat (“sí, soy el dueño de X”).
5. **unknown** — número nuevo.

### Multi-comercio

Devolver candidatos `{ comercioId, publicName }` sin datos privados. Pedir selección por nombre público.

### Intención > perfil

Dueño de pizzería que pide hamburguesas → especialista consumer. El perfil aporta contexto; no enjaula.

---

## 4. Memoria persistente (3 niveles)

| Nivel | Contenido | Retención propuesta | Storage (diseño) |
|-------|-----------|---------------------|------------------|
| L1 | Últimos N turnos (rol, texto, tool ids) | TTL hilo (p.ej. 7d) | `wa_master_turns` |
| L2 | Resumen estructurado JSON compacto | Mismo TTL / rotación | `wa_master_threads.summary_json` |
| L3 | Perfil contacto: roles, comercios, prefs confirmadas, última intención | Más largo + derecho de borrado | `wa_master_profiles` |

Campos L2 típicos: `activeService`, `selectedComercioId`, `pendingQuestion`, `proposedAction`, `humanIntervened`, `askedFields[]`, `recentErrors[]`.

**Provenance** en L3: `verified_db | confirmed_user | inferred_ai` — nunca promover inferred→verified sin fuente.

**Privacidad:** no guardar direcciones completas, pagos, contraseñas. Endpoint/flujo de rectificación/borrado (escenario 25) → Paquete 5.

*Schema SQL:* borrador `supabase/migrations/DRAFT_20261125000000_wa_master_memory.sql` — **NO aplicar en producción sin autorización.**

---

## 5. Modelo de intenciones

```
greeting | clarify_role
consumer.search | consumer.product | consumer.hours | consumer.delivery
consumer.order_help | consumer.complaint
commercial.info | commercial.pricing | commercial.register | commercial.resume_signup
admin.view_menu | admin.edit_product | admin.edit_price | admin.availability
admin.hours | admin.fx | admin.delivery | admin.settings
support.issue | support.human
privacy.rectify | privacy.delete
multi | unknown
```

Resolución: reglas deterministas primero (saludos, “hablar con persona”, “actualizar tasa”); Gemini solo si hace falta NLU. Validar tool calls contra allowlist del especialista.

---

## 6. Herramientas por especialista

| Especialista | Tools permitidas (P1–P2) | Pendiente seguro |
|--------------|--------------------------|------------------|
| Consumer | search_restaurants, filter, get_public_info, prepare_links | order lookup verificado |
| Commercial | explain_service (contenido curado), get_public_pricing_if_any, handoff_register_url | conversational create-comercio |
| Admin | get_public_menu_snapshot, **propose_*** (solo propuesta) | mutate_* con auth+confirm+audit |
| Support | escalate_human, classify_issue | ticket store unificado |

---

## 7. Autenticación y permisos (admin)

Teléfono ≠ capability.

Flujo mutación:

1. Identity match → candidate comercios  
2. Membership/owner check  
3. **Strong verify** (magic link / OTP app / sesión panel) — diseño Paquete 4  
4. Capability check  
5. Read current → propose diff  
6. Confirmación explícita del usuario  
7. API segura idempotente  
8. Audit log  

Hasta existir (3)+(7): el asistente **solo propone** y ofrece `app.elmenuxfa.com`.

---

## 8. Registro conversacional

Objetivo: crear menú conversando. Hoy **MISSING** create-comercio API.

Fase A (segura ya): discovery de necesidad + explicación + deep link register + resume “dejamos pendiente X”.  
Fase B: API tokenizada server-side reutilizando validaciones Flutter/RLS (Paquete 3).  
Nunca pedir contraseñas/bancarios por WA.

---

## 9. Administración por chat

Misma capa de servicios para WA y futuro asistente web autenticado (`shared commerce ops`).  
P1: lectura + propuestas.  
P4: mutaciones reales. **No declarar completo hasta tests E2E con mismas reglas que el panel.**

---

## 10. Atención humana

Reutilizar `human_handling` + `humanPausedUntilMs`.  
Triggers: pide persona, pago, reclamo delicado, auth insuficiente, fallos repetidos.  
Conservar L1/L2 para el operador. Distinguir soporte plataforma vs restaurante (no dar el WA de elmenuxfa.com como si fuera del local).

---

## 11. Personalidad / prompt

- Español VE/LATAM, cálido, breve, resolutivo.  
- Brand: **elmenuxfa.com**.  
- Si preguntan si es IA: admitirlo sin rodeos.  
- Evitar: “Estimado usuario”, menús numéricos obligatorios, saludos eternos, inventar acciones.  
- Prompt base en `wa-master/_lib/personality.ts`.

---

## 12. Costos y rendimiento

- Cuota **propia** Master (no drenar discovery).  
- Reserve atómico + ledger (plantilla discovery).  
- Timeouts, max tool rounds, rate compartido, dedupe wa-entry.  
- Revisar `MAX_REPLIES_PER_HOUR=12` → candidato 20–30 en conversaciones largas **sin** quitar anti-abuso (Paquete 5).  
- Shadow mode opcional: orquestar sin enviar (flag).

---

## 13–14. Código / pruebas

Paquete 1 en `site/app/api/wa-master/` + tests `site/tests/wa-master-*.test.ts`.  
Integración en wa-entry solo si `PLATFORM_WA_MASTER=1` (default 0).

---

## 15. Completo vs pendiente

| Completo (local P1) | Pendiente |
|---------------------|-----------|
| Tipos identidad/memoria/intenciones | Mutaciones admin reales |
| Orquestador + fallback natural | Registro conversacional create |
| Identity sim + matcher interface | Cuota Gemini Master en Postgres |
| Intents deterministas | Auth fuerte WA |
| Hook flag OFF en wa-entry | Shadow/prod trial +584140821633 |
| Doc arquitectura | Suites 1–25 completas en live |

---

## 16. Riesgos

- Falsa confianza en match de teléfono → fuga entre comercios.  
- Costos Gemini en número público.  
- Confundir WaSender polls/botones con Cloud API.  
- Activar Master sin fallback router.  
- Pedir datos sensibles por chat.

---

## 17. Despliegue gradual

1. Sim + Vitest  
2. Preview Supabase (schema draft)  
3. Shadow mode (orquesta, no responde)  
4. Allowlist +584140821633  
5. % tráfico / horario  
6. Kill `PLATFORM_WA_MASTER=0` restaura router actual  

---

## 18. GO / NO-GO

| Criterio | Ahora |
|----------|-------|
| Router prod intacto | GO |
| Master flag default OFF | GO |
| Identity/mutate seguros | **NO-GO** mutaciones |
| Registro conversacional completo | **NO-GO** |
| Activar Master en +584220451906 | **NO-GO** |

**Decisión:** continuar Paquetes 2–4 en rama; **no activar producción.**
