# Kickoff Prompt for the New VS Code Window

When you open `/Users/seanharrigan/Documents/ai-projects/raincity-pool/` in a new VS Code window and start a fresh Claude Code conversation, paste the prompt below as your first message. It gives Claude everything it needs to take you from empty folder to a deployed work pool.

---

## Copy-paste this as your first prompt

```
We're standing up a SECOND World Cup pool — a free-to-play work pool called "Rain City Analytics". It is a verbatim copy of an existing app, pointed at a separate Supabase project, with a different password and a different admin email. NOTHING ELSE CHANGES.

Before doing anything else, read these four files in this folder:
1. CLAUDE.md — the project instructions (what you must / must not do)
2. README.md — the high-level workflow and step list
3. PLAN.md — full background, design rationale, risks, verification
4. schema.sql — the SQL to apply to the new Supabase project

The original (money) pool app source lives at /Users/seanharrigan/Documents/world-cup-pool/. DO NOT EDIT ANYTHING THERE. You can read it freely for reference, but every edit happens in this folder or in the new GitHub repo we'll create.

After reading those four files, give me a numbered checklist of the steps you'll walk me through, in order. Then ask me which step we should start with. Do not jump ahead and start coding yet — I want to confirm scope before any work begins.

Some context you should know upfront:
- I'm on Pacific time, the tournament kicks off 2026-06-11 at 11:00 AM Pacific (= 18:00 UTC, = noon Mexico City).
- I have a Supabase org called "FIFA World Cup Pool" with one existing project (the money pool). I'll create a second project there for the work pool.
- Pool password for the work pool: rain26
- Admin email for the work pool: valeriaandseanharrigan@gmail.com (NOT seanigan44, which is the money pool admin)
- I want to use a GitHub fork of seanharrigan/world-cup-pool so I can pull future bug fixes from the original.
- This work pool has $0 buy-in and is for coworkers. Nobody from the money pool should be able to see anything in this pool and vice versa, but since they're physically separate databases this is automatic — no client-side filtering needed.
- schema.sql in this folder was VERIFIED against the live FIFA WC Pool Supabase project via an information_schema.columns query on 2026-06-05. The columns, types, nullability, and defaults match the live source-of-truth. Trust it.
- The README is structured as four phases. Walk me through them in order: (1) GitHub fork + Pages deploy, (2) Supabase project + schema + storage + replication, (3) auth wiring, (4) connect code + sanity test. Don't skip ahead.
- OPEN DECISION before Phase 3: I haven't decided whether to use Google OAuth (matches money pool, needs redirect-URI setup) or magic-link email (no Google Cloud Console work, but loses avatar auto-fetch). Don't assume Google — ask me before starting Phase 3.

Goal of the first session: get through Phases 1 and 2 — public URL live with the skeleton app loading, new Supabase project created with all tables/storage/replication in place. We'll save Phases 3 and 4 for a separate session once I've decided on auth.
```

---

## Why this prompt works

It tells Claude:
- **What the project is** in one sentence (verbatim fork of an existing app)
- **What to read first** (the four docs in this folder)
- **What NOT to touch** (the original repo)
- **All the parameters already decided** (password, admin email, OAuth strategy, repo strategy)
- **What "done" looks like** for the first session

This avoids a long back-and-forth where Claude asks clarifying questions you've already answered.

## Recommended follow-up prompts during the session

Once Claude gives you the checklist and you confirm the first step, here are good prompts to use at each phase:

### After fork is done
> "The fork is live at github.com/seanharrigan/raincity-pool and cloned into this folder. Confirm the file structure looks right and tell me what's next."

### After the new Supabase project is created
> "The new Supabase project is created (paste the project ref). Walk me through applying schema.sql, then enabling storage + replication, exactly as README.md describes."

### After the schema is applied
> "Schema is applied. Help me edit the three constants in js/data.js and js/app.js — paste the new SUPABASE_URL and SUPABASE_KEY from the Supabase Settings → API page (I'll give them to you). Also update isProtectedAdminEmail in js/features.js per CLAUDE.md."

### After OAuth setup
> "I've added the new Supabase redirect URI to the Google OAuth client in Google Cloud Console. Help me verify Google sign-in works on the deployed site."

### After GitHub Pages deploys
> "The site is live at https://seanharrigan.github.io/raincity-pool/. Walk me through the first-run sanity check: sign in with valeriaandseanharrigan@gmail.com, enter rain26, save a test 8-team squad, and confirm the rows show up in the new Supabase."

### If something breaks
> "Sign-in failed / picks didn't save / the admin tab isn't showing / [paste error]. Diagnose and fix."

---

## Files you'll be looking at most

| File | When you need it |
|---|---|
| `js/data.js` | Swap SUPABASE_URL and SUPABASE_KEY |
| `js/app.js` line 8 | Swap POOL_JOIN_PASSWORD to 'rain26' |
| `js/features.js` line ~7347 | Update isProtectedAdminEmail |
| `schema.sql` (this folder) | Paste into Supabase SQL Editor |
| `index.html` | Only if you want cosmetic tweaks later (NOT needed for first deploy) |

## What success looks like at end of session 1

- New GitHub repo (`seanharrigan/raincity-pool`) is live and deploys via Pages.
- New Supabase project is created with all tables, policies, storage, and replication configured.
- The deployed URL loads, you sign in with `valeriaandseanharrigan@gmail.com`, enter password `rain26`, profile setup completes.
- You save a test squad, confirm picks rows appear in the new Supabase.
- The original money pool at the existing URL is **completely unchanged** and still works.
