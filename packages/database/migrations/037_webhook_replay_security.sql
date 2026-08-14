BEGIN;

ALTER TABLE webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_integration_key_external_delivery_id_key;

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS body_hash text,
  ADD COLUMN IF NOT EXISTS signature_hash text,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS event_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_deliveries_guild_external_uq
  ON webhook_deliveries(guild_id,integration_key,external_delivery_id)
  WHERE guild_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_deliveries_guild_time_idx
  ON webhook_deliveries(guild_id,received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_deliveries_expiry_idx
  ON webhook_deliveries(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE integration_events DROP CONSTRAINT IF EXISTS integration_events_action_check;
ALTER TABLE integration_events ADD CONSTRAINT integration_events_action_check
  CHECK (action IN ('ENABLE','DISABLE','HEALTH_CHECK','WEBHOOK_CONFIG','WEBHOOK_ACCEPTED','WEBHOOK_REJECTED'));

COMMIT;
