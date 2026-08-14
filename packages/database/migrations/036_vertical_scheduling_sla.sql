BEGIN;

ALTER TABLE creator_content_items
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_channel_key text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE INDEX IF NOT EXISTS creator_content_scheduled_idx ON creator_content_items(guild_id,scheduled_at) WHERE scheduled_at IS NOT NULL AND status='APPROVED';

ALTER TABLE mentor_requests
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE INDEX IF NOT EXISTS mentor_requests_scheduled_idx ON mentor_requests(guild_id,scheduled_at) WHERE status='SCHEDULED';

ALTER TABLE business_support_refs
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_alert_message_id text;
ALTER TABLE business_support_refs DROP CONSTRAINT IF EXISTS business_support_refs_priority_check;
ALTER TABLE business_support_refs ADD CONSTRAINT business_support_refs_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'));
CREATE INDEX IF NOT EXISTS business_support_sla_idx ON business_support_refs(guild_id,sla_due_at) WHERE status IN ('OPEN','CLAIMED');

COMMIT;
