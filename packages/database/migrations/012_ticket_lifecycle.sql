BEGIN;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_staff_response_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;

CREATE TABLE IF NOT EXISTS ticket_events (
  ticket_event_id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  actor_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_time ON ticket_events(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_transcripts (
  transcript_id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id text,
  message_count integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_guild_ticket ON ticket_transcripts(guild_id, ticket_id, created_at DESC);

COMMIT;
