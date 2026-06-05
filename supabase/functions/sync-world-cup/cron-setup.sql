-- pg_cron schedule for sync-world-cup Edge Function.
--
-- Runs the auto-sync every 30 minutes during Pacific game-day hours
-- (8am–11pm PT = 15:00–23:59 UTC plus 00:00–06:00 UTC next day),
-- only on dates 2026-06-11 through 2026-07-19.
--
-- Two cron jobs because cron expressions can't span months:
--   sync-wc-jun: June 11–30
--   sync-wc-jul: July 1–19
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE-TIME SETUP before running this file
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Supabase Dashboard → Database → Extensions
--    Toggle ON: pg_cron
--    Toggle ON: pg_net
--
-- 2. Open SQL Editor → New query → paste the SQL below → Run.
--
-- 3. Verify:
--      SELECT jobname, schedule, active FROM cron.job
--      WHERE jobname IN ('sync-wc-jun', 'sync-wc-jul');
--
--    Should show two rows, both active.
--
-- 4. After the tournament ends, clean up:
--      SELECT cron.unschedule('sync-wc-jun');
--      SELECT cron.unschedule('sync-wc-jul');
-- ─────────────────────────────────────────────────────────────────────────────


-- June 11 – 30
SELECT cron.schedule(
    'sync-wc-jun',
    '*/30 15-23,0-6 11-30 6 *',
    $$
    SELECT net.http_post(
        url := 'https://ttqvchhzuyzhzeumysks.supabase.co/functions/v1/sync-world-cup?execute=true',
        headers := '{"Content-Type":"application/json"}'::jsonb
    );
    $$
);

-- July 1 – 19
SELECT cron.schedule(
    'sync-wc-jul',
    '*/30 15-23,0-6 1-19 7 *',
    $$
    SELECT net.http_post(
        url := 'https://ttqvchhzuyzhzeumysks.supabase.co/functions/v1/sync-world-cup?execute=true',
        headers := '{"Content-Type":"application/json"}'::jsonb
    );
    $$
);
