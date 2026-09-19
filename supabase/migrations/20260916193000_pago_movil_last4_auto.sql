-- Pago Móvil is confirmed by BDV Payment Bridge. The merchant only sends
-- the last 4 digits of the bank reference — no receipt, no admin queue.
update public.payment_methods
set
  requires_receipt = false,
  requires_reference = true,
  tagline = 'Paga desde tu banco de Venezuela. Confirmación automática.',
  instructions = 'Transfiere el monto exacto en bolívares (tasa BCV) y escribe los últimos 4 dígitos de la referencia. El sistema lo confirma solo.',
  name = 'Pago Móvil',
  updated_at = now()
where code = 'pago_movil';

-- Last-4 references collide often if uniqueness covers approved history.
drop index if exists public.payment_submissions_reference_uidx;
create unique index if not exists payment_submissions_reference_pending_uidx
  on public.payment_submissions (method_code, upper(btrim(reference)))
  where reference is not null and status = 'pending';
