BEGIN;

CREATE TABLE IF NOT EXISTS member_onboarding (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('NEW','WELCOMED','VERIFIED','PROFILED','ACTIVE','PAUSED')),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  welcomed_at timestamptz,
  verified_at timestamptz,
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS verification_attempts (
  attempt_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  method text NOT NULL,
  result text NOT NULL,
  safe_reason text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verify_attempts_user ON verification_attempts(guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS self_role_assignments (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role_key text NOT NULL,
  role_id text,
  source text NOT NULL,
  state text NOT NULL CHECK (state IN ('ACTIVE','REMOVED','EXPIRED','REVOKED')),
  correlation_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (guild_id, user_id, role_key)
);

CREATE TABLE IF NOT EXISTS panel_versions (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  panel_id text NOT NULL,
  content_version integer NOT NULL,
  content_hash text NOT NULL,
  config jsonb NOT NULL,
  asset_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, panel_id, content_version)
);

CREATE TABLE IF NOT EXISTS panel_interaction_events (
  interaction_event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  panel_id text NOT NULL,
  user_id text,
  action_key text NOT NULL,
  result text NOT NULL,
  duration_ms integer,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_panel_interactions_metrics ON panel_interaction_events(guild_id, panel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  approval_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  state text NOT NULL CHECK (state IN ('DRAFT','PENDING','APPROVED','REJECTED','EXPIRED','EXECUTED','CANCELLED')),
  requested_by text NOT NULL,
  required_approvals integer NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
  approved_by text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_pending ON approval_requests(guild_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('GUILD','ROLE')),
  scope_id text NOT NULL DEFAULT '',
  value text NOT NULL CHECK (value IN ('TRUE','FALSE','INHERIT')),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, flag_key, scope, scope_id)
);

CREATE TABLE IF NOT EXISTS maintenance_windows (
  maintenance_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED')),
  reason text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  automation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drift_snapshots (
  drift_snapshot_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  source text NOT NULL,
  desired_version integer,
  actual_hash text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  records jsonb NOT NULL DEFAULT '[]'::jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drift_snapshots_guild ON drift_snapshots(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS repair_runs (
  repair_run_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('PLANNED','WAITING_APPROVAL','RUNNING','VERIFYING','SUCCEEDED','FAILED','CANCELLED')),
  policy jsonb NOT NULL,
  plan jsonb NOT NULL,
  result jsonb,
  actor_id text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS localization_overrides (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  locale text NOT NULL,
  message_key text NOT NULL,
  value text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, locale, message_key)
);

CREATE TABLE IF NOT EXISTS asset_bindings (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  surface_type text NOT NULL,
  surface_key text NOT NULL,
  logical_asset_key text NOT NULL,
  variant text NOT NULL DEFAULT 'default',
  active_version integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, surface_type, surface_key, variant)
);

COMMIT;
