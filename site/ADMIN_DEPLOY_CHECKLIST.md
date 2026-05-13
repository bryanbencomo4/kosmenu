# Admin Deploy Checklist

## Scope

This checklist hardens and activates `admin.elmenuxfa.com` inside the existing `site` project without changing the public site, business landing, or business modules.

## A. Required Environment Variables

Configure these variables in Vercel for `Production` and `Preview`.

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_PUBLIC_SITE_URL=https://www.elmenuxfa.com
NEXT_PUBLIC_BUSINESS_SITE_URL=https://business.elmenuxfa.com
NEXT_PUBLIC_ADMIN_SITE_URL=https://admin.elmenuxfa.com
ADMIN_SITE_URL=https://admin.elmenuxfa.com
```

## B. SQL For The First Super Admin

Run this after the user exists in Supabase Auth.

```sql
insert into public.admin_users (auth_user_id, email, role, is_active)
select
  id,
  lower(email),
  'super_admin',
  true
from auth.users
where lower(email) = lower('bryanppg@gmail.com')
on conflict (email) do update
set
  auth_user_id = excluded.auth_user_id,
  role = 'super_admin',
  is_active = true,
  updated_at = now();

select email, role, is_active, auth_user_id
from public.admin_users
where email = lower('bryanppg@gmail.com');
```

## C. Supabase Steps

1. Apply `20260513170000_admin_rbac_audit.sql`.
2. Apply `20260513193000_admin_users_least_privilege.sql`.
3. Keep `Site URL` in Supabase Auth as `https://elmenuxfa.com`.
4. In Supabase Auth > URL Configuration > Redirect URLs, add:
   - `https://admin.elmenuxfa.com/admin/forgot-password`
   - `https://admin.elmenuxfa.com/forgot-password`
   - `https://admin.elmenuxfa.com/admin/login`
   - `https://admin.elmenuxfa.com/login`
   - `https://admin.elmenuxfa.com/admin/reset-password`
   - `https://admin.elmenuxfa.com/reset-password`
5. Do not use `https://elmenuxfa.com` as the recovery redirect for admin password reset emails.
6. In Supabase Auth, create `bryanppg@gmail.com` if it does not already exist.
7. Confirm the user is verified or otherwise allowed to sign in.
8. Run the SQL above.
9. Verify the row exists in `public.admin_users` with `role = 'super_admin'`, `is_active = true`, and a non-null `auth_user_id`.

## D. Vercel Steps

1. Open the existing `site` project in Vercel.
2. Add `admin.elmenuxfa.com` as a domain on that same project.
3. Configure all required variables for `Production`.
4. Configure the same variables for `Preview`, unless you intentionally use separate preview URLs.
5. Redeploy after the variables are saved.
6. Confirm the domain is marked as validated by Vercel.

## E. Cloudflare Steps

1. Create a `CNAME` record for `admin` pointing to `cname.vercel-dns.com` or the target Vercel shows for the project.
2. Keep it as `DNS only` until Vercel validates the domain.
3. After validation, enable proxy if Cloudflare WAF will sit in front of Vercel.
4. Set SSL/TLS mode to `Full (strict)`.
5. Enable WAF managed rules.
6. Configure rate limits:
   - `/login` and `/admin/login`: 10 requests per minute per IP.
  - `/forgot-password` and `/admin/forgot-password`: 10 requests per minute per IP.
  - `/reset-password` and `/admin/reset-password`: 10 requests per minute per IP.
   - `/admin/api/*`: 60 requests per minute per IP.
7. Apply `Managed Challenge` or a temporary block when limits are exceeded.

## F. Password Recovery

1. Start the definitive admin flow from `https://admin.elmenuxfa.com/admin/forgot-password`.
2. Confirm the request is sent through the app endpoint and not through Supabase Dashboard directly.
3. Confirm the email redirect lands on `https://admin.elmenuxfa.com/admin/reset-password`.
4. Confirm `https://admin.elmenuxfa.com/reset-password` also resolves to the same admin recovery screen.
5. Confirm the page stays on the admin host and never falls into `https://elmenuxfa.com` or `/v/...`.
6. Confirm the password update returns to `/admin/login` with a success message.

## G. Post-Deploy Tests

1. `admin.elmenuxfa.com/` redirects to login when there is no session.
2. `admin.elmenuxfa.com/login` and `admin.elmenuxfa.com/admin/login` render the login page.
3. `admin.elmenuxfa.com/forgot-password` and `admin.elmenuxfa.com/admin/forgot-password` render the forgot-password page.
4. `admin.elmenuxfa.com/admin/reset-password` renders the recovery form.
5. `admin.elmenuxfa.com/reset-password` rewrites to the same recovery form.
6. Password recovery emails for admin use `admin.elmenuxfa.com/admin/reset-password` as the redirect target.
7. A user authenticated in Supabase but not allowed in `admin_users` lands on `/admin/unauthorized`.
8. `bryanppg@gmail.com` as `super_admin` reaches the admin dashboard.
9. `admin.elmenuxfa.com/admin/api/me` returns admin data with a valid session.
10. `elmenuxfa.com` still works.
11. `www.elmenuxfa.com` still works.
12. `business.elmenuxfa.com` still works.
13. Admin traffic does not fall into `/v/...`.

## Password Recovery Notes

- Keep Supabase `Site URL` as `https://elmenuxfa.com`.
- Do not use `Send password recovery` from Supabase Dashboard for admin except if you change the Site URL temporarily for that one manual operation.
- The definitive admin flow must start from `https://admin.elmenuxfa.com/admin/forgot-password` because that route sends `redirectTo` explicitly toward the admin reset screen.
- The admin forgot-password screen is `https://admin.elmenuxfa.com/admin/forgot-password`.
- `https://admin.elmenuxfa.com/forgot-password` is supported as an alias that lands on the same screen.
- The admin recovery screen is `https://admin.elmenuxfa.com/admin/reset-password`.
- `https://admin.elmenuxfa.com/reset-password` is supported as an alias that lands on the same screen.
- The recovery link for admin accounts must never point to `https://elmenuxfa.com`, because that host serves the public portal and cannot complete the admin password reset flow.

## Security Notes

- The current logout flow clears the local admin cookie and attempts a Supabase server-side sign-out using the current JWT.
- Supabase sign-out revokes refresh tokens for the session, but it does not invalidate the current access token JWT until it expires.
- Because of that limitation, deleting the cookie is effective for the browser session, but a leaked access token would remain valid until expiry.
- If you need tighter logout guarantees, reduce the Supabase JWT expiry window before production.