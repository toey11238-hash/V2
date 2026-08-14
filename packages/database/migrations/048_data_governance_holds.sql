BEGIN;

CREATE TABLE IF NOT EXISTS data_governance_state (
  guild_id text PRIMARY KEY REFERENCES guilds(guild_id) ON DELETE CASCADE,
  retention_revision bigint NOT NULL DEFAULT 1 CHECK (retention_revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE data_governance_state ENABLE ROW LEVEL SECURITY;
INSERT INTO data_governance_state(guild_id)
SELECT guild_id FROM guilds
ON CONFLICT(guild_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS retention_legal_holds (
  hold_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  data_class text NOT NULL CHECK (data_class IN ('ALL','OPERATIONAL','AUDIT','ANALYTICS','USER_CONTENT')),
  state text NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','RELEASED')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  created_by text NOT NULL,
  released_by text,
  release_approval_id uuid UNIQUE REFERENCES approval_requests(approval_id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state='ACTIVE' AND released_by IS NULL AND released_at IS NULL)
    OR
    (state='RELEASED' AND released_by IS NOT NULL AND released_at IS NOT NULL AND release_approval_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_retention_legal_holds_active ON retention_legal_holds(guild_id,data_class,created_at DESC) WHERE state='ACTIVE';
ALTER TABLE retention_legal_holds ENABLE ROW LEVEL SECURITY;

ALTER TABLE retention_runs ADD COLUMN IF NOT EXISTS approval_id uuid REFERENCES approval_requests(approval_id) ON DELETE RESTRICT;
ALTER TABLE retention_runs ADD COLUMN IF NOT EXISTS plan_hash text;
ALTER TABLE retention_runs ADD COLUMN IF NOT EXISTS policy_hash text;
ALTER TABLE retention_runs ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE retention_runs ADD CONSTRAINT retention_runs_plan_hash_format CHECK (plan_hash IS NULL OR plan_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE retention_runs ADD CONSTRAINT retention_runs_policy_hash_format CHECK (policy_hash IS NULL OR policy_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE retention_runs ADD CONSTRAINT retention_runs_error_code_bound CHECK (error_code IS NULL OR char_length(error_code) <= 200);
CREATE INDEX IF NOT EXISTS idx_retention_runs_approval ON retention_runs(guild_id,approval_id,created_at DESC) WHERE approval_id IS NOT NULL;

COMMIT;
