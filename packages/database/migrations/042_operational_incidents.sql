BEGIN;

CREATE TABLE IF NOT EXISTS operational_incidents (
  incident_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('SECURITY','PLATFORM','DISCORD','DATABASE','INTEGRATION','CONTENT','OTHER')),
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL CHECK (status IN ('OPEN','INVESTIGATING','MITIGATING','MONITORING','RESOLVED','CLOSED')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 120),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 3000),
  commander_id text,
  opened_by text NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closed_at IS NULL OR status = 'CLOSED')
);
CREATE INDEX IF NOT EXISTS operational_incidents_queue_idx ON operational_incidents(guild_id,status,severity,started_at DESC);
CREATE INDEX IF NOT EXISTS operational_incidents_correlation_idx ON operational_incidents(guild_id,correlation_id);
ALTER TABLE operational_incidents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS operational_incident_events (
  event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES operational_incidents(incident_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','STATUS_CHANGE','NOTE','OWNER_CHANGE','SEVERITY_CHANGE')),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(before_state)='object' AND octet_length(before_state::text)<=8192),
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(after_state)='object' AND octet_length(after_state::text)<=8192),
  note text CHECK (note IS NULL OR char_length(note)<=1500),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_incident_events_timeline_idx ON operational_incident_events(guild_id,incident_id,created_at ASC);
ALTER TABLE operational_incident_events ENABLE ROW LEVEL SECURITY;

COMMIT;
