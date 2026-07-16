do $$
declare
  v_comercio_id uuid;
  v_cat_recomendados uuid;
  v_cat_entradas uuid;
  v_cat_platos uuid;
  v_cat_bebidas uuid;
begin
  -- Idempotent: wipe any previous demo comercio before recreating it.
  delete from productos where comercio_id in (select id from comercios where slug = 'demo');
  delete from categorias where comercio_id in (select id from comercios where slug = 'demo');
  delete from metodos_pago where comercio_id in (select id from comercios where slug = 'demo');
  delete from comercios where slug = 'demo';

  insert into comercios (
    nombre, slug, moneda, en_linea, permite_delivery, recibe_pedidos_whatsapp,
    negocio_virtual, mostrar_en_directorio_publico, onboarding_completed, ai_enabled,
    branding_ia, categoria
  ) values (
    'ElMenúXFA Demo',
    'demo',
    'USD',
    true,
    true,
    false,
    true,
    false,
    true,
    false,
    '{
      "schema_version": "2",
      "color_principal": "#7C3AED",
      "color_secundario": "#FACC15",
      "fuente_titulos": "Inter",
      "fuente_cuerpo": "Inter",
      "estilo_botones": "rounded",
      "mood_tags": ["moderno", "premium", "oscuro"],
      "descripcion_visual": "Menu de demostracion con tema oscuro violeta y acentos amarillos.",
      "layout_type": "grid",
      "config_visual": {"items_per_row": 2, "menu_sticky": true, "show_images": true},
      "config_negocio": {"metodos_pago": ["tarjeta", "pago_movil", "efectivo"], "moneda_default": "USD"},
      "colores_personalizados": {"background": "#0B0F1A", "card_surface": "#12172A", "text_on_primary": "#FFFFFF"}
    }'::jsonb,
    'Restaurante'
  ) returning id into v_comercio_id;

  insert into categorias (comercio_id, nombre, orden, activo)
  values (v_comercio_id, 'Recomendados', 0, true)
  returning id into v_cat_recomendados;

  insert into categorias (comercio_id, nombre, orden, activo)
  values (v_comercio_id, 'Entradas', 1, true)
  returning id into v_cat_entradas;

  insert into categorias (comercio_id, nombre, orden, activo)
  values (v_comercio_id, 'Platos fuertes', 2, true)
  returning id into v_cat_platos;

  insert into categorias (comercio_id, nombre, orden, activo)
  values (v_comercio_id, 'Bebidas', 3, true)
  returning id into v_cat_bebidas;

  insert into productos (comercio_id, categoria_id, nombre, descripcion, precio, imagen_url, orden, disponible, imagen_source_type)
  values
    (v_comercio_id, v_cat_recomendados, 'BBQ Bacon Rancher', 'Carne 180g, bacon, cheddar ahumado y salsa BBQ.', 10.99, 'https://www.elmenuxfa.com/demo/products/burger-bbq.png', 0, true, 'manual'),
    (v_comercio_id, v_cat_recomendados, 'Classic Chicken Delight', 'Pechuga crispy, lechuga, tomate y mayo de ajo.', 9.99, 'https://www.elmenuxfa.com/demo/products/burger-chicken.png', 1, true, 'manual'),
    (v_comercio_id, v_cat_recomendados, 'Cheesecake de Maracuyá', 'Con coulis de maracuyá.', 4.99, 'https://www.elmenuxfa.com/demo/products/cheesecake.png', 2, true, 'manual'),
    (v_comercio_id, v_cat_entradas, 'Tacos al Pastor', 'Con piña asada y cilantro fresco.', 8.49, 'https://www.elmenuxfa.com/demo/products/tacos.png', 0, true, 'manual'),
    (v_comercio_id, v_cat_platos, 'Pasta Alfredo', 'Fettuccine cremoso con pollo grillado y parmesano.', 11.90, 'https://www.elmenuxfa.com/demo/products/burger-mediterranean.png', 0, true, 'manual'),
    (v_comercio_id, v_cat_platos, 'Salmón al Grill', 'Acompañado de vegetales salteados y limón.', 14.99, 'https://www.elmenuxfa.com/demo/products/salmon.png', 1, true, 'manual'),
    (v_comercio_id, v_cat_bebidas, 'Limonada Natural', 'Limón fresco, hierbabuena y un toque de azúcar.', 3.50, 'https://www.elmenuxfa.com/demo/products/limonada.png', 0, true, 'manual');

  insert into metodos_pago (comercio_id, nombre, tipo, descripcion)
  values
    (v_comercio_id, 'Tarjeta de crédito/débito', 'tarjeta__usd', 'Pago seguro con tarjeta.'),
    (v_comercio_id, 'Pago móvil', 'pago_movil__usd', 'Paga con tu billetera móvil preferida.'),
    (v_comercio_id, 'Efectivo', 'efectivo__usd', 'Pago en efectivo al recibir tu pedido.');

  raise notice 'Demo comercio id: %', v_comercio_id;
end $$;
