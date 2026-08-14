BEGIN;

CREATE TABLE IF NOT EXISTS portable_config_import_previews (
  import_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  source_guild_id text NOT NULL,
  source_schema_version integer NOT NULL,
  target_schema_version integer NOT NULL,
  source_checksum text NOT NULL,
  migrated_checksum text NOT NULL,
  applied_migrations text[] NOT NULL DEFAULT '{}',
  plan_hash text NOT NULL,
  actionable_count integer NOT NULL DEFAULT 0,
  conflicts integer NOT NULL DEFAULT 0,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portable_config_import_previews_guild_idx
  ON portable_config_import_previews(guild_id, created_at DESC);
ALTER TABLE portable_config_import_previews ENABLE ROW LEVEL SECURITY;

COMMIT;
