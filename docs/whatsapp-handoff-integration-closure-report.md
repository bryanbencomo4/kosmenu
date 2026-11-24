# Último cierre — integración WhatsApp → asistentes

**Fecha:** 2026-11-24  
**Rama:** `feature/wa-master-assistant`  
**Producción:** no desplegada · Supabase prod: sin migraciones ni writes de prueba

---

## Commit reproducible

**Commit:** `00367a9` — *Close Preview integration for WA handoff and Flutter /asistente*

Base previa: `1711ae4` / `3b55f04`.

---

## Entorno Preview

| Pieza | Resultado |
|-------|-----------|
| Next Preview Vercel | `https://kosmenu-qrntc262g-bryanbencomo4s-projects.vercel.app` (`dpl_HFGciBz…`) — flags assistants ON, Master/recepcionista OFF, WA idle |
| Handoff PostgreSQL | Preview project `gsfxqzvmyzjjgpigrste` — tabla + RPC `wa_handoff_redeem` verificados |
| Smoke PG | peek no consume · consume atómico · reuse rejected · expired rejected · sin teléfono en payload |
| Local Next + Preview store | `:3024` con `PLATFORM_WA_PREVIEW_*` |
| Flutter web build | FVM 3.41.6 — `flutter analyze` OK · `flutter build web` OK (API → `:3024`) |
| Flutter serve | `serve -s build/web :8080` (SPA rewrite; no fallback Next) |

Vercel Preview está protegido por SSO; API smoke con bypass de automation. **No** se usó Supabase producción para códigos de prueba.

---

## Flutter real (`BusinessAssistantScreen`)

| Check | Resultado |
|-------|-----------|
| Render `/asistente` (no solo HTTP 200) | OK — canvas + screenshot + chat “Asistente para negocios” |
| Sesión ausente → Entrar / Registrar | OK |
| Recarga mantiene `/asistente` | OK |
| Handoff `?h=` recupera solicitud (Margarita/precio) | OK — `handoffValid: true` |
| Código inválido no anuncia “preparada” | OK — `handoffError: not_found` |
| CORS `app.elmenuxfa.com` + Authorization | OK — preflight 204, Allow-Origin correcto |
| Origen arbitrario | Rechazado (sin ACAO) |

**Hallazgo crítico corregido:** Flutter `PathUrlStrategy` **borra el fragmento `#h=`** al boot. Enlaces empresariales usan `?h=` (query). Consumidor Next sigue con `#h=`.

**Auth con comerciante real / aislamiento cross-comercio:** verificado a nivel API (`needsAuth` sin Bearer; membership scoped en `resolveMembership`). Login E2E con cuenta de producción no ejecutado en este cierre (sin credenciales de piloto en el entorno).

---

## Handoff

- Peek ≠ consume (GET redeem = 405).  
- Consume atómico + rechazo reutilización/expiración (Preview PG).  
- TTL >5 min: mensaje de recuperación por WhatsApp + sesión usable (`recoveryHint`).  
- Enlace no otorga escritura administrativa.  
- Sin anuncio de solicitud preparada si el contexto no validó.

---

## Calidad

| Suite | Resultado |
|-------|-----------|
| `tsc --noEmit` | OK (superficies afectadas) |
| Vitest handoff / CORS / API | OK |
| Flutter analyze | OK |
| Flutter web build | OK |
| Playwright Flutter móvil+desktop | OK (`docs/wa-handoff-flutter-screenshots/`) |
| Playwright consumidor local Preview stack | OK |
| Fallback Next `/asistente-negocio` | **No** usado como prueba del asistente Flutter |

---

## Orden de deploy seguro (preparado — no ejecutar prod)

1. Publicar backend Next con flags **apagados** (`BUSINESS_ASSISTANT_*`, Master receptionist).  
2. Schema `wa_handoff_codes` en prod con respaldo + solo `service_role` (tras aprobación explícita).  
3. Publicar Flutter con `/asistente` (sin redirect externo).  
4. Smoke `app.elmenuxfa.com/asistente` renderiza `BusinessAssistantScreen` **antes** de enlaces WA.  
5. Armar recepcionista **solo** `584140821633`.  
6. E2E real WA → Flutter / Discovery.  
7. Master público permanece off para el resto.

**Rollback:** flags OFF → redeploy Flutter previo → revocar códigos / drop RPC solo si hace falta. No tocar webhook WaSender ni contratos de pedidos.

---

## GO / NO-GO publicación

| Ámbito | Veredicto |
|--------|-----------|
| Preview / local integración | **GO** |
| Publicación producción ahora | **NO-GO** |
| Armar recepcionista en prod | **NO-GO** hasta Flutter prod + schema prod + smoke pantalla viva |

Detenerse aquí.
