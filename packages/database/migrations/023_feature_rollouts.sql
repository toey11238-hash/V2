BEGIN;

create table if not exists feature_rollouts (
  rollout_id uuid primary key,
  feature_key text not null,
  scope text not null check (scope in ('GLOBAL','GUILD','ROLE','ENVIRONMENT')),
  guild_id text references guilds(guild_id) on delete cascade,
  role_id text,
  environment text,
  state text not null check (state in ('OFF','ON','CANARY')),
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  config jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists feature_rollouts_scope_unique on feature_rollouts(feature_key,scope,coalesce(guild_id,''),coalesce(role_id,''),coalesce(environment,''));
create index if not exists feature_rollouts_guild_idx on feature_rollouts(guild_id,feature_key,state);
alter table feature_rollouts enable row level security;

COMMIT;
