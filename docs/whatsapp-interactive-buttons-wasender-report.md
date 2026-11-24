# Informe: botones interactivos WaSender × elmenuxfa.com

**Fecha:** 2026-11-24  
**Marca:** elmenuxfa.com  
**Número Business:** +584220451906 · Sesión: ELMENUXFA1  
**Rama local:** `feature/wa-entry-interactive-poll`  
**Estado:** investigación + implementación local detrás de feature flag. **Sin deploy. Sin envíos reales.**

---

## 1. ¿WaSender soporta botones nativos?

**No verificado / no documentado en la API de mensajes.**

El índice oficial de Messages (`https://www.wasenderapi.com/api-docs/messages`) lista:

- texto, imagen, video, documento, audio, sticker, contacto, ubicación, **poll**, quoted, reacciones, editar/borrar/leer.

**No aparece** endpoint ni payload de:

- Reply buttons / quick reply buttons  
- Interactive list messages  
- URL buttons / CTA URL  

La ayuda oficial *Using Polls as Buttons* (`https://www.wasenderapi.com/help/messaging/using-polls-as-buttons`) presenta las **encuestas como alternativa** a botones, no como wrappers de botones nativos.

Menciones de “interactive buttons / list messages” en **blogs de marketing** no incluyen schemas ni rutas API; **no se usan como evidencia de implementación**.

---

## 2. ¿Qué alternativas admite realmente?

| Opción | Preferencia | Estado en WaSender API | Evidencia |
|--------|-------------|------------------------|-----------|
| A — Botones nativos | 1ª | **No documentados** | Ausentes en `/api-docs/messages` |
| B — Lista interactiva | 2ª | **No documentada** | Idem |
| C — Encuesta selección única | 3ª | **Sí, documentada** | `Send Poll Message` + help “polls as buttons” |
| D — Texto 1/2 (actual) | Fallback | **En producción** | Router wa-entry actual |

**URL buttons:** no documentados en WaSender. Los enlaces siguen yendo en texto (como hoy).

---

## 3. ¿Cómo se envían? (solo lo documentado)

**Endpoint:** `POST https://www.wasenderapi.com/api/send-message`  
**Auth:** `Authorization: Bearer <API_KEY>`

```json
{
  "to": "+584140821633",
  "poll": {
    "question": "¿Qué te gustaría hacer hoy? 😊",
    "options": ["🍔 Pedir comida", "🏪 Tengo un negocio"],
    "multiSelect": false
  }
}
```

Fuente: `https://www.wasenderapi.com/api-docs/messages/send-poll-message` y help *Using Polls as Buttons*.

**Cola actual de elmenuxfa.com:** `sendWhatsappText` → `wasender_message_queue` → Edge `process-wasender-queue` solo envía **texto**. No hay campo/migración para polls. Por eso el flag `PLATFORM_WA_POLL_SEND` permanece **apagado** y el sender Wasender **hace fallback a menú de texto**.

---

## 4. ¿Cómo llegan las selecciones al webhook?

Evento documentado: **`poll.results`** (distinto de `messages.received`).

Payload (help oficial):

```json
{
  "event": "poll.results",
  "sessionId": "...",
  "data": {
    "key": { "remoteJid": "...", "fromMe": true, "id": "MESSAGE_ID" },
    "pollResult": [
      { "name": "yes", "voters": [] },
      { "name": "no", "voters": ["5841...@s.whatsapp.net"] }
    ]
  },
  "timestamp": 1753277070225
}
```

- Identificador de opción: **`name`** (string de la opción). **No hay option-id estable aparte del texto.**
- El sample marca `key.fromMe: true` (mensaje de encuesta enviado por nosotros). La implementación local **no** trata esto como intervención humana: atribuye el voto desde `voters` / `remoteJid` y fuerza `fromMe: false` en el evento normalizado.
- El webhook de producción hoy está orientado a `messages.received`. Suscribir `poll.results` en el panel WaSender **requiere autorización explícita** (no hecho).

---

## 5. Mejor experiencia disponible

1. **Ideal de producto (botones nativos):** no demostrable en WaSender → no implementar payloads especulativos.  
2. **Mejor documentada:** **poll single-select (Opción C)** como menú de un toque.  
3. **Más estable en producción hoy:** **texto 1/2 (Opción D)** — sin cambios de cola/Edge/webhook.

**Recomendación:** mantener D en producción; preparar C detrás de flag local; no migrar el número principal a Meta Cloud API automáticamente.

---

## 6. Código reutilizable

Sin segundo flujo:

- `routeWaEntryEvent` / estados existentes  
- `processWaEntryEvent` (claim, allowlist, rate, human pause, send lock)  
- URLs: `consumerAssistantUrl`, register/manage (sin cambios)  
- Dedup, MENÚ, selección `1`/`2`, kill switch  

