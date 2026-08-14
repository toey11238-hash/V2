BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guilds (
  guild_id text PRIMARY KEY,
  name_snapshot text,
  owner_id text,
  joined_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guild_configs (
  guild_id text PRIMARY KEY REFERENCES guilds(guild_id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  template_key text NOT NULL DEFAULT 'hybrid-standard',
  template_version integer NOT NULL DEFAULT 1,
  language text NOT NULL DEFAULT 'th',
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  theme_key text NOT NULL DEFAULT 'command-bridge',
  size_profile text NOT NULL DEFAULT 'standard',
  enabled_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  automation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  permission_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_applied_version integer,
  last_verified_version integer,
  migration_status text NOT NULL DEFAULT 'CURRENT',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_mappings (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  logical_key text NOT NULL,
  resource_kind text NOT NULL,
  discord_id text NOT NULL,
  ownership text NOT NULL CHECK (ownership IN ('SYSTEM_OWNED','TEMPLATE_OWNED','USER_OWNED','LOCKED')),
  name_snapshot text,
  config_version integer NOT NULL DEFAULT 1,
  content_hash text,
  locked boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, logical_key),
  UNIQUE (guild_id, resource_kind, discord_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_mappings_discord ON resource_mappings(guild_id, discord_id);

CREATE TABLE IF NOT EXISTS setup_sessions (
  session_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  state text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_version integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setup_sessions_guild ON setup_sessions(guild_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  job_id uuid PRIMARY KEY,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  actor_id text,
  type text NOT NULL,
  priority integer NOT NULL DEFAULT 50,
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','RETRYING','SUCCEEDED','FAILED','CANCELLED','EXPIRED','DEAD_LETTER')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  correlation_id uuid NOT NULL,
  idempotency_key text,
  current_step text,
  completed_units integer NOT NULL DEFAULT 0,
  total_units integer,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_safe text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, priority DESC, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_guild ON jobs(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_steps (
  job_step_id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  step_key text NOT NULL,
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, step_key)
);

CREATE TABLE IF NOT EXISTS guild_locks (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  lock_key text NOT NULL,
  owner_id text NOT NULL,
  correlation_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, lock_key)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL,
  response jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS event_inbox (
  event_id uuid PRIMARY KEY,
  guild_id text,
  event_type text NOT NULL,
  dedup_key text,
  schema_version integer NOT NULL,
  payload jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (guild_id, event_type, dedup_key)
);

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id uuid PRIMARY KEY,
  guild_id text,
  event_type text NOT NULL,
  schema_version integer NOT NULL,
  payload jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_event_outbox_unpublished ON event_outbox(created_at) WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  audit_id uuid PRIMARY KEY,
  guild_id text,
  actor_id text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  before_state jsonb,
  after_state jsonb,
  result text NOT NULL,
  error_code text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_guild_time ON audit_events(guild_id, created_at DESC);

COMMIT;
