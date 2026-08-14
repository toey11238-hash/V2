BEGIN;

CREATE TABLE IF NOT EXISTS data_export_artifacts (
  artifact_id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES data_export_requests(request_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  subject_user_id text,
  payload jsonb NOT NULL,
  content_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_data_export_artifacts_expiry ON data_export_artifacts(expires_at);

CREATE INDEX IF NOT EXISTS idx_retention_runs_guild_time ON retention_runs(guild_id, created_at DESC);

COMMIT;
