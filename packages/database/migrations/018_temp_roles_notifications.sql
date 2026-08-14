BEGIN;

ALTER TABLE temporary_roles ADD COLUMN IF NOT EXISTS granted_by text;
ALTER TABLE temporary_roles ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE temporary_roles ADD COLUMN IF NOT EXISTS warning_sent_at timestamptz;
ALTER TABLE temporary_roles ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE temporary_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS temporary_role_events (
  event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role_id text NOT NULL,
  expires_at timestamptz,
  event_type text NOT NULL CHECK (event_type IN ('GRANTED','EXTENDED','WARNING_SENT','WARNING_FAILED','EXPIRED','REVOKED','ROLLBACK')),
  actor_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_temporary_role_events_identity ON temporary_role_events(guild_id,user_id,role_id,created_at DESC);
ALTER TABLE temporary_role_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  delivery_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  topic text NOT NULL,
  dedup_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('QUEUED','DEFERRED','DELIVERED','SKIPPED','FAILED')),
  channel text NOT NULL CHECK (channel IN ('DM')),
  payload_hash text NOT NULL,
  message_id text,
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (guild_id,dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user ON notification_deliveries(guild_id,user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_state ON notification_deliveries(state,updated_at);
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

COMMIT;
