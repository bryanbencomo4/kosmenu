# elmenuxfa.com — Cierre: menús inteligentes WA Master

**Fecha:** 2026-11-24  
**Alcance:** menús numerados dinámicos + Gemini + memoria + atención humana  
**Deploy producción:** **NO** (explicitamente retenido)

---

## 1. Menús implementados

| Perfil | Menú raíz | Submenús |
|--------|-----------|----------|
| Desconocido | `root_unknown` (1–4, 8, 9) | → consumer / prospect / registered |
| Consumidor | `root_consumer` | handoff a `elmenuxfa.com/asistente` |
| Prospecto | `root_prospect` | info / precios / registro → commercial specialist |
| Negocio registrado | `root_registered` | `biz_links`, `biz_products`, `biz_pricing`, `biz_orders`, `biz_config` |
| Soporte | `support_issue` (opción 8) | categorías 1–5 + 9 humano |

Universales en todos los contextos: **0** menú principal · **8** problema · **9** asesor  
También: “volver”, “inicio”, “necesito ayuda”, “hablar con alguien”, “no me funciona”, etc.

Estado de navegación en memoria Master (`menuId`, `menuProfile`, `menuUpdatedAtMs`, `misunderstandCount`, `supportIssueText`). TTL blando 36h: un dígito viejo no aplica el menú anterior.

## 2. Acciones reales disponibles

- Enlaces públicos QR / menú / pedidos (`menu-links.ts`) cuando hay slug.
- Handoff consumer → `https://elmenuxfa.com/asistente` (código opaco si `RECEPTIONIST=1`).
- Handoff business → `https://app.elmenuxfa.com/asistente` (edición / config / productos; sin mutar datos solo por WA).
- Precios / registro / info → specialist commercial existente (planes reales Kit/plataforma).
- Búsqueda comida / zona → specialist consumer o handoff Discovery.
- Gemini sigue disponible para pulir respuestas libres (no se eliminó).

## 3. Soporte y escalamiento

- **8** abre menú de soporte corto; conserva texto previo del problema.
- **9** / frases humanas → ticket (`createSupportTicket` + dedupe) → take → bot silenciado.
- Copy de éxito: “Hemos recibido tu solicitud… En unos momentos…”
- **Take** admin: envía `_⚠️ Un asesor… está atendiendo…_` (+ outbound para eco `fromMe`).
- **Return** admin: envía `_🤖 El asistente virtual retomó…_` (solo si allowlist permite retomar IA).

## 4. Memoria y navegación

- Perfil de menú desde identity + signup draft + roles (sin asumir admin por match de teléfono).
- `0` vuelve al root del perfil **sin** borrar signup / zona / comercios.
- Cambio de intención por texto libre (atajos a consumer/commercial) sin forzar el walk completo.
- Tras 3 malentendidos en menú: ofrece 8/9 en lugar de loop “no entendí”.

## 5. Resultado de pruebas

| Suite | Resultado |
|-------|-----------|
| `wa-smart-menus.test.ts` | 9/9 pass |
| `wa-operator-control-and-master-ux.test.ts` | 8/8 pass |
| `wa-entry-router.test.ts` | 35/35 pass |
| `tsc --noEmit` | OK |

## 6. Allowlist

**Sin cambios de política.** Fail-closed:

- `PLATFORM_WA_AUTO_REPLY_DIGITS=584140821633` (único piloto con auto-reply).
- Otros números: inbox / humano posible; **sin** menús ni Gemini outbound.

## 7. GO / NO-GO (activar solo piloto)

| Criterio | Estado |
|----------|--------|
| Menús + 0/8/9 + memoria local | **GO** (código listo) |
| Avisos cursiva take/return | **GO** (código listo) |
| Allowlist fail-closed intacta | **GO** |
| Deploy producción de este paquete | **NO-GO** (retenido a petición) |
| Tickets soporte multi-instancia durable | **Parcial** (sigue Map in-memory; misma limitación previa) |
| Inbox Supabase durable | **NO** (migración DRAFT sin aplicar) |

**Veredicto para activar en piloto (`584140821633` only):** **GO condicionado** a un deploy autorizado posterior (este cierre **no** desplegó).  
**Veredicto producción abierta / Master público:** **NO-GO**.

### Archivos clave

- `site/app/api/wa-master/_lib/menus/*`
- `site/app/api/wa-master/_lib/orchestrator.ts`
- `site/app/api/wa-entry/_lib/attention-notices.ts`
- `site/app/admin/api/wa-control/route.ts` (take/return notices)
- `site/tests/wa-smart-menus.test.ts`
