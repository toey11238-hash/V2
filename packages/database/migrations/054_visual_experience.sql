BEGIN;

CREATE TABLE IF NOT EXISTS panel_live_states (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  panel_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('IDLE','ACTIVE','READY','LIVE','SUCCESS','WATCH','DEGRADED','INCIDENT','MAINTENANCE','SYNCING','RECOVERY')),
  state_hash text NOT NULL CHECK (char_length(state_hash)=64),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 240),
  last_event_id text,
  last_event_type text,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  changed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_rendered_at timestamptz,
  min_update_after timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (guild_id,panel_id)
);

CREATE INDEX IF NOT EXISTS panel_live_states_expiry_idx
  ON panel_live_states(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS panel_live_states_guild_changed_idx
  ON panel_live_states(guild_id,changed_at DESC);

CREATE TABLE IF NOT EXISTS panel_live_state_events (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  panel_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  target_state text NOT NULL CHECK (target_state IN ('IDLE','ACTIVE','READY','LIVE','SUCCESS','WATCH','DEGRADED','INCIDENT','MAINTENANCE','SYNCING','RECOVERY')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 240),
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,panel_id,event_id)
);

CREATE INDEX IF NOT EXISTS panel_live_state_events_guild_created_idx
  ON panel_live_state_events(guild_id,created_at DESC);

ALTER TABLE panel_live_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_live_state_events ENABLE ROW LEVEL SECURITY;

COMMIT;
