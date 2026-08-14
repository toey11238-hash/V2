BEGIN;

ALTER TABLE quest_progress ADD COLUMN IF NOT EXISTS period_key text NOT NULL DEFAULT 'lifetime';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'quest_progress'::regclass AND contype = 'p' AND conname = 'quest_progress_pkey'
  ) THEN
    ALTER TABLE quest_progress DROP CONSTRAINT quest_progress_pkey;
  END IF;
END $$;
ALTER TABLE quest_progress ADD CONSTRAINT quest_progress_pkey PRIMARY KEY (quest_id, user_id, period_key);
CREATE INDEX IF NOT EXISTS idx_quest_progress_user ON quest_progress(guild_id,user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS progression_event_receipts (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  dedup_key text NOT NULL,
  event_type text NOT NULL,
  game_key text NOT NULL DEFAULT '__global__',
  source_id text,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,user_id,dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_progression_receipts_event ON progression_event_receipts(guild_id,event_type,processed_at DESC);

CREATE TABLE IF NOT EXISTS progression_metrics (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  game_key text NOT NULL DEFAULT '__global__',
  metric_key text NOT NULL,
  metric_value bigint NOT NULL DEFAULT 0 CHECK (metric_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,user_id,game_key,metric_key)
);
CREATE INDEX IF NOT EXISTS idx_progression_metrics_leaderboard ON progression_metrics(guild_id,game_key,metric_key,metric_value DESC);

COMMIT;
