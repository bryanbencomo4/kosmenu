# Smoke plan Preview — Fase 2A.3

Manual. No ejecutar hasta Checkpoint A/B en `preview-apply-order.md`.

1. Crear comercio de prueba (Flutter, owner A).
2. Crear categorías y productos desde Flutter.
3. Abrir menú público (web `/v/{slug}` y Flutter public menu).
4. Crear pedido sin comprobante (Flutter → `/api/orders`).
5. Crear pedido con comprobante (upload → `storage://comprobantes/...` → order).
6. Validar email y WhatsApp en modo controlado (sin spam real).
7. Abrir tracking con token `?t=`.
8. Verificar tracking sin token → denegado.
9. Cancelar pedido cuando corresponda (flujo cliente/owner).
10. Confirmar recepción (solo estados permitidos).
11. Abrir pedido en Flutter (owner A).
12. Obtener signed URL (Bearer sesión A).
13. Ver comprobante (imagen/PDF).
14. Probar comercio equivocado (sesión owner B → 404 genérico).
15. Probar delivery invite create/accept/revoke.
16. Probar admin paths que existan.
17. Probar rate limit (orders + upload).
18. Confirmar que anon **no** puede leer ni actualizar `pedidos` directamente (post-restrictive).
19. Reintento checkout con misma `X-Idempotency-Key` → un solo pedido.
20. Nueva clave → pedido legítimo nuevo.
