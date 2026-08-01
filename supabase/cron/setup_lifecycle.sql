-- Run this in the Supabase SQL Editor only after:
--   1. all files in supabase/migrations have been applied;
--   2. the deployed app has LIFECYCLE_WORKER_SECRET set;
--   3. Supabase Vault contains these two named secrets:
--        theses_app_url       https://your-production-domain.example
--        theses_worker_secret the exact LIFECYCLE_WORKER_SECRET value
--
-- You can create those secrets in Dashboard > Integrations > Vault, or with:
-- select vault.create_secret('https://your-production-domain.example', 'theses_app_url');
-- select vault.create_secret('replace-with-a-long-random-secret', 'theses_worker_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'theses_app_url'
  ) then
    raise exception 'Missing Vault secret: theses_app_url';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'theses_worker_secret'
  ) then
    raise exception 'Missing Vault secret: theses_worker_secret';
  end if;
end;
$$;

select cron.schedule(
  'theses-lifecycle-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := rtrim((
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'theses_app_url'
      limit 1
    ), '/') || '/api/internal/lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'theses_worker_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('scheduledAt', now()),
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);

select cron.schedule(
  'theses-refresh-worker',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := rtrim((
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'theses_app_url'
      limit 1
    ), '/') || '/api/internal/refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'theses_worker_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('scheduledAt', now()),
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);

-- Verify the schedules:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname in ('theses-lifecycle-worker', 'theses-refresh-worker');
--
-- Inspect HTTP results:
-- select id, status_code, error_msg, created
-- from net._http_response order by created desc limit 20;
--
-- Remove the jobs if needed:
-- select cron.unschedule(jobid) from cron.job
-- where jobname in ('theses-lifecycle-worker', 'theses-refresh-worker');
