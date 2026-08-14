begin;

create table if not exists admission_control_policies (
  guild_id text primary key,
  preset text not null default 'BALANCED' check (preset in ('BALANCED','CONSERVATIVE','MAX_AVAILABILITY')),
  mode text not null default 'ENFORCE' check (mode in ('OBSERVE','ENFORCE')),
  fail_closed_when_unknown boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists admission_decisions (
  decision_id uuid primary key,
  guild_id text not null,
  operation_class text not null check (operation_class in ('SAFETY','SUPPORT','DIAGNOSTIC','INTERACTIVE','STRUCTURAL','BACKGROUND','PROVIDER','BULK')),
  pressure text not null check (pressure in ('NORMAL','WATCH','THROTTLE','EMERGENCY','UNKNOWN')),
  decision text not null check (decision in ('ALLOW','DEFER','REJECT')),
  would_decision text not null check (would_decision in ('ALLOW','DEFER','REJECT')),
  enforced boolean not null,
  reason text not null check (char_length(reason) between 1 and 500),
  retry_after_seconds integer check (retry_after_seconds is null or retry_after_seconds between 1 and 86400),
  actor_id text,
  correlation_id text not null,
  detail text check (detail is null or char_length(detail)<=300),
  created_at timestamptz not null default now()
);
create index if not exists admission_decisions_guild_created_idx on admission_decisions(guild_id,created_at desc);
create index if not exists admission_decisions_guild_operation_created_idx on admission_decisions(guild_id,operation_class,created_at desc);

alter table admission_control_policies enable row level security;
alter table admission_decisions enable row level security;

insert into admission_control_policies(guild_id,preset,mode,fail_closed_when_unknown,updated_by)
select guild_id,'BALANCED','ENFORCE',true,'migration-047'
from guild_configs
on conflict(guild_id) do nothing;

commit;
