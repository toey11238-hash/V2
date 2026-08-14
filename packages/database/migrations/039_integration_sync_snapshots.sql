BEGIN;

CREATE TABLE IF NOT EXISTS integration_sync_snapshots (
  snapshot_id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  integration_key text NOT NULL,
  content_type text NOT NULL,
  external_version text,
  content_hash text NOT NULL,
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_sync_latest ON integration_sync_snapshots(guild_id,integration_key,content_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_sync_hash ON integration_sync_snapshots(guild_id,integration_key,content_hash);
ALTER TABLE integration_sync_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE integration_events DROP CONSTRAINT IF EXISTS integration_events_action_check;
ALTER TABLE integration_events ADD CONSTRAINT integration_events_action_check
  CHECK (action IN ('ENABLE','DISABLE','HEALTH_CHECK','WEBHOOK_CONFIG','WEBHOOK_ACCEPTED','WEBHOOK_REJECTED','CONFIG_UPDATE','SYNC'));

COMMIT;
