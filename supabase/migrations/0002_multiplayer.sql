-- Nexplay multiplayer: room-based games (Tic-Tac-Toe etc.)
-- Apply by pasting into the Supabase SQL editor (Project → SQL).
--
-- Depends on: 0001_init.sql (profiles + auth)

-------------------------------------------------------------------------------
-- rooms: a single multiplayer match
-------------------------------------------------------------------------------
create table if not exists public.rooms (
  id text primary key,
  game_slug text not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete set null,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_recent_idx on public.rooms (created_at desc);
create index if not exists rooms_status_idx on public.rooms (status);

-- Touch updated_at on every change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;

-- Read: anyone with a room code can read it (lobbies are public)
drop policy if exists "rooms read all" on public.rooms;
create policy "rooms read all"
  on public.rooms for select
  using (true);

-- Insert: only authenticated users; the inserting user must be the host
drop policy if exists "rooms insert as host" on public.rooms;
create policy "rooms insert as host"
  on public.rooms for insert
  with check (auth.uid() = host_user_id);

-- Update: existing players can mutate the room state, AND any
-- authenticated user can claim the empty guest seat. The with-check
-- clause ensures the caller ends up a player after the update — so a
-- random user can only join, never grief.
drop policy if exists "rooms update by players" on public.rooms;
drop policy if exists "rooms update by players or join" on public.rooms;
create policy "rooms update by players or join"
  on public.rooms for update
  using (
    auth.uid() = host_user_id
    or auth.uid() = guest_user_id
    or guest_user_id is null
  )
  with check (
    auth.uid() = host_user_id
    or auth.uid() = guest_user_id
  );

-------------------------------------------------------------------------------
-- Realtime: stream rooms changes to subscribed clients
-------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;
end $$;
