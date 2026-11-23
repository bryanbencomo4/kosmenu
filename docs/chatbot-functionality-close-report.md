# Chatbot — cierre de funcionalidad (informe)

Fecha: 2026-11-22  
Alcance: preview `/preview/dev-chatbot-trueno` + APIs chat locales  
Restricciones respetadas: **sin deploy**, **sin migraciones**, **sin Gemini live/facturable** (`geminiHttpCalls=0` en E2E).

## Resumen de estados

| # | Función | Estado | Evidencia |
|---|---------|--------|-----------|
| 1 | Estados reales de envío / recepción / procesamiento | **FUNCIONAL** | Ticks: `sent` al encolar, `delivered` al aceptar (API o demo), `read` solo tras respuesta del asistente. Eliminado timeout fake 180 ms. Fallo de red deja `sent`. E2E: `receipt_read_after_reply`. |
| 2 | “escribiendo…” solo mientras genera respuesta | **FUNCIONAL** | Header + bubble de typing ligados a `isTyping`. E2E: visible durante generación y `typing=0` al terminar. |
| 3 | Notas de voz (Chrome / Android / Safari) + STT | **PARCIAL** | Grabar → vista previa → enviar / cancelar / descartar. MIME Safari (`audio/mp4`, `aac`). STT navegador best-effort; fallback `/api/chat/:id/media` en modo **simulate** (0 Gemini). Live STT implementado pero **bloqueado** (`CHATBOT_MEDIA_LIVE` + auth de sesión). No hay dispositivo iPhone real en CI. |
| 4 | Audios grabar / reproducir / cancelar / enviar | **FUNCIONAL** | Composer: cancelar en vivo, draft con `<audio controls>`, descartar o enviar. Bubble reproduce `voiceUrl`. |
| 5 | Imágenes y archivos compatibles | **PARCIAL** | Adjuntar imagen/PDF, preview en burbuja, análisis **simulado** vía media API. Análisis live Gemini bloqueado igual que STT. E2E: `image_attach_and_analyze_sim` (OK, 1 imagen). |
| 6 | Ubicación → checkout delivery | **FUNCIONAL** | Geolocation con permiso usuario → mensaje + seed `delivery` en checkout (preview + `page.tsx`). E2E: `location_seeds_checkout`, `location_bubble_persisted`. |
| 7 | Selector de emojis en móvil | **FUNCIONAL** | Panel in-flow, targets ≥44 px, `touch-manipulation`. E2E: inserta 😀. |
| 8 | Naturalidad Gemini real | **PARCIAL** | Prompt endurecido (sin saludos repetidos, 1–3 frases, no inventar catálogo/precios, ubicación→checkout). **No evaluado con Gemini live** (sin autorización). |
| 9 | E2E / regresión carrito, variaciones, checkout | **FUNCIONAL** | Vitest 77 tests fase 3.x + functionality-close. Playwright E2E: propuestas, confirm→carrito=2, checkout abierto. Órdenes bloqueadas. |
| 10 | Capturas móviles claro / oscuro | **FUNCIONAL** | `site/.data/functionality-close/screenshots/` (receipts, emoji, attach, location, cart, checkout, welcome dark, image light/dark). |

## Pruebas ejecutadas

### Unit / regresión (Vitest)

```
tests/chatbot-functionality-close.test.ts  (9)
tests/chatbot-phase33.test.ts
tests/chatbot-phase32.test.ts
tests/chatbot-phase31.test.ts
tests/chatbot-phase3.test.ts
tests/chatbot-post-smoke-fixes.test.ts
→ 77 passed
```

### E2E Playwright

```
node scripts/functionality-close-e2e.mjs
→ ALL CHECKS PASSED
→ geminiHttpCalls=0
→ report: site/.data/functionality-close/e2e-report.json
```

## Gates de coste (media)

| Variable | Efecto |
|----------|--------|
| `CHATBOT_SIMULATE_GEMINI=1` | Media en simulate (default local) |
| `CHATBOT_VOICE_STT` / `CHATBOT_IMAGE_ANALYSIS` | Intención live |
| `CHATBOT_MEDIA_LIVE=1` + key | Requerido para live; **aún rechazado** sin auth explícita de sesión |
| `NODE_ENV=production` | Media API `403 production_blocked` |

## Pendiente para aprobación de producción

Ver `docs/chatbot-production-checklist.md`.
