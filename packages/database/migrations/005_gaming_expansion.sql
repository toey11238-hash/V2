BEGIN;

CREATE TABLE IF NOT EXISTS parties (
  party_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  owner_user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('FORMING','READY','PLAYING','FINISHED','DISBANDED')),
  max_members integer NOT NULL CHECK (max_members BETWEEN 2 AND 100),
  voice_channel_id text,
  source_lfg_id uuid REFERENCES lfg_posts(lfg_id) ON DELETE SET NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id uuid NOT NULL REFERENCES parties(party_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, user_id)
);

CREATE TABLE IF NOT EXISTS scrims (
  scrim_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  team_a_id uuid REFERENCES teams(team_id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES teams(team_id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('OPEN','MATCHED','CONFIRMED','ACTIVE','RESULT_SUBMITTED','COMPLETED','CANCELLED','DISPUTED')),
  best_of integer NOT NULL CHECK (best_of > 0 AND best_of % 2 = 1),
  region text,
  starts_at timestamptz NOT NULL,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id),
  CHECK (COALESCE((rules->>'wageringEnabled')::boolean, false) = false),
  CHECK (COALESCE((rules->>'entryStakeRequired')::boolean, false) = false),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scrims_guild_game_status ON scrims(guild_id, game_key, status, starts_at);

CREATE TABLE IF NOT EXISTS xp_balances (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  game_key text NOT NULL DEFAULT '__global__',
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  hourly_window_started_at timestamptz,
  hourly_awarded integer NOT NULL DEFAULT 0 CHECK (hourly_awarded >= 0),
  last_award_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id, game_key)
);

CREATE TABLE IF NOT EXISTS xp_events (
  xp_event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  game_key text,
  source_type text NOT NULL,
  source_id text,
  amount integer NOT NULL,
  dedup_key text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, user_id, dedup_key)
);

CREATE TABLE IF NOT EXISTS seasons (
  season_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text,
  season_key text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  max_level integer NOT NULL CHECK (max_level > 0),
  xp_per_level integer NOT NULL CHECK (xp_per_level > 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (guild_id, season_key)
);

CREATE TABLE IF NOT EXISTS season_progress (
  season_id uuid NOT NULL REFERENCES seasons(season_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  claimed_rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_integrations (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  adapter_key text NOT NULL,
  status text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  last_sync_at timestamptz,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, game_key, adapter_key),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gaming_guides (
  guide_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  author_user_id text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT',
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gaming_media (
  media_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  submitter_user_id text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('CLIP','SCREENSHOT','HIGHLIGHT','VIDEO')),
  source_url text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_REVIEW',
  featured boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  session_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  coach_user_id text NOT NULL,
  learner_user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('REQUESTED','ACCEPTED','SCHEDULED','COMPLETED','CANCELLED')),
  scheduled_at timestamptz,
  feedback jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coach_user_id <> learner_user_id),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);

COMMIT;
