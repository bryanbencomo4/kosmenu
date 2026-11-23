# Protocolo de usabilidad comparativa — Chatbot vs WhatsApp manual

**Objetivo:** medir si comprar con El Menú XFA es más sencillo que pedir por WhatsApp al restaurante, bajo condiciones equivalentes.  
**Regla:** no inventar tiempos ni resultados del canal WhatsApp; solo registrar lo medido.

## Condiciones equivalentes

- Mismo restaurante (piloto: Trueno) y mismo menú publicado.
- Mismo dispositivo y red (ideal: 390×844, 4G).
- Mismas tareas A–I en orden fijo.
- Un moderador; el consumidor no ve el protocolo de métricas.
- WhatsApp: conversación real con el local (o grabación consentida de un turno típico del negocio). No simular respuestas “perfectas” del competidor.
- Chatbot: build de la rama bajo prueba; sin coaching del moderador salvo desbloqueo tras 3 min.

## Tareas

| ID | Tarea |
| --- | --- |
| A | Encontrar una pizza por ingredientes (maíz + pimentón) |
| B | Pedir dos pizzas con tamaños distintos |
| C | Solicitar una bebida por sabor (Coca-Cola 2L) |
| D | Cambiar un producto ya propuesto |
| E | Agregar un complemento |
| F | Consultar el total |
| G | Finalizar el pedido (hasta checkout o mensaje de cierre WhatsApp) |
| H | Resolver una duda (horario o delivery) |
| I | Solicitar contacto del restaurante / reclamo |

## Métricas por tarea y canal

Registrar en planilla (una fila = tarea × canal × participante):

- Tiempo hasta completar (s)
- Mensajes escritos por el consumidor
- Toques / taps
- Preguntas adicionales del asistente o del humano
- Errores (producto incorrecto, precio inventado, contacto incorrecto)
- Repeticiones / reformulaciones
- Intervención humana necesaria (sí/no)
- Finalización exitosa (sí/no)
- Fricción percibida (1–5)

## Separación de pruebas

1. **Automatizadas** (CI): Vitest inteligencia, carrito, contactos, seguridad — no sustituyen este protocolo.
2. **Con consumidores** (≥5, ideal 8–12): este protocolo.
3. **Piloto interno** (equipo): mismo protocolo marcado como “no consumidor”.

## Criterio de mejora (no declarar victoria sin datos)

Solo afirmar “más sencillo que WhatsApp” si, en la muestra:

- Tasa de finalización chatbot ≥ WhatsApp, y
- Mediana de tiempo o de mensajes escritos es menor con significación práctica (≥20 % de reducción o Likert fricción ≤−1), y
- 0 incidentes de precio inventado / contacto de plataforma / pedido duplicado.

## Plantilla CSV

```csv
participant_id,channel,task_id,time_s,messages_written,taps,extra_questions,errors,repetitions,human_intervention,success,friction_1_5,notes
```
