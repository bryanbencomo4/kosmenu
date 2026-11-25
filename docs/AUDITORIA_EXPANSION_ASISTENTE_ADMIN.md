# EXPANSIÓN FINAL — Asistente administrativo

**Rama:** `feature/business-admin-assistant`  
**Base:** `848ac67` → commit de expansión (ver final)  
**Entorno de prueba:** Supabase Preview `gsfxqzvmyzjjgpigrste` (gate anti-prod activo)  
**Evidencia:** `docs/audit/qa-isolated-write-evidence-2026-11-25T19-09-11-010Z.json`

---

## 1. Funcionalidades implementadas

| Módulo | Capacidades en chat |
|---|---|
| Catálogo | Crear producto, crear/eliminar categoría, precio, disponibilidad, destacado (`upsell_badge`) |
| Imágenes | Upload a bucket `product-images` + confirmación antes de asignar a producto |
| Pagos | Listar / crear (Zelle, pago móvil, efectivo) / eliminar — sin secretos |
| Delivery | Consultar; activar/desactivar; tarifa fija vía `branding_ia.config_negocio.delivery_config` |
| Pedidos | Listar; cambiar estado con máquina Flutter (`pendiente→confirmado→en_camino→entregado` / cancel) |
| Tasa | Consultar y set manual (`exchange_rate_value` + `tasa_cambio_pesos`) |
| Perfil | Nombre / descripción visual / WhatsApp |
| Staff | Listar equipo; invitar por email+rol (RPC `invite_comercio_member`) |
| Promos | Propose + apply contra `upsell_rules` (contrato Flutter) |
| Previas | Horario estructurado, abrir/cerrar, multi-negocio seguro |

Reutiliza tablas/campos/RPCs del panel. Confirmación HMAC + membresía en cada write.

---

## 2. Operaciones que escriben y persisten (Preview QA)

| Op | Persistió |
|---|---|
| set_price / availability / hours / en_linea | sí |
| create_category / create_product | sí |
| set_tasa | sí |
| upsert_payment_method | sí |
| set_delivery_config | sí |
| set_order_status | sí |
| create_promo (`upsell_rules`) | **no** — tablas ausentes en Preview |
| Aislamiento decoy | seguro (sin fuzzy peligroso) |

---

## 3. Pruebas chat / Flutter

- **Chat API** en `:3024` + JWT owner QA: suite aislada completa (evidencia arriba).
- **Flutter:** mismos shapes (`horarios.days`, `productos`, `metodos_pago`, `pedidos.estado`, `branding_ia.delivery_config`, `exchange_rate_*`). No se apuntó la app Flutter a Preview en esta pasada (sigue prod); la paridad es por contrato de columnas/JSON.
- Cancelación / sin confirmación: sin write (token requerido).
- Permisos: gates `canManageCatalog|Settings|Orders|Staff|Marketing` espejo de `MerchantSession`.

---

## 4. Bloqueadas — motivo exacto

| Capacidad | Motivo |
|---|---|
| Promos / bundles / upsell_settings en Preview | Tablas `upsell_rules`, `upsell_settings`, `bundles` **no existen** en schema Preview |
| Variaciones / tamaños / extras (`opciones_menu`) | Editor JSON complejo del panel; riesgo de romper menú público — no se inventó subset |
| Zonas delivery con polígonos | Validación/`DeliveryConfig.validate` + UI mapa; chat solo toggle + tarifa fija |
| Sync completo `metodos_pago` como Flutter (`efectivo__USD` rebuild) | Insert/delete unitario seguro; no se reimplementó el sync masivo de `BusinessSetupScreen` |
| Staff revoke / roles avanzados | Invite RPC listo; revoke implementado pero no ejercido en suite |
| Foto AI / variants job | Upload + `imagen_url` sí; worker AI de Flutter no disparado desde chat |
| Migración marketing Preview | No aplicada (impacto amplio); código listo para cuando el schema coincida con prod |

---

## 5. Puntuación de utilidad

| Dimensión | Score |
|---|---:|
| Consultas | 82 |
| Preparación | 84 |
| Ejecución administrativa | 78 |
| Persistencia verificada | 86 |
| Seguridad / aislamiento | 85 |
| **TOTAL** | **~83 / 100** |

(Antes del cierre técnico ~76; antes de QA aislada ~60.)

---

## 6. Commit final

Ver mensaje de commit en el repo tras esta entrega.
