BEGIN;

CREATE TABLE IF NOT EXISTS panel_registry (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  panel_id text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  content_version integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  target_channel_key text NOT NULL,
  target_channel_id text,
  message_id text,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('REGISTERED','CREATING','PUBLISHED','ACTIVE','UPDATING','STALE','MISSING','REPAIRING','FAILED','DISABLED','ARCHIVED')),
  ownership text NOT NULL DEFAULT 'SYSTEM_OWNED',
  repair_policy text NOT NULL DEFAULT 'NOTIFY',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, panel_id)
);

CREATE TABLE IF NOT EXISTS asset_registry (
  asset_id uuid PRIMARY KEY,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  asset_type text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  theme_key text,
  game_key text,
  locale text,
  format text NOT NULL,
  width integer,
  height integer,
  byte_size bigint,
  storage_provider text NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  fallback_key text,
  generator_version text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, logical_key, version)
);

COMMIT;
