alter table public.comercios
add column if not exists branding_ia jsonb;

comment on column public.comercios.branding_ia is
  'Configuracion visual generada por IA: colores, tipografias, estilo de botones, mood tags y descripcion visual.';

alter table public.comercios
drop constraint if exists comercios_branding_ia_shape_check;

alter table public.comercios
add constraint comercios_branding_ia_shape_check
check (
  branding_ia is null
  or (
    jsonb_typeof(branding_ia) = 'object'
    and branding_ia ? 'color_principal'
    and branding_ia ? 'color_secundario'
    and branding_ia ? 'fuente_titulos'
    and branding_ia ? 'fuente_cuerpo'
    and branding_ia ? 'estilo_botones'
    and branding_ia ? 'mood_tags'
    and branding_ia ? 'descripcion_visual'
    and jsonb_typeof(branding_ia->'color_principal') = 'string'
    and jsonb_typeof(branding_ia->'color_secundario') = 'string'
    and jsonb_typeof(branding_ia->'fuente_titulos') = 'string'
    and jsonb_typeof(branding_ia->'fuente_cuerpo') = 'string'
    and jsonb_typeof(branding_ia->'estilo_botones') = 'string'
    and jsonb_typeof(branding_ia->'mood_tags') = 'array'
    and jsonb_typeof(branding_ia->'descripcion_visual') = 'string'
    and (branding_ia->>'estilo_botones') in ('rounded', 'sharp', 'pill')
    and (branding_ia->>'color_principal') ~ '^#[0-9A-Fa-f]{6}$'
    and (branding_ia->>'color_secundario') ~ '^#[0-9A-Fa-f]{6}$'
  )
);
