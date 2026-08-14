BEGIN;

ALTER TABLE gaming_sessions
  ADD COLUMN IF NOT EXISTS waitlist_capacity integer NOT NULL DEFAULT 25 CHECK (waitlist_capacity BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS check_in_opens_minutes integer NOT NULL DEFAULT 30 CHECK (check_in_opens_minutes BETWEEN 0 AND 240),
  ADD COLUMN IF NOT EXISTS check_in_closes_minutes integer NOT NULL DEFAULT 15 CHECK (check_in_closes_minutes BETWEEN 0 AND 240);

ALTER TABLE gaming_session_participants DROP CONSTRAINT IF EXISTS gaming_session_participants_status_check;
ALTER TABLE gaming_session_participants
  ADD CONSTRAINT gaming_session_participants_status_check CHECK (status IN ('JOINED','WAITLISTED','LEFT','REMOVED')),
  ADD COLUMN IF NOT EXISTS waitlist_position integer CHECK (waitlist_position IS NULL OR waitlist_position BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS check_in_state text NOT NULL DEFAULT 'PENDING' CHECK (check_in_state IN ('PENDING','CHECKED_IN','NO_SHOW','EXCUSED')),
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS gaming_session_waitlist_position_uq
  ON gaming_session_participants(session_id, waitlist_position)
  WHERE status='WAITLISTED' AND waitlist_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS gaming_session_waitlist_idx
  ON gaming_session_participants(guild_id, session_id, waitlist_position, joined_at)
  WHERE status='WAITLISTED';
CREATE INDEX IF NOT EXISTS gaming_session_checkin_idx
  ON gaming_session_participants(guild_id, session_id, check_in_state)
  WHERE status='JOINED';

COMMIT;
