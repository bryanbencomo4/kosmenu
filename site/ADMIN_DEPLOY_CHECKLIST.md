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
3. In Supabase Auth, create `bryanppg@gmail.com` if it does not already exist.
4. Confirm the user is verified or otherwise allowed to sign in.
5. Run the SQL above.
6. Verify the row exists in `public.admin_users` with `role = 'super_admin'`, `is_active = true`, and a non-null `auth_user_id`.

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
   - `/admin/api/*`: 60 requests per minute per IP.
7. Apply `Managed Challenge` or a temporary block when limits are exceeded.

## F. Post-Deploy Tests

1. `admin.elmenuxfa.com/` redirects to login when there is no session.
2. `admin.elmenuxfa.com/login` renders the login page.
3. A user authenticated in Supabase but not allowed in `admin_users` lands on `/admin/unauthorized`.
4. `bryanppg@gmail.com` as `super_admin` reaches the admin dashboard.
5. `admin.elmenuxfa.com/admin/api/me` returns admin data with a valid session.
6. `elmenuxfa.com` still works.
7. `www.elmenuxfa.com` still works.
8. `business.elmenuxfa.com` still works.
9. Admin traffic does not fall into `/v/...`.

## Security Notes

- The current logout flow clears the local admin cookie and attempts a Supabase server-side sign-out using the current JWT.
- Supabase sign-out revokes refresh tokens for the session, but it does not invalidate the current access token JWT until it expires.
- Because of that limitation, deleting the cookie is effective for the browser session, but a leaked access token would remain valid until expiry.
- If you need tighter logout guarantees, reduce the Supabase JWT expiry window before production.