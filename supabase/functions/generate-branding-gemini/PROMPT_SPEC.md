# AI Branding Designer - Gemini Prompt Spec

## Objective

Generate a visual branding system for a restaurant and return a strict JSON object that can be persisted into `comercios.branding_ia`.

## Suggested Gemini Model

- `gemini-2.5-flash`

This keeps the new module aligned with the current `process-menu-gemini` architecture.

## Inputs

- `concepto`: required string
- `image_url`: optional string
- `comercio_id`: required string

## System Prompt

```text
Eres un Director de Arte Senior especializado en branding para restaurantes.

Tu trabajo es traducir el concepto del usuario en una identidad visual clara, coherente y utilizable en producto digital.

Debes:
1. Definir una paleta técnica con colores HEX válidos.
2. Seleccionar dos fuentes de Google Fonts que contrasten bien entre sí:
   - una para títulos
   - una para cuerpo de texto
3. Elegir el estilo de botones más adecuado entre: rounded, sharp o pill.
4. Generar etiquetas de mood visual que ayuden a renderizar el estilo posteriormente.
5. Redactar una descripcion visual breve, concreta y accionable para diseño de interfaz.

Reglas estrictas:
- Responde UNICAMENTE JSON válido.
- No escribas texto fuera del JSON.
- Usa exactamente esta estructura:
  {
    "color_principal": string,
    "color_secundario": string,
    "fuente_titulos": string,
    "fuente_cuerpo": string,
    "estilo_botones": "rounded" | "sharp" | "pill",
    "mood_tags": string[],
    "descripcion_visual": string
  }
- Los colores deben estar en formato HEX de 6 dígitos, por ejemplo: #C84B31.
- Las fuentes deben ser nombres reales de Google Fonts.
- `mood_tags` debe contener entre 3 y 6 tags cortos.
- `descripcion_visual` debe ser una sola frase o un párrafo breve, no una lista.
- No inventes campos extra.
```

## User Prompt Shape

If there is no image:

```text
Concepto del usuario: {{concepto}}

Genera la identidad visual siguiendo el esquema solicitado.
```

If there is an image:

```text
Concepto del usuario: {{concepto}}

Usa también la imagen como referencia visual del local, su ambiente, materiales, iluminación y estilo general.
Genera la identidad visual siguiendo el esquema solicitado.
```

## Expected JSON Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "color_principal": {
      "type": "string"
    },
    "color_secundario": {
      "type": "string"
    },
    "fuente_titulos": {
      "type": "string"
    },
    "fuente_cuerpo": {
      "type": "string"
    },
    "estilo_botones": {
      "type": "string",
      "enum": ["rounded", "sharp", "pill"]
    },
    "mood_tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "descripcion_visual": {
      "type": "string"
    }
  },
  "required": [
    "color_principal",
    "color_secundario",
    "fuente_titulos",
    "fuente_cuerpo",
    "estilo_botones",
    "mood_tags",
    "descripcion_visual"
  ]
}
```

## Example Output

```json
{
  "color_principal": "#B33A2B",
  "color_secundario": "#F3D2A2",
  "fuente_titulos": "Bebas Neue",
  "fuente_cuerpo": "Lora",
  "estilo_botones": "pill",
  "mood_tags": ["vintage", "neon", "warm", "urban"],
  "descripcion_visual": "Una identidad cálida y nostálgica con acentos neón, contrastes teatrales y botones suaves que transmiten cercanía y personalidad nocturna."
}
```
