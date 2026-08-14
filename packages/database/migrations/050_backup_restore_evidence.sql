BEGIN;

ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS hash_algorithm text;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS integrity_checked_at timestamptz;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS restore_verified_at timestamptz;
ALTER TABLE backup_snapshots ADD COLUMN IF NOT EXISTS last_restore_run_id uuid REFERENCES restore_runs(restore_run_id) ON DELETE SET NULL;

-- Legacy rows were historically labelled VERIFIED after checksum creation only.
-- Preserve that history in metadata, but do not treat it as restore verification.
UPDATE backup_snapshots
SET metadata = coalesce(metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'legacyBackupStatus', status,
      'legacyChecksumMarkedAt', verified_at
    )),
    status = 'LEGACY_UNPROVEN',
    hash_algorithm = coalesce(hash_algorithm,'sha256-json-stringify-v0'),
    verified_at = NULL,
    integrity_checked_at = NULL,
    restore_verified_at = NULL,
    last_restore_run_id = NULL
WHERE status NOT IN ('CAPTURED','INTEGRITY_CHECKED','RESTORE_VERIFIED','INVALID','LEGACY_UNPROVEN');

UPDATE backup_snapshots
SET hash_algorithm = coalesce(hash_algorithm,'sha256-json-stringify-v0')
WHERE hash_algorithm IS NULL;

ALTER TABLE backup_snapshots ALTER COLUMN hash_algorithm SET NOT NULL;
ALTER TABLE backup_snapshots DROP CONSTRAINT IF EXISTS backup_snapshots_status_lifecycle;
ALTER TABLE backup_snapshots ADD CONSTRAINT backup_snapshots_status_lifecycle
  CHECK (status IN ('CAPTURED','INTEGRITY_CHECKED','RESTORE_VERIFIED','INVALID','LEGACY_UNPROVEN'));
ALTER TABLE backup_snapshots DROP CONSTRAINT IF EXISTS backup_snapshots_hash_algorithm_supported;
ALTER TABLE backup_snapshots ADD CONSTRAINT backup_snapshots_hash_algorithm_supported
  CHECK (hash_algorithm IN ('sha256-canonical-json-v1','sha256-json-stringify-v0'));
ALTER TABLE backup_snapshots DROP CONSTRAINT IF EXISTS backup_snapshots_content_hash_format;
ALTER TABLE backup_snapshots ADD CONSTRAINT backup_snapshots_content_hash_format CHECK (content_hash ~ '^[0-9a-f]{64}$');
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_verification_state ON backup_snapshots(guild_id,status,created_at DESC);

ALTER TABLE backup_payloads ADD COLUMN IF NOT EXISTS hash_algorithm text;
UPDATE backup_payloads p
SET hash_algorithm = s.hash_algorithm
FROM backup_snapshots s
WHERE s.backup_id=p.backup_id AND p.hash_algorithm IS NULL;
ALTER TABLE backup_payloads ALTER COLUMN hash_algorithm SET NOT NULL;
ALTER TABLE backup_payloads DROP CONSTRAINT IF EXISTS backup_payloads_hash_algorithm_supported;
ALTER TABLE backup_payloads ADD CONSTRAINT backup_payloads_hash_algorithm_supported
  CHECK (hash_algorithm IN ('sha256-canonical-json-v1','sha256-json-stringify-v0'));
ALTER TABLE backup_payloads DROP CONSTRAINT IF EXISTS backup_payloads_hash_format;
ALTER TABLE backup_payloads ADD CONSTRAINT backup_payloads_hash_format CHECK (payload_hash ~ '^[0-9a-f]{64}$');

CREATE TABLE IF NOT EXISTS backup_verification_evidence (
  evidence_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  backup_id uuid NOT NULL REFERENCES backup_snapshots(backup_id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN ('INTEGRITY_CHECK','RESTORE_VERIFY')),
  outcome text NOT NULL CHECK (outcome IN ('PASS','FAIL')),
  restore_run_id uuid REFERENCES restore_runs(restore_run_id) ON DELETE SET NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  hash_algorithm text NOT NULL CHECK (hash_algorithm IN ('sha256-canonical-json-v1','sha256-json-stringify-v0')),
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((evidence_type='RESTORE_VERIFY' AND restore_run_id IS NOT NULL) OR evidence_type='INTEGRITY_CHECK')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_backup_verification_restore_once
  ON backup_verification_evidence(backup_id,restore_run_id,evidence_type)
  WHERE restore_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backup_verification_guild_recent
  ON backup_verification_evidence(guild_id,created_at DESC);
ALTER TABLE backup_verification_evidence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION autoserver_reject_backup_verification_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- FK-driven guild/backup teardown may cascade; ordinary evidence mutation is rejected.
  IF TG_OP='DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'BACKUP_VERIFICATION_EVIDENCE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS trg_backup_verification_evidence_append_only ON backup_verification_evidence;
CREATE TRIGGER trg_backup_verification_evidence_append_only
BEFORE UPDATE OR DELETE ON backup_verification_evidence
FOR EACH ROW EXECUTE FUNCTION autoserver_reject_backup_verification_mutation();

COMMIT;
