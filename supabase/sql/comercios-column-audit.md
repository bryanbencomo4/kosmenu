# Auditoría de columnas — `public.comercios`

Clasificación basada en uso Flutter (`business_setup_screen`, `public_menu_view`) y API menú.

| Columna | Clase | Notas |
|---|---|---|
| `id` | Pública | Identificador |
| `slug` | Pública | Ruta `/v/{slug}` |
| `nombre` | Pública | Nombre comercial |
| `logo_url` | Pública | Branding |
| `whatsapp` | Pública (contacto) | Contacto menú; no es secreto pero es PII operativa |
| `direccion` | Pública (ubicación) | Ubicación mostrada en menú |
| `latitud` / `longitud` | Pública (ubicación) | Mapa pickup/delivery |
| `permite_delivery` | Pública | Config visible menú |
| `en_linea` | Pública | Estado online |
| `menu_palette*` / `menu_layout` / `menu_footer` | Pública | Branding menú |
| `moneda` / `tasa_cambio_pesos` / `exchange_rate_*` | Pública | Config visible checkout |
| `metodos_pago` / `metodo_pago_predeterminado` | Revisar | Array legado en fila; preferir tabla `metodos_pago` |
| `owner_id` | Solo propietario / servidor | **Nunca** en DTO público |
| `email` / `correo` | Sensible | No exponer en menú |
| `branding_ia` | Solo propietario / servidor | Config interna IA |
| `onboarding_completed` | Solo propietario | Flag admin |
| `creado_por_ia` / `confianza_ia` | No utilizada públicamente | Omitir |
| Tokens / secrets / fiscal | Sensible | Si existen remotamente, nunca SELECT público |

## Solución elegida (menos disruptiva)

**B + A:** Endpoint público `/api/menu/[comercioId]` con DTO explícito (`public-menu-dto.ts`) **y** vistas locales `comercios_menu_public` / `metodos_pago_menu_public` (sin grants todavía).

Flutter menú público ya consume el endpoint (deja de hacer `select()` amplio sobre `comercios`).
