BEGIN;
CREATE TABLE IF NOT EXISTS generated_document_snapshots (
  document_id uuid PRIMARY KEY,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  document_type text NOT NULL,
  content_hash text NOT NULL,
  content text NOT NULL,
  generated_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generated_docs_guild_type ON generated_document_snapshots(guild_id,document_type,created_at DESC);
CREATE TABLE IF NOT EXISTS growth_assessments (
  assessment_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('SMALL','STANDARD','LARGE','ENTERPRISE')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  signals jsonb NOT NULL,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_assessments_guild ON growth_assessments(guild_id,created_at DESC);
COMMIT;
