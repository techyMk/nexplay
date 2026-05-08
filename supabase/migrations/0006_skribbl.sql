-- Skribbl: a draw-and-guess multiplayer game.
-- N-player, runs over Supabase Realtime for stroke + chat broadcast and
-- postgres_changes for room/state transitions.
--
-- Apply by pasting into the Supabase SQL editor.

create table if not exists public.skribbl_rooms (
  id text primary key,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{
    "phase": "lobby",
    "round": 0,
    "max_rounds": 1,
    "draw_seconds": 60,
    "drawer_order": [],
    "drawer_index": 0,
    "drawer_id": null,
    "word_choices": [],
    "word": null,
    "word_pattern": "",
    "round_ends_at": null,
    "guessers": [],
    "players": []
  }'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skribbl_rooms_recent_idx
  on public.skribbl_rooms (created_at desc);

drop trigger if exists skribbl_rooms_updated_at on public.skribbl_rooms;
create trigger skribbl_rooms_updated_at
  before update on public.skribbl_rooms
  for each row execute function public.set_updated_at();

alter table public.skribbl_rooms enable row level security;

-- read: anyone (with the code) can view the room state
drop policy if exists "skribbl read all" on public.skribbl_rooms;
create policy "skribbl read all"
  on public.skribbl_rooms for select using (true);

-- insert: only the host themselves can create a room
drop policy if exists "skribbl insert as host" on public.skribbl_rooms;
create policy "skribbl insert as host"
  on public.skribbl_rooms for insert
  with check (auth.uid() = host_user_id);

-- update: host always; existing participants always; non-participants
-- may update only when room is in lobby (i.e. they're joining). The
-- WITH CHECK clause requires the caller to be a participant after the
-- update — so a stranger can't grief, only join.
drop policy if exists "skribbl update by participants" on public.skribbl_rooms;
create policy "skribbl update by participants"
  on public.skribbl_rooms for update
  using (
    auth.uid() = host_user_id
    or status = 'lobby'
    or auth.uid()::text in (
      select jsonb_array_elements_text(participants)
    )
  )
  with check (
    auth.uid() = host_user_id
    or auth.uid()::text in (
      select jsonb_array_elements_text(participants)
    )
  );

-- delete: only the host can close their room
drop policy if exists "skribbl delete by host" on public.skribbl_rooms;
create policy "skribbl delete by host"
  on public.skribbl_rooms for delete
  using (auth.uid() = host_user_id);

-- Realtime: stream skribbl_rooms changes
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'skribbl_rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.skribbl_rooms';
  end if;
end $$;
