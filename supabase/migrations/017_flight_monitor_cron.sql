-- =====================================================================
-- BrandoRides — Schedule the flight-monitor tick
-- =====================================================================
-- Single recurring job, running forever from deployment — never started
-- or stopped per booking. Every 30 minutes it wakes the flight-monitor
-- edge function, which does its own DB query to find rides matching
-- either condition (pre-departure safety check, or departure check) and
-- only calls AviationStack for rides that actually match. The service
-- role key needed to authenticate this call lives in Supabase Vault
-- (inserted separately, outside of any committed migration) — never
-- hardcoded here.
SELECT cron.schedule(
  'flight-monitor-tick',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://plkjvhyjovrxbxhtlnjx.supabase.co/functions/v1/flight-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
