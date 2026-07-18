-- LOCAL ONLY — do NOT apply remotely until Preview review.
-- Revoke EXECUTE on sensitive SECURITY DEFINER RPCs from anon/public.
-- Flutter merchant panel uses authenticated sessions; delivery create/revoke require auth.uid().

revoke execute on function public.create_delivery_invitation(text, integer, text, text) from anon, public;
revoke execute on function public.revoke_delivery_invitation(text) from anon, public;
revoke execute on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb) from anon, public;
revoke execute on function public.upsert_delivery_courier(uuid, text, text, text) from anon, public;
revoke execute on function public.list_delivery_couriers(uuid, text, integer) from anon, public;
revoke execute on function public.deactivate_delivery_courier(uuid) from anon, public;
revoke execute on function public.touch_delivery_courier_last_used(uuid) from anon, public;

grant execute on function public.create_delivery_invitation(text, integer, text, text) to authenticated, service_role;
grant execute on function public.revoke_delivery_invitation(text) to authenticated, service_role;
grant execute on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.upsert_delivery_courier(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.list_delivery_couriers(uuid, text, integer) to authenticated, service_role;
grant execute on function public.deactivate_delivery_courier(uuid) to authenticated, service_role;
grant execute on function public.touch_delivery_courier_last_used(uuid) to authenticated, service_role;

-- Note: function bodies still use SET search_path TO 'public'.
-- A follow-up migration may switch to SET search_path = '' with schema-qualified names.
-- Do not change search_path in this migration without a dedicated Flutter smoke test.
;