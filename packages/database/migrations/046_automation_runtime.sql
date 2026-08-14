BEGIN;

ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version >= 1);
ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS action_count integer NOT NULL DEFAULT 0 CHECK (action_count BETWEEN 0 AND 100);
ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS budget_decision text CHECK (budget_decision IS NULL OR budget_decision IN ('ALLOW','OBSERVE_OVER','DEFER'));
ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS started_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS automation_execution_event_rule_unique ON automation_executions(guild_id,rule_id,source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS automation_executions_recent_idx ON automation_executions(guild_id,created_at DESC);

CREATE TABLE IF NOT EXISTS automation_event_receipts (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES event_outbox(event_id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','RUNNING','DEFERRED','RETRYING','SUCCEEDED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,event_id)
);
CREATE INDEX IF NOT EXISTS automation_event_receipts_due_idx ON automation_event_receipts(state,next_attempt_at) WHERE state IN ('PENDING','DEFERRED','RETRYING');
ALTER TABLE automation_event_receipts ENABLE ROW LEVEL SECURITY;

COMMIT;
