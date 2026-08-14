BEGIN;

CREATE TABLE IF NOT EXISTS managed_forum_threads (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  forum_channel_id text NOT NULL,
  forum_logical_key text,
  owner_user_id text,
  title_snapshot text NOT NULL,
  applied_tag_ids text[] NOT NULL DEFAULT '{}',
  state text NOT NULL CHECK (state IN ('OPEN','ARCHIVED','LOCKED','DELETED')),
  auto_archive_minutes integer,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,thread_id)
);
CREATE INDEX IF NOT EXISTS idx_managed_forum_threads_parent ON managed_forum_threads(guild_id,forum_channel_id,state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_managed_forum_threads_owner ON managed_forum_threads(guild_id,owner_user_id,updated_at DESC);
ALTER TABLE managed_forum_threads ENABLE ROW LEVEL SECURITY;

COMMIT;
