BEGIN;
CREATE TABLE IF NOT EXISTS recovery_drill_runs (
  drill_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  drill_type text NOT NULL CHECK (drill_type IN ('RESTORE','PANEL_REPAIR','PERMISSION_REPAIR','STARTUP_RECOVERY','OUTBOX_RECOVERY')),
  status text NOT NULL CHECK (status IN ('PLANNED','RUNNING','BLOCKED','PASSED','FAILED','CANCELLED')),
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 8 AND 500),
  expected_checks jsonb NOT NULL CHECK (jsonb_typeof(expected_checks)='array' AND jsonb_array_length(expected_checks) BETWEEN 2 AND 30 AND octet_length(expected_checks::text)<=8192),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=16384),
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers)='array' AND octet_length(blockers::text)<=8192),
  created_by text NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_drill_runs_guild_idx ON recovery_drill_runs(guild_id,status,created_at DESC);
ALTER TABLE recovery_drill_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS recovery_drill_events (
  event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  drill_id uuid NOT NULL REFERENCES recovery_drill_runs(drill_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','STATUS_CHANGE','EVIDENCE','NOTE')),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(before_state)='object' AND octet_length(before_state::text)<=16384),
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(after_state)='object' AND octet_length(after_state::text)<=16384),
  note text CHECK (note IS NULL OR char_length(note)<=1000),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_drill_events_timeline_idx ON recovery_drill_events(guild_id,drill_id,created_at ASC);
ALTER TABLE recovery_drill_events ENABLE ROW LEVEL SECURITY;
COMMIT;
