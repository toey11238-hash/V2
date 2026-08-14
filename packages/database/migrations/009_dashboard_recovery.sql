BEGIN;

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  session_id uuid PRIMARY KEY,
  user_id text NOT NULL,
  user_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  guild_access jsonb NOT NULL DEFAULT '[]'::jsonb,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expiry ON dashboard_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_user ON dashboard_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS mutation_journal (
  mutation_id uuid PRIMARY KEY,
  job_id uuid REFERENCES jobs(job_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  sequence_no integer NOT NULL CHECK (sequence_no >= 0),
  action text NOT NULL,
  resource_kind text NOT NULL,
  logical_key text NOT NULL,
  discord_id text,
  before_state jsonb,
  after_state jsonb,
  compensator jsonb,
  state text NOT NULL CHECK (state IN ('PREPARED','APPLIED','COMPENSATING','COMPENSATED','SKIPPED','FAILED')),
  error_code text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  compensated_at timestamptz,
  UNIQUE (job_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_mutation_journal_job ON mutation_journal(job_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_mutation_journal_recovery ON mutation_journal(guild_id, state, created_at DESC);

ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS last_error_code text;
CREATE INDEX IF NOT EXISTS idx_event_inbox_claim ON event_inbox(state, available_at, received_at) WHERE processed_at IS NULL;

ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS last_error_code text;
CREATE INDEX IF NOT EXISTS idx_event_outbox_claim ON event_outbox(available_at, created_at) WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS backup_payloads (
  backup_id uuid PRIMARY KEY REFERENCES backup_snapshots(backup_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  encrypted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restore_runs (
  restore_run_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  backup_id uuid NOT NULL REFERENCES backup_snapshots(backup_id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('PLANNED','WAITING_APPROVAL','RUNNING','VERIFYING','SUCCEEDED','FAILED','CANCELLED','ROLLED_BACK')),
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  requested_by text NOT NULL,
  approval_request_id uuid,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restore_runs_guild ON restore_runs(guild_id, created_at DESC);

COMMIT;
