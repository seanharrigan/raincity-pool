# Rain City Pool — Kickoff Brief

This folder is the starting point for a **second** World Cup pool — a free-to-play work pool ("Rain City Analytics"), running on a separate Supabase backend and separate GitHub repo from the original money pool.

The original money pool lives at `~/Documents/world-cup-pool/` (don't touch it). The work pool is a fork with three constants changed.

## What's in this folder

| File | Purpose |
|---|---|
| `README.md` | This file — high-level brief and step-by-step workflow |
| `CLAUDE.md` | Instructions for Claude Code when working in this repo |
| `PLAN.md` | Full plan: workflow, schema design, code changes, risks, verification |
| `schema.sql` | SQL block to paste into the new Supabase project's SQL Editor |

## Why two repos / two databases instead of one shared backend?

Considered making the existing app multi-tenant (one DB, scoped by `pool_id`). Rejected because:
- ~18 cross-user surfaces would each need a pool filter applied; missing any one leaks data
- Risk of breaking the live money pool 6 days before kickoff
- Client-side filtering is still vulnerable to DevTools sniffing

A second deployment with a separate Supabase gives physical isolation. No filter to forget. Trade-off: bug fixes need to be applied to both repos, but for a 7-week tournament that's negligible.

## What to do next — four phases

Each phase ends in a verifiable checkpoint. Don't move to the next phase until the previous one is green.

---

### Phase 1 — Fork the repo and deploy it (skeleton site, no backend yet)

Goal: a public URL exists that loads the app. It will fail at sign-in because no Supabase is configured, but the static HTML/CSS/JS should appear.

1. Go to https://github.com/seanharrigan/world-cup-pool → click **Fork** → name it `raincity-pool` (Option A: recommended, lets you pull future fixes). Or `cp -R ~/Documents/world-cup-pool/. .` then `rm -rf .git node_modules && git init` (Option B: fully independent).
2. Clone the fork into `/Users/seanharrigan/Documents/ai-projects/raincity-pool/`.
3. In the new GitHub repo → **Settings → Pages → Source: Deploy from branch → main**.
4. Wait ~1 minute for first deploy.

**Checkpoint:** Open `https://seanharrigan.github.io/raincity-pool/` in a browser. The app loads (header, dashboard, picks page visible). Trying to sign in fails — that's expected at this stage.

---

### Phase 2 — Stand up the Supabase backend

Goal: a new, isolated database with the right tables, RLS, storage bucket, and replication.

1. Supabase dashboard → FIFA World Cup Pool org → **New project**
   - Name: `Rain City Pool`
   - Region: `us-west-2`
   - DB password: generate, save securely
   - Plan: Free tier
2. Wait ~2 min for provisioning.
3. Left nav → **SQL Editor** → paste full contents of `schema.sql` → **Run**.
4. Verify in **Table Editor**: 9 tables exist (`admins`, `app_settings`, `matches`, `message_reactions`, `messages`, `notifications`, `picks`, `profiles`, `team_advancement`).
5. Sanity-check: SQL Editor → `SELECT * FROM app_settings;` → returns 1 row keyed `main`. `SELECT * FROM admins;` → returns `valeriaandseanharrigan@gmail.com`.
6. **Storage** → **New bucket** → name `avatars` → set to **public**.
7. **Database → Replication** → enable for `matches` and `messages` (mirrors what the live money pool has).

**Checkpoint:** Tables exist, app_settings seeded, admins seeded, avatars bucket exists, two tables marked Realtime-enabled.

---

### Phase 3 — Wire up authentication

Goal: users can sign in to the deployed site.

**⚠ Open decision before starting this phase — see "Open Questions" below.** Choose between Google OAuth and magic-link email. The steps below assume Google OAuth (matches the money pool). If switching to magic link, this phase changes significantly.

If sticking with Google:

1. New Supabase project → **Authentication → Providers → Google** → enable.
2. Copy the existing Client ID and Client Secret from the money pool's Supabase Auth → Providers → Google (or pull from Google Cloud Console).
3. Paste them into the new project.
4. In **Google Cloud Console → APIs & Services → Credentials**, open the OAuth client and add the new redirect URI to **Authorized redirect URIs**:
   `https://<NEW_PROJECT_REF>.supabase.co/auth/v1/callback`
5. In the new Supabase project → **Authentication → URL Configuration**:
   - **Site URL**: `https://seanharrigan.github.io/raincity-pool/`
   - **Redirect URLs** (allowlist): same URL

**Checkpoint:** clicking sign-in on the deployed site (after phase 4 wires the new Supabase keys) takes the user to Google's consent screen and back successfully.

---

### Phase 4 — Connect the code to the new Supabase, swap password, fix admin email

Goal: the deployed app talks to the new database, accepts the work-pool password, and shows the Admin nav to the work-pool admin.

1. From the new Supabase project → **Settings → API** → copy the project URL and the `anon` (publishable) key.
2. Edit the three files (this is the entire code-side delta from the money pool):

   **`js/data.js` lines 1-2:**
   ```js
   const SUPABASE_URL = 'https://<NEW_PROJECT_REF>.supabase.co';
   const SUPABASE_KEY = '<NEW_PUBLISHABLE_KEY>';
   ```

   **`js/app.js` line 8:**
   ```js
   const POOL_JOIN_PASSWORD = 'rain26';
   ```

   **`js/features.js` ~line 7347** — inside `isProtectedAdminEmail`:
   - Remove the `'seanigan44@gmail.com'` entry
   - Add `'valeriaandseanharrigan@gmail.com'`
   - Leave `'harrigan.j.connor@gmail.com'` as-is

3. Commit, push. GitHub Pages auto-redeploys in ~30 seconds.
4. **First-run sign-in:** open the deployed URL, sign in with the `valeriaandseanharrigan@gmail.com` Google account, enter the password `rain26`, complete the profile setup.
5. **Sanity test:** save a test 8-team squad on the picks page. Confirm in the new Supabase Table Editor that `profiles` has 1 row, `picks` has 8 rows.
6. **Admin verification:** confirm the Admin nav appears in the top bar. Go to Admin → Players → confirm you can see your test user.

**Checkpoint:** signed in, profile created, picks saved to the new DB, admin nav visible. Original money pool URL is still working and unchanged.

## What inherits from the original pool unchanged

- Match schedule, scoring rules, knockout mapping, countdown, auto-lock at kickoff (18:00 UTC June 11, 2026)
- All UI, dashboard, leaderboard, chat, picks page
- All admin features (Match Manager, Players, Notifications, etc.)

## Optional cosmetic changes for the work pool

Not required, but if you want to differentiate visually:
- Change page title and favicon in `index.html`
- Strip the "$50 buy-in" copy and the Paid toggle in Admin → Players
- Restyle header color

## Key constraint: nothing else changes

User has explicitly confirmed: the app code, behavior, and SQL schema are a **verbatim copy** of the original money pool. The ONLY meaningful changes are:

| What | Original (money pool) | This fork (work pool) |
|---|---|---|
| Join password | `POOL_JOIN_PASSWORD = 'fifafifa26'` | `POOL_JOIN_PASSWORD = 'rain26'` |
| Admin email | `seanigan44@gmail.com` | `valeriaandseanharrigan@gmail.com` |

Plus the `SUPABASE_URL` and `SUPABASE_KEY` strings, which point to a different Supabase project but don't change app behavior — they're just routing.

No cosmetic differentiation, no schema variants, no UI tweaks. Identical app, different backend, different password, different admin Google account.

## Schema source-of-truth

`schema.sql` in this folder is **verified against the live FIFA WC Pool Supabase project** (queried via `information_schema.columns` on 2026-06-05). The column names, types, nullability, and defaults match the live database exactly. You can trust it — no reconstruction guesswork remaining.

(Footnote: foreign-key constraints, unique indexes beyond primary keys, and similar metadata were not part of that query. The app works without them — they're nice-to-have for performance and integrity but not required for correctness. If you want to grab them, run the `pg_indexes` and `pg_constraint` queries against the live DB later.)

## Open questions to decide before you start

1. **Repo strategy** — GitHub fork (easier for pulling future bug fixes) or fully independent fresh repo?
2. **Auth method (must decide before Phase 3)** — Three options:
   - **Keep Google sign-in** (matches money pool, recommended): one-click sign-in for coworkers, auto-fills avatar + real name, needs ~5 min of Google Cloud Console redirect-URI setup
   - **Magic-link email instead**: no Google Cloud setup at all; users type email, get a sign-in link in inbox, click it. Loses avatar auto-fetch — users fill in profile manually. Less convenient per sign-in but zero auth setup work for you
   - User leans: still undecided as of this writing. Re-discuss before starting Phase 3.
3. **OAuth client (only matters if "Google sign-in" wins)** — reuse the existing client (recommended) or create a new one?

## Common gotchas to watch for

- **Realtime not enabled** on `matches` + `messages` → chat works but doesn't update live; leaderboard doesn't auto-refresh when admin logs a match. Fix in Database → Replication.
- **Google OAuth redirect URI missing** → sign-in fails after the Google consent screen. Fix by adding the new project's `/auth/v1/callback` URL to Google Cloud Console's OAuth client.
- **Authentication → URL Configuration not set** → sign-in works but bounces back to localhost or wrong page. Set Site URL + Redirect URLs to the deployed Pages URL.
- **`app_settings` `main` row missing** → app hard-fails. Schema seeds it; sanity-check with `SELECT * FROM app_settings`.
- **Admin nav doesn't appear** → JS check is hardcoded. Even with admin email seeded in DB, you must update `isProtectedAdminEmail` in `js/features.js`.
- **Free-tier limits** → 500 MB DB, 1 GB egress/month (way more than needed); 2 paused projects max on Free; projects auto-pause after 1 week of zero traffic (won't bite an active pool).
