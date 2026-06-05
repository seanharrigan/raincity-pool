-- Rain City Pool — Supabase schema
--
-- Paste this entire file into the SQL Editor of the new Supabase project
-- and run it. Idempotent (uses IF NOT EXISTS / ON CONFLICT) so re-runs are safe.
--
-- ✅ Schema verified against the live FIFA WC Pool Supabase project
-- via an information_schema query on 2026-06-05. Column types, nullability,
-- and defaults match the source of truth.
--
-- NOTE: Foreign keys, unique constraints, and indexes were NOT captured by
-- the column-level query. After running this, optionally also run the
-- "pg_indexes" query against the live DB and add any missing constraints.
-- For a small pool this is not critical — the app works without them, just
-- slightly slower.

-- =====================================================================
-- ADMINS
-- =====================================================================
CREATE TABLE IF NOT EXISTS admins (
    email TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO admins (email) VALUES ('valeriaandseanharrigan@gmail.com') ON CONFLICT DO NOTHING;

-- =====================================================================
-- APP SETTINGS — single row keyed by 'main'
-- =====================================================================
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    picks_locked BOOLEAN NOT NULL DEFAULT FALSE,
    auto_lock_at_kickoff BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hide_team_selection BOOLEAN NOT NULL DEFAULT FALSE,
    hide_player_chips BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO app_settings (key) VALUES ('main') ON CONFLICT DO NOTHING;

-- =====================================================================
-- MATCHES — admin-entered results
-- =====================================================================
CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    match_date TIMESTAMPTZ,
    team_home TEXT,
    team_away TEXT,
    score_home INTEGER DEFAULT 0,
    score_away INTEGER DEFAULT 0,
    is_finished BOOLEAN DEFAULT FALSE,
    stage TEXT,
    match_date_manual DATE,
    was_extra_time BOOLEAN DEFAULT FALSE,
    manual_override BOOLEAN DEFAULT FALSE,
    auto_synced_at TIMESTAMPTZ
);

-- =====================================================================
-- MESSAGES — chat
-- =====================================================================
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    user_email TEXT,
    nickname TEXT,
    realname TEXT,
    content TEXT,
    type TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS message_reactions (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_email, emoji)
);

-- =====================================================================
-- NOTIFICATIONS — admin broadcast
-- =====================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- PICKS — 8 rows per user (one per picked team)
-- =====================================================================
CREATE TABLE IF NOT EXISTS picks (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_email TEXT,
    team_name TEXT,
    tier BIGINT,
    cost BIGINT,
    team_nickname TEXT,
    team_realname TEXT,
    points_earned INTEGER DEFAULT 0,
    has_paid BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- PROFILES — one row per signed-in user
-- =====================================================================
CREATE TABLE IF NOT EXISTS profiles (
    email TEXT PRIMARY KEY,
    nickname TEXT NOT NULL DEFAULT ''::text,
    realname TEXT NOT NULL DEFAULT ''::text,
    has_paid BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    favorite_team TEXT,
    home_country TEXT,
    picks_save_count INTEGER NOT NULL DEFAULT 0,
    blocked BOOLEAN NOT NULL DEFAULT FALSE
);

-- =====================================================================
-- TEAM ADVANCEMENT — derived knockout status
-- =====================================================================
CREATE TABLE IF NOT EXISTS team_advancement (
    team_name TEXT PRIMARY KEY,
    advanced_to_knockouts BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    eliminated BOOLEAN NOT NULL DEFAULT FALSE
);

-- =====================================================================
-- RLS — match existing app's trust model (open to authenticated users)
-- =====================================================================
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_advancement  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins            ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_all          ON profiles          FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY picks_all             ON picks             FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_settings_read     ON app_settings      FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_write    ON app_settings      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY matches_all           ON matches           FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY team_advancement_all  ON team_advancement  FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY messages_all          ON messages          FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY reactions_all         ON message_reactions FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY notifications_read    ON notifications     FOR SELECT TO authenticated USING (true);
CREATE POLICY admins_read           ON admins            FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- AFTER RUNNING THIS SQL, ALSO DO IN THE SUPABASE DASHBOARD:
--   1. Storage → create public bucket named "avatars"
--   2. Database → Replication → enable for:
--        messages, matches  (the live money pool currently replicates
--        only these two per its Table Editor; mirror that choice)
--   3. Authentication → Providers → Google → enable
--      (reuse the existing Google OAuth client; add this project's
--       /auth/v1/callback URL to Google Cloud Console's authorized
--       redirect URIs)
-- =====================================================================
