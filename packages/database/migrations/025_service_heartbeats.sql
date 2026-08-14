BEGIN;

create table if not exists service_heartbeats (
  component_key text not null,
  instance_id text not null,
  process_role text not null,
  state text not null check (state in ('HEALTHY','DEGRADED','OFFLINE','UNKNOWN')),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(component_key,instance_id)
);
create index if not exists service_heartbeats_seen_idx on service_heartbeats(component_key,last_seen_at desc);
alter table service_heartbeats enable row level security;

COMMIT;
