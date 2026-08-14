BEGIN;
ALTER TABLE plugin_installations ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'IN_PROCESS';
ALTER TABLE plugin_installations ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'BUILTIN';
ALTER TABLE plugin_installations ADD COLUMN IF NOT EXISTS entrypoint_path text;
ALTER TABLE plugin_installations ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE plugin_installations ADD CONSTRAINT plugin_installations_execution_mode_check CHECK (execution_mode IN ('IN_PROCESS','EXTERNAL_PROCESS'));
ALTER TABLE plugin_installations ADD CONSTRAINT plugin_installations_trust_level_check CHECK (trust_level IN ('BUILTIN','TRUSTED_EXTERNAL','THIRD_PARTY'));

CREATE TABLE IF NOT EXISTS plugin_execution_runs (
  run_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  plugin_key text NOT NULL,
  action text NOT NULL,
  request_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','TIMED_OUT','REJECTED')),
  duration_ms integer,
  error_code text,
  error_message text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (guild_id, plugin_key, request_id),
  FOREIGN KEY (guild_id, plugin_key) REFERENCES plugin_installations(guild_id, plugin_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plugin_execution_runs_guild_created ON plugin_execution_runs(guild_id, created_at DESC);
COMMIT;
