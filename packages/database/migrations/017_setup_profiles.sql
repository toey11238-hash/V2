BEGIN;
ALTER TABLE guild_configs ADD COLUMN IF NOT EXISTS setup_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE guild_configs ADD COLUMN IF NOT EXISTS gaming_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE guild_configs ADD COLUMN IF NOT EXISTS approval_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
