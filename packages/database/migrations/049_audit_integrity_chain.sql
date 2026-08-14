BEGIN;

CREATE TABLE IF NOT EXISTS audit_integrity_heads (
  scope_key text PRIMARY KEY,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  head_hash text NOT NULL CHECK (head_hash ~ '^[0-9a-f]{64}$'),
  algorithm text NOT NULL CHECK (algorithm = 'sha256-canonical-json-v1'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (guild_id IS NULL AND scope_key = 'global')
    OR
    (guild_id IS NOT NULL AND scope_key = ('guild:' || guild_id))
  )
);
ALTER TABLE audit_integrity_heads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audit_integrity_entries (
  audit_id uuid PRIMARY KEY,
  scope_key text NOT NULL,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  previous_hash text NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  algorithm text NOT NULL CHECK (algorithm = 'sha256-canonical-json-v1'),
  event_created_at timestamptz NOT NULL,
  chained_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_key, sequence),
  CHECK (
    (guild_id IS NULL AND scope_key = 'global')
    OR
    (guild_id IS NOT NULL AND scope_key = ('guild:' || guild_id))
  )
);
CREATE INDEX IF NOT EXISTS idx_audit_integrity_guild_sequence ON audit_integrity_entries(guild_id, sequence DESC) WHERE guild_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_integrity_scope_sequence ON audit_integrity_entries(scope_key, sequence DESC);
ALTER TABLE audit_integrity_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION autoserver_reject_audit_integrity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Permit FK-driven guild teardown while rejecting ordinary application UPDATE/DELETE.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AUDIT_INTEGRITY_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_integrity_entries_append_only ON audit_integrity_entries;
CREATE TRIGGER trg_audit_integrity_entries_append_only
BEFORE UPDATE OR DELETE ON audit_integrity_entries
FOR EACH ROW EXECUTE FUNCTION autoserver_reject_audit_integrity_mutation();

CREATE OR REPLACE FUNCTION autoserver_reject_audit_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_EVENT_IMMUTABLE_UPDATE';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable_update ON audit_events;
CREATE TRIGGER trg_audit_events_immutable_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION autoserver_reject_audit_event_update();

COMMIT;
