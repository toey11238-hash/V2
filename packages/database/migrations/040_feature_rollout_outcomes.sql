BEGIN;

CREATE TABLE IF NOT EXISTS feature_rollout_outcomes (
  outcome_id uuid PRIMARY KEY,
  observation_id uuid NOT NULL REFERENCES feature_rollout_observations(observation_id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  metric_key text NOT NULL,
  value double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (observation_id, metric_key),
  CHECK (char_length(metric_key) BETWEEN 2 AND 96),
  CHECK (value::text NOT IN ('NaN', 'Infinity', '-Infinity') AND abs(value) <= 1000000000000.0)
);

CREATE INDEX IF NOT EXISTS feature_rollout_outcomes_compare_idx
  ON feature_rollout_outcomes(guild_id, feature_key, metric_key, recorded_at DESC);
CREATE INDEX IF NOT EXISTS feature_rollout_outcomes_observation_idx
  ON feature_rollout_outcomes(observation_id, recorded_at DESC);
ALTER TABLE feature_rollout_outcomes ENABLE ROW LEVEL SECURITY;

COMMIT;
