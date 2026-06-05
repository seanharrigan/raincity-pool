# CLAUDE.md

Instructions for Claude Code when working in this folder.

## What this project is

A **fork** of the original World Cup Pool app, intended to run a second, free-to-play work pool ("Rain City Analytics"). The original (money) pool lives at `~/Documents/world-cup-pool/` and is the source of truth for code and behavior — do not modify it from here.

This work pool is meant to be **functionally identical** to the original, just pointed at a **separate Supabase project** with a **different join password**.

## Current state of this folder

Right now this folder contains only setup documents:
- `README.md` — step-by-step workflow to fork the source repo, create a Supabase project, deploy
- `PLAN.md` — detailed plan (background, schema design, code changes, risks, verification)
- `schema.sql` — SQL block to apply to the new Supabase project. **Verified against the live FIFA WC Pool Supabase project via an `information_schema.columns` query on 2026-06-05.** Column names, types, nullability, and defaults match the live source-of-truth.
- `KICKOFF_PROMPT.md` — the prompt the user pastes as the first message in the new VS Code window
- `rain26.png` — a screenshot the user dropped in; can be ignored
- `CLAUDE.md` — this file

**The actual app source code is NOT here yet.** It will be added by the user via either a GitHub fork clone or a recursive copy from `~/Documents/world-cup-pool/`. See README.md step 1.

## Read this first when starting a session

1. Read `README.md` for the high-level workflow — note that it is structured as **four phases** (1: fork & deploy skeleton, 2: Supabase backend, 3: auth wiring, 4: connect code + sanity test). Do not skip ahead.
2. Read `PLAN.md` for full context (this matches what was discussed in the conversation that produced this folder)
3. Read `schema.sql` if working on Supabase setup
4. Check whether the app source has been added yet (look for `index.html` and `js/`)
5. If app source exists, also read its `CLAUDE.md` (inherited from the source repo) — it documents the app's architecture, tech stack, and rules

## Open decision the user must make before Phase 3

The user has flagged this and is still deciding: **what auth method does the work pool use?** Three options on the table:

1. Keep Google OAuth (same as money pool, recommended)
2. Switch to magic-link email (no Google Cloud Console setup needed; loses avatar auto-fetch)
3. (No third option — these are the realistic two)

If the user reaches the start of Phase 3 without having decided, ask them which path. Do not assume Google. The README describes both implications.

## Edits to make after fork — and nothing else

User has been explicit: the app, the code, the schema, the behavior — all a verbatim copy of the original money pool. The ONLY meaningful changes are the join password, the Supabase pointer, and the admin email:

| File | Line | Change |
|---|---|---|
| `js/data.js` | 1 | `SUPABASE_URL` → new project URL (routing only, no behavior change) |
| `js/data.js` | 2 | `SUPABASE_KEY` → new project anon/publishable key (routing only) |
| `js/app.js` | 8 | `POOL_JOIN_PASSWORD = 'fifafifa26'` → `POOL_JOIN_PASSWORD = 'rain26'` |
| `js/features.js` | ~7347 | Inside `isProtectedAdminEmail`, replace `'seanigan44@gmail.com'` with `'valeriaandseanharrigan@gmail.com'`. Remove the `seanigan44@gmail.com` entry entirely. The other admin email (`harrigan.j.connor@gmail.com`) stays. |

Do not edit anything else. No cosmetic differentiation, no UI tweaks, no schema variants. If the user asks for differentiation later, that's a separate conversation.

## Admin identity for the Rain City Pool

The admin for this work pool is **valeriaandseanharrigan@gmail.com**, NOT `seanigan44@gmail.com`. This affects:
- The hardcoded `isProtectedAdminEmail` check (see table above)
- The `admins` table seed row (already set correctly in `schema.sql`)

When the user signs in to the work pool for the first time, they must use the `valeriaandseanharrigan@gmail.com` Google account. Signing in with `seanigan44@gmail.com` will create a regular non-admin profile in the work pool.

## What NOT to do

- Do not edit code in `~/Documents/world-cup-pool/` from this session — that's the live money pool and must stay untouched.
- Do not attempt multi-tenancy / pool_id refactoring of the original app. That approach was explicitly rejected in favor of this fork-and-separate-DB strategy.
- Do not touch the Supabase MCP connection — it points at a different project (La Boda) and must not be used.

## Useful context about the source app

The source app (in `~/Documents/world-cup-pool/`) is:
- Vanilla HTML/CSS/JS, no build step
- Tailwind via CDN
- Supabase for auth (Google OAuth), DB, realtime
- Single-page app, all views in `index.html`
- Pool rules: 8 teams per squad, $150 budget, max 1 Tier 1, min 3 Tier 3
- Tournament kicks off 2026-06-11 18:00 UTC (the `LOCK_DATE` constant in `js/data.js`)
- Admin gate is a hardcoded email list in `js/features.js:7347` (`isProtectedAdminEmail`). In the source repo it lists `seanigan44@gmail.com` and `harrigan.j.connor@gmail.com`. For the work pool, this list must be edited (see the "Edits to make after fork" table above) — replace `seanigan44@gmail.com` with `valeriaandseanharrigan@gmail.com`.

## Verification before declaring "done"

Match the verification checklist in `PLAN.md` — primarily:
1. New Supabase tables exist and match the schema
2. `node --check js/data.js js/app.js` passes
3. `npm test` passes (23 tests, same as source)
4. Sign in to the new deployment, complete a profile, save 8 picks, verify rows appear in the new Supabase
5. Confirm the original money-pool URL is unchanged and unaffected
