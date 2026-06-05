# Plan: Fork the App to a Second Repo + New Supabase Project (Work Pool)

## Context

User wants a second, free-to-play pool ("Rain City Analytics" / work pool) for coworkers — completely isolated from the existing money pool, with zero risk to the live money pool that kicks off in ~6 days.

Decision made (correctly): **don't refactor the live code to be multi-tenant**. Instead, **clone the deployment**. Two repos + two Supabase projects = two physically separate apps that just happen to share the same source code.

User already has the FIFA org in Supabase with one project (`FIFA WC Pool`). The plan: add a new project (`FIFA WC Pool — Work`) in the same org, fork the GitHub repo, swap three constants, deploy.

## Outcome

- The current money pool keeps running on the existing repo + Supabase, untouched. Zero risk to it.
- A new repo (`world-cup-pool-work` or similar) runs against a new Supabase project.
- The work pool gets its own URL — invisible to money-pool users.
- Both pools share match results / scoring logic by virtue of running the same code, but their player lists, leaderboards, picks, and chat are physically separate databases.

## What I'll deliver in this plan

Three things, in this order:

1. **Step-by-step workflow** the user runs on their side (GitHub fork, Supabase project create, deploy)
2. **A self-contained SQL block** that creates the full schema in the new Supabase project (so they can paste it into the SQL editor and run once)
3. **The exact code changes** they make in the forked repo's `js/data.js` and `js/app.js`

## Step-by-step workflow

### A) Fork or clone the repo

Option 1 (cleanest — GitHub fork):
- Go to https://github.com/seanharrigan/world-cup-pool on GitHub
- Click "Fork" → name it `world-cup-pool-work` (or whatever)
- `git clone git@github.com:seanharrigan/world-cup-pool-work.git` locally

Option 2 (if you want zero connection to the original):
- Locally: `cp -r world-cup-pool world-cup-pool-work && cd world-cup-pool-work && rm -rf .git && git init`
- Create a fresh empty GitHub repo, push it up

Open the new folder in a new VS Code window.

### B) Create the new Supabase project

In the Supabase dashboard (the screenshot you sent — `FIFA World Cup Pool` org):
- Click **New project** (top-right green button)
- Name: `FIFA WC Pool — Work` (or similar)
- Region: pick the same as your existing one (`us-west-2`) for consistency
- DB password: generate a strong one and save it somewhere safe (1Password/Notes)
- Plan: Free tier is fine — work pool is small
- Click Create. Wait ~2 minutes for provisioning.

### C) Apply the schema to the new project

Once provisioned, in the new project:
- Go to **SQL Editor** (left nav)
- Paste in the full schema block from section "SQL Schema" below
- Run it
- Verify tables exist by going to **Table Editor** — you should see: profiles, picks, app_settings, matches, team_advancement, messages, message_reactions, notifications, admins

Also set up Storage:
- Go to **Storage** in the new project
- Create a public bucket called `avatars`

Also enable Realtime:
- Go to **Database → Replication**
- Enable replication for: `messages`, `message_reactions`, `notifications`, `matches`, `team_advancement`, `profiles`

### D) Set up Google OAuth for the new project

The current site uses Google sign-in. You need to:
- In the new Supabase project: **Authentication → Providers → Google**
- You'll need a Google OAuth client. You can reuse the existing one (just add the new Supabase callback URL to authorized redirect URIs in Google Cloud Console), OR create a new one. Either works; reusing is easier.
- The redirect URI to add in Google Cloud Console looks like: `https://<NEW_PROJECT_REF>.supabase.co/auth/v1/callback`

