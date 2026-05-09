-- Social: unique display names, friendships, game invites.
--
-- Friend requests are stored as a single row per pair, with the lower
-- user id assigned to user_a and the higher to user_b. That keeps
-- "are these two friends?" a primary-key lookup. The initiated_by
-- column records who hit the request button so the OTHER party knows
-- they are the one who can accept it.

-------------------------------------------------------------------------------
-- 1. Display name uniqueness (case-insensitive)
-------------------------------------------------------------------------------
create unique index if not exists profiles_display_name_uniq
  on public.profiles (lower(display_name))
  where display_name is not null;

-- Smarter signup trigger: append a numeric suffix until the chosen
-- display_name is unique, so two Google users named "Alex" don't
-- collide and break signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  suffix int := 0;
begin
  base_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Player'
  );
  candidate := base_name;
  while exists (
    select 1 from public.profiles where lower(display_name) = lower(candidate)
  ) loop
    suffix := suffix + 1;
    candidate := base_name || suffix::text;
  end loop;
  insert into public.profiles (id, display_name)
  values (new.id, candidate)
  on conflict (id) do nothing;
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- 2. Friendships
-------------------------------------------------------------------------------
create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  initiated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index if not exists friendships_user_a_idx on public.friendships(user_a);
create index if not exists friendships_user_b_idx on public.friendships(user_b);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

alter table public.friendships enable row level security;

drop policy if exists "friendships read by parties" on public.friendships;
create policy "friendships read by parties" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friendships insert by initiator" on public.friendships;
create policy "friendships insert by initiator" on public.friendships
  for insert with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() = initiated_by
  );

drop policy if exists "friendships update by parties" on public.friendships;
create policy "friendships update by parties" on public.friendships
  for update using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "friendships delete by parties" on public.friendships;
create policy "friendships delete by parties" on public.friendships
  for delete using (auth.uid() = user_a or auth.uid() = user_b);

-------------------------------------------------------------------------------
-- 3. Game invites
-------------------------------------------------------------------------------
create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  game_slug text not null,
  room_id text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists game_invites_to_user_idx on public.game_invites(to_user);
create index if not exists game_invites_from_user_idx on public.game_invites(from_user);
create index if not exists game_invites_status_idx on public.game_invites(status);

drop trigger if exists game_invites_set_updated_at on public.game_invites;
create trigger game_invites_set_updated_at
  before update on public.game_invites
  for each row execute function public.set_updated_at();

alter table public.game_invites enable row level security;

drop policy if exists "invites read by parties" on public.game_invites;
create policy "invites read by parties" on public.game_invites
  for select using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "invites insert as sender" on public.game_invites;
create policy "invites insert as sender" on public.game_invites
  for insert with check (auth.uid() = from_user);

drop policy if exists "invites update by parties" on public.game_invites;
create policy "invites update by parties" on public.game_invites
  for update using (auth.uid() = from_user or auth.uid() = to_user);

-------------------------------------------------------------------------------
-- 4. Realtime publications
-------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'friendships'
  ) then
    execute 'alter publication supabase_realtime add table public.friendships';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'game_invites'
  ) then
    execute 'alter publication supabase_realtime add table public.game_invites';
  end if;
end $$;
