BEGIN;
CREATE TABLE IF NOT EXISTS capacity_assessments (
  assessment_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  pressure text NOT NULL CHECK (pressure IN ('NORMAL','WATCH','THROTTLE','EMERGENCY')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  signals jsonb NOT NULL CHECK (jsonb_typeof(signals)='object' AND octet_length(signals::text)<=8192),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy)='object' AND octet_length(policy::text)<=8192),
  reasons jsonb NOT NULL CHECK (jsonb_typeof(reasons)='array' AND octet_length(reasons::text)<=8192),
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions)='array' AND octet_length(actions::text)<=8192),
  actor_id text NOT NULL,
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capacity_assessments_guild_idx ON capacity_assessments(guild_id,created_at DESC);
ALTER TABLE capacity_assessments ENABLE ROW LEVEL SECURITY;
COMMIT;
