BEGIN;

CREATE TABLE IF NOT EXISTS guild_games (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  display_name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  adapter_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, game_key)
);

CREATE TABLE IF NOT EXISTS player_game_profiles (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  game_key text NOT NULL,
  platform text,
  region text,
  preferred_roles text[] NOT NULL DEFAULT '{}',
  rank_label text,
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id, game_key),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lfg_posts (
  lfg_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  owner_user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','FILLING','FULL','PLAYING','FINISHED','CANCELLED','EXPIRED')),
  region text,
  platform text,
  mode text,
  rank_label text,
  party_size integer NOT NULL CHECK (party_size BETWEEN 2 AND 100),
  member_ids text[] NOT NULL DEFAULT '{}',
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (guild_id, game_key) REFERENCES guild_games(guild_id, game_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lfg_open ON lfg_posts(guild_id, game_key, status, expires_at);

CREATE TABLE IF NOT EXISTS teams (
  team_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  name text NOT NULL,
  captain_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, game_key, name)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id uuid NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  member_role text NOT NULL CHECK (member_role IN ('CAPTAIN','CO_CAPTAIN','MEMBER','SUBSTITUTE','COACH')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_guild_user ON team_members(guild_id, user_id);

CREATE TABLE IF NOT EXISTS clans (
  clan_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  name text NOT NULL,
  leader_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, game_key, name)
);

CREATE TABLE IF NOT EXISTS clan_members (
  clan_id uuid NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  member_role text NOT NULL CHECK (member_role IN ('LEADER','OFFICER','MEMBER','RECRUIT')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_clan_members_guild_user ON clan_members(guild_id, user_id);

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text NOT NULL,
  name text NOT NULL,
  format text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','REGISTRATION','CHECK_IN','ACTIVE','COMPLETED','CANCELLED','ARCHIVED')),
  team_size integer NOT NULL DEFAULT 1 CHECK (team_size > 0),
  max_entries integer,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (COALESCE((rules->>'wageringEnabled')::boolean, false) = false),
  CHECK (COALESCE((rules->>'entryStakeRequired')::boolean, false) = false)
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id uuid NOT NULL REFERENCES tournaments(tournament_id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  guild_id text NOT NULL,
  display_name text NOT NULL,
  roster_user_ids text[] NOT NULL,
  status text NOT NULL DEFAULT 'REGISTERED',
  seed integer,
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, entry_id)
);

CREATE TABLE IF NOT EXISTS matches (
  match_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  tournament_id uuid REFERENCES tournaments(tournament_id) ON DELETE SET NULL,
  game_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('SCHEDULED','READY','ACTIVE','RESULT_SUBMITTED','UNDER_REVIEW','COMPLETED','CANCELLED')),
  participant_a jsonb NOT NULL,
  participant_b jsonb NOT NULL,
  result jsonb,
  dispute jsonb,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quests (
  quest_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text,
  quest_key text NOT NULL,
  title text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('ONCE','DAILY','WEEKLY','EVENT','SEASONAL')),
  target integer NOT NULL CHECK (target > 0),
  event_type text NOT NULL,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_from timestamptz,
  active_until timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (guild_id, quest_key)
);

CREATE TABLE IF NOT EXISTS quest_progress (
  quest_id uuid NOT NULL REFERENCES quests(quest_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quest_id, user_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  achievement_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  game_key text,
  achievement_key text NOT NULL,
  title text NOT NULL,
  condition jsonb NOT NULL,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (guild_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS player_achievements (
  achievement_id uuid NOT NULL REFERENCES achievements(achievement_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (achievement_id, user_id)
);

COMMIT;
