BEGIN;
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_state_time ON maintenance_windows(guild_id,state,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS maintenance_events (
  maintenance_event_id uuid PRIMARY KEY,
  maintenance_id uuid NOT NULL REFERENCES maintenance_windows(maintenance_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','ACTIVATED','COMPLETED','CANCELLED','UPDATED')),
  actor_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_events_window ON maintenance_events(maintenance_id,created_at);
COMMIT;
