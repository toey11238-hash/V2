BEGIN;

create table if not exists custom_blueprints (
  guild_id text not null references guilds(guild_id) on delete cascade,
  blueprint_key text not null,
  version integer not null default 1 check (version > 0),
  display_name text not null,
  description text not null default '',
  complexity text not null check (complexity in ('compact','standard','advanced','enterprise')),
  payload jsonb not null,
  checksum text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, blueprint_key),
  unique (guild_id, checksum)
);
create index if not exists custom_blueprints_status_idx on custom_blueprints(guild_id,status,updated_at desc);
alter table custom_blueprints enable row level security;

create table if not exists change_runs (
  change_run_id uuid primary key,
  guild_id text not null references guilds(guild_id) on delete cascade,
  mode text not null check (mode in ('TEMPLATE_MIGRATION','SAFE_REBUILD','PARTIAL_REBUILD')),
  state text not null default 'PREVIEWED' check (state in ('PREVIEWED','WAITING_APPROVAL','APPROVED','QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','EXPIRED')),
  from_template text,
  to_template text not null,
  setup_draft jsonb not null,
  plan jsonb not null,
  plan_hash text not null,
  risk text not null check (risk in ('LOW','MEDIUM','HIGH','CRITICAL')),
  requested_by text not null,
  approval_id uuid,
  job_id uuid,
  correlation_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists change_runs_guild_idx on change_runs(guild_id,created_at desc);
create index if not exists change_runs_state_idx on change_runs(state,updated_at);
alter table change_runs enable row level security;

COMMIT;
