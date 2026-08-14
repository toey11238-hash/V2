BEGIN;

CREATE TABLE IF NOT EXISTS backup_schedule_state (
  guild_id text PRIMARY KEY REFERENCES guilds(guild_id) ON DELETE CASCADE,
  cadence text NOT NULL CHECK (cadence IN ('OFF','DAILY','WEEKLY')),
  local_hour integer NOT NULL DEFAULT 4 CHECK (local_hour BETWEEN 0 AND 23),
  backup_weekday integer NOT NULL DEFAULT 0 CHECK (backup_weekday BETWEEN 0 AND 6),
  timezone text NOT NULL,
  keep_scheduled integer NOT NULL DEFAULT 7 CHECK (keep_scheduled BETWEEN 1 AND 100),
  last_backup_id uuid REFERENCES backup_snapshots(backup_id) ON DELETE SET NULL,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_result text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE backup_schedule_state ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_backup_schedule_next ON backup_schedule_state(next_run_at) WHERE cadence <> 'OFF';

COMMIT;
