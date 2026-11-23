# Sesión WaSender secundaria (piloto) — sin tocar ELMENUXFA1

## Disponibilidad (documentación proveedor)

WasenderApi permite **múltiples sesiones** por cuenta (`POST /api/whatsapp-sessions`), cada una con su propio:

- `phone_number`
- `api_key`
- `webhook_url` / `webhook_secret` / `webhook_events`
- estado de conexión (QR)

Sujeto a **límites del plan** (`Error Response - Session Limit`).

**No se creó ni conectó ninguna sesión en esta preparación.** ELMENUXFA1 no se modificó.

## Qué debes hacer tú (pasos exactos)

1. Entra al dashboard WasenderApi → **WhatsApp Sessions**.
2. Comprueba si el plan admite otra sesión (si aparece error de límite, hay que ampliar plan o liberar una sesión de prueba antigua **que no sea ELMENUXFA1**).
3. **Create Session** con un **número de pruebas autorizado** (no el +584220451906).
4. Nombre sugerido: `ELMENUXFA-WA-ENTRY-TEST`.
5. Deja webhook vacío o apagado hasta tener HTTPS Preview/túnel.
6. Escanea el **QR** con el teléfono de prueba (WhatsApp → Dispositivos vinculados).
7. Cuando el entorno HTTPS esté listo, configura **solo en esa sesión**:
   - Webhook URL: `https://<host-aislado>/api/wa-entry/webhook`
   - Events: `messages.received` (preferible) o `messages.upsert`
   - Copia el `webhook_secret` → `PLATFORM_WA_WEBHOOK_SECRET` (solo entorno aislado)
8. Guarda el `api_key` de la sesión secundaria aparte — **no** lo mezcles con la key de ELMENUXFA1 / cola de pedidos.

## Lo que NO debes hacer

- No editar webhook / secret / eventos de **ELMENUXFA1**.
- No desconectar ni reiniciar ELMENUXFA1.
- No poner el número principal como sesión de prueba.
- No activar `PLATFORM_WA_ALLOW_REAL_WASENDER` hasta autorización posterior.

## Personal Access Token

Crear/listar sesiones requiere **Personal Access Token** de cuenta (no el API key de sesión).  
Si solo tienes `WASENDER_API_KEY` de la sesión principal, usa el dashboard UI en lugar de la API.
