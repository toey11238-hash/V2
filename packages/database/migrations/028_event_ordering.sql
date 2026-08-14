BEGIN;
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS aggregate_key text;
ALTER TABLE event_inbox ADD COLUMN IF NOT EXISTS sequence_no bigint;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS aggregate_key text;
ALTER TABLE event_outbox ADD COLUMN IF NOT EXISTS sequence_no bigint;
CREATE TABLE IF NOT EXISTS event_stream_heads (
  guild_id text NOT NULL DEFAULT '',
  source text NOT NULL,
  aggregate_key text NOT NULL,
  last_sequence bigint NOT NULL,
  last_event_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, source, aggregate_key)
);
CREATE INDEX IF NOT EXISTS idx_event_inbox_order ON event_inbox(guild_id,source,aggregate_key,sequence_no) WHERE sequence_no IS NOT NULL;
COMMIT;
