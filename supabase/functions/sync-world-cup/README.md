# sync-world-cup

Supabase Edge Function that pulls match results from football-data.org and
upserts them into the `matches` table.

Operational model is **Model C** (auto-write with manual override): the
function writes scores from the API automatically, but skips any match where
`manual_override = true` so admin hand-edits are sticky.

---

## Status

**Scaffold only.** The function deploys and responds with a placeholder JSON.
Fetch + upsert + cron + admin UI all land in subsequent commits.

---

## One-time setup (you run this once before the first real commit)

### 1. Install the Supabase CLI (if not already)

```bash
brew install supabase/tap/supabase
# or
npm install -g supabase
```

### 2. Log in and link this repo to your Supabase project

```bash
npx supabase login
npx supabase link --project-ref ttqvchhzuyzhzeumysks
```

### 3. Set the football-data.org API key as a secret

```bash
npx supabase secrets set FOOTBALL_DATA_API_KEY=your_key_here
```

The key never touches the browser — it lives only in Supabase's secret store
and is read by the Edge Function via `Deno.env.get(...)`.

### 4. Add the override columns to the `matches` table

Paste into Supabase SQL Editor:

```sql
ALTER TABLE matches ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS auto_synced_at TIMESTAMPTZ;
```

`manual_override` flips to `true` whenever the existing admin "Log Match" form
saves a row. The Edge Function will skip any row where it's true.

### 5. Deploy the function

```bash
npx supabase functions deploy sync-world-cup --no-verify-jwt
```

`--no-verify-jwt` lets the function be invoked by Supabase Cron without a user
session.

### 6. Smoke test

```bash
curl https://ttqvchhzuyzhzeumysks.supabase.co/functions/v1/sync-world-cup
```

Should return:

```json
{
  "ok": true,
  "message": "scaffold — fetch + upsert not implemented yet",
  "apiKeyConfigured": true,
  "mappersLoaded": true
}
```

If `apiKeyConfigured` is `false`, step 3 didn't take.

---

## Auto-sync schedule (pg_cron)

The Edge Function runs every 30 minutes during Pacific game-day hours, only on tournament dates (2026-06-11 → 2026-07-19). Setup is in `cron-setup.sql` in this folder.

**One-time setup before kickoff:**

1. Supabase Dashboard → Database → Extensions → toggle ON `pg_cron` and `pg_net`
2. Open `cron-setup.sql`, copy the full contents
3. Supabase Dashboard → SQL Editor → New query → paste → Run
4. Verify with `SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'sync-wc-%';`

**After the tournament**, run the unschedule commands from the bottom of `cron-setup.sql`.

The admin **Match Sync** tab also has a manual `Sync Now` button that hits the same Edge Function on demand — useful between cron fires or before kickoff for testing.

## Manual override

When an admin saves a match through the existing "Log Match" form (or the simulate-tournament tool), that row is flagged `manual_override = true`. The Edge Function skips any row with that flag, so admin corrections are sticky and the auto-sync will never overwrite them.

The admin Match Results list shows source badges:
- 🟢 Auto · Nm ago — last touched by auto-sync
- ✏️ Manual — admin-saved, sticky
- (nothing) — legacy row from before this feature shipped
