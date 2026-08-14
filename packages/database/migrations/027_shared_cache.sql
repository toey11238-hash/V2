BEGIN;
CREATE TABLE IF NOT EXISTS platform_cache_entries (
  scope_key text NOT NULL,
  cache_key text NOT NULL,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, cache_key)
);
CREATE INDEX IF NOT EXISTS idx_platform_cache_expiry ON platform_cache_entries(expires_at);
COMMIT;
