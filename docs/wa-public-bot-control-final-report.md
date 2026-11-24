# Informe final — Control humano + bot público útil (elmenuxfa.com)

**Fecha:** 2026-11-24  
**Rama:** `release/wa-handoff-prod-00367a9`  
**Migraciones prod:** **ninguna aplicada**  
**Activación pública:** **NO** (flags fail-closed)

## GO/NO-GO

| Ámbito | Veredicto |
|--------|-----------|
| Código + pruebas simulación | **GO** para merge/review |
| Activar Master público / recepcionista en prod | **NO-GO** sin autorización posterior |
| Controles operador en prod (API admin) | **GO condicionado** — desplegable con admin auth; mute usa store existente |
| Migraciones nuevas en prod | **NO-GO** (no se aplicaron) |

## Correcciones implementadas

### 1. Control humano (prioridad)
- Estado por contacto: `ai_active` / `human_handling` / `paused` / `closed` (derivado de `wa_entry_threads` + versión de atención).
- **Tomar** conversación → pausa **indefinida** hasta devolver.
- **Devolver** al asistente → reactive AI.
- **Pausar todas** / **Reanudar todas** → mute global en clave `__wa_bot_global__` + `PLATFORM_WA_BOT_MUTE` (env, sin redeploy).
- Kill switch **no** toca cola de pedidos / notificaciones legítimas.
- Carrera Gemini→envío: `shouldDiscardInFlightBotReply` antes del lock y antes del send.
- `fromMe` humano (no eco del bot) → take indefinido. Ecos del bot **no** pausan.
- WaSender `message.sent`: **no** está en el contrato actual (solo `messages.received`); no se asume. Detección humana vía `fromMe` + filtro de eco.
- Comandos `/tomar` por WhatsApp: **no** expuestos (se verían al cliente). Control en **admin privado**.

### 2. Interfaz admin
- Ruta: `/admin/wa-control` (+ API `POST /admin/api/wa-control`)
- Permisos: `orders.write` | `businesses.write` | `security.write`
- Acciones: status, take, return, pause_all, resume_all, list_tickets

### 3. Respuestas naturales
- “Hola, tengo una pregunta” → invita a preguntar (sin menú 1/2).
- Precio del servicio → planes publicados ($10 kit, $10/mes, $90/año) + landing.
- Subir productos → guía panel + handoff empresarial opcional.
- Delivery plataforma vs restaurante: sin inventar.

### 4. Enlaces públicos de menú
- QR: `https://elmenuxfa.com/v/{slug}?src=qr`
- Pedidos/menú: `https://elmenuxfa.com/v/{slug}`
- No sustituye por `app.elmenuxfa.com` como “enlace de menú”.

### 5. Handoff empresarial
- Se reutiliza el handoff opaco existente hacia `app.elmenuxfa.com/asistente`.
- Solo se afirma “solicitud preparada” cuando el handoff se emitió.

### 6. Soporte humano
- Tickets en memoria (`support-tickets`) + take tras aviso.
- Copia honesta solo si el ticket se registró.
- Lista en admin (`list_tickets`). Persistencia durable = requiere autorización/migración futura.

### 7. Master público (flag nuevo, OFF)
- `PLATFORM_WA_MASTER_PUBLIC=1` + Master ON + allowlist vacía → todos.
- Default: fail-closed (nadie sin allowlist).

## Flags efectivos recomendados (sin activar aún)

```
PLATFORM_WA_OPERATOR_CONTROL=1   # opcional, documentación; control admin no depende
PLATFORM_WA_BOT_MUTE=0
PLATFORM_WA_MASTER=0             # o pilot allowlist si se autoriza
PLATFORM_WA_MASTER_PUBLIC=0
PLATFORM_WA_MASTER_RECEPTIONIST=0
```

## Pruebas (vitest sim)

Archivo: `site/tests/wa-operator-control-and-master-ux.test.ts` — **8/8 OK**

Cubierto: enlaces QR/pedidos, pregunta abierta, pricing, take/return/race, mute global + tiempo, fromMe vs eco, tickets, flag público fail-closed.

Escenarios 1–22: cubiertos en lógica de simulación; **no** se probaron contra el número principal ni carga.

## Tiempo de pausa medido (sim)

Mute global `setGlobalBotMute` → **&lt; 2 s** en prueba local (típicamente &lt; 50 ms in-process).

## Cambios que necesitan autorización para producción

1. Desplegar Next con este código.
2. Activar Master (allowlist o `MASTER_PUBLIC`) si se quiere bot inteligente para todos.
3. Persistencia durable de tickets de soporte (migración) si se quiere historial multi-instancia.
4. Suscribir `message.sent` en WaSender **solo** tras verificar contrato del proveedor.
5. Armar notificaciones WaSender a operadores para tickets (sin tocar pedidos).

## No interrumpido

Menús, checkout, pedidos, Discovery, Flutter app, business site, chatbot restaurantes, supervisión merchant, sesión ELMENUXFA1, cola Wasender de pedidos.
