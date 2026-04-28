revoke all on function public.increment_ai_usage_control(uuid, text, integer, integer, integer, numeric) from public;
revoke all on function public.increment_ai_usage_control(uuid, text, integer, integer, integer, numeric) from anon;
revoke all on function public.increment_ai_usage_control(uuid, text, integer, integer, integer, numeric) from authenticated;
grant execute on function public.increment_ai_usage_control(uuid, text, integer, integer, integer, numeric) to service_role;

revoke all on function public.increment_ai_images_generated(uuid, integer) from public;
revoke all on function public.increment_ai_images_generated(uuid, integer) from anon;
revoke all on function public.increment_ai_images_generated(uuid, integer) from authenticated;
grant execute on function public.increment_ai_images_generated(uuid, integer) to service_role;