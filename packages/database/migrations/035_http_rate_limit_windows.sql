BEGIN;

CREATE TABLE IF NOT EXISTS http_rate_limit_windows (
  guild_id text NOT NULL DEFAULT 'global',
  subject_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  window_ms integer NOT NULL CHECK (window_ms BETWEEN 1000 AND 3600000),
  route_class text NOT NULL DEFAULT 'mutation',
  request_limit integer NOT NULL DEFAULT 120 CHECK (request_limit BETWEEN 1 AND 100000),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, subject_hash, window_start, window_ms)
);
CREATE INDEX IF NOT EXISTS http_rate_limit_windows_cleanup_idx ON http_rate_limit_windows(last_seen_at);
CREATE INDEX IF NOT EXISTS http_rate_limit_windows_route_idx ON http_rate_limit_windows(guild_id,route_class,last_seen_at desc);
ALTER TABLE http_rate_limit_windows ENABLE ROW LEVEL SECURITY;

COMMIT;