(If you don't remember which Google OAuth client this app uses, look at your existing project's Auth → Providers → Google tab — there's a client ID there you can reuse.)

### E) Edit three constants in the forked repo

In the new folder, edit two files:

**[js/data.js](js/data.js#L1) lines 1–2:**
```js
const SUPABASE_URL = 'https://<NEW_PROJECT_REF>.supabase.co';
const SUPABASE_KEY = '<NEW_PUBLISHABLE_KEY>';
```
Both values come from the new Supabase project → **Settings → API**. The URL is the project URL. The key is the `anon` / `publishable` key (NOT the `service_role` key).

**[js/app.js:8](js/app.js#L8):**
```js
const POOL_JOIN_PASSWORD = 'rain26';  // or whatever you want for the work pool
```

Save, commit, push.

### F) Deploy

You're on GitHub Pages currently. Easiest path:
- In the new GitHub repo: **Settings → Pages → Source → Deploy from branch → main**
- Wait ~1 min for the first deploy
- Your URL will be `https://<your-github-username>.github.io/world-cup-pool-work/`
- Share that URL + the password (`rain26` or whatever you chose) with your coworkers

### G) Update the admin email in the forked code

The work pool's admin is `valeriaandseanharrigan@gmail.com` (not the money pool's `seanigan44@gmail.com`). In the forked repo edit `js/features.js` around line 7347 — the `isProtectedAdminEmail` function:
- Remove the `'seanigan44@gmail.com'` entry
- Add `'valeriaandseanharrigan@gmail.com'`
- Leave `'harrigan.j.connor@gmail.com'` as-is

### H) First-run setup

Open the new URL in your browser, sign in with the `valeriaandseanharrigan@gmail.com` Google account, enter the work password. This creates the admin profile in the new project. Then:
- In the new Supabase project's `admins` table, confirm `valeriaandseanharrigan@gmail.com` is there (it's seeded by `schema.sql`).
- The hardcoded admin check (now updated to that email) shows the Admin nav automatically.

## SQL Schema (paste into new project's SQL Editor)

⚠️ **I do not have access to the live schema** because the MCP Supabase connection in this workspace points at a different project (La Boda) and must not be touched. The schema below is **derived from observing every `from('...')` call in the codebase** — what columns the app reads, writes, and updates. It will produce a functionally identical database. If anything is missing (e.g. an index, a default, a constraint) the app will still work but the admin should verify by comparing against the live project after creation.

**Safer alternative I recommend:** in the existing FIFA WC Pool project, go to **Database → Backups** or **Database → Schema visualizer**, or run a `pg_dump --schema-only` via the connection string. That gives you the *exact* live schema. If the user wants, I can also produce a "schema-export prompt" they can run themselves and paste back here for me to translate into the new project.

**Proposed schema (best-effort reconstruction):**

```sql
-- Profiles: one row per user
CREATE TABLE profiles (
    email TEXT PRIMARY KEY,
    nickname TEXT,
    realname TEXT,
    favorite_team TEXT,
    home_country TEXT,
    has_paid BOOLEAN DEFAULT FALSE,
    blocked BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    picks_save_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Picks: 8 rows per user
CREATE TABLE picks (
    id BIGSERIAL PRIMARY KEY,
    user_email TEXT NOT NULL REFERENCES profiles(email) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    team_nickname TEXT,
    team_realname TEXT,
    cost INTEGER,
    tier INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_email, team_name)
);

-- App settings: single row keyed by a constant
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    picks_locked BOOLEAN DEFAULT FALSE,
    auto_lock_at_kickoff BOOLEAN DEFAULT TRUE,
    hide_team_selection BOOLEAN DEFAULT FALSE,
    hide_player_chips BOOLEAN DEFAULT FALSE,
    auto_team_status_sync BOOLEAN DEFAULT FALSE
);
INSERT INTO app_settings (key) VALUES ('main') ON CONFLICT DO NOTHING;

-- Matches: results entered by admin
CREATE TABLE matches (
    id BIGSERIAL PRIMARY KEY,
    team_home TEXT,
    team_away TEXT,
    score_home INTEGER,
    score_away INTEGER,
    stage TEXT,
    match_date TIMESTAMPTZ,
    match_date_manual BOOLEAN DEFAULT FALSE,
    manual_override BOOLEAN DEFAULT FALSE,
    extra_time BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team advancement: derived knockout status
CREATE TABLE team_advancement (
    team_name TEXT PRIMARY KEY,
    advanced_to_knockouts BOOLEAN DEFAULT FALSE,
    eliminated BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat
CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    nickname TEXT,
    realname TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE message_reactions (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    emoji TEXT NOT NULL,
    UNIQUE (message_id, user_email, emoji)
);

-- Notifications: admin → all users
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admins (if the app checks this; the code uses isProtectedAdminEmail
-- which is hardcoded, so this may be optional. Create it for safety.)
CREATE TABLE admins (
    email TEXT PRIMARY KEY,
    added_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO admins (email) VALUES ('valeriaandseanharrigan@gmail.com') ON CONFLICT DO NOTHING;

-- RLS policies (open for now — match existing app's trust model)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_advancement ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Authenticated read/write to most tables
CREATE POLICY profiles_all ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY picks_all ON picks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_settings_read ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_write ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY matches_all ON matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY team_advancement_all ON team_advancement FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY messages_all ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY reactions_all ON message_reactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY notifications_read ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY admins_read ON admins FOR SELECT TO authenticated USING (true);
```

**Verification step after running:** Sign in to the new pool with a test account, save a picks squad of 8 teams, confirm Supabase shows 8 rows in `picks` and 1 row in `profiles`. If any column the app tries to read is missing, you'll get a console error pointing at it — quick to patch with an `ALTER TABLE ADD COLUMN` in the SQL editor.

## Code changes summary (forked repo only)

Three lines:

| File | Line | Old | New |
|---|---|---|---|
| js/data.js | 1 | `const SUPABASE_URL = 'https://ttqvchhzuyzhzeumysks.supabase.co';` | `const SUPABASE_URL = 'https://<NEW>.supabase.co';` |
| js/data.js | 2 | `const SUPABASE_KEY = 'sb_publishable_3cT0wz86jjMqaEciDUwseg_Y59smIY3';` | `const SUPABASE_KEY = '<NEW_PUBLISHABLE_KEY>';` |
| js/app.js | 8 | `const POOL_JOIN_PASSWORD = 'fifafifa26';` | `const POOL_JOIN_PASSWORD = 'rain26';` (or whatever) |

That's it. Optional polish (only if you want):
- Change the page title / favicon to differentiate the work pool from the money pool
- Remove buy-in / payment references in the UI copy (search for "$50", "Paid", "buy-in")
- Disable the `has_paid` toggle column in Admin → Players (cosmetic)

## What does NOT change

- The original money-pool repo
- The original money-pool Supabase project
- Match schedule data, scoring rules, knockout mapping, anything in the source code logic
- The hardcoded admin email check — for the work pool it gets updated to `valeriaandseanharrigan@gmail.com`. The money pool still uses `seanigan44@gmail.com`.

## Risks / caveats

1. **Schema reconstruction risk.** As noted, I built the schema by reading the code, not by introspecting the live DB. There may be subtle differences (defaults, constraints, indexes). **Best fix:** export the live schema from the existing project first and use that. I can guide you through `pg_dump --schema-only` if you give me your DB password — though running it locally is simpler and safer than pasting credentials.
2. **Realtime replication setup.** If you forget to enable replication on `messages`, chat will work but won't be live. Easy to fix later in the Database → Replication tab.
3. **OAuth.** If Google sign-in fails on the new pool, the most likely cause is a missing redirect URI in Google Cloud Console. Symptom: redirect error after Google login.
4. **Two repos = two-place fixes.** Any bug fix needs to be applied to both. For a 7-week tournament, the work pool may not even need bug fixes, but worth noting.

## Verification

1. **In the new Supabase project**: tables exist, RLS enabled, `app_settings` has the `main` row, `admins` has your email, storage `avatars` bucket exists, replication enabled on the right tables.
2. **In the forked repo**: `node --check js/data.js js/app.js` passes; `npm test` passes (23 tests, none affected).
3. **Live test**: open the new deployment URL, sign in with a test Google account, enter the new password, complete profile setup, save a 8-team squad. Confirm picks appear in the new DB. Sign in with admin account, confirm Admin nav appears, confirm Players tab shows the test user.
4. **Isolation test**: open the original money-pool URL in another tab, sign in with the same admin account, confirm money-pool data is unchanged. The two URLs are completely independent.

## Open questions for the user before implementation

1. **Repo strategy** — GitHub fork (`world-cup-pool-work` as a fork of `world-cup-pool`) or fresh repo with no upstream? Fork is easier for pulling future bug fixes; fresh is fully independent.
2. **Work pool password** — what's the password? (e.g. `rain26`)
3. **Schema export** — do you want to dump the live schema first (cleanest), or trust the reconstructed schema above and patch if needed?
4. **OAuth** — reuse existing Google OAuth client or create a new one for the work pool?
