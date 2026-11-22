# Smoke Gemini Live — preparación (NO ejecutar aún)

**Rama:** `qa/chatbot-intelligence-v2`  
**Comercio:** Pizzas El Trueno (`pizzas-el-trueno`)  
**Estado:** listo para autorización explícita. **No ejecutar sin GO del owner.**

## Presupuesto y límites

| Límite | Valor |
| --- | --- |
| Motor | Gemini Live real (no simulador) |
| Turnos máximos | **8** (hard stop) |
| Sesiones | **1** |
| Pedidos reales | **0** (no confirmar checkout / no POST create order) |
| Media / voz | **off** en esta smoke (texto only) |
| Abort | Si un turno falla por tool/timeout, no reintentar con nuevo spend sin auth |
| Flag requerido | `--authorize-live` (o env `CHATBOT_AUTHORIZE_LIVE=1`) + confirmación humana |

Comando propuesto (no corrido):

```bash
cd site
# CHATBOT_SIMULATE_GEMINI must be unset/0
node --env-file=.env.local scripts/chatbot-gemini-smoke-live.mjs --authorize-live --max-turns=8 --commerce=pizzas-el-trueno
```

> El script de ejecución puede crearse en el momento de la autorización; este documento fija el contrato.

## Guion de comprobación

1. **Campesina por nombre natural** — “Quiero una Campesina Grande” → 1 propuesta, tamaño Grande, precio catálogo.
2. **Coca-Cola como sabor** — “Un Refresco de 2 Lt Coca-Cola” → producto Refresco de 2 Lt. + opción Sabores Coca-Cola (no SKU fantasma).
3. **Mitad/mitad** — “Pizza mitad Granjera y mitad Campesina” → pregunta tamaño → Grande → **una** línea, MAX price.
4. **Tasas** — “¿A cómo tienen el dólar?” / “¿Cuántos COP son 10 USD?” → tasa comercial real (hoy 3200), sin inventar.
5. **Contacto** — “Quiero hablar con un humano” → WhatsApp **del restaurante** únicamente.
6. **Cierre contextual** — tras agregar, un solo close-sale; abrir checkout sin crear pedido.

## Criterios de éxito

- 0 pedidos insertados.
- 0 alucinaciones de precios vs `prepareCartLineProposal` / menú tradicional.
- Contacto ≠ número de elmenuxfa.
- Log de `usage.geminiHttpCalls` y tokens guardado en `.data/qa-validation/`.

## Criterios de aborto inmediato

- Respuesta inventa tasa o precio.
- Dos líneas para una combinación.
- Intento de crear pedido.
- Contacto de plataforma / otro comercio.
