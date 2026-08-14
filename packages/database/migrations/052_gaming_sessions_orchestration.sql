BEGIN;

CREATE TABLE IF NOT EXISTS gaming_availability_windows (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  game_key text NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id, game_key, weekday, start_minute, end_minute),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gaming_availability_game_idx ON gaming_availability_windows(guild_id, game_key, weekday, start_minute);
CREATE INDEX IF NOT EXISTS gaming_availability_user_idx ON gaming_availability_windows(guild_id, user_id, game_key);
ALTER TABLE gaming_availability_windows ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gaming_sessions (
  session_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  host_user_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  status text NOT NULL CHECK (status IN ('OPEN','READY','ACTIVE','COMPLETED','CANCELLED')),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 720),
  capacity integer NOT NULL CHECK (capacity BETWEEN 2 AND 100),
  region text CHECK (region IS NULL OR char_length(region) <= 80),
  platform text CHECK (platform IS NULL OR char_length(platform) <= 80),
  mode text CHECK (mode IS NULL OR char_length(mode) <= 80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gaming_sessions_upcoming_idx ON gaming_sessions(guild_id, game_key, status, starts_at) WHERE status IN ('OPEN','READY');
CREATE INDEX IF NOT EXISTS gaming_sessions_host_idx ON gaming_sessions(guild_id, host_user_id, starts_at DESC);
ALTER TABLE gaming_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gaming_session_participants (
  session_id uuid NOT NULL REFERENCES gaming_sessions(session_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  participant_role text NOT NULL CHECK (participant_role IN ('HOST','PLAYER')),
  status text NOT NULL CHECK (status IN ('JOINED','LEFT','REMOVED')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS gaming_session_participants_user_idx ON gaming_session_participants(guild_id, user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS gaming_session_participants_active_idx ON gaming_session_participants(guild_id, session_id, status) WHERE status='JOINED';
ALTER TABLE gaming_session_participants ENABLE ROW LEVEL SECURITY;

COMMIT;
