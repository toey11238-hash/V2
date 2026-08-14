BEGIN;

create table if not exists giveaways (
  giveaway_id uuid primary key,
  guild_id text not null references guilds(guild_id) on delete cascade,
  channel_id text not null,
  message_id text,
  title text not null,
  prize_description text not null,
  winner_count integer not null check (winner_count between 1 and 20),
  free_entry boolean not null default true check (free_entry = true),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED','DRAWN','CANCELLED')),
  closes_at timestamptz not null,
  created_by text not null,
  last_draw_no integer not null default 0,
  last_draw_seed text,
  entrant_snapshot_hash text,
  winner_user_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists giveaways_guild_idx on giveaways(guild_id,status,closes_at);
alter table giveaways enable row level security;

create table if not exists giveaway_entries (
  giveaway_id uuid not null references giveaways(giveaway_id) on delete cascade,
  guild_id text not null references guilds(guild_id) on delete cascade,
  user_id text not null,
  entered_at timestamptz not null default now(),
  primary key(giveaway_id,user_id)
);
create index if not exists giveaway_entries_guild_idx on giveaway_entries(guild_id,giveaway_id,user_id);
alter table giveaway_entries enable row level security;

create table if not exists giveaway_draws (
  draw_id uuid primary key,
  giveaway_id uuid not null references giveaways(giveaway_id) on delete cascade,
  guild_id text not null references guilds(guild_id) on delete cascade,
  draw_no integer not null,
  seed text not null,
  entrant_snapshot_hash text not null,
  winner_user_ids text[] not null,
  reason text,
  drawn_by text not null,
  created_at timestamptz not null default now(),
  unique(giveaway_id,draw_no)
);
create index if not exists giveaway_draws_guild_idx on giveaway_draws(guild_id,giveaway_id,draw_no desc);
alter table giveaway_draws enable row level security;

COMMIT;
