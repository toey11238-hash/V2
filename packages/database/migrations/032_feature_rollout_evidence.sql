BEGIN;

ALTER TABLE feature_rollouts
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS feature_rollout_history (
  history_id uuid PRIMARY KEY,
  rollout_id uuid NOT NULL REFERENCES feature_rollouts(rollout_id) ON DELETE CASCADE,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  revision bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATE','UPDATE','ROLLBACK')),
  snapshot jsonb NOT NULL,
  changed_by text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rollout_id, revision)
);
CREATE INDEX IF NOT EXISTS feature_rollout_history_lookup_idx
  ON feature_rollout_history(guild_id, feature_key, created_at DESC);
ALTER TABLE feature_rollout_history ENABLE ROW LEVEL SECURITY;

-- Existing rollouts pre-date revision history. Seed an immutable revision-1 snapshot
-- without depending on pgcrypto/uuid-ossp so the migration stays portable.
INSERT INTO feature_rollout_history(history_id,rollout_id,guild_id,feature_key,revision,action,snapshot,changed_by,reason,created_at)
SELECT
  md5(rollout_id::text || ':initial-feature-rollout-history')::uuid,
  rollout_id,
  guild_id,
  feature_key,
  revision,
  'CREATE',
  jsonb_build_object(
    'rolloutId',rollout_id::text,
    'featureKey',feature_key,
    'scope',scope,
    'guildId',guild_id,
    'roleId',role_id,
    'environment',environment,
    'state',state,
    'rolloutPercent',rollout_percent,
    'config',config,
    'updatedBy',updated_by,
    'revision',revision
  ),
  updated_by,
  'migration-backfill',
  created_at
FROM feature_rollouts
ON CONFLICT (rollout_id,revision) DO NOTHING;

CREATE TABLE IF NOT EXISTS feature_rollout_observations (
  observation_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  rollout_id uuid REFERENCES feature_rollouts(rollout_id) ON DELETE SET NULL,
  rollout_revision bigint,
  identity_hash text NOT NULL,
  role_context_hash text,
  environment text NOT NULL,
  enabled boolean NOT NULL,
  reason text NOT NULL,
  bucket integer CHECK (bucket IS NULL OR bucket BETWEEN 0 AND 99),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feature_rollout_observations_guild_idx
  ON feature_rollout_observations(guild_id, feature_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS feature_rollout_observations_rollout_idx
  ON feature_rollout_observations(rollout_id, observed_at DESC);
ALTER TABLE feature_rollout_observations ENABLE ROW LEVEL SECURITY;

COMMIT;