Nuevo (local):

- `site/app/api/wa-entry/_lib/interactive.ts` — payloads poll + encode/decode  
- `normalizePollResultsPayload` en `contract.ts`  
- Flags: `PLATFORM_WA_INTERACTIVE_MODE` (`text`\|`poll`, default `text`), `PLATFORM_WA_POLL_SEND` (default `0`)

Mapeo:

| Opción poll | Acción router |
|-------------|---------------|
| 🍔 Pedir comida | consumidor |
| 🏪 Tengo un negocio | negocio → submenú |
| Registrar mi menú | registro |
| Gestionar mi menú | panel |

---

## 7. Cambios mínimos hechos (solo local)

- Branding de copy de bienvenida/consumidor → **elmenuxfa.com** (URLs intactas).  
- Modo `poll`: menús de audiencia/negocio salen como poll encoded; enlaces finales siguen en texto.  
- Sender Wasender: poll → **fallback texto**; si `POLL_SEND=1` → **refuse** (Edge no armado).  
- Sim: conserva poll encoded para pruebas.  
- `1`/`2`/MENÚ siguen activos en ambos modos.

---

## 8. Pruebas locales

Ejecutar:

```bash
cd site && npx vitest run tests/wa-entry-router.test.ts
```

Cubierto en tests:

- Default flags = text / poll send off  
- Normalize `poll.results` sin pausa humana  
- Flujo poll: Hola → poll → voto consumidor → enlace asistente  
- Flujo negocio → poll submenu → registrar  
- Texto `1` sigue funcionando en modo poll  
- Fallback Wasender + refuse `POLL_SEND`  
- Dedup de voto  

**Resultado:** `npx vitest run tests/wa-entry-router.test.ts` → **35/35 passed** (2026-11-24).

---

## 9. Riesgos

| Riesgo | Detalle |
|--------|---------|
| No son botones nativos | UX de encuesta; menos “app-like” que Meta Cloud API buttons |
| Android 1:1 | Help oficial: el poll puede **no verse en el teléfono del emisor**; el destinatario sí lo recibe |
| Webhook | Hace falta evento `poll.results` además de `messages.received` |
| Cola/Edge | Solo texto hoy → envío real de poll = trabajo + auth aparte |
| `fromMe: true` en sample | Mal manejado → pausa humana falsa (mitigado en normalizer) |
| Option id = texto | Renombrar opciones rompe matching si no se actualiza el router |
| Sesión WhatsApp Web | WaSender enlaza vía Web/Business linked device; capacidades ≠ Meta Cloud API oficial |
| Número Business | Tener WhatsApp Business **no** desbloquea reply buttons en WaSender; eso es producto Cloud API |

Comparación breve con **WhatsApp Business Platform (Cloud API):** reply buttons, listas y CTA URL son oficiales allí, con plantillas/ventanas de 24h y compliance Meta. WaSender documenta polls sobre sesión vinculada; no documenta el mismo set interactivo.

---

## 10. Qué autorizar para probar con un número real

Único número autorizado a futuro: **+584140821633**.

Antes de cualquier envío real hace falta autorización explícita para:

1. `PLATFORM_WA_INTERACTIVE_MODE=poll` solo en entorno de prueba (no público).  
2. Extender Edge/`wasender_message_queue` (o camino documentado) para `poll` **sin** romper texto.  
3. Suscribir webhook **`poll.results`** en ELMENUXFA1 (sin tocar secretos/sesión).  
4. `PLATFORM_WA_ENFORCE_ALLOWLIST=1` + allowlist **solo** `584140821633`.  
5. `PLATFORM_WA_POLL_SEND=1` solo tras (2).  
6. Deploy controlado + prueba acotada — **no abierto al público**.

**Prohibido en esta fase (cumplido):** deploy prod, envíos interactivos, cambio de sesión/webhook/secretos, migraciones, tocar pedidos/menús/Gemini/app/supervisión.

---

## Respuestas cortas (checklist del brief)

1. Botones nativos: **No verificado (no en API docs).**  
2. Alternativas reales: **poll single-select + texto.**  
3. Envío: **POST /api/send-message + `poll`.**  
4. Selección: **webhook `poll.results` → `pollResult[].name` + voters.**  
5. Mejor UX disponible documentada: **poll (C)**; más segura en prod ahora: **texto (D).**  
6. Reutilizar: **router/process/URLs/guardas.**  
7. Mínimo: **flag + normalize poll + encode menús + fallback send.**  
8. Tests: **wa-entry-router (incl. poll).**  
9. Riesgos: **Android sender, webhook, cola texto, UX encuesta vs botones.**  
10. Autorizar: **allowlist + Edge poll + poll.results + flags + deploy prueba a +584140821633.**
