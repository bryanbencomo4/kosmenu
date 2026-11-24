# elmenuxfa.com — Cierre final menús inteligentes

**Commit final:** (ver `git log -1` tras publish local)  
**Deploy producción:** NO (sin autorización)

## Resultado

1. **Opción 9:** `registerHumanSupportRequest` → ticket + inbox `needs_attention` + nota/contexto; solo entonces copy de éxito. Si falla el registro → copy de error (no afirma recepción). Luego `takeConversation` suspende el bot.
2. **Navegación:** menús por perfil + 0/8/9 + dígitos ligados al menú actual (TTL 36h); tests de unknown→consumer/prospect, registered→links/QR, products handoff.
3. **Take/return inbox:** solo estado; **sin** avisos WA automáticos.
4. **Allowlist:** fail-closed `584140821633` únicamente.
5. **Tests:** 56 pass (smart menus + human support + operator + router); `tsc` OK. Sin tocar pedidos/Flutter/Discovery/WaSender queue. Sin migraciones prod.

## GO/NO-GO piloto

| | |
|--|--|
| Publicar piloto (`584140821633` only) | **GO** (código listo; falta deploy autorizado) |
| Master público / ampliar allowlist | **NO-GO** |
| Deploy en este cierre | **NO-GO** |
