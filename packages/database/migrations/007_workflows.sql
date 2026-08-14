BEGIN;

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('DRAFT','REVIEW','SCHEDULED','PUBLISHED','CANCELLED','ARCHIVED')),
  title text NOT NULL,
  body text NOT NULL,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  published_at timestamptz,
  published_message_id text,
  created_by text NOT NULL,
  approved_by text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_guild_state ON announcements(guild_id,status,scheduled_at,created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_events (
  workflow_event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  workflow_type text NOT NULL,
  workflow_id uuid NOT NULL,
  actor_id text,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workflow_events_lookup ON workflow_events(guild_id,workflow_type,workflow_id,created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
  announcement_id uuid NOT NULL REFERENCES announcements(announcement_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  message_id text,
  state text NOT NULL CHECK (state IN ('PENDING','PUBLISHED','FAILED','CANCELLED')),
  error_code text,
  delivered_at timestamptz,
  PRIMARY KEY (announcement_id,channel_id)
);

COMMIT;
