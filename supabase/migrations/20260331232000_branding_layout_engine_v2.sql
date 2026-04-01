alter table public.comercios
add column if not exists branding_ia jsonb;

comment on column public.comercios.branding_ia is
  'Motor de configuracion visual (v1/v2): tema, tipografias, layout, configuracion visual y configuracion de negocio.';

alter table public.comercios
drop constraint if exists comercios_branding_ia_shape_check;

alter table public.comercios
add constraint comercios_branding_ia_shape_check
check (
  branding_ia is null
  or (
    jsonb_typeof(branding_ia) = 'object'
    and (
      (
        (branding_ia->>'schema_version' is null or (branding_ia->>'schema_version') = '1')
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
      or
      (
        (branding_ia->>'schema_version') = '2'
        and branding_ia ? 'color_principal'
        and branding_ia ? 'color_secundario'
        and branding_ia ? 'fuente_titulos'
        and branding_ia ? 'fuente_cuerpo'
        and branding_ia ? 'estilo_botones'
        and branding_ia ? 'mood_tags'
        and branding_ia ? 'descripcion_visual'
        and branding_ia ? 'layout_type'
        and branding_ia ? 'config_visual'
        and branding_ia ? 'config_negocio'
        and branding_ia ? 'colores_personalizados'
        and jsonb_typeof(branding_ia->'color_principal') = 'string'
        and jsonb_typeof(branding_ia->'color_secundario') = 'string'
        and jsonb_typeof(branding_ia->'fuente_titulos') = 'string'
        and jsonb_typeof(branding_ia->'fuente_cuerpo') = 'string'
        and jsonb_typeof(branding_ia->'estilo_botones') = 'string'
        and jsonb_typeof(branding_ia->'mood_tags') = 'array'
        and jsonb_typeof(branding_ia->'descripcion_visual') = 'string'
        and jsonb_typeof(branding_ia->'layout_type') = 'string'
        and jsonb_typeof(branding_ia->'config_visual') = 'object'
        and jsonb_typeof(branding_ia->'config_negocio') = 'object'
        and jsonb_typeof(branding_ia->'colores_personalizados') = 'object'
        and (branding_ia->>'estilo_botones') in ('rounded', 'sharp', 'pill')
        and (branding_ia->>'layout_type') in ('list', 'grid', 'compact')
        and (branding_ia->>'color_principal') ~ '^#[0-9A-Fa-f]{6}$'
        and (branding_ia->>'color_secundario') ~ '^#[0-9A-Fa-f]{6}$'
        and (branding_ia->'config_visual') ? 'items_per_row'
        and (branding_ia->'config_visual') ? 'menu_sticky'
        and (branding_ia->'config_visual') ? 'show_images'
        and jsonb_typeof(branding_ia->'config_visual'->'items_per_row') = 'number'
        and jsonb_typeof(branding_ia->'config_visual'->'menu_sticky') = 'boolean'
        and jsonb_typeof(branding_ia->'config_visual'->'show_images') = 'boolean'
        and ((branding_ia->'config_visual'->>'items_per_row')::int between 1 and 3)
        and (branding_ia->'config_negocio') ? 'metodos_pago'
        and (branding_ia->'config_negocio') ? 'moneda_default'
        and jsonb_typeof(branding_ia->'config_negocio'->'metodos_pago') = 'array'
        and jsonb_typeof(branding_ia->'config_negocio'->'moneda_default') = 'string'
        and upper(branding_ia->'config_negocio'->>'moneda_default') ~ '^[A-Z]{3}$'
        and (branding_ia->'colores_personalizados') ? 'background'
        and (branding_ia->'colores_personalizados') ? 'card_surface'
        and (branding_ia->'colores_personalizados') ? 'text_on_primary'
        and jsonb_typeof(branding_ia->'colores_personalizados'->'background') = 'string'
        and jsonb_typeof(branding_ia->'colores_personalizados'->'card_surface') = 'string'
        and jsonb_typeof(branding_ia->'colores_personalizados'->'text_on_primary') = 'string'
        and (branding_ia->'colores_personalizados'->>'background') ~ '^#[0-9A-Fa-f]{6}$'
        and (branding_ia->'colores_personalizados'->>'card_surface') ~ '^#[0-9A-Fa-f]{6}$'
        and (branding_ia->'colores_personalizados'->>'text_on_primary') ~ '^#[0-9A-Fa-f]{6}$'
      )
    )
  )
);
