BEGIN;

CREATE TABLE IF NOT EXISTS security_observations (
  observation_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource_id text,
  resource_name text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_observations_window ON security_observations(guild_id, event_type, occurred_at DESC);

COMMIT;
