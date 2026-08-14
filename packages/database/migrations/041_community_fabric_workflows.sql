BEGIN;

CREATE TABLE IF NOT EXISTS community_fabric_work_items (
  work_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('PROJECT','MEMBER_CARE','CONTENT','EVENT')),
  status text NOT NULL CHECK (status IN ('OPEN','IN_REVIEW','APPROVED','ACTIVE','BLOCKED','COMPLETED','RESOLVED','REJECTED','CANCELLED')),
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE','GUILD','STAFF')),
  created_by text NOT NULL,
  assigned_to text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 1500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS community_fabric_work_items_queue_idx
  ON community_fabric_work_items(guild_id, domain, status, created_at ASC);
CREATE INDEX IF NOT EXISTS community_fabric_work_items_creator_idx
  ON community_fabric_work_items(guild_id, created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS community_fabric_work_items_public_idx
  ON community_fabric_work_items(guild_id, domain, visibility, status, updated_at DESC);
ALTER TABLE community_fabric_work_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS community_fabric_work_events (
  event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES community_fabric_work_items(work_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  action text NOT NULL,
  before_status text,
  after_status text,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  correlation_id text NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_fabric_work_events_work_idx
  ON community_fabric_work_events(guild_id, work_id, created_at DESC);
ALTER TABLE community_fabric_work_events ENABLE ROW LEVEL SECURITY;

COMMIT;
