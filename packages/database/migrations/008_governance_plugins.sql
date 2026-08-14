BEGIN;
CREATE TABLE IF NOT EXISTS plugin_installations (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  plugin_key text NOT NULL,
  version text NOT NULL,
  state text NOT NULL,
  manifest jsonb NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  installed_by text,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,plugin_key)
);
CREATE TABLE IF NOT EXISTS retention_runs (
  retention_run_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  data_class text NOT NULL,
  cutoff_at timestamptz NOT NULL,
  status text NOT NULL,
  records_examined bigint NOT NULL DEFAULT 0,
  records_deleted bigint NOT NULL DEFAULT 0,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS data_export_requests (
  request_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  subject_user_id text,
  requested_by text NOT NULL,
  scope jsonb NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  artifact_ref text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS change_requests (
  change_request_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  action text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL,
  requested_by text NOT NULL,
  plan jsonb NOT NULL,
  approval_request_id uuid,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_requests_guild_status ON change_requests(guild_id,status,risk,created_at DESC);
COMMIT;
