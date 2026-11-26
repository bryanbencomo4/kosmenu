# Reanudar — unificación conversacional (2026-11-25)

**Rama:** `feature/conversational-ecosystem-unify` (local, **sin upstream**, **sin deploy prod**)  
**Último commit:** `e342243` — Unify conversational handoff kernel…  
**Cambios de hoy (login canónico):** **sin commit** (working tree dirty)

---

## Qué quedó hecho

### Unificación (commit `e342243`)
- Kernel handoff `commerce_chatbot` + payload compartido.
- Consumo en ChatAssistantView / boot.
- Inbox panel: `issue_commerce_handoff`.
- Continuidad post-login negocio + sessionStorage.
- Flutter BusinessAssistant alineado a tokens WA.
- Matriz 12/12 Preview + auditoría en `docs/AUDITORIA_UNIFICACION_CONVERSACIONAL.md`.

### Prep prueba manual (Preview QA)
- Comercio clon: `QA_CHATBOT_2026 pizzas el trueno`
  - id `09fb6dd4-e72f-4be7-822a-0972cc4e01e9`
  - slug `qa-chatbot-2026-trueno`
- Conversación: `6a67c725-0456-4815-9c95-83fd289335ca`
- Creds Preview (solo Preview Supabase `gsfxqzvmyzjjgpigrste`):
  - email `qa-chatbot-2026-trueno@elmenuxfa.test`
  - pass `QaChatbot2026!Safe`
- Detalle URLs: `docs/audit/manual-qa-access.json`
- Env local: `site/.env.qa-isolated.local`
  - incluye `NEXT_PUBLIC_APP_SITE_URL=http://127.0.0.1:5000`
  - supervisión + chatbot allowlist = UUID QA de arriba
- **Prod / Trueno real (`0aa8c53b-…` / `rest1@1xp.fr`) no tocados.** NO-GO prod.

### Decisión de producto (hoy) — login único
Usuario: **un solo login**, el de Flutter AuthScreen, URL canónica `app.elmenuxfa.com`.  
Bot = parte del panel de admin del negocio → no segundo formulario Next/chat.

Implementado (uncommitted):
- `/panel/login` → `redirect(merchantAppAuthHref(next))` hacia host Flutter.
- `merchantAppAuthHref()` en `site/app/_lib/public-site-config.ts`.
- `usePanelSession` redirige a ese href (no a form Next).
- `BusinessAuthCard` (Next) = CTA “Ir a iniciar sesión” → Flutter `/?next=/asistente`.
- Flutter `business_assistant_screen.dart`: quitó form inline; CTA → AuthScreen raíz con `MerchantDeepLink.rememberNext('/asistente')`.
- Borrado el clon Next `MerchantAuthLogin.tsx` (no debe volver como “segundo login”).

Para **QA local**, el host Flutter es `http://127.0.0.1:5000` (Preview), no prod.

---

## Qué NO hacer al volver

- No usar `app.elmenuxfa.com` + creds QA (fallan: son Preview).
- No pegar el conversationId QA en prod (Failed to fetch).
- No deploy / merge a prod sin GO explícito.
- No tocar Trueno real ni allowlist WA prod.

---

## Cómo reanudar (orden)

1. Encender servidores Preview:
   ```powershell
   # Next QA
   cd site
   npx --yes dotenv run -f .env.qa-isolated.local --override -- next dev -p 3024

   # Flutter Preview (otra terminal)
   node scripts/_run-flutter-web-preview.mjs serve
   # o el runner que sirva build/web-preview-qa en :5000
   ```
2. Cliente: http://127.0.0.1:3024/v/qa-chatbot-2026-trueno?chatbot=1  
3. Login negocio: http://127.0.0.1:5000/  
   - `qa-chatbot-2026-trueno@elmenuxfa.test` / `QaChatbot2026!Safe`  
4. Inbox/conversación:  
   http://127.0.0.1:5000/panel/conversaciones/6a67c725-0456-4815-9c95-83fd289335ca  
5. Bot: http://127.0.0.1:5000/asistente  

### Checklist de prueba pendiente
- [ ] Chat cliente en menú QA (pedido / continuidad).
- [ ] Login Flutter Preview → abre conversación / inbox.
- [ ] Take / return (human takeover) en Preview.
- [ ] “Enviar enlace al asistente” (handoff) desde inbox.
- [ ] Bot negocio retoma con mismo AuthScreen (sin form inline).
- [ ] Confirmar que **no** hay segundo UI de login en Next.

### Después de GO manual
- Commit de los cambios de login canónico (si el usuario lo pide).
- Decidir si push remoto / PR (hoy: sin upstream).

---

## Archivos dirty relevantes (login)

- `site/app/panel/login/page.tsx`
- `site/app/panel/login/PanelLoginClient.tsx`
- `site/app/panel/_lib/usePanelSession.ts`
- `site/app/_lib/public-site-config.ts`
- `site/app/asistente-negocio/BusinessAuthCard.tsx`
- `site/app/panel/conversaciones/[conversationId]/ConversationDetailClient.tsx`
- `lib/screens/business_assistant_screen.dart`
- (+ otros uncommitted del día / allowlist preview)

---

## Lección del día (evitar confusión)

| Entorno | Login | Creds | Conversación |
| --- | --- | --- | --- |
| Preview QA | `127.0.0.1:5000` | `qa-chatbot-2026-trueno@…` | `6a67c725-…` |
| Prod Trueno | `app.elmenuxfa.com` | `rest1@1xp.fr` (clave del dueño) | solo IDs de prod |

Mezclar filas = error “credenciales” o “Failed to fetch”.
