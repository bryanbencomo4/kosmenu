-- PREVIEW BOOTSTRAP ONLY
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
-- Daily public-menu refresh at 08:00 UTC (04:00 America/Caracas).
-- Requires Preview Vault secrets:
--   preview-menu-sync-secret
--   preview-function-anon-key
-- Production data is read through the public anon API only.

do $preview_menu_sync$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'preview-public-menu-sync-daily';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'preview-public-menu-sync-daily',
    '0 8 * * *',
    $job$
      select net.http_post(
        url := 'https://gsfxqzvmyzjjgpigrste.supabase.co/functions/v1/sync-preview-public-menu',
        body := '{"dry_run":false}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'preview-function-anon-key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'preview-function-anon-key'),
          'x-preview-menu-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'preview-menu-sync-secret')
        ),
        timeout_milliseconds := 120000
      );
    $job$
  );
end
$preview_menu_sync$;