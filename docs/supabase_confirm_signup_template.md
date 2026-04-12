# Plantilla de confirmacion de registro para Supabase

Este proyecto ya envia el `emailRedirectTo` a `elmenuxfa.com`, pero el contenido del correo de confirmacion no se puede cambiar desde la app Flutter.

Para reemplazar el correo por uno propio de elmenuxfa.com debes configurarlo en el panel de Supabase:

1. Ve a `Authentication`.
2. Ve a `Email Templates`.
3. Abre la plantilla `Confirm signup`.
4. Reemplaza asunto y HTML por lo siguiente.
5. Si quieres que el remitente deje de mostrar `Supabase`, configura tambien `SMTP Settings` con tu dominio/remitente.

## Subject sugerido

Confirma tu cuenta en elmenuxfa.com

## HTML sugerido

```html
<div style="margin:0;padding:0;background:#f5f0ff;font-family:Arial,sans-serif;color:#24163a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:24px;padding:32px 28px;border:1px solid #eadcff;box-shadow:0 18px 48px rgba(43,20,85,0.12);">
      <div style="text-align:center;margin-bottom:20px;">
        <img src="https://elmenuxfa.com/branding/full_logo.png" alt="elmenuxfa.com" style="max-width:180px;height:auto;" />
      </div>

      <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#7c3aed;font-weight:700;">
        Activa tu cuenta
      </p>

      <h1 style="margin:0 0 14px 0;font-size:30px;line-height:1.1;color:#24163a;">
        Bienvenido a elmenuxfa.com
      </h1>

      <p style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#5b5470;">
        Confirma tu correo para activar tu cuenta, publicar tu menu digital y comenzar a recibir pedidos.
      </p>

      <div style="margin:28px 0;text-align:center;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:14px;font-size:16px;font-weight:700;">
          Confirmar mi cuenta
        </a>
      </div>

      <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#5b5470;">
        Si el boton no funciona, copia y pega este enlace en tu navegador:
      </p>

      <p style="margin:0 0 20px 0;font-size:13px;line-height:1.7;word-break:break-all;color:#6d28d9;">
        {{ .ConfirmationURL }}
      </p>

      <p style="margin:0;font-size:13px;line-height:1.6;color:#7a7391;">
        Si no creaste esta cuenta, puedes ignorar este mensaje.
      </p>
    </div>
  </div>
</div>
```

## Nota importante

Cambiar el `emailRedirectTo` no modifica el asunto, remitente ni HTML del correo. Eso solo cambia adonde aterriza el usuario despues de confirmar.