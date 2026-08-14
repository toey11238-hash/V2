BEGIN;

ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_scheduled_task_lease ON scheduled_tasks(lease_expires_at) WHERE state IN ('CLAIMED','RUNNING');

COMMIT;
