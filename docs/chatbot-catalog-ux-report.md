# Informe — Rediseño conversacional (carruseles + catálogo + gestos)

**Fecha:** 2026-11-22  
**Deploy:** sí (piloto prod, cuidadoso) tras suites verdes  
**Gemini facturable en pruebas:** no (simulate / helpers)

## Resultado suites

| Suite | Resultado |
|-------|-----------|
| Vitest | **732 passed**, 1 skipped |
| `tsc --noEmit` | OK |
| E2E `chatbot-catalog-ux-e2e.mjs` | **GO** (categorías, productos, Ver todos, reply, mic) |

## Capturas

`docs/qa-screenshots/catalog-ux/`

1. `01-welcome-categories.png` — bienvenida + carrusel categorías  
2. `02-product-carousel.png` — productos horizontales al tocar categoría  
3. `03-catalog-sheet.png` — bottom sheet “Nuestro menú”  
4. `04-reply-bar.png` — barra de respuesta citada  

## Qué se entregó

- Carrusel de categorías al iniciar (sin Gemini)
- Carrusel de productos + “Ver todos”
- Sheet con búsqueda, chips, paginación (todo el catálogo local del comercio)
- Recomendaciones complementarias post-add (máx. 2, respetan “no gracias”)
- Gestos mic: hold / lock ↑ / cancel ← + controles a11y
- Reply swipe / long-press / botón + contexto a Gemini
- Tono prompt más natural; welcome v5
- Sin tocar pedidos, RLS, cuotas, pagos, Flutter

## Limitaciones

- Biblioteca de stickers gráficos: campo listo; uso principal vía emojis en texto (sin assets WA)
- Gestos mic/swipe: verificados en Chromium Playwright, no en iPhone/Android físicos
- Carruseles no se persisten en sessionStorage (se reinyectan en welcome al cargar)
- Propuestas multi-línea siguen como tarjetas confirmables individuales (sin “confirmar todas” batch)
