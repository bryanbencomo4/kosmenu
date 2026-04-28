alter table public.comercios
add column if not exists onboarding_completed boolean not null default false,
add column if not exists ai_image_generation_used boolean not null default false,
add column if not exists ai_images_generated_count integer not null default 0,
add column if not exists ai_images_generation_completed_at timestamp;

create or replace function public.increment_ai_images_generated(
  p_commerce_id uuid,
  p_generated_count integer
)
returns public.comercios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.comercios;
  v_safe_count integer := greatest(coalesce(p_generated_count, 0), 0);
begin
  update public.comercios
  set
    ai_images_generated_count = coalesce(ai_images_generated_count, 0) + v_safe_count,
    ai_image_generation_used = case
      when v_safe_count > 0 then true
      else coalesce(ai_image_generation_used, false)
    end,
    ai_images_generation_completed_at = case
      when v_safe_count > 0 then coalesce(ai_images_generation_completed_at, now())
      else ai_images_generation_completed_at
    end
  where id = p_commerce_id
  returning * into v_row;

  if not found then
    raise exception 'Comercio not found: %', p_commerce_id;
  end if;

  if coalesce(v_row.ai_images_generated_count, 0) >= 25 and v_row.ai_images_generation_completed_at is null then
    update public.comercios
    set ai_images_generation_completed_at = now()
    where id = p_commerce_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;