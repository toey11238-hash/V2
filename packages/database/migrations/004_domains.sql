BEGIN;

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  ticket_number bigint NOT NULL,
  opener_user_id text NOT NULL,
  ticket_type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status text NOT NULL CHECK (status IN ('OPEN','CLAIMED','WAITING_USER','WAITING_STAFF','RESOLVED','CLOSED','REOPENED','ARCHIVED')),
  assigned_staff_id text,
  channel_id text,
  subject text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (guild_id, ticket_number)
);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status, priority, created_at);

CREATE TABLE IF NOT EXISTS ticket_participants (
  ticket_id uuid NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS applications (
  application_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  applicant_user_id text NOT NULL,
  application_type text NOT NULL,
  status text NOT NULL DEFAULT 'SUBMITTED',
  answers jsonb NOT NULL,
  assigned_staff_id text,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suggestions (
  suggestion_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','UNDER_REVIEW','ACCEPTED','REJECTED','IMPLEMENTED','DUPLICATE','ARCHIVED')),
  content text NOT NULL,
  staff_reason text,
  upvoter_ids text[] NOT NULL DEFAULT '{}',
  downvoter_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  report_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  reporter_user_id text NOT NULL,
  subject_user_id text,
  report_type text NOT NULL,
  priority text NOT NULL DEFAULT 'NORMAL',
  status text NOT NULL DEFAULT 'OPEN',
  detail text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_staff_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_staff_view ON reports(guild_id, status, priority, created_at);

CREATE TABLE IF NOT EXISTS moderation_cases (
  case_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  target_user_id text NOT NULL,
  opened_by text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  action_id uuid PRIMARY KEY,
  case_id uuid REFERENCES moderation_cases(case_id) ON DELETE SET NULL,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  target_user_id text,
  action_type text NOT NULL,
  reason text,
  automated boolean NOT NULL DEFAULT false,
  confidence numeric,
  result text NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mod_actions_guild_target ON moderation_actions(guild_id, target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS security_alerts (
  alert_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN',
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_tier text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS automation_rules (
  rule_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  event_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, rule_key)
);

CREATE TABLE IF NOT EXISTS automation_executions (
  execution_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES automation_rules(rule_id) ON DELETE CASCADE,
  source_event_id uuid,
  status text NOT NULL,
  result jsonb,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  task_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  task_type text NOT NULL,
  state text NOT NULL CHECK (state IN ('SCHEDULED','CLAIMED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  run_at timestamptz NOT NULL,
  timezone text NOT NULL,
  dedup_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guild_id, task_type, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_tasks(state, run_at) WHERE state = 'SCHEDULED';

CREATE TABLE IF NOT EXISTS server_events (
  event_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  capacity integer,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  event_id uuid NOT NULL REFERENCES server_events(event_id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  topics jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours jsonb,
  locale text,
  timezone text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS temporary_roles (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role_id text NOT NULL,
  source text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id, role_id, expires_at)
);
CREATE INDEX IF NOT EXISTS idx_temp_roles_expiry ON temporary_roles(status, expires_at);

CREATE TABLE IF NOT EXISTS temporary_voice_rooms (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  owner_user_id text NOT NULL,
  source_channel_id text,
  state text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  empty_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS integrations (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  status text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  last_health_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, integration_key)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id uuid PRIMARY KEY,
  guild_id text REFERENCES guilds(guild_id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  external_delivery_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result text,
  UNIQUE (integration_key, external_delivery_id)
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  metric_key text NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  value numeric NOT NULL,
  sample_count bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, metric_date, metric_key, dimensions)
);

CREATE TABLE IF NOT EXISTS recommendations (
  recommendation_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  recommendation_key text NOT NULL,
  risk text NOT NULL,
  destructive boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  backup_id uuid PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('MANUAL','SCHEDULED','PRE_MIGRATION','PRE_RESTORE')),
  schema_version integer NOT NULL,
  content_hash text NOT NULL,
  storage_provider text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

COMMIT;
