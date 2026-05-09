-- Real play counts and user ratings.
--
-- game_plays is intentionally append-only and stripped of user_id —
-- we don't need to know who played, only how many times. That keeps
-- RLS simple (anyone can insert, anyone can read) and avoids leaking
-- a per-user play history.
--
-- game_ratings stores one rating per (user, game). Anyone can read
-- the average; only the rater can update their own rating.

-------------------------------------------------------------------------------
-- game_plays
-------------------------------------------------------------------------------
create table if not exists public.game_plays (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null,
  played_at timestamptz not null default now()
);

create index if not exists game_plays_slug_idx on public.game_plays (game_slug);
create index if not exists game_plays_played_at_idx
  on public.game_plays (played_at desc);

alter table public.game_plays enable row level security;

drop policy if exists "plays insert all" on public.game_plays;
create policy "plays insert all" on public.game_plays
  for insert with check (true);

drop policy if exists "plays read all" on public.game_plays;
create policy "plays read all" on public.game_plays
  for select using (true);

-------------------------------------------------------------------------------
-- game_ratings
-------------------------------------------------------------------------------
create table if not exists public.game_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_slug text not null,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create index if not exists game_ratings_slug_idx on public.game_ratings (game_slug);

drop trigger if exists game_ratings_set_updated_at on public.game_ratings;
create trigger game_ratings_set_updated_at
  before update on public.game_ratings
  for each row execute function public.set_updated_at();

alter table public.game_ratings enable row level security;

drop policy if exists "ratings read all" on public.game_ratings;
create policy "ratings read all" on public.game_ratings
  for select using (true);

drop policy if exists "ratings insert own" on public.game_ratings;
create policy "ratings insert own" on public.game_ratings
  for insert with check (auth.uid() = user_id);

drop policy if exists "ratings update own" on public.game_ratings;
create policy "ratings update own" on public.game_ratings
  for update using (auth.uid() = user_id);
