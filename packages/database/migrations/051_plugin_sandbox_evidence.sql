BEGIN;

ALTER TABLE plugin_execution_runs
  ADD COLUMN IF NOT EXISTS isolation_profile text;

DO $$ BEGIN
  ALTER TABLE plugin_execution_runs
    ADD CONSTRAINT plugin_execution_runs_isolation_profile_check
    CHECK (isolation_profile IS NULL OR isolation_profile IN ('TRUSTED_NODE_PERMISSION','LINUX_NS_SECCOMP_V1'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_plugin_execution_runs_isolation_created
  ON plugin_execution_runs(isolation_profile, created_at DESC)
  WHERE isolation_profile IS NOT NULL;

COMMIT;
