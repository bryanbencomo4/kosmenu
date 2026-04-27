# Cambio de dominio productivo a elmenuxfa.com

Este proyecto ya quedo preparado en codigo para usar `https://elmenuxfa.com` como dominio publico principal.

## Cambios aplicados en el repo

- URLs publicas de Flutter actualizadas a `https://elmenuxfa.com`
- Tracking links, emails y mensajes de WhatsApp del sitio web actualizados al dominio oficial
- Android App Links configurado para `elmenuxfa.com` y `www.elmenuxfa.com`
- iOS Universal Links configurado para `elmenuxfa.com` y `www.elmenuxfa.com`
- `site/public/.well-known/apple-app-site-association` ampliado para `/orders/*` y `/v/*/orders/*`
- Variables `SITE_URL` y `NEXT_PUBLIC_SITE_URL` soportadas por el sitio web

## Lo que falta hacer fuera del repo

## 1. Vercel

En el proyecto que hoy responde en `kosmenu.vercel.app`:

- Agrega `elmenuxfa.com` como dominio
- Agrega `www.elmenuxfa.com` como dominio adicional
- Deja `elmenuxfa.com` como dominio primario/canonico
- Configura redireccion `www.elmenuxfa.com` -> `elmenuxfa.com` si quieres mantener apex como dominio publico principal
- Replica en Vercel las variables de entorno:
  - `SITE_URL=https://elmenuxfa.com`
  - `NEXT_PUBLIC_SITE_URL=https://elmenuxfa.com`

## 2. Spaceship DNS

En `spaceship.com`, dentro de la zona DNS de `elmenuxfa.com`:

- Crea o ajusta el registro necesario para apex segun lo que te pida Vercel
- Crea o ajusta `www` segun lo que te pida Vercel
- Espera propagacion DNS

Nota: Vercel muestra exactamente los records que debes copiar. Usa esos valores tal cual desde el panel Domains.

## 3. Supabase Auth

En Supabase Authentication debes actualizar:

- `Site URL` -> `https://elmenuxfa.com`
- Redirect URLs permitidas para web:
  - `https://elmenuxfa.com`
  - `https://www.elmenuxfa.com`
  - `https://elmenuxfa.com/*`
  - `https://www.elmenuxfa.com/*`

Esto es importante para:

- confirmacion de correo
- recuperacion de contraseña
- login OAuth web

## 4. Google / Apple / enlaces verificados

Despues del dominio en produccion:

- Verifica que `https://elmenuxfa.com/.well-known/assetlinks.json` responda 200
- Verifica que `https://elmenuxfa.com/.well-known/apple-app-site-association` responda 200 sin redireccion rara y con content-type valido
- Reinstala la app Android para forzar revalidacion de App Links
- Reinstala la app iOS o vuelve a compilar para refrescar Universal Links

## 5. Google / OAuth

Si usas OAuth de Google o dominios autorizados, agrega:

- `elmenuxfa.com`
- `www.elmenuxfa.com`

en los origenes o dominios autorizados que correspondan.

## 6. Post-cutover

Pruebas minimas recomendadas:

- Abrir `https://elmenuxfa.com/v/<slug>`
- Crear un pedido y confirmar que el tracking llegue con `https://elmenuxfa.com/orders/...` o `https://elmenuxfa.com/v/<slug>/orders/...`
- Confirmar correo de registro desde Supabase
- Recuperar contraseña
- Login con Google/Apple en web
- Abrir un link de pedido desde Android
- Abrir un link de pedido desde iPhone

## Observacion

`kosmenu.vercel.app` puede quedarse activo como dominio tecnico de Vercel, pero ya no deberia usarse como dominio publico en la app ni en los mensajes salientes.