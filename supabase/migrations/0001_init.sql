-- Nexplay initial schema: profiles, scores
-- Apply by pasting into the Supabase SQL editor (Project → SQL).

create extension if not exists "pgcrypto";

-------------------------------------------------------------------------------
-- profiles: one row per auth.users, holds display info
-------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_emoji text default '🎮',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone can read profiles (needed for leaderboards to show display names)
drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all"
  on public.profiles for select
  using (true);

-- Users can insert their own profile
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  using (auth.uid() = id);

-- When a new auth user is created, auto-create a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name',
                           split_part(new.email, '@', 1),
                           'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- scores: per-game best scores
-------------------------------------------------------------------------------
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_slug text not null,
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists scores_game_score_idx
  on public.scores (game_slug, score desc, created_at asc);
create index if not exists scores_user_idx on public.scores (user_id);

alter table public.scores enable row level security;

-- Anyone can read scores (leaderboards are public)
drop policy if exists "scores read all" on public.scores;
create policy "scores read all" on public.scores for select using (true);

-- Authenticated users can insert their own scores
drop policy if exists "scores insert own" on public.scores;
create policy "scores insert own"
  on public.scores for insert
  with check (auth.uid() = user_id);

-- View: top scores per game (one row per user, the user's best)
create or replace view public.top_scores as
  select distinct on (game_slug, user_id)
    s.id,
    s.user_id,
    s.game_slug,
    s.score,
    s.created_at,
    p.display_name,
    p.avatar_emoji
  from public.scores s
  left join public.profiles p on p.id = s.user_id
  order by game_slug, user_id, score desc, created_at asc;
