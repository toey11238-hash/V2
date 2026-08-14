BEGIN;

CREATE TABLE IF NOT EXISTS recruitment_posts (
  recruitment_post_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  post_type text NOT NULL CHECK (post_type IN ('TEAM_RECRUITING','CLAN_RECRUITING','PLAYER_LFT','COACH_AVAILABLE')),
  owner_user_id text NOT NULL,
  target_id uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  region text,
  platform text,
  preferred_roles text[] NOT NULL DEFAULT '{}',
  rank_label text,
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recruitment_posts_open_idx ON recruitment_posts(guild_id,game_key,status,expires_at DESC);
CREATE INDEX IF NOT EXISTS recruitment_posts_type_idx ON recruitment_posts(guild_id,post_type,status,created_at DESC);

CREATE TABLE IF NOT EXISTS recruitment_applications (
  recruitment_application_id uuid PRIMARY KEY,
  recruitment_post_id uuid NOT NULL REFERENCES recruitment_posts(recruitment_post_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  applicant_user_id text NOT NULL,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruitment_post_id, applicant_user_id)
);
CREATE INDEX IF NOT EXISTS recruitment_applications_queue_idx ON recruitment_applications(guild_id,status,created_at DESC);

COMMIT;
