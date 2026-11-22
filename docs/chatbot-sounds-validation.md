# Validación — efectos de sonido del chatbot

**Fecha:** 2026-11-22  
**Alcance:** solo sonidos UI del chat. Sin migraciones, deploy, RLS ni live Gemini.

## Mapa de los 6 efectos usados

| Evento | Archivo | Origen ZIP | Firma (active / total) | Criterio |
|--------|---------|------------|------------------------|----------|
| Enviar texto | `message-sent.mp3` | efecto-01 | ~48 / 185 ms | Blip corto de envío |
| Respuesta asistente | `message-received.mp3` | efecto-02 | ~210 / 315 ms | Pop de recepción in-chat |
| Inicio grabación | `recording-start.mp3` | efecto-05 | ~39 / 175 ms | Beep mínimo de start |
| Fin grabación | `recording-stop.mp3` | efecto-03 | ~79 / 215 ms | Click de stop |
| Enviar nota de voz | `voice-sent.mp3` | efecto-06 | ~290 / 435 ms | Confirmación de envío voz |
| Cancelar/descartar | `recording-cancel.mp3` | efecto-07 | ~361 / 535 ms | Distinto de envío |

**No usado:** `_unused-notification-long.mp3` (efecto-04, ~1,7 s) — tono de notificación larga.

## Ajustes de esta validación

1. **Volumen inicial ~20 %** (`CHAT_SOUND_DEFAULT_GAIN = 0.2`); mute en menú ⋮ → Sonidos del chat.
2. **Inicio de grabación:** `playChatSoundAsync('recordingStart')` espera decode + cue; delay `cueMs+40` (máx. 280 ms) **antes** de `MediaRecorder.start` — evita meter el beep en la nota y reduce pérdida de primeras palabras vs. race async.
3. **Una sola recepción por turno:** `receiveTurnLockRef` + ids ya oídos; el sonido suena al mensaje final del asistente (tras tools), no en «escribiendo…».
4. **Historial / menú↔chat:** al montar se marcan los ids existentes como oídos; no hay play al hidratar historial.
5. **Audio bloqueado:** `playChatSound` / `Async` no lanzan; sin `AudioContext` → no-op.

## Suites (esta validación)

| Suite | Resultado |
|-------|-----------|
| Vitest | **705 passed**, 1 skipped |
| `tsc --noEmit` | **OK** |
| Playwright `functionality-close-e2e.mjs` | **ALL CHECKS PASSED** (simulate, 0 Gemini) |

## Fuera de alcance (pendiente aparte)

- Corrección RLS `pedidos_emergency_anon_insert`
- Última prueba live de compra por voz
