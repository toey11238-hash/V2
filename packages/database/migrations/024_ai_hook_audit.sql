BEGIN;

create table if not exists ai_hook_runs (
  run_id uuid primary key,
  guild_id text not null references guilds(guild_id) on delete cascade,
  capability text not null,
  provider_key text not null,
  state text not null check (state in ('RUNNING','SUCCEEDED','REJECTED','FAILED','TIMED_OUT')),
  input_hash text not null,
  input_classes text[] not null default '{}',
  output_hash text,
  duration_ms integer,
  error_code text,
  actor_id text,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_hook_runs_guild_idx on ai_hook_runs(guild_id,created_at desc);
create index if not exists ai_hook_runs_state_idx on ai_hook_runs(state,created_at desc);
alter table ai_hook_runs enable row level security;

COMMIT;
