BEGIN;

CREATE TABLE IF NOT EXISTS resource_budget_policies (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  budget_key text NOT NULL CHECK (budget_key IN ('provider.sync','background.analytics','background.backup','notification.fanout','bulk.automation')),
  enabled boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'ENFORCE' CHECK (mode IN ('OBSERVE','ENFORCE')),
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 60 AND 86400),
  max_units integer NOT NULL CHECK (max_units BETWEEN 1 AND 1000000),
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,budget_key)
);
CREATE INDEX IF NOT EXISTS resource_budget_policies_updated_idx ON resource_budget_policies(guild_id,updated_at DESC);
ALTER TABLE resource_budget_policies ENABLE ROW LEVEL SECURITY;

INSERT INTO resource_budget_policies(guild_id,budget_key,enabled,mode,window_seconds,max_units,updated_by)
SELECT g.guild_id,p.budget_key,true,p.mode,p.window_seconds,p.max_units,'migration-045'
FROM guilds g
CROSS JOIN (VALUES
  ('provider.sync','ENFORCE',3600,24),
  ('background.analytics','ENFORCE',3600,24),
  ('background.backup','ENFORCE',86400,8),
  ('notification.fanout','OBSERVE',600,2000),
  ('bulk.automation','ENFORCE',600,120)
) AS p(budget_key,mode,window_seconds,max_units)
ON CONFLICT(guild_id,budget_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS resource_budget_windows (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  budget_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 60 AND 86400),
  units_used integer NOT NULL DEFAULT 0 CHECK (units_used >= 0),
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,budget_key,window_started_at),
  FOREIGN KEY (guild_id,budget_key) REFERENCES resource_budget_policies(guild_id,budget_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS resource_budget_windows_recent_idx ON resource_budget_windows(guild_id,budget_key,window_started_at DESC);
ALTER TABLE resource_budget_windows ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS resource_budget_events (
  event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  budget_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ALLOW','OBSERVE_OVER','DEFER')),
  units integer NOT NULL CHECK (units BETWEEN 1 AND 1000000),
  used_before integer NOT NULL CHECK (used_before >= 0),
  used_after integer NOT NULL CHECK (used_after >= 0),
  max_units integer NOT NULL CHECK (max_units BETWEEN 1 AND 1000000),
  retry_at timestamptz,
  actor_id text,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  detail text CHECK (detail IS NULL OR char_length(detail) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resource_budget_events_recent_idx ON resource_budget_events(guild_id,budget_key,created_at DESC);
ALTER TABLE resource_budget_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_jobs_fair_running ON jobs(guild_id,status) WHERE status='RUNNING';
CREATE INDEX IF NOT EXISTS idx_jobs_fair_recent ON jobs(guild_id,started_at DESC) WHERE started_at IS NOT NULL;

COMMIT;
