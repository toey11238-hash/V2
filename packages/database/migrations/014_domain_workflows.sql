BEGIN;

CREATE TABLE IF NOT EXISTS creator_content_items (
  content_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  content_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  external_url text,
  status text NOT NULL CHECK (status IN ('DRAFT','REVIEW','APPROVED','REJECTED','PUBLISHED','ARCHIVED')),
  reviewer_user_id text,
  review_reason text,
  published_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creator_content_review ON creator_content_items(guild_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS creator_collaborations (
  collaboration_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','MATCHED','IN_PROGRESS','COMPLETED','CANCELLED','ARCHIVED')),
  participant_ids text[] NOT NULL DEFAULT '{}',
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS education_resources (
  resource_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  submitter_user_id text NOT NULL,
  subject text NOT NULL,
  title text NOT NULL,
  url text,
  notes text,
  status text NOT NULL CHECK (status IN ('REVIEW','PUBLISHED','REJECTED','ARCHIVED')),
  reviewer_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_education_resources_review ON education_resources(guild_id,status,subject,created_at DESC);

CREATE TABLE IF NOT EXISTS mentor_requests (
  mentor_request_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  requester_user_id text NOT NULL,
  subject text NOT NULL,
  goal text NOT NULL,
  availability text,
  status text NOT NULL CHECK (status IN ('OPEN','CLAIMED','SCHEDULED','COMPLETED','CANCELLED')),
  mentor_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentor_requests_open ON mentor_requests(guild_id,status,created_at);

CREATE TABLE IF NOT EXISTS business_catalog_items (
  item_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  item_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  public_url text,
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id,item_key)
);

CREATE TABLE IF NOT EXISTS business_support_refs (
  support_ref_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  requester_user_id text NOT NULL,
  external_ref_hash text,
  external_ref_masked text,
  issue text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','CLAIMED','RESOLVED','CLOSED')),
  assigned_staff_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_support_open ON business_support_refs(guild_id,status,created_at);

COMMIT;
