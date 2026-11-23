# Dual-dispatch proxy — diseño (no desplegado)

**Estado:** diseño local únicamente. **No** enlazado a ELMENUXFA1.  
**Motivo:** WasenderApi documenta **una** `webhook_url` por sesión WhatsApp.

## Objetivo

Recibir el POST único del proveedor y reenviarlo a:

1. **Endpoint actual** (notificaciones / lo que ya dependa del webhook, si aplica)  
2. **wa-entry** (`/api/wa-entry/webhook`) en entorno aislado (túnel local o Preview)

## Requisitos de seguridad

- Responder `200` al proveedor de inmediato tras aceptar el body.
- Verificar `X-Webhook-Signature` == secret **antes** de fan-out.
- Reenviar el mismo body + header de firma a ambos destinos.
- Timeouts cortos; fallos del brazo wa-entry **no** deben impedir el brazo legacy.
- Logs sin texto de mensajes ni teléfonos completos.
- Feature flag `PLATFORM_WA_DUAL_DISPATCH=0` por defecto.
- Kill switch: apuntar de nuevo la URL de sesión al endpoint legacy.

## Procedimiento de activación (requiere autorización explícita)

1. Backup lectura: URL actual, eventos, secret de ELMENUXFA1.  
2. Desplegar/proxy en host HTTPS no-prod o túnel.  
3. Smoke con allowlist.  
4. Cambiar `webhook_url` de la sesión **una vez** al proxy.  
5. Verificar brazo legacy sigue recibiendo.  
6. Plan de rollback documentado (< 2 minutos).

## Alternativa preferida para piloto

Crear **sesión WaSender secundaria** con otro número de prueba → webhook exclusivo a wa-entry.  
Cero impacto sobre ELMENUXFA1.
